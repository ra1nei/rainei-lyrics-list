// Để riêng khỏi songs.ts vì ô tìm kiếm ngoài trang chủ import file này từ phía
// trình duyệt. songs.ts có astro:content, thứ đó chỉ chạy server, lôi vào bundle
// client là fail build. Nên đừng import astro:content vào đây.

// Bỏ dấu để gõ "phap su tien tang" vẫn ra "Pháp Sư Tiễn Táng".
// NFD tách được dấu thanh nhưng chừa đ/Đ, phải thay tay.
export function normalizeVi(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');
}
