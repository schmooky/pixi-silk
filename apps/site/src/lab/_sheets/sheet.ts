import { Container, Graphics, Text } from 'pixi.js';
import { createSilkApp, SilkGraphics } from 'pixi-silk';
import { attachLoupe } from '../_shared/loupe';
import '../_shared/proto.css';
import { LAB_HOME, LAB_HOME_LABEL, REFS } from '../_shared/paths';
import { Cx, SF, type SheetWidget } from './cx';

export interface SheetOptions {
    title: string;
    subtitle: string;
    /** Reference image (served from /refs). */
    ref: string;
    width: number;
    height: number;
    background: number;
    /** Horizontal text condense (SF Compact is ~7% narrower than SF Pro). */
    condense?: number;
    /** Optical text scale (see `Cx.optical`); 2 for sheets exported from @2x designs. */
    optical?: number;
    /** Optional painter for the sheet background (e.g. a gradient); sheet mode only. */
    backdrop?: (g: SilkGraphics) => void;
    /** Optional painter for per-widget chrome (cards, shadows) in widget-local coordinates. */
    card?: (g: SilkGraphics, w: SheetWidget) => void;
    widgets: SheetWidget[];
}

const params = new URLSearchParams(location.search);
/** Padding of the list-mode tile behind widgets of light sheets (room for the card shadow). */
const TILE = { side: 20, top: 16, bottom: 48 };

/**
 * A reference sheet rebuilt 1:1 in sheet pixels.
 * - sheet mode: the exact reference layout, fit to the window width, compare slider;
 * - list mode (default on narrow screens): widgets stacked at a readable size;
 * both scroll natively when taller than the window.
 * `?bare=1` fills the window with the sheet (snapshots), `?still=1&t=3` freezes time.
 */
