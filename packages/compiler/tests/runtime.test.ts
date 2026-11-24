import { fileURLToPath } from 'node:url';
import { INSTANCE_FLOATS, layoutMessage, reorder, SilkBundle, StyleTable, updateNumberSlot } from 'pixi-silk/i18n';
import { beforeAll, describe, expect, it } from 'vitest';
import { compileProject } from '../src/compile';
import { loadProject } from '../src/project';

const fixtures = fileURLToPath(new URL('../fixtures/', import.meta.url));
let bundles: Map<string, SilkBundle>;
let theme: StyleTable['theme'];

beforeAll(async () => {
    const project = await loadProject({
        config: `${fixtures}silk.config.json`,
        strings: `${fixtures}strings.xlsx`,
        theme: `${fixtures}theme.json`,
    });
    const result = compileProject(project);

    bundles = new Map(
        [...result.bundles].map(([l, b]) => [l, new SilkBundle(b.slice().buffer as ArrayBuffer, `/i18n/${l}.silk`)]),
    );
    theme = project.theme;
});

const options = (values: Record<string, number | string> = {}) => ({
    size: 28,
    maxWidth: 0,
    align: 'start' as const,
    lineHeight: 1.35,
    values,
    styles: new StyleTable(theme),
    inline: () => ({ width: 1.1, height: 1.1, baseline: 0.15 }),
});

describe('reorder (UAX #9 L2)', () => {
    it('reverses right-to-left runs and nested left-to-right runs', () => {
        expect(reorder([0, 0, 0])).toEqual([0, 1, 2]);
        expect(reorder([1, 1, 1])).toEqual([2, 1, 0]);
        expect(reorder([1, 2, 2, 1])).toEqual([3, 1, 2, 0]);
        expect(reorder([0, 1, 1, 0])).toEqual([0, 2, 1, 3]);
    });
});

describe('message layout from baked data', () => {
    it('finds messages, variants and plural categories', () => {
        const ar = bundles.get('ar') as SilkBundle;
        const m = ar.message('shop.coins');

        expect(m).toBeGreaterThanOrEqual(0);
        expect(ar.message('nope')).toBe(-1);
        expect(ar.keyOf(m)).toBe('shop.coins');
        expect(ar.pluralCategory(0)).toBe('zero');
        expect(ar.pluralCategory(2)).toBe('two');
        expect(ar.pluralCategory(5)).toBe('few');
        const zero = ar.variant(m, 'zero');
        const few = ar.variant(m, 'few');

        expect(zero).not.toBe(few);
        expect(ar.variantText(few)).toContain('￼');
    });

    it('formats numbers through the digit table in the pinned numbering system', () => {
        const ar = bundles.get('ar') as SilkBundle;
        const slot = ar.slot(ar.selector(ar.message('shop.coins')));
        const f = ar.formatNumber(slot, 1250);

        expect(slot.name).toBe('count');
        expect(f.text).toBe('١٬٢٥٠');
        expect(f.fellBack).toBe(false);
        expect(f.glyphs.every((g) => g > 0)).toBe(true);
        expect(new Set(f.advances.filter((_, i) => i !== 1)).size).toBe(1);
    });

    it('lays out an Arabic sentence right to left with the number slot as one left-to-right unit', () => {
        const ar = bundles.get('ar') as SilkBundle;
        const m = ar.message('shop.coins');
        const layout = layoutMessage(ar, ar.variant(m, ar.pluralCategory(1250)), options({ count: 1250 }));

        expect(layout.lines).toHaveLength(1);
        expect(layout.slots).toHaveLength(1);
        const slot = layout.slots[0];
        const xs = Array.from({ length: slot.count }, (_, i) => layout.instances[(slot.first + i) * INSTANCE_FLOATS]);

        // digits run left to right inside the slot
        expect([...xs].sort((a, b) => a - b)).toEqual(xs);
        // the coin object ends the sentence, so it sits at the left in right-to-left text
        const coin = layout.objects[0];

        expect(coin.name).toBe('coin');
        expect(coin.x).toBeLessThan(slot.formatted.advances.length ? xs[0] : 0);
        expect(layout.text).toContain('١٬٢٥٠');
        // aligned to the start: the right edge for Arabic
        expect(layout.lines[0].left).toBe(0);
    });

    it('wraps at baked break opportunities only', () => {
        const en = bundles.get('en') as SilkBundle;
        const m = en.message('shop.terms');
        const wide = layoutMessage(en, en.variant(m), options());
        const narrow = layoutMessage(en, en.variant(m), { ...options(), maxWidth: wide.width / 2 });

        expect(wide.lines).toHaveLength(1);
        expect(narrow.lines.length).toBeGreaterThan(1);
        for (const line of narrow.lines) expect(line.right - line.left).toBeLessThanOrEqual(wide.width / 2 + 0.01);
        expect(narrow.lines[1].baseline - narrow.lines[0].baseline).toBeCloseTo(28 * 1.35);
    });

    it('builds underline decorations and tap boxes for interactive spans', () => {
        const en = bundles.get('en') as SilkBundle;
        const layout = layoutMessage(en, en.variant(en.message('shop.terms')), options());
        const underlines = [];

        for (let i = 0; i < layout.count; i++) if (layout.instances[i * INSTANCE_FLOATS + 5] === 1) underlines.push(i);
        expect(underlines).toHaveLength(1);
        expect(layout.hits).toHaveLength(1);
        expect(layout.hits[0].tag).toBe('terms');
        expect(layout.hits[0].width).toBeCloseTo(layout.instances[underlines[0] * INSTANCE_FLOATS + 7]);
    });

    it('updates a number slot in place when the length matches (value-fast)', () => {
        const en = bundles.get('en') as SilkBundle;
        const m = en.message('shop.coins');
        const layout = layoutMessage(en, en.variant(m, 'other'), options({ count: 1234 }));
        const slot = layout.slots[0];
        const before = layout.instances.slice();
        const ok = updateNumberSlot(layout.instances, slot, en.formatNumber(en.slot(slot.slot), 5678));

        expect(ok).toBe(true);
        const changed: number[] = [];

        for (let i = 0; i < before.length; i++)
            if (before[i] !== layout.instances[i]) changed.push(Math.floor(i / INSTANCE_FLOATS));
        for (const c of changed) {
            expect(c).toBeGreaterThanOrEqual(slot.first);
            expect(c).toBeLessThan(slot.first + slot.count);
        }
        expect(updateNumberSlot(layout.instances, slot, en.formatNumber(en.slot(slot.slot), 123456))).toBe(false);
    });

    it('rewrites only the rows of a style on a paint change', () => {
        const en = bundles.get('en') as SilkBundle;
        const styles = new StyleTable(theme);

        layoutMessage(en, en.variant(en.message('shop.coins'), 'other'), { ...options({ count: 3 }), styles });
        styles.clean();
        const change = styles.set('gold', { fill: '#fff4b0' });

        expect(change.rows).toEqual([1]);
        expect(change.shapeChanged).toEqual([]);
        expect(styles.dirtyFrom).toBe(1);
        expect(styles.set('gold', { weight: 400 }).shapeChanged).toEqual(['weight']);
    });
});
