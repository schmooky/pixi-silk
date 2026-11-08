import {
    Container,
    type FederatedPointerEvent,
    type FederatedWheelEvent,
    Graphics,
    Matrix,
    type PointData,
    Rectangle,
    type Renderer,
    RenderTexture,
    Sprite,
    type Ticker,
} from 'pixi.js';
import { damp } from '../../motion';
import { SilkGraphics } from '../../SilkGraphics';
import { type ReadSignal, type Signal, signal } from '../../signal';
import type { Camera, WorldRect } from '../camera';
import { Driver } from '../driver';
import { type PanelTheme, resolvePanelTheme } from './theme';

/** How world units map onto the minimap: `map = world * scale + (x, y)`. */
export interface MinimapTransform {
    scale: number;
    x: number;
    y: number;
}

/** The smallest rectangle around both. */
export function unionRect(a: WorldRect, b: WorldRect): WorldRect {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);

    return {
        x,
        y,
        width: Math.max(a.x + a.width, b.x + b.width) - x,
        height: Math.max(a.y + a.height, b.y + b.height) - y,
    };
}

/** Fits a world rectangle into a minimap of `width` by `height`, centred, with `padding` around it. */
export function minimapFit(world: WorldRect, width: number, height: number, padding = 8): MinimapTransform {
    const w = Math.max(1, width - padding * 2);
    const h = Math.max(1, height - padding * 2);
    const scale = Math.min(w / Math.max(1e-6, world.width), h / Math.max(1e-6, world.height));

    return {
        scale,
        x: width / 2 - (world.x + world.width / 2) * scale,
        y: height / 2 - (world.y + world.height / 2) * scale,
    };
}

/** A world point on the minimap. */
export function worldToMinimap(t: MinimapTransform, p: PointData): PointData {
    return { x: p.x * t.scale + t.x, y: p.y * t.scale + t.y };
}

/** A minimap point in world units. */
export function minimapToWorld(t: MinimapTransform, p: PointData): PointData {
    return { x: (p.x - t.x) / t.scale, y: (p.y - t.y) / t.scale };
}

/** A world rectangle on the minimap. */
export function worldRectToMinimap(t: MinimapTransform, r: WorldRect): WorldRect {
    return { x: r.x * t.scale + t.x, y: r.y * t.scale + t.y, width: r.width * t.scale, height: r.height * t.scale };
}

/** Options of {@link Minimap}. */
export interface MinimapOptions {
    /** The camera whose world the minimap shows and moves. */
    camera: Camera;
    /** What to show. Default `camera.content`. */
    content?: Container;
    /** Default 200. */
    width?: number;
    /** Default 130. */
    height?: number;
    /**
     * `bounds` (default) draws the outline of each top object, crisp and cheap. `texture` renders
     * the content into a small texture now and then, for a real thumbnail. It needs `renderer`.
     */
    mode?: 'bounds' | 'texture';
    /** The renderer, for `texture`. */
    renderer?: Renderer;
    /** Seconds between thumbnail and bounds updates. Default 0.5. */
    interval?: number;
    /** The rectangles `bounds` draws. Default the bounds of the objects in `content`, up to three groups deep. */
    items?: () => Iterable<WorldRect>;
    /** Space around the content inside the map. Default 10. */
    padding?: number;
    /** Draw a card behind the map. Off inside a panel, which has its own. Default true. */
    background?: boolean;
    /** Colours. Default the dark panel theme. */
    theme?: Partial<PanelTheme>;
    ticker?: Ticker | null;
}

/** The reactive state of a {@link Minimap}. */
export interface MinimapState {
    /** The camera's view in world units, as the map frames it. */
    view: ReadSignal<WorldRect>;
    /** True while the view frame is dragged. */
    dragging: ReadSignal<boolean>;
}

/**
 * A minimap of a {@link Camera}'s world: the content in small, and the view as a frame. Drag the
 * frame to pan, click anywhere to jump there, and scroll to zoom. The map follows the camera on
 * every frame it moves, and glides when the content or the view grows past it.
 *
 * @example
 * ```ts
 * const map = new Minimap({ camera, width: 220, height: 140 });
 *
 * app.stage.addChild(map);
 * ```
 */
