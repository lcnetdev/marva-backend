/**
 * Unit tests for MARC record HTML formatting
 * Tests the marcRecordHtmlify function logic
 */

describe('MARC Record Htmlify', () => {
  // Implement the marcRecordHtmlify function as defined in server.js
  // This mimics the logic from lines 3074-3114 of server.js
  const marcRecordHtmlify = function(data) {
    let html = '<div class="marc-record">';

    if (data && data.fields) {
      // Handle leader
      if (data.leader) {
        html += `<div class="marc-field marc-leader"><span class="marc-tag">LDR</span> <span class="marc-data">${data.leader}</span></div>`;
      }

      // Handle fields
      for (const field of data.fields) {
        const tag = Object.keys(field)[0];
        const value = field[tag];

        if (typeof value === 'string') {
          // Control field (00X)
          html += `<div class="marc-field marc-control"><span class="marc-tag">${tag}</span> <span class="marc-data">${value}</span></div>`;
        } else if (value.subfields) {
          // Data field with indicators and subfields
          const ind1 = value.ind1 || ' ';
          const ind2 = value.ind2 || ' ';
          let subfieldHtml = '';

          for (const sf of value.subfields) {
            const code = Object.keys(sf)[0];
            const sfValue = sf[code];
            subfieldHtml += `<span class="marc-subfield"><span class="marc-subfield-code">$${code}</span>${sfValue}</span>`;
          }

          html += `<div class="marc-field marc-datafield"><span class="marc-tag">${tag}</span> <span class="marc-indicators">${ind1}${ind2}</span> ${subfieldHtml}</div>`;
        }
      }
    }

    html += '</div>';
    return html;
  };

  describe('Basic formatting', () => {
    it('should wrap output in marc-record div', () => {
      const result = marcRecordHtmlify({ fields: [] });

      expect(result).toMatch(/^<div class="marc-record">/);
      expect(result).toMatch(/<\/div>$/);
    });

    it('should format leader field with correct class', () => {
      const data = {
        leader: '00000nam a2200000 i 4500',
        fields: []
      };

      const result = marcRecordHtmlify(data);

      expect(result).toContain('marc-leader');
      expect(result).toContain('<span class="marc-tag">LDR</span>');
      expect(result).toContain('00000nam a2200000 i 4500');
    });

    it('should format control fields (00X) correctly', () => {
      const data = {
        fields: [
          { '001': '12345678' },
          { '003': 'DLC' },
          { '008': '240115s2024    xxu           000 0 eng d' }
        ]
      };

      const result = marcRecordHtmlify(data);

      expect(result).toContain('marc-control');
      expect(result).toContain('<span class="marc-tag">001</span>');
      expect(result).toContain('12345678');
      expect(result).toContain('<span class="marc-tag">008</span>');
    });

    it('should format data fields with indicators', () => {
      const data = {
        fields: [
          {
            '245': {
              ind1: '1',
              ind2: '0',
              subfields: [
                { 'a': 'Test Title' }
              ]
            }
          }
        ]
      };

      const result = marcRecordHtmlify(data);

      expect(result).toContain('marc-datafield');
      expect(result).toContain('<span class="marc-tag">245</span>');
      expect(result).toContain('<span class="marc-indicators">10</span>');
    });

    it('should format subfields with $a, $b notation', () => {
      const data = {
        fields: [
          {
            '245': {
              ind1: '1',
              ind2: '0',
              subfields: [
                { 'a': 'Main Title :' },
                { 'b': 'subtitle /' },
                { 'c': 'by Author.' }
              ]
            }
          }
        ]
      };

      const result = marcRecordHtmlify(data);

      expect(result).toContain('<span class="marc-subfield-code">$a</span>Main Title :');
      expect(result).toContain('<span class="marc-subfield-code">$b</span>subtitle /');
      expect(result).toContain('<span class="marc-subfield-code">$c</span>by Author.');
    });

    it('should apply correct CSS classes for styling', () => {
      const data = {
        leader: '00000nam a2200000 i 4500',
        fields: [
          { '001': '12345' },
          {
            '100': {
              ind1: '1',
              ind2: ' ',
              subfields: [{ 'a': 'Author' }]
            }
          }
        ]
      };

      const result = marcRecordHtmlify(data);

      expect(result).toContain('class="marc-record"');
      expect(result).toContain('class="marc-field marc-leader"');
      expect(result).toContain('class="marc-field marc-control"');
      expect(result).toContain('class="marc-field marc-datafield"');
      expect(result).toContain('class="marc-tag"');
      expect(result).toContain('class="marc-data"');
      expect(result).toContain('class="marc-subfield"');
      expect(result).toContain('class="marc-subfield-code"');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty MARC record', () => {
      const result = marcRecordHtmlify({ fields: [] });

      expect(result).toBe('<div class="marc-record"></div>');
    });

    it('should handle null/undefined input', () => {
      const result1 = marcRecordHtmlify(null);
      const result2 = marcRecordHtmlify(undefined);
      const result3 = marcRecordHtmlify({});

      expect(result1).toBe('<div class="marc-record"></div>');
      expect(result2).toBe('<div class="marc-record"></div>');
      expect(result3).toBe('<div class="marc-record"></div>');
    });

    it('should handle records with no subfields', () => {
      const data = {
        fields: [
          {
            '245': {
              ind1: '0',
              ind2: '0',
              subfields: []
            }
          }
        ]
      };

      const result = marcRecordHtmlify(data);

      expect(result).toContain('marc-datafield');
      expect(result).toContain('<span class="marc-tag">245</span>');
      expect(result).not.toContain('marc-subfield-code');
    });

    it('should handle special characters in field data', () => {
      const data = {
        fields: [
          {
            '245': {
              ind1: '0',
              ind2: '0',
              subfields: [
                { 'a': 'Title with <special> & "characters"' }
              ]
            }
          }
        ]
      };

      const result = marcRecordHtmlify(data);

      // The function doesn't escape HTML, so special chars pass through
      expect(result).toContain('Title with <special> & "characters"');
    });

    it('should handle multi-byte unicode characters', () => {
      const data = {
        fields: [
          {
            '245': {
              ind1: '0',
              ind2: '0',
              subfields: [
                { 'a': 'Titre en fran\u00e7ais' },  // French with cedilla
                { 'b': '\u4e2d\u6587\u6807\u9898' }  // Chinese characters
              ]
            }
          }
        ]
      };

      const result = marcRecordHtmlify(data);

      expect(result).toContain('fran\u00e7ais');
      expect(result).toContain('\u4e2d\u6587');
    });

    it('should handle blank indicators', () => {
      const data = {
        fields: [
          {
            '100': {
              ind1: ' ',
              ind2: ' ',
              subfields: [{ 'a': 'Author' }]
            }
          }
        ]
      };

      const result = marcRecordHtmlify(data);

      expect(result).toContain('<span class="marc-indicators">  </span>');
    });

    it('should handle missing indicators', () => {
      const data = {
        fields: [
          {
            '100': {
              subfields: [{ 'a': 'Author' }]
            }
          }
        ]
      };

      const result = marcRecordHtmlify(data);

      // Missing indicators should default to spaces
      expect(result).toContain('<span class="marc-indicators">  </span>');
    });

    it('should handle multiple fields with same tag', () => {
      const data = {
        fields: [
          {
            '650': {
              ind1: ' ',
              ind2: '0',
              subfields: [{ 'a': 'Subject 1' }]
            }
          },
          {
            '650': {
              ind1: ' ',
              ind2: '0',
              subfields: [{ 'a': 'Subject 2' }]
            }
          }
        ]
      };

      const result = marcRecordHtmlify(data);

      expect(result).toContain('Subject 1');
      expect(result).toContain('Subject 2');
      expect((result.match(/marc-tag">650/g) || []).length).toBe(2);
    });
  });

  describe('Complete record formatting', () => {
    it('should format a complete bibliographic record', () => {
      const data = {
        leader: '00000nam a2200000 i 4500',
        fields: [
          { '001': '12345678' },
          { '003': 'DLC' },
          { '005': '20240115120000.0' },
          { '008': '240115s2024    xxu           000 0 eng d' },
          {
            '010': {
              ind1: ' ',
              ind2: ' ',
              subfields: [{ 'a': '  2024012345' }]
            }
          },
          {
            '020': {
              ind1: ' ',
              ind2: ' ',
              subfields: [{ 'a': '9780123456789' }]
            }
          },
          {
            '100': {
              ind1: '1',
              ind2: ' ',
              subfields: [
                { 'a': 'Smith, John,' },
                { 'd': '1990-' }
              ]
            }
          },
          {
            '245': {
              ind1: '1',
              ind2: '0',
              subfields: [
                { 'a': 'Test Book Title :' },
                { 'b': 'a subtitle /' },
                { 'c': 'by John Smith.' }
              ]
            }
          }
        ]
      };

      const result = marcRecordHtmlify(data);

      // Verify structure
      expect(result).toContain('marc-record');
      expect(result).toContain('marc-leader');
      expect(result).toContain('marc-control');
      expect(result).toContain('marc-datafield');

      // Verify content
      expect(result).toContain('LDR');
      expect(result).toContain('00000nam a2200000 i 4500');
      expect(result).toContain('12345678');
      expect(result).toContain('Smith, John,');
      expect(result).toContain('Test Book Title :');
    });
  });
});
