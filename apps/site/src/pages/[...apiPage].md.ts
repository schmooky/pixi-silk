import type { APIRoute, GetStaticPaths } from 'astro';
import { apiBody, apiFrontmatter } from '@/lib/api-md.mjs';
import { SITE } from '@/lib/site';

/**
 * Plain-Markdown twin of every API page: `/api/classes/SilkGraphics/` is also served as
 * `/api/classes/SilkGraphics.md`, an entry point overview `/api/ui/gizmo/` as `/api/ui/gizmo.md`
 * and the overview as `/api.md`. Links point at the other twins, so an agent can follow them.
 *
 * It lives outside src/pages/api because TypeDoc empties that folder on every `pnpm api:gen`.
 */
const pages = import.meta.glob<string>('./api/**/*.md', { query: '?raw', import: 'default', eager: true });

export const getStaticPaths: GetStaticPaths = () =>
    Object.entries(pages).map(([file, raw]) => {
        const rel = file
            .replace(/^\.\/api\//, '')
            .replace(/\.md$/, '')
            .replace(/(^|\/)index$/, '');

        return { params: { apiPage: rel ? `api/${rel}` : 'api' }, props: { raw } };
    });

export const GET: APIRoute = ({ props, params }) => {
    const { data, body } = apiFrontmatter((props as { raw: string }).raw);
    const html = `${SITE.url}/${params.apiPage}/`;
    const kind = data.eyebrow && data.eyebrow !== 'Reference' ? ` (${data.eyebrow})` : '';
    const text = [
        `# ${data.title}${kind}`,
        data.summary ? `> ${data.summary}` : '',
        `Source: ${html}`,
        apiBody(body, SITE.url, { markdownLinks: true }),
    ]
        .filter(Boolean)
        .join('\n\n');

    return new Response(`${text}\n`, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
};
