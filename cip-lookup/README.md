# cip-lookup API

Given a scanned ISBN or inventory barcode for a print book, `cip-lookup` finds the exact
WorldCat record for that manifestation and returns the data a cataloger needs to finish
the CIP record, as MARC fields, BIBFRAME RDF/XML and BIBFRAME JSON-LD.

## What a request does

1. **id.loc.gov** resolves the scan to an LC instance and its LCCN.
   - Barcode: keyword search of instances, then the print instance is picked from the hits.
   - ISBN: the identifier lookup, used only if the ISBN is a valid (not cancelled) ISBN on
     the instance it returns.
2. **OCLC** is searched by ISBN, limited to print books cataloged in English. Records that
   only cite the ISBN in `020 $z` are dropped. The full MARC of each remaining record is fetched.
3. The **best record** is chosen: LCCN match first, then DLC as cataloging agency, then pcc,
   then having a `300`, then number of fields.
4. **marc2bibframe2** converts the best record, and the result is grouped by RDA CIP VER
   checklist row.

## Endpoints

### `GET /lookup`

| Parameter | Required | Default | Meaning |
| :-- | :-- | :-- | :-- |
| `barcode` | one of `barcode` / `isbn` | | Inventory barcode. Takes precedence if both are given. |
| `isbn` | one of `barcode` / `isbn` | | ISBN; hyphens are ignored. |
| `lccn` | no | looked up | LCCN to confirm the OCLC match with. Skips the id.loc.gov ISBN lookup. Ignored with `barcode`. |
| `bibframe` | no | `true` | `false` skips the conversion and returns only the MARC data. |
| `full` | no | `false` | `true` adds the complete MARCXML of each candidate and the complete converted record. |

Boolean parameters accept `true`, `1` or `yes`; anything else is false.

```
curl 'http://cip-lookup:8080/lookup?barcode=00539481265'
curl 'http://cip-lookup:8080/lookup?isbn=9781668072851'
curl 'http://cip-lookup:8080/lookup?isbn=9781668072851&lccn=2025018671&bibframe=false'
curl 'http://cip-lookup:8080/lookup?barcode=00539481265&full=true'
```

### `GET /health`

```json
{ "status": "ok", "stylesheet": "/opt/marc2bibframe2/xsl/marc2bibframe2.xsl",
  "stylesheetFound": true, "credentialsSet": true }
```

Always 200 while the server is up. `stylesheetFound` and `credentialsSet` say whether a
lookup can succeed; it does not call OCLC or id.loc.gov.

## Status codes

| HTTP | `status` | Meaning |
| :-- | :-- | :-- |
| 200 | `ok` | A record was found. |
| 404 | `no_print_instance` | Barcode: id.loc.gov returned zero or several print instances. `idloc.hits` lists what it found. |
| 404 | `no_oclc_record` | No print, English-cataloged OCLC record has the ISBN in `020 $a`. |
| 400 | `bad_request` | Neither `isbn` nor `barcode` was given. |
| 502 | `upstream_error` | OCLC, id.loc.gov or the converter failed or timed out. |
| 500 | `error` | Unexpected failure; details are in the container log. |

Every response is JSON with `status` and `messages`. `messages` holds the reason for a
failure, and on success any warnings (for example `300 $a differs between OCLC records`).

## Response

```json
{
  "query":    { "barcode": "00539481265", "isbn": "9781668072851", "lccn": "2025018671" },
  "status":   "ok",
  "messages": ["300 $a differs between OCLC records"],
  "idloc":    { ... },
  "oclc":     { ... },
  "bibframe": { ... }
}
```

`query` echoes the input with the ISBN and LCCN that were resolved along the way.

### `idloc`

```json
{
  "source": "barcode",
  "instance": "https://id.loc.gov/resources/instances/24229195",
  "lccn": "2025018671",
  "hits": [
    { "uri": "https://id.loc.gov/resources/instances/24229195", "lccn": "2025018671",
      "isbns": [["9781668072851", "trade paperback"]],
      "cancelled_isbns": [["9781964856353", "ebook"]], "carrier": "nc" },
    { "uri": "https://id.loc.gov/resources/instances/24232234", "lccn": "2025018672",
      "isbns": [["9781964856353", "ebook"]],
      "cancelled_isbns": [["9781668072851", "trade paperback"]], "carrier": "cr" }
  ]
}
```

- `source` is `barcode` or `isbn`. `hits` is only present for a barcode.
- ISBNs are `[value, qualifier]` pairs.
- A hit counts as print when none of its valid ISBNs is qualified as an ebook/electronic
  format and its carrier is not `cr` (online resource).
- `idloc` is `null` when `lccn` was supplied with an ISBN. For an ISBN lookup `lccn` is
  `null` when id.loc.gov has no instance, or the instance only lists the ISBN as cancelled.

### `oclc`

