/* Shared colours, layout and helpers of reference sheet 2. Each widget lives in lab/_cards. */

/*
 * Reference sheet 2 (1200×900): twenty watch complications. Every widget is drawn in
 * reference pixels relative to its grid origin; numbers were measured on the image.
 */

export const PI = Math.PI;

export const W = 0xffffff;

export const GRAY = 0x8e8e93;

export const DIM = 0x48484a;

export const XS = [104, 370, 637, 904];

export const YS = [114, 259, 410, 556, 705];

export const wave = (x: number, t: number, k = 1) => Math.sin(x * 0.13 * k + t);

/** Oscillation that is exactly 0 at t = 3 (the reference frame), so snapshots match the sheet. */
export const osc = (t: number, f: number, ph = 0) => Math.sin((t - 3) * f + ph) - Math.sin(ph);
