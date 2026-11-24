import {
    Buffer,
    BufferImageSource,
    BufferUsage,
    Container,
    DOMAdapter,
    ExtensionType,
    Geometry,
    ImageSource,
    Mesh,
    Rectangle,
    type Shader,
    Sprite,
    type Texture,
    type TextureSource,
} from 'pixi.js';
import { GLYPH_STRIDE, PageKind } from '../format';
import {
    INSTANCE_FLOATS,
    type InlineMetrics,
    layoutMessage,
    type MessageAlign,
    type MessageLayout,
    updateNumberSlot,
} from '../layout';
import { type BundlePage, SilkBundle } from '../messages';
import { StyleTable } from '../styles';
import { STYLE_FLOATS, type ThemeData, type ThemeStyle } from '../theme';
import { createMessageShader } from './shader';

/** The update tiers of brief sec. 6.3, cheapest first. */
export type UpdateTier = 'paint' | 'value-fast' | 'value' | 'variant' | 'layout' | 'shape';

/** What {@link Silk.on} reports for every update. */
export interface UpdateEvent {
    /** Which tier ran. */
    tier: UpdateTier;
    /** Milliseconds it took on the CPU. */
    ms: number;
    /** Message key, when one message changed. */
    key?: string;
}

/** A text slot to draw, as {@link DynamicTextProvider.render} receives it. Sizes in local pixels. */
export interface TextSlotRender {
    /** The value. */
    value: string;
    /** Font size. */
    size: number;
    /** The slot's resolved style. */
    style: ThemeStyle;
    /** The slot's style row, for drawing with the message shader. */
    row: number;
    /** The theme the row belongs to. */
    theme: SilkTheme;
    /** Width the layout reserved. */
    width: number;
    /** Height of the line box. */
    height: number;
    /** Distance from the box top to the baseline. */
    baseline: number;
}

/** Draws a text slot's value (the dynamic path, `pixi-silk/i18n/canvas`). */
export interface DynamicTextProvider {
    /** Width of `value` in pixels at `size`, for layout. */
    measure(value: string, size: number, style: ThemeStyle): number;
    /** A display object showing the value, with the top left of its box at 0, 0. */
    render(slot: TextSlotRender): Container;
}

/** The built-in dynamic text modes of {@link SilkOptions.dynamicText}. */
export interface DynamicTextMode {
    /** `canvas` loads `pixi-silk/i18n/canvas` on first use. `off` draws nothing in text slots. */
    mode: 'canvas' | 'off';
    /** Font of the canvas mode. Default `system`, nothing to download. */
    font?: 'system' | { family: string; source: string; weight?: number };
}

/** Options of {@link Silk.create}. */
export interface SilkOptions {
    /**
     * The renderer the messages draw with. Optional: given, Silk checks it once. Baked text needs
     * WebGL2 or WebGPU, and on a WebGL1 context it logs one error instead of failing to compile.
     */
    renderer?: { name: string; context?: { webGLVersion?: number } } | null;
    /**
     * How text slots (player names) are drawn: a provider, or `{ mode: 'canvas' }` to load the
     * canvas path (`pixi-silk/i18n/canvas`) lazily. Default none: they take room but draw nothing.
     */
    dynamicText?: DynamicTextProvider | DynamicTextMode | null;
    /** Report every update through `on('update')`. Default true outside production builds. */
    devEvents?: boolean;
}

/** An inline object, as {@link Silk.registerInline} takes it. */
export interface InlineObject {
    /** What to draw. */
    texture: Texture;
    /** Height as a number of pixels or a string in em, such as `1.1em`. Default `1em`. */
    size?: number | `${number}em`;
    /** Part of its height below the baseline, 0 to 1. Default 0.15. */
    baseline?: number;
}

/** Per-message options of {@link Silk.prepare}. */
export interface MessageSpec {
    /** Message key. */
    key: string;
    /** Font size in pixels. Default from `defaults`, else 16. */
    size?: number;
    /** Widest line in pixels, 0 for none. */
    maxWidth?: number;
    /** Alignment. Default `start`. */
    align?: MessageAlign;
    /** Distance between baselines as a factor of the size. Default 1.35. */
    lineHeight?: number;
    /** A style for the whole message, applied under its tags. */
    style?: string;
    /** First slot values. */
    values?: Record<string, number | string>;
}