export class Minimap extends Container {
    /** The view frame and the drag, as signals. */
    readonly state: MinimapState;
    /** Colours. */
    readonly theme: PanelTheme;
    /** The camera it shows and moves. */
    readonly camera: Camera;

    private readonly _o: MinimapOptions;
    private readonly _driver: Driver;
    private readonly _bg = new SilkGraphics();
    private readonly _map = new SilkGraphics();
    private readonly _frame = new SilkGraphics();
    private readonly _clip = new Graphics();
    private readonly _inner = new Container();
    private readonly _view: Signal<WorldRect>;
    private readonly _dragging = signal(false);
    private readonly _stops: (() => void)[] = [];
    private _w: number;
    private _h: number;
    private _t: MinimapTransform = { scale: 1, x: 0, y: 0 };
    private _rects: WorldRect[] = [];
    private _bounds: WorldRect = { x: 0, y: 0, width: 1, height: 1 };
    private _age = Number.POSITIVE_INFINITY;
    private _ready = false;
    private _press: { id: number; offset: PointData } | null = null;
    private _sprite: Sprite | null = null;
    private _rt: RenderTexture | null = null;
    private _shot: { bounds: WorldRect; scale: number } | null = null;

    constructor(options: MinimapOptions) {
        super({ label: 'Minimap' });
        this._o = options;
        this.camera = options.camera;
        this.theme = resolvePanelTheme(options.theme);
        this._w = options.width ?? 200;
        this._h = options.height ?? 130;
        this._view = signal<WorldRect>(this.camera.view, (a, b) => JSON.stringify(a) === JSON.stringify(b));
        this.state = { view: this._view, dragging: this._dragging };
        this._inner.mask = this._clip;
        this._inner.addChild(this._map, this._frame);
        this.addChild(this._bg, this._clip, this._inner);
        this._driver = new Driver((dt) => this._step(dt), options.ticker);
        this.eventMode = 'static';
        this.cursor = 'pointer';
        this.hitArea = new Rectangle(0, 0, this._w, this._h);
        this.on('pointerdown', this._onDown, this);
        this.on('globalpointermove', this._onMove, this);
        this.on('pointerup', this._onUp, this);
        this.on('pointerupoutside', this._onUp, this);
        this.on('wheel', this._onWheel, this);
        const s = this.camera.state;
        const wake = () => this._driver.wake();

        this._stops.push(
            s.zoom.subscribe(wake),
            s.x.subscribe(wake),
            s.y.subscribe(wake),
            s.width.subscribe(wake),
            s.height.subscribe(wake),
        );
        this._layout();
        this._driver.wake();
    }

    /** The map transform drawn now. */
    get transform(): MinimapTransform {
        return { ...this._t };
    }

    /** Width of the map. */
    get mapWidth(): number {
        return this._w;
    }

    /** Height of the map. */
    get mapHeight(): number {
        return this._h;
    }

    /** Changes the size of the map. */
    resize(width: number, height: number): this {
        if (width === this._w && height === this._h) return this;
        this._w = Math.max(1, width);
        this._h = Math.max(1, height);
        (this.hitArea as Rectangle).width = this._w;
        (this.hitArea as Rectangle).height = this._h;
        this._ready = false;
        this._age = Number.POSITIVE_INFINITY;
        this._layout();
        this._driver.wake();

        return this;
    }

    /** Measures the content again on the next frame, and renders a new thumbnail. */
    refresh(): this {
        this._age = Number.POSITIVE_INFINITY;
        this._driver.wake();

        return this;
    }

    /** Centres the camera on the world point under a map point. */
    jumpTo(p: PointData, animate = true): this {
        const w = minimapToWorld(this._t, p);

        this.camera.centerOn(w, this.camera.zoom, animate);

        return this;
    }

    /** Advances the motion by `dt` seconds (only needed with `ticker: null`). Returns true while moving. */
    tick(dt: number): boolean {
        return this._driver.tick(dt);
    }

    override destroy(options?: Parameters<Container['destroy']>[0]): void {
        for (const stop of this._stops) stop();
        this._driver.sleep();
        this._rt?.destroy(true);
        super.destroy(options ?? { children: true });
    }

