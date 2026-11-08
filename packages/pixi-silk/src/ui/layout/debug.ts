import { type Application, Container, Graphics, type Matrix, Text, UPDATE_PRIORITY } from 'pixi.js';
import { onKey } from '../keys';
import { type GapMarker, gapsBetween } from '../spacing';
import { FlexContainer, paddingOf } from './flex-container';
import { SmartContainer } from './smart-container';

/** Options of {@link layoutDebug}. */
export interface LayoutDebugOptions {
    /** A `KeyboardEvent.code` that toggles the overlay, such as `KeyL`. Default none. */
    key?: string;
    /** Start with the overlay on. Default false. */
    enabled?: boolean;
    /** The subtree to inspect. Default the whole stage. */
    root?: Container;
    /** Show a readout of the box under the pointer. Default true. */
    hover?: boolean;
    /** Tag each SmartContainer with its breakpoint and scale. Default true. */
    labels?: boolean;
}

/** The handle {@link layoutDebug} returns. */
export interface LayoutDebug {
    /** True while the overlay draws. */
    enabled: boolean;
    /** Turns the overlay on or off. Returns the new state. */
    toggle(): boolean;
    /** Removes the overlay, the key binding and the pointer listener. The handle is unusable afterwards. */
    destroy(): void;
}

const C = {
    box: 0x0a84ff,
    content: 0x64d2ff,
    padding: 0x30d158,
    gap: 0xff24bd,
    bounds: 0xffffff,
    overflow: 0xff3b30,
    reference: 0xbf5af2,
    safe: 0xff9f0a,
    stretch: 0xffd60a,
};

interface Hit {
    points: number[];
    text: string;
}

/**
 * A debug overlay for SmartContainers and FlexContainers, off by default. It draws over the whole
 * stage, in screen pixels:
 *
 * - SmartContainer: the design box, the reference resolution at the fit scale, the safe-area
 *   insets, the alignment anchor, the stretched axes, and a tag with the breakpoint and scale.
 * - FlexContainer: the box, the content box, the padding, the gaps between items, and each
 *   child's slot (blue) against its real bounds (white, red when it overflows the slot).
 *
 * Hover a box for a readout of its name, size, scale and alignment. Toggle with `key`, or with
 * the returned handle.
 */