/** Options of {@link Silk.prepare}. */
export interface PrepareOptions<Names extends string = string> {
    /** Locale to show. Its bundle must be in use. */
    locale: string;
    /** Locale to take messages from when `locale` lacks them. */
    fallbackLocale?: string;
    /** Theme of the messages. */
    theme: SilkTheme;
    /** Defaults for every message. */
    defaults?: Omit<MessageSpec, 'key' | 'values'>;
    /** Messages by the name the app uses. */
    messages: Record<Names, MessageSpec>;
}

/** A message ready to show. Immutable and shared by every SilkMessage made from it. */
export interface PreparedMessage {
    /** The Silk it belongs to. */
    readonly silk: Silk;
    /** The bundle it comes from (the fallback locale's when the locale lacked it). */
    readonly bundle: SilkBundle;
    /** Message index in the bundle. */
    readonly index: number;
    /** Its theme. */
    readonly theme: SilkTheme;
    /** Its options, defaults filled in. */
    readonly spec: Required<Omit<MessageSpec, 'style'>> & { style: string };
}

const EM = /^(-?[\d.]+)em$/;

function emOf(size: InlineObject['size'], fallback: number): number {
    if (size === undefined) return fallback;
    if (typeof size === 'number') return size;
    const m = EM.exec(size);

    return m ? Number(m[1]) : fallback;
}

/** @internal GPU side of a bundle: its glyph metrics texture and atlas pages. */
interface BundleGpu {
    metrics: BufferImageSource;
    pages: TextureSource[];
    pageInfo: Float32Array[];
}

/**
 * A theme bound to its style-row texture. `set` changes a style at runtime: paint properties
 * (colours, outline, glow, shadow, lines, weight bias) rewrite a few style rows and move no glyph.
 * Shape-relevant properties (weight, size, family, letter spacing, features) cannot change baked
 * text: a dev warning says to run `silk compile` again.
 */
export class SilkTheme {
    /** The style rows. */
    readonly table: StyleTable;
    /** The style rows as an RGBA32F texture (8 texels per row, 64 rows per texture row). */
    readonly source: BufferImageSource;
    private readonly _silk: Silk;
    private _uploaded = -1;

    constructor(silk: Silk, data: ThemeData) {
        this._silk = silk;
        this.table = new StyleTable(data);
        this.source = new BufferImageSource({
            resource: new Float32Array(512 * 4),
            width: 512,
            height: 1,
            format: 'rgba32float',
            alphaMode: 'premultiplied-alpha',
            scaleMode: 'nearest',
            autoGenerateMipmaps: false,
            label: 'silk-message-styles',
        });
    }

    /** Changes a style (`base` for untagged text). See the class notes for what can change. */
    set(name: string, patch: ThemeStyle): void {
        const t0 = performance.now();
        const change = this.table.set(name, patch);

        if (change.shapeChanged.length) {
            this._silk.warn(
                `theme.set('${name}'): ${change.shapeChanged.join(', ')} changes shaping, which baked text cannot follow. Edit the theme and run silk compile again`,
            );
            this._silk.emit({ tier: 'shape', ms: performance.now() - t0 });
        }
        this.sync();
        this._silk.emit({ tier: 'paint', ms: performance.now() - t0 });
    }

    /** The resolved style of a tag (or `base`). */
    get(name: string): ThemeStyle {
        return name === 'base' ? this.table.resolve([]) : this.table.resolve([name]);
    }

    /** @internal Uploads the rows when they changed. */
    sync(): void {
        const t = this.table;

        if (t.version === this._uploaded) return;
        const rows = Math.max(1, Math.ceil(t.count / 64));
        const need = rows * 512 * 4;
        const src = this.source;

        if ((src.resource as Float32Array).length < need) {
            src.resource = new Float32Array(need);
            src.resize(512, rows);
        }
        (src.resource as Float32Array).set(t.data.subarray(0, Math.min(t.data.length, t.count * STYLE_FLOATS)));
        src.update();
        t.clean();
        this._uploaded = t.version;
    }
}

/**
 * Baked localized text for Pixi (brief sec. 6.1). Holds the bundles in use, their atlas pages and
 * glyph metrics on the GPU, the inline objects and the dev update events. Create it once.
 *
 * @example
 * ```ts
 * import { Assets, extensions } from 'pixi.js';
 * import { Silk, SilkMessage, silkBundleLoader } from 'pixi-silk/i18n/pixi';
 *
 * extensions.add(silkBundleLoader);
 * const silk = await Silk.create();
 * await silk.addBundle(await Assets.load('/i18n/ar.silk'));
 * const theme = silk.createTheme(await Assets.load('/i18n/theme.json'));
 * const set = await silk.prepare({ locale: 'ar', theme, messages: { title: { key: 'shop.title', size: 44 } } });
 * app.stage.addChild(new SilkMessage(set.get('title')));
 * ```
 */
