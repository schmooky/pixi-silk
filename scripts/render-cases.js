/*
 * Browser half of scripts/check-render.mjs: the scenes and the pixel checks. It runs as a module in
 * headless Chrome against the built library, on the renderer named by `?renderer=`.
 */

import { enableSilkBatching, SilkGraphics } from '/packages/pixi-silk/dist/index.js';
import { pathStrokeDist } from '/packages/pixi-silk/dist/stroke.js';
import { enableWebGPU } from '/packages/pixi-silk/dist/webgpu.js';
import { Application, Container, RenderTexture } from '/packages/pixi-silk/node_modules/pixi.js/dist/pixi.mjs';

const preference = new URLSearchParams(location.search).get('renderer') === 'webgpu' ? 'webgpu' : 'webgl';
const W = 256;
const H = 256;

if (preference === 'webgpu') enableWebGPU();

/** Points of a curve sampled at `n` steps of `t` in [0, 1]. */
function sample(n, fn) {
    const pts = [];

    for (let i = 0; i <= n; i++) pts.push(...fn(i / n));

    return pts;
}

/** Splits a polyline into dash subpaths of `dash` long every `dash + gap`, like a dashed stroke. */
function dashPieces(pts, dash, gap) {
    const out = [];
    const period = dash + gap;
    let cur = null;
    let at = 0;

    for (let i = 0; i + 2 < pts.length; i += 2) {
        const ax = pts[i];
        const ay = pts[i + 1];
        const bx = pts[i + 2];
        const by = pts[i + 3];
        const len = Math.hypot(bx - ax, by - ay);
        let s = 0;

        while (s < len) {
            const ph = (at + s) % period;
            const inDash = ph < dash;
            const step = Math.min(len - s, inDash ? dash - ph : period - ph);
            const x0 = ax + ((bx - ax) * s) / len;
            const y0 = ay + ((by - ay) * s) / len;
            const x1 = ax + ((bx - ax) * (s + step)) / len;
            const y1 = ay + ((by - ay) * (s + step)) / len;

            if (inDash) {
                if (!cur) {
                    cur = [x0, y0];
                    out.push(cur);
                }
                cur.push(x1, y1);
            } else cur = null;
            if (inDash && ph + step >= dash - 1e-9) cur = null;
            s += step;
        }
        at += len;
    }

    return out;
}

const lissajous = (n, cx, cy, r) =>
    sample(n, (t) => [cx + r * Math.sin(3 * Math.PI * 2 * t + 0.3), cy + r * Math.sin(2 * Math.PI * 2 * t)]);

/*
 * Each case returns { scene, kind, ... }. kind 'alpha' checks that nothing is darker than `alpha`.
 * 'interior' checks deep pixels against the hit test of `hit`. 'same' compares with `ref`.
 */
