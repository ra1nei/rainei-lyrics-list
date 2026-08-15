import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Vị trí chuẩn của Astro 5 là src/content.config.ts (không phải src/content/config.ts),
 * và collection phải khai loader thay vì `type: 'content'`.
 */

const songs = defineCollection({
  loader: glob({ base: './src/content/songs', pattern: '**/*.mdx' }),
  schema: z.object({
    title: z.string(),                                    // Tựa bài hát
    artist: z.string().optional(),                        // Nghệ sĩ
    cover: z.string().optional(),                         // Cover riêng cho bài hát
    date: z.coerce.date().optional(),                     // Ngày đăng, dùng cho mục "Vừa cập nhật"
    type: z.enum(['OP', 'ED', 'INS', 'MV']).optional(),   // Loại bài (phải khớp public/admin/config.yml)
    season: z.string().optional(),                        // Ghi đè tên mùa hiển thị
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
    romaji: z.string(),
    vietnamese: z.string(),
    year: z.union([z.number(), z.string()]).optional(),
    cover: z.string().optional(),
  }),
});

export const collections = { songs, series };
