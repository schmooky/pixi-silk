import { Container, type Text, type TextStyleOptions } from 'pixi.js';
import { damp } from '../motion';
import { SilkGraphics } from '../SilkGraphics';
import { createIcon } from './icon';
import { hex } from './paint';

/** Options of {@link ValuePill}. */
export interface ValuePillOptions {
    /** Background. Default white. */
    fill?: number | string;
    /** Text colour. Default near black. */
    color?: number | string;
    /** Default 12. */
    fontSize?: number;
    textStyle?: TextStyleOptions;
    /** Pill height. Default 22. */
    height?: number;
}

/**
 * A small rounded label for live readouts: angles while rotating, sizes while resizing, distances
 * between snapped objects. Centred on its position. Call {@link ValuePill.update} each frame to fade.
 */
export class ValuePill extends Container {
    /** Wanted visibility. `update` fades towards it. */
    shown = false;
    private readonly _bg = new SilkGraphics();
    private readonly _text: Text;
    private readonly _fill: number;
    private readonly _h: number;
    private _value = '';
    private _fade = 0;

    constructor(options: ValuePillOptions = {}) {
        super({ label: 'ValuePill' });
        this._fill = hex(options.fill ?? 0xffffff);
        this._h = options.height ?? 22;
        this._text = createIcon('', 28, {
            fontSize: options.fontSize ?? 12,
            fontWeight: '600',
            ...options.textStyle,
        }) as Text;
        this._text.tint = hex(options.color ?? 0x1c1c1e);
        this.addChild(this._bg, this._text);
        this.alpha = 0;
        this.visible = false;
        this.eventMode = 'none';
    }

    /** Current text. */
    get text(): string {
        return this._value;
    }

    set text(value: string) {
        if (value === this._value) return;
        this._value = value;
        this._text.text = value;
        this._redraw();
    }

    /** Sets the text and shows the pill. */
    show(text?: string): void {
        if (text !== undefined) this.text = text;
        this.shown = true;
    }

    hide(): void {
        this.shown = false;
    }

    /** Fades towards `shown`. Returns true while fading. */
    update(dt: number): boolean {
        const target = this.shown ? 1 : 0;

        this._fade = damp(this._fade, target, 18, dt);
        if (Math.abs(this._fade - target) < 0.004) this._fade = target;
        this.alpha = this._fade;
        this.visible = this._fade > 0;
        this.scale.set(0.9 + 0.1 * this._fade);

        return this._fade !== target;
    }

    private _redraw(): void {
        const w = Math.max(this._h, this._text.width + 18);

        this._bg
            .clear()
            .pill(-w / 2, -this._h / 2, w, this._h)
            .fill(this._fill);
    }
}
