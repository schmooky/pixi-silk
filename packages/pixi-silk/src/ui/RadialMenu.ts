import { Container, type FederatedPointerEvent, type Text, type TextStyleOptions, type Ticker } from 'pixi.js';
import { damp, Spring } from '../motion';
import { SilkGraphics } from '../SilkGraphics';
import { type Signal, signal } from '../signal';
import { angleDelta } from './arc';
import { Driver } from './driver';
import { createIcon, type IconSource } from './icon';
import {
    type InputKind,
    type InputProfile,
    type InputProfiles,
    inputKind,
    inputProfile,
    preferredInputKind,
} from './input';
import { clamp01, hex, mix } from './paint';

const TAU = Math.PI * 2;

export { angleDelta };

/** One entry of a {@link RadialMenu}. Entries with `children` open another ring around themselves. */
export interface RadialItem {
    /** Stable id, handed back on selection. */
    id: string;
    /** Text: drawn inside the segment when there is no icon, otherwise shown as a pill on hover. */
    label?: string;
    /** Icon drawn in the segment. */
    icon?: IconSource;
    /** Shown but not selectable. */
    disabled?: boolean;
    /** Sub-items, laid out on the next ring, centred on this item. */
    children?: RadialItem[];
}

/** Colours of a {@link RadialMenu} (any Pixi colour). */
export interface RadialTheme {
    segment: number | string;
    segmentHover: number | string;
    segmentDisabled: number | string;
    hub: number | string;
    icon: number | string;
    iconHover: number | string;
    accent: number | string;
    shadow: number | string;
    pill: number | string;
    pillText: number | string;
}

/** Light-on-dark default, close to the look of 3D and paint tools. */
export const RADIAL_THEME: Readonly<RadialTheme> = {
    segment: 0xe9e9ec,
    segmentHover: 0xffffff,
    segmentDisabled: 0x8e8e93,
    hub: 0xf5f5f7,
    icon: 0x3a3a3c,
    iconHover: 0x0a84ff,
    accent: 0x0a84ff,
    shadow: 0x000000,
    pill: 0xffffff,
    pillText: 0x1c1c1e,
};

/** Area the menu must stay inside, in its parent's coordinates. */
export interface RadialBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** Options of {@link RadialMenu}. Distances are design units, scaled per input kind by the profile. */
export interface RadialMenuOptions {
    items: RadialItem[];
    /** Inner radius of the first ring (the hub sits inside). Default 40. */
    innerRadius?: number;
    /** Outer radius of the first ring. Default 100. */
    outerRadius?: number;
    /** Angle covered by the first ring: `Math.PI * 2` for a full pie, `Math.PI` for a half. Default full. */
    sweep?: number;
    /** Direction the ring faces (radians, 0 = right, -PI/2 = up). On a full ring, where the first item sits. Default up. */
    direction?: number;
    /** Partial rings opened near an edge of `bounds` turn to face the inside. Default true. */
    autoDirection?: boolean;
    /** Gap between segments, in units. Default 4. */
    gap?: number;
    /** Corner radius of segments. Default 10. */
    corner?: number;
    /** Gap between rings. Default 6. */
    ringGap?: number;
    /** Thickness of sub-rings. Default 46. */
    ringWidth?: number;
    /** Arc length of one sub-item along its ring. Default 58. */
    itemArc?: number;
    /** Icon size. Default 26. */
    iconSize?: number;
    /** Close when the pointer stays outside the falloff area for the profile's leave delay. Default false: it stays. */
    closeOnLeave?: boolean;
    /** Close after a selection. Default true. */
    closeOnSelect?: boolean;
    /** Items with children can be selected too (otherwise they only open their ring). Default false. */
    selectParents?: boolean;
    /** Keeps the menu inside this rectangle (parent coordinates). */
    bounds?: RadialBounds | (() => RadialBounds);
    /** Per-pointer-kind tuning of dead zone, falloff, scale, tap and hysteresis. */
    profiles?: InputProfiles;
    theme?: Partial<RadialTheme>;
    /** Style of text labels. */
    textStyle?: TextStyleOptions;
    /** Escape closes the menu. Default true. */
    escapeCloses?: boolean;
    /** Ticker driving the animation. Default `Ticker.shared`. `null` for manual {@link RadialMenu.tick}. */
    ticker?: Ticker | null;
    /** An item was picked. `path` runs from the first ring to the item. */
    onSelect?: (item: RadialItem, path: readonly RadialItem[]) => void;
    /** The menu started closing. `item` is the selection, if any. */
    onClose?: (item: RadialItem | null) => void;
}

