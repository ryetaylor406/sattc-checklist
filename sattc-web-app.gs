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

// ── GET: Load tasks or complete a task ──────────────────────────────────────
function doGet(e) {
  // If action=complete, handle task completion
  if (e && e.parameter && e.parameter.action === 'complete') {
    return doComplete(e);
  }
  
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    
    // Promote any pending Intake tasks immediately
    promoteIntakeTasks();
    
    // Read tasks
    const taskRows = tasksSheet.getDataRange().getValues();
    const taskHeaders = taskRows[0];
    
    const tasks = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    for (let i = 1; i < taskRows.length; i++) {
      const row = taskRows[i];
      const active = String(row[6]).toUpperCase() === 'TRUE';
      
      if (!active) continue;
      
      const nextDueStr = String(row[5] || '');
      const lastDoneStr = String(row[8] || '');
      
      // Parse NextDue — could be date object or string
      let nextDue = null;
      if (row[5] instanceof Date) {
        nextDue = Utilities.formatDate(row[5], Session.getScriptTimeZone(), 'yyyy-MM-dd');
      } else if (nextDueStr) {
        // Try parsing string date
        const parsed = new Date(nextDueStr);
        if (!isNaN(parsed.getTime())) {
          nextDue = Utilities.formatDate(parsed, Session.getScriptTimeZone(), 'yyyy-MM-dd');
        } else {
          nextDue = nextDueStr;
        }
      }
      
      // Parse LastDone
      let lastDone = '';
      if (row[8] instanceof Date) {
        lastDone = Utilities.formatDate(row[8], Session.getScriptTimeZone(), 'yyyy-MM-dd');
      } else if (lastDoneStr) {
        lastDone = lastDoneStr;
      }
      
      const task = {
        id: String(row[0] || ''),
        name: String(row[1] || ''),
        category: String(row[2] || ''),
        cadence: String(row[3] || ''),
        nextDue: nextDue || '',
        lastDone: lastDone,
        notes: String(row[9] || ''),
        completedBy: String(row[10] || ''),
        parent: String(row[11] || '')
      };
      
      // Determine if overdue
      if (nextDue && lastDone === '') {
        const dueDate = new Date(nextDue + 'T00:00:00');
        task.isOverdue = dueDate < today;
      } else {
        task.isOverdue = false;
      }
      
      tasks.push(task);
    }
    
    // Read reference docs
    const refSheet = ss.getSheetByName(REFDOCS_TAB);
    const refData = refSheet ? refSheet.getDataRange().getValues() : [];
    const refDocs = [];
    for (let i = 1; i < refData.length; i++) {
      const row = refData[i];
      if (row[0]) {
        refDocs.push({
          crew: String(row[0] || ''),
          leader: String(row[1] || ''),
          title: String(row[2] || ''),
          url: String(row[3] || '')
        });
      }
    }
    
    return ContentService
      .createTextOutput(JSON.stringify({ success: true, tasks, refDocs }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (e) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: e.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── COMPLETE: Mark a task as completed (called from doGet via query params) ─
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
    
    // Find the task row (TaskID is in column A, index 0)
    let rowIndex = -1;
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === taskId) {
        rowIndex = i + 1; // 1-indexed for Sheets API
        break;
      }
    }
    
    if (rowIndex === -1) {
      throw new Error(`Task not found: ${taskId}`);
    }
    
    const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    
    // Set LastDone (col I = index 8) and CompletedBy (col K = index 10)
    const lastDoneCell = sheet.getRange(rowIndex, 9);  // Col I
    const completedByCell = sheet.getRange(rowIndex, 11); // Col K
    
    lastDoneCell.setValue(today);
    completedByCell.setValue(crewName);
    
    // Log the completion
    const logSheet = ss.getSheetByName(LOGS_TAB);
    if (logSheet) {
      const now = new Date();
      const timestamp = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
      logSheet.appendRow([timestamp, taskId, String(rows[rowIndex-1][1] || ''), crewName]);
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
  const data = JSON.parse(content);
  Logger.log(`Tasks: ${data.tasks.length}, RefDocs: ${data.refDocs.length}`);
  Logger.log(`First task: ${JSON.stringify(data.tasks[0])}`);
}
