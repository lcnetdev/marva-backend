/**
 * BIBFRAME Validation Service
 *
 * Local validation of BIBFRAME RDF/XML records.
 * Converted from XQuery validation logic (bf-validation.xqy).
 *
 * Validation levels:
 * - ERROR: Critical issues that must be fixed
 * - WARNING: Issues that should be reviewed
 * - INFO: Informational messages
 */

const { XMLParser } = require('fast-xml-parser');

// Configure parser to preserve namespaces and handle attributes
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: false,
  numberParseOptions: {
    skipLike: /^e\d+$/i,
    eNotation: false
  }
});

// Illustrative content mapping for cross-validation
const ILLUSTRATIVE_CONTENT_MAP = {
  'http://id.loc.gov/vocabulary/millus/ill': 'illustration',
  'http://id.loc.gov/vocabulary/millus/map': 'map',
  'http://id.loc.gov/vocabulary/millus/por': 'portrait',
  'http://id.loc.gov/vocabulary/millus/chr': 'chart',
  'http://id.loc.gov/vocabulary/millus/pln': 'plan',
  'http://id.loc.gov/vocabulary/millus/plt': 'plate',
  'http://id.loc.gov/vocabulary/millus/mus': 'music',
  'http://id.loc.gov/vocabulary/millus/fac': 'facsimile',
  'http://id.loc.gov/vocabulary/millus/coa': 'coat',
  'http://id.loc.gov/vocabulary/millus/gnt': 'table',
  'http://id.loc.gov/vocabulary/millus/for': 'form',
  'http://id.loc.gov/vocabulary/millus/sam': 'sample',
  'http://id.loc.gov/vocabulary/millus/pho': 'phonodisc',
  'http://id.loc.gov/vocabulary/millus/pht': 'photograph',
  'http://id.loc.gov/vocabulary/millus/ilm': 'illumination'
};

/**
 * Ensure value is an array
 */
function ensureArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Get the URI/about attribute from an element
 */
function getUri(element) {
  if (!element) return null;
  return element['@_rdf:about'] || element['@_rdf:resource'] || null;
}

/**
 * Check if element has a value (text content or rdf:resource)
 */
function hasValue(element) {
  if (!element) return false;
  if (typeof element === 'string' && element.trim()) return true;
  if (element['@_rdf:resource']) return true;
  if (element['@_rdf:about']) return true;
  if (element['#text']) return true;
  return false;
}

/**
 * Get text content from element
 * Handles strings, numbers, objects with #text, and arrays (returns first element's text)
 */
function getText(element) {
  if (element === undefined || element === null) return '';
  if (typeof element === 'string') return element;
  if (typeof element === 'number') return String(element);
  // Handle arrays (e.g., multiple bf:mainTitle elements with different xml:lang)
  if (Array.isArray(element)) {
    // Return text from first element
    return getText(element[0]);
  }
  if (element['#text'] !== undefined) return String(element['#text']);
  return '';
}

/**
 * Check if any element in tree is empty (no text, children, or rdf attributes)
 */
function hasEmptyElements(element) {
  if (!element || typeof element !== 'object') return false;

  for (const key of Object.keys(element)) {
    if (key.startsWith('@_')) continue;
    const child = element[key];
    if (child && typeof child === 'object') {
      // Check if this element is empty
      const hasText = child['#text'] !== undefined && String(child['#text']).trim() !== '';
      const hasResource = child['@_rdf:resource'] !== undefined;
      const hasAbout = child['@_rdf:about'] !== undefined;
      const hasChildren = Object.keys(child).some(k => !k.startsWith('@_') && k !== '#text');

      if (!hasText && !hasResource && !hasAbout && !hasChildren) {
        return true;
      }
      if (hasEmptyElements(child)) return true;
    }
  }
  return false;
}

/**
 * Check if text contains placeholder
 */
function containsPlaceholder(element) {
  if (!element) return false;
  const str = JSON.stringify(element);
  return str.includes('#####');
}

/**
 * Get all note labels from an element
 */
function getNoteLabels(element) {
  const notes = ensureArray(element['bf:note']);
  const labels = [];
  for (const note of notes) {
    const noteEl = note['bf:Note'] || note;
    const label = noteEl['rdfs:label'];
    if (label) {
      labels.push(getText(label).toLowerCase());
    }
  }
  return labels;
}

// ============================================
// HUB VALIDATION RULES
// ============================================

const HUB_RULES = [
  {
    name: 'hub-identifier-properties',
    check: (hub) => {
      // XQuery checks identifiers for valid props
      const identifiers = ensureArray(hub['bf:identifiedBy']);
      const validProps = ['bf:status', 'rdf:value', 'bf:assigner', 'bf:note', 'bf:qualifier', 'rdf:type'];
      for (const idWrapper of identifiers) {
        // Iterate bf:* children
        for (const key of Object.keys(idWrapper)) {
          if (key.startsWith('@_') || key === '#text') continue;
          if (!key.startsWith('bf:')) continue;
          const idEl = idWrapper[key];
          if (idEl && typeof idEl === 'object') {
            // Check for empty identifier
            const hasChildren = Object.keys(idEl).some(k => !k.startsWith('@_') && k !== '#text');
            if (!hasChildren) return false;
            // Check all properties are valid
            for (const prop of Object.keys(idEl)) {
              if (prop.startsWith('@_') || prop === '#text') continue;
              if (!validProps.includes(prop)) return false;
            }
          }
        }
      }
      return true;
    },
    level: 'ERROR',
    message: 'At least one Hub Identifier does not contain a status, value, assigner, note or qualifier property or there is an empty Identifier resource. This should not be.'
  },
  {
    name: 'hub-empty-elements',
    check: (hub) => !hasEmptyElements(hub),
    level: 'WARNING',
    message: 'At least one Hub element is null (i.e. empty) or missing children/subelements or links (i.e. @rdf:resource or @rdf:about).'
  }
];

// ============================================
// INSTANCE VALIDATION RULES
// ============================================