/** What {@link RadialMenu.openAt} needs from the pointer event that opened it. */
export type RadialPointer = Pick<FederatedPointerEvent, 'pointerId' | 'pointerType' | 'buttons' | 'global'>;

/** Lifecycle of a {@link RadialMenu}. */
export type RadialPhase = 'closed' | 'open' | 'closing';

interface Node {
    item: RadialItem;
    level: number;
    index: number;
    children: Node[];
    angle: number;
    slot: number;
    open: Spring;
    hover: number;
    flash: number;
    pill: number;
    delay: number;
    icon: Container | null;
    pillText: Text | null;
    /** Width of the icon or label at scale 1, to fit it in its segment. */
    iconW: number;
}

interface Press {
    id: number;
    t0: number;
    x: number;
    y: number;
    moved: boolean;
    opening: boolean;
    outside: boolean;
}

/** The reactive state of a {@link RadialMenu}. */
export interface RadialState {
    /** `closed`, `open` or `closing`. */
    phase: Signal<RadialPhase>;
    /** Item under the pointer. */
    hover: Signal<RadialItem | null>;
    /** Open chain of items, first ring first. */
    path: Signal<readonly RadialItem[]>;
    /** Pointer kind currently driving the menu. */
    kind: Signal<InputKind>;
}

/**
 * Pie / marking menu, the compact kind used in 3D, paint and modelling tools.
 *
 * - Press, drag towards an item, release: picked in one gesture (marking). Tap instead and it
 *   stays open for a second tap (sticky). Both work with mouse, pen and touch.
 * - Selection is by angle, not by hit box. Past the dead zone the whole wedge counts, out to the
 *   falloff distance. Fast flicks land, and a wobbly finger keeps its item (hysteresis).
 * - Leaving the menu does not close it unless `closeOnLeave` is set, and then only after a grace delay.
 * - Items with `children` open the next ring around themselves. Rings nest to any depth.
 * - Full circles or arcs (`sweep`), which turn away from screen edges.
 * - Dead zone, falloff, size and timing adapt to the pointer kind (bigger and more forgiving for touch).
 *
 * State lives in tiny signals on `state` (`phase`, `hover`, `path`, `kind`) you can subscribe to.
 * The menu draws with one {@link SilkGraphics} and only animates while something moves.
 */
export class RadialMenu extends Container {
    /** Reactive state: subscribe to drive other UI from the menu. */
    readonly state: RadialState = {
        phase: signal<RadialPhase>('closed'),
        hover: signal<RadialItem | null>(null),
        path: signal<readonly RadialItem[]>([]),
        kind: signal<InputKind>('mouse'),
    };

    private readonly _o: Required<
        Omit<RadialMenuOptions, 'bounds' | 'onSelect' | 'onClose' | 'textStyle' | 'ticker' | 'profiles' | 'theme'>
    >;
    private readonly _opts: RadialMenuOptions;
    private readonly _theme: Record<keyof RadialTheme, number>;
    private readonly _content = new Container();
    private readonly _g = new SilkGraphics();
    private readonly _icons = new Container();
    private readonly _driver: Driver;
    private _roots: Node[] = [];
    private _nodes: Node[] = [];
    private _pathNodes: Node[] = [];
    private _hoverNode: Node | null = null;
    private _profile: InputProfile;
    private _press: Press | null = null;
    private _pointer = { x: 0, y: 0, d: 0, a: 0, inside: false };
    private _aim = 0;
    private _hub: Spring = new Spring(0, 520, 30);
    private _elapsed = 0;
    private _leaveAt = -1;
    private _direction: number;
    private _selected: RadialItem | null = null;

