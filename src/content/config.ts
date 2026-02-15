import { defineCollection, z } from 'astro:content';

const songs = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),                                                        // Tựa bài hát
    artist: z.string().optional(),                                            // Nghệ sĩ
    cover: z.string().optional(),                                             // Cover cho bài hát
    date: z.date().optional(),                                                // Ngày tạo trên web
    type: z.enum(['OP', 'ED', 'INS', 'MV']).optional(),               // Loại của bài hát (VD: OP/ED)
    season: z.string().optional(),                                            // Dùng để ghi đè tên hiển thị
  }),
});

export const collections = { songs };