import { Container, type DestroyOptions } from 'pixi.js';
import { type InlineAlign, SilkText, type SilkTextOptions, type TextInline } from './SilkText';

/**
 * A size for an inline object: local units, or a size that follows the font. `em` is the font size,
 * `cap` the height of capital letters and digits, `line` the line height.
 */
export type InlineSize = number | 'em' | 'cap' | 'line';

/** An object that flows with the text of a {@link SilkRichText}. */
export interface RichInline {
    /**
     * What to show: a Sprite, a SilkGraphics or any container. Pass a function to show the object
     * more than once: it is called once per `{name}` token. One instance only fills the first token.
     */
    object: Container | (() => Container);
    /** Width of the box. Default from the object's bounds, scaled to `height` when that is set. */
    width?: InlineSize;
    /**
     * Height of the box. The object is scaled to fit the box, keeping its aspect, and centred in it.
     * Default from the object's bounds, scaled to `width` when that is set.
     */
    height?: InlineSize;
    /** Vertical placement, as in {@link TextInline.align}. Default `middle`. */
    align?: InlineAlign;
    /** Moves the object down (positive) or up after alignment, in local units. Default 0. */
    offsetY?: number;
    /** Space left and right of the object, in local units. Default 0. */
    margin?: number;
}

/** Options of a {@link SilkRichText}: the options of its {@link SilkText} plus the inline objects. */
export interface SilkRichTextOptions extends Omit<SilkTextOptions, 'inlines'> {
    /** Objects shown where `{name}` appears in the text, by name. Default none. */
    inlines?: Record<string, RichInline>;
}

interface Placed {
    /** Objects made by a factory, one per token. */
    made: Container[];
    /** The object of a definition that is a plain instance. */
    single: Container | null;
}

const resolve = (v: InlineSize | undefined, em: number, cap: number, line: number): number | undefined =>
    v === 'em' ? em : v === 'cap' ? cap : v === 'line' ? line : v;

/**
 * A {@link SilkText} with sprites, SilkGraphics or any container inside its lines. Write `{name}`
 * in the text and list the object under `inlines`. Each token takes a box that flows with the
 * text: it wraps, aligns and follows right-to-left order like a character, and the line grows when
 * the object is taller than the text. The object is scaled to the box and placed in it every frame,
 * so it follows text, style and size changes.
 *
 * @example
 * ```ts
 * import { Sprite, Texture } from 'pixi.js';
 * import { SilkGraphics } from 'pixi-silk';
 * import { SilkRichText } from 'pixi-silk/text';
 *
 * const win = new SilkRichText({
 *     text: 'You won {coin} 250.00 and {star} x3',
 *     fontSize: 24,
 *     inlines: {
 *         coin: { object: new Sprite(Texture.WHITE), height: 'cap', margin: 2 },
 *         star: { object: () => new SilkGraphics().star(0, 0, 5, 10, 5).fill(0xffd60a), height: 'em' },
 *     },
 * });
 * app.stage.addChild(win);
 * ```
 */
export class SilkRichText extends Container {
    /** The text. Style it through this object, except for `inlines`, which this container owns. */
    readonly textObject: SilkText;

    private _defs: Record<string, RichInline>;
    private readonly _placed = new Map<string, Placed>();
    private _key = '';

    constructor(options: SilkRichTextOptions = {}) {
        const { inlines = {}, label, ...rest } = options;

        super({ label: label ?? 'SilkRichText' });
        this.textObject = new SilkText(rest);
        this.addChild(this.textObject);
        this._defs = inlines;
        this.onRender = () => this.sync();
        this.sync();
    }

    /** The text, with `{name}` tokens where inline objects go. */
    get text(): string {
        return this.textObject.text;
    }

    /** Sets {@link SilkRichText.text}. */
    set text(v: string | number) {
        this.textObject.text = v;
    }

    /** The inline objects by name. Set a new object to change them. Objects that left are removed, not destroyed. */
    get inlines(): Record<string, RichInline> {
        return this._defs;
    }

