import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const docs = defineCollection({
    loader: glob({ pattern: '*.mdx', base: './src/content/docs' }),
    schema: z.object({
        /** Heading and sidebar label. */
        title: z.string(),
        /** `<title>` / Open Graph title when it should differ from the heading (keywords first, under ~60 chars). */
        seoTitle: z.string().optional(),
        /** Lead paragraph, meta description and llms.txt summary: answer first, ideally 110-160 characters. */
        description: z.string(),
        /** Search phrases this page answers (JSON-LD keywords, article:tag). */
        keywords: z.array(z.string()).default([]),
        /** Last meaningful content change (sitemap lastmod, dateModified). */
        updated: z.coerce.date(),
        /** Public API this page documents (linked to the API reference). */
        api: z.array(z.string()).default([]),
    }),
});

export const collections = { docs };