export async function sheetPage(o: SheetOptions): Promise<void> {
    const bare = params.has('bare');
    const still = params.has('still');
    const t0 = Number(params.get('t') ?? 3);

    Cx.condense = o.condense ?? 1;
    Cx.optical = o.optical ?? 1;
    const host = document.createElement('div');

    host.id = 'stage';
    document.body.appendChild(host);
    let hud: HTMLDivElement | null = null;
    const spacer = document.createElement('div');
    const scrim = document.createElement('div');

    spacer.className = 'spacer';
    scrim.className = 'scrim';
    document.body.append(spacer, scrim);

    if (!bare) {
        const chrome = document.createElement('div');

        chrome.className = 'chrome';
        chrome.innerHTML = `<a class="back" href="${LAB_HOME}">${LAB_HOME_LABEL}</a><div class="titles"><h1></h1><p></p></div>`;
        chrome.querySelector('h1')!.textContent = o.title;
        chrome.querySelector('p')!.textContent = o.subtitle;
        document.body.appendChild(chrome);
        hud = document.createElement('div');
        hud.className = 'hud';
        document.body.appendChild(hud);
    }

    const silk = await createSilkApp({ parent: host, background: bare ? o.background : 0x000000 });
    const app = silk.app;
    const scroller = new Container();
    const sheet = new Container();
    const back = new SilkGraphics();
    const mask = new Graphics().rect(0, 0, o.width, o.height).fill(0xffffff);

    app.stage.addChild(scroller);
    scroller.addChild(sheet);
    sheet.addChild(back, mask);
    back.rect(0, 0, o.width, o.height).fill(o.background);
    o.backdrop?.(back);

    // light sheets get a tile of their background behind each widget in list mode
    const light = luminance(o.background) > 0.5;
    const items = o.widgets.map((w) => {
        const holder = new Container();
        const tile = new SilkGraphics();
        const card = new SilkGraphics();
        const c = new Cx();
        const caption = new Text({
            text: w.name,
            style: { fontFamily: SF, fontSize: 12, fill: 0x8e8e93, fontWeight: '600' },
        });

        if (light)
            tile.roundRect(-TILE.side, -TILE.top, w.w + 2 * TILE.side, w.h + TILE.top + TILE.bottom, 26, 0.3).fill(
                o.background,
            );
        tile.visible = false;
        o.card?.(card, w);
        holder.addChild(tile, card, c.view);
        sheet.addChild(holder);
        scroller.addChild(caption);

        return { w, c, holder, tile, caption };
    });

    let listMode = false;
    let userMode: 'sheet' | 'list' | null = null;
    let compare: ReturnType<typeof compareSlider> | null = null;
    const top = bare ? 0 : 92;

    const layout = (W: number, H: number) => {
        listMode = !bare && (userMode ? userMode === 'list' : W < 720);
        let contentH = 0;

        if (!listMode) {
            // exact reference layout
            const fitW = (W - (bare ? 0 : 24)) / o.width;
            const fitH = (H - top - (bare ? 0 : 36)) / o.height;
            const s = bare ? Math.min(fitW, fitH) : Math.min(1.4, fitH >= 0.7 * fitW ? Math.min(fitW, fitH) : fitW);

            sheet.scale.set(s);
            sheet.position.set(
                Math.round((W - o.width * s) / 2),
                top + (bare ? Math.round((H - o.height * s) / 2) : 0),
            );
            sheet.mask = mask;
            mask.visible = true;
            back.visible = true;
            for (const it of items) {
                it.holder.position.set(it.w.x, it.w.y);
                it.holder.scale.set(1);
                it.caption.visible = false;
                it.tile.visible = false;
            }
            contentH = top + o.height * s + (bare ? 0 : 36);
            Cx.textResolution = Math.min(8, silk.resolution * Math.max(1, s) * 1.25);
            compare?.place(sheet.x, sheet.y - window.scrollY, o.width * s, o.height * s, true);
        } else {
            // stacked list at a readable size
            sheet.scale.set(1);
            sheet.position.set(0, 0);
            sheet.mask = null;
            mask.visible = false;
            back.visible = false;
            let y = top + 8;
            let maxS = 1;

            for (const it of items) {
                // widgets the reference crops at its edges only make sense on the sheet
                it.caption.visible = !it.w.partial;
                it.tile.visible = light;
                if (it.w.partial) continue;
                const s = Math.min(2.4, (W - 32) / (it.w.w + (light ? 2 * TILE.side : 0)));

                maxS = Math.max(maxS, s);
                it.caption.position.set(16, y);
                y += 20 + (light ? TILE.top * s : 0);
                it.holder.scale.set(s);
                it.holder.position.set(Math.round((W - it.w.w * s) / 2), y);
                y += it.w.h * s + (light ? TILE.bottom * s : 0) + 26;
            }
            contentH = y + 20;
            Cx.textResolution = Math.min(8, silk.resolution * maxS * 1.1);
            compare?.place(0, 0, 0, 0, false);
        }
        spacer.style.height = `${Math.ceil(contentH)}px`;
    };

    if (!bare) {
        compare = compareSlider(`${REFS}${o.ref}`, params.has('compare'));
        const bar = document.querySelector('.controls')!;
        const toggle = document.createElement('button');

        toggle.textContent = 'List';
        toggle.addEventListener('click', () => {
            userMode = listMode ? 'sheet' : 'list';
            layout(app.screen.width, app.screen.height);
            toggle.setAttribute('aria-pressed', String(listMode));
        });
        bar.prepend(toggle);
        const syncToggle = () => toggle.setAttribute('aria-pressed', String(listMode));

        app.renderer.on('resize', syncToggle);
        queueMicrotask(syncToggle);
    }
    app.renderer.on('resize', () => layout(app.screen.width, app.screen.height));
    layout(app.screen.width, app.screen.height);

    const sync = () => {
        scroller.y = -window.scrollY;
        scrim.classList.toggle('on', window.scrollY > 2);
        if (!listMode)
            compare?.place(sheet.x, sheet.y - window.scrollY, o.width * sheet.scale.x, o.height * sheet.scale.y, true);
    };

    window.addEventListener('scroll', sync, { passive: true });

    const frame = (t: number) => {
        const viewTop = window.scrollY;
        const viewBottom = viewTop + app.screen.height;

        for (const it of items) {
            // in list mode only draw what is on screen
            if (listMode) {
                const y = it.holder.y;
                const h = it.w.h * it.holder.scale.y;

                it.holder.visible = !it.w.partial && y + h > viewTop - 50 && y < viewBottom + 50;
                if (!it.holder.visible) continue;
            } else it.holder.visible = true;
            it.c.begin(t);
            it.w.draw(it.c);
            it.c.end();
        }
    };

    if (still) {
        frame(t0);
        app.ticker.addOnce(() =>
            app.ticker.addOnce(() => {
                (window as unknown as { __silkReady: boolean }).__silkReady = true;
            }),
        );

        return;
    }

    let t = t0;
    let frames = 0;
    let acc = 0;

    app.ticker.add((ticker) => {
        const dt = Math.min(0.1, ticker.deltaMS / 1000);

        t += dt;
        sync();
        frame(t);
        frames++;
        acc += dt;
        if (hud && acc > 0.5) {
            hud.textContent = `DPR ${window.devicePixelRatio}, ${o.widgets.length} widgets, ${(frames / acc).toFixed(0)} fps`;
            frames = 0;
            acc = 0;
        }
    });
    if (!bare) attachLoupe([app]);
}

