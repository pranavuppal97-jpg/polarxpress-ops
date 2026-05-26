// ═══════════════════════════════════════════════════════════
//   POLAR XPRESS OPS — GOOGLE APPS SCRIPT BACKEND
//   Paste this entire file into Google Apps Script.
//   Deploy as Web App: Execute as "Me", Access "Anyone"
// ═══════════════════════════════════════════════════════════

const SHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();

// Sheet names
const SHEETS = {
  SALES:       'Daily_Sales',
  RECON:       'Reconciliation',
  ATTENDANCE:  'Attendance',
  EXPENSES:    'Expenses',
  INVENTORY:   'Inventory_Log',
  SOPS:        'SOPs',
  LOG:         'App_Log',
  BACKUPS:     'Full_Backups',
  DEVICES:     'Devices',
  INVITES:     'Invites',
};

// ─── ENTRY POINT ─────────────────────────────────────────
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    let result;

    switch (action) {
      case 'logSales':          result = logSales(data);         break;
      case 'logReconciliation': result = logReconciliation(data);break;
      case 'clockIn':           result = logAttendance(data, 'in');  break;
      case 'clockOut':          result = logAttendance(data, 'out'); break;
      case 'logExpense':        result = logExpense(data);        break;
      case 'updateInventory':   result = logInventoryUpdate(data);break;
      case 'saveSOP':              result = saveSOP(data);              break;
      case 'logTask':              result = logTask(data);              break;
      case 'generateInvite':       result = generateInvite(data);      break;
      case 'registerDevice':       result = registerDevice(data);      break;
      case 'registerFounderDevice':result = registerFounderDevice(data);break;
      case 'listDevices':          result = listDevices();             break;
      case 'revokeDevice':         result = revokeDevice(data);        break;
      case 'fullBackup':           result = saveFullBackup(data);      break;
      case 'getLatestBackup':   result = getLatestBackup();      break;
      default:
        result = { error: 'Unknown action: ' + action };
    }

    appendLog(action, data.submittedBy || data.by || '?');
    return jsonResponse({ ok: true, result });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

