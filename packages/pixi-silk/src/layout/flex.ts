/**
 * The flex solver: CSS flexbox (css-flexbox-1, section 9) on {@link LayoutNode} trees, synchronous
 * and without a DOM. Boxes are border-box. Arrays indexed by axis hold x/width at 0 and y/height at 1.
 */
import type { LayoutNode } from './node';
import type { AlignItems, Edges, LayoutStyle, Length, Size } from './style';

/** A size with the distance from the top to the first baseline. */
export interface Measured extends Size {
    baseline: number;
}

type Axis = 0 | 1;
type Pair = [number, number];
/** A size that may be unknown (`undefined` means auto). */
type Maybe = number | undefined;

/** Resolves a length against `base`. Percents of an unknown base, and `auto`, give `undefined`. */
function len(v: Length | undefined, base: Maybe): Maybe {
    if (v === undefined || v === 'auto') return undefined;
    if (typeof v === 'number') return v;

    return base === undefined || !Number.isFinite(base) ? undefined : (Number.parseFloat(v) * base) / 100;
}

/** Edges as `[top, right, bottom, left]`. */
function sides<T>(v: Edges<T> | undefined): (T | undefined)[] {
    if (v === undefined) return [undefined, undefined, undefined, undefined];
    if (!Array.isArray(v)) return [v as T, v as T, v as T, v as T];
    const a = v as readonly T[];

    if (a.length === 2) return [a[0], a[1], a[0], a[1]];

    return a.length === 3 ? [a[0], a[1], a[2], a[1]] : [a[0], a[1], a[2], a[3]];
}

/** An edge box per axis: `start` is left or top, `end` is right or bottom. */
interface Box {
    start: Pair;
    end: Pair;
    /** Which margins are `auto`, start then end, per axis. */
    autoStart: [boolean, boolean];
    autoEnd: [boolean, boolean];
}

function edgeBox(s: LayoutStyle, kind: 'padding' | 'margin', base: Maybe): Box {
    const all = sides<Length>(s[kind]);
    const one =
        kind === 'padding'
            ? [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft]
            : [s.marginTop, s.marginRight, s.marginBottom, s.marginLeft];
    const raw = all.map((v, i) => one[i] ?? v);
    const px = raw.map((v) => len(v, base) ?? 0);
    const auto = raw.map((v) => v === 'auto');

    return { start: [px[3], px[0]], end: [px[1], px[2]], autoStart: [auto[3], auto[0]], autoEnd: [auto[1], auto[2]] };
}

const SIZE = ['width', 'height'] as const;
const MIN = ['minWidth', 'minHeight'] as const;
const MAX = ['maxWidth', 'maxHeight'] as const;
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(v, hi));

/** Min and max border-box size on `axis`. The min never drops below the padding. */
function limits(s: LayoutStyle, axis: Axis, base: readonly Maybe[], pad: Box): Pair {
    const lo = Math.max(len(s[MIN[axis]], base[axis]) ?? 0, pad.start[axis] + pad.end[axis]);

    return [lo, Math.max(lo, len(s[MAX[axis]], base[axis]) ?? Number.POSITIVE_INFINITY)];
}

/** The size `style` sets on `axis`, clamped, or `undefined` when it is auto. */
function styled(s: LayoutStyle, axis: Axis, base: readonly Maybe[], pad: Box): Maybe {
    const v = len(s[SIZE[axis]], base[axis]);

    if (v === undefined) return undefined;
    const [lo, hi] = limits(s, axis, base, pad);

    return clamp(v, lo, hi);
}

/** Free space split for a justify or align-content mode: the lead before the first and the step between. */
function distribute(mode: string, free: number, n: number): Pair {
    switch (mode) {
        case 'center':
            return [free / 2, 0];
        case 'end':
            return [free, 0];
        case 'space-between':
            return free > 0 && n > 1 ? [0, free / (n - 1)] : [0, 0];
        case 'space-around':
            return free > 0 ? [free / n / 2, free / n] : [free / 2, 0];
        case 'space-evenly':
            return free > 0 ? [free / (n + 1), free / (n + 1)] : [free / 2, 0];
        default:
            return [0, 0];
    }
}

interface Item {
    node: LayoutNode;
    margin: Box;
    /** Outer margins on the main axis, without auto margins. */
    mm: number;
    /** Outer margins on the cross axis. */
    mc: number;
    lo: Pair;
    hi: Pair;
    basis: number;
    hypo: number;
    target: number;
    frozen: boolean;
    violation: number;
    cross: number;
    stretch: boolean;
    align: AlignItems;
    baseline: number;
}

