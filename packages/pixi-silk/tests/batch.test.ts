import { InstructionSet, Matrix, type Renderer, RendererType } from 'pixi.js';
import { afterEach, describe, expect, it } from 'vitest';
import {
    enableSilkBatching,
    measureBatch,
    packBatch,
    SilkPipe,
    sameSettings,
    TABLE_TEXELS,
    writeObject,
} from '../src/batch';
import { POLY_WIDTH, STRIDE } from '../src/constants';
import { SilkGraphics } from '../src/SilkGraphics';

const source = (g: SilkGraphics) => g._batchSource;

function fakeRenderer(type = RendererType.WEBGL) {
    const log: string[] = [];
    const renderer = {
        type,
        renderPipes: {
            batch: { break: () => log.push('break') },
            mesh: {
                addRenderable: (_: unknown, set: InstructionSet) => {
                    log.push('mesh');
                    set.add({ renderPipeId: 'silk', canBundle: false } as never);
                },
                updateRenderable: () => log.push('mesh-update'),
                validateRenderable: () => false,
                execute: () => log.push('mesh-execute'),
            },
        },
    };

    return { renderer: renderer as unknown as Renderer, log };
}

type Batch = { items: SilkGraphics[] };

describe('batch packing', () => {
    it('copies instances in order and tags each with its object index', () => {
        const a = new SilkGraphics().circle(0, 0, 4).fill(0xffffff).rect(0, 0, 2, 2).fill(0xff0000);
        const b = new SilkGraphics().circle(9, 9, 2).fill(0x00ff00);
        const sources = [source(a), source(b)];
        const size = measureBatch(sources);

        expect(size).toEqual({ instances: 3, texels: 0 });
        const out = new Float32Array(size.instances * STRIDE);
        const bases: number[] = [];

        packBatch(sources, out, new Float32Array(4), bases);
        expect(out[STRIDE - 1]).toBe(1);
        expect(out[2 * STRIDE - 1]).toBe(1);
        expect(out[3 * STRIDE - 1]).toBe(2);
        // everything else is the object's own data
        expect(Array.from(out.subarray(2 * STRIDE, 2 * STRIDE + 8))).toEqual(Array.from(source(b).f.subarray(0, 8)));
        expect(bases).toEqual([0, 0]);
    });

    it('gives every object its own rows of path texels', () => {
        const a = new SilkGraphics().poly([0, 0, 10, 0, 5, 8]).fill(0xffffff);
        const b = new SilkGraphics().polyline([0, 0, 10, 0, 10, 10]).stroke({ width: 2, color: 0xffffff });
        const sources = [source(a), source(b)];
        const size = measureBatch(sources);

        expect(size.texels).toBe(2 * POLY_WIDTH);
        const poly = new Float32Array(size.texels * 4);
        const bases: number[] = [];

        packBatch(sources, new Float32Array(size.instances * STRIDE), poly, bases);
        expect(bases).toEqual([0, POLY_WIDTH]);
        // b's header (2 segments, open) sits at its base
        expect(Array.from(poly.subarray(POLY_WIDTH * 4, POLY_WIDTH * 4 + 2))).toEqual([2, 0]);
        expect(Array.from(poly.subarray(0, 4))).toEqual([0, 0, 10, 0]);
    });

    it('writes the matrix, path base and premultiplied tint of an object', () => {
        const table = new Float32Array(2 * TABLE_TEXELS * 4);
        const m = new Matrix(2, 0.5, -0.5, 2, 30, 40);

        // abgr: alpha 0x80, blue 0x00, green 0xff, red 0x40
        writeObject(table, 1, m, 256, 0x80_00_ff_40);
        const row = Array.from(table.subarray(12, 24));

        expect(row.slice(0, 8)).toEqual([2, 0.5, -0.5, 2, 30, 40, 256, 0]);
        const alpha = 0x80 / 255;

        expect(row[8]).toBeCloseTo((0x40 / 255) * alpha);
        expect(row[9]).toBeCloseTo(alpha);
        expect(row[10]).toBe(0);
        expect(row[11]).toBeCloseTo(alpha);
    });

    it('compares settings', () => {
        expect(sameSettings([1, 1, 1, 0], [1, 1, 1, 5])).toBe(true);
        expect(sameSettings([1, 2, 1], [1, 1, 1])).toBe(false);
    });
});

describe('SilkPipe bookkeeping', () => {
    afterEach(() => {
        SilkGraphics._pipeId = 'mesh';
    });

    it('turns batching on for objects created afterwards', () => {
        const before = new SilkGraphics();

        enableSilkBatching();
        expect(before.renderPipeId).toBe('mesh');
        expect(new SilkGraphics().renderPipeId).toBe('silk');
        expect(new SilkGraphics({ batch: false }).renderPipeId).toBe('mesh');
    });

    it('puts consecutive compatible objects into one draw', () => {
        const { renderer, log } = fakeRenderer();
        const pipe = new SilkPipe(renderer);
        const set = new InstructionSet();
        const [a, b, c] = [new SilkGraphics(), new SilkGraphics(), new SilkGraphics({ aaWidth: 2 })];

        pipe.addRenderable(a, set);
        pipe.addRenderable(b, set);
        pipe.addRenderable(c, set);
        expect(set.instructionSize).toBe(2);
        expect((set.instructions[0] as unknown as Batch).items).toEqual([a, b]);
        expect((set.instructions[1] as unknown as Batch).items).toEqual([c]);
        expect(log.filter((l) => l === 'break')).toHaveLength(3);
    });

    it('starts a new draw after another instruction or another blend mode', () => {
        const { renderer } = fakeRenderer();
        const pipe = new SilkPipe(renderer);
        const set = new InstructionSet();
        const [a, b, c] = [new SilkGraphics(), new SilkGraphics(), new SilkGraphics()];

        pipe.addRenderable(a, set);
        set.add({ renderPipeId: 'filter', action: 'pushFilter', canBundle: false } as never);
        pipe.addRenderable(b, set);
        // Pixi resolves the blend mode down the tree before it builds instructions
        c.groupBlendMode = 'add';
        pipe.addRenderable(c, set);
        expect(set.instructionSize).toBe(4);
    });

    it('reuses its batches when the instruction set is rebuilt', () => {
        const { renderer } = fakeRenderer();
        const pipe = new SilkPipe(renderer);
        const set = new InstructionSet();
        const [a, b] = [new SilkGraphics(), new SilkGraphics({ aaWidth: 3 })];

        pipe.addRenderable(a, set);
        pipe.addRenderable(b, set);
        const first = [set.instructions[0], set.instructions[1]];

        set.reset();
        pipe.addRenderable(b, set);
        pipe.addRenderable(a, set);
        expect(set.instructions[0]).toBe(first[0]);
        expect(set.instructions[1]).toBe(first[1]);
        expect((set.instructions[0] as unknown as Batch).items).toEqual([b]);
        pipe.destroyInstructionSet(set);
        pipe.destroy();
    });

    it('hands objects to the mesh pipe on renderers it cannot batch for', () => {
        const { renderer, log } = fakeRenderer(RendererType.WEBGPU);
        const pipe = new SilkPipe(renderer);
        const set = new InstructionSet();
        const g = new SilkGraphics();

        pipe.addRenderable(g, set);
        pipe.updateRenderable(g);
        pipe.execute(g);
        expect(log).toEqual(['mesh', 'mesh-update', 'mesh-execute']);
    });
});
