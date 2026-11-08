// pixi-silk/ui/layout: SmartContainer places a design box in the window the way slot games do,
// FlexContainer lays out children with the headless flex engine inside it.

export { type LayoutDebug, type LayoutDebugOptions, layoutDebug } from './layout/debug';
export {
    type FitMode,
    FlexContainer,
    type FlexContainerOptions,
    fitScale,
    type MediaRule,
    type SmartLayout,
    type SmartStyle,
    wrapText,
} from './layout/flex-container';
export { DEVICES, SimulatedViewport, type SimulatedViewportOptions, simulateViewport } from './layout/simulate';
export {
    type Breakpoint,
    type Insets,
    type LayoutData,
    type Placement,
    placeBox,
    SmartContainer,
    type SmartContainerOptions,
    type ViewportRect,
    type ViewportSource,
} from './layout/smart-container';
