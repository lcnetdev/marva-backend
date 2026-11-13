/**
 * Security regression tests for scripts/safe_xslt.py, the XSLT runner behind
 * POST /marcpreview/:type.
 *
 * The route used to pipe the request body into the xsltproc CLI, which expands
 * external entities, so a SYSTEM entity pointing at a local file came back in
 * the MARC 245 $a. These tests make sure that no file content can reach the
 * output, whichever way the entity is declared.
 *
 * Needs python3 with lxml (present in the util image). Where that is missing
 * the suite is skipped rather than failed.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HELPER = path.join(__dirname, '..', '..', 'scripts', 'safe_xslt.py');
const XSL_DIR = path.join(__dirname, '..', '..', 'lib', 'bibframe2marc');
const STYLESHEETS = fs.readdirSync(XSL_DIR).filter((f) => f.endsWith('.xsl'));

const hasLxml = spawnSync('python3', ['-I', '-c', 'import lxml.etree']).status === 0;
const describeIfLxml = hasLxml ? describe : describe.skip;

const CANARY = 'CANARY-7f3a9c-MUST-NOT-LEAK';
const NS = 'xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:bf="http://id.loc.gov/ontologies/bibframe/"';

/** Minimal BIBFRAME the stylesheets accept; `title` lands in MARC 245 $a. */
const rdf = (title) => `<rdf:RDF ${NS}>
  <bf:Work rdf:about="http://example.org/w1">
    <bf:title><bf:Title><bf:mainTitle>${title}</bf:mainTitle></bf:Title></bf:title>
  </bf:Work>
  <bf:Instance rdf:about="http://example.org/i1">
    <bf:title><bf:Title><bf:mainTitle>${title}</bf:mainTitle></bf:Title></bf:title>
    <bf:instanceOf rdf:resource="http://example.org/w1"/>
  </bf:Instance>
</rdf:RDF>`;

const run = (stylesheet, xml) => {
  const r = spawnSync('python3', ['-I', HELPER, stylesheet], { input: xml, encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
};

describeIfLxml('safe_xslt.py', () => {
  let dir;
  let canaryUrl;
  let dtdUrl;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'safe-xslt-'));
    fs.writeFileSync(path.join(dir, 'canary.txt'), CANARY + '\n');
    canaryUrl = 'file://' + path.join(dir, 'canary.txt');
    dtdUrl = 'file://' + path.join(dir, 'ext.dtd');
    fs.writeFileSync(path.join(dir, 'ext.dtd'), `<!ENTITY % all "<!ENTITY leak SYSTEM '${canaryUrl}'>"> %all;`);
    fs.writeFileSync(path.join(dir, 'doc.xml'), `<secret>${CANARY}</secret>`);
    fs.writeFileSync(path.join(dir, 'document.xsl'), `<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:template match="/"><out><xsl:copy-of select="document(string(/in))"/></out></xsl:template>
</xsl:stylesheet>`);
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('there are stylesheets to test against', () => {
    expect(STYLESHEETS.length).toBeGreaterThan(0);
  });

  describe.each(STYLESHEETS)('%s', (name) => {
    const stylesheet = path.join(XSL_DIR, name);

    test('transforms ordinary RDF/XML to MARCXML', () => {
      const r = run(stylesheet, rdf('A plain title'));
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('<marc:record');
      expect(r.stdout).toContain('<marc:subfield code="a">A plain title</marc:subfield>');
    });

    const payloads = {
      'general external entity': () =>
        `<!DOCTYPE r [ <!ENTITY xxe SYSTEM "${canaryUrl}"> ]>` + rdf('&xxe;'),
      'external parameter entity': () =>
        `<!DOCTYPE r [ <!ENTITY % ext SYSTEM "${dtdUrl}"> %ext; ]>` + rdf('&leak;'),
      'external DTD subset': () =>
        `<!DOCTYPE r SYSTEM "${dtdUrl}">` + rdf('&leak;'),
      'external entity in an attribute': () =>
        `<!DOCTYPE r [ <!ENTITY xxe SYSTEM "${canaryUrl}"> ]>` +
        rdf('t').replace('http://example.org/w1', '&xxe;'),
      // DOCTYPE hidden from string filters behind a UTF-7 encoding declaration
      'UTF-7 encoded DOCTYPE': () =>
        '<?xml version="1.0" encoding="UTF-7"?>' +
        `+ADwAIQ-DOCTYPE r +AFs- +ADwAIQ-ENTITY xxe SYSTEM +ACI-${canaryUrl}+ACIAPg- +AF0APg-` +
        rdf('+ACY-xxe+ADs-'),
    };

    test.each(Object.keys(payloads))('does not disclose a local file via %s', (kind) => {
      const r = run(stylesheet, payloads[kind]());
      expect(r.stdout).not.toContain(CANARY);
      expect(r.stderr).not.toContain(CANARY);
      expect(r.status).toBe(2);
      expect(r.stdout).toBe('');
    });

    test('refuses internal entities too (no entity expansion at all)', () => {
      const r = run(stylesheet, '<!DOCTYPE r [ <!ENTITY a "expanded"> ]>' + rdf('&a;'));
      expect(r.status).toBe(2);
      expect(r.stdout).toBe('');
      expect(r.stderr).toMatch(/DOCTYPE/);
    });
  });

  test('stylesheet document() cannot read local files named by the input', () => {
    const r = run(path.join(dir, 'document.xsl'), `<in>${'file://' + path.join(dir, 'doc.xml')}</in>`);
    expect(r.stdout).not.toContain(CANARY);
    expect(r.stderr).not.toContain(CANARY);
  });

  test('malformed XML is rejected, not passed on', () => {
    const r = run(path.join(XSL_DIR, STYLESHEETS[0]), '<rdf:RDF><unclosed>');
    expect(r.status).toBe(2);
    expect(r.stdout).toBe('');
  });
});
