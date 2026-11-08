import { type BLEND_MODES, Container } from 'pixi.js';
import { type FillInput, SilkGraphics, type StrokeInput } from '../SilkGraphics';

/**
 * One pass of a {@link Glow}: the same shape filled or stroked once more, optionally blurred,
 * scaled and blended additively. Stack a few and a flat shape starts to emit light.
 */
export interface GlowLayer {
    /** Fill of this pass: colour, gradient, alpha and blur, as in `SilkGraphics.fill`. Left out, the pass is not filled. */
    fill?: FillInput;
    /** Stroke of this pass, as in `SilkGraphics.stroke`. Left out, the pass is not stroked. */
    stroke?: StrokeInput;
    /** Blend mode of the pass. `add` sums light, so overlaps burn towards white. Default `normal`. */
    blend?: BLEND_MODES;
    /** Scale of the pass around {@link GlowOptions.center}. Default 1. */
    scale?: number;
    /** Horizontal offset of the pass in local units. Default 0. */
    x?: number;
    /** Vertical offset of the pass in local units. Default 0. */
    y?: number;
    /** Opacity of the whole pass, 0 to 1. Default 1. */
    alpha?: number;
}

/** Options of {@link Glow}. */
export interface GlowOptions {
    /**
     * Adds the shape to `g` without a fill or stroke call, for example `(g) => g.circle(0, 0, 40)`. It runs
     * once per pass on every redraw, with the pass transform already set.
     */
    draw: (g: SilkGraphics) => void;
    /** Passes, back to front. See {@link neon} for a ready recipe. An empty array draws nothing. */
    layers: GlowLayer[];
    /** Point in local units that each pass scales around. Default `[0, 0]`. */
    center?: [number, number];
}

/**
 * A shape drawn as a stack of passes from `pixi-silk/glow`: blurred blooms behind, a solid core,
 * hot highlights on top. Each pass is one child {@link SilkGraphics}, so a glow costs one draw call
 * per pass unless batching merges them.
 *
 * ```ts
 * const glow = new Glow({ draw: (g) => g.circle(0, 0, 40), layers: neon(0xff3df5) });
 * ```
 */
export class Glow extends Container {
    private _draw: (g: SilkGraphics) => void;
    private _layers: GlowLayer[];
    private _center: [number, number];
    private _passes: SilkGraphics[] = [];

    constructor(options: GlowOptions) {
        super({ label: 'Glow' });
        this._draw = options.draw;
        this._layers = options.layers;
        this._center = options.center ?? [0, 0];
        this.redraw();
    }

    /** One graphics per pass, back to front. Read-only, rebuilt by {@link Glow.redraw}. */
    get passes(): readonly SilkGraphics[] {
        return this._passes;
    }

    /** Replaces the draw function and redraws every pass. Returns this. */
    setDraw(draw: (g: SilkGraphics) => void): this {
        this._draw = draw;

        return this.redraw();
    }

    /** Replaces the passes and redraws. Adds or destroys pass graphics to match the new count. Returns this. */
    setLayers(layers: GlowLayer[]): this {
        this._layers = layers;

        return this.redraw();
    }

    /** Clears and draws every pass again. Call it when the shape drawn by `draw` changes. Returns this. */
    redraw(): this {
        while (this._passes.length < this._layers.length) {
            const g = new SilkGraphics({ label: 'GlowPass' });

            this._passes.push(g);
            this.addChild(g);
        }
        while (this._passes.length > this._layers.length) this._passes.pop()?.destroy();
        const [cx, cy] = this._center;

        this._layers.forEach((layer, i) => {
            const g = this._passes[i];
            const k = layer.scale ?? 1;

            g.clear();
            g.blendMode = layer.blend ?? 'normal';
            g.alpha = layer.alpha ?? 1;
            g.translateTransform(cx + (layer.x ?? 0), cy + (layer.y ?? 0));
            g.scaleTransform(k);
            g.translateTransform(-cx, -cy);
            this._draw(g);
            if (layer.fill !== undefined) g.fill(layer.fill);
            if (layer.stroke !== undefined) g.stroke(layer.stroke);
        });

        return this;
    }
}