interface Line {
    items: Item[];
    cross: number;
    /** Largest baseline of the baseline-aligned items. */
    above: number;
}

/** Lays out the root of a tree, see {@link LayoutNode.calculate}. */
export function layoutRoot(root: LayoutNode, width?: number, height?: number): void {
    const s = root.style;
    const base = [width, height];
    const pad = edgeBox(s, 'padding', width);
    const known = [styled(s, 0, base, pad) ?? width, styled(s, 1, base, pad) ?? height];
    const avail = known.map((v) => v ?? Number.POSITIVE_INFINITY);

    if (s.display === 'none') {
        Object.assign(root.layout, { x: 0, y: 0, width: 0, height: 0 });
        return;
    }
    root.layout.x = 0;
    root.layout.y = 0;
    solve(root, known[0], known[1], avail[0], avail[1], base, true);
}

/**
 * Sizes `node` and, when `perform`, places its children. `w` and `h` are border-box sizes the
 * parent decided (`undefined` sizes that axis to the content). `aw` and `ah` are the space offered.
 * `base` is the containing box percents resolve against.
 */
function solve(
    node: LayoutNode,
    w: Maybe,
    h: Maybe,
    aw: number,
    ah: number,
    base: readonly Maybe[],
    perform: boolean,
): Measured {
    const key = `${w}|${h}|${aw}|${ah}|${base[0]}|${base[1]}`;

    if (perform && node._laid === key && !node._dirty) {
        return { width: node.layout.width, height: node.layout.height, baseline: node._baseline };
    }
    const cached = perform ? undefined : node._cache.get(key);

    if (cached) return cached;

    const s = node.style;
    const pad = edgeBox(s, 'padding', base[0]);
    const padSum: Pair = [pad.start[0] + pad.end[0], pad.start[1] + pad.end[1]];
    const lim = [limits(s, 0, base, pad), limits(s, 1, base, pad)];
    const size: Maybe[] = [w, h];

    // one known side and a ratio give the other
    if (s.aspectRatio) {
        if (size[0] !== undefined && size[1] === undefined) size[1] = clamp(size[0] / s.aspectRatio, ...lim[1]);
        else if (size[1] !== undefined && size[0] === undefined) size[0] = clamp(size[1] * s.aspectRatio, ...lim[0]);
    }

    const kids = node.children.filter((c) => c.style.display !== 'none');
    const flow = kids.filter((c) => c.style.position !== 'absolute');
    let out: Measured;

    if (!flow.length) {
        // a leaf: measured content, or only its padding
        const inner = [0, 1].map((a) => {
            const room = size[a] ?? Math.min(a ? ah : aw, lim[a][1]);

            return Math.max(0, room - padSum[a]);
        });
        const m =
            node.measure && (size[0] === undefined || size[1] === undefined)
                ? node.measure(inner[0], inner[1])
                : undefined;
        const width = size[0] ?? clamp((m?.width ?? 0) + padSum[0], ...lim[0]);
        const height = size[1] ?? clamp((m?.height ?? 0) + padSum[1], ...lim[1]);

        out = { width, height, baseline: m?.baseline !== undefined ? m.baseline + pad.start[1] : height };
        if (perform) {
            place(node, out);
            for (const c of kids) absolute(c, out, pad, s);
        }
    } else {
        out = container(node, flow, size, [aw, ah], pad, padSum, lim, perform);
        if (perform) for (const c of kids) if (c.style.position === 'absolute') absolute(c, out, pad, s);
    }
    if (perform) {
        node._laid = key;
        node._dirty = false;
        node._baseline = out.baseline;
    } else node._cache.set(key, out);

    return out;
}

/** Stores a node's size after a full pass, and marks hidden children as laid out. */
function place(node: LayoutNode, size: Size): void {
    node.layout.width = size.width;
    node.layout.height = size.height;
    for (const c of node.children) {
        if (c.style.display !== 'none') continue;
        Object.assign(c.layout, { x: 0, y: 0, width: 0, height: 0 });
        c._dirty = false;
    }
}

