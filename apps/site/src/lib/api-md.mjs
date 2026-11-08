/**
 * Plain Markdown from an API page that scripts/postprocess-api.mjs wrote: for /api/<path>.md and
 * the llms files. Drops the frontmatter and TypeDoc's anchors, and makes every link absolute.
 */

/** Reads the frontmatter fields postprocess-api.mjs writes (single-quoted YAML scalars). */
export function apiFrontmatter(raw) {
    const m = raw.match(/^---\n([\s\S]*?)\n---\n?/);
    const data = {};

    if (m)
        for (const line of m[1].split('\n')) {
            const f = line.match(/^(\w+): '((?:[^']|'')*)'$/);

            if (f) data[f[1]] = f[2].replace(/''/g, "'");
        }

    return { data, body: m ? raw.slice(m[0].length) : raw };
}

/**
 * @param {string} body page body without frontmatter
 * @param {string} siteUrl origin, no trailing slash
 * @param {{ markdownLinks?: boolean }} [options] link the `.md` twins instead of the HTML pages
 */
export function apiBody(body, siteUrl, options = {}) {
    return body
        .replace(/<a id="[^"]*"><\/a>\n?/g, '')
        .replace(/\]\((\/api\/[^)#\s]*)(#[^)\s]*)?\)/g, (_, p, hash = '') =>
            options.markdownLinks ? `](${siteUrl}${p.replace(/\/$/, '')}.md)` : `](${siteUrl}${p}${hash})`,
        )
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