```json
{
  "best": {
    "oclcNumber": "1522761698",
    "lccnConfirmed": true,
    "encodingLevel": "8",
    "fields": [
      { "tag": "245", "ind": "12", "subfields": [{ "a": "A plague of magic /" }, { "c": "Marisa Wolf." }] },
      { "tag": "300", "ind": "  ", "subfields": [{ "a": "423 pages :" }, { "b": "map ;" }, { "c": "24 cm." }] }
    ]
  },
  "otherCandidates": [ { "oclcNumber": "1542845831", "lccnConfirmed": false, "encodingLevel": "7", "fields": [ ... ] } ],
  "conflicts": { "300a": { "1522761698": "423 pages :", "1542845831": "432 p." } }
}
```

- `lccnConfirmed` is true when the record's `010` matches the LCCN. When false, the record
  was chosen by the fallback ranking and should be treated as a suggestion.
- `fields` holds only the tags relevant to the checklist: 010, 020, 040, 042, 100, 110,
  245, 246, 250, 264, 300, 490, 700, 710, 776. Subfields are a list of single-key objects
  so order and repeats are kept.
- `conflicts.300a` appears when candidates disagree on extent.
- With `full=true` each record also has `marcxml`, the complete record as a string.

### `bibframe`

`null` when `bibframe=false`.

```json
{
  "oclcNumber": "1522761698",
  "context": { "bf": "http://id.loc.gov/ontologies/bibframe/", "bflc": "...", "rdf": "...",
               "rdfs": "...", "madsrdf": "...", "xsd": "..." },
  "converterFixes": ["unwrapped nested isIdentifiedByAuthority", "duplicate relation",
                     "duplicate provisionActivity", "duplicate publicationStatement"],
  "checklist": [
    {
      "row": "300 $a Extent + $b Other physical details",
      "resource": "Instance",
      "rdfxml": ["<bf:extent>\n  <bf:Extent>\n    <rdfs:label>423 pages</rdfs:label>\n ...</bf:extent>"],
      "jsonld": {
        "@id": "http://example.org/on1522761698#Instance",
        "@type": "bf:Instance",
        "bf:extent": {
          "@type": "bf:Extent",
          "bf:note": { "@type": ["bf:Note", "http://id.loc.gov/vocabulary/mnotetype/physical"], "rdfs:label": "map" },
          "rdfs:label": "423 pages"
        }
      }
    }
  ]
}
```

- `checklist` has one entry per checklist row that the OCLC record has data for; rows with
  no data are omitted.
- `resource` says whether the elements belong on the `Work` or the `Instance`.
- `rdfxml` is a list of RDF/XML property elements, one string each, without namespace
  declarations. The prefixes are the ones in `context`.
- `jsonld` is the same data as one nested JSON-LD object rooted at the Work or Instance.
  It has no `@context` of its own; use `bibframe.context`. For every row the `rdfxml` and
  `jsonld` describe the same graph.
- The `@id` of the Work and Instance are placeholders minted by the converter
  (`CIP_LOOKUP_M2B_BASEURI` + OCLC control number + `#Work` / `#Instance`).
- `converterFixes` lists repairs made to the converter's output (see below). An empty list
  means none were needed.
- With `full=true`, `record` is added: `{ "rdfxml": "<whole record>", "jsonld": { "@context": ..., "@graph": [Work, Instance] } }`.

#### Checklist rows

The `row` values are exactly these strings.

| `row` | `resource` | BIBFRAME property |
| :-- | :-- | :-- |
| Ldr/17 Encoding level | Work | `bf:adminMetadata / bflc:encodingLevel` |
| Ldr/18 + 040 $e Description conventions | Work | `bf:adminMetadata / bf:descriptionConventions` |
| 040 $b Language of cataloging | Work | `bf:adminMetadata / bf:descriptionLanguage` |
| 042 Authentication code | Work | `bf:adminMetadata / bf:descriptionAuthentication` |
| 020 ISBN | Instance | `bf:identifiedBy` (`bf:Isbn`) |
| 050 Class number | Work | `bf:classification` (`bf:ClassificationLcc`) |
| 1XX Creator | Work | `bf:contribution` (primary) |
| 7XX Added access points | Work | `bf:contribution` (others) |
| 240 Preferred title | Work | `bf:expressionOf` |
| 245 Title proper | Instance | `bf:title` (`bf:Title`) |
| 245 $c Statement of responsibility | Instance | `bf:responsibilityStatement` |
| 246 Variant title | Work | `bf:title` (variant and parallel titles) |
| 246 Variant title (cover/spine) | Instance | `bf:title` (variant titles) |
| 250 Edition statement | Instance | `bf:editionStatement` |
| 263 Expected publication date (delete) | Instance | `bf:projectedProvisionDate` |
| 264 Publication information | Instance | `bf:provisionActivity` |
| 264 Publication statement | Instance | `bf:publicationStatement` |
| 264 _4 Copyright date | Instance | `bf:copyrightDate` |
| 300 $a Extent + $b Other physical details | Instance | `bf:extent` |
| 300 $c Dimensions | Instance | `bf:dimensions` |
| 008/18-21 + 340 $p Illustrative content | Work | `bf:illustrativeContent` |
| 336 Content type | Work | `bf:content` |
| 337 Media type | Instance | `bf:media` |
| 338 Carrier type | Instance | `bf:carrier` |
| 490 Series statement | Work, Instance | `bf:relation` to a `bf:Series` |
| 504 Bibliography note | Instance | `bf:note` (type `biblio`) |
| 500 General note | Instance | `bf:note` (untyped) |
| 505 Contents note | Work | `bf:tableOfContents` |
| 520 Summary | Work | `bf:summary` |
| 7XX X2 / 775 / 776 Related works | Work | `bf:relation` (not series) |
| 775 / 776 Related instances | Instance | `bf:relation` (not series) |

