// =============================================================================
// Matt Demo - Daily Tasks Runner (Apps Script) — v2
// =============================================================================
// INSTRUCTIONS:
// 1. Open the Tasks Brain Sheet:
//    https://docs.google.com/spreadsheets/d/1PNzArRG78BRIVj_gRhiCzIgFnMeV3BHRlAST3D8uVSk/edit
// 2. Extensions → Apps Script → paste this file → Save
// 3. Run `dryRun` first (preview, no side effects)
// 4. Run `runNow` (real run)
// 5. Set up trigger: clock icon → Add Trigger → runDailyTasks → time-driven → 5:00-6:00am
//
// HOW IT WORKS:
//   Reads the Tasks Brain Sheet → finds tasks due today or overdue →
//   groups by Section → clears the Active Doc entirely →
//   rebuilds it from scratch with only sections that have tasks.
//   No findText(). No per-section manipulation. Clean slate every time.
// =============================================================================

const INTAKE_TAB = 'Intake';

const ACTIVE_DOC_ID = '1LLqfO5177fee9bwMzUIphPeS_mKHLqfNLZCHmDJixcM';

// ── EMAIL CONFIG ────────────────────────────────────────────────────────────
const OVERDUE_EMAIL = 'rye@ryetaylor.com';      // demo address
// Switch to this for production:
// const OVERDUE_EMAIL = 'dmattbuckman@stressandtrauma.org';

const LOCATION_MAP = {
  'Daily Expectations':           'DAILY EXPECTATIONS — TEMPORARY HOUSING',
  'Tuesday Expectations':         'TUESDAY EXPECTATIONS — TEMPORARY HOUSING DEEP CLEAN',
  'Eldorado':                   'ELDORADO',
  'San Damiano':                'SAN DAMIANO',
  'Mount Vernon':               'MOUNT VERNON',
  'Marion':                     'MARION',
  'Carmi':                      'CARMI',
  'Carbondale Crew Work':       'CARBONDALE CREW WORK',
  'Carbondale (Non-Crew Work)': 'CARBONDALE (NON-CREW WORK)',
};

const LOCATIONS = Object.values(LOCATION_MAP);
const ANCHOR_DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ── HELPERS ─────────────────────────────────────────────────────────────────
function _todayStr() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function _parseDate(v) {
  if (!v) return null;
  if (typeof v === 'string' && v.length >= 10) {
    // Handle 'YYYY-MM-DD' or ISO string
    const parts = v.substring(0, 10).split('-');
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      if (!isNaN(d.getTime())) return d;
    }
  }
  if (typeof v === 'number') {
    // Google Sheets serial number (epoch = 1899-12-30)
    const d = new Date((v - 25569) * 86400000);
    if (!isNaN(d.getTime())) return d;
  }
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  return null;
}

function _isTrue(v) { return String(v).toUpperCase() === 'TRUE'; }

function _line(taskName, status) {
  return (status === 'overdue') ? '⚠️ OVERDUE: ' + taskName : '☐ ' + taskName;
}

function _sortKey(t) { return t.status === 'overdue' ? 0 : 1; }