    // ------------------------------------------------------------------------------- content

    private _layout(): void {
        const t = this.theme;
        const r = Math.min(t.radius * 0.75, this._h / 2);

        this._clip.clear().roundRect(0, 0, this._w, this._h, r).fill(0xffffff);
        this._bg.clear();
        if (this._o.background ?? true) {
            if (t.shadowAlpha > 0)
                this._bg
                    .roundRect(0, 4, this._w, this._h, r, 0.6)
                    .fill({ color: t.shadow, alpha: t.shadowAlpha * 0.6, blur: 10 });
            this._bg.roundRect(0, 0, this._w, this._h, r, 0.6).fill({ color: t.background, alpha: t.backgroundAlpha });
            this._bg
                .roundRect(0, 0, this._w, this._h, r, 0.6)
                .stroke({ width: 1, color: t.border, alignment: 'inside' });
        }
    }

    private _content(): Container {
        return this._o.content ?? this.camera.content;
    }

    /** Bounds of `c` in the world's space. */
    private _worldBounds(c: Container): WorldRect | null {
        const world = this.camera.world;
        const b = c.getBounds();

        if (b.width <= 0 && b.height <= 0) return null;
        const a = world.toLocal({ x: b.minX, y: b.minY });
        const z = world.toLocal({ x: b.maxX, y: b.maxY });

        return { x: a.x, y: a.y, width: z.x - a.x, height: z.y - a.y };
    }

    private _measure(): void {
        const content = this._content();
        const rects: WorldRect[] = [];

        if (this._o.items) rects.push(...this._o.items());
        else {
            // the objects, three groups deep, so frames show what is in them
            const walk = (c: Container, depth: number) => {
                if (!c.visible || rects.length >= 2000) return;
                if (depth < 3 && c.children.length && (c as { allowChildren?: boolean }).allowChildren !== false) {
                    for (const k of c.children) walk(k, depth + 1);

                    return;
                }
                const r = this._worldBounds(c);

                if (r) rects.push(r);
            };

            for (const c of content === this.camera.world ? content.children : [content]) walk(c, 1);
        }
        this._rects = rects;
        this._bounds = rects.length ? rects.reduce((acc, r) => unionRect(acc, r)) : { x: 0, y: 0, width: 1, height: 1 };
        if (this._o.mode === 'texture') this._snapshot();
    }

    /** Renders the content into a texture of the map's size. */
    private _snapshot(): void {
        const renderer = this._o.renderer;

        if (!renderer) return;
        const b = this._bounds;
        const res = renderer.resolution || 1;
        const scale = Math.min((this._w * 2) / Math.max(1, b.width), (this._h * 2) / Math.max(1, b.height));
        const tw = Math.max(1, Math.ceil(b.width * scale));
        const th = Math.max(1, Math.ceil(b.height * scale));

        if (!this._rt || this._rt.width !== tw || this._rt.height !== th) {
            this._rt?.destroy(true);
            this._rt = RenderTexture.create({ width: tw, height: th, resolution: res, antialias: true });
            this._sprite?.destroy();
            this._sprite = new Sprite(this._rt);
            this._inner.addChildAt(this._sprite, 0);
        }
        const content = this._content();
        const world = this.camera.world;
        // the content's transform relative to the world, then the world to the texture
        // content space to world space, then world space to the texture (`a.append(b)` applies b first)
        const rel =
            content === world ? new Matrix() : world.worldTransform.clone().invert().append(content.worldTransform);
        const m = new Matrix().translate(-b.x, -b.y).scale(scale, scale);

        renderer.render({ container: content, target: this._rt, clear: true, transform: m.append(rel) });
        this._shot = { bounds: { ...b }, scale };
    }

    // ------------------------------------------------------------------------------- input

    private _local(e: FederatedPointerEvent): PointData {
        return this.toLocal(e.global);
    }

