// FORM THU THẬP NỘI DUNG CÔNG VIỆC THEO VỊ TRÍ — Google Apps Script
// Mở Sheets đích → Extensions → Apps Script, dán toàn bộ file này.
// ID nằm giữa /d/ và /edit trong URL Sheets, KHÔNG phải gid.
// Để SPREADSHEET_ID trống: dùng file Sheets gắn với dự án Apps Script.
// Điền ID: ghi vào file đó, tài khoản triển khai phải có quyền chỉnh sửa.
// Deploy Web app (Execute as: Me), chọn quyền truy cập phù hợp.
// Dán URL /exec vào SCRIPT_URL của giao diện. Sửa mã phải deploy phiên bản mới.
const SPREADSHEET_ID = '';
const SHEET_NAME = 'WorkResponsesV3';
const FORM_TYPE = 'work-content-v3';
const DEPARTMENTS = ['Tổng Hiệu trưởng', 'Hiệu trưởng', 'Hiệu phó', 'Giáo viên bộ môn', 'Giáo viên chủ nhiệm', 'Tổ trưởng chuyên môn', 'Quản sinh', 'Tư vấn tâm lý', 'Đoàn – Đội', 'Văn thư', 'Nhân sự', 'Tuyển sinh', 'Kế toán', 'Bảo vệ', 'Lao công', 'Cơ sở vật chất', 'Công nghệ thông tin', 'Y tế', 'Học sinh', 'Phụ huynh'];

const PERSON_COLUMNS = [
  { key: 'hoTen', label: 'Họ tên', required: true, limit: 200 },
  { key: 'viTri', label: 'Vị trí', required: true, limit: 200 },
  { key: 'boPhan', label: 'Bộ phận', required: true, limit: 200 },
  { key: 'baoCaoCho', label: 'Báo cáo cho', limit: 200 },
  { key: 'dauMoi', label: 'Một câu: đầu mối việc gì?', required: true },
  { key: 'phamVi', label: 'Làm những việc nào?' }
];
const TASK_COLUMNS = [
  { key: 'tenViec', label: 'Tên việc', required: true, limit: 200 },
  { key: 'chuKy', label: 'Chu kỳ', required: true },
  { key: 'thoiHan', label: 'Khi nào, hạn đến khi nào' },
  { key: 'cachLam', label: 'Làm thế nào (các bước ngắn)' },
  { key: 'doKho', label: 'Độ khó (1–5 sao)', required: true },
  { key: 'boPhanLienQuan', label: 'Bộ phận liên quan', multiple: true, options: DEPARTMENTS },
  { key: 'ghiChu', label: 'Ghi chú/Tính chất công việc' }
];
const CUSTOM_CHU_KY = ['Ngày', 'Tuần', 'Tháng', 'Năm', 'Phát sinh'];

function isCustomChuKy_(value) {
  return typeof value === 'string' && value.trim().length > 0 && !CUSTOM_CHU_KY.includes(value);
}

function jsonReply_(result) {
  return ContentService.createTextOutput(JSON.stringify(Object.assign({ formType: FORM_TYPE }, result)))
    .setMimeType(ContentService.MimeType.JSON);
}

// Kiểm tra phiên bản Web app; không đọc/ghi dữ liệu cá nhân.
function doGet() {
  return jsonReply_({ status: 'ok', message: 'API form công việc đang chạy. Gửi dữ liệu bằng POST.' });
}

function validateFields_(values, columns) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) return false;
  return columns.every(column => {
    const value = values[column.key];
    if (value === undefined) return !column.required;
    if (column.key === 'chuKy') {
      return typeof value === 'string' && value.length <= 100 && value.trim().length > 0
        && (CUSTOM_CHU_KY.includes(value) || isCustomChuKy_(value));
    }
    if (column.key === 'doKho') {
      return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5;
    }
    if (column.multiple) return Array.isArray(value) && value.length <= column.options.length
      && new Set(value).size === value.length && value.every(item => column.options.includes(item));
    return typeof value === 'string' && value.length <= (column.limit || 4000)
      && (!column.required || value.trim().length > 0)
      && (!column.options || column.options.includes(value));
  });
}

function getTargetSpreadsheet_() {
  const spreadsheet = SPREADSHEET_ID.trim()
    ? SpreadsheetApp.openById(SPREADSHEET_ID.trim())
    : SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('Chưa cấu hình file đích. Điền SPREADSHEET_ID hoặc tạo Apps Script từ file Google Sheets đích.');
  return spreadsheet;
}

