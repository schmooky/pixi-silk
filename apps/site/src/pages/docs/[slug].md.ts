import { getCollection } from 'astro:content';
import type { APIRoute, GetStaticPaths } from 'astro';
import { type Area, docsAreas } from '@/lib/docs';
import { mdxToMarkdown } from '@/lib/mdx-to-md.mjs';
import { SITE } from '@/lib/site';

const demos = import.meta.glob<string>('../../demos/*.demo.ts', { query: '?raw', import: 'default', eager: true });

type Entry = Awaited<ReturnType<typeof getCollection<'docs'>>>[number];

export const getStaticPaths: GetStaticPaths = async () => {
    const docs = await getCollection('docs');
    const areas = await docsAreas();

    return [
        ...docs.map((entry) => ({ params: { slug: entry.id }, props: { entry } })),
        ...areas.map((area) => ({ params: { slug: area.id }, props: { area } })),
    ];
};

function areaMarkdown(area: Area): string {
    const list = (items: { title: string; href: string; description: string }[]) =>
        items.map((i) => `- [${i.title}](${new URL(i.href, SITE.url)}): ${i.description}`).join('\n');
    const parts = [
        `# ${area.title}`,
        `> ${area.summary}`,
        `Source: ${SITE.url}${area.href}`,
        area.intro.join('\n\n'),
        area.pages.length ? `## Read in order\n\n${list(area.pages)}` : '',
        area.links.length ? `## Also here\n\n${list(area.links.map((l) => ({ ...l, title: l.label })))}` : '',
        area.lab.length ? `## In the lab\n\n${list(area.lab.map((l) => ({ ...l, title: l.name })))}` : '',
    ];

    return `${parts.filter(Boolean).join('\n\n')}\n`;
}

/** Plain-Markdown twin of every docs page and area overview, for LLMs and other tools. */
export const GET: APIRoute = ({ props }) => {
    const { entry, area } = props as { entry?: Entry; area?: Area };
    let text: string;

    if (area) {
        text = areaMarkdown(area);
    } else {
        const e = entry!;
        const body = mdxToMarkdown(e.body ?? '', (name) => demos[`../../demos/${name}.demo.ts`]);

        text = `# ${e.data.title}\n\n> ${e.data.description}\n\nSource: ${SITE.url}/docs/${e.id}/\n\n${body}\n`;
    }

    return new Response(text, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
};
