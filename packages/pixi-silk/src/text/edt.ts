/*
 * Signed distance fields from an anti-aliased coverage bitmap, the TinySDF way: two squared
 * distance grids (to the nearest outside and the nearest inside pixel), seeded with sub-pixel
 * offsets from the coverage, then an exact Euclidean distance transform on each (Felzenszwalb and
 * Huttenlocher, one 1D pass per column and one per row). Their difference is the signed distance.
 */

const INF = 1e20;

/** Reusable work buffers, grown on demand. */
interface Scratch {
    outer: Float64Array;
    inner: Float64Array;
    f: Float64Array;
    z: Float64Array;
    v: Uint16Array;
}

let scratch: Scratch | null = null;

function buffers(size: number, side: number): Scratch {
    if (!scratch || scratch.outer.length < size || scratch.f.length < side) {
        const n = Math.max(size, scratch?.outer.length ?? 0);
        const m = Math.max(side, scratch?.f.length ?? 0);

        scratch = {
            outer: new Float64Array(n),
            inner: new Float64Array(n),
            f: new Float64Array(m),
            z: new Float64Array(m + 1),
            v: new Uint16Array(m),
        };
    }

    return scratch;
}

/** One 1D squared distance transform along `length` cells, `stride` apart, in place. */
function edt1d(
    grid: Float64Array,
    offset: number,
    stride: number,
    length: number,
    f: Float64Array,
    v: Uint16Array,
    z: Float64Array,
): void {
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    f[0] = grid[offset];

    for (let q = 1, k = 0, s = 0; q < length; q++) {
        f[q] = grid[offset + q * stride];
        const q2 = q * q;

        do {
            const r = v[k];

            s = (f[q] - f[r] + q2 - r * r) / (q - r) / 2;
        } while (s <= z[k] && --k > -1);
        k++;
        v[k] = q;
        z[k] = s;
        z[k + 1] = INF;
    }
    for (let q = 0, k = 0; q < length; q++) {
        while (z[k + 1] < q) k++;
        const r = v[k];
        const qr = q - r;

        grid[offset + q * stride] = f[r] + qr * qr;
    }
}

/**
 * Exact 2D squared Euclidean distance transform of `grid` (`width` x `height`, row-major), in
 * place. Cells start at 0 for "on the feature" and a huge value elsewhere, and end as the squared
 * distance to the nearest feature cell.
 *
 * @internal
 */
export function edt2d(grid: Float64Array, width: number, height: number): void {
    const { f, v, z } = buffers(0, Math.max(width, height));

    for (let x = 0; x < width; x++) edt1d(grid, x, width, height, f, v, z);
    for (let y = 0; y < height; y++) edt1d(grid, y * width, 1, width, f, v, z);
}

/**
 * Turns an anti-aliased coverage bitmap into an 8-bit signed distance field.
 *
 * `alpha` holds `width * height` coverage bytes, row by row. With `channels` 4 it holds RGBA pixels
 * as `getImageData` returns them, and the alpha byte is read. Each output byte encodes the distance to the edge:
 * `255 * (1 - cutoff)` sits on the edge, larger is inside, and every `255 / radius` steps is one pixel.
 * Distances past `radius * (1 - cutoff)` outside or `radius * cutoff` inside clamp.
 *
 * `radius` is the distance in pixels that the byte range spans. `cutoff` is the share of it spent
 * inside the shape: 0.25 keeps three quarters for outlines and glows. Pass `out` to reuse an array.
 */
export function sdfFromAlpha(
    alpha: ArrayLike<number>,
    width: number,
    height: number,
    radius: number,
    cutoff: number,
    channels: 1 | 4 = 1,
    out: Uint8Array = new Uint8Array(width * height),
): Uint8Array {
    const size = width * height;
    const { outer, inner } = buffers(size, Math.max(width, height));
    const step = channels;
    const first = channels === 4 ? 3 : 0;

    for (let i = 0; i < size; i++) {
        const a = alpha[i * step + first] / 255;

        if (a >= 1) {
            outer[i] = 0;
            inner[i] = INF;
        } else if (a <= 0) {
            outer[i] = INF;
            inner[i] = 0;
        } else {
            // the edge crosses this pixel: seed both grids with its sub-pixel distance
            const d = 0.5 - a;

            outer[i] = d > 0 ? d * d : 0;
            inner[i] = d < 0 ? d * d : 0;
        }
    }
    const o = outer.subarray(0, size);
    const n = inner.subarray(0, size);

    edt2d(o, width, height);
    edt2d(n, width, height);
    for (let i = 0; i < size; i++) {
        const d = Math.sqrt(o[i]) - Math.sqrt(n[i]);
        const value = Math.round(255 - 255 * (d / radius + cutoff));

        out[i] = value < 0 ? 0 : value > 255 ? 255 : value;
    }

    return out;
}