function safeCell_(value) {
  if (Array.isArray(value)) value = value.join('\n');
  if (typeof value === 'number') value = String(value);
  const text = String(value || '').trim();
  return /^[=+@-]/.test(text) ? "'" + text : text;
}

function doPost(e) {
  let data;
  try { data = JSON.parse(e.postData.contents); }
  catch (_) { return jsonReply_({ status: 'error', message: 'Thiếu dữ liệu POST hoặc JSON không hợp lệ.' }); }
  if (!data || data.formType !== FORM_TYPE) {
    return jsonReply_({ status: 'error', message: 'Phiên bản form không phù hợp. Vui lòng tải lại form công việc mới nhất.' });
  }
  if (typeof data.submissionId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(data.submissionId)
      || !validateFields_(data, PERSON_COLUMNS) || !Array.isArray(data.tasks) || !data.tasks.length
      || !data.tasks.every(task => validateFields_(task, TASK_COLUMNS))) {
    return jsonReply_({ status: 'error', message: 'Dữ liệu chưa hợp lệ. Kiểm tra người khai, tên việc, chu kỳ, độ khó và bộ phận liên quan.' });
  }

  let lock;
  let hasLock = false;
  try {
    lock = LockService.getScriptLock();
    hasLock = lock.tryLock(15000);
    if (!hasLock) return jsonReply_({ status: 'error', retryable: true, message: 'Hệ thống đang bận. Vui lòng gửi lại.' });
    const spreadsheet = getTargetSpreadsheet_();
    const sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.insertSheet(SHEET_NAME);
    const headers = ['Mã phiếu', 'Thời gian nộp', ...PERSON_COLUMNS.map(column => column.label), 'STT đầu việc', ...TASK_COLUMNS.map(column => column.label)];
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers])
        .setFontWeight('bold').setBackground('#1565c0').setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    } else {
      const actualHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
      if (!headers.every((header, index) => actualHeaders[index] === header)) {
        return jsonReply_({ status: 'error', message: 'Các cột của tab nhận dữ liệu không đúng cấu trúc. Kiểm tra tab ' + SHEET_NAME + ' hoặc cấu hình SHEET_NAME mới.' });
      }
    }
    // Giữ mã phiếu khi gửi lại sau lỗi mạng để tránh lưu trùng.
    if (sheet.getLastRow() > 1 && sheet.getRange(2, 1, sheet.getLastRow() - 1, 1)
        .createTextFinder(data.submissionId).matchEntireCell(true).findNext()) {
      return jsonReply_({ status: 'ok', duplicate: true });
    }
    const timestamp = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm:ss');
    const rows = data.tasks.map((task, index) => [data.submissionId, timestamp,
      ...PERSON_COLUMNS.map(column => safeCell_(data[column.key])), index + 1,
      ...TASK_COLUMNS.map(column => safeCell_(task[column.key]))]);
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
    SpreadsheetApp.flush();
    return jsonReply_({ status: 'ok' });
  } catch (error) {
    console.error(error);
    return jsonReply_({ status: 'error', message: 'Không lưu được phiếu. Quản trị viên cần kiểm tra SPREADSHEET_ID, quyền chỉnh sửa file đích và nhật ký Executions trong Apps Script.' });
  } finally {
    if (hasLock) lock.releaseLock();
  }
}

// Chạy thủ công trong Apps Script. Hàm này GHI một phiếu thử vào file đích.
function testDoPost() {
  const result = doPost({ postData: { contents: JSON.stringify({
    formType: FORM_TYPE, submissionId: 'test-' + Utilities.getUuid(),
    hoTen: 'NGƯỜI KHAI THỬ', viTri: 'Chuyên viên nhân sự', boPhan: 'Hành chính – Nhân sự',
    baoCaoCho: 'Trưởng phòng', dauMoi: 'Đầu mối quản lý hồ sơ nhân sự',
    phamVi: 'Tiếp nhận và cập nhật hồ sơ',
    tasks: [{ tenViec: 'Rà soát hồ sơ nhân sự', chuKy: 'Tháng', thoiHan: 'Trước ngày 25 hằng tháng',
      cachLam: 'Kiểm tra hồ sơ; liên hệ bổ sung; cập nhật danh sách.', doKho: 3,
      boPhanLienQuan: ['Nhân sự', 'Kế toán'], ghiChu: 'Việc lặp lại, cần chính xác cao' }]
  }) } });
  Logger.log(result.getContent());
}