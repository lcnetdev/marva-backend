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

const { XMLParser } = require('fast-xml-parser');

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
 * @returns {object} Index object with all lclocal fields
 */
function extractIndexFromRdf(rdfXml) {
  const now = new Date();
  const defaultTimestamp = Math.floor(now.getTime() / 1000);
  const defaultTime = now.toJSON().slice(0, 19).replace('T', ':');

  if (!rdfXml || typeof rdfXml !== 'string') {
    return { timestamp: defaultTimestamp, time: defaultTime };
  }

  try {
    const parsed = parser.parse(rdfXml);

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

module.exports = {
  extractIndexFromRdf,
  parser  // Export parser for testing
};
