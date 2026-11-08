import { Container, Graphics } from 'pixi.js';
import type { ViewportRect } from './smart-container';

/** Window sizes to preview, in CSS pixels. */
export const DEVICES: Readonly<Record<string, readonly [number, number]>> = {
    'phone portrait': [390, 844],
    'phone landscape': [844, 390],
    'small phone': [360, 640],
    'tablet portrait': [820, 1180],
    'tablet landscape': [1180, 820],
    desktop: [1920, 1080],
    ultrawide: [2560, 1080],
};

/** Options of {@link SimulatedViewport}. */
export interface SimulatedViewportOptions {
    /** The area to show the device in, in the parent's space. */
    area: ViewportRect;
    /** The window size to simulate: a size or a {@link DEVICES} name. Default `phone portrait`. */
    device?: readonly [number, number] | string;
    /** Space kept around the device inside the area. Default 16. */
    margin?: number;
    /** Bezel colour. Default dark grey. */
    bezel?: number;
}

/**
 * Previews a window size inside a desktop page: a device of that size, scaled down to fit an area
 * (letterboxed), with a bezel and a mask. Add SmartContainers to {@link SimulatedViewport.content}
 * and pass the simulator itself as their `viewport`: it is a signal of the device's window, so
 * they lay out as they would on that device.
 */
export class SimulatedViewport extends Container {
    /** Put your SmartContainers here. It is the device screen, in device pixels. */
    readonly content: Container = new Container({ label: 'SimulatedViewport content' });
    private readonly _bezel = new Graphics();
    private readonly _mask = new Graphics();
    private readonly _listeners = new Set<() => void>();
    private readonly _value: Required<ViewportRect> = { x: 0, y: 0, width: 390, height: 844 };
    private _area: ViewportRect;
    private readonly _margin: number;
    private readonly _color: number;

    constructor(options: SimulatedViewportOptions) {
        super({ label: 'SimulatedViewport' });
        this._area = { ...options.area };
        this._margin = options.margin ?? 16;
        this._color = options.bezel ?? 0x2c2c2e;
        this.content.mask = this._mask;
        this.addChild(this._bezel, this.content, this._mask);
        this.setDevice(options.device ?? 'phone portrait');
    }

    /** The simulated window, in device pixels. SmartContainers read it as a viewport source. */
    get value(): Required<ViewportRect> {
        return this._value;
    }

    /** Calls `fn` when the device changes. Returns the unsubscribe function. */
    subscribe(fn: () => void): () => void {
        this._listeners.add(fn);

        return () => this._listeners.delete(fn);
    }

    /** The scale the device is shown at. */
    get deviceScale(): number {
        return this.content.scale.x;
    }

    /** Simulates another window size. */
    setDevice(device: readonly [number, number] | string): this {
        const size = typeof device === 'string' ? DEVICES[device] : device;

        if (!size) throw new Error(`SimulatedViewport: unknown device '${device}'`);
        this._value.width = size[0];
        this._value.height = size[1];
        this._fit();
        for (const fn of this._listeners) fn();

        return this;
    }

    /** Shows the device in another area. */
    setArea(area: ViewportRect): this {
        this._area = { ...area };
        this._fit();

        return this;
    }

    /** Fits the device in the area, centred, never larger than 1:1. */
    private _fit(): void {
        const a = this._area;
        const pad = this._margin;
        const { width, height } = this._value;
        const k = Math.min(1, (a.width - pad * 2) / width, (a.height - pad * 2) / height);
        const x = (a.x ?? 0) + (a.width - width * k) / 2;
        const y = (a.y ?? 0) + (a.height - height * k) / 2;
        const r = Math.min(18, width * k * 0.05);

        this.content.position.set(x, y);
        this.content.scale.set(k);
        this._bezel
            .clear()
            .roundRect(x - 7, y - 7, width * k + 14, height * k + 14, r + 7)
            .fill(this._color);
        this._mask
            .clear()
            .roundRect(x, y, width * k, height * k, r)
            .fill(0xffffff);
    }
}

/** Creates a {@link SimulatedViewport}. */
export function simulateViewport(options: SimulatedViewportOptions): SimulatedViewport {
    return new SimulatedViewport(options);
}
