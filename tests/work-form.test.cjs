const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const backend = fs.readFileSync(path.join(root, 'code.gs'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
function setup(busy = false, options = {}) {
  const rows = []; let released = false;
  const sheet = {
    getLastRow: () => rows.length, setFrozenRows() {},
    getRange(start) {
      return {
        setValues(values) { values.forEach((row, i) => { rows[start - 1 + i] = row; }); return this; },
        getValues() { return [rows[start - 1]]; },
        setFontWeight() { return this; }, setBackground() { return this; }, setFontColor() { return this; },
        createTextFinder(id) { return { matchEntireCell() { return this; }, findNext() { return rows.slice(1).find(row => row[0] === id); } }; }
      };
    }
  };
  const context = vm.createContext({
    console: { error() {} },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ setMimeType: () => JSON.parse(text) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => !busy, releaseLock: () => { released = true; } }) },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => {
        assert.ok(!options.id, 'Không dùng file gắn với script khi đã chỉ định ID');
        return options.noSpreadsheet ? null : { getSheetByName: name => { assert.equal(name, 'WorkResponsesV3'); return sheet; } };
      },
      openById: id => {
        assert.equal(id, options.id);
        if (options.denied) throw new Error('Permission denied');
        return { getSheetByName: name => { assert.equal(name, 'WorkResponsesV3'); return sheet; } };
      },
      flush() {}
    },
    Utilities: { formatDate: () => '03/10/2026 12:00:00' }
  });
  vm.runInContext(options.id ? backend.replace("const SPREADSHEET_ID = '';", 'const SPREADSHEET_ID = ' + JSON.stringify(options.id) + ';') : backend, context);
  return { rows, send: data => context.doPost({ postData: { contents: JSON.stringify(data) } }), raw: event => context.doPost(event), get: () => context.doGet(), released: () => released };
}
function fixture() {
  return { formType: 'work-content-v3', submissionId: 'work-test-1', hoTen: 'Nguyễn Văn A', viTri: 'Nhân sự', boPhan: 'Hành chính', dauMoi: 'Quản lý hồ sơ', tasks: [ { tenViec: 'Tổng hợp', chuKy: 'Tháng', doKho: 4, boPhanLienQuan: ['Nhân sự', 'Kế toán'], ghiChu: 'Thường xuyên' }, { tenViec: '=SUM(A1)', chuKy: 'Phát sinh', doKho: 1, boPhanLienQuan: [], ghiChu: '=NOTE' } ] };
}
test('Frontend và backend có cú pháp JavaScript hợp lệ', () => {
  new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
  new vm.Script(backend);
  for (const label of ['1. Người khai', '2. Vị trí này làm gì (ngắn)', '3. Danh sách đầu việc']) assert.ok(html.includes(label));
});
test('Ghi nhiều đầu việc đúng cột, chống công thức và gửi trùng', () => {
  const app = setup(); const data = fixture();
  assert.equal(app.send(data).status, 'ok');
  assert.equal(app.rows.length, 3);
  assert.equal(app.rows[0].length, 16);
  assert.equal(app.rows[1][2], data.hoTen);
  assert.equal(app.rows[2][8], 2);
  assert.equal(app.rows[2][9], "'=SUM(A1)");
  assert.equal(app.rows[1][13], '4');
  assert.equal(app.rows[0][13], 'Độ khó (1–5 sao)');
  assert.equal(app.rows[0][14], 'Bộ phận liên quan');
  assert.equal(app.rows[0][15], 'Ghi chú/Tính chất công việc');
  assert.equal(app.rows[1][14], 'Nhân sự\nKế toán');
  assert.equal(app.rows[2][14], '');
  assert.equal(app.rows[2][15], "'=NOTE");
  assert.equal(app.send(data).duplicate, true);
  assert.equal(app.rows.length, 3);
  assert.ok(app.released());
});
test('Từ chối thiếu trường bắt buộc, danh sách rỗng, sai lựa chọn và quá độ dài', () => {
  for (const mutate of [d => { d.hoTen = ' '; }, d => { d.tasks = []; }, d => { d.tasks[0].chuKy = ''; }, d => { d.tasks[0].chuKy = '   '; }, d => { d.tasks[0].chuKy = 'a'.repeat(101); }, d => { d.tasks[0].boPhanLienQuan = ['Khác']; }, d => { d.tasks[0].tenViec = 'a'.repeat(201); }]) {
    const app = setup(); const data = fixture(); mutate(data);
    assert.equal(app.send(data).status, 'error'); assert.equal(app.rows.length, 0);
  }
});
test('Thông báo khi máy chủ bận, không ghi dữ liệu', () => {
  const app = setup(true); assert.equal(app.send(fixture()).retryable, true); assert.equal(app.rows.length, 0);
});
test('Độ khó bắt buộc và chỉ nhận 1–5 sao dạng số', () => {
  for (const value of [undefined, '', '3', 'Rất khó', 0, 6, 3.5, null, 'Cao']) {
    const app = setup(); const data = fixture(); data.tasks[0].doKho = value;
    assert.equal(app.send(data).status, 'error'); assert.equal(app.rows.length, 0);
  }
});
test('Ghi chú chống công thức và chấp nhận để trống', () => {
  const ok = setup(); const data = fixture(); data.tasks[0].ghiChu = '=SUM(B1)'; assert.equal(ok.send(data).status, 'ok'); assert.equal(ok.rows[1][15], "'=SUM(B1)");
  const empty = setup(); const data2 = fixture(); delete data2.tasks[0].ghiChu; assert.equal(empty.send(data2).status, 'ok');
  const tooLong = setup(); const data3 = fixture(); data3.tasks[0].ghiChu = 'a'.repeat(4001); assert.equal(tooLong.send(data3).status, 'error');
});
test('Từ chối form cũ, không ghi nhầm dữ liệu', () => {
  const app = setup(); const data = fixture(); data.formType = 'work-content-v1';
  assert.equal(app.send(data).status, 'error'); assert.equal(app.rows.length, 0);
});
test('Nhận đúng file Sheets khi cấu hình ID', () => {
  const app = setup(false, { id: 'target-sheet-id' });
  assert.equal(app.send(fixture()).status, 'ok'); assert.equal(app.rows.length, 3);
});
test('Thiếu file đích hoặc không có quyền: báo lỗi và nhả khóa', () => {
  for (const options of [{ noSpreadsheet: true }, { id: 'target-sheet-id', denied: true }]) {
    const app = setup(false, options);
    assert.equal(app.send(fixture()).status, 'error'); assert.equal(app.rows.length, 0); assert.ok(app.released());
  }
});
test('JSON hỏng, thiếu POST hoặc sai kiểu dữ liệu không tạo dòng', () => {
  const app = setup();
  for (const event of [undefined, {}, { postData: { contents: '{' } }, { postData: { contents: 'null' } }]) assert.equal(app.raw(event).status, 'error');
  for (const tasks of [[null], ['abc'], [[]]]) { const data = fixture(); data.tasks = tasks; assert.equal(app.send(data).status, 'error'); }
  assert.equal(app.rows.length, 0);
});
test('Không ghi vào tab có tiêu đề cột sai', () => {
  const app = setup(); app.rows.push(['Tiêu đề cũ']);
  assert.equal(app.send(fixture()).status, 'error'); assert.equal(app.rows.length, 1); assert.ok(app.released());
});
test('GET trả phiên bản mới và không ghi dữ liệu', () => {
  const app = setup(); assert.equal(app.get().formType, 'work-content-v3'); assert.equal(app.rows.length, 0);
});
test('Chu kỳ tùy chọn chỉ nhận chuỗi 1-100 ký tự, có nội dung', () => {
  const valid = setup(); const ok = fixture(); ok.tasks[0].chuKy = 'Theo học kỳ'; assert.equal(valid.send(ok).status, 'ok');
  for (const value of ['', '   ', 1, null]) {
    const app = setup(); const data = fixture(); data.tasks[0].chuKy = value;
    assert.equal(app.send(data).status, 'error'); assert.equal(app.rows.length, 0);
  }
  const tooLong = setup(); const bad = fixture(); bad.tasks[0].chuKy = 'a'.repeat(101);
  assert.equal(tooLong.send(bad).status, 'error'); assert.equal(tooLong.rows.length, 0);
});
test('Xóa trắng chu kỳ hoặc chu kỳ tùy chọn trống: báo lỗi', () => {
  for (const value of ['', '   ']) {
    const app = setup(); const data = fixture(); data.tasks[0].chuKy = value;
    assert.equal(app.send(data).status, 'error'); assert.equal(app.rows.length, 0);
  }
});
test('Bộ phận liên quan chỉ nhận danh sách hợp lệ, không trùng', () => {
  for (const value of ['Nhân sự', null, ['Nhân sự', 'Nhân sự'], ['Không tồn tại'], [1]]) {
    const app = setup(); const data = fixture(); data.tasks[0].boPhanLienQuan = value;
    assert.equal(app.send(data).status, 'error'); assert.equal(app.rows.length, 0);
  }
});
test('Danh sách 20 bộ phận đồng bộ giữa giao diện và backend', () => {
  const getDepartments = source => JSON.parse(source.match(/const DEPARTMENTS = (\[[^;]+\]);/)[1].replace(/'/g, '"'));
  assert.deepEqual(getDepartments(html), getDepartments(backend));
  assert.equal(getDepartments(html).length, 20);
  assert.ok(!html.includes('Ưu tiên'));
  assert.ok(!html.includes('Không làm / chuyển việc nào cho ai?'));
});