const cases = {
    // a long translucent path that crosses itself far along its length, across chunk boundaries
    'cross-chunks': () => {
        const g = new SilkGraphics().polyline(lissajous(400, 128, 128, 110)).stroke({ width: 9, alpha: 0.5 });

        return { scene: g, kind: 'alpha', alpha: 0.5 };
    },
    // the same seen at 4x, opaque: coverage follows the exact distance across chunk boundaries
    ...Object.fromEntries(
        ['miter', 'bevel', 'round'].map((join) => [
            `cross-zoom-${join}`,
            () => {
                const pts = [];

                for (let i = 0; i <= 400; i++) {
                    const u = (i / 400) * Math.PI * 2;

                    pts.push(240 + 200 * Math.sin(3 * u + 0.3), 140 + 120 * Math.sin(2 * u));
                }
                const g = new SilkGraphics().polyline(pts).stroke({ width: 14, join });

                g.scale.set(4);
                g.position.set(128 - 240 * 4, 128 - 140 * 4);

                return { scene: g, kind: 'exact', hit: g, scale: 4 };
            },
        ]),
    ),
    // and on the screen canvas, which rebuilds pixel positions differently than a texture
    'cross-zoom-screen': () => {
        const pts = [];

        for (let i = 0; i <= 400; i++) {
            const u = (i / 400) * Math.PI * 2;

            pts.push(240 + 200 * Math.sin(3 * u + 0.3), 140 + 120 * Math.sin(2 * u));
        }
        const g = new SilkGraphics().polyline(pts).stroke({ width: 14 });

        g.scale.set(4);
        g.position.set(128 - 240 * 4, 128 - 140 * 4);

        return { scene: g, kind: 'exact', hit: g, scale: 4, screen: true };
    },
    // the docs demo: a fitted stage scale on top of the zoom, translucent
    ...Object.fromEntries(
        [false, true].map((screen) => [
            `cross-demo${screen ? '-screen' : ''}`,
            () => {
                const pts = [];

                // closed: an open path that ends where it starts has two butt ends meeting in a seam
                for (let i = 0; i < 400; i++) {
                    const u = (i / 400) * Math.PI * 2;

                    pts.push(240 + 200 * Math.sin(3 * u + 0.3), 140 + 120 * Math.sin(2 * u));
                }
                const g = new SilkGraphics().polyline(pts, { closed: true }).stroke({ width: 14, alpha: 0.5 });
                const stage = new Container();

                g.scale.set(4);
                g.position.set(240 - 240 * 4, 140 - 140 * 4);
                stage.addChild(g);
                stage.scale.set(1.4375);
                stage.position.set(-200 - 245, -120);

                return { scene: stage, kind: 'alpha', alpha: 0.5, min: true, screen };
            },
        ]),
    ),
    // the same loop closed, dashed, and two long subpaths with short ones across them
    'cross-closed': () => {
        const g = new SilkGraphics()
            .poly(lissajous(300, 128, 128, 110).slice(0, -2), true)
            .stroke({ width: 7, alpha: 0.5, join: 'round' });

        return { scene: g, kind: 'alpha', alpha: 0.5 };
    },
    'cross-subpaths': () => {
        const g = new SilkGraphics();
        const a = sample(120, (t) => [10 + t * 236, 128 + Math.sin(t * 12) * 60]);
        const b = sample(120, (t) => [128 + Math.sin(t * 10) * 70, 10 + t * 236]);

        g.moveTo(a[0], a[1]);
        for (let i = 2; i < a.length; i += 2) g.lineTo(a[i], a[i + 1]);
        g.moveTo(b[0], b[1]);
        for (let i = 2; i < b.length; i += 2) g.lineTo(b[i], b[i + 1]);
        for (let k = 0; k < 12; k++) {
            const y = 20 + k * 19;

            g.moveTo(20, y)
                .lineTo(128, y + 8)
                .lineTo(236, y);
        }
        g.stroke({ width: 6, alpha: 0.5 });

        return { scene: g, kind: 'alpha', alpha: 0.5 };
    },
    'cross-dashed': () => {
        const g = new SilkGraphics()
            .polyline(lissajous(400, 128, 128, 110))
            .stroke({ width: 8, alpha: 0.5, dash: [18, 6], cap: 'round' });

        return { scene: g, kind: 'alpha', alpha: 0.5 };
    },
    // fold-backs: turns of 179 to 180 degrees, seen at 4x, inside a chunk and on a chunk boundary
    ...Object.fromEntries(
        ['miter', 'bevel', 'round'].flatMap((join) =>
            [1, 0.3, 0.05, 0.01, 0.002, 0].flatMap((off, i) =>
                ['mid', 'edge'].map((where) => [
                    `foldback-${join}-${where}-${off}`,
                    () => {
                        const g = new SilkGraphics();
                        const a = (off * Math.PI) / 180;
                        const L = 40;
                        // 'edge' splits the way in into a full chunk, so the fold starts the next one
                        const steps = where === 'edge' ? 32 : 1;

                        g.moveTo(4, 32);
                        for (let k = 1; k <= steps; k++) g.lineTo(4 + (L * k) / steps, 32);
                        g.lineTo(4 + L - L * Math.cos(a), 32 + L * Math.sin(a)).stroke({
                            width: 14,
                            join,
                            miterLimit: 10,
                        });
                        g.scale.set(4);
                        g.position.set(10 + i * 0.3, -40 + i * 0.37);

                        return { scene: g, kind: 'exact', hit: g, scale: 4 };
                    },
                ]),
            ),
        ),
    ),
    'foldback-translucent': () => {
        const g = new SilkGraphics();
        const pts = [];

        for (let i = 0; i < 12; i++) {
            const a = ((i % 4) * 0.4 * Math.PI) / 180;

            pts.push(20 + (i % 2) * 200, 20 + i * 18 + Math.sin(a) * 200);
        }
        g.polyline(pts).stroke({ width: 12, alpha: 0.5, join: 'bevel' });
        g.polyline(pts.map((v, i) => (i % 2 ? v + 4 : v))).stroke({ width: 12, alpha: 0.5, join: 'miter' });

        return { scene: g, kind: 'alpha', alpha: 0.75 };
    },
    // square dash caps that overlap their neighbours on a tight curve
    'dash-square-curve': () => {
        const g = new SilkGraphics();

        g.moveTo(128 + 70, 128);
        for (let k = 0; k < 4; k++) {
            const a0 = (k * Math.PI) / 2;
            const a1 = a0 + Math.PI / 2;
            const c = (4 / 3) * Math.tan(Math.PI / 8) * 70;

            g.bezierCurveTo(
                128 + 70 * Math.cos(a0) - c * Math.sin(a0),
                128 + 70 * Math.sin(a0) + c * Math.cos(a0),
                128 + 70 * Math.cos(a1) + c * Math.sin(a1),
                128 + 70 * Math.sin(a1) - c * Math.cos(a1),
                128 + 70 * Math.cos(a1),
                128 + 70 * Math.sin(a1),
            );
        }
        g.stroke({ width: 16, alpha: 0.5, dash: [5, 4], cap: 'square' });

        return { scene: g, kind: 'alpha', alpha: 0.5 };
    },
    'dash-square-wave': () => {
        const pts = sample(240, (t) => [10 + t * 236, 128 + Math.sin(t * 30) * 40]);
        const g = new SilkGraphics().polyline(pts).stroke({ width: 10, alpha: 0.5, dash: [3, 5], cap: 'square' });

        return { scene: g, kind: 'alpha', alpha: 0.5 };
    },
    'dash-square-shapes': () => {
        const g = new SilkGraphics()
            .circle(70, 70, 26)
            .stroke({ width: 14, alpha: 0.5, dash: [4, 3], cap: 'square' })
            .roundRect(130, 30, 100, 80, 30)
            .stroke({ width: 14, alpha: 0.5, dash: [4, 3], cap: 'square' })
            .arc(80, 190, 40, 0, 4)
            .stroke({ width: 14, alpha: 0.5, dash: [4, 3], cap: 'square' });

        return { scene: g, kind: 'alpha', alpha: 0.5 };
    },
    // dashes with square caps are the same as their pieces drawn as subpaths with square caps
    ...Object.fromEntries(
        [
            ['curve', 240, 14, 6],
            ['coarse', 24, 14, 6],
            ['tight', 240, 6, 4],
        ].map(([label, n, dash, gap]) => [
            `dash-square-pieces-${label}`,
            () => {
                const pts = sample(n, (t) => [20 + t * 216, 128 + Math.sin(t * 14) * 60]);
                const style = { width: 10, cap: 'square', join: 'round' };
                const g = new SilkGraphics().polyline(pts).stroke({ ...style, dash: [dash, gap] });
                const ref = new SilkGraphics();

                for (const piece of dashPieces(pts, dash, gap)) {
                    ref.moveTo(piece[0], piece[1]);
                    for (let i = 2; i < piece.length; i += 2) ref.lineTo(piece[i], piece[i + 1]);
                }
                ref.stroke(style);

                return { scene: g, kind: 'same', ref, tolerance: 24 };
            },
        ]),
    ),
    // shape operations: exact outlines match the shapes they make
    'op-ring-exact': () => {
        const g = new SilkGraphics().circle(128, 128, 100).circle(128, 128, 61.3).fill({ op: 'subtract' });

        return {
            scene: g,
            kind: 'same',
            ref: new SilkGraphics().sector(128, 128, 100, 0, Math.PI * 2, 61.3).fill(),
            tolerance: 3,
        };
    },
    'op-intersect-exact': () => {
        const g = new SilkGraphics().rect(20.3, 30.6, 150, 160).rect(60.1, 10.2, 170, 120).fill({ op: 'intersect' });

        // the max of two edges is exact along the edges; at the four corner pixels it is a box, not a disc
        return { scene: g, kind: 'same', ref: new SilkGraphics().rect(60.1, 30.6, 110.2, 99.6).fill(), tolerance: 16 };
    },
    'op-exclude-exact': () => {
        const g = new SilkGraphics().rect(20.5, 20.5, 200, 200).rect(70.25, 60.75, 90, 80).fill({ op: 'exclude' });
        const ref = new SilkGraphics()
            .svgPath('M20.5 20.5 H220.5 V220.5 H20.5 Z M70.25 60.75 H160.25 V140.75 H70.25 Z')
            .fill();

        return { scene: g, kind: 'same', ref, tolerance: 3 };
    },
    'op-translucent': () => {
        const g = new SilkGraphics()
            .circle(100, 128, 70)
            .circle(156, 128, 70)
            .star(128, 128, 5, 60, 25)
            .fill({ alpha: 0.5, op: 'exclude' });

        g.circle(128, 60, 40).roundRect(80, 40, 96, 40, 12).fill({ alpha: 0.5, op: 'union' });

        return { scene: g, kind: 'alpha', alpha: 0.75 };
    },
    'op-icon': () => {
        const g = new SilkGraphics();

        // a ring with a notch and a dot, at 2x: deep pixels follow the hit test
        g.boolean(
            'union',
            (g) =>
                g.boolean(
                    'subtract',
                    (g) => g.circle(64, 64, 56),
                    (g) => g.circle(64, 64, 36).rect(58, 0, 12, 40),
                ),
            (g) => g.heart(64, 66, 34).star(64, 64, 5, 14, 6),
        ).fill();
        g.scale.set(2);

        return { scene: g, kind: 'interior', hit: g, scale: 2 };
    },
    'op-stroke': () => {
        const g = new SilkGraphics()
            .circle(128, 128, 90)
            .circle(128, 128, 50)
            .rect(118, 20, 20, 120)
            .stroke({ width: 10, alpha: 0.5, op: 'subtract' });

        return { scene: g, kind: 'alpha', alpha: 0.5 };
    },
    'op-effects': () => {
        const g = new SilkGraphics();

        g.circle(80, 80, 60)
            .circle(110, 70, 36)
            .fill({ color: 0x30d158, op: 'subtract', blur: { from: 0, to: 8 }, spread: 2 })
            .rect(140, 140, 100, 100)
            .svgPath('M150 230 L190 150 L230 230 Z')
            .fill({
                color: 0x0a84ff,
                op: 'exclude',
                innerShadow: { x: 3, y: 4, blur: 4, color: 0xffffff, alpha: 0.6 },
            });

        return { scene: g, kind: 'none' };
    },
};

