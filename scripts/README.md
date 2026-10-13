# prune-restore.py

Restores a marva-backend MongoDB backup (`NNNNNN.bfe2.tar.gz`, a tarred
`mongodump` directory) into the running `mongo` container while dropping
`resourcesProduction` records older than six months. Everything else in the
backup (other collections, index definitions) is restored unchanged.

The restore is a `mongorestore --drop`: each collection present in the dump is
dropped and replaced. Collections that exist in the live database but not in
the dump are left alone.

## Requirements

* `python3` 3.9 or newer (Amazon Linux 2023's stock `python3` is fine, as is `uv run`).
* `docker` access to the `mongo` container. Nothing else: the script needs no
  pymongo, no mongo tools on the host, and no disk space on the host. Files
  are piped into the container and `mongorestore` runs there.

Because nothing is written to host directories, SELinux labels on the
`database_files` bind mount and ownership of that directory (uid 999) do not
matter. The pruned dump is staged inside the container at
`/data/db/restore-pruned` (that is the `database_files` volume, so there is
room) and removed when the restore succeeds.

## Usage

```sh
# Report only: what would be dropped and kept. Touches nothing.
python3 scripts/prune-restore.py /path/to/080000.bfe2.tar.gz --dry-run

# Prune + restore. Prints the live collection counts and asks before dropping.
python3 scripts/prune-restore.py /path/to/080000.bfe2.tar.gz

# Production: docker via sudo, stop util while restoring, no prompt.
python3 scripts/prune-restore.py /path/to/080000.bfe2.tar.gz --docker "sudo docker" --pause-util --yes
```

Options:

| flag | meaning |
|---|---|
| `--months N` | cutoff N calendar months before now (default 6) |
| `--days N` / `--before YYYY-MM-DD` | alternative ways to set the cutoff |
| `--collection NAME` | collection to prune (default `resourcesProduction`) |
| `--container NAME` | mongo container (default `mongo`) |
| `--docker CMD` | how to invoke docker, e.g. `"sudo docker"` |
| `--stage-dir PATH` | staging dir inside the container (default `/data/db/restore-pruned`) |
| `--no-restore` | stage the pruned dump in the container and stop |
| `--keep-stage` | do not delete the staged dump after restoring |
| `--pause-util` | `docker stop util` before the restore, `docker start util` after |
| `--yes` | skip the confirmation prompt |

## How the record date is determined

In order of preference, per document:

1. `index.timestamp` (unix seconds; the current util-service format)
2. `modified`, then `created` (legacy ldpjs format)
3. the generation time of the `_id` ObjectId

A document with none of these is kept, and the report counts it.

## Exit codes

`0` success, `1` aborted at the prompt, `2` cannot reach the container,
`3` restored count does not match the number of kept documents.
