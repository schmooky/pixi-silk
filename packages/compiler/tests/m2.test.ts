import { readFileSync } from 'node:fs';
import { RunFlag, readBundle } from 'pixi-silk/i18n';
import { describe, expect, it } from 'vitest';
import { compileProject } from '../src/compile';
import { loadProject } from '../src/project';
import { CORPUS } from './corpus';
import { fixtures, project } from './helpers';

const goldens = JSON.parse(readFileSync(new URL('./goldens/shaping.json', import.meta.url), 'utf8')) as {
    cases: Record<string, [number, number][][]>;
};

async function fixtureProject() {
    const p = await loadProject({
        config: `${fixtures}silk.config.json`,
        strings: `${fixtures}strings.xlsx`,
        theme: `${fixtures}theme.json`,
    });

    return p;
}

describe('baked shaping', () => {
    it('matches plain HarfBuzz output for the corpus (goldens)', () => {
        for (const c of CORPUS) {
            const p = project({ [c.name]: { [`${c.locale}.other`]: c.text } });
            const r = compileProject(p);

            expect(
                r.diagnostics.filter((d) => d.severity === 'error'),
                c.name,
            ).toEqual([]);
            const dump = r.debug.get(c.locale) as {
                messages: { variants: { segments: { kind: string; glyphs: number[][] }[] }[] }[];
            };
            const runs = dump.messages[0].variants[0].segments
                .filter((s) => s.kind === 'static')
                .map((s) => s.glyphs.map((g) => [g[0], g[1]]));

            expect(runs, c.name).toEqual(goldens.cases[c.name]);
        }
    });

    it('keeps Arabic joining forms across a style change inside a word', () => {
        const plain = compileProject(project({ k: { 'ar.other': 'مرحبا' } }));
        const styled = compileProject(project({ k: { 'ar.other': 'مر<b>حب</b>ا' } }));
        const glyphs = (r: typeof plain) =>
            (
                r.debug.get('ar') as { messages: { variants: { segments: { glyphs: number[][] }[] }[] }[] }
            ).messages[0].variants[0].segments.flatMap((s) => s.glyphs.map((g) => g[0]));

        // <b> is paint only here: one item, the same glyphs
        expect(glyphs(styled)).toEqual(glyphs(plain));
        // a weight change splits the item but shapes with the whole word as context: medial forms stay
        const bold = compileProject(project({ k: { 'ar.other': 'مر<strong>حب</strong>ا' } }));
        const dump = (
            bold.debug.get('ar') as { messages: { variants: { segments: { face: number; glyphs: number[][] }[] }[] }[] }
        ).messages[0].variants[0].segments;

        expect(dump.map((s) => s.face)).toEqual([2, 3, 2]);
        const boldWord = compileProject(project({ k: { 'ar.other': '<strong>مرحبا</strong>' } }));
        const whole = (
            boldWord.debug.get('ar') as { messages: { variants: { segments: { glyphs: number[][] }[] }[] }[] }
        ).messages[0].variants[0].segments[0].glyphs;
        const middle = dump[1].glyphs.map((g) => g[0]);

        expect(whole.filter((g) => g[4] === 2 || g[4] === 3).map((g) => g[0])).toEqual(middle);
    });

    it('bakes bidi levels and break flags', () => {
        const r = compileProject(project({ k: { 'ar.other': 'اشترِ Gold Pack الآن' } }));
        const b = readBundle(r.bundles.get('ar')?.slice().buffer as ArrayBuffer);
        const levels = [...b.runs.level];

        expect(new Set(levels)).toEqual(new Set([1, 2]));
        // a break opportunity after every space
        const breaks = [...b.runs.flags]
            .map((f, i) => (f & RunFlag.BreakBefore ? b.runs.cluster[i] : -1))
            .filter((c) => c >= 0);

        expect(breaks.sort((x, y) => x - y)).toEqual([6, 11, 16]);
        const spaces = [...b.runs.flags].filter((f) => f & RunFlag.Whitespace).length;

        expect(spaces).toBe(3);
    });

    it('marks newlines as mandatory breaks', () => {
        const r = compileProject(project({ k: { 'en.other': 'one\\ntwo' } }));
        const b = readBundle(r.bundles.get('en')?.slice().buffer as ArrayBuffer);
        const i = [...b.runs.flags].findIndex((f) => f & RunFlag.Newline);

        expect(i).toBeGreaterThan(0);
        expect(b.runs.flags[i + 1] & RunFlag.Mandatory).toBeTruthy();
    });
});