    private _onDown(e: FederatedPointerEvent): void {
        if (this._press || e.button > 0) return;
        e.stopPropagation();
        const p = this._local(e);
        const frame = worldRectToMinimap(this._t, this.camera.view);
        const inside =
            p.x >= frame.x && p.x <= frame.x + frame.width && p.y >= frame.y && p.y <= frame.y + frame.height;
        const c = { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };

        // a press on the frame grabs it where it is, elsewhere the view jumps there
        this._press = { id: e.pointerId, offset: inside ? { x: p.x - c.x, y: p.y - c.y } : { x: 0, y: 0 } };
        if (!inside) this.jumpTo(p, true);
        this._dragging.set(true);
        this.cursor = 'grabbing';
        this._driver.wake();
    }

    private _onMove(e: FederatedPointerEvent): void {
        const press = this._press;

        if (!press || e.pointerId !== press.id) return;
        const p = this._local(e);

        this.dragTo({ x: p.x - press.offset.x, y: p.y - press.offset.y });
    }

    /** Moves the view frame's centre to a map point, as a drag does. */
    dragTo(p: PointData): void {
        this.jumpTo(p, false);
    }

    private _onUp(e: FederatedPointerEvent): void {
        const press = this._press;

        if (!press || e.pointerId !== press.id) return;
        this._press = null;
        this._dragging.set(false);
        this.cursor = 'pointer';
        this._driver.wake();
    }

    private _onWheel(e: FederatedWheelEvent): void {
        e.stopPropagation();
        const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1;
        const dy = e.deltaY * unit;

        this.camera.zoomBy(Math.exp(-dy * (Math.abs(dy) < 50 ? 0.01 : 0.002)), undefined, Math.abs(dy) >= 50);
    }

    // ------------------------------------------------------------------------------- frame

    private _step(dt: number): boolean {
        const interval = this._o.interval ?? 0.5;
        let busy = this._press !== null || this.camera.moving;

        this._age += dt;
        if (this._age >= interval) {
            this._age = 0;
            this._measure();
        }
        const view = this.camera.view;

        this._view.set(view);
        // the map holds still under a drag, so the frame tracks the pointer exactly
        if (!this._press) {
            const goal = minimapFit(unionRect(this._bounds, view), this._w, this._h, this._o.padding ?? 10);

            if (!this._ready) {
                this._t = goal;
                this._ready = true;
            } else {
                const k = (a: number, b: number) => damp(a, b, 9, dt);
                const next = { scale: k(this._t.scale, goal.scale), x: k(this._t.x, goal.x), y: k(this._t.y, goal.y) };
                const far =
                    Math.abs(next.scale - goal.scale) / goal.scale > 1e-3 ||
                    Math.abs(next.x - goal.x) > 0.1 ||
                    Math.abs(next.y - goal.y) > 0.1;

                this._t = far ? next : goal;
                if (far) busy = true;
            }
        }
        this._draw();

        // keep measuring now and then while something may change
        return busy;
    }

    private _draw(): void {
        const t = this.theme;
        const tr = this._t;
        const g = this._map;

        g.clear();
        if (this._sprite && this._shot) {
            const s = this._shot;

            this._sprite.position.set(s.bounds.x * tr.scale + tr.x, s.bounds.y * tr.scale + tr.y);
            this._sprite.scale.set(tr.scale / s.scale);
        } else {
            for (const r of this._rects) {
                const m = worldRectToMinimap(tr, r);

                if (m.width < 0.5 && m.height < 0.5) continue;
                g.roundRect(
                    m.x,
                    m.y,
                    Math.max(1, m.width),
                    Math.max(1, m.height),
                    Math.min(2, m.width / 4, m.height / 4),
                ).fill({ color: t.textDim, alpha: 0.32 });
            }
        }
        const f = worldRectToMinimap(tr, this.camera.view);
        const fg = this._frame;
        const drag = this._press ? 1 : 0;

        fg.clear();
        // dim what is outside the view
        fg.rect(0, 0, this._w, this._h).fill({ color: t.shadow, alpha: 0.18 });
        fg.roundRect(f.x, f.y, f.width, f.height, 3).fill({ color: t.accent, alpha: 0.1 + 0.06 * drag });
        fg.roundRect(f.x, f.y, f.width, f.height, 3).stroke({ width: 1.5, color: t.accent, alpha: 0.9 });
    }
}