const INSTANCE_RULES = [
  {
    name: 'instance-provision-activity-date',
    check: (instance) => {
      // XQuery: exists($I/bf:provisionActivity) and not(exists($PA//bf:date[@rdf:datatype="http://id.loc.gov/datatypes/edtf"]))
      // Returns false (fail) if provisionActivity exists but no EDTF date found anywhere
      const pas = ensureArray(instance['bf:provisionActivity']);
      if (pas.length === 0) return true; // No provisionActivity = pass

      // Search recursively for bf:date with EDTF datatype
      const findEdtfDate = (obj) => {
        if (!obj || typeof obj !== 'object') return false;
        // Check if this is a bf:date with EDTF datatype
        if (obj['@_rdf:datatype'] === 'http://id.loc.gov/datatypes/edtf') return true;
        // Check bf:date children
        const dates = ensureArray(obj['bf:date']);
        for (const d of dates) {
          if (d && d['@_rdf:datatype'] === 'http://id.loc.gov/datatypes/edtf') return true;
        }
        // Recurse into children
        for (const key of Object.keys(obj)) {
          if (key.startsWith('@_')) continue;
          if (findEdtfDate(obj[key])) return true;
        }
        return false;
      };

      for (const pa of pas) {
        if (findEdtfDate(pa)) return true;
      }
      return false;
    },
    level: 'WARNING',
    message: 'MARC issue. Possible provision activity anomaly: Missing aspects for a proper 008 date. Check **Provision activity**'
  },
  {
    name: 'instance-provision-activity-place',
    check: (instance) => {
      // XQuery: exists($I/bf:provisionActivity) and not(exists($PA/bf:*/bf:place[@rdf:resource]) or exists($PA/bf:*/bf:place/bf:*/@rdf:about))
      // Returns false (fail) if provisionActivity exists but no place with @rdf:resource or child with @rdf:about
      const pas = ensureArray(instance['bf:provisionActivity']);
      if (pas.length === 0) return true; // No provisionActivity = pass

      for (const paWrapper of pas) {
        // Get the bf:* child (Publication, Distribution, etc.)
        for (const key of Object.keys(paWrapper)) {
          if (key.startsWith('@_') || key === '#text') continue;
          const pa = paWrapper[key];
          if (!pa || typeof pa !== 'object') continue;

          const places = ensureArray(pa['bf:place']);
          for (const place of places) {
            // Check @rdf:resource on place itself
            if (place['@_rdf:resource']) return true;
            // Check @rdf:about on any child element (bf:* wildcard)
            if (place && typeof place === 'object') {
              for (const childKey of Object.keys(place)) {
                if (childKey.startsWith('@_')) continue;
                const child = place[childKey];
                if (child && child['@_rdf:about']) return true;
              }
            }
          }
        }
      }
      return false;
    },
    level: 'WARNING',
    message: 'MARC issue. Possible provision activity anomaly: Missing aspects for a proper 008 place. Check **Provision activity**'
  },
  {
    name: 'instance-encoding-level-pcc',
    check: (instance) => {
      const adminMeta = instance['bf:adminMetadata'];
      if (!adminMeta) return true;
      const admin = adminMeta['bf:AdminMetadata'] || adminMeta;
      const encodingLevel = admin['bflc:encodingLevel'];
      const encodingUri = getUri(encodingLevel) || getUri(encodingLevel?.['bflc:EncodingLevel']);
      const isMinimal = encodingUri === 'http://id.loc.gov/vocabulary/menclvl/7';

      const descAuth = ensureArray(admin['bf:descriptionAuthentication']);
      const hasPcc = descAuth.some(da => {
        const uri = getUri(da) || getUri(da?.['bf:DescriptionAuthentication']);
        return uri && uri.includes('http://id.loc.gov/vocabulary/marcauthen/pcc');
      });

      return !(isMinimal && hasPcc);
    },
    level: 'WARNING',
    message: "Possible anomaly: Encoding level is 'minimal' but 'Description Authentication' includes 'PCC'."
  },
  {
    name: 'instance-no-place-with-value',
    check: (instance) => {
      const pas = ensureArray(instance['bf:provisionActivity']);
      for (const paWrapper of pas) {
        for (const key of Object.keys(paWrapper)) {
          if (key.startsWith('@_')) continue;
          const pa = paWrapper[key] || paWrapper;
          const places = ensureArray(pa['bf:place']);
          const simplePlaces = ensureArray(pa['bflc:simplePlace']);

          const hasNoPlace = places.some(p => {
            const placeEl = p['bf:Place'] || p;
            const uri = getUri(placeEl);
            return uri && uri.includes('/countries/xx');
          });

          const hasSimplePlace = simplePlaces.some(sp => getText(sp).trim() !== '');

          if (hasNoPlace && hasSimplePlace) return false;
        }
      }
      return true;
    },
    level: 'WARNING',
    message: "Possible anomaly: 'No place' is selected as Place of Publication for the fixed field, but a value is given for Place. Check **Provision activity**"
  },
  {
    name: 'instance-projected-pub-date',
    check: (instance) => {
      // Search through all bf:adminMetadata elements to find encoding level
      const adminMetas = ensureArray(instance['bf:adminMetadata']);
      let encodingUri = null;

      for (const adminMeta of adminMetas) {
        const admin = adminMeta?.['bf:AdminMetadata'] || adminMeta;
        const encodingLevel = admin?.['bflc:encodingLevel'];
        const uri = getUri(encodingLevel) || getUri(encodingLevel?.['bflc:EncodingLevel']);
        if (uri) {
          encodingUri = uri;
          break;
        }
      }

      const isPrepub = encodingUri === 'http://id.loc.gov/vocabulary/menclvl/8';

      const projectedDate = instance['bflc:projectedProvisionDate'];
      const hasProjectedDate = projectedDate && getText(projectedDate).trim() !== '';

      // prepub without projected date
      if (isPrepub && !hasProjectedDate) return false;
      // has projected date but not prepub
      if (hasProjectedDate && !isPrepub && encodingUri) return false;
      // has projected date but no encoding level
      if (hasProjectedDate && !encodingUri) return false;

      return true;
    },
    level: 'WARNING',
    message: "Possible anomaly: Projected Publication Date is set but does not align with encoding level OR encoding level is 'prepublication' and there is no project pub date."
  },
  {
    name: 'instance-provision-activity-type',
    check: (instance) => {
      const validTypes = ['bf:ProvisionActivity', 'bf:Publication', 'bf:Distribution', 'bf:Manufacture', 'bf:Modification', 'bf:Production'];
      const validTypeUris = validTypes.map(t => `http://id.loc.gov/ontologies/bibframe/${t.replace('bf:', '')}`);

      const pas = ensureArray(instance['bf:provisionActivity']);
      for (const paWrapper of pas) {
        for (const key of Object.keys(paWrapper)) {
          if (key.startsWith('@_') || key === '#text') continue;
          if (!validTypes.includes(key)) {
            // Check if it's a ProvisionActivity with rdf:type
            const pa = paWrapper[key];
            if (key === 'bf:ProvisionActivity' && pa) {
              const rdfTypes = ensureArray(pa['rdf:type']);
              for (const rt of rdfTypes) {
                const typeUri = rt['@_rdf:resource'];
                if (typeUri && !validTypeUris.includes(typeUri)) return false;
              }
            } else if (!validTypes.includes(key)) {
              return false;
            }
          }
        }
      }
      return true;
    },
    level: 'WARNING',
    message: 'Possible provision activity anomaly: only ProvisionActivity, Publication, Distribution, Manufacture, Modification, Production used. Check **Provision activity**'
  },
  {
    name: 'instance-provision-activity-264',
    check: (instance) => {
      // XQuery: exists($I/bf:provisionActivity) and not(
      //   exists($PA/bf:*/bflc:simpleAgent) or
      //   exists($PA/bf:*/bf:agent/bf:*[not(@rdf:about)]/rdfs:label) or
      //   exists($PA/bf:*/bflc:simplePlace) or
      //   exists($PA/bf:*/bf:place/bf:*[not(@rdf:about)]/rdfs:label) or
      //   exists($PA/bf:*/bflc:simpleDate) or
      //   exists($PA/bf:*/bf:date[not(@rdf:datatype)])
      // )
      const pas = ensureArray(instance['bf:provisionActivity']);
      if (pas.length === 0) return true;

      for (const paWrapper of pas) {
        // Get the bf:* child (Publication, Distribution, etc.)
        for (const key of Object.keys(paWrapper)) {
          if (key.startsWith('@_') || key === '#text') continue;
          if (!key.startsWith('bf:')) continue;
          const pa = paWrapper[key];
          if (!pa || typeof pa !== 'object') continue;

          // Check for simple* properties
          if (pa['bflc:simpleAgent'] || pa['bflc:simplePlace'] || pa['bflc:simpleDate']) return true;

          // Check for bf:agent/bf:*[not(@rdf:about)]/rdfs:label
          const agents = ensureArray(pa['bf:agent']);
          for (const agentWrapper of agents) {
            // Iterate bf:* children inside agent
            for (const agentKey of Object.keys(agentWrapper)) {
              if (agentKey.startsWith('@_') || agentKey === '#text') continue;
              if (!agentKey.startsWith('bf:')) continue;
              const agentEl = agentWrapper[agentKey];
              if (agentEl && typeof agentEl === 'object' && !agentEl['@_rdf:about'] && agentEl['rdfs:label']) {
                return true;
              }
            }
          }

          // Check for bf:place/bf:*[not(@rdf:about)]/rdfs:label
          const places = ensureArray(pa['bf:place']);
          for (const placeWrapper of places) {
            for (const placeKey of Object.keys(placeWrapper)) {
              if (placeKey.startsWith('@_') || placeKey === '#text') continue;
              if (!placeKey.startsWith('bf:')) continue;
              const placeEl = placeWrapper[placeKey];
              if (placeEl && typeof placeEl === 'object' && !placeEl['@_rdf:about'] && placeEl['rdfs:label']) {
                return true;
              }
            }
          }

          // Check for bf:date[not(@rdf:datatype)]
          const dates = ensureArray(pa['bf:date']);
          for (const date of dates) {
            if (date && !date['@_rdf:datatype']) return true;
          }
        }
      }
      return false;
    },
    level: 'WARNING',
    message: 'Possible provision activity anomaly: Missing aspects for a proper 264. Check **Provision activity**'
  },
  {
    name: 'instance-provision-activity-properties',
    check: (instance) => {
      // XQuery: $PA/bf:*/*[not(local-name() = ('simplePlace', 'simpleDate', 'simpleAgent', 'date', 'place', 'agent', 'note', 'type', 'appliesTo'))]
      const validProps = ['bflc:simplePlace', 'bflc:simpleDate', 'bflc:simpleAgent', 'bf:date', 'bf:place', 'bf:agent', 'bf:note', 'rdf:type', 'bflc:appliesTo'];
      const pas = ensureArray(instance['bf:provisionActivity']);

      for (const paWrapper of pas) {
        // Iterate bf:* children
        for (const key of Object.keys(paWrapper)) {
          if (key.startsWith('@_') || key === '#text') continue;
          if (!key.startsWith('bf:')) continue;
          const pa = paWrapper[key];
          if (pa && typeof pa === 'object') {
            for (const prop of Object.keys(pa)) {
              if (prop.startsWith('@_') || prop === '#text') continue;
              if (!validProps.includes(prop)) return false;
            }
          }
        }
      }
      return true;
    },
    level: 'WARNING',
    message: 'ProvisionActivity has something other than simplePlace, simpleDate, simpleAgent, EDTF date, place, agent, note, rdf:type, or appliesTo. This may be a problem.'
  },
  {
    name: 'instance-copyright-date-empty',
    check: (instance) => {
      const copyrightDate = instance['bf:copyrightDate'];
      if (!copyrightDate) return true;
      return getText(copyrightDate).trim() !== '';
    },
    level: 'WARNING',
    message: 'bf:copyrightDate property exists but no data.'
  },
  {
    name: 'instance-media',
    check: (instance) => !!instance['bf:media'],
    level: 'WARNING',
    message: 'RDA alert. Missing Media. Check **Media type**'
  },
  {
    name: 'instance-carrier',
    check: (instance) => !!instance['bf:carrier'],
    level: 'WARNING',
    message: 'RDA alert. Missing Carrier. Check **Carrier type**'
  },
  {
    name: 'instance-empty-elements',
    check: (instance) => !hasEmptyElements(instance),
    level: 'ERROR',
    message: 'At least one Instance element is null (i.e. empty) or missing children/subelements or links (i.e. rdf:resource or rdf:about).'
  },
  {
    name: 'instance-contribution-properties',
    check: (instance) => {
      // XQuery: $C/bf:*/*[not(local-name() = ('agent', 'role', 'note', 'type'))]
      // Check properties inside the bf:* child (Contribution, PrimaryContribution, etc.)
      const validProps = ['bf:agent', 'bf:role', 'bf:note', 'rdf:type'];
      const contributions = ensureArray(instance['bf:contribution']);

      for (const contribWrapper of contributions) {
        // Iterate bf:* children (any bf: prefixed contribution type)
        for (const key of Object.keys(contribWrapper)) {
          if (key.startsWith('@_') || key === '#text') continue;
          if (!key.startsWith('bf:')) continue;
          const contrib = contribWrapper[key];
          if (contrib && typeof contrib === 'object') {
            for (const prop of Object.keys(contrib)) {
              if (prop.startsWith('@_') || prop === '#text') continue;
              if (!validProps.includes(prop)) return false;
            }
          }
        }
      }
      return true;
    },
    level: 'ERROR',
    message: 'A Contribution has something other than agent, role, note, or rdf:type properties. This is not correct.'
  },
  {
    name: 'instance-contribution-one-agent',
    check: (instance) => {
      // XQuery: count($C/bf:*/bf:agent) > 1
      // Count bf:agent inside the contribution type element
      const contributions = ensureArray(instance['bf:contribution']);
      for (const contribWrapper of contributions) {
        let agentCount = 0;
        // Iterate bf:* children
        for (const key of Object.keys(contribWrapper)) {
          if (key.startsWith('@_') || key === '#text') continue;
          if (!key.startsWith('bf:')) continue;
          const contrib = contribWrapper[key];
          if (contrib && typeof contrib === 'object') {
            agentCount += ensureArray(contrib['bf:agent']).length;
          }
        }
        if (agentCount > 1) return false;
      }
      return true;
    },
    level: 'ERROR',
    message: 'At least one Contribution has more than one Agent. This is not correct.'
  },
  {
    name: 'instance-extent',
    check: (instance) => {
      const extents = ensureArray(instance['bf:extent']);
      if (extents.length === 0) return false;
      for (const ext of extents) {
        const extentEl = ext['bf:Extent'] || ext;
        const label = extentEl['rdfs:label'];
        if (label && getText(label).trim() !== '') return true;
      }
      return false;
    },
    level: 'WARNING',
    message: 'No Extent. Check **Extent**'
  },
  {
    name: 'instance-lccn',
    check: (instance) => {
      // XQuery: not(exists($I/bf:identifiedBy/bf:Lccn/rdf:value))
      // Check for bf:Lccn with rdf:value
      const identifiers = ensureArray(instance['bf:identifiedBy']);
      for (const idWrapper of identifiers) {
        // Check for bf:Lccn directly
        if (idWrapper['bf:Lccn']) {
          const lccn = idWrapper['bf:Lccn'];
          if (lccn['rdf:value']) return true;
        }
      }
      return false;
    },
    level: 'WARNING',
    message: 'No LCCN. Check **Identifiers**'
  },
  {
    name: 'instance-one-lccn',
    check: (instance) => {
      // XQuery: count($I/bf:identifiedBy/bf:Lccn[not(bf:status)]) > 1
      // Count bf:Lccn without bf:status (valid/current LCCNs)
      const identifiers = ensureArray(instance['bf:identifiedBy']);
      let validLccnCount = 0;

      for (const idWrapper of identifiers) {
        if (idWrapper['bf:Lccn']) {
          const lccn = idWrapper['bf:Lccn'];
          if (!lccn['bf:status']) validLccnCount++;
        }
      }
      return validLccnCount <= 1;
    },
    level: 'ERROR',
    message: 'Only one valid LCCN per Instance. Delete an LCCN from **Identifiers**'
  },
  {
    name: 'instance-empty-notes',
    check: (instance) => {
      const notes = ensureArray(instance['bf:note']);
      for (const note of notes) {
        const noteEl = note['bf:Note'] || note;
        if (!noteEl['rdfs:label']) return false;
        const label = getText(noteEl['rdfs:label']);
        if (label === '') return false;
      }
      return true;
    },
    level: 'WARNING',
    message: 'Empty Notes found. Notes should not be empty.'
  },
  {
    name: 'instance-empty-supplementary-content',
    check: (instance) => {
      const supps = ensureArray(instance['bf:supplementaryContent']);
      for (const supp of supps) {
        const suppEl = supp['bf:SupplementaryContent'] || supp;
        const label = suppEl['rdfs:label'];
        if (!label) {
          const noteEl = suppEl['bf:note']?.['bf:Note'];
          if (!noteEl || !noteEl['rdfs:label']) return false;
        } else if (getText(label) === '') {
          return false;
        }
      }
      return true;
    },
    level: 'WARNING',
    message: 'Empty **Supplementary Content**'
  },
  {
    name: 'instance-title',
    check: (instance) => {
      const titles = ensureArray(instance['bf:title']);
      for (const titleWrapper of titles) {
        const title = titleWrapper['bf:Title'] || titleWrapper;
        if (title['bf:mainTitle']) return true;
      }
      return false;
    },
    level: 'WARNING',
    message: "No Instance Title! How can this be possible? This is a serious - SERIOUS!! - violation of holy RDA!. Add **Title information** to the @Instance@"
  },
  {
    name: 'instance-one-main-title',
    check: (instance) => {
      const titles = ensureArray(instance['bf:title']);
      let mainTitleCount = 0;
      for (const titleWrapper of titles) {
        const title = titleWrapper['bf:Title'] || titleWrapper;
        if (title['bf:mainTitle']) mainTitleCount++;
      }
      return mainTitleCount <= 1;
    },
    level: 'ERROR',
    message: "More than one 'main' Instance Title. Remove a **Title information** from the @Instance@"
  },
  {
    name: 'instance-identifier-value',
    check: (instance) => {
      // XQuery: exists($I/bf:identifiedBy/bf:*[not(rdf:value) or fn:normalize-space(rdf:value) = ''])
      // Check that all identifiers (bf:* children) have rdf:value with content
      const identifiers = ensureArray(instance['bf:identifiedBy']);
      for (const idWrapper of identifiers) {
        // Iterate bf:* children (any element starting with bf:)
        for (const key of Object.keys(idWrapper)) {
          if (key.startsWith('@_') || key === '#text') continue;
          // Accept any bf: prefixed element as an identifier type
          if (!key.startsWith('bf:')) continue;
          const id = idWrapper[key];
          if (id && typeof id === 'object') {
            const value = id['rdf:value'];
            if (!value || getText(value).trim() === '') return false;
          }
        }
      }
      return true;
    },
    level: 'ERROR',
    message: 'Identifier without a value!'
  },
  {
    name: 'instance-identifier-properties',
    check: (instance) => {
      // XQuery checks that identifiers only contain: bf:status, rdf:value, bf:assigner, bf:note, bf:source, bf:qualifier, bf:acquisitionTerms
      // Also checks for empty identifier resources
      const identifiers = ensureArray(instance['bf:identifiedBy']);
      const validProps = ['bf:status', 'rdf:value', 'bf:assigner', 'bf:note', 'bf:source', 'bf:qualifier', 'bf:acquisitionTerms', 'rdf:type'];
      for (const idWrapper of identifiers) {
        // Iterate bf:* children
        for (const key of Object.keys(idWrapper)) {
          if (key.startsWith('@_') || key === '#text') continue;
          if (!key.startsWith('bf:')) continue;
          const idEl = idWrapper[key];
          if (idEl && typeof idEl === 'object') {
            // Check for empty identifier (no children except attributes)
            const hasChildren = Object.keys(idEl).some(k => !k.startsWith('@_') && k !== '#text');
            if (!hasChildren) return false;
            // Check all properties are valid
            for (const prop of Object.keys(idEl)) {
              if (prop.startsWith('@_') || prop === '#text') continue;
              if (!validProps.includes(prop)) return false;
            }
          }
        }
      }
      return true;
    },
    level: 'WARNING',
    message: 'At least one Instance Identifier does not contain a status, value, assigner, note, source or qualifier property or there is an empty Identifier resource. This should not be.'
  },
  {
    name: 'instance-placeholder',
    check: (instance) => !containsPlaceholder(instance),
    level: 'ERROR',
    message: "There's a placeholder (<#####>) value somewhere in the Instance."
  }
];

