import { Container, Matrix, Rectangle } from 'pixi.js';
import { type Signal, signal } from '../signal';
import { boundsQuad, unionQuad } from './outline';

/** The reactive state of a {@link SelectionGroup}. */
export interface SelectionGroupState {
    /** The objects the group moves. */
    targets: Signal<readonly Container[]>;
}

/** The three callbacks a {@link TransformGizmo} takes, wired to a {@link SelectionGroup}. */
export interface SelectionGroupHooks {
    onStart: () => void;
    onChange: () => void;
    onEnd: () => void;
}

/** Options of {@link SelectionGroup}. */
export interface SelectionGroupOptions {
    /** Objects to start with. */
    targets?: readonly Container[];
    /** Called after the group moved its objects, on every change of a drag. */
    onApply?: (targets: readonly Container[]) => void;
}

const sameList = (a: readonly Container[], b: readonly Container[]): boolean =>
    a.length === b.length && a.every((t) => b.includes(t));

/** `m` then `n`: the matrix that applies `n` first, then `m`. */
function compose(m: Matrix, n: Matrix, out: Matrix = new Matrix()): Matrix {
    return out.set(
        m.a * n.a + m.c * n.b,
        m.b * n.a + m.d * n.b,
        m.a * n.c + m.c * n.d,
        m.b * n.c + m.d * n.d,
        m.a * n.tx + m.c * n.ty + m.tx,
        m.b * n.tx + m.d * n.ty + m.ty,
    );
}

/**
 * Several selected objects as one: a stand-in box around all of them that a
 * {@link TransformGizmo} can move, resize and rotate. Every change of the box is applied to each
 * object about the common pivot, whatever their parents.
 *
 * ```ts
 * const group = new SelectionGroup();
 * world.addChild(group);
 * const gizmo = new TransformGizmo({ mode: 'box', ...group.hooks() });
 * group.set(selected);
 * gizmo.attach(group.target);
 * ```
 *
 * The group draws nothing and catches no pointer. Add it to the space the objects live in
 * (usually the camera's world). It works on plain arrays of containers, so any selection store
 * can drive it.
 */
export class SelectionGroup extends Container {
    readonly state: SelectionGroupState = { targets: signal<readonly Container[]>([]) };

    private readonly _opts: SelectionGroupOptions;
    private _start: Matrix | null = null;
    private _snap: { target: Container; inSpace: Matrix; parent: Matrix }[] = [];

    constructor(options: SelectionGroupOptions = {}) {
        super({ label: 'SelectionGroup' });
        this._opts = options;
        this.eventMode = 'none';
        this.boundsArea = new Rectangle(0, 0, 0, 0);
        if (options.targets) this.set(options.targets);
    }

    /** The objects the group moves. */
    get targets(): readonly Container[] {
        return this.state.targets.value;
    }

    /**
     * What to attach a gizmo to: the object itself when one is selected (so it keeps its own
     * rotated frame), the group for several, null for none.
     */
    get target(): Container | null {
        const list = this.targets;

        return list.length === 0 ? null : list.length === 1 ? list[0] : this;
    }

    /** Groups `targets` and fits the box around them, square to the space. */
    set(targets: readonly Container[]): this {
        if (!sameList(targets, this.targets)) this.state.targets.set([...targets]);

        return this.refit();
    }

    /** Fits the box around the objects again, square to the space (after they moved on their own). */
    refit(): this {
        const space = this.parent;
        const list = this.targets.filter((t) => !t.destroyed && t.parent);

        this.rotation = 0;
        this.skew.set(0, 0);
        this.scale.set(1);
        this.pivot.set(0, 0);
        if (!space || !list.length) {
            this.boundsArea = new Rectangle(0, 0, 0, 0);

            return this;
        }
        const q = unionQuad(list.map((t) => boundsQuad(t, space)));
        const w = q[2].x - q[0].x;
        const h = q[2].y - q[0].y;

        this.position.set(q[0].x + w / 2, q[0].y + h / 2);
        this.boundsArea = new Rectangle(-w / 2, -h / 2, w, h);

        return this;
    }

    /** Remembers where the box and every object are: the start of a drag. */
    begin(): this {
        const space = this.parent;

        this._snap = [];
        this._start = null;
        if (!space || this.targets.length < 2) return this;
        const inv = space.getGlobalTransform().invert();

        this.updateLocalTransform();
        this._start = this.localTransform.clone();
        for (const target of this.targets) {
            if (target.destroyed || !target.parent) continue;
            this._snap.push({
                target,
                inSpace: compose(inv, target.getGlobalTransform()),
                parent: compose(inv, target.parent.getGlobalTransform()),
            });
        }

        return this;
    }

    /** Applies how the box changed since {@link SelectionGroup.begin} to every object. */
    apply(): this {
        const start = this._start;

        if (!start) return this;
        this.updateLocalTransform();
        // the change of the box, in the space: now after undoing the start
        const delta = compose(this.localTransform, start.clone().invert());
        const m = new Matrix();

        for (const s of this._snap) {
            if (s.target.destroyed) continue;
            compose(delta, s.inSpace, m);
            s.target.setFromMatrix(compose(s.parent.clone().invert(), m));
        }
        this._opts.onApply?.(this.targets);

        return this;
    }

    /** Ends a drag. The box keeps its turn and size, the way design tools show a rotated group. */
    end(): this {
        this._start = null;
        this._snap = [];

        return this;
    }

    /** `onStart`, `onChange` and `onEnd` for a {@link TransformGizmo}'s options. */
    hooks(): SelectionGroupHooks {
        return {
            onStart: () => {
                this.begin();
            },
            onChange: () => {
                this.apply();
            },
            onEnd: () => {
                this.end();
            },
        };
    }
}