export const extraCases = cases;

let app;

async function renderer() {
    if (!app) {
        app = new Application();
        await app.init({ preference, width: W, height: H, backgroundAlpha: 0, antialias: false, resolution: 1 });
    }

    return app.renderer;
}

/** Renders to the screen canvas instead of a texture, and reads it back through a 2D canvas. */
async function drawScreen(scene) {
    const r = await renderer();
    const root = new Container();

    root.addChild(scene);
    r.background.alpha = 0;
    r.render({ container: root, clear: true, clearColor: [0, 0, 0, 0] });
    const c = document.createElement('canvas');

    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');

    ctx.drawImage(r.canvas, 0, 0);
    root.removeChild(scene);
    const px = new Uint8ClampedArray(ctx.getImageData(0, 0, W, H).data);

    for (let i = 0; i < px.length; i += 4) {
        const a = px[i + 3] / 255;

        px[i] = Math.round(px[i] * a);
        px[i + 1] = Math.round(px[i + 1] * a);
        px[i + 2] = Math.round(px[i + 2] * a);
    }

    return px;
}

async function draw(scene, screen = false) {
    if (screen) return drawScreen(scene);
    const r = await renderer();
    const rt = RenderTexture.create({ width: W, height: H, resolution: 1 });
    const root = new Container();

    root.addChild(scene);
    r.render({ container: root, target: rt, clear: true, clearColor: [0, 0, 0, 0] });
    const { pixels } = r.extract.pixels(rt);

    root.removeChild(scene);
    rt.destroy(true);
    const px = new Uint8ClampedArray(pixels);

    // WebGPU reads back through a 2D canvas, which un-premultiplies: premultiply again
    if (preference === 'webgpu') {
        for (let i = 0; i < px.length; i += 4) {
            const a = px[i + 3] / 255;

            px[i] = Math.round(px[i] * a);
            px[i + 1] = Math.round(px[i + 1] * a);
            px[i + 2] = Math.round(px[i + 2] * a);
        }
    }

    return px;
}

