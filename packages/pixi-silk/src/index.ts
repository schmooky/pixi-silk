export { createSilkApp, type SilkApp, type SilkAppOptions } from './app';
export { GradientAtlas } from './atlas';
export { enableSilkBatching, SilkPipe } from './batch';
export { type ColorSpace, linearToOklab, oklabToLinear, parseColor, type RGBA } from './color';
export { catmullRom, monotoneX, type PointsInput, toFlat } from './curves';
export {
    along,
    ConicGradient,
    type ConicGradientOptions,
    conic,
    type Easing,
    type ExtendMode,
    Gradient,
    type GradientOptions,
    type GradientUnits,
    horizontal,
    LinearGradient,
    type LinearGradientOptions,
    linear,
    type MeshColorInput,
    MeshGradient,
    type MeshGradientOptions,
    mesh,
    PathGradient,
    RadialGradient,
    type RadialGradientOptions,
    radial,
    type StopInput,
    type Vec2,
    vertical,
} from './gradient';
export { damp, dampAngle, ease, Spring } from './motion';
export {
    type AreaOptions,
    type FillInput,
    type FillStyle,
    type InnerShadow,
    type LineCap,
    type LineJoin,
    type PolylineOptions,
    type ProgressiveBlur,
    type ShapeOp,
    SilkGeometry,
    SilkGraphics,
    type SilkGraphicsOptions,
    type StrokeInput,
    type StrokeStyle,
} from './SilkGraphics';
