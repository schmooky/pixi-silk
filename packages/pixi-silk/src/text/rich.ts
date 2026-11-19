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
 * @internal Keeps the inline objects of a {@link SilkText} in their boxes. {@link SilkRichText} and
 * `TextEditor` use it. Objects go into the text's parent, so the text must have one before `sync`.
 */
export class InlinePlacer {
    private _defs: Record<string, RichInline>;
    private readonly _placed = new Map<string, Placed>();
    private _key = '';
    private readonly _text: SilkText;

    constructor(text: SilkText, defs: Record<string, RichInline> = {}) {
        this._text = text;
        this._defs = defs;
    }

    /** The definitions, by name. */
    get defs(): Record<string, RichInline> {
        return this._defs;
    }

    /** Sets {@link InlinePlacer.defs}. Objects that left are removed, factory-made ones destroyed. */
    set defs(v: Record<string, RichInline>) {
        for (const [name, placed] of this._placed) {
            if (v[name]?.object === this._defs[name]?.object) continue;
            for (const o of placed.made) o.destroy({ children: true });
            placed.single?.parent?.removeChild(placed.single);
            this._placed.delete(name);
        }
        this._defs = v;
        this._key = '';
    }

    /** Measures the objects, gives the text their boxes and moves each object into its box. */
    sync(): void {
        const t = this._text;
        const host = t.parent;
        const em = t.fontSize;
        const atlas = t.atlas;
        const font = { family: t.fontFamily, weight: t.fontWeight, style: t.fontStyle };
        const names = Object.keys(this._defs);

        if (!names.length && !this._key) return;
        const cap = atlas.ink(font, 'H').ascent * (em / atlas.size) || em * 0.7;
        const line =
            t.lineHeight > 0
                ? t.lineHeight
                : (atlas.metrics(font).ascent + atlas.metrics(font).descent) * (em / atlas.size);
        const boxes: Record<string, TextInline> = {};
        const fits = new Map<string, { scale: number; bx: number; by: number; bw: number; bh: number }>();

        for (const name of names) {
            const def = this._defs[name];
            const b = this._sample(name, def).getLocalBounds();
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
        // objects go right above the text, in text order
        let at = host ? host.getChildIndex(t) + 1 : 0;

        for (const r of t.inlineRects()) {
            const def = this._defs[r.name];
            const fit = fits.get(r.name);

            if (!def || !fit || !host) continue;
            const n = used.get(r.name) ?? 0;
            const obj = this._occurrence(r.name, def, n);

            used.set(r.name, n + 1);
            if (!obj) continue;
            const s = fit.scale;
            // the text's own transform, so the object sits on the text however it is placed
            const tx = t.x + (r.x + (r.width - fit.bw * s) / 2 - fit.bx * s) * t.scale.x;
            const ty = t.y + (r.y + (r.height - fit.bh * s) / 2 - fit.by * s) * t.scale.y;

            obj.scale.set(s * t.scale.x, s * t.scale.y);
            obj.position.set(tx, ty);
            obj.visible = true;
            if (obj.parent !== host) host.addChildAt(obj, Math.min(at, host.children.length));
            at = host.getChildIndex(obj) + 1;
            shown.add(obj);
        }
        for (const placed of this._placed.values()) {
            for (const o of [...placed.made, ...(placed.single ? [placed.single] : [])]) {
                if (!shown.has(o)) o.visible = false;
            }
        }
    }

    /** Destroys the objects factories made and takes given instances out of the text's parent. */
    destroy(): void {
        for (const placed of this._placed.values()) {
            for (const o of placed.made) o.destroy({ children: true });
            placed.single?.parent?.removeChild(placed.single);
        }
        this._placed.clear();
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

/**
 * A {@link SilkText} with sprites, SilkGraphics or any container inside its lines. Write `{name}`
 * in the text and list the object under `inlines`. Each token takes a box that flows with the
 * text: it wraps, aligns and follows right-to-left order like a character, and the line grows when
 * the object is taller than the text. The object is scaled to the box and placed in it every frame,
 * so it follows text, style, anchor and size changes.
 *
 * @example
 * ```ts
 * import { Sprite, Texture } from 'pixi.js';
 * import { SilkGraphics } from 'pixi-silk';
 * import { SilkRichText } from 'pixi-silk/text';
 *
 * const status = new SilkRichText({
 *     text: 'Synced {dot} 2 min ago, rated {star} 4.8',
 *     fontSize: 24,
 *     inlines: {
 *         dot: { object: new Sprite(Texture.WHITE), height: 'cap', margin: 2 },
 *         star: { object: () => new SilkGraphics().star(0, 0, 5, 10, 5).fill(0xffd60a), height: 'em' },
 *     },
 * });
 * app.stage.addChild(status);
 * ```
 */
export class SilkRichText extends Container {
    /** The text. Style it through this object, except for `inlines`, which this container owns. */
    readonly textObject: SilkText;

    private readonly _placer: InlinePlacer;

    constructor(options: SilkRichTextOptions = {}) {
        const { inlines = {}, label, ...rest } = options;

        super({ label: label ?? 'SilkRichText' });
        this.textObject = new SilkText(rest);
        this.addChild(this.textObject);
        this._placer = new InlinePlacer(this.textObject, inlines);
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
        // place the objects now, so the size is right for whoever reads it next
        this.sync();
    }

    /**
     * Point of the text box at the position, as on {@link SilkText.anchor}: (0, 0) top left, (0.5,
     * 0.5) centre. The inline objects move with it.
     */
    get anchor(): SilkText['anchor'] {
        return this.textObject.anchor;
    }

    /** The inline objects by name. Set a new object to change them. Objects that left are removed, not destroyed. */
    get inlines(): Record<string, RichInline> {
        return this._placer.defs;
    }

    /** Sets {@link SilkRichText.inlines}. */
    set inlines(v: Record<string, RichInline>) {
        this._placer.defs = v;
        this.sync();
    }

    /**
     * Measures the objects, lays the text out around them and moves them into their boxes. Runs
     * before every render, so call it only to read positions in the same frame as a change.
     */
    sync(): void {
        this._placer.sync();
    }

    override destroy(options?: DestroyOptions): void {
        // objects made by factories belong to this text, given instances to the caller
        this._placer.destroy();
        this.onRender = null as never;
        super.destroy(options);
    }
}
