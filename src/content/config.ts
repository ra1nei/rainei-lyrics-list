import { defineCollection, z } from 'astro:content';

const songs = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    artist: z.string().optional(),
    logo: z.string().optional(),
    cover: z.string().optional(),
    // Thêm các dòng khác nếu file md của ông có (ví dụ date, tag...)
  }),
});

export const collections = { songs };