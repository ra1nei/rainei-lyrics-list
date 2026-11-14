# Rainei: AniList search + quản trị trực tiếp

## Cập nhật giao diện bài hát

Xuất bản nhanh: trong quản lý, bấm chuột phải vào thẻ phim hoặc bài hát để mở công tắc **Công khai**. Menu đóng khi bấm ra ngoài, cuộn hoặc nhấn Escape. Gỡ phim có bài hát công khai sẽ hỏi xác nhận vì các bài con cũng bị ẩn. Công tắc bật bài hát bị khoá nếu phim chưa công khai; khi bật bài đang sửa, nội dung của bài đó được kiểm tra và lưu trước khi xuất bản.

Bộ lọc trạng thái ở cả danh sách phim và bài hát: **Tất cả / Đã xuất bản / Chưa xuất bản**. Trạng thái căn cứ vào bản công khai, nên một bài đã xuất bản nhưng đang có sửa nháp vẫn thuộc nhóm đã xuất bản. Chọn tất cả chỉ chọn các mục đang hiển thị; đổi bộ lọc sẽ bỏ các lựa chọn trước đó. Lọc bài hát không tạo lại form nên không làm mất dữ liệu chưa lưu. Nhãn trạng thái trên thẻ phim nằm ở hàng riêng bên dưới năm và số bài hát.

Chọn hàng loạt: cả trang quản lý anime và tab bài hát có nút **Chọn**. Bấm nút này để bật ô chọn, **Chọn tất cả**, **Bỏ chọn**, **Huỷ** và **Publish đã chọn (N)**. Publish anime không tự publish các bài hát. Ở tab bài hát, chỉ các bài được chọn được kiểm tra, lưu và publish; các bản sửa chưa lưu ở bài khác được giữ trên màn hình. Chọn tất cả rồi publish tương đương thao tác publish tất cả trước đây.

- Mặc định các bài thu gọn; bấm tên để mở form và lời. Xanh pastel là đã publish, cam pastel là chưa publish.
- Bắt buộc: tên bài hát, nghệ sĩ, loại bài, mùa/nhóm. Thứ tự, video và poster được để trống. Các bài không đánh số xếp sau bài có thứ tự, rồi theo thời điểm thêm trong cùng nhóm.
- Poster chấp nhận cả URL http(s) và đường dẫn nội bộ, ví dụ `/rainei-lyrics-list/imported-posters/cover.webp`.
- Dùng **Lưu nháp bài này** để lưu riêng. Nút **Publish tất cả** thay cho lưu tất cả: kiểm tra và lưu các thay đổi, rồi publish toàn bộ bài của anime đang mở. Anime phải được publish trước. Nếu mạng lỗi giữa chừng, giao diện báo số bài đã thành công; các bản nháp vẫn được lưu.
- Các đoạn bên dưới nói về giao diện cũ mở toàn bộ bài hoặc nút lưu tất cả được thay thế bằng luồng thu gọn và publish tất cả ở trên.

Lưu nháp bài hát dùng được cả khi anime chưa công khai và khi anime đã công khai. Có nút **Lưu nháp bài này** riêng lẻ và **Lưu tất cả bản nháp**. Nút publish bài hát chỉ dùng được sau khi anime đã công khai. Lưu/publish một bài không làm mất các thay đổi chưa lưu ở bài khác. Bộ kiểm tra hiện có 27 bài kiểm tra đã qua.

Bản này giữ Astro và GitHub Pages. Nội dung live được đọc/ghi qua Supabase; không commit/build lại mỗi khi sửa lời hoặc thêm phim.

## Chạy thử

Yêu cầu Node 22 trở lên. Trong thư mục dự án:

```sh
npm ci
npm run dev
```

Mở URL Astro in ra, có đường dẫn `/rainei-lyrics-list/`. Vào **Quản lý**, gõ trực tiếp vào thanh tìm kiếm cố định ở trên cùng. Các anime đã có và kết quả AniList xuất hiện bên dưới, không chuyển sang màn tìm kiếm riêng. Có thể tìm tên hoặc dán URL/ID, chọn Romaji/English/ngôn ngữ gốc rồi click một kết quả. Tên và URL poster `extraLarge` được lấy nguyên từ AniList; nếu tên English không có thì dùng Romaji.

Trang quản lý ban đầu chỉ hiện các entry anime. Click một entry để mở **Thông tin anime** hoặc **Bài hát & lời**. Tab bài hát hiển thị toàn bộ bài và textarea lời của chúng cùng lúc. Sửa nhiều bài rồi bấm **Lưu tất cả bản nháp**; thao tác này không tự publish. Có thể thêm, xoá, publish hoặc gỡ publish từng bài ngay trong danh sách. Lưu nhiều bản nháp được gửi bằng một yêu cầu database có tính giao dịch.

Không có `.env`: chế độ thử lưu bằng localStorage trên trình duyệt đang dùng. Nút Publish thử chỉ ảnh hưởng trình duyệt đó, không công khai cho người khác. Dữ liệu mẫu 6 phim/24 bài là nội dung vốn có trong repo. Tìm AniList cần kết nối Internet, không dùng dữ liệu giả nếu API lỗi.

## Kết nối Supabase để dùng thật