export class Silk {
    /** Bundles in use, by locale. */
    readonly bundles: Map<string, SilkBundle> = new Map();
    /** Draws text slots. */
    dynamicText: DynamicTextProvider | null;
    private readonly _gpu = new Map<SilkBundle, BundleGpu>();
    /** Atlas pages by URL, shared by every bundle that draws from them, with their user counts. */
    private readonly _pages = new Map<string, { source: Promise<TextureSource>; users: number }>();
    private readonly _inline = new Map<string, InlineObject>();
    private readonly _listeners = new Set<(e: UpdateEvent) => void>();
    private readonly _devEvents: boolean;
    private readonly _warned = new Set<string>();

    private constructor(options: SilkOptions, dynamicText: DynamicTextProvider | null) {
        this.dynamicText = dynamicText;
        this._devEvents = options.devEvents ?? true;
    }

    /** Creates a Silk. With `dynamicText: { mode: 'canvas' }` it loads the canvas path first. */
    static async create(options: SilkOptions = {}): Promise<Silk> {
        const r = options.renderer;

        if (r?.name === 'webgl' && r.context?.webGLVersion === 1) {
            console.error(
                'pixi-silk: baked localized text needs WebGL2 or WebGPU. This renderer runs WebGL1, so SilkMessage draws nothing',
            );
        }
        const d = options.dynamicText;
        let provider: DynamicTextProvider | null = null;

        if (d && 'mode' in d) {
            if (d.mode === 'canvas') {
                // loaded on demand: apps without text slots never download it
                const { createCanvasText } = await import('../canvas');

                provider = await createCanvasText({ font: d.font });
            }
        } else provider = d ?? null;

        return new Silk(options, provider);
    }

    /**
     * Puts a bundle in use: uploads its glyph metrics and loads its atlas pages (lossless PNG,
     * loaded without premultiplied alpha or colour conversion, so distances arrive unchanged).
     * Page files resolve against the bundle's URL, and bundles that share a page (locales of one
     * script) load it once. `loadPage` replaces the loading, for tests or custom asset pipelines.
     */
    async addBundle(
        bundle: SilkBundle,
        loadPage: (url: string, page: BundlePage) => Promise<TextureSource> = loadAtlasPage,
    ): Promise<void> {
        if (this._gpu.has(bundle)) return;
        const pages = bundle.pages();

        if (pages.length > 4) {
            this.warn(
                `bundle ${bundle.locale} draws from ${pages.length} atlas pages: only 4 are bound per draw. Split it with --split-by`,
            );
        }
        // locales share pages by script: load each page once
        const sources = await Promise.all(
            pages.slice(0, 4).map((p) => {
                const url = resolveUrl(bundle.url, p.file);
                let entry = this._pages.get(url);

                if (!entry) {
                    entry = { source: loadPage(url, p), users: 0 };
                    this._pages.set(url, entry);
                }
                entry.users++;
                return entry.source;
            }),
        );
        const slotOf = new Map(pages.map((p, i) => [p.id, i]));
        const count = bundle.glyphCount;
        const rows = Math.max(1, Math.ceil(count / 512));
        const data = new Float32Array(rows * 1536 * 4);
        const g = bundle.data.glyphs;

        for (let i = 1; i < count; i++) {
            const o = i * GLYPH_STRIDE;
            const at = ((i % 512) * 3 + Math.floor(i / 512) * 1536) * 4;
            const upem = bundle.face(g[o + 9]).unitsPerEm;
            const page = pages[slotOf.get(g[o]) ?? 0];

            data.set(
                [
                    slotOf.get(g[o]) ?? 0,
                    g[o + 1],
                    g[o + 2],
                    g[o + 3],
                    g[o + 4],
                    g[o + 5],
                    g[o + 6],
                    g[o + 7],
                    g[o + 8],
                    page.emSize / upem,
                    0,
                    0,
                ],
                at,
            );
        }
        const metrics = new BufferImageSource({
            resource: data,
            width: 1536,
            height: rows,
            format: 'rgba32float',
            alphaMode: 'premultiplied-alpha',
            scaleMode: 'nearest',
            autoGenerateMipmaps: false,
            label: `silk-glyphs-${bundle.locale}`,
        });

        this._gpu.set(bundle, {
            metrics,
            pages: sources,
            pageInfo: pages
                .slice(0, 4)
                .map(
                    (p) => new Float32Array([p.width, p.height, p.distanceRange, p.kind === PageKind.Sdf ? 1 : p.kind]),
                ),
        });
        this.bundles.set(bundle.locale, bundle);
    }

