/**
 * SATTC Checklist Web App — Apps Script Backend
 * ===============================================
 * DEPLOYMENT:
 * 1. Open the Tasks Brain Sheet:
 *    https://docs.google.com/spreadsheets/d/1PNzArRG78BRIVj_gRhiCzIgFnMeV3BHRlAST3D8uVSk/edit
 * 2. Extensions → Apps Script → paste this entire file → Save (Ctrl+S)
 * 3. Deploy → New deployment → Web app
 *    - Execute as: Me
 *    - Who has access: Anyone (the landing page calls this)
 * 4. Copy the deployment URL → paste into the landing page's WEB_APP_URL variable
 * ===============================================
 */

// ── CONFIG ──────────────────────────────────────────────────────────────────
const SHEET_ID = '1PNzArRG78BRIVj_gRhiCzIgFnMeV3BHRlAST3D8uVSk';
const TASKS_TAB = 'Tasks';
const REFDOCS_TAB = 'ReferenceDocs';
const LOGS_TAB = 'Logs';

// ── COLUMN MAP BUILDER ─────────────────────────────────────────────────────
// Reads header row and returns { headerName: columnIndex } so columns
// can be reordered without breaking the script.
function buildColMap(sheet) {
  const headers = sheet.getDataRange().getValues()[0];
  const map = {};
  headers.forEach((h, i) => { map[String(h).toLowerCase().trim()] = i; });
  return map;
}

// ── GET: Load tasks or complete a task ──────────────────────────────────────
function doGet(e) {
  // If action=complete, handle task completion
  if (e && e.parameter && e.parameter.action === 'complete') {
    return doComplete(e);
  }
  
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const tasksSheet = ss.getSheetByName(TASKS_TAB);
    const refSheet = ss.getSheetByName(REFDOCS_TAB);
    
    // Promote any pending Intake tasks immediately
    promoteIntakeTasks();
    
    // Build column map from headers
    const COL = buildColMap(tasksSheet);
    
    // Read tasks
    const taskRows = tasksSheet.getDataRange().getValues();
    
    const tasks = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    for (let i = 1; i < taskRows.length; i++) {
      const row = taskRows[i];
      const active = String(row[COL['active']]).toUpperCase() === 'TRUE';
      
      if (!active) continue;
      
      const nextDueStr = String(row[COL['nextdue']] || '');
      const lastDoneStr = String(row[COL['lastdone']] || '');
      
      // Parse NextDue — could be date object or string
      let nextDue = null;
      if (row[COL['nextdue']] instanceof Date) {
        nextDue = Utilities.formatDate(row[COL['nextdue']], Session.getScriptTimeZone(), 'yyyy-MM-dd');
      } else if (nextDueStr) {
        const parsed = new Date(nextDueStr);
        if (!isNaN(parsed.getTime())) {
          nextDue = Utilities.formatDate(parsed, Session.getScriptTimeZone(), 'yyyy-MM-dd');
        } else {
          nextDue = nextDueStr;
        }
      }
      
      // Parse LastDone
      let lastDone = '';
      if (row[COL['lastdone']] instanceof Date) {
        lastDone = Utilities.formatDate(row[COL['lastdone']], Session.getScriptTimeZone(), 'yyyy-MM-dd');
      } else if (lastDoneStr) {
        lastDone = lastDoneStr;
      }
      
      const task = {
        id: String(row[COL['taskid']] || ''),
        name: String(row[COL['taskname']] || ''),
        category: String(row[COL['category']] || ''),
        cadence: String(row[COL['cadence']] || ''),
        nextDue: nextDue || '',
        lastDone: lastDone,
        notes: String(row[COL['notes']] || ''),
        completedBy: String(row[COL['completedby']] || ''),
        parent: String(row[COL['parent']] || '')
      };
      
      // Determine if overdue
      if (nextDue && lastDone === '') {
        const nextDate = new Date(nextDue);
        if (!isNaN(nextDate.getTime()) && nextDate < today) {
          task.isOverdue = true;
        }
      }
      
      tasks.push(task);
    }
    
    // Read reference docs
    let refDocs = [];
    if (refSheet) {
      const refData = refSheet.getDataRange().getValues();
      if (refData.length > 1) {
        const REF = buildColMap(refSheet);
        for (let i = 1; i < refData.length; i++) {
          const r = refData[i];
          const docName = String(r[REF['docname']] || r[REF['name']] || '').trim();
          const docUrl = String(r[REF['docurl']] || r[REF['url']] || '').trim();
          if (!docName || !docUrl) continue;
          refDocs.push({ name: docName, url: docUrl });
        }
      }
    }
    
    return ContentService
      .createTextOutput(JSON.stringify({ tasks, refDocs }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (e) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: e.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── COMPLETE: Mark a task as completed ────────────────────────────────────
function doComplete(e) {
  try {
    const data = e.parameter;
    const taskId = data.taskId;
    const crewName = data.crewName || 'Unknown';
    
    if (!taskId) {
      throw new Error('Missing taskId');
    }
    
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(TASKS_TAB);
    const rows = sheet.getDataRange().getValues();
    
    // Build column map
    const COL = buildColMap(sheet);
    
    // Find the task row by TaskID (using the column map)
    let rowIndex = -1;
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][COL['taskid']]) === taskId) {
        rowIndex = i + 1; // 1-indexed for Sheets API
        break;
      }
    }
    
    if (rowIndex === -1) {
      throw new Error(`Task not found: ${taskId}`);
    }
    
    const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    
    // Use column map for writing
    const lastDoneIdx = COL['lastdone'];
    const completedByIdx = COL['completedby'];
    
    sheet.getRange(rowIndex, lastDoneIdx + 1).setValue(today);
    sheet.getRange(rowIndex, completedByIdx + 1).setValue(crewName);
    
    // Log the completion
    const logSheet = ss.getSheetByName(LOGS_TAB);
    if (logSheet) {
      const now = new Date();
      const timestamp = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
      logSheet.appendRow([timestamp, taskId, String(rows[rowIndex-1][COL['taskname']] || ''), crewName]);
    }
    
    return ContentService
      .createTextOutput(JSON.stringify({ success: true, taskId, completedBy: crewName, date: today }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (e) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: e.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── TEST: Run this in the script editor to verify it works ─────────────────
function testDoGet() {
  const result = doGet();
  const content = result.getContent();
  const parsed = JSON.parse(content);
  Logger.log('Tasks: ' + (parsed.tasks ? parsed.tasks.length : 'ERROR'));
  Logger.log('RefDocs: ' + (parsed.refDocs ? parsed.refDocs.length : '0'));
  if (parsed.tasks) {
    parsed.tasks.forEach(t => Logger.log(t.id + ' | ' + t.name + ' | ' + t.category + ' | overdue=' + t.isOverdue));
  }
  return content;
}