// ============================================
// ITEM VALIDATION RULES
// ============================================

const ITEM_RULES = [
  {
    name: 'item-empty-elements',
    check: (item) => !hasEmptyElements(item),
    level: 'WARNING',
    message: 'At least one Item element is null (i.e. empty) or missing children/subelements or links (i.e. @rdf:resource or @rdf:about).'
  },
  {
    name: 'item-empty-immediate-acquisition',
    check: (item) => {
      const acqs = ensureArray(item['bf:immediateAcquisition']);
      for (const acq of acqs) {
        const acqEl = acq['bf:ImmediateAcquisition'] || acq;
        if (!acqEl['rdfs:label']) return false;
        if (getText(acqEl['rdfs:label']) === '') return false;
      }
      return true;
    },
    level: 'WARNING',
    message: 'Empty Immediate Acquistion (Item)'
  },
  {
    name: 'item-identifier-properties',
    check: (item) => {
      // XQuery checks identifiers for valid props
      const identifiers = ensureArray(item['bf:identifiedBy']);
      const validProps = ['bf:status', 'rdf:value', 'bf:assigner', 'bf:note', 'bf:qualifier', 'rdf:type'];
      for (const idWrapper of identifiers) {
        // Iterate bf:* children
        for (const key of Object.keys(idWrapper)) {
          if (key.startsWith('@_') || key === '#text') continue;
          if (!key.startsWith('bf:')) continue;
          const idEl = idWrapper[key];
          if (idEl && typeof idEl === 'object') {
            // Check for empty identifier
            const hasChildren = Object.keys(idEl).some(k => !k.startsWith('@_') && k !== '#text');
            if (!hasChildren) return false;
            // Check all properties are valid
            for (const prop of Object.keys(idEl)) {
              if (prop.startsWith('@_') || prop === '#text') continue;
              if (!validProps.includes(prop)) return false;
            }
          }
        }
      }
      return true;
    },
    level: 'WARNING',
    message: 'At least one Item Identifier does not contain a status, value, assigner, note or qualifier property or there is an empty Identifier resource. This should not be.'
  }
];