    constructor(options: RadialMenuOptions) {
        super({ label: 'RadialMenu' });
        this._opts = options;
        this._o = {
            items: options.items,
            innerRadius: options.innerRadius ?? 40,
            outerRadius: options.outerRadius ?? 100,
            sweep: Math.min(TAU, options.sweep ?? TAU),
            direction: options.direction ?? -Math.PI / 2,
            autoDirection: options.autoDirection ?? true,
            gap: options.gap ?? 4,
            corner: options.corner ?? 10,
            ringGap: options.ringGap ?? 6,
            ringWidth: options.ringWidth ?? 46,
            itemArc: options.itemArc ?? 58,
            iconSize: options.iconSize ?? 26,
            closeOnLeave: options.closeOnLeave ?? false,
            closeOnSelect: options.closeOnSelect ?? true,
            selectParents: options.selectParents ?? false,
            escapeCloses: options.escapeCloses ?? true,
        };
        const theme = { ...RADIAL_THEME, ...options.theme };

        this._theme = Object.fromEntries(Object.entries(theme).map(([k, v]) => [k, hex(v)])) as Record<
            keyof RadialTheme,
            number
        >;
        this._direction = this._o.direction;
        this._profile = inputProfile('mouse', options.profiles);
        this._driver = new Driver((dt) => this._step(dt), options.ticker);
        this._content.interactiveChildren = false;
        this._content.addChild(this._g, this._icons);
        this.addChild(this._content);
        this.visible = false;
        this.eventMode = 'none';
        // while open the menu catches every pointer event on the canvas: moves steer it, taps outside close it
        this.hitArea = { contains: () => true };
        this.on('pointerdown', this._onDown, this);
        this.on('globalpointermove', this._onMove, this);
        this.on('pointerup', this._onUp, this);
        this.on('pointerupoutside', this._onUp, this);
        this.setItems(options.items);
    }

    /** Close when the pointer stays outside the falloff area. Can change at any time. */
    get closeOnLeave(): boolean {
        return this._o.closeOnLeave;
    }

    set closeOnLeave(value: boolean) {
        this._o.closeOnLeave = value;
        if (!value) this._leaveAt = -1;
    }

    /** True while open (not while closing). */
    get isOpen(): boolean {
        return this.state.phase.value === 'open';
    }

    /** Replaces the items (closes sub-rings). */
    setItems(items: RadialItem[]): void {
        for (const n of this._nodes) n.icon?.destroy();
        for (const n of this._nodes) n.pillText?.destroy();
        this._icons.removeChildren();
        this._nodes = [];
        this._o.items = items;
        const build = (item: RadialItem, level: number, index: number): Node => {
            const node: Node = {
                item,
                level,
                index,
                children: [],
                angle: 0,
                slot: 0,
                open: new Spring(0, 380, 26),
                hover: 0,
                flash: 0,
                pill: 0,
                delay: 0,
                icon: null,
                pillText: null,
                iconW: 0,
            };
            const source = item.icon ?? item.label;

            if (source !== undefined) {
                const style = item.icon ? undefined : this._opts.textStyle;

                node.icon = createIcon(source, item.icon ? this._o.iconSize : this._o.iconSize * 1.15, style);
                node.icon.visible = false;
                node.iconW = node.icon.width;
                this._icons.addChild(node.icon);
            }
            if (item.icon && item.label) {
                node.pillText = createIcon(item.label, 28, {
                    fontSize: 12,
                    letterSpacing: 0.6,
                    ...this._opts.textStyle,
                }) as Text;
                node.pillText.visible = false;
                this._icons.addChild(node.pillText);
            }
            this._nodes.push(node);
            node.children = (item.children ?? []).map((c, i) => build(c, level + 1, i));

            return node;
        };

        this._roots = items.map((item, i) => build(item, 0, i));
        this._setPath([]);
        this._layout();
    }

