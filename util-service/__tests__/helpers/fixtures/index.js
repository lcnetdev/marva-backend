/**
 * Test fixtures for util-service tests
 */

// Templates
const templates = {
  validTemplate: {
    id: 'template-001',
    user: 'testuser',
    timestamp: Math.floor(Date.now() / 1000),
    name: 'Test Template',
    description: 'A test template for unit testing',
    resourceType: 'bf:Work',
    data: {
      title: 'Sample Title',
      contributor: 'Sample Contributor'
    }
  },

  templateWithAllFields: {
    id: 'template-002',
    user: 'testuser',
    timestamp: Math.floor(Date.now() / 1000),
    name: 'Complete Template',
    description: 'A template with all fields populated',
    resourceType: 'bf:Instance',
    data: {
      title: 'Complete Title',
      contributor: 'Complete Contributor',
      publisher: 'Complete Publisher',
      date: '2024-01-15',
      language: 'eng',
      identifiers: {
        isbn: '978-0-123456-78-9',
        lccn: '2024012345'
      }
    },
    metadata: {
      created: Date.now(),
      modified: Date.now(),
      version: 1
    }
  },

  minimalTemplate: {
    id: 'template-003',
    user: 'testuser',
    timestamp: Math.floor(Date.now() / 1000)
  }
};

// Resources (records)
const resources = {
  validResource: {
    index: {
      eid: 'eid-001',
      user: 'testuser',
      timestamp: Math.floor(Date.now() / 1000),
      time: new Date().toISOString().split('T')[0],
      status: 'published',
      title: 'Test Resource Title',
      lccn: '2024000001'
    },
    rdf: '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"></rdf:RDF>'
  },

  resourceWithAllMetadata: {
    index: {
      eid: 'eid-002',
      user: 'testuser',
      timestamp: Math.floor(Date.now() / 1000),
      time: new Date().toISOString().split('T')[0],
      status: 'published',
      title: 'Complete Resource',
      lccn: '2024000002',
      isbn: '978-0-123456-78-9',
      resourceType: 'Work',
      instanceType: 'Print'
    },
    rdf: '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><bf:Work></bf:Work></rdf:RDF>'
  },

  deletedResource: {
    index: {
      eid: 'eid-003',
      user: 'testuser',
      timestamp: Math.floor(Date.now() / 1000),
      time: new Date().toISOString().split('T')[0],
      status: 'deleted',
      title: 'Deleted Resource'
    }
  },

  oldResource: {
    index: {
      eid: 'eid-004',
      user: 'testuser',
      timestamp: Math.floor(Date.now() / 1000) - (20 * 24 * 60 * 60), // 20 days ago
      time: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'published',
      title: 'Old Resource'
    }
  },

  recentResource: {
    index: {
      eid: 'eid-005',
      user: 'testuser',
      timestamp: Math.floor(Date.now() / 1000) - (3 * 24 * 60 * 60), // 3 days ago
      time: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'published',
      title: 'Recent Resource'
    }
  }
};

// RDF Payloads
const rdfPayloads = {
  validBibRdf: `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
         xmlns:bf="http://id.loc.gov/ontologies/bibframe/">
  <bf:Work rdf:about="http://example.org/work/1">
    <bf:title>
      <bf:Title>
        <bf:mainTitle>Test Work Title</bf:mainTitle>
      </bf:Title>
    </bf:title>
  </bf:Work>
</rdf:RDF>`,

  validHubRdf: `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:bf="http://id.loc.gov/ontologies/bibframe/">
  <bf:Hub rdf:about="http://example.org/hub/1">
    <bf:title>
      <bf:Title>
        <bf:mainTitle>Test Hub Title</bf:mainTitle>
      </bf:Title>
    </bf:title>
  </bf:Hub>
</rdf:RDF>`,

  invalidRdf: `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <invalid>Not valid RDF structure`,

  minimalRdf: `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"></rdf:RDF>`
};