function container(
    node: LayoutNode,
    flow: LayoutNode[],
    size: Maybe[],
    avail: Pair,
    pad: Box,
    padSum: Pair,
    lim: Pair[],
    perform: boolean,
): Measured {
    const s = node.style;
    const dir = s.direction ?? 'row';
    const main: Axis = dir.startsWith('row') ? 0 : 1;
    const cross: Axis = main ? 0 : 1;
    const wrap = s.wrap !== undefined && s.wrap !== 'nowrap';
    // percents of children resolve against the content box
    const inner: Maybe[] = [0, 1].map((a) =>
        size[a] === undefined ? undefined : Math.max(0, (size[a] as number) - padSum[a]),
    );
    const room = [0, 1].map((a) => inner[a] ?? Math.max(0, Math.min(avail[a], lim[a][1]) - padSum[a]));
    const innerLo = [0, 1].map((a) => Math.max(0, lim[a][0] - padSum[a]));
    const innerHi = [0, 1].map((a) => Math.max(0, lim[a][1] - padSum[a]));
    const gap = [s.columnGap ?? s.gap ?? 0, s.rowGap ?? s.gap ?? 0];
    const mainGap = gap[main];
    const crossGap = gap[cross];
    const alignItems = s.alignItems ?? 'stretch';

    // 1. flex base sizes and hypothetical main sizes
    const items: Item[] = flow.map((c) => {
        const cs = c.style;
        const margin = edgeBox(cs, 'margin', inner[0]);
        const cpad = edgeBox(cs, 'padding', inner[0]);
        const [lx, ly] = [limits(cs, 0, inner, cpad), limits(cs, 1, inner, cpad)];
        const lo: Pair = [lx[0], ly[0]];
        const hi: Pair = [lx[1], ly[1]];
        const mm = margin.start[main] + margin.end[main];
        const mc = margin.start[cross] + margin.end[cross];
        const align = cs.alignSelf && cs.alignSelf !== 'auto' ? cs.alignSelf : alignItems;
        const autoCross = margin.autoStart[cross] || margin.autoEnd[cross];
        const ownCross = styled(cs, cross, inner, cpad);
        const stretch = align === 'stretch' && ownCross === undefined && !autoCross;
        // a stretched item of a single line with a known cross size knows its cross size now
        const crossKnown =
            ownCross ??
            (stretch && !wrap && inner[cross] !== undefined
                ? clamp((inner[cross] as number) - mc, lo[cross], hi[cross])
                : undefined);
        // the flex base size is the specified size before min and max
        let basis = len(cs.basis, inner[main]) ?? len(cs[SIZE[main]], inner[main]);

        if (basis === undefined && cs.aspectRatio && crossKnown !== undefined) {
            basis = main ? crossKnown / cs.aspectRatio : crossKnown * cs.aspectRatio;
        }
        if (basis === undefined) {
            const kw = main ? crossKnown : undefined;
            const kh = main ? undefined : crossKnown;
            const m = solve(c, kw, kh, room[0] - (main ? mc : mm), room[1] - (main ? mm : mc), inner, false);

            basis = main ? m.height : m.width;
        }
        const hypo = clamp(basis, lo[main], hi[main]);

        return {
            node: c,
            margin,
            mm,
            mc,
            lo,
            hi,
            basis,
            hypo,
            target: hypo,
            frozen: false,
            violation: 0,
            cross: 0,
            stretch,
            align,
            baseline: 0,
        };
    });

    // 2. lines
    const limit = room[main];
    const lines: Line[] = [];
    let line: Item[] = [];
    let used = 0;

    for (const it of items) {
        const outer = it.hypo + it.mm;

        if (wrap && line.length && used + mainGap + outer > limit + 1e-6) {
            lines.push({ items: line, cross: 0, above: 0 });
            line = [];
            used = 0;
        }
        used += (line.length ? mainGap : 0) + outer;
        line.push(it);
    }
    lines.push({ items: line, cross: 0, above: 0 });

    // the container's main size: known, or the longest line clamped
    const sum = (l: Line, pick: (it: Item) => number) =>
        l.items.reduce((t, it) => t + pick(it) + it.mm, 0) + mainGap * (l.items.length - 1);
    const innerMain =
        inner[main] ?? clamp(Math.max(...lines.map((l) => sum(l, (it) => it.hypo))), innerLo[main], innerHi[main]);

    // 3. flexible lengths, line by line
    for (const l of lines) flex(l.items, innerMain, mainGap, main);

    // 4. hypothetical cross sizes and line cross sizes
    for (const l of lines) {
        let below = 0;

        for (const it of l.items) {
            const cs = it.node.style;
            const cpad = edgeBox(cs, 'padding', inner[0]);
            const own = styled(cs, cross, inner, cpad);
            let m: Measured | undefined;

            if (own !== undefined) it.cross = own;
            else if (cs.aspectRatio)
                it.cross = clamp(
                    main ? it.target * cs.aspectRatio : it.target / cs.aspectRatio,
                    it.lo[cross],
                    it.hi[cross],
                );
            else {
                m = solve(
                    it.node,
                    main ? undefined : it.target,
                    main ? it.target : undefined,
                    main ? room[0] - it.mc : it.target,
                    main ? it.target : room[1] - it.mc,
                    inner,
                    false,
                );
                it.cross = main ? m.width : m.height;
            }
            it.baseline = (m ?? solve(it.node, it.target, it.cross, it.target, it.cross, inner, false)).baseline;
            if (it.align === 'baseline' && main === 0) {
                const above = it.baseline + it.margin.start[1];

                l.above = Math.max(l.above, above);
                below = Math.max(below, it.cross + it.mc - above);
            }
            l.cross = Math.max(l.cross, it.cross + it.mc);
        }
        l.cross = Math.max(l.cross, l.above + below);
    }
    if (!wrap) lines[0].cross = inner[cross] ?? clamp(lines[0].cross, innerLo[cross], innerHi[cross]);

    const linesCross = lines.reduce((t, l) => t + l.cross, 0) + crossGap * (lines.length - 1);
    const innerCross = inner[cross] ?? clamp(linesCross, innerLo[cross], innerHi[cross]);
    const boxSize: Pair = [0, 0];

    boxSize[main] = size[main] ?? innerMain + padSum[main];
    boxSize[cross] = size[cross] ?? innerCross + padSum[cross];

    // a container's baseline is its first line's baseline, else its first item's
    const first = lines[0].items[0];
    const baselineOf = (lead: number, firstY: number) =>
        main === 0 && lines[0].above
            ? pad.start[1] + lead + lines[0].above
            : first
              ? firstY + first.baseline
              : boxSize[1];

    if (!perform) {
        return {
            width: boxSize[0],
            height: boxSize[1],
            baseline: baselineOf(0, pad.start[1] + (first?.margin.start[1] ?? 0)),
        };
    }

    // 5. align-content: spread the lines over the cross axis
    const freeCross = innerCross - linesCross;
    const content = s.alignContent ?? 'stretch';
    let [lineAt, lineStep] = wrap ? distribute(content, freeCross, lines.length) : [0, 0];
    const lead = lineAt;

    if (wrap && content === 'stretch' && freeCross > 0) for (const l of lines) l.cross += freeCross / lines.length;

    const reverseMain = dir.endsWith('reverse');
    const reverseCross = s.wrap === 'wrap-reverse';
    const justify = s.justifyContent ?? 'start';

    place(node, { width: boxSize[0], height: boxSize[1] });

    // 6. main axis positions, final sizes, cross axis positions
    for (const l of lines) {
        const free = innerMain - sum(l, (it) => it.target);
        const autos = l.items.reduce(
            (t, it) => t + Number(it.margin.autoStart[main]) + Number(it.margin.autoEnd[main]),
            0,
        );
        const share = autos && free > 0 ? free / autos : 0;
        let [at, step] = autos ? [0, 0] : distribute(justify, free, l.items.length);

        for (const it of l.items) {
            const m = it.margin;
            const crossSize = it.stretch ? clamp(l.cross - it.mc, it.lo[cross], it.hi[cross]) : it.cross;
            const sz: Pair = [0, 0];

            sz[main] = it.target;
            sz[cross] = crossSize;
            const done = solve(it.node, sz[0], sz[1], sz[0], sz[1], inner, true);

            // a measured leaf laid out at a known size skips its measure: keep the measured baseline
            if (!it.node.measure || it.node.children.length) it.baseline = done.baseline;

            at += m.start[main] + (m.autoStart[main] ? share : 0);
            // cross offset inside the line: auto margins first, then alignment
            const slack = l.cross - it.mc - crossSize;
            let off = 0;

            if (m.autoStart[cross] && m.autoEnd[cross]) off = slack / 2;
            else if (m.autoStart[cross]) off = slack;
            else if (m.autoEnd[cross]) off = 0;
            else if (it.align === 'center') off = slack / 2;
            else if (it.align === 'end') off = slack;
            else if (it.align === 'baseline' && main === 0) off = l.above - it.baseline - m.start[1];
            off += lineAt + m.start[cross];

            const pos: Pair = [0, 0];

            pos[main] = pad.start[main] + (reverseMain ? innerMain - at - it.target : at);
            pos[cross] = pad.start[cross] + (reverseCross ? innerCross - off - crossSize : off);
            it.node.layout.x = pos[0];
            it.node.layout.y = pos[1];
            at += it.target + m.end[main] + (m.autoEnd[main] ? share : 0) + mainGap + step;
        }
        lineAt += l.cross + crossGap + lineStep;
    }

    return {
        width: boxSize[0],
        height: boxSize[1],
        baseline: baselineOf(reverseCross ? 0 : lead, first ? first.node.layout.y : 0),
    };
}