// ── MAIN ────────────────────────────────────────────────────────────────────
function runDailyTasks() {
  const today = new Date();
  const todayStr = _todayStr();
  const todayDow = today.getDay();

  log('runDailyTasks', '', 'Start: ' + todayStr + ' (dow=' + todayDow + ' ' + ANCHOR_DOW[todayDow] + ')', 'INFO');

  // Phase 1: Promote Intake
  const promoted = promoteIntakeTasks();
  if (promoted > 0) log('runDailyTasks', '', 'Promoted ' + promoted + ' from Intake', 'INFO');

  // Phase 2: Read Tasks → find due / overdue
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(TASKS_TAB);
  if (!sheet) { log('runDailyTasks', '', 'Tasks tab not found', 'ERROR'); return; }

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);

  // Build column index by header name
  const col = {};
  headers.forEach((h, i) => { col[String(h).toLowerCase().trim()] = i; });

  // Group due/overdue tasks by section (full name)
  const due = {};
  LOCATIONS.forEach(s => due[s] = []);
  const firedRows = [];  // track which sheet rows we wrote, for Phase 4

  rows.forEach((row, i) => {
    if (!_isTrue(row[col['active']])) return;

    let section = String(row[col['category']] || '');
    if (!LOCATION_MAP[section]) { log('runDailyTasks', String(row[col['taskid']] || ''), 'Unknown section: ' + section, 'WARN'); return; }
    section = LOCATION_MAP[section];
    const taskName = String(row[col['taskname']] || '').trim();
    if (!taskName) return;

    const nextDueDate = _parseDate(row[col['nextdue']]);
    const lastDoneDate = _parseDate(row[col['lastdone']]);

    let status = 'future';
    if (nextDueDate) {
      const done = lastDoneDate && lastDoneDate >= nextDueDate;
      if (done) {
        status = 'done';
      } else if (nextDueDate < today) {
        status = 'overdue';
      } else if (_todayStr() === formatDateForCompare(nextDueDate)) {
        status = 'due_today';
      }
    }

    if (status === 'future' || status === 'done') return;

    due[section].push({ line: _line(taskName, status), status: status, taskId: String(row[col['taskid']] || ''), rowNum: i + 2 });
    firedRows.push(i + 2);
  });

  // Phase 3: Rebuild the Active Doc from scratch
  let doc;
  try { doc = DocumentApp.openById(ACTIVE_DOC_ID); } catch (e) {
    log('runDailyTasks', '', 'Cannot open Active Doc: ' + e.message, 'ERROR');
    return;
  }

  const body = doc.getBody();
  body.clear();  // wipes everything, leaves one empty paragraph

  // Always write the header
  body.appendParagraph('Check the box as you get these finished.');
  body.appendParagraph('(Do not work in the Kids4Good Store until all items are completed on these lists.)');

  let written = 0;

  LOCATIONS.forEach(section => {
    const tasks = due[section];
    if (tasks.length === 0) return;

    // Section header
    body.appendParagraph(section).setBold(true).setFontSize(12);

    // Sort: overdue first
    tasks.sort((a, b) => _sortKey(a) - _sortKey(b));

    tasks.forEach(t => {
      body.appendParagraph(t.line);
      written++;
    });
  });

  // Phase 4: Update Sheet — set LastRun for fired rows
  firedRows.forEach(rowNum => {
    sheet.getRange(rowNum, col['lastrun'] + 1).setValue(today);
    // DO NOT advance NextDue — it stays put until LastDone is filled in manually
  });

  log('runDailyTasks', '', 'End. Wrote ' + written + ' task(s) total.', written > 0 ? 'SUCCESS' : 'INFO');

  // ── Phase 5: Email alert for overdue tasks ────────────────────────────
  const overdueTasks = [];
  LOCATIONS.forEach(section => {
    const tasks = due[section];
    if (!tasks || tasks.length === 0) return;
    tasks.forEach(t => {
      if (t.status === 'overdue') {
        overdueTasks.push({ section: section, line: t.line });
      }
    });
  });

  if (overdueTasks.length > 0) {
    let emailBody = 'The following tasks are overdue:\n\n';
    let currentSection = '';
    overdueTasks.forEach(t => {
      if (t.section !== currentSection) {
        emailBody += '\n' + t.section + ':\n';
        currentSection = t.section;
      }
      emailBody += t.line + '\n';
    });
    emailBody += '\nActive Doc: https://docs.google.com/document/d/' + ACTIVE_DOC_ID + '/edit';
    emailBody += '\nTasks Brain Sheet: ' + ss.getUrl();

    try {
      MailApp.sendEmail({
        to: OVERDUE_EMAIL,
        subject: '⚠️ ' + overdueTasks.length + ' Task(s) Overdue — Stress & Trauma Clinic',
        body: emailBody
      });
      log('runDailyTasks', '', 'Sent overdue alert to ' + OVERDUE_EMAIL + ' (' + overdueTasks.length + ' tasks)', 'INFO');
    } catch (e) {
      log('runDailyTasks', '', 'Failed to send email: ' + e.message, 'WARN');
    }
  }

  // ── Phase 6: Advance NextDue for completed tasks ─────────────────────
  // When a task has lastDone >= nextDue, roll NextDue forward based on cadence
  // and clear LastDone so it's ready for the new cycle. One-off tasks don't advance.
  const allRows = sheet.getDataRange().getValues();
  const allHeaders = allRows[0];
  const allCol = {};
  allHeaders.forEach((h, i) => { allCol[String(h).toLowerCase().trim()] = i; });

  for (let i = 1; i < allRows.length; i++) {
    const row = allRows[i];
    if (!_isTrue(row[allCol['active']])) continue;

    const nextDueDate = _parseDate(row[allCol['nextdue']]);
    const lastDoneDate = _parseDate(row[allCol['lastdone']]);
    const cadence = String(row[allCol['cadence']] || '');

    if (!nextDueDate || !lastDoneDate) continue;
    if (lastDoneDate < nextDueDate) continue;  // not yet done

    // Task is complete — advance NextDue based on cadence
    let newNextDue = null;
    if (cadence === 'Daily') {
      newNextDue = addDays(lastDoneDate, 1);
    } else if (cadence === 'Weekly') {
      newNextDue = addDays(lastDoneDate, 7);
    } else if (cadence === 'Monthly') {
      newNextDue = addMonths(lastDoneDate, 1);
    } else if (cadence === 'Quarterly') {
      newNextDue = addMonths(lastDoneDate, 3);
    } else {
      continue;  // One-off and unknown cadences don't repeat
    }

    const rowNum = i + 1;
    sheet.getRange(rowNum, allCol['nextdue'] + 1).setValue(newNextDue);
    sheet.getRange(rowNum, allCol['lastdone'] + 1).setValue('');     // clear LastDone
    sheet.getRange(rowNum, allCol['completedby'] + 1).setValue('');  // clear CompletedBy
    log('runDailyTasks', String(row[allCol['taskid']] || ''), 'NextDue advanced to ' + formatDateForCompare(newNextDue), 'INFO');
  }
}