    /**
     * Opens the menu centred on (x, y) in the parent's coordinates. Pass the pointer event that
     * opened it so a press-drag-release picks in one gesture and the profile matches the device.
     */
    openAt(x: number, y: number, event?: RadialPointer): void {
        const kind = event ? inputKind(event) : preferredInputKind();

        this._setKind(kind);
        this._place(x, y);
        this._layout();
        this._selected = null;
        this._setPath([]);
        this._elapsed = 0;
        this._leaveAt = -1;
        this._roots.forEach((n, i) => {
            n.delay = i * 0.018;
            if (this.state.phase.value === 'closed') n.open.value = n.open.velocity = 0;
        });
        this._press = null;
        if (event && event.buttons !== 0) {
            const p = this.toLocal(event.global);

            this._press = {
                id: event.pointerId,
                t0: performance.now(),
                x: p.x,
                y: p.y,
                moved: false,
                opening: true,
                outside: false,
            };
            this._track(event);
        } else {
            this._pointer = { x: 0, y: 0, d: 0, a: this._direction, inside: true };
        }
        // on top of its siblings, so it gets the pointer before anything else
        this.parent?.addChild(this);
        this.visible = true;
        this.eventMode = 'static';
        this.state.phase.set('open');
        if (this._o.escapeCloses && typeof window !== 'undefined') window.addEventListener('keydown', this._onKey);
        this._driver.wake();
    }

    /** Closes the menu (animated). */
    close(): void {
        if (this.state.phase.value !== 'open') return;
        this.state.phase.set('closing');
        this.eventMode = 'none';
        this._press = null;
        this._leaveAt = -1;
        if (typeof window !== 'undefined') window.removeEventListener('keydown', this._onKey);
        const open = this._nodes.filter((n) => n.open.target > 0 || n.open.value > 0.001);

        open.reverse().forEach((n, i) => {
            n.delay = Math.min(i * 0.012, 0.08);
        });
        this._elapsed = 0;
        this._opts.onClose?.(this._selected);
        this._driver.wake();
    }

    /** Picks `item` as if the user released on it. */
    select(item: RadialItem): void {
        const node = this._nodes.find((n) => n.item === item);

        if (!node || item.disabled || this.state.phase.value !== 'open') return;
        const path = this._chain(node).map((n) => n.item);

        node.flash = 1;
        this._selected = item;
        this._opts.onSelect?.(item, path);
        if (this._o.closeOnSelect) this.close();
        this._driver.wake();
    }

    /** Advances the animation by `dt` seconds (only needed with `ticker: null`). Returns true while moving. */
    tick(dt: number): boolean {
        return this._driver.tick(dt);
    }

    override destroy(options?: Parameters<Container['destroy']>[0]): void {
        this._driver.sleep();
        if (typeof window !== 'undefined') window.removeEventListener('keydown', this._onKey);
        super.destroy(options ?? { children: true });
    }

    // ------------------------------------------------------------------------------ geometry

    private _ring(level: number): [number, number] {
        const { innerRadius, outerRadius, ringGap, ringWidth } = this._o;

        if (level === 0) return [innerRadius, outerRadius];
        const r0 = outerRadius + ringGap + (level - 1) * (ringWidth + ringGap);

        return [r0, r0 + ringWidth];
    }

    private _layout(): void {
        const { sweep } = this._o;
        const n = Math.max(1, this._roots.length);
        const full = sweep >= TAU - 1e-6;
        const slot = sweep / n;
        const base = full ? this._direction - slot / 2 : this._direction - sweep / 2;

        this._roots.forEach((node, i) => {
            node.angle = base + (i + 0.5) * slot;
            node.slot = slot;
            this._layoutChildren(node);
        });
    }

    private _layoutChildren(parent: Node): void {
        const count = parent.children.length;

        if (!count) return;
        const [r0, r1] = this._ring(parent.level + 1);
        // every sibling gets the arc of the widest one, so labels like "Intuitive" fit their segment
        let arc = this._o.itemArc;

        for (const c of parent.children) {
            const need = c.item.icon ? this._o.iconSize + 26 : c.iconW + 22;

            arc = Math.max(arc, need + this._o.gap);
        }
        const slot = Math.min(arc / ((r0 + r1) / 2), TAU / count);

        parent.children.forEach((child, i) => {
            child.angle = parent.angle + (i - (count - 1) / 2) * slot;
            child.slot = slot;
            this._layoutChildren(child);
        });
    }

