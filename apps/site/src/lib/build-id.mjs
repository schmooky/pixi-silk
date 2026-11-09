import { execSync } from 'node:child_process';

/**
 * One id per site build: the short commit hash plus the build time in base 36. Pages carry it in
 * `<meta name="silk-build">` and `/version.json` holds the newest one, so a tab with a page from an
 * older deploy can tell and fetch the new HTML. It also versions the few unhashed scripts.
 */
const commit = (() => {
    try {
        return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
            .toString()
            .trim();
    } catch {
        return 'local';
    }
})();

export const BUILD_ID = `${commit}-${Date.now().toString(36)}`;