function toPng(px) {
    const c = document.createElement('canvas');

    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(W, H);

    // show on black: premultiplied values are what black under the paint looks like
    for (let i = 0; i < px.length; i += 4) {
        img.data[i] = px[i];
        img.data[i + 1] = px[i + 1];
        img.data[i + 2] = px[i + 2];
        img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);

    return c.toDataURL('image/png').split(',')[1];
}

/** Both images around `at` ("x,y"), 32 px square at 8x, side by side. */
function zoomPair(a, b, at) {
    const [x0, y0] = at.split(',').map((v) => Math.max(0, Math.min(W - 32, Number(v) - 16)));
    const c = document.createElement('canvas');

    c.width = 32 * 8 * 2 + 8;
    c.height = 32 * 8;
    const ctx = c.getContext('2d');

    [a, b].forEach((px, k) => {
        for (let y = 0; y < 32; y++) {
            for (let x = 0; x < 32; x++) {
                const i = ((y0 + y) * W + x0 + x) * 4;

                ctx.fillStyle = `rgb(${px[i]},${px[i + 1]},${px[i + 2]})`;
                ctx.fillRect(k * (256 + 8) + x * 8, y * 8, 8, 8);
            }
        }
    });

    return c.toDataURL('image/png').split(',')[1];
}