// ── INTAKE PROMOTION ────────────────────────────────────────────────────────
function promoteIntakeTasks() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const intake = ss.getSheetByName(INTAKE_TAB);
  const tasks = ss.getSheetByName(TASKS_TAB);
  if (!intake || !tasks) return 0;

  const intakeData = intake.getDataRange().getValues();
  const rows = intakeData.slice(1);
  let promoted = 0;

  rows.forEach((row, i) => {
    if (String(row[7]).toUpperCase() !== 'TRUE') return;
    const name = String(row[1] || '').trim();
    // Mark as processed in column I (keep column H = TRUE/FALSE for approval validation)
    if (name.indexOf('EXAMPLE:') === 0) { intake.getRange(i + 2, 9).setValue('DEMO'); return; }
    if (!name || name.indexOf('1.') === 0 || name.indexOf('2.') === 0 ||
        name.indexOf('3.') === 0 || name.indexOf('4.') === 0 ||
        name.indexOf('5.') === 0 || name.indexOf('6.') === 0) return;

    const taskId = 'INT-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMddHHmmss') + '-' + (i + 2);
    // Write columns A-G, then notes (J) separately to avoid column H validation issues
    const newRow = [
      taskId, row[1], row[2], row[3], row[4],
      computeInitialNextDue(row[3], row[4]),
      'TRUE'
    ];
    const targetRow = tasks.getLastRow() + 1;
    tasks.getRange(targetRow, 1, 1, 7).setValues([newRow]);
    if (row[5]) {
      tasks.getRange(targetRow, 10).setValue(row[5]);  // Column J = Notes
    }
    intake.getRange(i + 2, 9).setValue('PROMOTED ' + taskId);  // Column I = processed status
    promoted++;
  });
  return promoted;
}

function computeInitialNextDue(cadence, anchor) {
  const now = new Date();
  if (cadence === 'Daily') return addDays(now, 1);
  if (cadence === 'Weekly') {
    const n = parseInt(anchor, 10);
    return isNaN(n) ? '' : nextDayOfWeek(now, n);
  }
  if (cadence === 'Monthly' || cadence === 'Quarterly') {
    const n = parseInt(anchor, 10);
    return isNaN(n) ? '' : nextDayOfMonth(now, n);
  }
  if (cadence === 'One-off') {
    const d = _parseDate(anchor);
    return (d && !isNaN(d.getTime())) ? d : addDays(now, 7);
  }
  return '';
}

// ── DATE HELPERS ────────────────────────────────────────────────────────────
function nextDayOfWeek(from, dow) {
  const d = new Date(from); d.setHours(0,0,0,0);
  d.setDate(d.getDate() + ((dow - d.getDay() + 7) % 7));
  return d;
}
function nextDayOfMonth(from, dom) {
  const d = new Date(from); d.setHours(0,0,0,0);
  d.setDate(dom);
  if (d <= from) d.setMonth(d.getMonth() + 1);
  return d;
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function addMonths(d, n) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }
function formatDateForCompare(d) {
  if (typeof d === 'string') { const p = d.split('-'); return p[0] + '-' + p[1] + '-' + p[2]; }
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function log(action, taskId, details, status) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let logs = ss.getSheetByName(LOGS_TAB);
  if (!logs) logs = ss.insertSheet(LOGS_TAB);
  logs.appendRow([new Date(), action, taskId, details, status]);
}

