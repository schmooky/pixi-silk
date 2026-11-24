import { readFileSync } from 'node:fs';
import { type BundleData, hashKey, readBundle, SILK_MAJOR, SILK_MINOR, SilkBundleError } from 'pixi-silk/i18n';
import { describe, expect, it, vi } from 'vitest';
import { lintRows, normalizeCell, type SheetRow } from '../src/author/lint';
import { parseMessage, plainText } from '../src/author/parse';
import { parseSlots } from '../src/config';
import { emitMessagesDts } from '../src/emit/dts';
import { writeBundle } from '../src/emit/writer';
import { readCsvRows, readSheetRows } from '../src/import/xlsx';

function sample(): BundleData {
    return {
        major: SILK_MAJOR,
        minor: SILK_MINOR,
        flags: 1,
        locale: 'ar',
        dir: 1,
        numberingSystem: 'arab',
        strings: ['ar', 'arab', 'shop.title', 'gold', 'latin-0.png'],
        tags: new Uint32Array([3]),
        faces: new Int32Array([0, 1000, 1, 2, 1069, -293, 0, 2, 400]),
        pages: new Float32Array([0, 4, 0, 256, 128, 4, 40]),
        glyphs: new Int16Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 30, 40, -10, -20, 500, 700, 0]),
        runs: {
            glyph: new Uint16Array([1, 0, 1]),
            advance: new Int16Array([600, 260, 600]),
            dx: new Int16Array([0, 0, -5]),
            dy: new Int16Array([0, 0, 12]),
            cluster: new Uint16Array([0, 1, 2]),
            level: new Uint8Array([1, 1, 1]),
            flags: new Uint8Array([0, 8, 1]),
        },
        messages: new Uint32Array([hashKey('shop.title'), 2, 0xffffffff, 0, 1, 0]),
        variants: new Uint32Array([5, 0, 1, 0, 0, 1, 2]),
        segments: new Uint32Array([0, 0, 3, 0, 1]),
        spans: new Uint16Array([0, 0, 0, 0, 3]),
        slots: new Uint32Array(0),
        digits: new Uint32Array(0),
        digitEntries: new Int32Array(0),
    };
}

describe('.silk format', () => {
    it('round-trips every section', () => {
        const data = sample();
        const bytes = writeBundle(data);
        const back = readBundle(bytes.buffer as ArrayBuffer);

        expect(back.locale).toBe('ar');
        expect(back.dir).toBe(1);
        expect(back.numberingSystem).toBe('arab');
        expect(back.strings.slice(0, 5)).toEqual(data.strings);
        expect([...back.tags]).toEqual([3]);
        for (const k of ['faces', 'pages', 'glyphs', 'messages', 'variants', 'segments', 'spans'] as const) {
            expect([...back[k]]).toEqual([...data[k]]);
        }
        for (const k of Object.keys(data.runs) as (keyof BundleData['runs'])[]) {
            expect([...back.runs[k]]).toEqual([...data.runs[k]]);
        }
    });

    it('aligns every section to 8 bytes and views the buffer without copying', () => {
        const bytes = writeBundle(sample());
        const view = new DataView(bytes.buffer);
        const count = view.getUint32(12, true);

        for (let i = 0; i < count; i++) expect(view.getUint32(16 + i * 12 + 4, true) % 8).toBe(0);
        const back = readBundle(bytes.buffer as ArrayBuffer);

        expect(back.runs.advance.buffer).toBe(bytes.buffer);
        expect(back.glyphs.buffer).toBe(bytes.buffer);
    });

    it('writes the same bytes for the same data', () => {
        expect(Buffer.from(writeBundle(sample())).equals(Buffer.from(writeBundle(sample())))).toBe(true);
    });

    it('refuses another major version and warns on a newer minor', () => {
        expect(() => readBundle(writeBundle({ ...sample(), major: 3 }).buffer as ArrayBuffer)).toThrow(/version 3/);
        const warn = vi.fn();

        readBundle(writeBundle({ ...sample(), minor: SILK_MINOR + 1 }).buffer as ArrayBuffer, warn);
        expect(warn).toHaveBeenCalledOnce();
    });

    it('rejects wrong magic and truncated buffers', () => {
        const bytes = writeBundle(sample());

        expect(() => readBundle(new ArrayBuffer(8))).toThrow(SilkBundleError);
        const bad = bytes.slice();

        bad[0] = 0;
        expect(() => readBundle(bad.buffer)).toThrow(/magic/);
        expect(() => readBundle(bytes.slice(0, bytes.length - 64).buffer)).toThrow(/truncated/);
    });

    it('stores u32 glyph indices when asked', () => {
        const data = sample();

        data.runs.glyph = new Uint32Array([70000, 0, 1]);
        const back = readBundle(writeBundle(data).buffer as ArrayBuffer);

        expect(back.runs.glyph).toBeInstanceOf(Uint32Array);
        expect(back.runs.glyph[0]).toBe(70000);
    });
});

