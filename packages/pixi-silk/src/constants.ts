/**
 * Instance layout shared by the CPU packer and the GLSL and WGSL programs. Internal: not part of
 * the public API. Every primitive is one instance of a unit quad. The vertex shader expands the
 * quad to the primitive's bounds, plus an anti-aliasing margin in device pixels. The fragment
 * shader evaluates the signed distance of the shape.
 *
 * Ids are `as const` objects rather than TypeScript enums: they compile to plain object
 * literals (no enum IIFEs, no reverse mappings) and need no TypeScript-only syntax.
 */

/** Floats per instance. 11 x vec4 = 176 bytes. */
export const STRIDE = 44;

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
    'aPaint', // gradientKind, atlasRow, extendMode, 0
    'aDash', // dash, gap, offset, strokeAlign (-1 inside .. 0 center .. +1 outside)
    'aFx', // spread, progressive blur end sigma, progressive blur angle, batch object index + 1 (0 = not batched)
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
    /** Filled path: its edges live in a float texture, `aShape0.xy` = first texel and edge count. */
    Poly: 9,
    /**
     * Stroked path, one distance field for the whole outline: header, segment and length texels live
     * in the path texture. `aShape0` = first window texel, windows the instance owns, windows of
     * other instances near them, and the instance's key. `aShape1` = join, miter limit.
     */
    Path: 10,
    /** Union of closed shapes: `aShape0.xy` = first record texel and record count (4 texels each). */
    Union: 11,
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
    /** Plus-lighter: the colour adds to what is underneath (written with zero alpha). */
    Additive: 16384,
    /** Inner shadow of the shape. Offset in `aStroke.xy`, spread in `aFx.x`. */
    Inner: 32768,
    /** Blur goes from `aMeta.w` to `aFx.y` along the angle `aFx.z`. */
    Progressive: 65536,
} as const;
export type Flag = (typeof Flag)[keyof typeof Flag];

/** Bit offset of the start cap id in the flags. */
export const CAP0_SHIFT = 8;
/** Bit offset of the end cap id in the flags. */
export const CAP1_SHIFT = 10;

/** Line cap ids (two bits per end, see CAP0_SHIFT / CAP1_SHIFT). */
export const Cap = {
    Butt: 0,
    Round: 1,
    Square: 2,
} as const;
export type Cap = (typeof Cap)[keyof typeof Cap];

/** Line join ids in `aShape1.x` of a {@link Prim.Path} instance. */
export const Join = {
    Round: 0,
    Miter: 1,
    Bevel: 2,
} as const;
export type Join = (typeof Join)[keyof typeof Join];

/** Segments a stroked path instance owns at most. Longer subpaths are split into chunks of this size. */
export const PATH_CHUNK = 32;

/** Gradient ids in `aPaint.x`. */
export const GradKind = {
    None: 0,
    Linear: 1,
    Radial: 2,
    Conic: 3,
    Path: 4,
    /** Smooth colour mesh: a 16 x 16 grid baked into one atlas row. */
    Mesh: 5,
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
/** Rows of the gradient atlas, so gradients in use at once. More reuse row 0 with a warning. */
export const ATLAS_ROWS = 256;

/** Edges per row of a graphics' path texture (one edge per RGBA32F texel). */
export const POLY_WIDTH = 256;

/** One full turn in radians. */
export const TAU: number = Math.PI * 2;
