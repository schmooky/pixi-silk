import { GLOSSARY } from '../content/glossary.mjs';

const glossaryMarkdown = () =>
    [...GLOSSARY]
        .sort((a, b) => a.term.localeCompare(b.term))
        .map((t) => `- **${t.term}**${t.aka ? ` (${t.aka.join(', ')})` : ''}: ${t.definition}`)
        .join('\n');

/** Said once per page, before the first demo source: how the docs demo runner maps to a plain Pixi app. */
export const DEMO_RUNNER_NOTE =
    'Demo sources run in the docs demo runner, `defineDemo({ setup({ stage, params, tick }) })`. In your own app, `stage` is `app.stage` (or a container on it), `params` holds the values of the demo controls, and `tick(fn)` is `app.ticker.add`, with `t` and `dt` in seconds.';

/**
 * Turns a docs MDX body into plain Markdown for machines (llms files and /docs/<slug>.md):
 * live `<Demo name="x" />` embeds become the demo's TypeScript source, callouts become quotes,
 * `<Glossary />` becomes the list of terms.
 *
 * @param {string} body MDX without frontmatter
 * @param {(name: string) => string | undefined} demoSource
 * @param {{ demoLink?: (name: string) => string }} [options] `demoLink` links a demo whose source
 *   `demoSource` does not give, instead of dropping it
 * @returns {string}
 */
export function mdxToMarkdown(body, demoSource, options = {}) {
    let noted = false;

    return body
        .replace(/^import .*$\n?/gm, '')
        .replace(
            /<ShowcaseSheets\s*\/>/g,
            'The five sheets open full screen from the experiments listed with this page.',
        )
        .replace(/<Glossary\s*\/>/g, () => glossaryMarkdown())
        .replace(/<Demo\s+name="([^"]+)"[^>]*\/>/g, (_, name) => {
            const code = demoSource(name);

            if (!code) return options.demoLink ? `Live demo \`${name}\`: source at ${options.demoLink(name)}` : '';
            const note = noted ? '' : `${DEMO_RUNNER_NOTE}\n\n`;

            noted = true;

            return `${note}Live demo \`${name}\` (source):\n\n\`\`\`ts\n${code.trim()}\n\`\`\``;
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