    /** Stops using a bundle. Its metrics are destroyed, and its pages once no bundle in use draws from them. */
    releaseBundle(bundle: SilkBundle): void {
        const gpu = this._gpu.get(bundle);

        if (!gpu) return;
        gpu.metrics.destroy();
        for (const p of bundle.pages().slice(0, 4)) {
            const url = resolveUrl(bundle.url, p.file);
            const entry = this._pages.get(url);

            if (!entry || --entry.users > 0) continue;
            this._pages.delete(url);
            void entry.source.then((source) => source.destroy());
        }
        this._gpu.delete(bundle);
        if (this.bundles.get(bundle.locale) === bundle) this.bundles.delete(bundle.locale);
    }

    /** Makes a theme from a theme file (`$silk: 2`). */
    createTheme(data: ThemeData): SilkTheme {
        return new SilkTheme(this, data);
    }

    /** Registers inline objects, written `<name/>` in messages. */
    registerInline(objects: Record<string, InlineObject>): void {
        for (const [name, o] of Object.entries(objects)) this._inline.set(name, o);
    }

    /** @internal Metrics of an inline object in em. */
    inlineMetrics(name: string): InlineMetrics | undefined {
        const o = this._inline.get(name);

        if (!o) return undefined;
        const height = emOf(o.size, 1);
        const aspect = o.texture.width / (o.texture.height || 1);

        return { width: height * aspect, height, baseline: o.baseline ?? 0.15 };
    }

    /** @internal The registered texture of an inline object. */
    inlineTexture(name: string): Texture | undefined {
        return this._inline.get(name)?.texture;
    }

    /**
     * Resolves messages for a locale: finds each key (or falls back to `fallbackLocale`), fills the
     * defaults, and returns them as a set. No shaping happens: plural variants are already baked.
     */
    async prepare<Names extends string>(options: PrepareOptions<Names>): Promise<PreparedSet<Names>> {
        const bundle = this.bundles.get(options.locale);
        const fallback = options.fallbackLocale ? this.bundles.get(options.fallbackLocale) : undefined;

        if (!bundle && !fallback)
            throw new Error(`pixi-silk: no bundle in use for ${options.locale}: call addBundle first`);
        const out = new Map<Names, PreparedMessage>();
        const d = options.defaults ?? {};

        for (const [name, spec] of Object.entries(options.messages) as [Names, MessageSpec][]) {
            let source = bundle;
            let index = bundle ? bundle.message(spec.key) : -1;

            if (index < 0 && fallback) {
                source = fallback;
                index = fallback.message(spec.key);
            }
            if (index < 0 || !source) throw new Error(`pixi-silk: message "${spec.key}" is in no bundle in use`);
            out.set(name, {
                silk: this,
                bundle: source,
                index,
                theme: options.theme,
                spec: {
                    key: spec.key,
                    size: spec.size ?? d.size ?? 16,
                    maxWidth: spec.maxWidth ?? d.maxWidth ?? 0,
                    align: spec.align ?? d.align ?? 'start',
                    lineHeight: spec.lineHeight ?? d.lineHeight ?? 1.35,
                    style: spec.style ?? d.style ?? '',
                    values: { ...spec.values },
                },
            });
        }

        return new PreparedSet(out);
    }

    /** Listens to update events (dev builds): `{ tier, ms, key }` for every update. */
    on(event: 'update', listener: (e: UpdateEvent) => void): () => void {
        void event;
        this._listeners.add(listener);

        return () => this._listeners.delete(listener);
    }

    /** @internal Reports an update. */
    emit(e: UpdateEvent): void {
        if (!this._devEvents) return;
        for (const l of this._listeners) l(e);
    }

    /** @internal Warns once per message text. */
    warn(message: string): void {
        if (this._warned.has(message)) return;
        this._warned.add(message);
        console.warn(`pixi-silk: ${message}`);
    }