1. Tạo/chọn project Supabase và chạy `supabase/schema.sql` trong SQL Editor **một lần** trên project mới (schema không thiết kế để chạy lặp).
2. Tạo tài khoản của bạn trong Authentication → Users. Tự đặt mật khẩu; không đưa mật khẩu vào mã nguồn.
3. Lấy UUID của tài khoản và chạy riêng:

```sql
insert into public.admin_users(user_id) values ('UUID-CUA-BAN');
```

4. Copy `.env.example` thành `.env`, điền project URL và **publishable key hoặc anon key**. Không dùng `service_role`, secret key hoặc mật khẩu database trên frontend.
5. Chạy lại dev server. Vào `/?view=admin`, đăng nhập bằng tài khoản ở bước 2. Người dùng thường không được đọc nháp, sửa nội dung, tự thêm admin hoặc gọi publish.

`entries` lưu nháp; `published_entries` lưu snapshot công khai. Sửa/lưu nháp không làm đổi snapshot. RPC `publish_entry` sao chép bản nháp, `unpublish_entry` xoá snapshot; gỡ phim sẽ gỡ snapshot các bài hát con. Xoá hiện là xoá vĩnh viễn và có hộp xác nhận, chưa có thùng rác. Có nút xuất JSON sao lưu thủ công.

## Nhập 6 phim / 24 bài cũ

```sh
npm run export:legacy
```

Script tạo `migration/legacy.json` và chép poster video vào `public/imported-posters`. Vào Quản lý → Nhập dữ liệu cũ → chọn JSON đó. Nội dung nhập là **bản nháp**, không tự publish, không ghi đè các entry trùng ID. Publish phim trước rồi từng bài hát. ID AniList suy ra từ URL cover cũ được dùng để tránh thêm trùng phim; các phim cũ chỉ có tên Romaji trong dữ liệu, có thể tìm lại AniList nếu cần lấy thêm tên English/native.

Không đặt file migration hoặc backup chứa nháp trong `public`. Khi có cấu hình Supabase, `catalog.json` trả về `[]`; trang phim cũ chỉ chuyển hướng, không chứa lời cũ. `migration/legacy.json` chỉ nằm trong source local và không được deploy trong `dist`.

## Deploy GitHub Pages

Trong GitHub repo → Settings → Secrets and variables → Actions → Variables, tạo:

- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY` (publishable hoặc anon key)

Workflow đã chuyển hai biến này vào build. Push thay đổi code và deploy như trước. Từ đó, thêm phim/lời và publish trên admin chỉ ghi database; người đọc thấy bản mới khi tải lại trang. Không cần chạy GitHub Actions cho mỗi lần sửa nội dung.

Giữ `site`/`base` hiện có trong `astro.config.mjs`. Trang anime dùng URL `/series/ID/`; các slug có sẵn được build tĩnh, còn anime mới dùng app shell trong `404.html` để nạp dữ liệu runtime. Các link query `/?series=ID` cũ vẫn được chuyển sang URL đường dẫn và giữ hash bài hát.

## Kiểm tra đã thực hiện và giới hạn

- `node --test tests/*.test.mjs`: 27 kiểm tra, bao gồm tên/poster nguyên gốc, phân trang, URL/ID, cache, HTTP 429, hủy request, tách nháp/public, HTML an toàn, tìm kiếm inline, danh sách anime và chỉnh nhiều lời bài hát cùng lúc.
- Static preview build và live-config build được kiểm tra. Môi trường Windows này chặn esbuild quét thư mục cha, nên dùng cấu hình QA tạm để tắt dependency prebundling khi kiểm tra; bản source giao vẫn dùng config bình thường.
  Có thể tái hiện kiểm tra trong môi trường này bằng `node node_modules/astro/astro.js build --config astro.qa.config.mjs` và đặt `ASTRO_TELEMETRY_DISABLED=1`.
- Chưa chạy schema trên Supabase thật, chưa kiểm chứng đăng nhập/RLS/RPC qua mạng. Cần project của bạn để làm bước đó.
- Công cụ kiểm tra browser bị chặn trên Windows; chưa xác nhận bố cục bằng screenshot, mobile hoặc request AniList từ browser thật. Không tuyên bố đã kiểm thử phần này.
- Lời được render bằng CommonMark an toàn, không thực thi HTML/MDX. Các alert kiểu GitHub `> [!NOTE]` hiện hiển thị như blockquote; không giữ styling alert của bản cũ.
- Không có tự động cập nhật dữ liệu trên tab đã mở, không có SEO/ảnh preview riêng cho từng URL runtime. Nội dung tải bằng JavaScript.
- Poster/video chưa có uploader; dùng URL. Tìm AniList có debounce 650ms, hủy truy vấn cũ, cache tạm 5 phút và xử lý Retry-After.

## Nguồn API

- https://docs.anilist.co/guide/graphql/queries/media
- https://docs.anilist.co/reference/object/mediatitle
- https://docs.anilist.co/reference/object/mediacoverimage
- https://docs.anilist.co/guide/rate-limiting
- https://docs.anilist.co/guide/terms-of-use

Chỉ tìm dữ liệu cần cho các phim bạn chọn, không crawl toàn bộ catalog AniList. Tên từ AniList giữ nguyên; ô tiếng Việt là nhãn tự nhập riêng.
