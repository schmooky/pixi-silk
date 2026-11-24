// Compiles the shop example of @pixi-silk/compiler (its fixtures) into public/i18n, for the
// localized text docs and demos. Run after `pnpm --filter @pixi-silk/compiler build`. The output is
// committed: the same inputs always give the same bytes.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';

const fixtures = '../../packages/compiler/fixtures';

mkdirSync('public/i18n', { recursive: true });
execFileSync(
    'node',
    [
        '../../packages/compiler/dist/cli.mjs',
        'compile',
        '--config',
        `${fixtures}/silk.config.json`,
        '--strings',
        `${fixtures}/strings.xlsx`,
        '--theme',
        `${fixtures}/theme.json`,
        '--out',
        'public/i18n',
        '--quiet',
    ],
    { stdio: 'inherit' },
);
copyFileSync(`${fixtures}/theme.json`, 'public/i18n/theme.json');
rmSync('public/i18n/messages.d.ts', { force: true });