// ============================================
// WORK VALIDATION RULES
// ============================================

const WORK_RULES = [
  {
    name: 'work-empty-elements',
    check: (work) => !hasEmptyElements(work),
    level: 'WARNING',
    message: 'At least one Work element is null (i.e. empty) or missing children/subelements or links (i.e. @rdf:resource or @rdf:about).'
  },
  {
    name: 'work-title-mainTitle',
    check: (work) => {
      const titles = ensureArray(work['bf:title']);
      for (const titleWrapper of titles) {
        for (const key of Object.keys(titleWrapper)) {
          if (key.startsWith('@_')) continue;
          const title = titleWrapper[key];
          if (title && typeof title === 'object' && !title['bf:mainTitle']) {
            return false;
          }
        }
      }
      return true;
    },
    level: 'WARNING',
    message: "Work Title issue: A Title resource is missing a mainTitle property. Check 'Preferred title for Work' in **Title information** in the @Work@"
  },
  {
    name: 'work-title-exists',
    check: (work) => {
      const titles = ensureArray(work['bf:title']);
      for (const titleWrapper of titles) {
        const title = titleWrapper['bf:Title'] || titleWrapper;
        if (title['bf:mainTitle']) return true;
      }
      return false;
    },
    level: 'WARNING',
    message: "No Work/Expression Title. This might be OK. Why should a Work/Expression have or need a title? It's not important in RDA. Check the **Title information** in the @Work@"
  },
  {
    name: 'work-title-empty',
    check: (work) => {
      const titles = ensureArray(work['bf:title']);
      for (const titleWrapper of titles) {
        const title = titleWrapper['bf:Title'] || titleWrapper;
        const mainTitle = title['bf:mainTitle'];
        if (mainTitle && getText(mainTitle) === '') return false;
      }
      return true;
    },
    level: 'WARNING',
    message: 'Work/Expression Title is empty. Check the **Title information** in the @Work@'
  },
  {
    name: 'work-one-title',
    check: (work) => {
      const titles = ensureArray(work['bf:title']);
      let mainTitleCount = 0;
      for (const titleWrapper of titles) {
        const title = titleWrapper['bf:Title'] || titleWrapper;
        if (title['bf:mainTitle']) mainTitleCount++;
      }
      return mainTitleCount <= 1;
    },
    level: 'ERROR',
    message: 'More than one Work Title resource. Check the **Title information** in the @Work@'
  },
  {
    name: 'work-one-primary-contribution',
    check: (work) => {
      // XQuery: count($W/bf:contribution/bf:PrimaryContribution) > 1
      // Only count bf:PrimaryContribution elements directly
      const contributions = ensureArray(work['bf:contribution']);
      let primaryCount = 0;
      for (const contribWrapper of contributions) {
        if (contribWrapper['bf:PrimaryContribution']) primaryCount++;
      }
      return primaryCount <= 1;
    },
    level: 'ERROR',
    message: 'More than one Primary contribution found. There should only be one. Delete a **Creator of Work**'
  },
  {
    name: 'work-contribution-properties',
    check: (work) => {
      // XQuery: $C/bf:*/*[not(local-name() = ('agent', 'role', 'note', 'type'))]
      const validProps = ['bf:agent', 'bf:role', 'bf:note', 'rdf:type'];
      const contributions = ensureArray(work['bf:contribution']);

      for (const contribWrapper of contributions) {
        // Iterate bf:* children
        for (const key of Object.keys(contribWrapper)) {
          if (key.startsWith('@_') || key === '#text') continue;
          if (!key.startsWith('bf:')) continue;
          const contrib = contribWrapper[key];
          if (contrib && typeof contrib === 'object') {
            for (const prop of Object.keys(contrib)) {
              if (prop.startsWith('@_') || prop === '#text') continue;
              if (!validProps.includes(prop)) return false;
            }
          }
        }
      }
      return true;
    },
    level: 'ERROR',
    message: 'A Contribution contains something other than agent, role, note, and rdf:type properties. This should not be.'
  },
  {
    name: 'work-contribution-one-agent',
    check: (work) => {
      // XQuery: count($C/bf:*/bf:agent) > 1
      const contributions = ensureArray(work['bf:contribution']);
      for (const contribWrapper of contributions) {
        let agentCount = 0;
        // Iterate bf:* children
        for (const key of Object.keys(contribWrapper)) {
          if (key.startsWith('@_') || key === '#text') continue;
          if (!key.startsWith('bf:')) continue;
          const contrib = contribWrapper[key];
          if (contrib && typeof contrib === 'object') {
            agentCount += ensureArray(contrib['bf:agent']).length;
          }
        }
        if (agentCount > 1) return false;
      }
      return true;
    },
    level: 'ERROR',
    message: 'Contribution resource with more than one agent found. There should only be one Agent per Contribution.'
  },
  {
    name: 'work-language',
    check: (work) => !!work['bf:language'],
    level: 'WARNING',
    message: 'Missing language for overall content.'
  },
  {
    name: 'work-marc-language',
    check: (work) => {
      const languages = ensureArray(work['bf:language']);
      for (const lang of languages) {
        const uri = getUri(lang);
        if (uri && uri.includes('vocabulary/languages/')) return true;
        const langEl = lang['bf:Language'] || lang;
        const langUri = getUri(langEl);
        if (langUri && langUri.includes('vocabulary/languages/')) return true;
      }
      return languages.length === 0;
    },
    level: 'WARNING',
    message: 'Missing MARC language for overall content.'
  },
  {
    name: 'work-content',
    check: (work) => !!work['bf:content'],
    level: 'WARNING',
    message: 'RDA alert. Missing Content. Check **Content type**'
  },
  {
    name: 'work-one-issn',
    check: (work) => {
      // XQuery: count($W/bf:identifiedBy/bf:Issn[not(bf:status)]) > 1
      // Count bf:Issn without bf:status (valid/current ISSNs)
      const identifiers = ensureArray(work['bf:identifiedBy']);
      let validIssnCount = 0;

      for (const idWrapper of identifiers) {
        if (idWrapper['bf:Issn']) {
          const issn = idWrapper['bf:Issn'];
          if (!issn['bf:status']) validIssnCount++;
        }
      }
      return validIssnCount <= 1;
    },
    level: 'ERROR',
    message: 'More than one valid/current ISSN found. There should only be one per Work.'
  },
  {
    name: 'work-identifier-properties',
    check: (work) => {
      // XQuery checks identifiers for valid props: bf:status, rdf:value, bf:assigner, bf:note, bf:qualifier
      const identifiers = ensureArray(work['bf:identifiedBy']);
      const validProps = ['bf:status', 'rdf:value', 'bf:assigner', 'bf:note', 'bf:qualifier', 'rdf:type'];
      for (const idWrapper of identifiers) {
        // Iterate bf:* children
        for (const key of Object.keys(idWrapper)) {
          if (key.startsWith('@_') || key === '#text') continue;
          if (!key.startsWith('bf:')) continue;
          const idEl = idWrapper[key];
          if (idEl && typeof idEl === 'object') {
            // Check for empty identifier
            const hasChildren = Object.keys(idEl).some(k => !k.startsWith('@_') && k !== '#text');
            if (!hasChildren) return false;
            // Check all properties are valid
            for (const prop of Object.keys(idEl)) {
              if (prop.startsWith('@_') || prop === '#text') continue;
              if (!validProps.includes(prop)) return false;
            }
          }
        }
      }
      return true;
    },
    level: 'ERROR',
    message: 'At least one Work Identifier does not contain a status, value, assigner, note or qualifier property or there is an empty Identifier resource. This should not be.'
  },
  {
    name: 'work-lcc',
    check: (work) => {
      // XQuery: not(exists($W/bf:classification/bf:ClassificationLcc))
      const classifications = ensureArray(work['bf:classification']);
      for (const cls of classifications) {
        if (cls['bf:ClassificationLcc']) return true;
      }
      return false;
    },
    level: 'WARNING',
    message: 'No LCC number found. Check **Classification numbers**'
  },
  {
    name: 'work-classification-portion',
    check: (work) => {
      // XQuery: exists($W/bf:classification/bf:*[not(bf:classificationPortion)])
      // Check that all classification types have classificationPortion
      const classifications = ensureArray(work['bf:classification']);
      for (const clsWrapper of classifications) {
        // Iterate bf:* children (any classification type)
        for (const key of Object.keys(clsWrapper)) {
          if (key.startsWith('@_') || key === '#text') continue;
          if (!key.startsWith('bf:')) continue;
          const cls = clsWrapper[key];
          if (cls && typeof cls === 'object' && !cls['bf:classificationPortion']) {
            return false;
          }
        }
      }
      return true;
    },
    level: 'WARNING',
    message: 'A classification number is missing. Check **Classification numbers**'
  },
  {
    name: 'work-lcc-item-portion',
    check: (work) => {
      // XQuery: exists($W/bf:classification/bf:ClassificationLcc[not(bf:itemPortion) and not(fn:starts-with(bf:classificationPortion, 'MLC'))])
      const classifications = ensureArray(work['bf:classification']);
      for (const clsWrapper of classifications) {
        const lcc = clsWrapper['bf:ClassificationLcc'];
        if (lcc) {
          const classPortion = getText(lcc['bf:classificationPortion']);
          if (!lcc['bf:itemPortion'] && !classPortion.startsWith('MLC')) {
            return false;
          }
        }
      }
      return true;
    },
    level: 'WARNING',
    message: "LCC missing item portion. Check **Classification numbers** for 'Additional call number information'"
  },
  {
    name: 'work-lcc-assigner',
    check: (work) => {
      const classifications = ensureArray(work['bf:classification']);
      for (const clsWrapper of classifications) {
        const lcc = clsWrapper['bf:ClassificationLcc'];
        if (lcc) {
          const assigner = lcc['bf:assigner'];
          if (!assigner) return false;
          // Check @rdf:resource on assigner, or @rdf:about on any bf:* child
          let assignerUri = assigner['@_rdf:resource'];
          if (!assignerUri) {
            // Check any child element for @rdf:about (bf:* wildcard)
            for (const key of Object.keys(assigner)) {
              if (key.startsWith('@_')) continue;
              const child = assigner[key];
              if (child && child['@_rdf:about']) {
                assignerUri = child['@_rdf:about'];
                break;
              }
            }
          }
          if (assignerUri !== 'http://id.loc.gov/vocabulary/organizations/dlc') return false;
        }
      }
      return true;
    },
    level: 'INFO',
    message: 'There is an LCC entry missing bf:assigner, indicating it was not assigned by LC. Check **Classification numbers**'
  },
  {
    name: 'work-placeholder',
    check: (work) => !containsPlaceholder(work),
    level: 'ERROR',
    message: "There's a placeholder (<#####>) value somewhere in the Work."
  }
];

