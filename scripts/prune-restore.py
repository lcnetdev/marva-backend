#!/usr/bin/env python3
# /// script
# requires-python = ">=3.9"
# dependencies = []
# ///
"""
Restore a marva-backend mongodump backup (e.g. 080000.bfe2.tar.gz) into the
`mongo` docker container, dropping production records older than a cutoff.

The backup is a tar.gz of a `mongodump` output directory:

    data/db/bkup/bfe2/<collection>.bson
    data/db/bkup/bfe2/<collection>.metadata.json
    data/db/bkup/bfe2/prelude.json

What this script does, in one pass over the archive:

  1. Streams the tar.gz (never fully extracted on the host).
  2. For resourcesProduction.bson, reads BSON documents one at a time and
     keeps only those whose record time is on/after the cutoff
     (default: 6 calendar months ago). Every other file is passed through.
  3. Pipes every file straight into the mongo container (docker exec -i ... cat)
     under /data/db/<stage-dir>, so nothing is written on the host and no
     host-side permissions / SELinux labels matter.
  4. Runs `mongorestore --drop` inside the container, which drops each
     collection in the dump and replaces it with the (pruned) dump contents.
  5. Prints collection counts and removes the staging directory.

Record time, in order of preference:
    index.timestamp (unix seconds, the current util-service format)
    modified / created (legacy ldpjs format)
    the _id ObjectId generation time
Documents with no usable time are KEPT (and counted) rather than dropped.

Stdlib only; runs with the system python3 (>= 3.9) or `uv run`.

Examples:
    # see what would be dropped, touch nothing
    python3 scripts/prune-restore.py ~/Data/marva-records/080000.bfe2.tar.gz --dry-run

    # full prune + restore, no confirmation prompt
    python3 scripts/prune-restore.py ~/Data/marva-records/080000.bfe2.tar.gz --yes

    # production host where docker needs sudo, and stop util during the restore
    python3 scripts/prune-restore.py backup.tar.gz --docker "sudo docker" --pause-util --yes
"""
from __future__ import annotations

import argparse
import calendar
import datetime as dt
import json
import os
import posixpath
import shlex
import struct
import subprocess
import sys
import tarfile
import time
from typing import Optional, Tuple

# ---------------------------------------------------------------- BSON scanning
# Minimal top-level BSON element walker so we can pull a couple of small fields
# out of each document without decoding the (large) `data` string.

_INT32 = struct.Struct("<i")
_INT64 = struct.Struct("<q")
_DOUBLE = struct.Struct("<d")


def _i32(buf: bytes, pos: int) -> int:
    return _INT32.unpack_from(buf, pos)[0]


def _value_end(t: int, buf: bytes, pos: int) -> int:
    """Return the offset just past the value of type `t` starting at `pos`."""
    if t in (0x01, 0x09, 0x11, 0x12):      # double, datetime, timestamp, int64
        return pos + 8
    if t == 0x10:                          # int32
        return pos + 4
    if t == 0x13:                          # decimal128
        return pos + 16
    if t == 0x07:                          # ObjectId
        return pos + 12
    if t == 0x08:                          # bool
        return pos + 1
    if t in (0x0A, 0x06, 0xFF, 0x7F):      # null, undefined, minkey, maxkey
        return pos
    if t in (0x02, 0x0D, 0x0E):            # string, code, symbol
        return pos + 4 + _i32(buf, pos)
    if t in (0x03, 0x04):                  # document, array
        return pos + _i32(buf, pos)
    if t == 0x05:                          # binary
        return pos + 4 + 1 + _i32(buf, pos)
    if t == 0x0B:                          # regex: two cstrings
        pos = buf.index(0, pos) + 1
        return buf.index(0, pos) + 1
    if t == 0x0C:                          # dbpointer
        return pos + 4 + _i32(buf, pos) + 12
    if t == 0x0F:                          # code_w_scope
        return pos + _i32(buf, pos)
    raise ValueError("unknown BSON type 0x%02x" % t)


def _elements(buf: bytes, start: int = 0):
    """Yield (key, type, value_pos) for each element of the document at `start`."""
    end = start + _i32(buf, start)
    pos = start + 4
    while pos < end - 1:
        t = buf[pos]
        key_end = buf.index(0, pos + 1)
        key = buf[pos + 1:key_end]
        vpos = key_end + 1
        yield key, t, vpos
        pos = _value_end(t, buf, vpos)