export function layoutDebug(app: Application, options: LayoutDebugOptions = {}): LayoutDebug {
    const layer = new Container({ label: 'layoutDebug' });
    const g = new Graphics();
    const tags = new Container();
    const readout = new Text({
        text: '',
        style: { fontFamily: 'ui-monospace, monospace', fontSize: 11, fill: 0xffffff },
    });
    const readoutBg = new Graphics();
    const pool: Text[] = [];
    let used = 0;
    let hits: Hit[] = [];
    let pointer: { x: number; y: number } | null = null;

    layer.eventMode = 'none';
    layer.addChild(g, tags, readoutBg, readout);

    // ---------------------------------------------------------------------- drawing helpers
    let m: Matrix;
    const pt = (x: number, y: number): [number, number] => [m.a * x + m.c * y + m.tx, m.b * x + m.d * y + m.ty];
    const quad = (x: number, y: number, w: number, h: number): number[] => [
        ...pt(x, y),
        ...pt(x + w, y),
        ...pt(x + w, y + h),
        ...pt(x, y + h),
    ];
    const outline = (x: number, y: number, w: number, h: number, color: number, width = 1, alpha = 0.95) =>
        g.poly(quad(x, y, w, h), true).stroke({ width, color, alpha });
    const fill = (x: number, y: number, w: number, h: number, color: number, alpha: number) => {
        if (w > 0 && h > 0) g.poly(quad(x, y, w, h), true).fill({ color, alpha });
    };
    const line = (x0: number, y0: number, x1: number, y1: number, color: number, width = 1) =>
        g
            .moveTo(...pt(x0, y0))
            .lineTo(...pt(x1, y1))
            .stroke({ width, color });
    const tag = (text: string, x: number, y: number, color: number) => {
        if (options.labels === false) return;
        let t = pool[used];

        if (!t) {
            t = new Text({ text: '', style: { fontFamily: 'ui-monospace, monospace', fontSize: 10, fill: 0xffffff } });
            pool.push(t);
            tags.addChild(t);
        }
        used++;
        t.text = text;
        t.visible = true;
        const w = t.width + 6;
        const h = t.height + 4;
        let [gx, gy] = pt(x, y);

        gx = Math.max(0, Math.min(gx, app.screen.width - w));
        // tags of boxes that share a corner stack downwards instead of covering each other
        while (placed.some((r) => gx < r.x + r.w && gx + w > r.x && gy < r.y + r.h && gy + h > r.y)) gy += h + 1;
        placed.push({ x: gx, y: gy, w, h });
        t.position.set(gx + 3, gy + 2);
        g.rect(gx, gy, w, h).fill({ color, alpha: 0.85 });
    };
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    const fmt = (v: number) => (Math.abs(v - Math.round(v)) < 0.005 ? String(Math.round(v)) : v.toFixed(2));

    // ---------------------------------------------------------------------- one container
    const drawFlex = (c: FlexContainer) => {
        const snap = c._debugSnapshot();
        const { width: w, height: h } = snap.box;
        const [t, r, b, l] = paddingOf(snap.style).map((v) => (typeof v === 'number' ? v : 0));

        m = c.worldTransform;
        outline(0, 0, w, h, C.box);
        fill(0, 0, w, t, C.padding, 0.18);
        fill(0, h - b, w, b, C.padding, 0.18);
        fill(0, t, l, h - t - b, C.padding, 0.18);
        fill(w - r, t, r, h - t - b, C.padding, 0.18);
        if (t || r || b || l) outline(l, t, w - l - r, h - t - b, C.content, 1, 0.5);
        if (!snap.flex) return;

        // gaps: neighbours on one line, then between the lines
        const row = (snap.style.direction ?? 'row').startsWith('row');
        const flow = snap.slots.filter((s) => s.child.visible).map((s) => s.slot);
        const lines: (typeof flow)[] = [];

        for (const s of [...flow].sort((p, q) => (row ? p.y - q.y : p.x - q.x))) {
            const lo = row ? s.y : s.x;
            const hi = lo + (row ? s.height : s.width);
            const into = lines.find((ln) =>
                ln.some((o) => (row ? o.y < hi && o.y + o.height > lo : o.x < hi && o.x + o.width > lo)),
            );

            if (into) into.push(s);
            else lines.push([s]);
        }
        const gaps: GapMarker[] = lines.flatMap((ln) => gapsBetween(ln, row ? 'x' : 'y'));
        const bands = lines.map((ln) => {
            const x0 = Math.min(...ln.map((s) => s.x));
            const y0 = Math.min(...ln.map((s) => s.y));

            return {
                x: x0,
                y: y0,
                width: Math.max(...ln.map((s) => s.x + s.width)) - x0,
                height: Math.max(...ln.map((s) => s.y + s.height)) - y0,
            };
        });

        gaps.push(...gapsBetween(bands, row ? 'y' : 'x'));
        for (const gap of gaps) {
            const tick = 4;

            if (gap.axis === 'x') {
                fill(gap.from, gap.at - tick, gap.to - gap.from, tick * 2, C.gap, 0.35);
                line(gap.from, gap.at, gap.to, gap.at, C.gap);
            } else {
                fill(gap.at - tick, gap.from, tick * 2, gap.to - gap.from, C.gap, 0.35);
                line(gap.at, gap.from, gap.at, gap.to, C.gap);
            }
        }
        // slots, and the bounds the children cover
        for (const { child, slot, nested, absolute } of snap.slots) {
            if (!child.visible) continue;
            m = c.worldTransform;
            outline(slot.x, slot.y, slot.width, slot.height, C.box, 1, 0.6);
            const over =
                !absolute &&
                (slot.x < l - 0.5 ||
                    slot.y < t - 0.5 ||
                    slot.x + slot.width > w - r + 0.5 ||
                    slot.y + slot.height > h - b + 0.5);

            if (nested) continue;
            // bounds are in screen pixels, and so is the layer
            const real = child.getBounds();
            const [x0, y0] = [real.minX, real.minY];
            const [sx0, sy0] = pt(slot.x, slot.y);
            const [sx1, sy1] = pt(slot.x + slot.width, slot.y + slot.height);
            const spill =
                over ||
                x0 < Math.min(sx0, sx1) - 1 ||
                y0 < Math.min(sy0, sy1) - 1 ||
                real.maxX > Math.max(sx0, sx1) + 1 ||
                real.maxY > Math.max(sy0, sy1) + 1;

            g.rect(x0, y0, real.width, real.height).stroke({
                width: spill ? 1.5 : 1,
                color: spill ? C.overflow : C.bounds,
                alpha: 0.8,
            });
            hits.push({
                points: quad(slot.x, slot.y, slot.width, slot.height),
                text: `${child.label || child.constructor.name}  slot ${fmt(slot.width)}x${fmt(slot.height)}${spill ? '  overflow' : ''}`,
            });
        }
    };

    const drawSmart = (c: SmartContainer) => {
        const s = c._debugScreen();
        const d = s.data;
        const p = s.place;
        const parent = c.parent;

        // the window lives in the parent's space
        if (parent) {
            m = parent.worldTransform;
            const { full, window: win } = s;

            fill(full.x, full.y, full.width, win.y - full.y, C.safe, 0.22);
            fill(full.x, win.y + win.height, full.width, full.y + full.height - win.y - win.height, C.safe, 0.22);
            fill(full.x, win.y, win.x - full.x, win.height, C.safe, 0.22);
            fill(win.x + win.width, win.y, full.x + full.width - win.x - win.width, win.height, C.safe, 0.22);
            // the reference resolution at the fit scale, centred in the window
            const k = d.fitCover
                ? Math.max(win.width / (d.viewportWidth || 1920), win.height / (d.viewportHeight || 1080))
                : Math.min(win.width / (d.viewportWidth || 1920), win.height / (d.viewportHeight || 1080));
            const rw = (d.viewportWidth || 1920) * k;
            const rh = (d.viewportHeight || 1080) * k;

            outline(win.x + (win.width - rw) / 2, win.y + (win.height - rh) / 2, rw, rh, C.reference, 1, 0.5);
            // the anchor: where the alignment pins the box
            const ax = d.align === 'left' ? 0 : d.align === 'right' ? 1 : 0.5;
            const ay = d.valign === 'top' ? 0 : d.valign === 'bottom' ? 1 : 0.5;
            const [cx, cy] = pt(win.x + win.width * ax, win.y + win.height * ay);

            g.circle(cx, cy, 4).fill({ color: C.reference }).stroke({ width: 1, color: 0xffffff });
        }
        m = c.worldTransform;
        outline(0, 0, p.width, p.height, C.box, 2);
        if (d.stretchWidth || d.extendWidth) line(0, p.height / 2, p.width, p.height / 2, C.stretch, 1.5);
        if (d.stretchHeight || d.extendHeight) line(p.width / 2, 0, p.width / 2, p.height, C.stretch, 1.5);
        const scale = p.scaleX === p.scaleY ? fmt(p.scaleX) : `${fmt(p.scaleX)}x${fmt(p.scaleY)}`;
        const name = c.label === 'SmartContainer' ? '' : `${c.label}  `;

        tag(`${name}${s.breakpoint}  scale ${scale}`, 0, 0, C.box);
        hits.push({
            points: quad(0, 0, p.width, p.height),
            text: `${c.label}  ${s.breakpoint}  box ${fmt(p.width)}x${fmt(p.height)}  scale ${scale}  align ${d.align}/${d.valign}`,
        });
    };

    const visit = (node: Container) => {
        if (node === layer || !node.visible) return;
        if (node instanceof SmartContainer) drawSmart(node);
        if (node instanceof FlexContainer) drawFlex(node);
        for (const child of node.children) visit(child);
    };

    const inside = (pts: number[], x: number, y: number): boolean => {
        let hit = false;

        for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
            const [xi, yi, xj, yj] = [pts[i], pts[i + 1], pts[j], pts[j + 1]];

            if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
        }

        return hit;
    };

    const draw = () => {
        g.clear();
        readoutBg.clear();
        readout.visible = false;
        used = 0;
        placed.length = 0;
        hits = [];
        // the overlay is drawn in screen pixels, on top of everything
        if (layer.parent !== app.stage || app.stage.children[app.stage.children.length - 1] !== layer) {
            app.stage.addChild(layer);
        }
        // A camera may move and scale the stage itself: undo that, so the layer stays in screen space.
        // Use the transform from the last render, the one the world transforms read below came from,
        // so the overlay does not lag a moving camera.
        layer.setFromMatrix(app.stage.worldTransform.clone().invert());
        visit(options.root ?? app.stage);
        for (let i = used; i < pool.length; i++) pool[i].visible = false;
        if (options.hover === false || !pointer) return;
        const { x, y } = pointer;
        // the innermost box under the pointer: the last one drawn
        const hit = [...hits].reverse().find((h) => inside(h.points, x, y));

        if (!hit) return;
        g.poly(hit.points, true).stroke({ width: 2, color: 0xffffff });
        readout.text = hit.text;
        readout.visible = true;
        const rx = Math.min(x + 14, app.screen.width - readout.width - 10);
        const ry = Math.min(y + 14, app.screen.height - readout.height - 8);

        readout.position.set(rx, ry);
        readoutBg
            .roundRect(rx - 5, ry - 3, readout.width + 10, readout.height + 6, 4)
            .fill({ color: 0x000000, alpha: 0.82 });
    };

    const onMove = (e: PointerEvent) => {
        const rect = app.canvas.getBoundingClientRect();

        pointer = {
            x: ((e.clientX - rect.left) / rect.width) * app.screen.width,
            y: ((e.clientY - rect.top) / rect.height) * app.screen.height,
        };
    };
    const onLeave = () => {
        pointer = null;
    };

    const handle: LayoutDebug = {
        enabled: false,
        toggle() {
            handle.enabled = !handle.enabled;
            if (handle.enabled) {
                app.ticker.add(draw, undefined, UPDATE_PRIORITY.UTILITY);
                app.stage.addChild(layer);
            } else {
                app.ticker.remove(draw);
                layer.removeFromParent();
            }

            return handle.enabled;
        },
        destroy() {
            if (handle.enabled) handle.toggle();
            stopKey?.();
            app.canvas.removeEventListener?.('pointermove', onMove);
            app.canvas.removeEventListener?.('pointerleave', onLeave);
            layer.destroy({ children: true });
        },
    };
    const stopKey = options.key
        ? onKey((code, down) => {
              if (down && code === options.key) handle.toggle();
          })
        : null;

    app.canvas.addEventListener?.('pointermove', onMove);
    app.canvas.addEventListener?.('pointerleave', onLeave);
    if (options.enabled) handle.toggle();

    return handle;
}
