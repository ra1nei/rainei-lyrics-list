import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Vị trí chuẩn của Astro 5 là src/content.config.ts (không phải src/content/config.ts),
 * và collection phải khai loader thay vì `type: 'content'`.
 */

const songs = defineCollection({
  loader: glob({ base: './src/content/songs', pattern: '**/*.mdx' }),
  // image() biến đường dẫn tương đối trong frontmatter thành ImageMetadata, nhờ vậy
  // poster vẫn đi qua pipeline ảnh của Astro và được nén sang WebP.
  // Dùng nullish() chứ không phải optional() cho mọi ô không bắt buộc.
  // CMS ghi ô để trống thành "season:" rỗng, YAML đọc ra null, mà optional() chỉ
  // nhận undefined nên build sẽ fail ngay bài đầu tiên đăng từ web.
  schema: ({ image }) =>
    z.object({
      title: z.string(),                                    // Tựa bài hát
      order: z.number().nullish(),                          // Thứ tự trong mùa; bỏ trống thì lấy số đầu tên file
      artist: z.string().nullish(),                         // Nghệ sĩ
      video: z.string().nullish(),                          // Link mp4; để trống thì không hiện player
      poster: image().nullish(),                            // Ảnh thumbnail của video
      cover: z.string().nullish(),                          // Cover riêng cho bài hát
      date: z.coerce.date().nullish(),                      // Ngày đăng, dùng cho mục "Vừa cập nhật"
      type: z.enum(['OP', 'ED', 'INS', 'MV']).nullish(),    // Loại bài (phải khớp public/admin/config.yml)
      season: z.string().nullish(),                         // Ghi đè tên mùa hiển thị
    }),
});

/**
 * Thông tin từng bộ phim. Trước đây hardcode trong src/utils/seriesMap.ts nên
 * thêm phim mới là phải sửa TypeScript và CMS không đụng tới được.
 * Tên file chính là id dùng trong URL: sousou-no-frieren.yaml -> /series/sousou-no-frieren
 */
const series = defineCollection({
  loader: glob({ base: './src/content/series', pattern: '**/*.yaml' }),
  schema: z.object({
    // CMS ghi cả ô slug vào file (nó dùng ô này đặt tên file), nên phải khai ra
    slug: z.string().nullish(),
    romaji: z.string(),
    vietnamese: z.string(),
    // nullish chứ không optional: ô để trống trong CMS ra null, optional sẽ fail build
    year: z.union([z.number(), z.string()]).nullish(),
    cover: z.string().nullish(),
  }),
});

export const collections = { songs, series };
