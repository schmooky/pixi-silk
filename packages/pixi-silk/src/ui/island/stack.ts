import { Container } from 'pixi.js';

/** Options of {@link IslandStack}. */
export interface IslandStackOptions {
    /** `y` stacks top to bottom, `x` left to right. Default `y`. */
    axis?: 'x' | 'y';
    /** Space between items, local units. Default 16. */
    gap?: number;
}

/**
 * A row or a column of items, centred across the axis. Sizes come from each item's local bounds,
 * so items can draw around any origin. Call {@link IslandStack.layout} again after an item
 * changes size. An island stacks its `items` in one of these.
 */
export class IslandStack extends Container {
    /** Stacking axis. */
    readonly axis: 'x' | 'y';
    /** Space between items, local units. */
    gap: number;
    private _along = 0;
    private _across = 0;

    constructor(items: Container[] = [], options: IslandStackOptions = {}) {
        super({ label: 'IslandStack' });
        this.axis = options.axis ?? 'y';
        this.gap = options.gap ?? 16;
        if (items.length) this.addChild(...items);
        this.layout();
    }

    /** Length of the stack along its axis, local units. */
    get along(): number {
        return this._along;
    }

    /** Size of the widest item across the axis, local units. */
    get across(): number {
        return this._across;
    }

    /**
     * Places the items. With a box (`width` by `height`) the stack is centred in it, otherwise it
     * starts at (0, 0).
     */
    layout(width?: number, height?: number): this {
        const y = this.axis === 'y';
        const boxes = this.children.map((c) => c.getLocalBounds());
        let along = 0;
        let across = 0;

        for (const b of boxes) {
            along += y ? b.height : b.width;
            across = Math.max(across, y ? b.width : b.height);
        }
        along += Math.max(0, boxes.length - 1) * this.gap;
        this._along = along;
        this._across = across;
        const boxAlong = (y ? height : width) ?? along;
        const boxAcross = (y ? width : height) ?? across;
        let at = (boxAlong - along) / 2;

        this.children.forEach((c, i) => {
            const b = boxes[i];
            const size = y ? b.height : b.width;
            const cross = (boxAcross - (y ? b.width : b.height)) / 2;

            if (y) c.position.set(cross - b.x, at - b.y);
            else c.position.set(at - b.x, cross - b.y);
            at += size + this.gap;
        });

        return this;
    }
}
