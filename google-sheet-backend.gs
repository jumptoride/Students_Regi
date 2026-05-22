const SHEET_NAME = "Students";

const HEADERS = [
  "id",
  "studentCode",
  "studentName",
  "gender",
  "dob",
  "className",
  "fromSchool",
  "pobVillage",
  "pobCommune",
  "pobDistrict",
  "pobProvince",
  "contact",
  "fatherName",
  "motherName",
  "currentVillage",
  "currentCommune",
  "currentDistrict",
  "currentProvince",
  "gpa",
  "createdAt",
  "updatedAt"
];

function doGet(e) {
  const action = String(e.parameter.action || "list").toLowerCase();
  if (action !== "list") return output_({ ok: false, error: "Unknown action" }, e);
  return output_({
    ok: true,
    students: readStudents_(),
    updatedAt: new Date().toISOString()
  }, e);
}

function doPost(e) {
  try {
    const body = JSON.parse((e.postData && e.postData.contents) || "{}");
    const action = String(body.action || "").toLowerCase();
    if (action === "backup") {
      const rows = Array.isArray(body.students) ? body.students : [];
      replaceStudents_(rows.map(normalizeIncomingStudent_));
      return output_({ ok: true, action, count: rows.length }, e);
    }
    if (action === "upsert") {
      const student = normalizeIncomingStudent_(body);
      upsertStudent_(student);
      return output_({ ok: true, action, studentId: student.studentCode || student.id }, e);
    }
    if (action === "delete") {
      const key = String(body.studentId || body.student?.studentCode || body.student?.id || "").trim();
      deleteStudent_(key);
      return output_({ ok: true, action, studentId: key }, e);
    }
    return output_({ ok: false, error: "Unknown action" }, e);
  } catch (err) {
    return output_({ ok: false, error: String(err && err.message || err) }, e);
  }
}

function output_(payload, e) {
  const callback = e && e.parameter && e.parameter.callback;
  const json = JSON.stringify(payload);
  if (callback) {
    return ContentService
      .createTextOutput(`${callback}(${json});`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  const firstRow = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  const missingHeaders = HEADERS.some((h, i) => firstRow[i] !== h);
  if (missingHeaders) {
    sheet.clear();
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function readStudents_() {
  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  return values
    .filter(row => row.some(cell => String(cell || "").trim() !== ""))
    .map(row => {
      const student = {};
      HEADERS.forEach((key, i) => student[key] = row[i] instanceof Date
        ? Utilities.formatDate(row[i], Session.getScriptTimeZone(), "yyyy-MM-dd")
        : row[i]);
      return student;
    });
}

function replaceStudents_(students) {
  const sheet = getSheet_();
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).clearContent();
  }
  if (!students.length) return;
  const values = students.map(studentToRow_);
  sheet.getRange(2, 1, values.length, HEADERS.length).setValues(values);
}

function upsertStudent_(student) {
  const sheet = getSheet_();
  const key = student.studentCode || student.id;
  const rowIndex = findStudentRow_(key);
  const values = [studentToRow_(student)];
  if (rowIndex) sheet.getRange(rowIndex, 1, 1, HEADERS.length).setValues(values);
  else sheet.appendRow(values[0]);
}

function deleteStudent_(key) {
  const rowIndex = findStudentRow_(key);
  if (rowIndex) getSheet_().deleteRow(rowIndex);
}

function findStudentRow_(key) {
  if (!key) return 0;
  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const idValues = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  const wanted = String(key).trim();
  for (let i = 0; i < idValues.length; i++) {
    const id = String(idValues[i][0] || "").trim();
    const code = String(idValues[i][1] || "").trim();
    if (id === wanted || code === wanted) return i + 2;
  }
  return 0;
}

function normalizeIncomingStudent_(item) {
  const student = item.student && typeof item.student === "object" ? item.student : item;
  const now = new Date().toISOString();
  const normalized = {};
  HEADERS.forEach(key => normalized[key] = student[key] || "");
  normalized.id = student.recordId || student.id || student.studentCode || item.studentId || "";
  normalized.studentCode = student.studentCode || item.studentId || student.studentId || "";
  normalized.createdAt = student.createdAt || now;
  normalized.updatedAt = now;
  return normalized;
}

function studentToRow_(student) {
  return HEADERS.map(key => student[key] || "");
}