describe('digit tables', () => {
    it('bakes tabular native and Latin digits, separators and zero-width marks', async () => {
        const r = compileProject(await fixtureProject());
        const ar = r.debug.get('ar') as {
            digitTables: { numberingSystem: string; tabular: boolean; entries: string }[];
        };

        expect(ar.digitTables).toHaveLength(1);
        expect(ar.digitTables[0].numberingSystem).toBe('arab');
        expect(ar.digitTables[0].tabular).toBe(true);
        for (const ch of '٠١٢٣٤٥٦٧٨٩0123456789٫٬,.-%\u061c\u200e\u200f')
            expect(ar.digitTables[0].entries).toContain(ch);
    });
});

describe('errors', () => {
    it('reports a missing glyph with key, locale and character instead of baking .notdef', () => {
        const r = compileProject(project({ k: { 'en.other': 'snow \u2603' } }));
        const d = r.diagnostics.find((x) => x.code === 'missing-glyph');

        expect(d).toMatchObject({ key: 'k', locale: 'en', severity: 'error' });
        expect(d?.message).toContain('U+2603');
        expect(r.bundles.size).toBe(0);
    });
});

describe('atlas and outputs', () => {
    it('is deterministic: the same inputs give byte-identical bundles and pages', async () => {
        const a = compileProject(await fixtureProject());
        const b = compileProject(await fixtureProject());

        expect(a.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
        expect([...a.bundles.keys()].sort()).toEqual(['ar', 'en', 'he']);
        for (const [locale, bytes] of a.bundles)
            expect(Buffer.from(bytes).equals(Buffer.from(b.bundles.get(locale) ?? []))).toBe(true);
        a.atlas.pages.forEach((p, i) =>
            expect(Buffer.from(p.png).equals(Buffer.from(b.atlas.pages[i].png))).toBe(true),
        );
    });

    it('groups pages by script and shares them between locales', async () => {
        const r = compileProject(await fixtureProject());

        expect(r.atlas.pages.map((p) => p.file)).toEqual(['arabic-0.png', 'hebrew-0.png', 'latin-0.png']);
        const en = r.debug.get('en') as { pages: string[] };
        const ar = r.debug.get('ar') as { pages: string[] };

        expect(en.pages).toEqual(['latin-0.png']);
        expect(ar.pages).toContain('arabic-0.png');
    });

    it('derives the distance range from the theme and warns when an effect clips', () => {
        const p = project({ k: { 'en.other': 'x' } });

        p.theme = { $silk: 2, styles: { haze: { glow: { color: '#fff', width: 20 } } } };
        const r = compileProject(p);

        expect(r.manifest.distanceRange).toBe(16);
        expect(r.diagnostics.find((d) => d.code === 'effect-clips')?.message).toContain('style "haze"');
    });
});

describe('per-chunk bundles (--split-by, M6)', () => {
    it('writes one bundle per key prefix and locale, each with only its pages', async () => {
        const r = compileProject(await fixtureProject(), { splitBy: 'keyPrefix' });

        expect([...r.bundles.keys()].sort()).toEqual([
            'ar.player',
            'ar.shop',
            'en.player',
            'en.shop',
            'he.player',
            'he.shop',
        ]);
        const player = readBundle(r.bundles.get('en.player')?.slice().buffer as ArrayBuffer);
        const shop = readBundle(r.bundles.get('en.shop')?.slice().buffer as ArrayBuffer);

        expect(player.messages.length / 6).toBe(1);
        expect(shop.messages.length / 6).toBe(3);
        expect((r.debug.get('en.player') as { pages: string[] }).pages).toEqual(['latin-0.png']);
    });
});

describe('missing weights', () => {
    it('warns when a style asks for a weight the script family lacks', () => {
        const p = project({ k: { 'he.other': '<strong>שלום</strong>' } });

        p.config.fonts = p.config.fonts.filter((f) => !(f.family === 'Noto Sans Hebrew' && f.weight === 700));
        const r = compileProject(p);
        const d = r.diagnostics.find((x) => x.code === 'missing-weight');

        expect(d).toMatchObject({ severity: 'warning', locale: 'he', key: 'k' });
        expect(d?.message).toContain('Noto Sans Hebrew has no face near weight 700');
        expect(r.bundles.size).toBe(1);
    });
});
