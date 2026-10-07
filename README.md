# Form thu thập nội dung công việc theo vị trí

Bản online: https://skttn.github.io/nscv/

Trang HTML/JavaScript thuần, không cần cài thư viện hoặc build. Mở `index.html` để nhập, thêm/xóa đầu việc, xem trước và in/lưu PDF. Bản nháp lưu trên trình duyệt đang dùng; không dùng chung máy nếu nội dung có thông tin nội bộ nhạy cảm.

## Cập nhật Google Apps Script trước khi dùng chức năng gửi

1. Mở Google Sheets đang kết nối → Extensions → Apps Script.
2. Thay mã bằng toàn bộ nội dung `code.gs`.
3. Deploy → Manage deployments → Edit → New version → Deploy. Giữ cấu hình Web app chạy bằng tài khoản chủ sở hữu và quyền truy cập phù hợp với người điền form.
4. Nếu tạo deployment mới, cập nhật `SCRIPT_URL` trong `index.html` bằng URL `/exec` mới.
5. Gửi một phiếu thử và kiểm tra sheet `WorkResponsesV3`. Mỗi đầu việc là một dòng, có cùng mã phiếu và thông tin người khai/vị trí để lọc và tổng hợp. Các sheet cũ không bị sửa hoặc xóa. Backend chỉ nhận phiên bản `work-content-v3`, từ chối form cũ để tránh ghi nhầm dữ liệu.

### Chọn file Google Sheets nhận kết quả

Trong `code.gs`, cấu hình `SPREADSHEET_ID` ở đầu file:

- Để chuỗi rỗng: dùng file Google Sheets gắn với dự án Apps Script (mở dự án từ Extensions của file đích).
- Để ghi vào file khác: điền ID file đích, là phần giữa `/d/` và `/edit` trong URL Sheets, không phải số `gid`. Tài khoản triển khai Web app phải có quyền chỉnh sửa file này. Cách này cũng dùng được với dự án Apps Script độc lập.
- `SHEET_NAME` là tên tab bên trong file, mặc định `WorkResponsesV3`. Tab được tự tạo nếu chưa có; nếu tiêu đề cột không khớp, script báo lỗi thay vì ghi lệch cột.
- Sau khi sửa cấu hình, triển khai phiên bản mới. Nếu giữ cùng deployment, không cần đổi URL trên giao diện. Nếu tạo deployment khác, cập nhật `SCRIPT_URL`.

Có thể chạy `testDoPost` trong Apps Script Editor để thử quyền ghi. **Hàm này ghi một phiếu thử thật** vào file đích, tên người khai `NGƯỜI KHAI THỬ`; có thể xóa dòng thử sau khi kiểm tra. Mở URL Web app bằng trình duyệt chỉ kiểm tra phiên bản API, không kiểm tra quyền ghi.

Frontend chỉ thông báo thành công khi máy chủ xác nhận đúng phiên bản `work-content-v3`. Cần cập nhật backend trước giao diện.

Mục 3 nhập dạng bảng: Tên việc, Chu kỳ, Khi nào/hạn đến khi nào, Các bước ngắn, Độ khó, Bộ phận liên quan. Mỗi lần nhấn “Thêm dòng” tạo một đầu việc; luôn giữ ít nhất một dòng. Độ khó bắt buộc: Thấp / Trung bình / Cao. Bộ phận liên quan là danh sách 20 giá trị có thể tích chọn nhiều, hoặc để trống. Các giá trị đã chọn được lưu xuống dòng trong cùng một ô Sheets. Đã bỏ câu hỏi chuyển giao công việc và cột ưu tiên. Bảng cuộn ngang trên màn hình nhỏ, bản in dùng A4 ngang.

Bản nháp v1/v2 được khôi phục các trường còn phù hợp; người điền kiểm tra độ khó và chọn lại bộ phận liên quan. Không tự chuyển nội dung người liên quan dạng văn bản thành lựa chọn để tránh suy diễn. Bản nháp cũ vẫn lưu riêng, không tự xóa. Phiên bản v3 dùng tab mới `WorkResponsesV3` để không ghi lệch cột hoặc sửa dữ liệu đã thu thập trong tab cũ.

## Kiểm tra cục bộ

Chạy `node --test tests/work-form.test.cjs`. Kiểm tra backend bằng các dịch vụ Google giả lập, không gửi dữ liệu tới Google Sheets thật.