// ── ENTRY POINTS ────────────────────────────────────────────────────────────
function runNow() { runDailyTasks(); }

function dryRun() {
  const today = new Date();
  const todayStr = _todayStr();
  const todayDow = today.getDay();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(TASKS_TAB);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);

  const col = {};
  headers.forEach((h, i) => { col[String(h).toLowerCase().trim()] = i; });

  const due = {};
  LOCATIONS.forEach(s => due[s] = []);

  rows.forEach((row, i) => {
    if (!_isTrue(row[col['active']])) return;
    let section = String(row[col['category']] || '');
    if (!LOCATION_MAP[section]) return;
    section = LOCATION_MAP[section];

    const taskName = String(row[col['taskname']] || '').trim();
    if (!taskName) return;
    const nextDueDate = _parseDate(row[col['nextdue']]);
    const lastDoneDate = _parseDate(row[col['lastdone']]);

    let status = 'future';
    if (nextDueDate) {
      const done = lastDoneDate && lastDoneDate >= nextDueDate;
      if (done) { status = 'done'; }
      else if (nextDueDate < today) { status = 'overdue'; }
      else if (_todayStr() === formatDateForCompare(nextDueDate)) { status = 'due_today'; }
    }
    if (status === 'future' || status === 'done') return;
    due[section].push({ name: taskName, status: status });
  });

  let total = 0;
  Logger.log('=== DRY RUN: ' + todayStr + ' (dow=' + todayDow + ') ===\n');
  LOCATIONS.forEach(s => {
    if (due[s].length > 0) {
      Logger.log('[' + s + ']');
      due[s].forEach(t => {
        Logger.log('  ' + (t.status === 'overdue' ? '⚠️ OVERDUE' : '☐') + ' ' + t.name);
        total++;
      });
      Logger.log('');
    }
  });
  Logger.log('TOTAL: ' + total + ' task(s) would be written.');
}

function tidyUp() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // ── Brand Colors ──
  var NAVY = '#212557', RED = '#ce2032', GRAY = '#58585a';
  
  // ── First: Unhide any columns from previous deployments ──
  try {
    var tasks = ss.getSheetByName('Tasks');
    tasks.showColumns(5);  // E - AnchorDay
    tasks.showColumns(8);  // H - LastRun
  } catch(e) {}
  try {
    var intake = ss.getSheetByName('Intake');
    intake.showColumns(1);  // A - AddedBy
    intake.showColumns(5);  // E - Anchor
    intake.showColumns(6);  // F - Anchor
    intake.showColumns(8);  // H - Approved
    intake.showColumns(9);  // I - Processed
  } catch(e) {}
  
  // ── Then: Apply new formatting ──
  tasks = ss.getSheetByName('Tasks');
  tasks.setFrozenRows(1);
  tasks.setTabColor(NAVY);
  tasks.getRange('E1').setNote('🤖 Automated - AnchorDay\nUsed by the daily runner to calculate NextDue.\nLeave blank.');
  tasks.getRange('H1').setNote('🤖 Automated - LastRun\nUpdated automatically by the daily runner.\nLeave blank.');
  
  intake = ss.getSheetByName('Intake');
  intake.setFrozenRows(1);
  intake.setTabColor(RED);
  intake.getRange('A1').setNote('Optional - who submitted this task.');
  intake.getRange('E1').setNote('🤖 Automated - Anchor\nUsed to calculate NextDue. Leave blank.');
  intake.getRange('F1').setNote('🤖 Automated - Anchor\nUsed to calculate NextDue. Leave blank.');
  intake.getRange('I1').setNote('🤖 Automated - Processed\nUpdated after approval. Leave blank.');
  
  // ── Other tabs ──
  var ref = ss.getSheetByName('ReferenceDocs');
  if (ref) ref.setTabColor(GRAY);
  var logs = ss.getSheetByName('Logs');
  if (logs) logs.setTabColor(GRAY);
  var locs = ss.getSheetByName('Locations');
  if (locs) locs.setTabColor(GRAY);
  
  SpreadsheetApp.flush();
  Logger.log('✅ Unhidden + colors + frozen rows + notes. All done!');
}
