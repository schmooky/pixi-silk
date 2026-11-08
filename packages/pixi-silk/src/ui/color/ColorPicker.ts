import { Container, type Ticker } from 'pixi.js';
import { damp } from '../../motion';
import { SilkGraphics } from '../../SilkGraphics';
import { type Signal, signal } from '../../signal';
import { Driver } from '../driver';
import { trackGesture } from '../gesture';
import type { InputKind, InputProfiles } from '../input';
import { ColorModel } from './model';

/** Options every picker accepts. */
export interface ColorPickerOptions {
    /** The colour to edit. Pickers sharing a model stay in sync. Default: a new model. */
    model?: ColorModel;
    /** Ticker driving the handle motion. Default `Ticker.shared`, `null` for manual {@link ColorPicker.tick}. */
    ticker?: Ticker | null;
    /** Per pointer kind overrides. Touch gets bigger handles through the profile's `scale`. */
    profiles?: InputProfiles;
}

/** Reactive state of a picker. */
export interface ColorPickerState {
    /** Part being dragged (`ring`, `area`, `strip` ...), or null. */
    dragging: Signal<string | null>;
    /** Pointer kind of the last press. Touch gets bigger handles. */
    kind: Signal<InputKind>;
}

/**
 * Base of the pickers. It binds to a {@link ColorModel} and turns presses into edits of one part
 * at a time: a drag keeps editing that part even outside it. Handles animate towards the model.
 * The colour field redraws only when it changes, the handles every frame they move. A drag writes
 * to the model continuously and calls `model.commit()` on release.
 */
export abstract class ColorPicker extends Container {
    /** The colour this picker edits. Share it to link pickers. */
    readonly model: ColorModel;
    /** Signals to read. See {@link ColorPickerState}. */
    readonly state: ColorPickerState = {
        dragging: signal<string | null>(null),
        kind: signal<InputKind>('mouse'),
    };

    /** Colour areas (gradients). */
    protected readonly _field: SilkGraphics = new SilkGraphics();
    /** Handles and outlines. */
    protected readonly _marks: SilkGraphics = new SilkGraphics();
    protected readonly _driver: Driver;
    protected _fieldDirty = true;
    protected _part: string | null = null;
    /** 0..1, grows while a handle is held. */
    protected _press = 0;
    private readonly _unsubscribe: () => void;
    private readonly _untrack: () => void;

    constructor(options: ColorPickerOptions, label: string) {
        super({ label });
        this.model = options.model ?? new ColorModel();
        this._driver = new Driver((dt) => this._step(dt), options.ticker);
        this.addChild(this._field, this._marks);
        this._unsubscribe = this.model.value.subscribe((value, previous) => {
            this._onModel(value.h !== previous.h, this.model.origin === this);
            this._driver.wake();
        });
        this._untrack = trackGesture(
            this,
            {
                onDown: (p) => this._begin(p.x, p.y, p.kind),
                onDrag: (p) => this._move(p.x, p.y),
                onUp: () => this._end(),
            },
            { space: this, holdMs: 0, flickSpeed: 0, profiles: options.profiles },
        );
        this.hitArea = { contains: (x: number, y: number) => this._hitPart(x, y) !== null };
        this.cursor = 'crosshair';
        this._driver.wake();
    }

    /** Advances the animation by `dt` seconds (only needed with `ticker: null`). Returns true while moving. */
    tick(dt: number): boolean {
        return this._driver.tick(dt);
    }

    /** Stops the animation and unsubscribes from the model. The model stays usable. Destroys children by default. */
    override destroy(options?: Parameters<Container['destroy']>[0]): void {
        this._driver.sleep();
        this._unsubscribe();
        this._untrack();
        super.destroy(options ?? { children: true });
    }

    /** Handle radius for the current pointer kind, grown while held. */
    protected get _handleR(): number {
        const base = this.state.kind.value === 'touch' ? 11 : 7;

        return base * (1 + 0.22 * this._press);
    }

    /** Smoothing rate of handles: direct while dragging, softer when the colour changes elsewhere. */
    protected get _lambda(): number {
        return this._part ? 45 : 16;
    }

    protected _begin(x: number, y: number, kind: InputKind = 'mouse'): void {
        const part = this._hitPart(x, y);

        if (!part) return;
        this._part = part;
        this.state.kind.set(kind);
        this.state.dragging.set(part);
        this._apply(part, x, y);
        this._driver.wake();
    }

    protected _move(x: number, y: number): void {
        if (!this._part) return;
        this._apply(this._part, x, y);
        this._driver.wake();
    }

    protected _end(): void {
        if (!this._part) return;
        this._part = null;
        this.state.dragging.set(null);
        this.model.commit();
        this._driver.wake();
    }

    /** Which part of the picker is at (x, y), or null for none. */
    protected abstract _hitPart(x: number, y: number): string | null;
    /** Writes the colour under (x, y) for `part` to the model. */
    protected abstract _apply(part: string, x: number, y: number): void;
    /** Redraws the colour field into `_field`. */
    protected abstract _drawField(): void;
    /** Moves the displayed handle values towards the model. Returns true while moving. */
    protected abstract _animate(dt: number): boolean;
    /** Redraws handles into `_marks`. */
    protected abstract _drawMarks(): void;

    /** Called on every model change. By default any change redraws the field. */
    protected _onModel(_hueChanged: boolean, _own: boolean): void {
        this._fieldDirty = true;
    }

    private _step(dt: number): boolean {
        const target = this._part ? 1 : 0;

        this._press = damp(this._press, target, 20, dt);
        let busy = Math.abs(this._press - target) > 0.003;

        if (this._animate(dt)) busy = true;
        if (this._fieldDirty) {
            this._fieldDirty = false;
            this._field.clear();
            this._drawField();
        }
        this._marks.clear();
        this._drawMarks();

        return busy;
    }
}

/**
 * Moves `current` towards `target` by exponential smoothing at `lambda` (about 1 / seconds) over
 * `dt` seconds. Snaps to `target` when closer than `eps`. Returns [value, stillMoving].
 */
export function approach(current: number, target: number, lambda: number, dt: number, eps = 1e-4): [number, boolean] {
    const next = damp(current, target, lambda, dt);

    return Math.abs(next - target) < eps ? [target, false] : [next, true];
}
