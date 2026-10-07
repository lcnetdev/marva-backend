"""Find the exact WorldCat record for a print manifestation from a scanned ISBN or
inventory barcode, and return the data useful for finishing a CIP record as MARC
fields, BIBFRAME RDF/XML and BIBFRAME JSON-LD.

    id.loc.gov (barcode/ISBN -> instance, LCCN) -> OCLC search + MARC -> marc2bibframe2

Used by server.py; also runnable directly:

    python lookup.py --barcode 00539481265
    python lookup.py 9781668072851 --full
"""
import argparse
import base64
import json
import os
import re
import subprocess
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor

import rdflib

# ---- configuration (environment) ------------------------------------------------------------
WC_CLIENTID = os.environ.get("WC_CLIENTID", "")
WC_SECRET = os.environ.get("WC_SECRET", "")
OCLC_TOKEN_URL = os.environ.get("CIP_LOOKUP_OCLC_TOKEN_URL", "https://oauth.oclc.org/token")
OCLC_SEARCH_URL = os.environ.get("CIP_LOOKUP_OCLC_SEARCH_URL", "https://americas.discovery.api.oclc.org/worldcat/search/v2/brief-bibs")
OCLC_MARC_URL = os.environ.get("CIP_LOOKUP_OCLC_MARC_URL", "https://metadata.api.oclc.org/worldcat/manage/bibs").rstrip("/")
OCLC_SCOPES = os.environ.get("CIP_LOOKUP_OCLC_SCOPES", "WorldCatMetadataAPI wcapi:view_bib wcapi:view_brief_bib")
IDLOC_URL = os.environ.get("CIP_LOOKUP_IDLOC_URL", "https://id.loc.gov").rstrip("/")
M2B_XSL = os.environ.get("CIP_LOOKUP_M2B_XSL", "/opt/marc2bibframe2/xsl/marc2bibframe2.xsl")
M2B_BASEURI = os.environ.get("CIP_LOOKUP_M2B_BASEURI", "http://example.org/")
HTTP_TIMEOUT = float(os.environ.get("CIP_LOOKUP_HTTP_TIMEOUT", "20"))
# xsltproc is the only CPU-heavy step; cap how many run at once
MAX_CONVERSIONS = int(os.environ.get("CIP_LOOKUP_MAX_CONVERSIONS", str(os.cpu_count() or 2)))

NS = {"m": "http://www.loc.gov/MARC21/slim"}
BF_NS = {
    "bf": "http://id.loc.gov/ontologies/bibframe/",
    "bflc": "http://id.loc.gov/ontologies/bflc/",
    "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
    "madsrdf": "http://www.loc.gov/mads/rdf/v1#",
}
RDF_RESOURCE = f"{{{BF_NS['rdf']}}}resource"
RDF_ABOUT = f"{{{BF_NS['rdf']}}}about"
JSONLD_CONTEXT = {**BF_NS, "xsd": "http://www.w3.org/2001/XMLSchema#"}
RDF_OPEN = "<rdf:RDF " + " ".join(f'xmlns:{p}="{u}"' for p, u in BF_NS.items()) + ">"
for _prefix, _uri in BF_NS.items():
    ET.register_namespace(_prefix, _uri)

# fields worth showing the cataloger
FIELDS = ("010", "020", "040", "042", "100", "110", "245", "246", "250", "264", "300", "490", "700", "710", "776")


class UpstreamError(Exception):
    """A service this depends on (OCLC, id.loc.gov, the converter) failed."""


def has(el, tag):
    return el.find(f".//{tag}", BF_NS) is not None


def typed(el, suffix):
    return any(t.get(RDF_RESOURCE, "").endswith(suffix) for t in el.iterfind(".//rdf:type", BF_NS))


