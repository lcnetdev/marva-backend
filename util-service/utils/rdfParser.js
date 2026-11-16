/**
 * RDF/XML parser utility for extracting index fields from void:DatasetDescription
 *
 * Extracts lclocal:* fields used for indexing BIBFRAME records:
 * - eid: Record identifier
 * - user: User who created/modified the record
 * - title: Record title
 * - status: Record status (inprogress, published, deleted)
 * - lccn: Library of Congress Control Number
 * - timestamp: Unix timestamp of last modification
 * - rstused: Array of resource templates used
 * - profiletypes: Array of profile types (Work, Instance, Item)
 * - externalid: Array of external identifiers
 * - contributor: Contributor name
 * - typeid: Type identifier (e.g., Monograph)
 * - time: Human-readable timestamp
 */

const { XMLParser, XMLValidator } = require('fast-xml-parser');

const RDF_NS = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';

/**
 * Thrown when a body offered for storage is not an RDF/XML document.
 * The message is safe to return to the client.
 */
class NotRdfError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotRdfError';
  }
}

// Configure parser to avoid scientific notation issues with EIDs like "e1234567890123"
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  numberParseOptions: {
    skipLike: /^e\d+$/i,  // Skip EID-like values
    eNotation: false       // Disable scientific notation parsing
  }
});

/**
 * Ensure value is an array
 * @param {*} value - Value that might be array or single item
 * @returns {Array} Array containing the value(s)
 */
function ensureArray(value) {
  if (value === undefined || value === null) return undefined;
  return Array.isArray(value) ? value : [value];
}

/**
 * Extract index fields from RDF/XML content
 * @param {string} rdfXml - The RDF/XML content to parse
 * @param {object} [preParsed] - The document if the caller has already parsed it
 * @returns {object} Index object with all lclocal fields
 */
function extractIndexFromRdf(rdfXml, preParsed = null) {
  const now = new Date();
  const defaultTimestamp = Math.floor(now.getTime() / 1000);
  const defaultTime = now.toJSON().slice(0, 19).replace('T', ':');

  if (!rdfXml || typeof rdfXml !== 'string') {
    return { timestamp: defaultTimestamp, time: defaultTime };
  }

  try {
    const parsed = preParsed || parser.parse(rdfXml);

    // Navigate to void:DatasetDescription element
    // Handle both with and without rdf:RDF wrapper
    let desc = null;

    if (parsed['rdf:RDF']) {
      desc = parsed['rdf:RDF']['void:DatasetDescription'];
    } else if (parsed['void:DatasetDescription']) {
      desc = parsed['void:DatasetDescription'];
    }

    if (!desc) {
      return { timestamp: defaultTimestamp, time: defaultTime };
    }

    const index = {};

    // Array fields - ensure they are always arrays
    const rtsused = ensureArray(desc['lclocal:rtsused']);
    if (rtsused) {
      index.rstused = rtsused;
    }

    const profiletypes = ensureArray(desc['lclocal:profiletypes']);
    if (profiletypes) {
      index.profiletypes = profiletypes;
    }

    const externalid = ensureArray(desc['lclocal:externalid']);
    if (externalid) {
      index.externalid = externalid;
    }

    // String fields
    if (desc['lclocal:title'] !== undefined) {
      index.title = String(desc['lclocal:title']);
    }

    if (desc['lclocal:contributor'] !== undefined) {
      index.contributor = String(desc['lclocal:contributor']);
    }

    if (desc['lclocal:lccn'] !== undefined) {
      index.lccn = String(desc['lclocal:lccn']);
    }

    if (desc['lclocal:user'] !== undefined) {
      index.user = String(desc['lclocal:user']);
    }

    if (desc['lclocal:status'] !== undefined) {
      index.status = String(desc['lclocal:status']);
    }

    if (desc['lclocal:eid'] !== undefined) {
      index.eid = String(desc['lclocal:eid']);
    }

    if (desc['lclocal:typeid'] !== undefined) {
      index.typeid = String(desc['lclocal:typeid']);
    }

    // Generate time fields (matching old ldpjs behavior)
    index.time = defaultTime;
    index.timestamp = defaultTimestamp;

    return index;
  } catch (err) {
    console.error('Error parsing RDF/XML:', err.message);
    return { timestamp: defaultTimestamp, time: defaultTime };
  }
}

/**
 * Say what is wrong with a parsed document's top level, or null if it is an
 * optional XML declaration followed by a single rdf:RDF element.
 *
 * The root's prefix is resolved through its own xmlns declaration, so a
 * document that merely names its root "rdf:RDF" in some other namespace does
 * not pass, and <RDF xmlns="...rdf-syntax-ns#"> does.
 * @param {object} parsed - Output of parser.parse()
 * @returns {string|null}
 */
function rdfRootProblem(parsed) {
  const keys = Object.keys(parsed).filter(k => k !== '?xml');

  // e.g. <?xml-stylesheet?>, which a browser would apply to the document
  const instruction = keys.find(k => k.startsWith('?'));
  if (instruction) {
    return `processing instruction <${instruction.slice(0, 80)}> is not allowed outside the root element`;
  }

  if (keys.length === 0) return 'no root element';
  if (keys.length > 1 || Array.isArray(parsed[keys[0]])) return 'more than one root element';

  const name = keys[0];
  const root = parsed[name];
  const colon = name.indexOf(':');
  const prefix = colon === -1 ? '' : name.slice(0, colon);
  const local = colon === -1 ? name : name.slice(colon + 1);
  const declared = root && typeof root === 'object'
    ? root[prefix ? `@_xmlns:${prefix}` : '@_xmlns']
    : undefined;

  if (local !== 'RDF' || declared !== RDF_NS) {
    return `root element is <${name.slice(0, 80)}>, expected rdf:RDF in the RDF namespace`;
  }
  return null;
}

/**
 * Check that a body is an RDF/XML document and extract its index fields.
 *
 * This keeps things that are not records out of the store. It is not what
 * makes stored content safe to serve: script can sit inside a valid rdf:RDF
 * document, which is why the GET routes send records sandboxed.
 * @param {string} rdfXml - The body offered for storage
 * @returns {object} Index object, as extractIndexFromRdf
 * @throws {NotRdfError} If the body is not well-formed XML with an rdf:RDF root
 */
function validateAndIndexRdf(rdfXml) {
  if (typeof rdfXml !== 'string' || rdfXml.trim() === '') {
    throw new NotRdfError('empty or non-text body');
  }

  const wellFormed = XMLValidator.validate(rdfXml);
  if (wellFormed !== true) {
    throw new NotRdfError(`not well-formed XML (${wellFormed.err.msg} at line ${wellFormed.err.line})`);
  }

  let parsed;
  try {
    parsed = parser.parse(rdfXml);
  } catch (err) {
    throw new NotRdfError(`not well-formed XML (${err.message})`);
  }

  const problem = rdfRootProblem(parsed);
  if (problem) {
    throw new NotRdfError(problem);
  }

  return extractIndexFromRdf(rdfXml, parsed);
}

module.exports = {
  extractIndexFromRdf,
  validateAndIndexRdf,
  NotRdfError,
  parser  // Export parser for testing
};
