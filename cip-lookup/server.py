"""HTTP front end for lookup.py. One thread per request, so requests run in parallel.

    GET /lookup?barcode=00539481265
    GET /lookup?isbn=9781668072851[&lccn=2025018671][&bibframe=false][&full=true]
    GET /health
"""
import json
import os
import sys
import time
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import lookup

PORT = int(os.environ.get("CIP_LOOKUP_PORT", "8080"))
# not found is a normal answer; anything else non-ok is a failure of something we depend on
HTTP_STATUS = {"ok": 200, "no_print_instance": 404, "no_oclc_record": 404}


def flag(params, name, default):
    return params.get(name, [str(default)])[0].lower() in ("1", "true", "yes")


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def send_json(self, status, body):
        data = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        url = urlparse(self.path)
        params = parse_qs(url.query)
        path = url.path.rstrip("/")
        if path == "/health":
            return self.send_json(200, {"status": "ok", "stylesheet": lookup.M2B_XSL,
                                        "stylesheetFound": os.path.isfile(lookup.M2B_XSL),
                                        "credentialsSet": bool(lookup.WC_CLIENTID and lookup.WC_SECRET)})
        if path != "/lookup":
            return self.send_json(404, {"status": "not_found", "messages": ["use /lookup or /health"]})
        isbn, barcode = params.get("isbn", [None])[0], params.get("barcode", [None])[0]
        if not (isbn or barcode):
            return self.send_json(400, {"status": "bad_request", "messages": ["give isbn or barcode"]})
        try:
            result = lookup.lookup(isbn, barcode, params.get("lccn", [None])[0],
                                   flag(params, "bibframe", True), flag(params, "full", False))
            self.send_json(HTTP_STATUS.get(result["status"], 200), result)
        except lookup.UpstreamError as e:
            self.send_json(502, {"status": "upstream_error", "messages": [str(e)]})
        except Exception:
            traceback.print_exc()
            self.send_json(500, {"status": "error", "messages": ["internal error"]})

    def log_message(self, fmt, *args):
        sys.stderr.write(f"{time.strftime('%Y-%m-%dT%H:%M:%S')} {self.address_string()} {fmt % args}\n")


class Server(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 128


if __name__ == "__main__":
    print(f"cip-lookup listening on :{PORT}, stylesheet {lookup.M2B_XSL}", file=sys.stderr, flush=True)
    Server(("0.0.0.0", PORT), Handler).serve_forever()