function luminance(color: number): number {
    return (0.2126 * ((color >> 16) & 255) + 0.7152 * ((color >> 8) & 255) + 0.0722 * (color & 255)) / 255;
}

/** Reference image overlay with a draggable split: left of the handle shows the reference. */
function compareSlider(src: string, initial: boolean) {
    const wrap = document.createElement('div');

    wrap.style.cssText = 'position:fixed;z-index:1;overflow:hidden;pointer-events:none;display:none';
    const img = document.createElement('img');

    img.src = src;
    img.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;display:block';
    wrap.appendChild(img);
    const handle = document.createElement('div');

    handle.style.cssText =
        'position:fixed;z-index:1;width:28px;margin-left:-14px;cursor:ew-resize;display:none;touch-action:none';
    handle.innerHTML =
        '<div style="position:absolute;left:13px;top:0;bottom:0;width:2px;background:#ffd60a;box-shadow:0 0 0 1px rgba(0,0,0,.4)"></div>' +
        '<div style="position:absolute;left:3px;top:50%;margin-top:-11px;width:22px;height:22px;border-radius:11px;background:#ffd60a;color:#000;font:700 11px/22px system-ui;text-align:center">⇆</div>';
    document.body.append(wrap, handle);
    const button = document.createElement('button');
    const bar = document.createElement('div');

    bar.className = 'controls';
    button.textContent = 'Compare with reference';
    bar.appendChild(button);
    document.body.appendChild(bar);
    let on = initial;
    let allowed = true;
    let split = 0.5;
    const box = { x: 0, y: 0, w: 0, h: 0 };
    const apply = () => {
        const show = on && allowed;

        wrap.style.display = show ? 'block' : 'none';
        handle.style.display = show ? 'block' : 'none';
        button.style.display = allowed ? '' : 'none';
        button.setAttribute('aria-pressed', String(on));
        Object.assign(wrap.style, { left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px` });
        wrap.style.clipPath = `inset(0 ${(1 - split) * 100}% 0 0)`;
        const visibleTop = Math.max(box.y, 0);
        const visibleBottom = Math.min(box.y + box.h, window.innerHeight);

        Object.assign(handle.style, {
            left: `${box.x + box.w * split}px`,
            top: `${visibleTop}px`,
            height: `${Math.max(0, visibleBottom - visibleTop)}px`,
        });
    };

    button.addEventListener('click', () => {
        on = !on;
        apply();
    });
    handle.addEventListener('pointerdown', (e) => {
        handle.setPointerCapture(e.pointerId);
        const move = (ev: PointerEvent) => {
            split = Math.min(1, Math.max(0, (ev.clientX - box.x) / box.w));
            apply();
        };
        const up = () => {
            handle.removeEventListener('pointermove', move);
            handle.removeEventListener('pointerup', up);
        };

        handle.addEventListener('pointermove', move);
        handle.addEventListener('pointerup', up);
    });
    apply();

    return {
        place(x: number, y: number, w: number, h: number, isAllowed: boolean) {
            Object.assign(box, { x, y, w, h });
            allowed = isAllowed;
            apply();
        },
    };
}
