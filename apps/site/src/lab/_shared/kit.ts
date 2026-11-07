import { type Application, Container, UPDATE_PRIORITY } from 'pixi.js';
import { createSilkApp, type SilkApp } from 'pixi-silk';
import './proto.css';
import { LAB_HOME, LAB_HOME_LABEL } from './paths';

export interface ProtoOptions {
    title: string;
    subtitle?: string;
    background?: number;
    /** Extra options for the Pixi application. */
    preserveDrawingBuffer?: boolean;
    /** MSAA for the main framebuffer (Silk doesn't need it; used for fair comparisons). */
    antialias?: boolean;
    /** Canvas touch-action; `none` for pages that handle drags themselves. Default `pan-y pinch-zoom`. */
    touchAction?: string;
}

export interface Proto {
    app: Application;
    /** Scrolling content root (follows window.scrollY). */
    stage: Container;
    /** Fixed overlay root (does not scroll). */
    overlay: Container;
    /** Sets the scrollable content height in CSS px (<= viewport height means no scrolling). */
    setContentHeight(h: number): void;
    readonly scrollY: number;
    silk: SilkApp;
    readonly width: number;
    readonly height: number;
    /** Registers a layout callback (called now and on every resize). */
    onResize(cb: (w: number, h: number) => void): void;
    /** Adds a control button / toggle to the bottom-right bar. */
    button(label: string, onClick: () => void): HTMLButtonElement;
    toggle(label: string, initial: boolean, onChange: (on: boolean) => void): HTMLButtonElement;
    slider(
        label: string,
        min: number,
        max: number,
        value: number,
        step: number,
        onInput: (v: number) => void,
    ): HTMLInputElement;
}

/** Boots a full-window prototype page with a back link, title and DPR/fps HUD. */
export async function boot(options: ProtoOptions): Promise<Proto> {
    const chrome = document.createElement('div');

    chrome.className = 'chrome';
    chrome.innerHTML = `<a class="back" href="${LAB_HOME}">${LAB_HOME_LABEL}</a><div class="titles"><h1></h1><p></p></div>`;
    chrome.querySelector('h1')!.textContent = options.title;
    chrome.querySelector('p')!.textContent = options.subtitle ?? '';
    document.body.appendChild(chrome);

    const host = document.createElement('div');

    host.id = 'stage';
    document.body.appendChild(host);

    const hud = document.createElement('div');

    hud.className = 'hud';
    document.body.appendChild(hud);

    const controls = document.createElement('div');

    controls.className = 'controls';
    document.body.appendChild(controls);

    const resizeCallbacks: ((w: number, h: number) => void)[] = [];
    const silk = await createSilkApp({
        parent: host,
        background: options.background ?? 0x000000,
        preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
        antialias: options.antialias ?? false,
        touchAction: options.touchAction,
        onResize: (w, h) => {
            for (const cb of resizeCallbacks) cb(w, h);
        },
    });
    const app = silk.app;
    // native document scrolling: a spacer sets the height, the stage follows scrollY every frame
    const scrollRoot = new Container();
    const overlay = new Container();
    const spacer = document.createElement('div');
    const scrim = document.createElement('div');

    spacer.className = 'spacer';
    scrim.className = 'scrim';
    document.body.append(spacer, scrim);
    app.stage.addChild(scrollRoot, overlay);
    const syncScroll = () => {
        scrollRoot.y = -window.scrollY;
        scrim.classList.toggle('on', window.scrollY > 2);
    };

    window.addEventListener('scroll', syncScroll, { passive: true });
    app.ticker.add(syncScroll, undefined, UPDATE_PRIORITY.HIGH);

    let frames = 0;
    let last = performance.now();
    let fps = 0;

    app.ticker.add(() => {
        frames++;
        const now = performance.now();

        if (now - last >= 500) {
            fps = (frames * 1000) / (now - last);
            frames = 0;
            last = now;
            const r = app.renderer;

            hud.textContent = `DPR ${window.devicePixelRatio}, res ${silk.resolution}, ${r.canvas.width}x${r.canvas.height} px, ${fps.toFixed(0)} fps`;
        }
    });

    return {
        app,
        stage: scrollRoot,
        overlay,
        setContentHeight(h: number) {
            spacer.style.height = `${Math.ceil(h)}px`;
            syncScroll();
        },
        get scrollY() {
            return window.scrollY;
        },
        silk,
        get width() {
            return silk.width;
        },
        get height() {
            return silk.height;
        },
        onResize(cb) {
            resizeCallbacks.push(cb);
            cb(silk.width, silk.height);
        },
        button(label, onClick) {
            const b = document.createElement('button');

            b.textContent = label;
            b.addEventListener('click', onClick);
            controls.appendChild(b);

            return b;
        },
        toggle(label, initial, onChange) {
            const b = document.createElement('button');
            let on = initial;

            b.textContent = label;
            b.setAttribute('aria-pressed', String(on));
            b.addEventListener('click', () => {
                on = !on;
                b.setAttribute('aria-pressed', String(on));
                onChange(on);
            });
            controls.appendChild(b);

            return b;
        },
        slider(label, min, max, value, step, onInput) {
            const l = document.createElement('label');
            const input = document.createElement('input');

            input.type = 'range';
            input.min = String(min);
            input.max = String(max);
            input.step = String(step);
            input.value = String(value);
            input.addEventListener('input', () => onInput(Number(input.value)));
            l.append(label, input);
            controls.appendChild(l);

            return input;
        },
    };
}

/**
 * Scales content of size cw x ch to fit the window when that stays readable; otherwise fits the
 * width and lets the page scroll. Returns the scale and the top-left position for the content.
 */
export function fitOrScroll(
    proto: Proto,
    cw: number,
    ch: number,
    o: { top?: number; bottom?: number; maxScale?: number; readable?: number } = {},
): { scale: number; x: number; y: number } {
    const top = o.top ?? 104;
    const bottom = o.bottom ?? 48;
    const maxScale = o.maxScale ?? 1.5;
    const availW = proto.width - 32;
    const availH = proto.height - top - bottom;
    let scale = Math.min(maxScale, availW / cw, availH / ch);
    let scroll = false;

    if (scale < (o.readable ?? 0.72)) {
        scale = Math.min(maxScale, availW / cw);
        scroll = true;
    }
    proto.setContentHeight(scroll ? top + ch * scale + bottom : 0);

    return { scale, x: Math.round((proto.width - cw * scale) / 2), y: top };
}

export { C, FONT, label, MONO } from './theme';