describe('authoring syntax', () => {
    it('parses placeholders, tags, objects and escapes', () => {
        const m = parseMessage('Hello {name}, you have <gold>{count}</gold> coins <coin/> \\{x\\} \\<b\\> \\\\ a\\nb');

        expect(m.issues).toEqual([]);
        expect(m.holes.map((h) => `${h.kind}:${h.name}`)).toEqual(['slot:name', 'slot:count', 'object:coin']);
        expect(m.spans).toEqual([{ tag: 'gold', start: 18, end: 19, depth: 1 }]);
        expect(plainText(m)).toBe('Hello {name}, you have {count} coins  {x} <b> \\ a\nb');
    });

    it('reports attributes, crossed and unclosed tags, bad names and depth', () => {
        const codes = (s: string) => parseMessage(s).issues.map((i) => i.code);

        expect(codes('<b class="x">a</b>')).toContain('tag-attributes');
        expect(codes('<b><i>x</b></i>')).toContain('crossed-tags');
        expect(codes('<b>open')).toEqual(['unclosed-tag']);
        expect(codes('{Name}')).toEqual(['bad-placeholder']);
        expect(codes('a } b')).toEqual(['stray-brace']);
        expect(codes('<a><b><c><d><e>x</e></d></c></b></a>')).toContain('too-deep');
        expect(codes('=1+1')).toEqual(['formula-prefix']);
        expect(codes('\\q')).toEqual(['bad-escape']);
    });

    it('turns <nbsp/> and <zwj/> into characters', () => {
        expect(parseMessage('a<nbsp/>b<zwj/>c').text).toBe('a\u00a0b\u200dc');
    });

    it('parses slot declarations', () => {
        const { slots, errors } = parseSlots('count:number(maxDigits=7,tabular):plural; name:text(maxChars=12)');

        expect(errors).toEqual([]);
        expect(slots).toEqual([
            { name: 'count', type: 'number', maxDigits: 7, maxChars: 16, tabular: true, plural: true },
            { name: 'name', type: 'text', maxDigits: 7, maxChars: 12, tabular: false, plural: false },
        ]);
        expect(parseSlots('x:color').errors).toHaveLength(1);
    });
});

describe('normalizer', () => {
    it('applies NFC, line endings, trimming and strips invisibles', () => {
        const n = normalizeCell('  é\r\nhello\u200f\u200b world\u00a0! ');

        expect(n.text).toBe('é\nhello world !');
        expect(n.changes.map((c) => c.code)).toEqual(['nfc', 'trimmed', 'invisible']);
    });

    it('keeps joiners inside emoji', () => {
        expect(normalizeCell('\u{1F468}\u200d\u{1F469}').text).toBe('\u{1F468}\u200d\u{1F469}');
    });
});

const config = {
    sourceLocale: 'en',
    locales: { en: {}, ar: {} },
    fonts: [],
    objects: ['coin'],
};

function row(key: string, cells: Record<string, string>, slots = ''): SheetRow {
    return {
        sheet: 's',
        row: 2,
        key,
        context: '',
        slots,
        maxLen: 0,
        cells: Object.entries(cells).map(([h, value], i) => {
            const [locale, category] = h.split('.') as [string, 'other'];

            return { locale, category, value, column: String.fromCharCode(69 + i) };
        }),
    };
}

