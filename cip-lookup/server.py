"""HTTP front end for lookup.py. One thread per request, so requests run in parallel.

    GET  /lookup?barcode=00539481265
    GET  /lookup?isbn=9781668072851[&lccn=2025018671][&oclcNumber=…][&bibframe=false][&full=true]
    POST /enrich   JSON {"rdfxml": "<rdf:RDF…>", "isbn"?, "lccn"?, "oclcNumber"?, "printOnly"?, "bibframe"?, "full"?}
                   or the RDF/XML itself as the body, with the same options as query parameters
    GET  /health
"""
import json
import os
import sys
import time
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import lookup

PORT = int(os.environ.get("CIP_LOOKUP_PORT", "9402"))
MAX_BODY = int(os.environ.get("CIP_LOOKUP_MAX_BODY", str(16 * 1024 * 1024)))
# not found is a normal answer; anything else non-ok is a failure of something we depend on
HTTP_STATUS = {"ok": 200, "no_print_instance": 404, "no_oclc_record": 404, "no_identifiers": 422}
ID_PARAMS = ("isbn", "barcode", "lccn", "oclcNumber")


def flag(value, default):
    if value is None:
        return default
    return str(value).lower() in ("1", "true", "yes")


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def send_json(self, status, body):
        data = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def run(self, fn, *args):
        try:
            result = fn(*args)
            self.send_json(HTTP_STATUS.get(result["status"], 200), result)
        except ValueError as e:
            self.send_json(400, {"status": "bad_request", "messages": [str(e)]})
        except lookup.UpstreamError as e:
            self.send_json(502, {"status": "upstream_error", "messages": [str(e)]})
        except Exception:
            traceback.print_exc()
            self.send_json(500, {"status": "error", "messages": ["internal error"]})

    def do_GET(self):
        url = urlparse(self.path)
        params = {k: v[0] for k, v in parse_qs(url.query).items()}
        path = url.path.rstrip("/")
        if path == "/health":
            return self.send_json(200, {"status": "ok", "stylesheet": lookup.M2B_XSL,
                                        "stylesheetFound": os.path.isfile(lookup.M2B_XSL),
                                        "credentialsSet": bool(lookup.WC_CLIENTID and lookup.WC_SECRET)})
        if path != "/lookup":
            return self.send_json(404, {"status": "not_found", "messages": ["use GET /lookup, POST /enrich or GET /health"]})
        if not any(params.get(p) for p in ID_PARAMS):
            return self.send_json(400, {"status": "bad_request", "messages": ["give isbn, barcode, lccn or oclcNumber"]})
        self.run(lookup.lookup, params.get("isbn"), params.get("barcode"), params.get("lccn"),
                 flag(params.get("bibframe"), True), flag(params.get("full"), False), params.get("oclcNumber"))

    def do_POST(self):
        url = urlparse(self.path)
        if url.path.rstrip("/") != "/enrich":
            return self.send_json(404, {"status": "not_found", "messages": ["use GET /lookup, POST /enrich or GET /health"]})
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            return self.send_json(400 if length <= 0 else 413,
                                  {"status": "bad_request", "messages": [f"body must be 1..{MAX_BODY} bytes"]})
        body = self.rfile.read(length)
        params = {k: v[0] for k, v in parse_qs(url.query).items()}
        if "json" in self.headers.get("Content-Type", ""):
            try:
                params.update(json.loads(body))
            except ValueError:
                return self.send_json(400, {"status": "bad_request", "messages": ["body is not JSON"]})
            rdfxml = params.get("rdfxml")
        else:
            rdfxml = body
        if not rdfxml:
            return self.send_json(400, {"status": "bad_request", "messages": ["give the record as RDF/XML (body or JSON \"rdfxml\")"]})
        print_only = params.get("printOnly")
        self.run(lookup.enrich, rdfxml, params.get("isbn"), params.get("lccn"), params.get("oclcNumber"),
                 None if print_only is None else flag(print_only, True),
                 flag(params.get("bibframe"), True), flag(params.get("full"), True))

    def log_message(self, fmt, *args):
        sys.stderr.write(f"{time.strftime('%Y-%m-%dT%H:%M:%S')} {self.address_string()} {fmt % args}\n")


class Server(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 128


if __name__ == "__main__":
    print(f"cip-lookup listening on :{PORT}, stylesheet {lookup.M2B_XSL}", file=sys.stderr, flush=True)
    Server(("0.0.0.0", PORT), Handler).serve_forever()