function toBase64(px) {
    let s = '';

    for (let i = 0; i < px.length; i += 0x8000) s += String.fromCharCode(...px.subarray(i, i + 0x8000));

    return btoa(s);
}

/** No pixel darker than `alpha`. With `holes`, also no pixel lighter inside: a dim pixel between two full ones. */
function checkAlpha(px, alpha, holes = false) {
    const limit = Math.round(alpha * 255) + 1;
    const full = Math.round(alpha * 255) - 1;
    let dim = 0;
    let dimAt = '';

    if (holes) {
        for (let y = 1; y < H - 1; y++) {
            for (let x = 1; x < W - 1; x++) {
                const a = (k) => px[k * 4 + 3];
                const i = y * W + x;

                if (a(i) >= full) continue;
                // full on both sides, horizontally or vertically: a seam
                if ((a(i - 1) >= full && a(i + 1) >= full) || (a(i - W) >= full && a(i + W) >= full)) {
                    if (!dim) dimAt = `${x},${y} (alpha ${a(i)})`;
                    dim++;
                }
            }
        }
    }
    let max = 0;
    let over = 0;
    let at = '';

    for (let i = 3; i < px.length; i += 4) {
        if (px[i] > max) max = px[i];
        if (px[i] > limit) {
            if (!over) at = `${((i - 3) / 4) % W},${Math.floor((i - 3) / 4 / W)}`;
            over++;
        }
    }

    const failures = over ? [`${over} pixels darker than alpha ${alpha} (max ${max}, first at ${at})`] : [];

    if (dim) failures.push(`${dim} dim pixels between full ones, first at ${dimAt}`);

    return { note: `max alpha ${max}`, failures };
}

function checkInterior(px, g, scale) {
    // the scene is the graphics alone, placed by its own position and uniform scale
    const pt = { x: 0, y: 0 };
    const inside = (x, y) => {
        pt.x = (x - g.position.x) / g.scale.x;
        pt.y = (y - g.position.y) / g.scale.y;

        return g.containsPoint(pt);
    };
    let dim = 0;
    let stray = 0;
    let firstDim = '';
    let firstStray = '';
    let checked = 0;
    const r = 1.0;

    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const cx = x + 0.5;
            const cy = y + 0.5;
            let n = 0;

            for (const [dx, dy] of [
                [0, 0],
                [-r, -r],
                [r, -r],
                [-r, r],
                [r, r],
                [0, -r * 1.42],
                [0, r * 1.42],
                [-r * 1.42, 0],
                [r * 1.42, 0],
            ]) {
                if (inside(cx + dx, cy + dy)) n++;
            }
            const a = px[(y * W + x) * 4 + 3];

            if (n === 9) {
                checked++;
                if (a < 254) {
                    if (!dim) firstDim = `${x},${y} (alpha ${a})`;
                    dim++;
                }
            } else if (n === 0 && a > 1) {
                if (!stray) firstStray = `${x},${y} (alpha ${a})`;
                stray++;
            }
        }
    }
    const failures = [];

    if (dim) failures.push(`${dim} dim pixels inside, first at ${firstDim}`);
    if (stray) failures.push(`${stray} painted pixels outside, first at ${firstStray}`);

    return { note: `${checked} inner pixels at ${scale}x`, failures };
}

