import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

interface SubsetExports {
    memory: WebAssembly.Memory;
    malloc(size: number): number;
    free(ptr: number): void;
    hb_blob_create(data: number, length: number, mode: number, user: number, destroy: number): number;
    hb_blob_destroy(blob: number): void;
    hb_blob_get_data(blob: number, length: number): number;
    hb_face_create(blob: number, index: number): number;
    hb_face_destroy(face: number): void;
    hb_face_reference_blob(face: number): number;
    hb_set_add(set: number, cp: number): void;
    hb_subset_input_create_or_fail(): number;
    hb_subset_input_destroy(input: number): void;
    hb_subset_input_unicode_set(input: number): number;
    hb_subset_or_fail(face: number, input: number): number;
}

let exports: SubsetExports | null = null;

function load(): SubsetExports {
    if (!exports) {
        const path = fileURLToPath(import.meta.resolve('harfbuzzjs/dist/harfbuzz-subset.wasm'));
        const instance = new WebAssembly.Instance(new WebAssembly.Module(readFileSync(path)), {});

        exports = instance.exports as unknown as SubsetExports;
    }
    return exports;
}

/**
 * A font cut down to the glyphs of `codePoints`, with HarfBuzz's subsetter: the layout closure is
 * kept, so contextual forms, ligatures and marks the characters need stay in. Use it to commit
 * small test fonts, or to ship a subset font for text slots (`pixi-silk/i18n/canvas`).
 */
export function subsetFont(font: Uint8Array, codePoints: Iterable<number>): Uint8Array {
    const e = load();
    const data = e.malloc(font.length);

    new Uint8Array(e.memory.buffer, data, font.length).set(font);
    // HB_MEMORY_MODE_WRITABLE: HarfBuzz may keep the pointer until the face is destroyed
    const blob = e.hb_blob_create(data, font.length, 2, 0, 0);
    const face = e.hb_face_create(blob, 0);

    e.hb_blob_destroy(blob);
    const input = e.hb_subset_input_create_or_fail();
    const set = e.hb_subset_input_unicode_set(input);

    for (const cp of codePoints) e.hb_set_add(set, cp);
    const result = e.hb_subset_or_fail(face, input);

    e.hb_subset_input_destroy(input);
    if (!result) {
        e.hb_face_destroy(face);
        e.free(data);
        throw new Error('subsetting failed');
    }
    const outBlob = e.hb_face_reference_blob(result);
    const lengthPtr = e.malloc(4);
    const outData = e.hb_blob_get_data(outBlob, lengthPtr);
    const length = new Uint32Array(e.memory.buffer, lengthPtr, 1)[0];
    const out = new Uint8Array(e.memory.buffer, outData, length).slice();

    e.free(lengthPtr);
    e.hb_blob_destroy(outBlob);
    e.hb_face_destroy(result);
    e.hb_face_destroy(face);
    e.free(data);

    return out;
}