function doGet(e) {
  return jsonResponse({ ok: true, message: 'Polar Xpress Ops API is running' });
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── SALES ───────────────────────────────────────────────
function logSales(data) {
  const sheet = getOrCreateSheet(SHEETS.SALES, [
    'Date', 'Billing User', 'Orders', 'Net Sales', 'Total Sales',
    'Cash', 'Card', 'UPI', 'Other', 'Waived', 'Not Paid',
    'Submitted By', 'Timestamp'
  ]);

  // Remove existing rows for this date (re-entry support)
  removeRowsByDate(sheet, data.date);

  const entries = data.entries || [];
  entries.forEach(e => {
    sheet.appendRow([
      data.date,
      e.billingUser,
      e.orders || 0,
      e.netSales || 0,
      e.totalSales || 0,
      e.cash || 0,
      e.card || 0,
      e.upi || 0,
      e.other || 0,
      e.waived || 0,
      e.notPaid || 0,
      data.submittedBy,
      new Date().toLocaleString('en-IN'),
    ]);
  });
  return { saved: entries.length };
}

// ─── RECONCILIATION ──────────────────────────────────────
function logReconciliation(data) {
  const sheet = getOrCreateSheet(SHEETS.RECON, [
    'Date', 'Time', 'Total Counted', 'Expected (POS)', 'Difference',
    '₹500', '₹200', '₹100', '₹50', '₹20', '₹10', '₹5', '₹2', '₹1', 'Coins',
    'Notes', 'Submitted By', 'Timestamp'
  ]);

  removeRowsByDate(sheet, data.date);
  sheet.appendRow([
    data.date,
    data.time,
    data.counted,
    data.expected,
    data.difference,
    data.note_500 || 0,
    data.note_200 || 0,
    data.note_100 || 0,
    data.note_50 || 0,
    data.note_20 || 0,
    data.note_10 || 0,
    data.note_5 || 0,
    data.note_2 || 0,
    data.note_1 || 0,
    data.coins || 0,
    data.notes || '',
    data.by,
    new Date().toLocaleString('en-IN'),
  ]);
  return { saved: true };
}

// ─── ATTENDANCE ──────────────────────────────────────────
function logAttendance(data, type) {
  const sheet = getOrCreateSheet(SHEETS.ATTENDANCE, [
    'Date', 'Staff ID', 'Staff Name', 'Clock In', 'Clock Out', 'Hours',
    'Submitted By', 'Timestamp'
  ]);

  if (type === 'in') {
    sheet.appendRow([
      data.date, data.staffId, data.staffName,
      data.time, '', '', data.submittedBy,
      new Date().toLocaleString('en-IN'),
    ]);
  } else {
    // Find the row and update clock out
    const values = sheet.getDataRange().getValues();
    for (let i = values.length - 1; i >= 1; i--) {
      if (values[i][0] === data.date && values[i][1] === data.staffId && !values[i][4]) {
        sheet.getRange(i + 1, 5).setValue(data.time);
        sheet.getRange(i + 1, 6).setValue(data.hours || '');
        break;
      }
    }
  }
  return { saved: true };
}

// ─── EXPENSES ─────────────────────────────────────────────
function logExpense(data) {
  const sheet = getOrCreateSheet(SHEETS.EXPENSES, [
    'Date', 'Category', 'Description', 'Amount', 'Paid By', 'Ref/Bill No',
    'Submitted By', 'Timestamp'
  ]);
  sheet.appendRow([
    data.date, data.category, data.description, data.amount,
    data.paidBy, data.ref || '',
    data.submittedBy, new Date().toLocaleString('en-IN'),
  ]);
  return { saved: true };
}

// ─── INVENTORY ────────────────────────────────────────────
function logInventoryUpdate(data) {
  const sheet = getOrCreateSheet(SHEETS.INVENTORY, [
    'Date', 'Item', 'Old Stock', 'New Stock', 'Unit', 'Note',
    'Updated By', 'Timestamp'
  ]);
  sheet.appendRow([
    data.date, data.name, data.oldStock, data.newStock,
    data.unit, data.note || '',
    data.by, new Date().toLocaleString('en-IN'),
  ]);
  return { saved: true };
}

// ─── TASKS ───────────────────────────────────────────────
function logTask(data) {
  const sheet = getOrCreateSheet('Task_Log', [
    'Date', 'Shift', 'Template ID', 'Title', 'Done By', 'Done At', 'Timestamp'
  ]);
  sheet.appendRow([
    data.date, data.shift || '', data.templateId || '',
    data.title, data.doneBy, data.doneAt,
    new Date().toLocaleString('en-IN'),
  ]);
  return { saved: true };
}

// ─── SOPs ────────────────────────────────────────────────
function saveSOP(data) {
  const sheet = getOrCreateSheet(SHEETS.SOPS, [
    'Category', 'Title', 'Type', 'Steps', 'Updated By', 'Timestamp'
  ]);
  sheet.appendRow([
    data.category, data.title, data.type,
    (data.steps || []).join(' | '),
    data.by, new Date().toLocaleString('en-IN'),
  ]);
  return { saved: true };
}

// ─── DEVICES & INVITES ───────────────────────────────────

function generateInvite(data) {
  const sheet = getOrCreateSheet(SHEETS.INVITES, [
    'Token', 'Label', 'Created By', 'Created At', 'Expires At',
    'Used By Device', 'Used At', 'Status'
  ]);
  const token = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  const now     = new Date();
  const expires = new Date(now.getTime() + 72 * 60 * 60 * 1000);
  sheet.appendRow([
    token, data.label || 'Device', data.createdBy || '?',
    now.toLocaleString('en-IN'), expires.toLocaleString('en-IN'),
    '', '', 'pending'
  ]);
  return { token };
}

function registerDevice(data) {
  const ss       = SpreadsheetApp.getActiveSpreadsheet();
  const invSheet = ss.getSheetByName(SHEETS.INVITES);
  if (!invSheet) return { registered: false, reason: 'No invites' };

  const rows = invSheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] !== data.inviteToken) continue;
    if (rows[i][7] !== 'pending') return { registered: false, reason: 'Token already used' };
    const expires = new Date(rows[i][4]);
    if (new Date() > expires) {
      invSheet.getRange(i + 1, 8).setValue('expired');
      return { registered: false, reason: 'Token expired' };
    }
    invSheet.getRange(i + 1, 6).setValue(data.deviceId);
    invSheet.getRange(i + 1, 7).setValue(new Date().toLocaleString('en-IN'));
    invSheet.getRange(i + 1, 8).setValue('used');
    const label = rows[i][1];
    const devSheet = getOrCreateSheet(SHEETS.DEVICES, [
      'Device ID', 'Device Name', 'Label', 'Registered At', 'Registered Via', 'Status'
    ]);
    devSheet.appendRow([
      data.deviceId, data.deviceName || 'Unknown', label,
      new Date().toLocaleString('en-IN'), data.inviteToken, 'active'
    ]);
    return { registered: true };
  }
  return { registered: false, reason: 'Token not found' };
}

function registerFounderDevice(data) {
  const devSheet = getOrCreateSheet(SHEETS.DEVICES, [
    'Device ID', 'Device Name', 'Label', 'Registered At', 'Registered Via', 'Status'
  ]);
  const rows = devSheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.deviceId) return { registered: true, existing: true };
  }
  devSheet.appendRow([
    data.deviceId, data.deviceName || 'Unknown',
    data.label || 'Founder Device',
    new Date().toLocaleString('en-IN'), 'founder', 'active'
  ]);
  return { registered: true };
}