    /** Sets {@link SilkRichText.inlines}. */
    set inlines(v: Record<string, RichInline>) {
        for (const [name, placed] of this._placed) {
            if (v[name]?.object === this._defs[name]?.object) continue;
            for (const o of placed.made) o.destroy({ children: true });
            if (placed.single) this.removeChild(placed.single);
            this._placed.delete(name);
        }
        this._defs = v;
        this._key = '';
        this.sync();
    }

    /**
     * Measures the objects, lays the text out around them and moves them into their boxes. Runs
     * before every render, so call it only to read positions in the same frame as a change.
     */
    sync(): void {
        const t = this.textObject;
        const em = t.fontSize;
        const atlas = t.atlas;
        const font = { family: t.fontFamily, weight: t.fontWeight, style: t.fontStyle };
        const cap = atlas.ink(font, 'H').ascent * (em / atlas.size) || em * 0.7;
        const line = t.lineHeight > 0 ? t.lineHeight : t.layout.lineHeight;
        const boxes: Record<string, TextInline> = {};
        const fits = new Map<string, { scale: number; bx: number; by: number; bw: number; bh: number }>();

        for (const [name, def] of Object.entries(this._defs)) {
            const sample = this._sample(name, def);
            const b = sample.getLocalBounds();
            const bw = Math.max(b.width, 1e-6);
            const bh = Math.max(b.height, 1e-6);
            let w = resolve(def.width, em, cap, line);
            let h = resolve(def.height, em, cap, line);
            let scale = 1;

            if (w !== undefined && h !== undefined) scale = Math.min(w / bw, h / bh);
            else if (h !== undefined) scale = h / bh;
            else if (w !== undefined) scale = w / bw;
            w ??= bw * scale;
            h ??= bh * scale;
            boxes[name] = { width: w, height: h, align: def.align, offsetY: def.offsetY, margin: def.margin };
            fits.set(name, { scale, bx: b.x, by: b.y, bw, bh });
        }
        const key = JSON.stringify(boxes);

        if (key !== this._key) {
            this._key = key;
            t.inlines = boxes;
        }
        // one object per token, in text order
        const used = new Map<string, number>();
        const shown = new Set<Container>();

        for (const r of t.inlineRects()) {
            const def = this._defs[r.name];
            const fit = fits.get(r.name);

            if (!def || !fit) continue;
            const n = used.get(r.name) ?? 0;
            const obj = this._occurrence(r.name, def, n);

            used.set(r.name, n + 1);
            if (!obj) continue;
            const s = fit.scale;

            obj.scale.set(s);
            obj.position.set(
                t.x + r.x + (r.width - fit.bw * s) / 2 - fit.bx * s,
                t.y + r.y + (r.height - fit.bh * s) / 2 - fit.by * s,
            );
            obj.visible = true;
            if (obj.parent !== this) this.addChild(obj);
            shown.add(obj);
        }
        for (const placed of this._placed.values()) {
            for (const o of [...placed.made, ...(placed.single ? [placed.single] : [])]) {
                if (!shown.has(o)) o.visible = false;
            }
        }
    }

    override destroy(options?: DestroyOptions): void {
        // objects made by factories belong to this text, given instances to the caller
        for (const placed of this._placed.values()) {
            for (const o of placed.made) o.destroy({ children: true });
            if (placed.single) this.removeChild(placed.single);
        }
        this._placed.clear();
        this.onRender = null;
        super.destroy(options);
    }

    private _entry(name: string): Placed {
        let p = this._placed.get(name);

        if (!p) {
            p = { made: [], single: null };
            this._placed.set(name, p);
        }

        return p;
    }

    /** An object to measure: the instance, or the first one a factory made. */
    private _sample(name: string, def: RichInline): Container {
        const p = this._entry(name);

        if (typeof def.object !== 'function') {
            p.single = def.object;

            return def.object;
        }
        if (!p.made.length) p.made.push(def.object());

        return p.made[0];
    }

    private _occurrence(name: string, def: RichInline, n: number): Container | null {
        const p = this._entry(name);

        if (typeof def.object !== 'function') return n === 0 ? def.object : null;
        while (p.made.length <= n) p.made.push(def.object());

        return p.made[n];
    }
}
