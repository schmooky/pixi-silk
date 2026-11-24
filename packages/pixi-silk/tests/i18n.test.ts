import { readFileSync } from 'node:fs';
import { BufferImageSource } from 'pixi.js';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { INSTANCE_FLOATS, SilkBundle, type ThemeData } from '../src/i18n';
import { Silk, SilkMessage, type SilkTheme, type UpdateEvent } from '../src/i18n-pixi';

// The site compiles the compiler's shop example into apps/site/public/i18n (committed, deterministic).
const dir = new URL('../../../apps/site/public/i18n/', import.meta.url);
const bundle = (locale: string) =>
    new SilkBundle(readFileSync(new URL(`${locale}.silk`, dir)).buffer.slice(0) as ArrayBuffer, `/i18n/${locale}.silk`);
const page = async () => new BufferImageSource({ resource: new Uint8Array(4), width: 1, height: 1 });

let silk: Silk;
let theme: SilkTheme;
let events: UpdateEvent[];

beforeAll(async () => {
    silk = await Silk.create();
    for (const l of ['en', 'ar']) await silk.addBundle(bundle(l), page);
    theme = silk.createTheme(JSON.parse(readFileSync(new URL('theme.json', dir), 'utf8')) as ThemeData);
    events = [];
    silk.on('update', (e) => events.push(e));
});

async function coins(locale = 'en', count = 1234) {
    const set = await silk.prepare({
        locale,
        theme,
        messages: { coins: { key: 'shop.coins', size: 24, values: { count } } },
    });

    return new SilkMessage(set.get('coins'));
}

/** Counts writes to a message's instance buffer and layouts, by watching `layout` and the buffer. */
function watch(m: SilkMessage) {
    const geometry = (m as unknown as { _geometry: { instances: { update: () => void } } })._geometry;
    const update = vi.spyOn(geometry.instances, 'update');

    return { writes: () => update.mock.calls.length, layout: () => m.layout };
}

describe('update tiers (brief sec. 6.3)', () => {
    it('value-fast: a number of the same length rewrites only its slot', async () => {
        const m = await coins('en', 1234);
        const before = m.layout;
        const instances = before.instances.slice();
        const w = watch(m);

        events.length = 0;
        m.set({ count: 5678 });
        expect(events.map((e) => e.tier)).toEqual(['value-fast']);
        expect(w.layout()).toBe(before);
        expect(w.writes()).toBe(1);
        const slot = before.slots[0];

        for (let i = 0; i < instances.length; i++) {
            if (instances[i] === before.instances[i]) continue;
            const instance = Math.floor(i / INSTANCE_FLOATS);

            expect(instance).toBeGreaterThanOrEqual(slot.first);
            expect(instance).toBeLessThan(slot.first + slot.count);
            expect(i % INSTANCE_FLOATS).toBe(3);
        }
    });

    it('value: a number of another length lays out again', async () => {
        const m = await coins('en', 1234);
        const before = m.layout;

        events.length = 0;
        m.set({ count: 123456 });
        expect(events.map((e) => e.tier)).toEqual(['value']);
        expect(m.layout).not.toBe(before);
    });

    it('variant: a new plural category swaps the baked variant', async () => {
        const m = await coins('en', 5);

        events.length = 0;
        m.set({ count: 1 });
        expect(events.map((e) => e.tier)).toEqual(['variant']);
        expect(m.accessibleText).toBe('You have 1 coin ');
        const ar = await coins('ar', 3);

        events.length = 0;
        ar.set({ count: 11 });
        expect(events.map((e) => e.tier)).toEqual(['variant']);
    });

    it('layout: width, alignment and size re-break without shaping', async () => {
        const m = await coins('en', 3);

        events.length = 0;
        m.maxWidth = 120;
        m.align = 'center';
        m.size = 30;
        expect(events.map((e) => e.tier)).toEqual(['layout', 'layout', 'layout']);
        expect(m.layout.lines.length).toBeGreaterThan(1);
    });

    it('paint: theme.set rewrites style rows and writes no instance', async () => {
        const m = await coins('en', 3);
        const before = m.layout;
        const w = watch(m);
        const rows = theme.table.data.slice();

        events.length = 0;
        theme.set('gold', { fill: '#ffffff' });
        expect(events.map((e) => e.tier)).toEqual(['paint']);
        expect(w.writes()).toBe(0);
        expect(m.layout).toBe(before);
        expect(theme.table.data).not.toEqual(rows);
    });

    it('shape: a shape-relevant change warns and does not reshape', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        events.length = 0;
        theme.set('gold', { weight: 400 });
        expect(events.map((e) => e.tier)).toEqual(['shape', 'paint']);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('run silk compile again'));
        warn.mockRestore();
    });
});

describe('SilkMessage', () => {
    it('falls back to another locale for missing keys and exposes accessible text', async () => {
        const set = await silk.prepare({
            locale: 'ar',
            fallbackLocale: 'en',
            theme,
            messages: { title: { key: 'shop.title' }, terms: { key: 'shop.terms' } },
        });

        expect(set.get('title').bundle.locale).toBe('ar');
        expect(new SilkMessage(set.get('terms')).accessibleText).toBe('اقرأ شروط البيع.');
        await expect(silk.prepare({ locale: 'ar', theme, messages: { x: { key: 'nope' } } })).rejects.toThrow(/nope/);
    });

    it('reports taps on interactive spans as tagtap', async () => {
        const set = await silk.prepare({ locale: 'en', theme, messages: { terms: { key: 'shop.terms', size: 20 } } });
        const m = new SilkMessage(set.get('terms'));
        const hit = m.layout.hits[0];
        const tapped = vi.fn();

        m.on('tagtap', tapped);
        m.emit('pointertap', { global: { x: hit.x + 2, y: hit.y + 2 } } as never);
        expect(tapped).toHaveBeenCalledWith(expect.objectContaining({ tag: 'terms' }));
    });

    it('reports GPU memory', () => {
        expect(silk.stats()).toMatchObject({ bundles: 2, pages: 2 });
    });
});

describe('canvas text slots', () => {
    it('picks the direction of a name from its first strong letter', async () => {
        const { slotDirection } = await import('../src/i18n-canvas');

        expect(slotDirection('Alex')).toBe('ltr');
        expect(slotDirection('ليلى')).toBe('rtl');
        expect(slotDirection('42 שלום')).toBe('rtl');
        expect(slotDirection('\u{1F600} Sam')).toBe('ltr');
    });
});