/**
 * Run validation rules against an element
 */
function runRules(element, rules, uri) {
  const messages = [];

  for (const rule of rules) {
    try {
      const passed = rule.check(element);
      if (!passed) {
        messages.push({
          level: rule.level,
          message: rule.message,
          uri: uri || 'unknown'
        });
      }
    } catch (err) {
      // Rule check failed - skip silently
    }
  }

  return messages;
}

/**
 * Run cross-resource validation (Work/Instance consistency checks)
 */
function runCrossValidation(rdf, messages) {
  const works = ensureArray(rdf['bf:Work']);
  const instances = ensureArray(rdf['bf:Instance']);

  for (const work of works) {
    const workUri = getUri(work);

    // Check Work has illustrative content but Instance notes don't mention it
    const illContents = ensureArray(work['bf:illustrativeContent']);
    for (const illWrapper of illContents) {
      const ill = illWrapper['bf:Illustration'] || illWrapper;
      const illUri = getUri(ill);
      if (illUri && illUri.includes('http://id.loc.gov/vocabulary/millus/')) {
        const expectedText = ILLUSTRATIVE_CONTENT_MAP[illUri];
        if (expectedText) {
          let foundInInstance = false;
          for (const instance of instances) {
            const noteLabels = getNoteLabels(instance);
            if (noteLabels.some(label => label.includes(expectedText))) {
              foundInInstance = true;
              break;
            }
          }
          if (!foundInInstance) {
            messages.push({
              level: 'WARNING',
              message: `Work has Illustrative Content, but it is missing in the @Instance@'s' '**Notes about the Instance**'`,
              uri: workUri
            });
          }
        }
      }
    }

    // Check Work has supplementary content = bibliography
    const suppContents = ensureArray(work['bf:supplementaryContent']);
    const hasBibliography = suppContents.some(sc => {
      const scEl = sc['bf:SupplementaryContent'] || sc;
      return getUri(scEl) === 'http://id.loc.gov/vocabulary/msupplcont/bibliography';
    });
    if (hasBibliography) {
      let foundBibInInstance = false;
      for (const instance of instances) {
        const noteLabels = getNoteLabels(instance);
        if (noteLabels.some(label => label.includes('bibliograph'))) {
          foundBibInInstance = true;
          break;
        }
      }
      if (!foundBibInInstance) {
        messages.push({
          level: 'WARNING',
          message: `Work has Supplementary Content = 'bibliography', but it is missing in the @Instance@'s' '**Notes about the Instance**'`,
          uri: workUri
        });
      }
    }

    // Check Work has supplementary content = index
    const hasIndex = suppContents.some(sc => {
      const scEl = sc['bf:SupplementaryContent'] || sc;
      return getUri(scEl) === 'http://id.loc.gov/vocabulary/msupplcont/index';
    });
    if (hasIndex) {
      let foundIndexInInstance = false;
      for (const instance of instances) {
        const noteLabels = getNoteLabels(instance);
        if (noteLabels.some(label => label.includes('index'))) {
          foundIndexInInstance = true;
          break;
        }
      }
      if (!foundIndexInInstance) {
        messages.push({
          level: 'WARNING',
          message: `Work has Supplementary Content = 'index', but it is missing in the @Instance@'s' '**Notes about the Instance**'`,
          uri: workUri
        });
      }
    }
  }

  // Reverse checks: Instance has notes but Work missing content
  for (const instance of instances) {
    const instanceUri = getUri(instance);
    const noteLabels = getNoteLabels(instance);

    // Check if instance mentions illustration but work doesn't have illustrative content
    const hasIllNote = noteLabels.some(label => {
      return Object.values(ILLUSTRATIVE_CONTENT_MAP).some(text => label.includes(text));
    });
    if (hasIllNote) {
      let workHasIll = false;
      for (const work of works) {
        const illContents = ensureArray(work['bf:illustrativeContent']);
        if (illContents.some(ic => {
          const ill = ic['bf:Illustration'] || ic;
          const uri = getUri(ill);
          return uri && uri.includes('http://id.loc.gov/vocabulary/millus/');
        })) {
          workHasIll = true;
          break;
        }
      }
      if (!workHasIll) {
        messages.push({
          level: 'WARNING',
          message: `Instance has 'Illustration' in 'Notes about the Instance,' but the Work is missing **Illustrative Content**`,
          uri: instanceUri
        });
      }
    }

    // Check if instance mentions bibliography but work doesn't have it
    if (noteLabels.some(label => label.includes('bibliograph'))) {
      let workHasBib = false;
      for (const work of works) {
        const suppContents = ensureArray(work['bf:supplementaryContent']);
        if (suppContents.some(sc => {
          const scEl = sc['bf:SupplementaryContent'] || sc;
          return getUri(scEl) === 'http://id.loc.gov/vocabulary/msupplcont/bibliography';
        })) {
          workHasBib = true;
          break;
        }
      }
      if (!workHasBib) {
        messages.push({
          level: 'WARNING',
          message: `Instance has 'Bibliography' in 'Notes about the Instance,' but the Work is missing **Supplementary Content** = Bibliography`,
          uri: instanceUri
        });
      }
    }

    // Check if instance mentions index but work doesn't have it
    if (noteLabels.some(label => label.includes('index'))) {
      let workHasIndex = false;
      for (const work of works) {
        const suppContents = ensureArray(work['bf:supplementaryContent']);
        if (suppContents.some(sc => {
          const scEl = sc['bf:SupplementaryContent'] || sc;
          return getUri(scEl) === 'http://id.loc.gov/vocabulary/msupplcont/index';
        })) {
          workHasIndex = true;
          break;
        }
      }
      if (!workHasIndex) {
        messages.push({
          level: 'WARNING',
          message: `Instance has 'Index' in 'Notes about the Instance,' but the Work is missing **Supplementary Content** = Index`,
          uri: instanceUri
        });
      }
    }
  }
}

