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

var HEADER = ['Channel', 'Video link', 'Video title', 'Track found', 'Where in video',
              'Video published', 'Action', 'Your notes', 'Ref'];
var COL_ACTION = 7;  // 1-based
var COL_REF = 9;

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function sheetOf(id) {
  var sh = SpreadsheetApp.openById(id).getSheets()[0];
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
      var rows = b.rows || [];
      if (!rows.length) return out({ ok: true, added: 0 });
      sh.appendRow([b.date]);
      var dr = sh.getLastRow();
      sh.getRange(dr, 1, 1, HEADER.length).setBackground('#fff4c2').setFontWeight('bold');
      var start = dr + 1;
      sh.getRange(start, 1, rows.length, HEADER.length).setValues(rows).setFontWeight('normal').setBackground(null);
      var rule = SpreadsheetApp.newDataValidation().requireValueInList(['Release', 'Released'], true).build();
      sh.getRange(start, COL_ACTION, rows.length, 1).setDataValidation(rule);
      sh.getRange(start, COL_REF, rows.length, 1).setFontColor('#9aa0a6');
      return out({ ok: true, added: rows.length });
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