    /** @internal GPU resources of a bundle in use. */
    gpu(bundle: SilkBundle): BundleGpu {
        const g = this._gpu.get(bundle);

        if (!g) throw new Error(`pixi-silk: bundle ${bundle.locale} is not in use: call addBundle first`);
        return g;
    }

    /**
     * Memory and cache numbers (brief sec. 8): atlas pages and their GPU bytes (4 bytes per texel,
     * 1 for SDF pages decoded as RGBA still take 4), glyph metrics bytes, and bundles in use.
     */
    stats(): { bundles: number; pages: number; atlasBytes: number; metricsBytes: number } {
        let pages = 0;
        let atlasBytes = 0;
        let metricsBytes = 0;
        const seen = new Set<TextureSource>();

        for (const g of this._gpu.values()) {
            metricsBytes += (g.metrics.resource as Float32Array).byteLength;
            for (const p of g.pages) {
                if (seen.has(p)) continue;
                seen.add(p);
                pages++;
                atlasBytes += p.pixelWidth * p.pixelHeight * 4;
            }
        }
        return { bundles: this._gpu.size, pages, atlasBytes, metricsBytes };
    }
}

/** A set of prepared messages. */
export class PreparedSet<Names extends string = string> {
    private readonly _messages: Map<Names, PreparedMessage>;

    constructor(messages: Map<Names, PreparedMessage>) {
        this._messages = messages;
    }

    /** A prepared message by its name. */
    get(name: Names): PreparedMessage {
        const m = this._messages.get(name);

        if (!m) throw new Error(`pixi-silk: no prepared message "${name}"`);
        return m;
    }

    /** Names in the set. */
    names(): Names[] {
        return [...this._messages.keys()];
    }

    /** Drops the set. Bundles stay in use until `Silk.releaseBundle`. */
    release(): void {
        this._messages.clear();
    }
}

function resolveUrl(base: string, file: string): string {
    if (!base) return file;
    const cut = base.lastIndexOf('/');

    return cut < 0 ? file : base.slice(0, cut + 1) + file;
}

/** Loads one atlas page without premultiplied alpha or colour conversion. */
export async function loadAtlasPage(url: string): Promise<TextureSource> {
    const response = await DOMAdapter.get().fetch(url);

    if (!response.ok) throw new Error(`pixi-silk: atlas page ${url}: HTTP ${response.status}`);
    const bitmap = await createImageBitmap(await response.blob(), {
        premultiplyAlpha: 'none',
        colorSpaceConversion: 'none',
    });

    return new ImageSource({
        resource: bitmap,
        alphaMode: 'no-premultiply-alpha',
        scaleMode: 'linear',
        autoGenerateMipmaps: false,
        label: url,
    });
}

/**
 * The Pixi `Assets` loader for `.silk` bundles. Register it once with `extensions.add(silkBundleLoader)`.
 * `Assets.load('/i18n/ar.silk')` then returns a {@link SilkBundle}.
 */