function listDevices() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.DEVICES);
  if (!sheet || sheet.getLastRow() < 2) return { devices: [] };
  const rows    = sheet.getDataRange().getValues().slice(1);
  const devices = rows
    .filter(r => r[5] !== 'revoked')
    .map(r => ({
      deviceId: r[0], deviceName: r[1], label: r[2],
      registeredAt: r[3], status: r[5]
    }));
  return { devices };
}

function revokeDevice(data) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.DEVICES);
  if (!sheet) return { revoked: false };
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.deviceId) {
      sheet.getRange(i + 1, 6).setValue('revoked');
      return { revoked: true };
    }
  }
  return { revoked: false };
}

// ─── FULL BACKUP ─────────────────────────────────────────
function saveFullBackup(data) {
  const sheet = getOrCreateSheet(SHEETS.BACKUPS, [
    'Timestamp', 'Version', 'Device', 'Backup JSON'
  ]);
  sheet.appendRow([
    new Date().toLocaleString('en-IN'),
    data.version || '1.0',
    data.device  || 'unknown',
    data.backupJson,
  ]);
  return { saved: true };
}

function getLatestBackup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.BACKUPS);
  if (!sheet || sheet.getLastRow() < 2) return { found: false };
  const lastRow = sheet.getLastRow();
  const row = sheet.getRange(lastRow, 1, 1, 4).getValues()[0];
  return { found: true, timestamp: row[0], version: row[1], backupJson: row[3] };
}

// ─── APP LOG ─────────────────────────────────────────────
function appendLog(action, user) {
  try {
    const sheet = getOrCreateSheet(SHEETS.LOG, ['Timestamp', 'Action', 'User']);
    sheet.appendRow([new Date().toLocaleString('en-IN'), action, user]);
  } catch {}
}

// ─── HELPERS ─────────────────────────────────────────────
function getOrCreateSheet(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    // Format header row
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground('#1a73e8');
    headerRange.setFontColor('#ffffff');
    headerRange.setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function removeRowsByDate(sheet, date) {
  const values = sheet.getDataRange().getValues();
  // Go in reverse so row deletion doesn't shift indices
  for (let i = values.length - 1; i >= 1; i--) {
    if (values[i][0] === date) {
      sheet.deleteRow(i + 1);
    }
  }
}

// ─── DAILY SUMMARY EMAIL (optional, set up a trigger) ────
function sendDailySummary() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const salesSheet = ss.getSheetByName(SHEETS.SALES);
  const expSheet   = ss.getSheetByName(SHEETS.EXPENSES);
  const reconSheet = ss.getSheetByName(SHEETS.RECON);
  if (!salesSheet) return;

  const today = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd');

  // Get today's sales
  const salesData = salesSheet.getDataRange().getValues();
  const todaySales = salesData.filter(r => r[0] === today && r[0] !== 'Date');
  const totalSales = todaySales.reduce((s, r) => s + (parseFloat(r[4]) || 0), 0);
  const totalCash  = todaySales.reduce((s, r) => s + (parseFloat(r[5]) || 0), 0);
  const totalCard  = todaySales.reduce((s, r) => s + (parseFloat(r[6]) || 0), 0);
  const totalUPI   = todaySales.reduce((s, r) => s + (parseFloat(r[7]) || 0), 0);

  // Get today's recon
  const reconData = reconSheet ? reconSheet.getDataRange().getValues() : [];
  const todayRecon = reconData.find(r => r[0] === today && r[0] !== 'Date');
  const reconStatus = todayRecon
    ? (parseFloat(todayRecon[4]) === 0 ? '✅ Matched' : `⚠️ Difference: ₹${todayRecon[4]}`)
    : '❌ Not done';

  // Get today's expenses
  const expData = expSheet ? expSheet.getDataRange().getValues() : [];
  const todayExp = expData.filter(r => r[0] === today && r[0] !== 'Date');
  const totalExp = todayExp.reduce((s, r) => s + (parseFloat(r[3]) || 0), 0);

  const subject = `Polar Xpress Daily Summary — ${today}`;
  const body = `
Daily Summary — ${today}

SALES
━━━━━━━━━━━━━━━━━━━━
Total Sales:  ₹${totalSales.toLocaleString('en-IN')}
Cash:         ₹${totalCash.toLocaleString('en-IN')}
Card:         ₹${totalCard.toLocaleString('en-IN')}
UPI:          ₹${totalUPI.toLocaleString('en-IN')}

CASH RECONCILIATION
━━━━━━━━━━━━━━━━━━━━
Status: ${reconStatus}

EXPENSES
━━━━━━━━━━━━━━━━━━━━
Total Expenses: ₹${totalExp.toLocaleString('en-IN')}

NET (Sales - Expenses): ₹${(totalSales - totalExp).toLocaleString('en-IN')}

—
Polar Xpress Ops System
Third Street Kitchen LLP
  `.trim();

  MailApp.sendEmail('pranavuppal97@gmail.com', subject, body);
}