    private _place(x: number, y: number): void {
        const b = typeof this._opts.bounds === 'function' ? this._opts.bounds() : this._opts.bounds;
        const k = this._profile.scale;

        this._direction = this._o.direction;
        if (b) {
            const cx = b.x + b.width / 2;
            const cy = b.y + b.height / 2;
            const partial = this._o.sweep < TAU - 1e-6;
            const reach = this._o.outerRadius * k + 8;

            if (partial && this._o.autoDirection) {
                const far = Math.hypot(x - cx, y - cy) > Math.min(b.width, b.height) * 0.25;

                if (far) this._direction = Math.atan2(cy - y, cx - x);
            } else {
                x = Math.min(Math.max(x, b.x + reach), b.x + b.width - reach);
                y = Math.min(Math.max(y, b.y + reach), b.y + b.height - reach);
            }
        }
        this.position.set(x, y);
    }

    // ------------------------------------------------------------------------------ input

    private _setKind(kind: InputKind): void {
        this.state.kind.set(kind);
        this._profile = inputProfile(kind, this._opts.profiles);
        this._content.scale.set(this._profile.scale);
    }

    private readonly _onKey = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') this.close();
    };

    private _onDown(e: FederatedPointerEvent): void {
        if (this.state.phase.value !== 'open') return;
        const kind = inputKind(e);

        if (kind !== this.state.kind.value) this._setKind(kind);
        const p = this.toLocal(e.global);

        this._press = {
            id: e.pointerId,
            t0: performance.now(),
            x: p.x,
            y: p.y,
            moved: false,
            opening: false,
            outside: false,
        };
        this._track(e);
        this._press.outside = !this._pointer.inside;
    }

    private _onMove(e: FederatedPointerEvent): void {
        if (this.state.phase.value !== 'open') return;
        if (this._press && e.pointerId !== this._press.id) return;
        // touch only steers while the finger is down; a hovering mouse always steers
        if (!this._press && inputKind(e) === 'touch') return;
        this._track(e);
    }

    private _onUp(e: FederatedPointerEvent): void {
        const press = this._press;

        if (!press || e.pointerId !== press.id || this.state.phase.value !== 'open') return;
        this._track(e);
        this._press = null;
        const tap = !press.moved && performance.now() - press.t0 < this._profile.tapMs;
        const hover = this._hoverNode;

        if (hover && !(press.outside && !press.opening)) {
            if (hover.children.length && !this._o.selectParents) return;
            if (!hover.item.disabled) this.select(hover.item);

            return;
        }
        if (press.opening) {
            // the opening tap leaves the menu up; a drag released on the hub or far away cancels
            const inHub = this._pointer.d < this._profile.deadzone / this._profile.scale;

            if (!tap && press.moved && (inHub || !this._pointer.inside)) this.close();

            return;
        }
        // a later tap on the hub, in a gap or outside the falloff closes
        this.close();
    }

    /** Recomputes the hovered item from a pointer event. */
    private _track(e: RadialPointer): void {
        const p = this.toLocal(e.global);
        const press = this._press;

        if (press && !press.moved && Math.hypot(p.x - press.x, p.y - press.y) > this._profile.slop) press.moved = true;
        this.pointerAt(p.x, p.y);
    }

    /**
     * Steers the menu with a point in its own coordinates (screen scale, centre at 0, 0).
     * Pointer events call this. Call it yourself for gamepads or tests.
     */
    pointerAt(x: number, y: number): void {
        const prof = this._profile;
        const k = prof.scale;
        const lx = x / k;
        const ly = y / k;
        const d = Math.hypot(lx, ly);
        const a = Math.atan2(ly, lx);
        const depth = this._visibleDepth();
        const [, outerMost] = this._ring(depth);
        const inside = d <= outerMost + prof.falloff / k;

        this._pointer = { x: lx, y: ly, d, a, inside };
        if (inside) this._leaveAt = -1;
        else if (this._o.closeOnLeave && this._leaveAt < 0) this._leaveAt = performance.now() + prof.leaveDelayMs;

        let next: Node | null = null;
        let path = this._pathNodes;

        if (d < prof.deadzone / k) {
            path = [];
        } else if (inside) {
            const [, outer] = this._ring(0);
            const band = this._o.ringWidth + this._o.ringGap;
            const level = d <= outer ? 0 : Math.min(depth, 1 + Math.floor((d - outer - this._o.ringGap / 2) / band));
            const siblings = level === 0 ? this._roots : path[level - 1].children;
            const pick = this._pick(siblings, a, path[level] ?? null);

            if (pick) {
                next = pick;
                path = [...path.slice(0, level), pick];
            } else if (level > 0) {
                next = path[level - 1];
                path = path.slice(0, level);
            } else {
                path = [];
            }
        } else {
            next = null;
        }
        this._hoverNode = next;
        this._setPath(path);
        this.state.hover.set(next?.item ?? null);
        this._driver.wake();
    }

    private _pick(siblings: Node[], a: number, current: Node | null): Node | null {
        const hyst = this._profile.hysteresis;

        // keep the current item until the pointer is clearly past its edge
        if (current && siblings.includes(current)) {
            if (Math.abs(angleDelta(a, current.angle)) <= current.slot / 2 + hyst) return current;
        }
        let best: Node | null = null;
        let bestD = Infinity;

        for (const n of siblings) {
            const delta = Math.abs(angleDelta(a, n.angle));

            if (delta < bestD) {
                bestD = delta;
                best = n;
            }
        }

        // a little beyond the outermost items of an arc still counts as them
        return best && bestD <= best.slot ? best : null;
    }

    private _visibleDepth(): number {
        let depth = 0;

        for (const n of this._pathNodes) {
            if (n.children.length) depth = n.level + 1;
        }

        return depth;
    }

    private _setPath(path: Node[]): void {
        const same = path.length === this._pathNodes.length && path.every((n, i) => n === this._pathNodes[i]);

        if (same) return;
        const opened = path.filter((n) => !this._pathNodes.includes(n));

        this._pathNodes = path;
        for (const parent of opened) {
            parent.children.forEach((c, i) => {
                c.delay = this._elapsed + i * 0.02;
            });
        }
        this.state.path.set(path.map((n) => n.item));
    }

    private _chain(node: Node): Node[] {
        const find = (list: Node[], trail: Node[]): Node[] | null => {
            for (const n of list) {
                if (n === node) return [...trail, n];
                const hit = find(n.children, [...trail, n]);

                if (hit) return hit;
            }

            return null;
        };

        return find(this._roots, []) ?? [node];
    }

    // ------------------------------------------------------------------------------ animation

    private _isShown(n: Node): boolean {
        if (this.state.phase.value !== 'open') return false;
        if (n.level === 0) return true;
        const parent = this._pathNodes[n.level - 1];

        return !!parent && parent.children.includes(n);
    }

    private _step(dt: number): boolean {
        const o = this._o;
        const t = this._theme;
        const g = this._g;
        const open = this.state.phase.value === 'open';
        let busy = false;

        this._elapsed += dt;
        if (this._leaveAt >= 0 && performance.now() >= this._leaveAt) this.close();

        this._hub.target = open ? 1 : 0;
        this._hub.step(dt);
        if (!this._hub.settled) busy = true;
        const ptr = this._pointer;
        const aimTarget = ptr.d >= this._profile.deadzone / this._profile.scale && ptr.inside && open ? 1 : 0;

        this._aim = damp(this._aim, aimTarget, 16, dt);
        if (Math.abs(this._aim - aimTarget) > 0.002) busy = true;

        g.clear();
        const hub = clamp01(this._hub.value);
        const hubR = (o.innerRadius - 7) * (0.4 + 0.6 * Math.min(this._hub.value, 1.1));

        // soft shadow under the first ring and the hub
        if (hub > 0.01) {
            g.circle(0, 0, hubR + 4).fill({ color: t.shadow, alpha: 0.25 * hub, blur: 8 });
        }

        let anyShown = hub > 0.001;

        for (const n of this._nodes) {
            const shown = this._isShown(n);
            const ready = this._elapsed >= n.delay;

            if (shown) n.open.target = ready ? 1 : n.open.target;
            else if (open || ready) n.open.target = 0;
            n.open.step(dt);
            const isHover = n === this._hoverNode;
            const inPath = this._pathNodes.includes(n);
            const hTarget = isHover ? 1 : inPath ? 0.55 : 0;

            n.hover = damp(n.hover, hTarget, 20, dt);
            n.flash = damp(n.flash, 0, 7, dt);
            const pillTarget = isHover && n.pillText ? 1 : 0;

            n.pill = damp(n.pill, pillTarget, 18, dt);
            if (!n.open.settled || Math.abs(n.hover - hTarget) > 0.002 || n.flash > 0.002) busy = true;
            if (Math.abs(n.pill - pillTarget) > 0.002) busy = true;
            if (shown && !ready) busy = true;
            const v = n.open.value;

            if (v <= 0.001) {
                if (n.icon) n.icon.visible = false;
                if (n.pillText) n.pillText.visible = false;
                continue;
            }
            anyShown = true;
            this._drawNode(n, v);
        }

        // hub and the aim notch pointing at the cursor
        if (hub > 0.001) {
            g.circle(0, 0, hubR).fill({ color: t.hub, alpha: hub });
            if (this._aim > 0.01) {
                g.arcSweep(0, 0, hubR - 5, ptr.a - 0.32, 0.64).stroke({
                    width: 3,
                    color: t.accent,
                    alpha: this._aim * hub,
                    cap: 'round',
                });
            }
            g.circle(0, 0, 3.5).fill({ color: t.icon, alpha: 0.5 * hub * (1 - this._aim * 0.6) });
        }

        if (this.state.phase.value === 'closing' && !busy && !anyShown) {
            this.state.phase.set('closed');
            this.visible = false;
            this._setPath([]);
            this._hoverNode = null;
            this.state.hover.set(null);
        }

        return busy || (this.state.phase.value === 'open' && this._leaveAt >= 0);
    }

    private _drawNode(n: Node, v: number): void {
        const o = this._o;
        const t = this._theme;
        const g = this._g;
        const [r0, r1] = this._ring(n.level);
        const grow = 0.55 + 0.45 * Math.min(v, 1.08);
        const push = n.hover * 4;
        const rin = r0 * grow + push;
        const rout = r1 * grow + push + n.hover * 3;
        const mid = (rin + rout) / 2;
        const gapAng = o.gap / 2 / Math.max(mid, 1);
        const half = Math.max(0.001, (n.slot / 2 - gapAng) * (0.6 + 0.4 * clamp01(v)));
        const alpha = clamp01(v);
        const disabled = !!n.item.disabled;
        let color = disabled ? t.segmentDisabled : mix(t.segment, t.segmentHover, n.hover);

        color = mix(color, t.accent, n.flash);

        g.sector(0, 0, rout, n.angle - half, n.angle + half, rin, o.corner).fill({ color, alpha: alpha * 0.97 });
        if (n.hover > 0.01 && !disabled) {
            const capAng = Math.min(half * 0.8, (o.corner + 2) / rout);

            g.arcSweep(0, 0, rout - 2.5, n.angle - half + capAng, 2 * (half - capAng)).stroke({
                width: 3,
                color: t.accent,
                alpha: n.hover * alpha,
                cap: 'round',
            });
        }
        // a dot on the rim marks items that open another ring
        if (n.children.length) {
            const r = rout - 7;

            g.circle(Math.cos(n.angle) * r, Math.sin(n.angle) * r, 2.2).fill({
                color: mix(t.icon, t.accent, n.hover),
                alpha: alpha * 0.7,
            });
        }

        if (n.icon) {
            n.icon.visible = true;
            n.icon.position.set(Math.cos(n.angle) * mid, Math.sin(n.angle) * mid);
            // text that still does not fit (a crowded ring) shrinks to the segment's width
            const room = 2 * mid * Math.sin(Math.min(half, Math.PI / 2)) - 12;
            const fit = n.item.icon || n.iconW <= 0 ? 1 : Math.min(1, room / n.iconW);

            n.icon.scale.set((0.6 + 0.4 * Math.min(v, 1.1) + n.hover * 0.06) * fit);
            n.icon.tint = disabled ? t.segmentDisabled : mix(t.icon, t.iconHover, n.hover);
            n.icon.alpha = alpha * (disabled ? 0.45 : 1);
        }
        if (n.pillText) {
            const p = n.pill * alpha;

            n.pillText.visible = p > 0.01;
            // with its ring of children open, the pill goes past that ring instead of covering it
            const childrenOpen = n.children.length > 0 && this._pathNodes.includes(n);
            const edge = childrenOpen ? Math.max(rout, this._ring(n.level + 1)[1] + 4) : rout;

            if (p > 0.01) this._drawPill(n, edge, p);
        }
    }

    private _drawPill(n: Node, rout: number, p: number): void {
        const t = this._theme;
        const text = n.pillText as Text;
        const w = text.width + 20;
        const h = 22;
        const r = rout + 10 + 6 * p;
        const ax = Math.cos(n.angle) * r;
        const ay = Math.sin(n.angle) * r;
        const c = Math.cos(n.angle);
        const s = Math.sin(n.angle);
        let x = c >= 0 ? ax : ax - w;
        let y = ay - h / 2;

        // near the top or bottom: centre the pill above or below the item
        if (Math.abs(c) < 0.35) {
            x = ax - w / 2;
            y = s < 0 ? ay - h : ay;
        }
        this._g.pill(x, y, w, h).fill({ color: t.pill, alpha: p });
        text.position.set(x + w / 2, y + h / 2);
        text.tint = t.pillText;
        text.alpha = p;
    }
}