/**
 * Check if instance is a SecondaryInstance (should be skipped)
 */
function isSecondaryInstance(instance) {
  const rdfType = instance['rdf:type'];
  if (!rdfType) return false;
  const types = ensureArray(rdfType);
  return types.some(t => t['@_rdf:resource'] === 'http://id.loc.gov/ontologies/bflc/SecondaryInstance');
}

/**
 * Validate BIBFRAME RDF/XML
 * @param {string} rdfXml - The RDF/XML content to validate
 * @returns {Array} Array of validation messages [{level, message, uri}]
 */
function validateBibframe(rdfXml) {
  if (!rdfXml || typeof rdfXml !== 'string') {
    return [{ level: 'ERROR', message: 'No RDF/XML content provided', uri: '' }];
  }

  try {
    const parsed = parser.parse(rdfXml);
    const messages = [];

    // Get the rdf:RDF root element
    const rdf = parsed['rdf:RDF'];
    if (!rdf) {
      return [{ level: 'ERROR', message: 'Invalid RDF/XML: missing rdf:RDF root element', uri: '' }];
    }

    // Validate Works
    const works = ensureArray(rdf['bf:Work']);
    for (const work of works) {
      const uri = getUri(work);
      const workMessages = runRules(work, WORK_RULES, uri);
      messages.push(...workMessages);
    }

    // Validate Instances (skip SecondaryInstance)
    const instances = ensureArray(rdf['bf:Instance']);
    for (const instance of instances) {
      if (isSecondaryInstance(instance)) continue;
      const uri = getUri(instance);
      const instanceMessages = runRules(instance, INSTANCE_RULES, uri);
      messages.push(...instanceMessages);
    }

    // Validate Items
    const items = ensureArray(rdf['bf:Item']);
    for (const item of items) {
      const uri = getUri(item);
      const itemMessages = runRules(item, ITEM_RULES, uri);
      messages.push(...itemMessages);
    }

    // Validate Hubs
    const hubs = ensureArray(rdf['bf:Hub']);
    for (const hub of hubs) {
      const uri = getUri(hub);
      const hubMessages = runRules(hub, HUB_RULES, uri);
      messages.push(...hubMessages);
    }

    // Run cross-resource validation
    runCrossValidation(rdf, messages);

    // If no issues found, return success
    if (messages.length === 0) {
      return [{ level: 'SUCCESS', message: 'No issues found.' }];
    }

    // Sort by level: ERROR first, then WARNING, then INFO
    const levelOrder = { ERROR: 0, WARNING: 1, INFO: 2 };
    messages.sort((a, b) => (levelOrder[a.level] || 3) - (levelOrder[b.level] || 3));

    return messages;

  } catch (err) {
    return [{ level: 'ERROR', message: `Failed to parse RDF/XML: ${err.message}`, uri: '' }];
  }
}

module.exports = {
  validateBibframe,
  WORK_RULES,
  INSTANCE_RULES,
  ITEM_RULES,
  HUB_RULES
};
