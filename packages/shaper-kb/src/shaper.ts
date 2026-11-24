import { fontHash, type RuntimeShaper, type ShapedGlyphOut } from 'pixi-silk/i18n';
import { type FontTables, readFont } from './font';

/** Where the kb_text_shape WebAssembly module comes from: its bytes, a compiled module or a URL. */
export type KbWasmSource = BufferSource | WebAssembly.Module | string | URL;

interface KbExports {
    memory: WebAssembly.Memory;
    kb_alloc(size: number): number;
    kb_free(ptr: number): void;
    kb_init(font: number, size: number): number;
    kb_shape(codepoints: number, count: number, direction: number, out: number, max: number): number;
}

/** Ints the WebAssembly side writes per glyph (see wasm/kb_wasm.c). */
const GLYPH_INTS = 6;

let shared: Promise<WebAssembly.Module> | null = null;

/**
 * Compiles the module once per source. The default is `kb.wasm` next to this file, fetched. In
 * Node, pass the bytes (`readFileSync`), since `fetch` cannot read `file:` URLs.
 */
function compile(source?: KbWasmSource): Promise<WebAssembly.Module> {
    if (source instanceof WebAssembly.Module) return Promise.resolve(source);
    if (source && typeof source !== 'string' && !(source instanceof URL)) return WebAssembly.compile(source);
    if (!source && shared) return shared;
    const url = source ?? new URL('./kb.wasm', import.meta.url);
    const module = fetch(url)
        .then((r) => {
            if (!r.ok) throw new Error(`@pixi-silk/shaper-kb: cannot load ${String(url)} (${r.status})`);
            return r.arrayBuffer();
        })
        .then((bytes) => WebAssembly.compile(bytes));

    if (!source) shared = module;
    return module;
}

/** Options of {@link createKbShaper}. */
export interface KbShaperOptions {
    /** The WebAssembly module. Default `kb.wasm` next to this module, fetched once. */
    wasm?: KbWasmSource;
}

/**
 * A {@link RuntimeShaper} for one TrueType font, backed by kb_text_shape compiled to WebAssembly
 * (62 kB with brotli). It shapes Arabic, Hebrew, Latin and the other scripts kb_text_shape knows,
 * with the bidi algorithm for mixed runs. Each shaper owns one WebAssembly instance and its memory.
 */
export class KbShaper implements RuntimeShaper {
    readonly fontHash: string;
    readonly unitsPerEm: number;
    /** The font's tables: outlines and vertical metrics. */
    readonly font: FontTables;
    private readonly _kb: KbExports;
    private _cps = 0;
    private _out = 0;
    private _capacity = 0;

    /** @internal Use {@link createKbShaper}. */
    constructor(instance: WebAssembly.Instance, bytes: Uint8Array) {
        this._kb = instance.exports as unknown as KbExports;
        this.font = readFont(bytes);
        this.unitsPerEm = this.font.unitsPerEm;
        this.fontHash = fontHash(bytes);
        // the font bytes stay in WebAssembly memory for the shaper's life
        const ptr = this._kb.kb_alloc(bytes.length);

        new Uint8Array(this._kb.memory.buffer, ptr, bytes.length).set(bytes);
        if (!this._kb.kb_init(ptr, bytes.length))
            throw new Error('@pixi-silk/shaper-kb: kb_text_shape cannot read the font');
    }

    /**
     * Shapes `text` as one paragraph. Glyphs come in visual order with clusters as UTF-16 offsets.
     * `direction` sets the paragraph direction. `script`, `language` and `features` are ignored:
     * kb_text_shape picks the script from the text and applies the default features.
     */
    shape(
        text: string,
        options: { direction: 'ltr' | 'rtl' | 'auto'; script?: string; language?: string; features?: string[] },
    ): ShapedGlyphOut[] {
        const points: number[] = [];
        const offsets: number[] = [];

        for (let i = 0; i < text.length; ) {
            const cp = text.codePointAt(i) ?? 0;

            points.push(cp);
            offsets.push(i);
            i += cp > 0xffff ? 2 : 1;
        }
        if (!points.length) return [];
        const kb = this._kb;

        // glyphs can outnumber code points (decomposition), so room for twice as many
        if (points.length * 2 > this._capacity) {
            if (this._cps) kb.kb_free(this._cps);
            if (this._out) kb.kb_free(this._out);
            this._capacity = Math.max(64, points.length * 2);
            this._cps = kb.kb_alloc(this._capacity * 4);
            this._out = kb.kb_alloc(this._capacity * GLYPH_INTS * 4);
        }
        new Int32Array(kb.memory.buffer, this._cps, points.length).set(points);
        const dir = options.direction === 'ltr' ? 1 : options.direction === 'rtl' ? 2 : 0;
        const n = kb.kb_shape(this._cps, points.length, dir, this._out, this._capacity);
        const o = new Int32Array(kb.memory.buffer, this._out, n * GLYPH_INTS);
        const glyphs: ShapedGlyphOut[] = [];

        for (let i = 0; i < n; i++) {
            const g = i * GLYPH_INTS;

            glyphs.push({
                glyph: o[g],
                cluster: offsets[o[g + 1]] ?? 0,
                advance: o[g + 2],
                dx: o[g + 3],
                dy: o[g + 4],
            });
        }

        return glyphs;
    }
}

/** Loads kb_text_shape and a TrueType font into a {@link KbShaper}. */
export async function createKbShaper(font: Uint8Array | ArrayBuffer, options: KbShaperOptions = {}): Promise<KbShaper> {
    const bytes = font instanceof Uint8Array ? font : new Uint8Array(font);
    const instance = await WebAssembly.instantiate(await compile(options.wasm), {});

    return new KbShaper(instance, bytes);
}