// MARC Records
const marcRecords = {
  validMarcBib: `<?xml version="1.0" encoding="UTF-8"?>
<record xmlns="http://www.loc.gov/MARC21/slim">
  <leader>00000nam a2200000 i 4500</leader>
  <controlfield tag="001">12345678</controlfield>
  <controlfield tag="008">240115s2024    xxu           000 0 eng d</controlfield>
  <datafield tag="245" ind1="0" ind2="0">
    <subfield code="a">Test Title /</subfield>
    <subfield code="c">by Test Author.</subfield>
  </datafield>
  <datafield tag="100" ind1="1" ind2=" ">
    <subfield code="a">Author, Test,</subfield>
    <subfield code="d">1990-</subfield>
  </datafield>
</record>`,

  validMarcAuthority: `<?xml version="1.0" encoding="UTF-8"?>
<record xmlns="http://www.loc.gov/MARC21/slim">
  <leader>00000nz  a2200000n  4500</leader>
  <controlfield tag="001">n2024012345</controlfield>
  <controlfield tag="008">240115n| azannaabn          |a aaa      </controlfield>
  <datafield tag="100" ind1="1" ind2=" ">
    <subfield code="a">Test Person,</subfield>
    <subfield code="d">1990-</subfield>
  </datafield>
</record>`,

  marcWithAllFields: `<?xml version="1.0" encoding="UTF-8"?>
<record xmlns="http://www.loc.gov/MARC21/slim">
  <leader>00000nam a2200000 i 4500</leader>
  <controlfield tag="001">complete-record</controlfield>
  <controlfield tag="003">DLC</controlfield>
  <controlfield tag="005">20240115120000.0</controlfield>
  <controlfield tag="008">240115s2024    xxu           000 0 eng d</controlfield>
  <datafield tag="010" ind1=" " ind2=" ">
    <subfield code="a">2024012345</subfield>
  </datafield>
  <datafield tag="020" ind1=" " ind2=" ">
    <subfield code="a">9780123456789</subfield>
  </datafield>
  <datafield tag="100" ind1="1" ind2=" ">
    <subfield code="a">Complete Author,</subfield>
    <subfield code="d">1990-</subfield>
  </datafield>
  <datafield tag="245" ind1="1" ind2="0">
    <subfield code="a">Complete Title :</subfield>
    <subfield code="b">with subtitle /</subfield>
    <subfield code="c">by Complete Author.</subfield>
  </datafield>
  <datafield tag="260" ind1=" " ind2=" ">
    <subfield code="a">New York :</subfield>
    <subfield code="b">Publisher,</subfield>
    <subfield code="c">2024.</subfield>
  </datafield>
</record>`,

  minimalMarc: `<?xml version="1.0" encoding="UTF-8"?>
<record xmlns="http://www.loc.gov/MARC21/slim">
  <leader>00000nam a2200000 i 4500</leader>
</record>`,

  marcWithUnicode: `<?xml version="1.0" encoding="UTF-8"?>
<record xmlns="http://www.loc.gov/MARC21/slim">
  <leader>00000nam a2200000 i 4500</leader>
  <controlfield tag="001">unicode-test</controlfield>
  <datafield tag="245" ind1="0" ind2="0">
    <subfield code="a">Titre en fran\u00e7ais avec accents \u00e9\u00e8\u00ea /</subfield>
  </datafield>
  <datafield tag="100" ind1="1" ind2=" ">
    <subfield code="a">\u4e2d\u6587\u4f5c\u8005,</subfield>
  </datafield>
</record>`
};

// User Preferences
const userPrefs = {
  validPrefs: {
    user: 'testuser',
    prefs: JSON.stringify({
      prefs: {
        styleDefault: {
          '--c-edit-main-background-color': { value: '#1a1a1a', type: 'color' }
        },
        panelDisplay: {
          properties: true,
          dualEdit: false,
          opac: true,
          xml: false,
          marc: false
        }
      },
      scriptShifterOptions: {},
      diacriticUse: [],
      marvaComponentLibrary: {}
    })
  },

  minimalPrefs: {
    user: 'minimaluser',
    prefs: JSON.stringify({
      prefs: {}
    })
  },

  prefsWithCatInitials: {
    user: 'cataloger',
    prefs: JSON.stringify({
      prefs: {
        catInitals: 'ABC',
        catCode: '12345'
      }
    })
  }
};

// Error Reports
const errorReports = {
  validErrorReport: {
    eId: 'error-001',
    desc: 'Test error description',
    contact: 'test@example.com',
    activeProfile: JSON.stringify({
      resourceType: 'bf:Work',
      title: 'Error context title'
    })
  },

  errorReportWithFullProfile: {
    eId: 'error-002',
    desc: 'Full profile error',
    contact: 'user@example.com',
    activeProfile: JSON.stringify({
      resourceType: 'bf:Instance',
      title: 'Error context',
      data: {
        work: {},
        instance: {},
        item: {}
      }
    })
  }
};

// ID Generation
const idGeneration = {
  nacoStartId: 2025700001,
  marva001StartId: 1260000000,

  nacoIdDoc: {
    id: 2025700001
  },

  marva001IdDoc: {
    id: 1260000000
  }
};

// WorldCat fixtures
const worldCat = {
  searchResult: {
    numberOfRecords: 2,
    briefRecords: [
      {
        oclcNumber: '123456789',
        title: 'Test Book Title',
        creator: 'Test Author',
        date: '2024',
        language: 'eng',
        generalFormat: 'Book'
      },
      {
        oclcNumber: '987654321',
        title: 'Another Test Book',
        creator: 'Another Author',
        date: '2023',
        language: 'eng',
        generalFormat: 'Book'
      }
    ]
  },

  emptySearchResult: {
    numberOfRecords: 0,
    briefRecords: []
  },

  marcMetadata: `<?xml version="1.0" encoding="UTF-8"?>
<record xmlns="http://www.loc.gov/MARC21/slim">
  <leader>00000nam a2200000 i 4500</leader>
  <controlfield tag="001">ocn123456789</controlfield>
  <datafield tag="245" ind1="0" ind2="0">
    <subfield code="a">WorldCat Test Title</subfield>
  </datafield>
</record>`
};

module.exports = {
  templates,
  resources,
  rdfPayloads,
  marcRecords,
  userPrefs,
  errorReports,
  idGeneration,
  worldCat
};