def _as_epoch_seconds(t: int, buf: bytes, pos: int) -> Optional[float]:
    """Interpret a scalar element as a unix time in seconds, or None."""
    if t == 0x10:
        v = float(_i32(buf, pos))
    elif t == 0x12:
        v = float(_INT64.unpack_from(buf, pos)[0])
    elif t == 0x01:
        v = _DOUBLE.unpack_from(buf, pos)[0]
    elif t == 0x09:                        # UTC datetime, int64 milliseconds
        return _INT64.unpack_from(buf, pos)[0] / 1000.0
    elif t == 0x02:
        n = _i32(buf, pos)
        s = buf[pos + 4:pos + 4 + n - 1].decode("utf-8", "replace").strip()
        if not s:
            return None
        try:
            v = float(s)
        except ValueError:
            return _parse_iso(s)
    else:
        return None
    if v <= 0:
        return None
    if v > 1e11:                           # milliseconds, not seconds
        v /= 1000.0
    return v


def _parse_iso(s: str) -> Optional[float]:
    s = s.replace("Z", "+00:00")
    for fmt in ("%Y-%m-%dT%H:%M:%S.%f%z", "%Y-%m-%dT%H:%M:%S%z",
                "%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            d = dt.datetime.strptime(s, fmt)
        except ValueError:
            continue
        if d.tzinfo is None:
            d = d.replace(tzinfo=dt.timezone.utc)
        return d.timestamp()
    return None


def record_time(buf: bytes) -> Tuple[Optional[float], str]:
    """
    Return (unix_seconds, source) for a raw BSON document, where source is one
    of 'index.timestamp', 'modified', 'created', '_id' or 'none'.
    """
    oid_time = None
    modified = created = None
    for key, t, vpos in _elements(buf):
        if key == b"index" and t == 0x03:
            for k2, t2, v2 in _elements(buf, vpos):
                if k2 == b"timestamp":
                    ts = _as_epoch_seconds(t2, buf, v2)
                    if ts is not None:
                        return ts, "index.timestamp"
        elif key == b"modified":
            modified = _as_epoch_seconds(t, buf, vpos)
        elif key == b"created":
            created = _as_epoch_seconds(t, buf, vpos)
        elif key == b"_id" and t == 0x07:
            oid_time = float(struct.unpack_from(">I", buf, vpos)[0])
    if modified is not None:
        return modified, "modified"
    if created is not None:
        return created, "created"
    if oid_time is not None:
        return oid_time, "_id"
    return None, "none"


# ---------------------------------------------------------------- helpers

def log(msg: str) -> None:
    sys.stderr.write(time.strftime("[%H:%M:%S] ") + msg + "\n")
    sys.stderr.flush()


def human(n: float) -> str:
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if abs(n) < 1024 or unit == "TB":
            return "%.1f %s" % (n, unit)
        n /= 1024.0
    return "%.1f TB" % n


def months_ago(now: dt.datetime, months: int) -> dt.datetime:
    y, m = now.year, now.month - months
    while m <= 0:
        y -= 1
        m += 12
    day = min(now.day, calendar.monthrange(y, m)[1])
    return now.replace(year=y, month=m, day=day)


class Docker:
    def __init__(self, docker_cmd: str, container: str):
        self.base = shlex.split(docker_cmd)
        self.container = container

    def run(self, *args: str, check: bool = True, capture: bool = False,
            interactive: bool = False) -> subprocess.CompletedProcess:
        cmd = self.base + ["exec"] + (["-i"] if interactive else []) + [self.container] + list(args)
        return subprocess.run(cmd, check=check, text=capture,
                              stdout=subprocess.PIPE if capture else None)

    def writer(self, path: str) -> subprocess.Popen:
        """Return a process whose stdin is `path` inside the container."""
        cmd = self.base + ["exec", "-i", self.container, "sh", "-c",
                           "cat > %s" % shlex.quote(path)]
        return subprocess.Popen(cmd, stdin=subprocess.PIPE)

    def mongosh(self, db: str, js: str) -> str:
        return self.run("mongosh", "--quiet", db, "--eval", js, capture=True).stdout


class Sink:
    """Where files from the archive go: the container, or nowhere (dry run)."""

    def __init__(self, docker: Optional[Docker], stage_dir: str):
        self.docker = docker
        self.stage_dir = stage_dir
        self._made = set()

    def open(self, rel_path: str):
        if self.docker is None:
            return _NullWriter()
        path = posixpath.join(self.stage_dir, rel_path)
        d = posixpath.dirname(path)
        if d not in self._made:
            self.docker.run("mkdir", "-p", d)
            self._made.add(d)
        return _ProcWriter(self.docker.writer(path), path)


class _NullWriter:
    def write(self, b: bytes) -> None:
        pass

    def close(self) -> None:
        pass


class _ProcWriter:
    def __init__(self, proc: subprocess.Popen, path: str):
        self.proc = proc
        self.path = path

    def write(self, b: bytes) -> None:
        self.proc.stdin.write(b)

    def close(self) -> None:
        self.proc.stdin.close()
        rc = self.proc.wait()
        if rc != 0:
            raise RuntimeError("writing %s into the container failed (exit %d)" % (self.path, rc))


# ---------------------------------------------------------------- the work

CHUNK = 8 * 1024 * 1024


def copy_stream(src, dst, total: int, label: str) -> int:
    done = 0
    last = time.time()
    while True:
        b = src.read(CHUNK)
        if not b:
            break
        dst.write(b)
        done += len(b)
        if time.time() - last > 15:
            log("  %s: %s / %s" % (label, human(done), human(total)))
            last = time.time()
    return done


def filter_bson(src, dst, cutoff: float, total: int, label: str) -> dict:
    stats = {"read": 0, "kept": 0, "dropped": 0, "bytes_in": 0, "bytes_out": 0,
             "undated_kept": 0, "unparsed_kept": 0, "sources": {},
             "oldest_kept": None, "newest_kept": None, "newest_dropped": None}
    last = time.time()
    while True:
        head = src.read(4)
        if not head:
            break
        if len(head) < 4:
            raise ValueError("%s: truncated BSON stream" % label)
        n = _i32(head, 0)
        if n < 5:
            raise ValueError("%s: bad BSON document length %d" % (label, n))
        body = src.read(n - 4)
        if len(body) != n - 4:
            raise ValueError("%s: truncated BSON document" % label)
        doc = head + body
        stats["read"] += 1
        stats["bytes_in"] += n

        try:
            ts, source = record_time(doc)
        except Exception:
            ts, source = None, "unparsed"
        stats["sources"][source] = stats["sources"].get(source, 0) + 1

        keep = True
        if ts is None:
            if source == "unparsed":
                stats["unparsed_kept"] += 1
            else:
                stats["undated_kept"] += 1
        elif ts < cutoff:
            keep = False
            if stats["newest_dropped"] is None or ts > stats["newest_dropped"]:
                stats["newest_dropped"] = ts
        else:
            if stats["oldest_kept"] is None or ts < stats["oldest_kept"]:
                stats["oldest_kept"] = ts
            if stats["newest_kept"] is None or ts > stats["newest_kept"]:
                stats["newest_kept"] = ts

        if keep:
            dst.write(doc)
            stats["kept"] += 1
            stats["bytes_out"] += n
        else:
            stats["dropped"] += 1

        if time.time() - last > 15:
            log("  %s: %s / %s read, %d docs, kept %d, dropped %d" % (
                label, human(stats["bytes_in"]), human(total),
                stats["read"], stats["kept"], stats["dropped"]))
            last = time.time()
    return stats


def fmt_ts(ts: Optional[float]) -> str:
    if ts is None:
        return "-"
    return dt.datetime.fromtimestamp(ts, dt.timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ")


def process_archive(path: str, sink: Sink, db_name: Optional[str],
                    collection: str, cutoff: float) -> Tuple[str, dict, list]:
    """Stream the archive into the sink. Returns (db_name, prune_stats, files)."""
    prune_stats = None
    files = []
    seen_db = db_name
    # Leave bufsize at the tarfile default. In streaming gzip mode bufsize is the size of each
    # compressed piece fed to zlib, and the stdlib copies the whole decompressed piece on every
    # read. filter_bson reads one document at a time, so a large bufsize makes each document cost a
    # copy of (bufsize * compression ratio) bytes: with 8 MB that was ~1.5 MB/s on production.
    with tarfile.open(path, mode="r|gz") as tar:
        for member in tar:
            if not member.isfile():
                continue
            parent, name = posixpath.split(member.name)
            this_db = posixpath.basename(parent)
            if not this_db:
                continue
            if seen_db is None:
                seen_db = this_db
                log("database directory in archive: %s" % seen_db)
            if this_db != seen_db:
                if db_name is None:
                    raise SystemExit("archive holds more than one database directory "
                                     "(%s, %s); pass --db" % (seen_db, this_db))
                continue
            src = tar.extractfile(member)
            rel = posixpath.join(this_db, name)
            dst = sink.open(rel)
            try:
                if name == collection + ".bson":
                    log("pruning %s (%s)" % (rel, human(member.size)))
                    prune_stats = filter_bson(src, dst, cutoff, member.size, name)
                    files.append((rel, member.size, prune_stats["bytes_out"]))
                else:
                    log("copying %s (%s)" % (rel, human(member.size)))
                    n = copy_stream(src, dst, member.size, name)
                    files.append((rel, member.size, n))
            finally:
                dst.close()
    if seen_db is None:
        raise SystemExit("no files found in archive")
    if prune_stats is None:
        raise SystemExit("archive has no %s.bson under %s/" % (collection, seen_db))
    return seen_db, prune_stats, files


def print_report(stats: dict, cutoff: float, files: list) -> None:
    print()
    print("cutoff (records before this are dropped): %s" % fmt_ts(cutoff))
    print("documents read:    %d" % stats["read"])
    print("documents kept:    %d  (%s)" % (stats["kept"], human(stats["bytes_out"])))
    print("documents dropped: %d  (%s)" % (stats["dropped"], human(stats["bytes_in"] - stats["bytes_out"])))
    if stats["undated_kept"]:
        print("kept because no date could be found: %d" % stats["undated_kept"])
    if stats["unparsed_kept"]:
        print("kept because the document could not be parsed: %d" % stats["unparsed_kept"])
    print("date field used:   %s" % ", ".join("%s=%d" % kv for kv in sorted(stats["sources"].items())))
    print("oldest kept:       %s" % fmt_ts(stats["oldest_kept"]))
    print("newest kept:       %s" % fmt_ts(stats["newest_kept"]))
    print("newest dropped:    %s" % fmt_ts(stats["newest_dropped"]))
    print()
    print("files:")
    for rel, size_in, size_out in files:
        mark = "" if size_in == size_out else "  -> %s" % human(size_out)
        print("  %-45s %10s%s" % (rel, human(size_in), mark))
    print()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("backup", help="path to the backup tar.gz (a tarred mongodump directory)")
    cut = ap.add_mutually_exclusive_group()
    cut.add_argument("--months", type=int, default=6, help="drop records older than N calendar months (default 6)")
    cut.add_argument("--days", type=int, help="drop records older than N days")
    cut.add_argument("--before", help="drop records before this date, YYYY-MM-DD (UTC)")
    ap.add_argument("--collection", default="resourcesProduction", help="collection to prune (default resourcesProduction)")
    ap.add_argument("--db", help="database directory name inside the archive (auto-detected when there is one)")
    ap.add_argument("--container", default="mongo", help="mongo docker container name (default mongo)")
    ap.add_argument("--docker", default="docker", help='docker command, e.g. "sudo docker" (default docker)')
    ap.add_argument("--stage-dir", default="/data/db/restore-pruned",
                    help="directory inside the container to stage the pruned dump (default /data/db/restore-pruned)")
    ap.add_argument("--dry-run", action="store_true", help="only scan and report; write nothing, restore nothing")
    ap.add_argument("--no-restore", action="store_true", help="stage the pruned dump in the container but do not run mongorestore")
    ap.add_argument("--keep-stage", action="store_true", help="leave the staged dump in the container after restoring")
    ap.add_argument("--pause-util", action="store_true", help="docker stop the util container during the restore and start it after")
    ap.add_argument("--util-container", default="util", help="util container name for --pause-util (default util)")
    ap.add_argument("--yes", "-y", action="store_true", help="do not ask for confirmation before dropping/restoring")
    args = ap.parse_args()

    if not os.path.isfile(args.backup):
        ap.error("backup file not found: %s" % args.backup)

    now = dt.datetime.now(dt.timezone.utc)
    if args.before:
        cutoff_dt = dt.datetime.strptime(args.before, "%Y-%m-%d").replace(tzinfo=dt.timezone.utc)
    elif args.days is not None:
        cutoff_dt = now - dt.timedelta(days=args.days)
    else:
        cutoff_dt = months_ago(now, args.months)
    cutoff = cutoff_dt.timestamp()
    log("backup:  %s (%s)" % (args.backup, human(os.path.getsize(args.backup))))
    log("cutoff:  %s  (%s records before this are dropped)" % (fmt_ts(cutoff), args.collection))

    docker = None
    if not args.dry_run:
        docker = Docker(args.docker, args.container)
        try:
            tools = docker.run("sh", "-c", "command -v mongorestore && command -v mongosh", capture=True).stdout
        except (subprocess.CalledProcessError, FileNotFoundError) as e:
            log("cannot reach container %r with %r: %s" % (args.container, args.docker, e))
            return 2
        log("container %s ok: %s" % (args.container, " ".join(tools.split())))
        docker.run("rm", "-rf", args.stage_dir)
        docker.run("mkdir", "-p", args.stage_dir)

    sink = Sink(docker, args.stage_dir)
    t0 = time.time()
    db_name, stats, files = process_archive(args.backup, sink, args.db, args.collection, cutoff)
    log("archive processed in %.0fs" % (time.time() - t0))
    print_report(stats, cutoff, files)

    if args.dry_run:
        log("dry run: nothing written, nothing restored")
        return 0
    if args.no_restore:
        log("pruned dump staged in %s:%s (not restored)" % (args.container, args.stage_dir))
        return 0

    # ---- restore
    live = docker.mongosh(db_name, "print(JSON.stringify(Object.fromEntries(db.getCollectionNames().map(c=>[c, db[c].countDocuments()]))))")
    live_counts = json.loads(live.strip().splitlines()[-1]) if live.strip() else {}
    dump_colls = sorted(posixpath.basename(f[0])[:-5] for f in files if f[0].endswith(".bson"))
    print("live database %s on %s now has:" % (db_name, args.container))
    for c, n in sorted(live_counts.items()):
        note = "" if c in dump_colls else "   (not in dump: left untouched)"
        print("  %-28s %10d%s" % (c, n, note))
    print()
    print("mongorestore --drop will DROP and replace these collections in %s:" % db_name)
    print("  " + ", ".join(dump_colls))
    print()
    if not args.yes:
        try:
            answer = input("Proceed? [y/N] ").strip().lower()
        except EOFError:
            answer = ""
        if answer not in ("y", "yes"):
            log("aborted; staged dump left in %s:%s" % (args.container, args.stage_dir))
            return 1

    paused = False
    try:
        if args.pause_util:
            log("stopping %s" % args.util_container)
            subprocess.run(shlex.split(args.docker) + ["stop", args.util_container], check=True)
            paused = True

        log("running mongorestore --drop")
        t0 = time.time()
        docker.run("mongorestore", "--drop", "--numParallelCollections=4", "--dir=" + args.stage_dir)
        log("mongorestore finished in %.0fs" % (time.time() - t0))
    finally:
        if paused:
            log("starting %s" % args.util_container)
            subprocess.run(shlex.split(args.docker) + ["start", args.util_container])

    after = docker.mongosh(db_name, "print(JSON.stringify(Object.fromEntries(db.getCollectionNames().map(c=>[c, db[c].countDocuments()]))))")
    after_counts = json.loads(after.strip().splitlines()[-1])
    print()
    print("database %s after restore:" % db_name)
    for c, n in sorted(after_counts.items()):
        print("  %-28s %10d" % (c, n))
    ok = after_counts.get(args.collection) == stats["kept"]
    print()
    if ok:
        print("%s: %d documents restored, matches the %d kept from the backup." % (
            args.collection, after_counts.get(args.collection, 0), stats["kept"]))
    else:
        print("WARNING: %s has %s documents but %d were kept from the backup." % (
            args.collection, after_counts.get(args.collection), stats["kept"]))

    if args.keep_stage:
        log("staged dump kept in %s:%s" % (args.container, args.stage_dir))
    else:
        docker.run("rm", "-rf", args.stage_dir)
        log("removed staged dump %s" % args.stage_dir)
    return 0 if ok else 3


if __name__ == "__main__":
    sys.exit(main())
