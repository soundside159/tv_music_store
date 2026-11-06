/**
 * TV Music Store - composer claim sheets (Google Apps Script web app).
 *
 * The site (Admin -> Whitelisting) calls this script to:
 *   append - add new videos under a date row in a composer's sheet
 *   status - read back which rows the composer set to "Released"
 *
 * Setup (one time, done in the store's Google account):
 *   1. script.google.com -> New project -> paste this file.
 *   2. Change TOKEN below to a long random word (the same goes into the admin).
 *   3. Deploy -> New deployment -> Web app; Execute as: Me; Who has access: Anyone.
 *   4. Copy the Web app URL into Admin -> Whitelisting -> Composers -> Settings.
 */
var TOKEN = 'CHANGE_ME';

// Column names as the composer sees them. 'Match ID' is the site's reference (do not edit).
var HEADER = ['Channel', 'Video link', 'Video title', 'Track found', 'Where in video',
              'Video published', 'Action', 'Your notes', 'Match ID (do not edit)'];
var OLD_HEADERS = { 'Ref': 'Match ID (do not edit)' };
// columns of older sheets that are not used any more (the owner sees this in the scanner)
var DROP_HEADERS = { 'On TV Music Store': 1, 'Track uploaded to the site': 1, 'Track in the scanner base': 1 };
var COL_ACTION = 7;  // 1-based
var COL_REF = 9;

function dateKey(v) {
  // '06.11.2026', a Date cell or '2026-11-06' -> 'YYYY-MM-DD'
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var t = String(v || '').trim();
  var m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(t);
  if (m) return m[3] + '-' + m[2] + '-' + m[1];
  return t;
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function sheetOf(id) {
  var sh = SpreadsheetApp.openById(id).getSheets()[0];
  if (sh.getLastRow() > 0) {
    // an older sheet: rename the columns in place, the rows stay
    var width = Math.max(HEADER.length, sh.getLastColumn());
    var head = sh.getRange(1, 1, 1, width).getValues()[0];
    var changed = false;
    for (var i = 0; i < head.length; i++) {
      var h = String(head[i] || '');
      if (OLD_HEADERS[h]) { head[i] = OLD_HEADERS[h]; changed = true; }
    }
    if (changed) sh.getRange(1, 1, 1, width).setValues([head]);
    // columns we no longer write: delete them (right to left)
    for (var d = head.length - 1; d >= HEADER.length; d--) {
      if (DROP_HEADERS[String(head[d] || '')]) sh.deleteColumn(d + 1);
    }
    // a sheet made with fewer columns: add the missing headers on the right
    for (var k = 0; k < HEADER.length; k++) {
      if (!String(head[k] || '')) sh.getRange(1, k + 1).setValue(HEADER[k]).setFontWeight('bold').setBackground('#f1f3f4');
    }
  }
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADER);
    sh.getRange(1, 1, 1, HEADER.length).setFontWeight('bold').setBackground('#f1f3f4');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 160); sh.setColumnWidth(2, 260); sh.setColumnWidth(3, 260);
    sh.setColumnWidth(4, 200); sh.setColumnWidth(5, 170); sh.setColumnWidth(6, 110);
    sh.setColumnWidth(7, 110); sh.setColumnWidth(8, 220); sh.setColumnWidth(9, 90);
    // Released = green, Release = red (conditional formatting on the Action column)
    var col = sh.getRange('G2:G');
    sh.setConditionalFormatRules([
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Released').setBackground('#e6f4ea').setFontColor('#137333').setRanges([col]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Release').setBackground('#fce8e6').setFontColor('#c5221f').setRanges([col]).build()
    ]);
  }
  return sh;
}

function doPost(e) {
  try {
    var b = JSON.parse(e.postData.contents);
    if (b.token !== TOKEN) return out({ error: 'bad token' });
    var sh = sheetOf(b.sheetId);

    if (b.action === 'append') {
      var rows = (b.rows || []).map(function (r) {
        // older site versions send 9 columns: pad to the header width
        while (r.length < HEADER.length) r.push('');
        return r.slice(0, HEADER.length);
      });
      if (!rows.length) return out({ ok: true, added: 0 });
      // the last date row is today's? then just add under it; else a new date row
      var lastRow = sh.getLastRow();
      var lastDate = '';
      for (var q = lastRow; q >= 2; q--) {
        var cellA = sh.getRange(q, 1).getValue();
        var cellB = String(sh.getRange(q, 2).getValue() || '');
        if (cellB === '' && cellA !== '') { lastDate = dateKey(cellA); break; }
      }
      if (lastDate !== dateKey(b.date)) {
        sh.appendRow([b.date]);
        var dr = sh.getLastRow();
        sh.getRange(dr, 1, 1, HEADER.length).setBackground('#fff4c2').setFontWeight('bold');
      }
      var start = sh.getLastRow() + 1;
      sh.getRange(start, 1, rows.length, HEADER.length).setValues(rows).setFontWeight('normal').setBackground(null);
      var rule = SpreadsheetApp.newDataValidation().requireValueInList(['Release', 'Released'], true).build();
      sh.getRange(start, COL_ACTION, rows.length, 1).setDataValidation(rule);
      sh.getRange(start, COL_REF, rows.length, 1).setFontColor('#9aa0a6');
      return out({ ok: true, added: rows.length });
    }

    if (b.action === 'remove') {
      // delete the rows whose Match ID is in b.refs (a video added by mistake)
      var refs = {};
      (b.refs || []).forEach(function (r) { refs[String(r)] = true; });
      var lastR = sh.getLastRow();
      var removed = 0;
      if (lastR >= 2) {
        var ids = sh.getRange(2, COL_REF, lastR - 1, 1).getValues();
        for (var j = ids.length - 1; j >= 0; j--) {
          if (refs[String(ids[j][0] || '')]) { sh.deleteRow(j + 2); removed++; }
        }
        // a date row with nothing under it (next row is another date or the end) goes too
        var n = sh.getLastRow();
        for (var r2 = n; r2 >= 2; r2--) {
          var a = sh.getRange(r2, 1).getValue(), bb = String(sh.getRange(r2, 2).getValue() || '');
          if (bb !== '' || a === '') continue;
          var next = r2 + 1;
          var nextIsDate = next > sh.getLastRow() ||
            (String(sh.getRange(next, 2).getValue() || '') === '' && sh.getRange(next, 1).getValue() !== '');
          if (nextIsDate) sh.deleteRow(r2);
        }
      }
      return out({ ok: true, removed: removed });
    }

    if (b.action === 'status') {
      var last = sh.getLastRow();
      if (last < 2) return out({ rows: [] });
      var vals = sh.getRange(2, 1, last - 1, HEADER.length).getValues();
      var res = [];
      for (var i = 0; i < vals.length; i++) {
        var ref = String(vals[i][COL_REF - 1] || '');
        if (ref.indexOf('TVMS-') === 0) res.push({ ref: ref, action: String(vals[i][COL_ACTION - 1] || ''), note: String(vals[i][7] || '') });
      }
      return out({ rows: res });
    }
    return out({ error: 'unknown action' });
  } catch (err) {
    return out({ error: String(err) });
  }
}

function doGet() {
  return out({ ok: true, service: 'tvms-claim-sheets' });
}
