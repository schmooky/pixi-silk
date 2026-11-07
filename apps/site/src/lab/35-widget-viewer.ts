import { Container } from 'pixi.js';
import { createSilkApp, SilkGraphics } from 'pixi-silk';
import './_shared/proto.css';
import { LAB_HOME, LAB_HOME_LABEL, REFS } from './_shared/paths';
import { Cx, type SheetWidget } from './_sheets/cx';
import { SHEETS, type SheetDef } from './_sheets/registry';

/*
 * Any widget from the five reference sheets, large, next to its crop of the reference
 * (or overlaid on it). The arrow keys step through them and ?w=<id> links to one.
 */

interface Entry {
    sheet: SheetDef;
    widget: SheetWidget;
}

const entries: Entry[] = SHEETS.flatMap((sheet) =>
    sheet.widgets.filter((w) => !w.partial).map((widget) => ({ sheet, widget })),
);
const params = new URLSearchParams(location.search);
let index = Math.max(
    0,
    entries.findIndex((e) => e.widget.id === params.get('w')),
);

document.body.insertAdjacentHTML(
    'beforeend',
    `
<div class="chrome"><a class="back" href="${LAB_HOME}">${LAB_HOME_LABEL}</a><div class="titles"><h1>Widget viewer</h1>
<p>Every widget from the reference sheets, rendered live with Silk next to its crop of the reference. Use the arrow keys to step through them. Overlay the reference to check the alignment.</p></div></div>
<div class="viewer">
  <div class="vbar controls-inline">
    <button data-step="-1" aria-label="Previous widget">Prev</button>
    <select aria-label="Widget"></select>
    <button data-step="1" aria-label="Next widget">Next</button>
    <label><input type="checkbox" id="overlay"> Overlay</label>
    <label title="Hold the pose the reference shows"><input type="checkbox" id="pause"> Freeze</label>
    <span class="count"></span>
  </div>
  <div class="vpanes">
    <figure><div class="vhost"></div><div class="vcrop overlay"></div><figcaption>Silk</figcaption></figure>
    <figure><div class="vcrop ref"></div><figcaption>Reference</figcaption></figure>
  </div>
</div>
<div class="scrim"></div>`,
);

const style = document.createElement('style');

style.textContent = `
.viewer { margin: 92px 12px 24px; }
.vbar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 10px; }
.vbar button, .vbar label, .vbar select {
    font: 13px/1 -apple-system, BlinkMacSystemFont, system-ui, sans-serif; color: var(--text); background: var(--panel);
    border: 1px solid var(--line); border-radius: 999px; padding: 8px 12px; cursor: pointer; display: inline-flex; gap: 6px; align-items: center;
}
.vbar select { max-width: min(100%, 360px); appearance: none; padding-right: 14px; }
.vbar .count { color: var(--muted); font: 12px ui-monospace, "SF Mono", Menlo, monospace; margin-left: 4px; }
.vpanes { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 380px), 1fr)); }
.vpanes figure {
    margin: 0; position: relative; height: max(300px, calc(100dvh - 200px)); border-radius: 16px; overflow: hidden;
    background: #0b0b0c; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .08);
}
.vpanes figcaption {
    position: absolute; left: 12px; top: 12px; font: 600 11px/1 -apple-system, system-ui, sans-serif; letter-spacing: .04em;
    text-transform: uppercase; color: var(--muted); pointer-events: none;
}
.vhost { position: absolute; inset: 0; }
.vcrop { position: absolute; background-repeat: no-repeat; pointer-events: none; }
.vcrop.overlay { opacity: .5; display: none; }
.viewer.overlaid .vcrop.overlay { display: block; }
@media (max-width: 640px) {
    .viewer { margin-top: 64px; }
    .vpanes figure { height: min(58dvh, 460px); }
}`;
document.head.appendChild(style);

const select = document.querySelector('select')!;
const count = document.querySelector('.count')!;
const viewer = document.querySelector<HTMLDivElement>('.viewer')!;
const host = document.querySelector<HTMLDivElement>('.vhost')!;
const refCrop = document.querySelector<HTMLDivElement>('.vcrop.ref')!;
const overlayCrop = document.querySelector<HTMLDivElement>('.vcrop.overlay')!;
const overlay = document.querySelector<HTMLInputElement>('#overlay')!;
const pause = document.querySelector<HTMLInputElement>('#pause')!;
const scrim = document.querySelector<HTMLDivElement>('.scrim')!;
const figures = [...document.querySelectorAll<HTMLElement>('.vpanes figure')];

