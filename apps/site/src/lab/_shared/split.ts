import { Application, type ApplicationOptions } from 'pixi.js';
import { createSilkApp } from 'pixi-silk';
import './proto.css';
import { LAB_HOME, LAB_HOME_LABEL } from './paths';

export interface Pane {
    app: Application;
    host: HTMLDivElement;
    readonly width: number;
    readonly height: number;
    onResize(cb: (w: number, h: number) => void): void;
}

/**
 * Side-by-side panes, each its own Pixi application (MSAA is a per-context setting,
 * so a fair comparison needs separate canvases). Stacks vertically on narrow screens.
 */
export async function split(
    title: string,
    subtitle: string,
    panes: { caption: string; options?: Partial<ApplicationOptions>; plain?: boolean }[],
): Promise<Pane[]> {
    const chrome = document.createElement('div');

    chrome.className = 'chrome';
    chrome.innerHTML = `<a class="back" href="${LAB_HOME}">${LAB_HOME_LABEL}</a><div class="titles"><h1></h1><p></p></div>`;
    chrome.querySelector('h1')!.textContent = title;
    chrome.querySelector('p')!.textContent = subtitle;
    document.body.appendChild(chrome);

    // panes flow in the document: one screen-high row on wide screens, stacked (and scrolling) on narrow ones
    const row = document.createElement('div');
    const scrim = document.createElement('div');

    row.className = 'split-row';
    scrim.className = 'scrim';
    document.body.append(row, scrim);
    window.addEventListener('scroll', () => scrim.classList.toggle('on', window.scrollY > 2), { passive: true });

    // lay out every cell first so each app measures its final size
    const hosts = panes.map((pane) => {
        const cell = document.createElement('div');

        cell.style.cssText =
            'position:relative;border-radius:16px;overflow:hidden;background:#0b0b0c;' +
            'box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);min-height:160px';
        const cap = document.createElement('div');

        cap.className = 'tag';
        cap.style.cssText = 'position:absolute;left:12px;top:12px;z-index:2';
        cap.textContent = pane.caption;
        const host = document.createElement('div');

        host.style.cssText = 'position:absolute;inset:0';
        cell.append(host, cap);
        row.appendChild(cell);

        return host;
    });
    const result: Pane[] = [];

    for (const [i, pane] of panes.entries()) {
        const host = hosts[i];
        const callbacks: ((w: number, h: number) => void)[] = [];
        let app: Application;

        if (pane.plain) {
            // a stock Pixi app (autoDensity + resizeTo) as most projects create it
            app = new Application();
            await app.init({
                resizeTo: host,
                resolution: window.devicePixelRatio,
                autoDensity: true,
                background: 0x0b0b0c,
                preference: 'webgl',
                ...pane.options,
            });
            app.canvas.style.display = 'block';
            // Pixi sets touch-action: none, which would trap page scrolling on touch screens
            app.canvas.style.touchAction = 'pan-y pinch-zoom';
            host.appendChild(app.canvas);
            app.renderer.on('resize', (w: number, h: number) => callbacks.forEach((cb) => cb(w, h)));
            new ResizeObserver(() => app.resize()).observe(host);
        } else {
            const silk = await createSilkApp({
                parent: host,
                background: 0x0b0b0c,
                ...pane.options,
                onResize: (w, h) => callbacks.forEach((cb) => cb(w, h)),
            });

            app = silk.app;
        }
        result.push({
            app,
            host,
            get width() {
                return app.screen.width;
            },
            get height() {
                return app.screen.height;
            },
            onResize(cb) {
                callbacks.push(cb);
                cb(app.screen.width, app.screen.height);
            },
        });
    }

    return result;
}