/** Options of {@link bindRadialTrigger}. */
export interface RadialTriggerOptions {
    /** `press` opens on pointer down, `hold` after a still press of `holdMs` (long-press, good on touch). Default `press`. */
    mode?: 'press' | 'hold';
    /** Long-press time for `hold`. Default 320 ms. */
    holdMs?: number;
    /** Open centred on the `target` or at the `pointer`. Default `target`. */
    at?: 'target' | 'pointer';
    /** Mouse buttons that open it (0 left, 2 right). Default [0, 2]. */
    buttons?: number[];
}

/**
 * Makes `target` open `menu` (which must already be on the stage). Returns a function that unbinds it.
 */
export function bindRadialTrigger(target: Container, menu: RadialMenu, options: RadialTriggerOptions = {}): () => void {
    const { mode = 'press', holdMs = 320, at = 'target', buttons = [0, 2] } = options;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let origin = { x: 0, y: 0 };

    const open = (e: RadialPointer) => {
        const parent = menu.parent;

        if (!parent) return;
        const b = target.getBounds();
        const p = parent.toLocal(at === 'pointer' ? e.global : { x: b.x + b.width / 2, y: b.y + b.height / 2 });

        menu.openAt(p.x, p.y, e);
    };
    const cancel = () => {
        if (timer) clearTimeout(timer);
        timer = null;
    };
    const onDown = (e: FederatedPointerEvent) => {
        if (inputKind(e) === 'mouse' && !buttons.includes(e.button)) return;
        if (menu.isOpen) return;
        if (mode === 'press') {
            open(e);

            return;
        }
        origin = { x: e.global.x, y: e.global.y };
        cancel();
        // Pixi pools event objects: keep a copy of what `open` needs
        const copy: RadialPointer = {
            pointerId: e.pointerId,
            pointerType: e.pointerType,
            buttons: e.buttons,
            global: e.global.clone(),
        };

        timer = setTimeout(() => {
            timer = null;
            open(copy);
        }, holdMs);
    };
    const onMove = (e: FederatedPointerEvent) => {
        if (!timer) return;
        const slop = inputProfile(inputKind(e)).slop;

        if (Math.hypot(e.global.x - origin.x, e.global.y - origin.y) > slop) cancel();
    };
    const onContext = (e: FederatedPointerEvent) => e.preventDefault();

    if (target.eventMode === 'none' || target.eventMode === 'passive' || target.eventMode === 'auto') {
        target.eventMode = 'static';
    }
    target.on('pointerdown', onDown);
    target.on('globalpointermove', onMove);
    target.on('pointerup', cancel);
    target.on('pointerupoutside', cancel);
    target.on('rightclick', onContext);

    return () => {
        cancel();
        target.off('pointerdown', onDown);
        target.off('globalpointermove', onMove);
        target.off('pointerup', cancel);
        target.off('pointerupoutside', cancel);
        target.off('rightclick', onContext);
    };
}