/** css-flexbox 9.7: grows or shrinks the items of a line to fill `space`, honouring min and max. */
function flex(items: Item[], space: number, gap: number, axis: Axis): void {
    const outer = (it: Item, v: number) => v + it.mm;
    const used = items.reduce((t, it) => t + outer(it, it.hypo), 0) + gap * (items.length - 1);
    const growing = used < space;
    const factor = (it: Item) => (growing ? (it.node.style.grow ?? 0) : (it.node.style.shrink ?? 1));

    for (const it of items) {
        it.target = it.hypo;
        it.frozen = factor(it) === 0 || (growing ? it.basis > it.hypo : it.basis < it.hypo);
    }
    const free = () =>
        space - gap * (items.length - 1) - items.reduce((t, it) => t + outer(it, it.frozen ? it.target : it.basis), 0);
    const initial = free();

    for (let pass = 0; pass <= items.length; pass++) {
        const open = items.filter((it) => !it.frozen);

        if (!open.length) break;
        let left = free();
        const total = open.reduce((t, it) => t + factor(it), 0);

        if (total < 1 && Math.abs(initial * total) < Math.abs(left)) left = initial * total;
        const weight = (it: Item) => (growing ? factor(it) : factor(it) * it.basis);
        const weights = open.reduce((t, it) => t + weight(it), 0);
        let violation = 0;

        for (const it of open) {
            const want = weights > 0 ? it.basis + (left * weight(it)) / weights : it.basis;
            const got = clamp(want, it.lo[axis], it.hi[axis]);

            it.violation = got - want;
            it.target = got;
            violation += it.violation;
        }
        for (const it of open) {
            if (violation === 0 || (violation > 0 ? it.violation > 0 : it.violation < 0)) it.frozen = true;
        }
    }
}

