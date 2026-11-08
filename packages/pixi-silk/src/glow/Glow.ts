import { type BLEND_MODES, Container } from 'pixi.js';
import { type FillInput, SilkGraphics, type StrokeInput } from '../SilkGraphics';

/**
 * One pass of a {@link Glow}: the same shape filled or stroked once more, optionally blurred,
 * scaled and blended additively. Stack a few and a flat shape starts to emit light.
 */
export interface GlowLayer {
    /** Fill of this pass (colour, gradient, alpha, blur). */
    fill?: FillInput;
    /** Stroke of this pass. */
    stroke?: StrokeInput;
    /** `add` is Figma's Plus lighter: light adds up and burns towards white. Default `normal`. */
    blend?: BLEND_MODES;
    /** Scale around the glow's centre. Default 1. */
    scale?: number;
    /** Offset. Default 0. */
    x?: number;
    y?: number;
    /** Opacity of the whole pass. Default 1. */
    alpha?: number;
}

/** Options of {@link Glow}. */
export interface GlowOptions {
    /** Adds the shape's outline to `g` (no fill or stroke call): `(g) => g.circle(0, 0, 40)`. */
    draw: (g: SilkGraphics) => void;
    /** Passes, back to front. See {@link neon} for a ready recipe. */
    layers: GlowLayer[];
    /** Point the layers scale around. Default (0, 0). */
    center?: [number, number];
}

/**
 * A shape drawn as a stack of passes: blurred blooms behind, a solid core, hot highlights on top.
 * Each pass is one {@link SilkGraphics}, so a whole glow costs a few draw calls.
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

    /** The passes, back to front (one graphics each). */
    get passes(): readonly SilkGraphics[] {
        return this._passes;
    }

    /** Replaces the shape and redraws. */
    setDraw(draw: (g: SilkGraphics) => void): this {
        this._draw = draw;

        return this.redraw();
    }

    /** Replaces the passes and redraws. */
    setLayers(layers: GlowLayer[]): this {
        this._layers = layers;

        return this.redraw();
    }

    /** Draws every pass again, for shapes that change over time. */
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
