import { Container } from 'pixi.js';
import { conic, SilkGraphics, Spring } from 'pixi-silk';
import { C, card, inline, txt, type Widget } from './common';

const TOP = -Math.PI / 2;
const TAU = Math.PI * 2;

export interface RingSpec {
    from: number;
    to: number;
    track: number;
    value: number;
}

/** Activity ring with a fixed color ramp and a soft shadow beneath the overlapping tip. */
export function drawRing(
    g: SilkGraphics,
    cx: number,
    cy: number,
    r: number,
    width: number,
    spec: RingSpec,
    p: number,
): void {
    p = Number.isFinite(p) ? Math.max(0, Math.min(2, p)) : 0;

    g.circle(cx, cy, r).stroke({ width, color: spec.track });
    if (p === 0) {
        g.circle(cx, cy - r, width / 2).fill(spec.from);

        return;
    }
    const sweep = Math.min(p, 1) * TAU;
    const stops = [spec.from, spec.to];
    const options = { sweep: Math.PI, sweepDirection: 'shape' as const };
    const start = conic(stops, { ...options, range: [0, 0.5] });
    const end = conic(stops, { ...options, range: [0.5, 1] });

    g.arcSweep(cx, cy, r, TOP, Math.min(sweep, Math.PI)).stroke({ width, cap: 'round', gradient: start });
    if (sweep > Math.PI) {
        g.arcSweep(cx, cy, r, Math.PI / 2, sweep - Math.PI).stroke({ width, cap: 'round', gradient: end });
    }
    if (p <= 1) return;

    const extra = (p - 1) * TAU;
    const endAngle = TOP + extra;
    const ex = cx + Math.cos(endAngle) * r;
    const ey = cy + Math.sin(endAngle) * r;

    g.circle(ex - Math.sin(endAngle) * width * 0.18, ey + Math.cos(endAngle) * width * 0.18, width / 2).fill({
        color: 0x000000,
        alpha: 0.6,
        blur: width * 0.16,
    });
    g.arcSweep(cx, cy, r, TOP, extra).stroke({ width, cap: 'round', color: spec.to });
}

export const MOVE: RingSpec = { from: 0xe8134f, to: 0xff5aa0, track: 0x3a0717, value: 0.82 };
export const EXERCISE: RingSpec = { from: 0x8be100, to: 0xc6ff3d, track: 0x223a00, value: 1.28 };
export const STAND: RingSpec = { from: 0x00c7e6, to: 0x5ef2ff, track: 0x033a44, value: 0.58 };

/** Three concentric rings with springy progress. */
export function activityRings(size = 220): Widget {
    const view = new Container();
    const g = new SilkGraphics();

    view.addChild(g);
    const specs = [MOVE, EXERCISE, STAND];
    const springs = specs.map(() => new Spring(0, 60, 14));
    const width = size * 0.1;
    const gap = size * 0.012;
    const c = size / 2;

    springs.forEach((s, i) => {
        s.target = specs[i].value;
    });
    let next = 4;

    return {
        view,
        width: size,
        height: size,
        tick(dt, t) {
            if (t > next) {
                next = t + 4;
                springs.forEach((s, i) => {
                    s.target = Math.max(0.05, specs[i].value + (Math.random() - 0.5) * 0.5);
                });
            }
            g.clear();
            springs.forEach((s, i) => {
                const r = c - width / 2 - i * (width + gap);

                drawRing(g, c, c, r, width, specs[i], s.step(dt));
            });
        },
    };
}

/** Card with rings and the three metrics. */
export function activityCard(): Widget {
    const w = 340;
    const h = 170;
    const view = new Container();

    view.addChild(card(w, h, 24));
    const rings = activityRings(134);

    rings.view.position.set(18, 18);
    view.addChild(rings.view);
    const rows: [string, string, string, number][] = [
        ['Move', '410/500', 'CAL', 0xff375f],
        ['Exercise', '38/30', 'MIN', 0xa6ff00],
        ['Stand', '7/12', 'HRS', 0x00e6ff],
    ];

    rows.forEach(([name, value, unit, color], i) => {
        const y = 44 + i * 44;

        inline(view, 172, y - 16, [[txt(name, 13, C.text, '500'), 0]]);
        inline(view, 172, y + 5, [
            [txt(value, 19, color, '600'), 3],
            [txt(unit, 13, color, '600'), 0],
        ]);
    });

    return { view, width: w, height: h, tick: rings.tick };
}