The local checklist fields 906, 955 and 963 have no marc2bibframe2 mapping and never appear.

## Converter output fixes

marc2bibframe2 run with `xsltproc` has two output problems, which the service repairs
after conversion rather than changing the stylesheets:

- **Duplicates:** the nodes built from 264 and 490 are emitted twice. A provision activity,
  a publication/production/distribution/manufacture statement or a series relation is dropped
  when it is identical to, or a strict subset of, another one on the same resource.
- **Nested property:** `madsrdf:isIdentifiedByAuthority` is wrapped in itself for names with
  a `$1` real-world-object URI and no `$0`, which is not valid RDF/XML. It is unwrapped.

Each repair is reported in `converterFixes`. Both only act when the problem is present, so
a later marc2bibframe2 release that fixes them needs no change here.

## Running

The service is the `cip-lookup` block in `../docker-compose.yml` and starts with the rest of
the stack. It publishes no host port: inside the docker network it is
`http://cip-lookup:8080`, and clients reach it through util-service, which requires a login:

```
GET /marva/util/cip-lookup?barcode=00539481265      (Authorization: Bearer <jwt>)
```

util passes the parameters, status code and JSON body through unchanged.

```
docker compose up -d --build cip-lookup
```

Requests are handled in parallel, one thread each. One OCLC token is cached and shared.

### Configuration

Everything except the shared WorldCat credentials is prefixed `CIP_LOOKUP_`.

| Variable | Default | Purpose |
| :-- | :-- | :-- |
| `WC_CLIENTID`, `WC_SECRET` | required | WorldCat credentials |
| `CIP_LOOKUP_OCLC_TOKEN_URL` | `https://oauth.oclc.org/token` | OCLC token endpoint |
| `CIP_LOOKUP_OCLC_SEARCH_URL` | `https://americas.discovery.api.oclc.org/worldcat/search/v2/brief-bibs` | OCLC brief-bibs search |
| `CIP_LOOKUP_OCLC_MARC_URL` | `https://metadata.api.oclc.org/worldcat/manage/bibs` | Base for full MARC records |
| `CIP_LOOKUP_OCLC_SCOPES` | `WorldCatMetadataAPI wcapi:view_bib wcapi:view_brief_bib` | Scopes requested with the token |
| `CIP_LOOKUP_IDLOC_URL` | `https://id.loc.gov` | id.loc.gov base |
| `CIP_LOOKUP_M2B_DIR` | `./cip-lookup/marc2bibframe2` | Host directory with marc2bibframe2 (compose only) |
| `CIP_LOOKUP_M2B_XSL` | `/opt/marc2bibframe2/xsl/marc2bibframe2.xsl` | Stylesheet path in the container |
| `CIP_LOOKUP_M2B_BASEURI` | `http://example.org/` | Base for the converter's placeholder URIs |
| `CIP_LOOKUP_HTTP_TIMEOUT` | `20` | Seconds before an upstream call gives up |
| `CIP_LOOKUP_MAX_CONVERSIONS` | CPU count | Conversions allowed to run at once |
| `CIP_LOOKUP_PORT` | `8080` | Port inside the container |
| `CIP_LOOKUP_URL` | `http://cip-lookup:8080` | Where util-service reaches the service (read by util, not this container) |

### Updating marc2bibframe2

The converter is mounted from `CIP_LOOKUP_M2B_DIR`, not built into the image. Replace the
`xsl/` directory there with a newer release; the stylesheet is read on every conversion, so
no rebuild or restart is needed. `marc2bibframe2/VERSION` records which release is included.

### Command line

`lookup.py` runs the same process without the server and prints the JSON response. It reads
the same environment variables, so outside the container set `WC_CLIENTID`, `WC_SECRET` and
`CIP_LOOKUP_M2B_XSL` (and install `rdflib` and `xsltproc`):

```
python lookup.py --barcode 00539481265
python lookup.py 9781668072851 --full
```

## Limits

- The service has no authentication or rate limiting; anything that can reach it can use the
  OCLC quota.
- id.loc.gov returns one instance per ISBN. For an ISBN shared by several books,
  `lccnConfirmed` only means the record matches whichever instance came back. A barcode is
  more reliable.
- Print, English-cataloged records only.
- Developed against one title plus a few edge cases; the ranking and the print/ebook
  rule are not tested on a large batch.