describe('linter', () => {
    it('checks placeholders and tags against the source locale', () => {
        const { diagnostics } = lintRows(
            [row('k', { 'en.other': 'Hi {name} <gold>x</gold>', 'ar.other': 'مرحبا {nom}' }, 'name:text; nom:text')],
            config,
            ['gold'],
        );
        const codes = diagnostics.map((d) => d.code);

        expect(codes).toContain('placeholder-mismatch');
        expect(codes).toContain('tag-mismatch');
        const d = diagnostics.find((x) => x.code === 'placeholder-mismatch');

        expect(d).toMatchObject({ sheet: 's', row: 2, column: 'F', locale: 'ar', key: 'k' });
    });

    it('requires every plural category of each locale', () => {
        const cells = { 'en.one': '{n} coin', 'en.other': '{n} coins', 'ar.other': '{n} عملة', 'ar.one': '{n}' };
        const { diagnostics } = lintRows([row('k', cells, 'n:number:plural')], config);
        const missing = diagnostics.filter((d) => d.code === 'missing-plural').map((d) => d.message);

        expect(missing).toEqual([
            'ar needs the "zero" plural form',
            'ar needs the "two" plural form',
            'ar needs the "few" plural form',
            'ar needs the "many" plural form',
        ]);
    });

    it('flags unknown tags, objects, undeclared slots, duplicate and empty keys', () => {
        const { diagnostics } = lintRows(
            [
                row('a', { 'en.other': '<x>y</x> <star/> {z}', 'ar.other': '<x>y</x> <star/> {z}' }),
                row('a', { 'en.other': 'again' }),
                row('', { 'en.other': 'no key' }),
            ],
            config,
        );
        const codes = new Set(diagnostics.map((d) => d.code));

        for (const c of ['unknown-tag', 'unknown-object', 'undeclared-slot', 'duplicate-key', 'empty-key']) {
            expect(codes).toContain(c);
        }
    });
});

describe('xlsx import', () => {
    it('reads raw values and reports every Excel pitfall with its cell', async () => {
        const { rows, diagnostics } = await readSheetRows(
            readFileSync(new URL('../fixtures/pitfalls.xlsx', import.meta.url)),
        );
        const pit = (key: string) => rows.find((r) => r.key === key)?.cells[0]?.value;
        const at = (code: string) => diagnostics.find((d) => d.code === code);

        expect(at('formula-cell')).toMatchObject({ sheet: 'pitfalls', row: 2, column: 'C', severity: 'error' });
        expect(at('number-cell')).toMatchObject({ sheet: 'pitfalls', row: 3, severity: 'warning' });
        expect(at('date-cell')).toMatchObject({ sheet: 'pitfalls', row: 4, severity: 'error' });
        expect(pit('pit.zeros')).toBe('7');
        expect(pit('pit.apostrophe')).toBe('=not a formula');
        expect(pit('pit.altenter')).toMatch(/^first line\r?\nsecond line$/);
        expect(pit('pit.quotes')).toBe('\u201cQuoted\u201d \u2026 it\u2019s fine');

        const { diagnostics: lint, messages } = lintRows(rows, { ...config, locales: { en: {} } }, [
            'title',
            'gold',
            'terms',
        ]);

        expect(messages.get('pit.altenter')?.locales.en.other?.text).toBe('first line\nsecond line');
        expect(messages.get('pit.nbsp')?.locales.en.other?.text).toBe('ten coins');
        expect(messages.get('pit.rlm')?.locales.en.other?.text).toBe('hello world');
        expect(lint.find((d) => d.key === 'pit.apostrophe')?.code).toBe('formula-prefix');
    });

    it('reads the shop sample without errors', async () => {
        const { rows, diagnostics } = await readSheetRows(
            readFileSync(new URL('../fixtures/strings.xlsx', import.meta.url)),
        );
        const lint = lintRows(rows, { ...config, locales: { en: {}, ar: {}, he: {} } }, ['title', 'gold', 'terms']);

        expect(diagnostics).toEqual([]);
        expect(lint.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
        expect(rows.map((r) => r.key)).toEqual(['shop.title', 'player.greeting', 'shop.coins', 'shop.terms']);
    });

    it('accepts CSV only as UTF-8 with a byte order mark', () => {
        const body = 'key,en.other\nhello,"Hi, ""you""\nthere"\n';
        const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(body)]);

        expect(readCsvRows(new TextEncoder().encode(body)).diagnostics[0].code).toBe('csv-encoding');
        expect(readCsvRows(withBom).rows[0].cells[0].value).toBe('Hi, "you"\nthere');
    });
});

describe('messages.d.ts', () => {
    it('types every key with its slots', () => {
        const { messages } = lintRows(
            [row('shop.coins', { 'en.other': '{count} coins {who}' }, 'count:number; who:text')],
            {
                ...config,
                locales: { en: {} },
            },
        );
        const dts = emitMessagesDts({ messages, diagnostics: [] });

        expect(dts).toContain('"shop.coins": { count: number; who: string; };');
        expect(dts).toContain('interface SilkMessageRegistry extends SilkMessages {}');
    });
});