export const silkBundleLoader: {
    extension: { type: ExtensionType.LoadParser; name: string };
    name: string;
    id: string;
    test(url: string): boolean;
    load(url: string): Promise<SilkBundle>;
    unload(): void;
} = {
    extension: { type: ExtensionType.LoadParser, name: 'silk-bundle' },
    name: 'silk-bundle',
    id: 'silk-bundle',
    test(url: string): boolean {
        return /\.silk(\?|#|$)/.test(url);
    },
    async load(url: string): Promise<SilkBundle> {
        const response = await DOMAdapter.get().fetch(url);

        if (!response.ok) throw new Error(`pixi-silk: ${url}: HTTP ${response.status}`);
        return new SilkBundle(await response.arrayBuffer(), url);
    },
    unload(): void {},
};

/** @internal The geometry of a SilkMessage: one unit quad, one instance per glyph or line. */
export class MessageGeometry extends Geometry {
    /** Instance data, `INSTANCE_FLOATS` floats per instance. */
    readonly instances: Buffer;

    constructor() {
        const instances = new Buffer({
            data: new Float32Array(INSTANCE_FLOATS * 16),
            usage: BufferUsage.VERTEX | BufferUsage.COPY_DST,
            label: 'silk-message-instances',
            shrinkToFit: false,
        });
        const inst = (offset: number) => ({
            buffer: instances,
            format: 'float32x4' as const,
            stride: INSTANCE_FLOATS * 4,
            offset,
            instance: true,
        });

        super({
            attributes: {
                aCorner: {
                    buffer: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
                    format: 'float32x2',
                    stride: 8,
                    offset: 0,
                },
                aInst0: inst(0),
                aInst1: inst(16),
            },
            indexBuffer: new Uint16Array([0, 1, 2, 0, 2, 3]),
            instanceCount: 0,
        });
        this.instances = instances;
    }
}

/** What a `tagtap` event carries. */
export interface TagTapEvent {
    /** The tapped tag. */
    tag: string;
    /** Local point of the tap. */
    x: number;
    /** Local point of the tap. */
    y: number;
}

/**
 * A prepared message on screen (brief sec. 6.1). Glyphs are instances of one mesh, drawn in one
 * draw call. Updates take the cheapest tier that can serve them (sec. 6.3). `set` with a number of
 * the same length rewrites only that slot's glyphs (`value-fast`). Other values lay out again. A
 * plural change swaps the baked variant. `maxWidth`, `align`, `size` and `lineHeight` lay out
 * again without shaping. Tag taps on interactive styles arrive as `tagtap`. `accessibleText` holds
 * the plain text with values filled in, for Pixi's accessibility system.
 */
export class SilkMessage extends Container {
    /** The prepared message. */
    readonly prepared: PreparedMessage;
    /** Tags that emit `tagtap`. Default every interactive style. */
    interactiveTags: string[] | null = null;
    private readonly _mesh: Mesh<MessageGeometry, Shader>;
    private readonly _geometry = new MessageGeometry();
    private readonly _values: Record<string, number | string>;
    private _size: number;
    private _maxWidth: number;
    private _align: MessageAlign;
    private _lineHeight: number;
    private _variant = -1;
    private _layout: MessageLayout | null = null;
    private readonly _extras = new Container();

    constructor(prepared: PreparedMessage) {
        super({ label: `SilkMessage ${prepared.spec.key}` });
        this.prepared = prepared;
        const { spec, bundle, silk, theme } = prepared;

        this._values = { ...spec.values };
        this._size = spec.size;
        this._maxWidth = spec.maxWidth;
        this._align = spec.align;
        this._lineHeight = spec.lineHeight;
        const gpu = silk.gpu(bundle);

        this._mesh = new Mesh({
            geometry: this._geometry,
            shader: createMessageShader({
                metrics: gpu.metrics,
                styles: theme.source,
                pages: gpu.pages,
                pageInfo: gpu.pageInfo,
            }),
        });
        this.addChild(this._mesh, this._extras);
        this.eventMode = 'static';
        this.on('pointertap', (e) => {
            const p = this.toLocal(e.global);

            for (const hit of this._layout?.hits ?? []) {
                if (this.interactiveTags && !this.interactiveTags.includes(hit.tag)) continue;
                if (p.x >= hit.x && p.x <= hit.x + hit.width && p.y >= hit.y && p.y <= hit.y + hit.height) {
                    this.emit('tagtap', { tag: hit.tag, x: p.x, y: p.y } satisfies TagTapEvent);
                    return;
                }
            }
        });
        this._relayout('layout');
    }

    /** The current layout: lines, boxes, instances. */
    get layout(): MessageLayout {
        return this._layout as MessageLayout;
    }

    /** Glyph and line instances drawn. */
    get instanceCount(): number {
        return this._geometry.instanceCount;
    }

    /**
     * Changes slot values. A number of the same length as before rewrites only its glyphs. A
     * different plural category swaps the variant. Anything else lays the message out again.
     */
    set(values: Record<string, number | string>): this {
        const t0 = performance.now();
        const { bundle } = this.prepared;
        let fast = this._layout !== null;

        Object.assign(this._values, values);
        const variant = this._resolveVariant();

        if (variant !== this._variant) {
            this._relayout('variant');
            return this;
        }
        for (const [name, value] of Object.entries(values)) {
            const placement = this._layout?.slots.find((s) => s.name === name);

            if (!placement || typeof value !== 'number') {
                fast = false;
                break;
            }
            const slot = bundle.slot(placement.slot);

            if (
                !bundle.fastPath(slot) ||
                !this._layout ||
                !updateNumberSlot(this._layout.instances, placement, bundle.formatNumber(slot, value))
            ) {
                fast = false;
                break;
            }
        }
        if (!fast || !this._layout) {
            this._relayout('value');
            return this;
        }
        this._upload(this._layout);
        this.prepared.silk.emit({ tier: 'value-fast', ms: performance.now() - t0, key: this.prepared.spec.key });

        return this;
    }

    /** Widest line in pixels, 0 for none. Changing it re-breaks lines without shaping. */
    get maxWidth(): number {
        return this._maxWidth;
    }

    set maxWidth(v: number) {
        if (v === this._maxWidth) return;
        this._maxWidth = v;
        this._relayout('layout');
    }

    /** Alignment of the lines. */
    get align(): MessageAlign {
        return this._align;
    }

    set align(v: MessageAlign) {
        if (v === this._align) return;
        this._align = v;
        this._relayout('layout');
    }

    /** Font size in pixels. Baked runs are size-independent, so this lays out again without shaping. */
    get size(): number {
        return this._size;
    }

    set size(v: number) {
        if (v === this._size) return;
        this._size = v;
        this._relayout('layout');
    }

    /** Distance between baselines as a factor of the size. */
    get lineHeight(): number {
        return this._lineHeight;
    }

    set lineHeight(v: number) {
        if (v === this._lineHeight) return;
        this._lineHeight = v;
        this._relayout('layout');
    }

    private _resolveVariant(): number {
        const { bundle, index } = this.prepared;
        const selector = bundle.selector(index);

        if (selector < 0) return bundle.variant(index);
        const name = bundle.slot(selector).name;

        return bundle.variant(index, bundle.pluralCategory(Number(this._values[name] ?? 0)));
    }

    private _relayout(tier: UpdateTier): void {
        const t0 = performance.now();
        const { bundle, silk, theme, spec } = this.prepared;

        this._variant = this._resolveVariant();
        const baseStyle = spec.style;
        const styles = theme.table;
        const layout = layoutMessage(bundle, this._variant, {
            size: this._size,
            maxWidth: this._maxWidth,
            align: this._align,
            lineHeight: this._lineHeight,
            values: this._values,
            styles: baseStyle ? prefixed(styles, baseStyle) : styles,
            inline: (name) => silk.inlineMetrics(name),
            measureText: silk.dynamicText
                ? (_name, value, size, row) =>
                      silk.dynamicText?.measure(value, size, styles.resolve(styles.stackOf(row))) ?? 0
                : undefined,
        });

        this._layout = layout;
        theme.sync();
        this._upload(layout);
        // inline objects and text slots
        for (const child of this._extras.removeChildren()) child.destroy();
        for (const o of layout.objects) {
            const texture = silk.inlineTexture(o.name);

            if (!texture) continue;
            const sprite = new Sprite(texture);

            sprite.position.set(o.x, o.y);
            sprite.setSize(o.width, o.height);
            this._extras.addChild(sprite);
        }
        for (const s of layout.textSlots) {
            const view = silk.dynamicText?.render({
                value: s.value,
                size: this._size,
                style: styles.resolve(styles.stackOf(s.style)),
                row: s.style,
                theme,
                width: s.width,
                height: s.height,
                baseline: s.baseline,
            });

            if (!view) continue;
            view.position.set(s.x, s.y);
            this._extras.addChild(view);
        }
        // Pixi's accessibility system reads these when it is enabled
        this.accessibleText = layout.text;
        this.accessibleTitle = layout.text;
        silk.emit({ tier, ms: performance.now() - t0, key: spec.key });
    }

    private _upload(layout: MessageLayout): void {
        const buffer = this._geometry.instances;
        const need = layout.count * INSTANCE_FLOATS;

        if ((buffer.data as Float32Array).length < need)
            buffer.data = new Float32Array(Math.max(need, (buffer.data as Float32Array).length * 2));
        (buffer.data as Float32Array).set(layout.instances.subarray(0, need));
        buffer.update(need * 4);
        this._geometry.instanceCount = layout.count;
        this._mesh.visible = layout.count > 0;
        this.boundsArea = new Rectangle(0, 0, layout.width, layout.height);
    }

    override destroy(options?: Parameters<Container['destroy']>[0]): void {
        this._geometry.destroy();
        super.destroy(options);
    }
}

/** A style table view that puts a whole-message style under every stack. */
function prefixed(table: StyleTable, style: string): StyleTable {
    return new Proxy(table, {
        get(target, prop, receiver) {
            if (prop === 'rowFor') return (tags: readonly string[]) => target.rowFor([style, ...tags]);
            return Reflect.get(target, prop, receiver);
        },
    });
}