# RDA CIP VER checklist row -> where marc2bibframe2 (ConvSpec v3.1) puts it:
# (row, resource, xpath from that resource, optional filter on the matched element)
CHECKLIST_BF = [
    ("Ldr/17 Encoding level", "Work", "bf:adminMetadata/bf:AdminMetadata/bflc:encodingLevel", None),
    ("Ldr/18 + 040 $e Description conventions", "Work", "bf:adminMetadata/bf:AdminMetadata/bf:descriptionConventions", None),
    ("040 $b Language of cataloging", "Work", "bf:adminMetadata/bf:AdminMetadata/bf:descriptionLanguage", None),
    ("042 Authentication code", "Work", "bf:adminMetadata/bf:AdminMetadata/bf:descriptionAuthentication", None),
    ("020 ISBN", "Instance", "bf:identifiedBy", lambda e: has(e, "bf:Isbn")),
    ("050 Class number", "Work", "bf:classification", lambda e: has(e, "bf:ClassificationLcc")),
    ("1XX Creator", "Work", "bf:contribution", lambda e: typed(e, "PrimaryContribution")),
    ("7XX Added access points", "Work", "bf:contribution", lambda e: not typed(e, "PrimaryContribution")),
    ("240 Preferred title", "Work", "bf:expressionOf", None),
    ("245 Title proper", "Instance", "bf:title", lambda e: has(e, "bf:Title")),
    ("245 $c Statement of responsibility", "Instance", "bf:responsibilityStatement", None),
    ("246 Variant title", "Work", "bf:title", lambda e: not has(e, "bf:Title")),
    ("246 Variant title (cover/spine)", "Instance", "bf:title", lambda e: not has(e, "bf:Title")),
    ("250 Edition statement", "Instance", "bf:editionStatement", None),
    ("263 Expected publication date (delete)", "Instance", "bflc:projectedProvisionDate", None),
    ("263 Expected publication date (delete)", "Instance", "bf:projectedProvisionDate", None),
    ("264 Publication information", "Instance", "bf:provisionActivity", None),
    ("264 Publication statement", "Instance", "bf:publicationStatement", None),
    ("264 _4 Copyright date", "Instance", "bf:copyrightDate", None),
    ("300 $a Extent + $b Other physical details", "Instance", "bf:extent", None),
    ("300 $c Dimensions", "Instance", "bf:dimensions", None),
    ("008/18-21 + 340 $p Illustrative content", "Work", "bf:illustrativeContent", None),
    ("336 Content type", "Work", "bf:content", None),
    ("337 Media type", "Instance", "bf:media", None),
    ("338 Carrier type", "Instance", "bf:carrier", None),
    ("490 Series statement", "Work", "bf:relation", lambda e: has(e, "bf:Series")),
    ("490 Series statement", "Instance", "bf:relation", lambda e: has(e, "bf:Series")),
    ("504 Bibliography note", "Instance", "bf:note", lambda e: typed(e, "mnotetype/biblio")),
    ("500 General note", "Instance", "bf:note", lambda e: not has(e, "rdf:type")),
    ("505 Contents note", "Work", "bf:tableOfContents", None),
    ("520 Summary", "Work", "bf:summary", None),
    ("7XX X2 / 775 / 776 Related works", "Work", "bf:relation", lambda e: not has(e, "bf:Series")),
    ("775 / 776 Related instances", "Instance", "bf:relation", lambda e: not has(e, "bf:Series")),
]


# ---- HTTP -----------------------------------------------------------------------------------
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


_no_redirect = urllib.request.build_opener(NoRedirect)


