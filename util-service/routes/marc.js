/**
 * MARC Routes
 *
 * Handles MARC preview generation:
 * - POST /marcpreview/:type - Generate MARC preview from RDF
 * - POST /marcformat - Generate MARC of 1 format from  another format
 */

const express = require('express');
const fs = require('fs');
const { spawn } = require('child_process');
const marcjs = require('marcjs');
const Marc = marcjs.Marc;

/**
 * Run xsltproc with XML piped via stdin (avoids temp file I/O)
 * @param {string} xsltPath - Path to XSLT file
 * @param {string} xmlContent - XML content to transform
 * @returns {Promise<{stdout: string, stderr: string}>} Result with stdout/stderr for legacy compatibility
 */
function runXsltproc(xsltPath, xmlContent) {
  return new Promise((resolve) => {
    const proc = spawn('xsltproc', ['--nonet', xsltPath, '-']);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data; });
    proc.stderr.on('data', (data) => { stderr += data; });

    proc.on('close', () => {
      resolve({ stdout, stderr });
    });

    proc.on('error', (err) => {
      resolve({ stdout: '', stderr: err.message });
    });

    proc.stdin.write(xmlContent);
    proc.stdin.end();
  });
}

/**
 * Format MARC record as HTML
 * @param {object} data - MARC record data
 * @returns {string} HTML formatted MARC
 */
function marcRecordHtmlify(data) {
  let formattedMarcRecord = ["<div class='marc record'>"];
  let leader = "<div class='marc leader'>" + data['leader'].replace(/ /g, '&nbsp;') + '</div>';
  formattedMarcRecord.push(leader);

  let fields = data['fields'];
  for (let field of fields) {
    let tag;
    let value = null;
    let indicators = null;
    let subfields = [];

    for (let el in field) {
      if (el == 0) {
        tag = field[el];
      } else if (field.length == 2) {
        value = field[el];
      } else if (el == 1 && field.length > 2) {
        indicators = [field[el][0], field[el][1]];
      } else {
        if ((el % 2) == 0 && field.length > 2) {
          subfields.push([field[el], field[Number(el) + 1]]);
        }
      }
    }

    if (value) {
      tag = "<span class='marc tag tag-" + tag + "'>" + tag + '</span>';
      value = " <span class='marc value'>" + value + '</span>';
      formattedMarcRecord.push("<div class='marc field'>" + tag + value + '</div>');
    } else {
      subfields = subfields.map((subfield) =>
        "<span class='marc subfield subfield-" + subfield[0] + "'><span class='marc subfield subfield-label'>$" + subfield[0] + "</span> <span class='marc subfield subfield-value'>" + subfield[1] + '</span></span>'
      );
      indicators = "<span class='marc indicators'><span class='marc indicators indicator-1'>" + indicators[0] + "</span><span class='marc indicators indicator-2'>" + indicators[1] + '</span></span>';
      tag = "<span class='marc tag tag-" + tag + "'>" + tag + '</span>';
      formattedMarcRecord.push("<div class='marc field'>" + tag + ' ' + indicators + ' ' + subfields.join(' ') + '</div>');
    }
  }
  formattedMarcRecord.push('</div>');

  return formattedMarcRecord.join('\r\n');
}

/**
 *
 * @param {*} marcxml MARC record as XML that will be changed
 * @param {string} sourceType Type of the incoming MARC, type record is {'leader': <....>, 'fields': [...]}
 * @param {string} targetType Type of the outgoing MARC
 * @returns
 */
function marcChangeFormat(marc, sourceType, targetType){
  let sourceTypeList = [ 'iso2709', 'marcxml', 'mij', 'record']
  let targetTypeList = [ 'iso2709', 'marcxml', 'mij', 'text', 'json', 'html']

  if (!sourceTypeList.includes(sourceType)){
    return [false, 'source', sourceTypeList]
  }
  if (!targetTypeList.includes(targetType)){
    return [false, 'target', targetTypeList]
  }

  let formatted
  if (targetType != 'html'){
    const record = Marc.parse(marc, sourceType);
    formatted = Marc.format(record, targetType)
  } else {
    if (sourceType == 'record'){
      formatted = marcRecordHtmlify(marc)
    } else {
      formatted = Marc.parse(marc, 'marcxml')
      formatted = marcRecordHtmlify(formatted)
    }
  }

  return [true, true, formatted]
}

/**
 * Create MARC routes
 * @returns {Router} Express router
 */
function createMarcRoutes() {
  const router = express.Router();

  /**
   * POST /marcpreview/:type - Generate MARC preview from RDF
   */
  router.post('/marcpreview/:type', async (req, res) => {
    const type = req.params.type;
    const rdfxml = req.body.rdfxml;

    // Get available XSLT files
    const xslts = fs.readdirSync('/app/lib/bibframe2marc/', { withFileTypes: true })
      .filter(item => !item.isDirectory() && item.name.toLowerCase().endsWith('.xsl'))
      .map((item) => ({
        fullPath: `/app/lib/bibframe2marc/${item.name}`,
        version: item.name.split('_')[1].split('.xsl')[0]
      }));

    let results = [];
    let rawMarc;

    // Process each XSLT (pipe XML via stdin, no temp file)
    for (const xslt of xslts) {
      const marcxml = await runXsltproc(xslt.fullPath, rdfxml);
      results.push({ version: xslt.version, results: marcxml });
    }

    // Format results
    for (const r of results) {
      let marcRecord;
      try {
        let x = r.results.stdout.trim();
        x = x.replace('<?xml version="1.0" encoding="UTF-8"?>', '');
        x = x.replace(/\s+xml:space="preserve">/g, '>');
        x = x.replace(/\s+xml:space="preserve"\s+/g, ' ');
        x = x.replace(/\s+xml:lang="[a-zA-Z-]*"[\s+>]/g, ' ');
        x = x.replace(/<marc:/g, '<');
        x = x.replace(/<\/marc:/g, '</');

        const record = Marc.parse(x, 'marcxml');
        rawMarc = record;
        marcRecord = Marc.format(record, 'text');
      } catch (err) {
        marcRecord = err.toString();
      }

      if (type === 'html') {
        r.marcRecord = marcRecordHtmlify(rawMarc);
      } else {
        r.marcRecord = marcRecord.trim();
      }
    }

    res.json(results);
  });

  /**
   * POST /marcformat - Generate MARC of 1 format from  another format
   */
  router.post('/marcformat', async (req, res) => {
    let marc = req.body.mrc;
    const sourceType = req.body.sourceType;
    const targetType = req.body.targetType;

    if (sourceType != 'record'){
      marc = marc.replaceAll('marcxml:', '')
    }
    let recordFormatted = marcChangeFormat(marc, sourceType, targetType)
    if (!recordFormatted[0]){
      let message = 'Failed to match ' + recordFormatted[1] + ' format. Available formats: ' + recordFormatted[2].join(", ")

      return res.status(500).json({ msg: 'Error: ' + message });
    } else {
      return res.status(200).json({ result: recordFormatted[2] });
    }
  });

  return router;
}

module.exports = { createMarcRoutes };
