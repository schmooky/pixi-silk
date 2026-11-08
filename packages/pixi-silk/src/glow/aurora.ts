import { type ColorSource, Container, type Ticker } from 'pixi.js';
import { SilkGraphics } from '../SilkGraphics';
import { Driver } from '../ui/driver';

/** One soft ellipse of an {@link Aurora} at a moment in time. */
export interface AuroraBlob {
    x: number;
    y: number;
    rx: number;
    ry: number;
    /** 0 deep colour, 1 mid colour, 2 hot colour, 3 white. */
    tone: 0 | 1 | 2 | 3;
    alpha: number;
    blur: number;
}

/**
 * Where the blobs of an aurora sit at time `t` (seconds) in a `width` by `height` box. Light rises
 * from the bottom: deep colour high and wide, white low and thin. `rise` (0..1) sets how high it reaches.
 */
export function auroraBlobs(t: number, width: number, height: number, rise = 0.62): AuroraBlob[] {
    const w = width;
    const h = height;
    const top = h * (1 - rise);
    const s = Math.min(w, h);
    const blobs: AuroraBlob[] = [];
    const wave = (i: number, f: number) => Math.sin(t * f + i * 1.7);

    for (let i = 0; i < 3; i++) {
        blobs.push({
            x: w * (0.2 + 0.3 * i) + wave(i, 0.35) * w * 0.08,
            y: top + (h - top) * 0.35 + wave(i + 3, 0.27) * s * 0.04,
            rx: w * 0.42,
            ry: (h - top) * 0.42,
            tone: 0,
            alpha: 0.75,
            blur: s * 0.22,
        });
    }
    for (let i = 0; i < 3; i++) {
        blobs.push({
            x: w * (0.15 + 0.35 * i) + wave(i + 5, 0.45) * w * 0.1,
            y: top + (h - top) * 0.68 + wave(i + 7, 0.33) * s * 0.03,
            rx: w * 0.36,
            ry: (h - top) * 0.26,
            tone: 1,
            alpha: 0.8,
            blur: s * 0.15,
        });
    }
    for (let i = 0; i < 2; i++) {
        blobs.push({
            x: w * (0.3 + 0.4 * i) + wave(i + 9, 0.55) * w * 0.08,
            y: h * 0.94 + wave(i + 11, 0.4) * s * 0.02,
            rx: w * 0.4,
            ry: s * 0.11,
            tone: 2,
            alpha: 0.9,
            blur: s * 0.1,
        });
    }
    blobs.push({
        x: w * 0.5 + wave(13, 0.3) * w * 0.12,
        y: h * 1.02,
        rx: w * 0.55,
        ry: s * 0.1,
        tone: 3,
        alpha: 0.55,
        blur: s * 0.08,
    });

    return blobs;
}

/** Options of {@link Aurora}. */
export interface AuroraOptions {
    width: number;
    height: number;
    /** Deep, mid and hot colours, top to bottom. White is added under them. Default violet to pink. */
    colors?: [ColorSource, ColorSource, ColorSource];
    /** Colour above the light. Default near black. */
    background?: ColorSource;
    /** How high the light reaches, from 0 to 1. Default 0.62. */
    rise?: number;
    /** Drift speed. 0 freezes it. Default 1. */
    speed?: number;
    /** Corner radius of the box. Default 0. */
    radius?: number;
    ticker?: Ticker | null;
}

/**
 * Light rising from the bottom of a box in three colours, blended additively (Plus lighter) so it
 * burns to white where it is strongest. It drifts slowly while a ticker runs.
 */
export class Aurora extends Container {
    private readonly _bg = new SilkGraphics({ label: 'AuroraBackground' });
    private readonly _light = new SilkGraphics({ label: 'AuroraLight' });
    private readonly _clip = new SilkGraphics({ label: 'AuroraClip' });
    private readonly _driver: Driver;
    private _o: Required<Omit<AuroraOptions, 'ticker'>>;
    private _t = 0;

    constructor(options: AuroraOptions) {
        super({ label: 'Aurora' });
        this._o = {
            colors: [0x6f1bff, 0xee36ff, 0xffffff],
            background: 0x0d0d10,
            rise: 0.62,
            speed: 1,
            radius: 0,
            ...options,
        };
        this._light.blendMode = 'add';
        this.addChild(this._bg, this._light);
        // the light stays inside the box
        this.addChild(this._clip);
        this.mask = this._clip;
        this._driver = new Driver((dt) => this._step(dt), options.ticker);
        this._paintBackground();
        this._step(0);
        this._driver.wake();
    }

    /** Changes colours, rise, speed or size. */
    set(options: Partial<Omit<AuroraOptions, 'ticker'>>): this {
        this._o = { ...this._o, ...options };
        this._paintBackground();
        this._step(0);
        this._driver.wake();

        return this;
    }

    /** Advances by `dt` seconds (with `ticker: null`). */
    tick(dt: number): boolean {
        return this._driver.tick(dt);
    }

    override destroy(options?: Parameters<Container['destroy']>[0]): void {
        this._driver.sleep();
        super.destroy(options ?? { children: true });
    }

    private _paintBackground(): void {
        const { width, height, radius, background } = this._o;

        this._bg
            .clear()
            .roundRect(0, 0, width, height, radius, radius > 0 ? 0.6 : 0)
            .fill(background);
        this._clip
            .clear()
            .roundRect(0, 0, width, height, radius, radius > 0 ? 0.6 : 0)
            .fill(0xffffff);
    }

    private _step(dt: number): boolean {
        const { width, height, rise, speed, colors } = this._o;
        const tones = [colors[0], colors[1], colors[2], 0xffffff];

        this._t += dt * speed;
        this._light.clear();
        for (const b of auroraBlobs(this._t, width, height, rise)) {
            this._light.ellipse(b.x, b.y, b.rx, b.ry).fill({ color: tones[b.tone], alpha: b.alpha, blur: b.blur });
        }

        return speed !== 0;
    }
}
