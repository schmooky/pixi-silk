import { deflateSync } from 'node:zlib';

const CRC_TABLE = /* @__PURE__ */ (() => {
    const t = new Uint32Array(256);

    for (let n = 0; n < 256; n++) {
        let c = n;

        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();

function crc32(bytes: Uint8Array): number {
    let c = 0xffffffff;

    for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);

    return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);

    view.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));

    return out;
}

/**
 * Lossless PNG: 8 bits per channel, 1 (grey), 3 (RGB) or 4 (RGBA) channels. Each row uses the
 * filter that compresses best of None, Sub and Up. No gamma or colour chunks: distance values
 * must reach the shader unchanged. The same pixels always give the same bytes.
 */
export function encodePng(pixels: Uint8Array, width: number, height: number, channels: 1 | 3 | 4): Uint8Array {
    const stride = width * channels;
    const raw = new Uint8Array((stride + 1) * height);
    const candidate = new Uint8Array(stride);

    for (let y = 0; y < height; y++) {
        const row = pixels.subarray(y * stride, (y + 1) * stride);
        const up = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;
        let bestFilter = 0;
        let bestScore = Infinity;
        let best = row;

        for (const filter of [0, 1, 2]) {
            if (filter === 2 && !up) continue;
            const out = filter === 0 ? row : candidate.slice();

            if (filter === 1)
                for (let i = 0; i < stride; i++) out[i] = (row[i] - (i >= channels ? row[i - channels] : 0)) & 0xff;
            if (filter === 2 && up) for (let i = 0; i < stride; i++) out[i] = (row[i] - up[i]) & 0xff;
            let score = 0;

            for (let i = 0; i < stride; i++) score += out[i] < 128 ? out[i] : 256 - out[i];
            if (score < bestScore) {
                bestScore = score;
                bestFilter = filter;
                best = out;
            }
        }
        raw[y * (stride + 1)] = bestFilter;
        raw.set(best, y * (stride + 1) + 1);
    }
    const header = new Uint8Array(13);
    const view = new DataView(header.buffer);

    view.setUint32(0, width);
    view.setUint32(4, height);
    header[8] = 8;
    header[9] = channels === 1 ? 0 : channels === 3 ? 2 : 6;
    const parts = [
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', header),
        chunk('IDAT', new Uint8Array(deflateSync(raw, { level: 9 }))),
        chunk('IEND', new Uint8Array(0)),
    ];
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;

    for (const p of parts) {
        out.set(p, at);
        at += p.length;
    }

    return out;
}