/** Places an absolutely positioned child against its parent's border box. */
function absolute(c: LayoutNode, box: Size, pad: Box, parent: LayoutStyle): void {
    const cs = c.style;
    const outer = [box.width, box.height];
    const margin = edgeBox(cs, 'margin', box.width);
    const cpad = edgeBox(cs, 'padding', box.width);
    const start = [len(cs.left ?? cs.inset, box.width), len(cs.top ?? cs.inset, box.height)];
    const end = [len(cs.right ?? cs.inset, box.width), len(cs.bottom ?? cs.inset, box.height)];
    const size: Maybe[] = [0, 1].map((a) => {
        const own = styled(cs, a as Axis, outer, cpad);
        const s0 = start[a];
        const e0 = end[a];

        if (own !== undefined || s0 === undefined || e0 === undefined) return own;
        const [lo, hi] = limits(cs, a as Axis, outer, cpad);

        return clamp(outer[a] - s0 - e0 - margin.start[a] - margin.end[a], lo, hi);
    });
    const done = solve(c, size[0], size[1], outer[0], outer[1], outer, true);
    const got = [done.width, done.height];
    const rowMain = (parent.direction ?? 'row').startsWith('row') ? 0 : 1;
    const pos = [0, 1].map((a) => {
        const s0 = start[a];
        const e0 = end[a];

        if (s0 !== undefined) return s0 + margin.start[a];
        if (e0 !== undefined) return outer[a] - e0 - got[a] - margin.end[a];
        // no anchors: the parent's justify (main) or align (cross) picks start, centre or end
        const mode =
            a === rowMain
                ? parent.justifyContent
                : cs.alignSelf && cs.alignSelf !== 'auto'
                  ? cs.alignSelf
                  : parent.alignItems;
        const free = outer[a] - pad.start[a] - pad.end[a] - got[a] - margin.start[a] - margin.end[a];
        const k = mode === 'center' ? 0.5 : mode === 'end' ? 1 : 0;

        return pad.start[a] + margin.start[a] + free * k;
    });

    c.layout.x = pos[0];
    c.layout.y = pos[1];
}
