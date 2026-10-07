import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const journal = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/journal' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    publishDate: z.date(),
    updatedDate: z.date().optional(),
    cover: z.string().optional(),
    category: z.enum(['拍攝準備', '外拍地點', '攝影知識', '穿搭與造型', '合作指南']),
    tags: z.array(z.string()).default([]),
    location: z.string().optional(),
    draft: z.boolean().default(false),
    relatedArticles: z.array(z.string()).default([]),
    relatedWorks: z.array(z.string()).default([]),
  }),
});

export const collections = { journal };
