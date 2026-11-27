import { UPDATE_PRIORITY } from 'pixi.js';
import { enableLowEnd, type LowEnd } from 'pixi-silk';
import { HudModel } from './_hud/core';
import { createHud } from './_hud/hud';
import { type Hud, SKINS } from './_hud/skins';
import { boot } from './_shared/kit';

const proto = await boot({
    title: 'Slot HUD on blocks',
    subtitle:
        'Built with pixi-silk/ui/blocks. Flex slots place the controls. What does not change is painted once and cached, and only the blocks that move redraw.',
    background: 0x04050a,
});
const { app, silk } = proto;
const model = new HudModel({
    balance: 1000,
    betLevels: [0.2, 0.5, 1, 2, 5, 10, 20, 50],
    betIndex: 2,
    autoplayCount: 25,
});
// four layouts on one model: ?skin=chips|console|strip|floating
const BUILDERS: Record<string, (a: typeof app, m: HudModel) => Hud> = { chips: createHud, ...SKINS };
let skinName = new URLSearchParams(location.search).get('skin') ?? 'chips';

if (!(skinName in BUILDERS)) skinName = 'chips';
// ?lowend=1: the preset for weak devices, before the HUD is built (blocks read it when made)
let low: LowEnd | null = new URLSearchParams(location.search).get('lowend') === '1' ? enableLowEnd(silk) : null;
let hud = BUILDERS[skinName](app, model);
const awake = () => hud.surfaces.some((s) => s.stats.awake);
const repaints = () => hud.surfaces.reduce((n, s) => n + s.stats.repaints, 0);

// ------------------------------------------------------------------ the host: it runs the round

let skip: (() => void) | null = null;
const wait = (ms: number) =>
    new Promise<void>((done) => {
        const id = setTimeout(done, ms);

        skip = () => {
            clearTimeout(id);
            done();
        };
    });

async function round(): Promise<void> {
    if (!model.startRound()) return;
    await wait(model.turbo.on ? 450 : 1600);
    skip = null;
    const bet = model.bet.bet.value;
    const roll = Math.random();
    const mult = roll < 0.55 ? 0 : roll < 0.8 ? 0.5 : roll < 0.92 ? 2 : roll < 0.98 ? 5 : 25;

    if (model.reportRound(bet * mult)) setTimeout(round, model.turbo.on ? 200 : 500);
}

model.on('spinRequested', round);
model.on('skipRequested', () => skip?.());
model.on('featureRequested', ({ id }) => {
    model.message.value = `${id.toUpperCase()} MENU`;
});
model.on('autoplayStarted', () => {
    if (model.spin.state.value === 'idle') round();
});

// a fresh press per spin: no auto-repeat
window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || e.repeat) return;
    e.preventDefault();
    model.spin.press();
});

// ------------------------------------------------------------------ proof: draw calls per frame

const stats = document.createElement('div');

stats.style.cssText =
    'position:fixed;left:16px;top:120px;font:12px/1.6 ui-monospace,Menlo,monospace;color:#8e93a6;background:#0b0d14cc;padding:8px 12px;border-radius:10px;pointer-events:none;white-space:pre';
document.body.appendChild(stats);

const gl = (app.renderer as { gl?: WebGL2RenderingContext }).gl;
let calls = 0;
let lastCalls = 0;
let peak = 0;

if (gl) {
    for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced'] as const) {
        const fn = gl[name].bind(gl) as (...a: unknown[]) => void;

        (gl as unknown as Record<string, unknown>)[name] = (...a: unknown[]) => {
            calls++;
            fn(...a);
        };
    }
}

// first on every frame: what the last frame drew
app.ticker.add(
    () => {
        lastCalls = calls;
        calls = 0;
    },
    undefined,
    UPDATE_PRIORITY.INTERACTION + 1,
);

let repaintsAt = 0;
let lastRepaints = 0;
let idleFrames = 0;

app.ticker.add(() => {
    const now = performance.now();

    if (lastCalls > 1) peak = Math.max(peak, lastCalls);
    idleFrames = awake() ? 0 : idleFrames + 1;
    if (now - repaintsAt >= 500) {
        lastRepaints = repaints();
        repaintsAt = now;
    }
    stats.textContent = [
        gl ? `draw calls last frame  ${lastCalls}` : 'draw calls  (counted on WebGL2 only)',
        `peak while repainting  ${peak}`,
        `skin                   ${skinName} (${hud.surfaces.length} docks)`,
        `HUD loop               ${awake() ? 'awake (repainting)' : `asleep ${idleFrames} frames`}`,
        `repaints since start   ${lastRepaints}`,
        `still paints / live    ${hud.surfaces.reduce((n, s) => n + s.stats.stillPaints, 0)} / ${hud.surfaces.reduce((n, s) => n + s.stats.liveBlocks, 0)} blocks`,
        low?.gate
            ? `frames drawn / skipped ${low.gate.stats.rendered} / ${low.gate.stats.skipped}`
            : 'low end                off',
    ].join('\n');
});

// ------------------------------------------------------------------ page controls
// (in the stats panel, so the kit's bottom-right bar does not cover the HUD)

const tools = document.createElement('div');

tools.style.cssText = 'position:fixed;left:16px;top:270px;display:flex;gap:6px;flex-wrap:wrap;max-width:300px';
document.body.appendChild(tools);

const tool = (label: string, fn: (b: HTMLButtonElement) => void) => {
    const b = document.createElement('button');

    b.textContent = label;
    b.style.cssText =
        'font:12px ui-monospace,Menlo,monospace;color:#d6d9e4;background:#1b1f2c;border:1px solid #ffffff1f;border-radius:8px;padding:6px 10px;cursor:pointer';
    b.onclick = () => fn(b);
    tools.appendChild(b);
};

let release: (() => void) | null = null;

tool('Lock input', (b) => {
    if (release) {
        release();
        release = null;
    } else release = model.lock();
    b.textContent = release ? 'Release lock' : 'Lock input';
});
tool('Add $1,000', () => model.balance.set(model.balance.get() + 1000));
tool('Reset peak', () => {
    peak = 0;
});
const rebuild = (name: string) => {
    hud.destroy();
    hud = BUILDERS[name](app, model);
    skinName = name;
    peak = 0;
    const url = new URL(location.href);

    url.searchParams.set('skin', name);
    if (low) url.searchParams.set('lowend', '1');
    else url.searchParams.delete('lowend');
    history.replaceState(null, '', url);
};

tool(low ? 'Low end: on' : 'Low end: off', (b) => {
    if (low) {
        low.disable();
        low = null;
    } else low = enableLowEnd(silk);
    b.textContent = low ? 'Low end: on' : 'Low end: off';
    rebuild(skinName);
});
for (const name of Object.keys(BUILDERS)) tool(name, () => rebuild(name));

// for poking at it from the console
(globalThis as Record<string, unknown>).__hud = {
    get hud() {
        return hud;
    },
    get low() {
        return low;
    },
    model,
    app,
};