/**
 * Compares coverage with the exact distance the CPU computes for every stroked path instance of `g`
 * (the Canvas 2D stroke geometry). A box filter of one pixel: alpha = clamp(0.5 - d, 0, 1).
 */
function checkExact(px, g, scale) {
    const f = g._f;
    const poly = g._poly;
    const refs = [];

    for (let i = 0; i < g.primitiveCount; i++) {
        const o = i * 44;
        const flags = f[o + 17];

        refs.push({
            windows: f[o + 4],
            count: f[o + 5],
            join: f[o + 8],
            miterLimit: f[o + 9],
            cap0: (flags >> 8) & 3,
            cap1: (flags >> 10) & 3,
            hw: f[o + 18] / 2,
        });
    }
    let max = 0;
    let bad = 0;
    let first = '';

    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const lx = (x + 0.5 - g.position.x) / scale;
            const ly = (y + 0.5 - g.position.y) / scale;
            let d = Infinity;

            for (const r of refs) d = Math.min(d, pathStrokeDist(poly, r, lx, ly, 1 / scale));
            const want = Math.min(Math.max(0.5 - d * scale, 0), 1) * 255;
            const diff = Math.abs(px[(y * W + x) * 4 + 3] - want);

            if (diff > max) max = diff;
            if (diff > 6) {
                if (!bad) first = `${x},${y} (alpha ${px[(y * W + x) * 4 + 3]}, want ${want.toFixed(1)})`;
                bad++;
            }
        }
    }

    return {
        note: `max diff ${max.toFixed(1)} from the exact coverage`,
        failures: bad ? [`${bad} pixels off by more than 6 levels, first at ${first}`] : [],
    };
}

function checkSame(a, b, tolerance) {
    let max = 0;
    let over = 0;

    for (let i = 0; i < a.length; i++) {
        const d = Math.abs(a[i] - b[i]);

        max = Math.max(max, d);
        if (d > tolerance) over++;
    }

    let at = '';

    for (let i = 0; i < a.length && !at; i++)
        if (Math.abs(a[i] - b[i]) > tolerance) at = `${(i >> 2) % W},${Math.floor((i >> 2) / W)}`;

    return {
        note: `max diff ${max}`,
        at,
        failures: over ? [`${over} channels differ by more than ${tolerance} (max ${max}, first at ${at})`] : [],
    };
}

window.renderCases = async ({ only, png }) => {
    const r = await renderer();
    const out = [];

    for (const [name, make] of Object.entries(cases)) {
        if (only && !name.includes(only)) continue;
        const c = make();
        const px = await draw(c.scene, c.screen);
        let res;

        if (c.kind === 'alpha') res = checkAlpha(px, c.alpha, c.min);
        else if (c.kind === 'interior') res = checkInterior(px, c.hit, c.scale);
        else if (c.kind === 'exact') res = checkExact(px, c.hit, c.scale);
        else if (c.kind === 'none') res = { note: 'compared between renderers', failures: [] };
        else {
            const ref = await draw(c.ref);

            res = checkSame(px, ref, c.tolerance);
            if (png) out.push({ name: `${name}-ref`, failures: [], raw: '', png: toPng(ref) });
            if (png && res.at)
                out.push({ name: `${name}-zoom`, failures: [], raw: '', png: zoomPair(px, ref, res.at) });
        }
        out.push({ name, ...res, raw: toBase64(px), png: png ? toPng(px) : null });
        c.scene.destroy();
        c.ref?.destroy();
    }

    return { renderer: r.type === 1 ? 'WebGL2' : 'WebGPU', name: r.name, cases: out };
};

export { enableSilkBatching };
