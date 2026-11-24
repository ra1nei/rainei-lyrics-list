/**
 * Helper chuỗi thuần, KHÔNG import astro:content.
 *
 * Tách riêng khỏi songs.ts vì file này được cả script phía trình duyệt import
 * (ô tìm kiếm ở trang chủ). songs.ts có import astro:content, mà module đó chỉ
 * chạy được phía server, kéo vào bundle client là build fail.
 */

/**
 * Bỏ dấu tiếng Việt để gõ "phap su tien tang" vẫn tìm ra "Pháp Sư Tiễn Táng".
 * NFD tách được dấu thanh nhưng không tách đ/Đ, nên phải thay tay.
 */
export function normalizeVi(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');
}
