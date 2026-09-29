/**
 * Instance layout shared by the CPU packer and the GLSL program.
 * Every primitive is one instance of a unit quad. The vertex shader expands the quad to the
 * primitive's bounds, plus an anti-aliasing margin in device pixels. The fragment shader
 * evaluates the exact signed distance of the shape.
 *
 * Ids are `as const` objects rather than TypeScript enums: they compile to plain object
 * literals (no enum IIFEs, no reverse mappings) and need no TypeScript-only syntax.
 */

/** Floats per instance. 10 x vec4 = 160 bytes. */
export const STRIDE = 40;

/** Attribute names in instance-buffer order (each is a vec4). */
export const INSTANCE_ATTRIBUTES = [
    'aBounds', // minX, minY, maxX, maxY (local, includes stroke outset + 3 sigma blur)
    'aShape0', // primitive parameters
    'aShape1',
    'aShape2',
    'aMeta', // type, flags, strokeWidth, blurSigma
    'aFill', // premultiplied rgba (for gradients: alpha multiplier as premultiplied white)
    'aStroke', // premultiplied rgba
    'aGrad', // gradient geometry in local space
    'aPaint', // gradientKind, atlasRow, extendMode, arc tip shadow / segment neighbour radius
    'aDash', // dash, gap, offset, strokeAlign (-1 inside .. 0 center .. +1 outside)
] as const;

/** Primitive ids, one per branch of the fragment shader. */
export const Prim = {
    Rect: 0,
    Ellipse: 1,
    Arc: 2,
    Sector: 3,
    Segment: 4,
    Area: 5,
    Heart: 6,
    Star: 7,
    Triangle: 8,
} as const;
export type Prim = (typeof Prim)[keyof typeof Prim];

/** Bit flags in `aMeta.y`. */
export const Flag = {
    Fill: 1,
    Stroke: 2,
    Dither: 4,
    Dash: 8,
    Prev: 16,
    Next: 32,
    EdgeLeft: 64,
    EdgeRight: 128,
    GradStroke: 4096,
    Closed: 8192,
    GradArcAligned: 16384,
    ArcTipOverlap: 32768,
} as const;
export type Flag = (typeof Flag)[keyof typeof Flag];

export const CAP0_SHIFT = 8;
export const CAP1_SHIFT = 10;

/** Line cap ids (two bits per end, see CAP0_SHIFT / CAP1_SHIFT). */
export const Cap = {
    Butt: 0,
    Round: 1,
    Square: 2,
} as const;
export type Cap = (typeof Cap)[keyof typeof Cap];

/** Gradient ids in `aPaint.x`. */
export const GradKind = {
    None: 0,
    Linear: 1,
    Radial: 2,
    Conic: 3,
    Path: 4,
} as const;
export type GradKind = (typeof GradKind)[keyof typeof GradKind];

/** Gradient extend-mode ids in `aPaint.z`. */
export const Extend = {
    Pad: 0,
    Repeat: 1,
    Reflect: 2,
} as const;
export type Extend = (typeof Extend)[keyof typeof Extend];

/** Gradient ramp atlas: one gradient per row, RAMP_WIDTH samples per ramp. */
export const RAMP_WIDTH = 256;
export const ATLAS_ROWS = 256;

export const TAU: number = Math.PI * 2;
