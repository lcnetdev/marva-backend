#!/usr/bin/env python3
"""Apply a trusted XSLT stylesheet to UNTRUSTED XML read from stdin.

Usage: python3 -I safe_xslt.py [--stringparam NAME VALUE]... [--allow-local-read]
                               /path/to/stylesheet.xsl < input.xml > output.xml

This replaces the xsltproc CLI for XML we did not write ourselves. xsltproc
always parses its input with entity substitution and DTD loading on (libxslt's
XSLT_PARSE_OPTIONS), and no flag turns that off: --nonet only blocks network
fetches, so a <!ENTITY x SYSTEM "file:///..."> in the input is read from disk
and expanded into the result. Here the input is parsed with libxml2 directly,
so the parser options are ours:

  * no entity substitution, no DTD loading, no network, and
  * any document that carries a DOCTYPE at all is refused, and
  * the stylesheet runs with XSLTAccessControl.DENY_ALL, so document(),
    exsl:document etc. cannot read or write files or reach the network.

--allow-local-read relaxes only the last point, and only for reading local
files: it is for stylesheets that load their own lookup tables with
document('conf/x.xml') or document(''), as marc2bibframe2 does. Writing files
and all network access stay denied. Do not use it with a stylesheet that
passes input-derived URIs to document().

The result is written to stdout serialised per the stylesheet's xsl:output,
xsl:message output and errors go to stderr (as xsltproc does). Exit status is
0 on success, 2 for a rejected or unparseable input, 1 for anything else.

The same file is shipped in util-service/scripts/ and cip-lookup/ (separate
images); keep the two copies identical.
"""

import argparse
import sys

from lxml import etree


def fail(code, message):
    sys.stderr.write(message.rstrip() + "\n")
    sys.exit(code)


def parse_args(argv):
    parser = argparse.ArgumentParser(description="Apply a trusted XSLT stylesheet to untrusted XML on stdin.")
    parser.error = lambda message: fail(1, f"usage error: {message}")
    parser.add_argument("stylesheet")
    parser.add_argument("--stringparam", nargs=2, action="append", default=[], metavar=("NAME", "VALUE"),
                        help="pass a string parameter to the stylesheet (repeatable)")
    parser.add_argument("--allow-local-read", action="store_true",
                        help="let the stylesheet's document() read local files (never the network)")
    return parser.parse_args(argv)


def main(argv):
    args = parse_args(argv)

    # Untrusted input: nothing outside the bytes on stdin may be pulled in.
    input_parser = etree.XMLParser(
        resolve_entities=False,
        load_dtd=False,
        dtd_validation=False,
        attribute_defaults=False,
        no_network=True,
        huge_tree=False,
    )
    try:
        doc = etree.fromstring(sys.stdin.buffer.read(), input_parser).getroottree()
    except etree.XMLSyntaxError as e:
        fail(2, f"Invalid XML: {e}")

    # Entities can only be declared in a DTD. Nothing we convert has one, and
    # with substitution off a document relying on entities would transform
    # wrongly, so refuse it outright rather than produce a silently different
    # record. (libxslt would also still expand internal entities.)
    info = doc.docinfo
    if info.doctype or info.internalDTD is not None or info.externalDTD is not None:
        fail(2, "Invalid XML: DOCTYPE declarations are not allowed")

    if args.allow_local_read:
        access = etree.XSLTAccessControl(read_file=True, write_file=False, create_dir=False,
                                         read_network=False, write_network=False)
    else:
        access = etree.XSLTAccessControl.DENY_ALL

    try:
        # The stylesheet is ours; it is still parsed offline.
        stylesheet = etree.parse(args.stylesheet, etree.XMLParser(no_network=True))
        transform = etree.XSLT(stylesheet, access_control=access)
    except (OSError, etree.Error) as e:
        fail(1, f"Could not load stylesheet: {e}")

    params = {name: etree.XSLT.strparam(value) for name, value in args.stringparam}
    try:
        result = transform(doc, **params)
    except etree.XSLTError as e:
        for entry in transform.error_log:
            sys.stderr.write(entry.message.rstrip() + "\n")
        fail(1, f"Transform failed: {e}")

    for entry in transform.error_log:
        sys.stderr.write(entry.message.rstrip() + "\n")
    sys.stdout.buffer.write(bytes(result))
    sys.stdout.buffer.flush()


if __name__ == "__main__":
    main(sys.argv[1:])
