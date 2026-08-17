import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// File này phải nằm đúng ở src/content.config.ts, và collection nào cũng phải có loader.
// Astro 5 bắt vậy.
//
// Thêm ô mới thì nhớ: không bắt buộc = nullish(), đừng optional().
// CMS ghi ô trống thành "season:" trống trơn, YAML đọc ra null, optional() chỉ nhận
// undefined nên fail build.

const songs = defineCollection({
  loader: glob({ base: './src/content/songs', pattern: '**/*.mdx' }),
  // Phải bọc ({ image }) mới xài được image(). Đổi poster sang z.string() là mất nén WebP.
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      order: z.number().nullish(),                          // trống thì lấy số đầu tên file
      artist: z.string().nullish(),
      video: z.string().nullish(),                          // trống thì không hiện player
      poster: image().nullish(),                            // đường dẫn tương đối tới file ảnh
      cover: z.string().nullish(),
      date: z.coerce.date().nullish(),                      // cho mục "Vừa cập nhật" ở trang chủ
      type: z.enum(['OP', 'ED', 'INS', 'MV']).nullish(),    // sửa ở đây thì sửa cả public/admin/config.yml
      season: z.string().nullish(),                         // ghi đè tên mùa
    }),
});

// Tên file yaml = id trong URL, và thư mục bài hát phải trùng tên đó:
//   series/sousou-no-frieren.yaml  ->  /series/sousou-no-frieren
//   songs/sousou-no-frieren/...
const series = defineCollection({
  loader: glob({ base: './src/content/series', pattern: '**/*.yaml' }),
  schema: z.object({
    slug: z.string().nullish(),   // CMS ghi ô này vào file, code không đọc nhưng phải khai
    romaji: z.string(),
    vietnamese: z.string(),
    year: z.union([z.number(), z.string()]).nullish(),
    cover: z.string().nullish(),
  }),
});

export const collections = { songs, series };