def fetch(url, headers=None, data=None, service="upstream"):
    req = urllib.request.Request(url, data=data, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        raise UpstreamError(f"{service} returned HTTP {e.code} for {url.split('?')[0]}") from e
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise UpstreamError(f"{service} unreachable: {e}") from e


# ---- OCLC -----------------------------------------------------------------------------------
_token = {"value": None, "expires": 0.0}
_token_lock = threading.Lock()


def get_token(force=False):
    """One OCLC token shared by all requests, refreshed a minute before it expires."""
    with _token_lock:
        if force or not _token["value"] or time.time() > _token["expires"] - 60:
            if not (WC_CLIENTID and WC_SECRET):
                raise UpstreamError("WC_CLIENTID / WC_SECRET are not set")
            auth = base64.b64encode(f"{WC_CLIENTID}:{WC_SECRET}".encode()).decode()
            data = urllib.parse.urlencode({"grant_type": "client_credentials", "scope": OCLC_SCOPES}).encode()
            body = json.loads(fetch(OCLC_TOKEN_URL, {"Authorization": f"Basic {auth}"}, data, "OCLC token"))
            _token["value"] = body["access_token"]
            _token["expires"] = time.time() + float(body.get("expires_in", 600))
        return _token["value"]


def oclc_get(url, accept, params=None):
    if params:
        url += "?" + urllib.parse.urlencode(params)
    for attempt in (1, 2):
        try:
            return fetch(url, {"Authorization": f"Bearer {get_token(force=attempt == 2)}", "Accept": accept}, service="OCLC")
        except UpstreamError as e:
            # a token revoked early shows up as 401: get a fresh one and retry once
            if attempt == 2 or "HTTP 401" not in str(e):
                raise


def search(isbn):
    params = {
        "q": f"bn:{isbn}",
        "groupRelatedEditions": "false",
        "groupVariantRecords": "false",
        "itemSubType": "book-printbook",
        "inCatalogLanguage": "eng",
        "limit": 50,
    }
    records = json.loads(oclc_get(OCLC_SEARCH_URL, "application/json", params)).get("briefRecords", [])
    # bn: also hits 020 $z (e.g. the ebook record citing the print ISBN); isbns[] is $a only
    return [r for r in records if isbn in r.get("isbns", [])]


def norm_lccn(s):
    return re.sub(r"\s+", "", s or "")


def parse_marc(xml):
    root = ET.fromstring(xml)
    rec = {"leader": root.findtext(".//m:leader", namespaces=NS), "fields": [], "xml": xml}
    for d in root.iterfind(".//m:datafield", NS):
        if d.get("tag") in FIELDS:
            subs = [(s.get("code"), s.text or "") for s in d]
            rec["fields"].append({"tag": d.get("tag"), "ind": d.get("ind1") + d.get("ind2"), "subfields": subs})
    return rec


def subfield(rec, tag, code):
    return [v for f in rec["fields"] if f["tag"] == tag for c, v in f["subfields"] if c == code]


def score(rec, lccn):
    """Higher is better: LCCN match, then DLC/pcc, then fullness."""
    lccns = [norm_lccn(v) for v in subfield(rec, "010", "a")]
    return (
        bool(lccn) and norm_lccn(lccn) in lccns,
        "DLC" in subfield(rec, "040", "a"),
        "pcc" in subfield(rec, "042", "a"),
        bool(subfield(rec, "300", "a")),
        len(rec["fields"]),
    )


def fetch_candidate(brief, lccn):
    rec = parse_marc(oclc_get(f"{OCLC_MARC_URL}/{brief['oclcNumber']}", "application/marcxml+xml"))
    rec["oclcNumber"] = brief["oclcNumber"]
    rec["score"] = score(rec, lccn)
    return rec


# ---- id.loc.gov -----------------------------------------------------------------------------
def idloc(uri):
    """Instance URIs come back as http(s)://id.loc.gov/...; fetch them from the configured host."""
    return re.sub(r"^https?://id\.loc\.gov", IDLOC_URL, uri)


def idloc_lookup(isbn):
    """Resolve an ISBN to an id.loc.gov instance and return (instance_uri, lccn).

    The identifier URL 302s to the instance; we must not follow it (the bare
    instance URI lands on the Cloudflare-challenged .html) and instead ask for
    .bibframe.rdf directly.
    """
    try:
        _no_redirect.open(f"{IDLOC_URL}/resources/instances/identifier/{urllib.parse.quote(isbn)}", timeout=HTTP_TIMEOUT)
        return None, None
    except urllib.error.HTTPError as e:
        location = e.headers.get("Location")
        if e.code not in (301, 302, 303) or not location:
            return None, None
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise UpstreamError(f"id.loc.gov unreachable: {e}") from e
    inst = fetch_instance(location.removesuffix(".html"))
    if isbn not in [v for v, _ in inst["isbns"]]:
        # the instance only cites this ISBN as cancelled/invalid, so it is a different manifestation
        return inst["uri"], None
    return inst["uri"], inst["lccn"]


def fetch_instance(uri):
    """Fetch an instance's .bibframe.rdf (not Cloudflare-challenged) and pull its identifiers and carrier."""
    uri = uri.replace("http://", "https://")
    root = ET.fromstring(fetch(idloc(uri) + ".bibframe.rdf", service="id.loc.gov"))

    def identifiers(cls, cancelled):
        # cancelled/invalid identifiers carry bf:status .../mstatus/cancinv
        return [
            ((el.findtext("rdf:value", namespaces=BF_NS) or "").strip(), el.findtext("bf:qualifier", namespaces=BF_NS) or "")
            for el in root.iterfind(f".//bf:identifiedBy/bf:{cls}", BF_NS)
            if (el.find("bf:status", BF_NS) is not None) == cancelled
        ]

    lccns = identifiers("Lccn", False)
    carrier = root.find(".//bf:carrier", BF_NS)
    return {
        "uri": uri,
        "lccn": norm_lccn(lccns[0][0]) if lccns else None,
        "isbns": identifiers("Isbn", False),
        "cancelled_isbns": identifiers("Isbn", True),
        "carrier": carrier.get(RDF_RESOURCE, "").rsplit("/", 1)[-1] if carrier is not None else None,
    }


def is_print(inst):
    """The print instance has the print ISBN valid and the ebook ISBN cancelled; the ebook instance is the reverse."""
    electronic = any(re.search(r"e-?book|electronic|epub|pdf|kindle|online", q, re.I) for _, q in inst["isbns"])
    return bool(inst["isbns"]) and not electronic and inst["carrier"] != "cr"


def barcode_lookup(barcode):
    """Resolve an inventory barcode to the print instance; returns (instance, all_hits)."""
    url = f"{IDLOC_URL}/resources/instances/suggest2?" + urllib.parse.urlencode({"q": barcode, "searchtype": "keyword"})
    hits = json.loads(fetch(url, service="id.loc.gov"))["hits"]
    with ThreadPoolExecutor(max_workers=4) as pool:
        instances = list(pool.map(fetch_instance, [h["uri"] for h in hits]))
    prints = [i for i in instances if is_print(i)]
    return (prints[0] if len(prints) == 1 else None), instances


# ---- marc2bibframe2 -------------------------------------------------------------------------
# marc2bibframe2 under libxslt repeats the nodes built from 264 and 490 (its grouping uses the
# preceding:: axis on temporary trees, which libxslt returns empty for). These are the only
# properties affected, so the cleanup is limited to them.
DUPLICATED_PROPS = ("provisionActivity", "publicationStatement", "productionStatement",
                    "distributionStatement", "manufactureStatement", "relation")
_conversions = threading.BoundedSemaphore(MAX_CONVERSIONS)


def fix_converter_output(root):
    """Repair known marc2bibframe2 output problems in place; returns a list of what was fixed.

    1. the repeated 264/490 nodes described above
    2. a property wrapped in itself, e.g. <madsrdf:isIdentifiedByAuthority><madsrdf:isIdentifiedByAuthority
       rdf:resource="..."/></...> (names with a $1 RWO URI and no $0), which is not valid RDF/XML

    Both only act when the problem is present, so a fixed converter passes through unchanged.
    """
    fixes = []
    for el in root.iter():
        kids = list(el)
        if len(kids) == 1 and kids[0].tag == el.tag and kids[0].get(RDF_RESOURCE) and not list(kids[0]):
            el.remove(kids[0])
            el.set(RDF_RESOURCE, kids[0].get(RDF_RESOURCE))
            el.text = None
            fixes.append("unwrapped nested " + el.tag.split("}")[1])
    for res in root:
        seen = {}  # property -> [(child, set of its serialized lines)]
        for child in list(res):
            prop = child.tag.split("}")[1]
            if prop not in DUPLICATED_PROPS or (prop == "relation" and not has(child, "bf:Series")):
                continue
            lines = {l.strip() for l in ET.tostring(child, encoding="unicode").splitlines() if l.strip()}
            kept = seen.setdefault(prop, [])
            # a repeat is identical to, or (264 copy without the 008 date/place) a subset of, another node
            if any(lines <= other for _, other in kept):
                res.remove(child)
                fixes.append("duplicate " + prop)
                continue
            for other_child, other in list(kept):
                if other < lines:
                    res.remove(other_child)
                    kept.remove((other_child, other))
                    fixes.append("duplicate " + prop)
            kept.append((child, lines))
    return fixes


def to_bibframe(marcxml):
    """Convert MARCXML with marc2bibframe2 and fix the output; returns (root, fixes)."""
    if not os.path.isfile(M2B_XSL):
        raise UpstreamError(f"marc2bibframe2 stylesheet not found at {M2B_XSL}")
    with _conversions:
        try:
            result = subprocess.run(["xsltproc", "--stringparam", "baseuri", M2B_BASEURI, M2B_XSL, "-"],
                                    input=marcxml, capture_output=True, timeout=120)
        except (OSError, subprocess.TimeoutExpired) as e:
            raise UpstreamError(f"marc2bibframe2 conversion failed: {e}") from e
    if result.returncode != 0 or not result.stdout.strip():
        raise UpstreamError("marc2bibframe2 conversion failed: " + result.stderr.decode(errors="replace")[-500:])
    root = ET.fromstring(result.stdout)
    fixes = fix_converter_output(root)
    ET.indent(root, space="  ")
    return root, fixes


def to_jsonld(rdfxml, roots):
    """RDF/XML string -> nested JSON-LD: one tree per root URI, with the nodes it points to embedded."""
    graph = rdflib.Graph().parse(data=rdfxml, format="xml")
    data = json.loads(graph.serialize(format="json-ld", context=JSONLD_CONTEXT))
    nodes = data.get("@graph", [data] if "@id" in data else [])
    by_id = {n["@id"]: {k: v for k, v in n.items() if k != "@context"} for n in nodes}
    # roots stay as references wherever they are pointed to; any other named node is written out in
    # full the first time it is referenced and as a plain {"@id"} after that, so no triple is repeated
    embedded = set(roots)

    def embed(value):
        if isinstance(value, list):
            return [embed(v) for v in value]
        if isinstance(value, dict) and set(value) == {"@id"} and value["@id"] in by_id and value["@id"] not in embedded:
            embedded.add(value["@id"])
            node = expand(by_id[value["@id"]])
            if value["@id"].startswith("_:"):
                node.pop("@id")
            return node
        if isinstance(value, dict) and "@list" in value:  # rdf:List, e.g. madsrdf:componentList
            return {**value, "@list": embed(value["@list"])}
        return value

    def expand(node):
        return {k: v if k in ("@id", "@type") else embed(v) for k, v in node.items()}

    trees = [expand(by_id[r]) for r in roots if r in by_id]
    return {"@context": JSONLD_CONTEXT, "@graph": trees}


def checklist_bibframe(root):
    """[{row, resource, rdfxml: [...], jsonld: {...}}] for each checklist row the converted record has data for."""
    resources = {"Work": root.find("bf:Work", BF_NS), "Instance": root.find("bf:Instance", BF_NS)}
    out = []
    for row, res, xpath, keep in CHECKLIST_BF:
        if resources[res] is None:
            continue
        nodes = [e for e in resources[res].iterfind(xpath, BF_NS) if keep is None or keep(e)]
        if not nodes:
            continue
        blocks = []
        for node in nodes:
            ET.indent(node, space="  ")
            xml = ET.tostring(node, encoding="unicode").strip()
            for prefix, uri in BF_NS.items():
                xml = xml.replace(f' xmlns:{prefix}="{uri}"', "")
            blocks.append(xml)
        # for JSON-LD the elements need a subject: put them back under their resource (and any parent path)
        about = resources[res].get(RDF_ABOUT)
        parents = xpath.split("/")[:-1]
        wrapped = (f'{RDF_OPEN}<bf:{res} rdf:about="{about}">' + "".join(f"<{t}>" for t in parents)
                   + "".join(blocks) + "".join(f"</{t}>" for t in reversed(parents)) + f"</bf:{res}></rdf:RDF>")
        jsonld = to_jsonld(wrapped, [about])["@graph"][0]
        out.append({"row": row, "resource": res, "rdfxml": blocks, "jsonld": jsonld})
    return out


# ---- the whole process ----------------------------------------------------------------------
def marc_json(rec, full):
    out = {
        "oclcNumber": rec["oclcNumber"],
        "lccnConfirmed": rec["score"][0],
        "encodingLevel": rec["leader"][17],
        "fields": [{"tag": f["tag"], "ind": f["ind"], "subfields": [{c: v} for c, v in f["subfields"]]}
                   for f in rec["fields"]],
    }
    if full:
        out["marcxml"] = rec["xml"].decode("utf-8", errors="replace")
    return out


def lookup(isbn=None, barcode=None, lccn=None, bibframe=True, full=False):
    """Run the whole process and return it as one JSON-serializable dict.

    full=True also returns the complete MARCXML and the complete converted record (RDF/XML and JSON-LD).
    Raises UpstreamError when OCLC, id.loc.gov or the converter fails.
    """
    result = {"query": {"barcode": barcode, "isbn": isbn, "lccn": lccn}, "status": "ok", "messages": [],
              "idloc": None, "oclc": None, "bibframe": None}

    def stop(status, message):
        result["status"] = status
        result["messages"].append(message)
        return result

    if barcode:
        inst, hits = barcode_lookup(barcode)
        result["idloc"] = {"source": "barcode", "instance": inst["uri"] if inst else None,
                           "lccn": inst["lccn"] if inst else None, "hits": hits}
        if not inst:
            return stop("no_print_instance", f"Could not pick a single print instance for barcode {barcode} ({len(hits)} hits)")
        isbn, lccn = inst["isbns"][0][0], inst["lccn"]
    isbn = isbn.replace("-", "").strip()
    if not lccn:
        uri, lccn = idloc_lookup(isbn)
        result["idloc"] = {"source": "isbn", "instance": uri, "lccn": lccn}
    result["query"]["isbn"], result["query"]["lccn"] = isbn, lccn

    briefs = search(isbn)
    if not briefs:
        return stop("no_oclc_record", f"No print, English-cataloged record with {isbn} in 020 $a")
    with ThreadPoolExecutor(max_workers=4) as pool:
        candidates = list(pool.map(lambda b: fetch_candidate(b, lccn), briefs))
    candidates.sort(key=lambda r: r["score"], reverse=True)

    result["oclc"] = {"best": marc_json(candidates[0], full),
                      "otherCandidates": [marc_json(r, full) for r in candidates[1:]],
                      "conflicts": {}}
    # the same book described differently across records is worth a human look
    pages = {r["oclcNumber"]: " ".join(subfield(r, "300", "a")) for r in candidates if subfield(r, "300", "a")}
    if len(set(pages.values())) > 1:
        result["oclc"]["conflicts"]["300a"] = pages
        result["messages"].append("300 $a differs between OCLC records")

    if bibframe:
        best = candidates[0]
        root, fixes = to_bibframe(best["xml"])
        result["bibframe"] = {"oclcNumber": best["oclcNumber"], "context": JSONLD_CONTEXT,
                              "converterFixes": fixes, "checklist": checklist_bibframe(root)}
        if full:
            rdfxml = ET.tostring(root, encoding="unicode")
            result["bibframe"]["record"] = {"rdfxml": rdfxml,
                                            "jsonld": to_jsonld(rdfxml, [res.get(RDF_ABOUT) for res in root])}
    return result


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("isbn", nargs="?")
    ap.add_argument("--barcode", help="inventory barcode; resolves the print instance (and its ISBN/LCCN) from id.loc.gov")
    ap.add_argument("--lccn", help="LCCN to confirm the match; looked up from id.loc.gov if omitted")
    ap.add_argument("--no-bibframe", action="store_true", help="skip the marc2bibframe2 conversion")
    ap.add_argument("--full", action="store_true", help="include the complete MARCXML and converted record")
    args = ap.parse_args()
    if not (args.isbn or args.barcode):
        ap.error("give an ISBN or --barcode")
    print(json.dumps(lookup(args.isbn, args.barcode, args.lccn, not args.no_bibframe, args.full), indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
