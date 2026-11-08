/**
 * pixi-silk/layout: a small flex layout engine. It is headless and synchronous, with no Pixi in
 * it, so it runs in workers, tests and servers too. Build a tree of {@link LayoutNode}s, give them
 * CSS flexbox styles and call `calculate()` on the root.
 *
 * ```ts
 * const root = new LayoutNode({ direction: 'row', gap: 8, padding: 16 });
 * root.add(new LayoutNode({ width: 100 })).add(new LayoutNode({ grow: 1 }));
 * root.calculate(400, 120);
 * root.children[1].layout; // { x: 124, y: 16, width: 260, height: 88 }
 * ```
 *
 * For Pixi containers, `pixi-silk/ui/layout` wraps it in a `SmartContainer`.
 */
export { LayoutNode } from './layout/node';
export type {
    AlignContent,
    AlignItems,
    ComputedLayout,
    Edges,
    FlexDirection,
    JustifyContent,
    LayoutStyle,
    Length,
    MeasureFunction,
    Size,
} from './layout/style';
