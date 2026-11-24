#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
/**
 * Builds every publishable workspace package (skips private ones like the docs site).
 * Used by the release workflow before `changeset publish`, and by build-check on PRs.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const packagesDir = join(root, 'packages');

// pixi-silk first: @pixi-silk/compiler builds against its types
const entries = (await readdir(packagesDir, { withFileTypes: true })).sort((a, b) =>
    a.name === 'pixi-silk' ? -1 : b.name === 'pixi-silk' ? 1 : a.name.localeCompare(b.name),
);

for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = join(packagesDir, entry.name);
    let pkg;

    try {
        pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
    } catch {
        continue;
    }
    if (pkg.private || !pkg.scripts?.build) continue;
    console.log(`\n> building ${pkg.name}@${pkg.version}`);
    const run = spawnSync('pnpm', ['--filter', pkg.name, 'build'], { cwd: root, stdio: 'inherit' });

    if (run.status !== 0) process.exit(run.status ?? 1);
}