for (const sheet of SHEETS) {
    const group = document.createElement('optgroup');

    group.label = sheet.label;
    for (const [i, e] of entries.entries()) {
        if (e.sheet !== sheet) continue;
        const option = document.createElement('option');

        option.value = String(i);
        option.textContent = e.widget.name;
        group.appendChild(option);
    }
    select.appendChild(group);
}

const silk = await createSilkApp({ parent: host, background: 0x0b0b0c });
const app = silk.app;
let holder: Container | null = null;
let cx: Cx | null = null;
let t = 3;

function show(i: number): void {
    index = (i + entries.length) % entries.length;
    const { sheet, widget } = entries[index];

    Cx.condense = sheet.condense ?? 1;
    Cx.optical = sheet.optical ?? 1;
    holder?.destroy({ children: true });
    holder = new Container();
    cx = new Cx();
    const m = sheet.margin;
    const back = new SilkGraphics();
    const card = new SilkGraphics();

    back.rect(-m, -m, widget.w + 2 * m, widget.h + 2 * m).fill(sheet.background);
    sheet.card?.(card, widget);
    holder.addChild(back, card, cx.view);
    app.stage.addChild(holder);
    select.value = String(index);
    count.textContent = `${index + 1} / ${entries.length}`;
    const url = new URL(location.href);

    url.searchParams.set('w', widget.id);
    history.replaceState(null, '', url);
    layout();
}

/** Stacked panes (narrow screens) shrink to the widget's aspect instead of a fixed height. */
function fitPanes(bw: number, bh: number): void {
    const stacked = figures[0].offsetTop !== figures[1].offsetTop;
    const height = stacked
        ? `${Math.round(Math.min(window.innerHeight * 0.62, ((figures[0].clientWidth - 24) / bw) * bh + 60))}px`
        : '';

    for (const f of figures) if (f.style.height !== height) f.style.height = height;
}

function layout(): void {
    if (!holder) return;
    const { sheet, widget } = entries[index];
    const m = sheet.margin;
    const bw = widget.w + 2 * m;
    const bh = widget.h + 2 * m;

    fitPanes(bw, bh);
    const W = app.screen.width;
    const H = app.screen.height;
    const s = Math.min((W - 24) / bw, (H - 48) / bh, 5);
    const x = Math.round((W - bw * s) / 2);
    const y = Math.round((H - bh * s) / 2) + 12;

    holder.scale.set(s);
    holder.position.set(x + m * s, y + m * s);
    Cx.textResolution = Math.min(8, silk.resolution * s * 1.1);
    for (const crop of [refCrop, overlayCrop]) {
        Object.assign(crop.style, {
            left: `${x}px`,
            top: `${y}px`,
            width: `${bw * s}px`,
            height: `${bh * s}px`,
            backgroundColor: `#${sheet.background.toString(16).padStart(6, '0')}`,
            backgroundImage: `url(${REFS}${sheet.ref})`,
            backgroundSize: `${sheet.width * s}px ${sheet.height * s}px`,
            backgroundPosition: `${-(widget.x - m) * s}px ${-(widget.y - m) * s}px`,
        });
    }
}

select.addEventListener('change', () => show(Number(select.value)));
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-step]'))
    b.addEventListener('click', () => show(index + Number(b.dataset.step)));
overlay.addEventListener('change', () => viewer.classList.toggle('overlaid', overlay.checked));
window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLSelectElement) return;
    if (e.key === 'ArrowLeft') show(index - 1);
    if (e.key === 'ArrowRight') show(index + 1);
});
app.renderer.on('resize', layout);
window.addEventListener('resize', layout);
window.addEventListener('scroll', () => scrim.classList.toggle('on', window.scrollY > 2), { passive: true });

app.ticker.add((ticker) => {
    if (!cx) return;
    if (!pause.checked) t += Math.min(0.1, ticker.deltaMS / 1000);
    cx.begin(pause.checked ? 3 : t);
    entries[index].widget.draw(cx);
    cx.end();
});

show(index);
