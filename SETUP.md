# Chạy và quản lý Rainei Lyrics

## Cấu hình

Yêu cầu Node.js 22.12+ hoặc 24, npm và project Supabase. Phiên dọn repo dùng Node.js 24.

1. Trên project Supabase mới, chạy `supabase/schema.sql` **một lần** trong SQL Editor; không chạy lại schema này trên database đã thiết lập.
2. Tạo tài khoản trong Authentication → Users, rồi cấp quyền quản trị bằng SQL riêng:

   ```sql
   insert into public.admin_users(user_id) values ('UUID-CUA-TAI-KHOAN');
   ```

3. Sao chép `.env.example` thành `.env`, điền `PUBLIC_SUPABASE_URL` và `PUBLIC_SUPABASE_ANON_KEY` bằng Project URL và publishable/anon key. Không dùng `service_role` key.
4. Chạy `npm ci`, `npm test`, rồi `npm run dev`. Mở URL có đường dẫn `/rainei-lyrics-list/`. Dùng `npm run build` để tạo bản deploy.

Ứng dụng yêu cầu Supabase; thiếu cấu hình sẽ hiện thông báo thay vì khởi tạo dữ liệu demo.

## Dữ liệu

- `entries`: bản đang chỉnh sửa, nội dung lời trong `data.body`.
- `published_entries`: bản đã xuất bản cho khách xem.
- Chỉnh lời trên web không cần commit hay build lại. Lưu nháp không thay đổi bản công khai.
- Xuất bản phim trước khi xuất bản bài hát. Gỡ xuất bản phim sẽ ẩn các bài công khai bên trong.
- Đăng nhập qua `?view=admin`. Tài khoản phải nằm trong `admin_users`.
- Dùng menu Dữ liệu để tải bản sao lưu JSON hoặc nhập thêm dữ liệu.

Không còn CMS Git, MDX hay luồng nhập dữ liệu từ file nguồn cũ. Các poster trong `public/imported-posters` được giữ vì URL trong database có thể đang dùng chúng.

Trong lần dọn repo, mã nguồn trước khi dọn được lưu ở `backups/source-before-cleanup-2026-11-24.zip`; dữ liệu 6 anime/24 bài hát được xuất vào `migration/legacy.json`. Đây là các bản sao local được Git bỏ qua, không nằm trong `public` hay bản deploy. Có thể nhập JSON qua menu Dữ liệu khi cần khôi phục; dữ liệu nhập chỉ tạo bản nháp và bỏ qua ID đã có. Các bản sao này chứa nội dung từ repo cũ, không phải bản sao database Supabase hiện tại.

## Quản lý nội dung

- Tìm anime bằng tên, URL hoặc ID AniList ngay trong trang Quản lý. Tên và poster lấy từ AniList; tên tiếng Việt là nhãn nhập riêng.
- Click thẻ anime để sửa thông tin hoặc mở tab Bài hát & lời. Bài hát mặc định thu gọn; tên, nghệ sĩ, loại bài và mùa/nhóm là bắt buộc. Thứ tự và URL video/poster được để trống.
- Lưu nháp từng bài không làm đổi bản công khai. Bấm **Chọn** để chọn nhiều phim/bài hát rồi **Publish đã chọn**. Publish phim không tự publish các bài con; chỉ các bài được chọn được kiểm tra, lưu và publish.
- Chuột phải vào thẻ anime hoặc bài hát trong quản lý để bật/tắt Công khai. Bộ lọc **Tất cả / Đã xuất bản / Chưa xuất bản** căn cứ vào snapshot công khai, kể cả khi đã có sửa nháp mới.
- Menu Dữ liệu cho phép xuất JSON sao lưu và nhập JSON. Xoá phim/bài hát là xoá vĩnh viễn sau hộp xác nhận; chưa có thùng rác.
- Lời hiển thị bằng Markdown an toàn, không thực thi HTML/MDX. Nội dung tải bằng JavaScript; khách thấy thay đổi sau khi tải lại trang.

## GitHub Pages

Workflow .github/workflows/deploy.yml build và deploy khi main được cập nhật. Giữ build source là GitHub Actions trong Settings > Pages.
Repository variables PUBLIC_SUPABASE_URL và PUBLIC_SUPABASE_ANON_KEY được ưu tiên; workflow đang có cấu hình public dự phòng cho project hiện tại.

Trang phim dùng `/rainei-lyrics-list/series/<id>/`. Sáu đường dẫn cũ có trang tĩnh trả HTTP 200. GitHub Pages dùng `404.html` để mở đường dẫn của anime mới và ứng dụng tải dữ liệu từ Supabase. URL `?series=<id>` vẫn dùng được.

## Phạm vi repo

Giữ mã frontend, schema/RLS, tests, cấu hình build/deploy và poster tĩnh. Lời bài hát sống trong Supabase, không được nhúng vào build.
