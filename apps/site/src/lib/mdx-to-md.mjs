import { GLOSSARY } from '../content/glossary.mjs';

const glossaryMarkdown = () =>
    [...GLOSSARY]
        .sort((a, b) => a.term.localeCompare(b.term))
        .map((t) => `- **${t.term}**${t.aka ? ` (${t.aka.join(', ')})` : ''}: ${t.definition}`)
        .join('\n');

/**
 * Turns a docs MDX body into plain Markdown for machines (llms-full.txt and /docs/<slug>.md):
 * live `<Demo name="x" />` embeds become the demo's TypeScript source, callouts become quotes,
 * `<Glossary />` becomes the list of terms.
 *
 * @param {string} body MDX without frontmatter
 * @param {(name: string) => string | undefined} demoSource
 * @returns {string}
 */
export function mdxToMarkdown(body, demoSource) {
    return body
        .replace(/^import .*$\n?/gm, '')
        .replace(
            /<ShowcaseSheets\s*\/>/g,
            'The five sheets open full screen from the experiments listed with this page.',
        )
        .replace(/<Glossary\s*\/>/g, () => glossaryMarkdown())
        .replace(/<Demo\s+name="([^"]+)"[^>]*\/>/g, (_, name) => {
            const code = demoSource(name);

            return code ? `Live demo \`${name}\` (source):\n\n\`\`\`ts\n${code.trim()}\n\`\`\`` : '';
        })
        .replace(
            /<Callout(?:\s+type="(\w+)")?(?:\s+title="([^"]*)")?\s*>\n?([\s\S]*?)<\/Callout>/g,
            (_, type, title, inner) => {
                const head = title ? `**${title}**` : `**${(type ?? 'note').toUpperCase()}**`;

                return `${[head, ...inner.trim().split('\n')].map((line) => `> ${line}`.trimEnd()).join('\n')}`;
            },
        )
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
