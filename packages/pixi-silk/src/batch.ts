import {
    BindGroup,
    type BLEND_MODES,
    BufferImageSource,
    ExtensionType,
    type Instruction,
    type InstructionSet,
    Matrix,
    type Mesh,
    type Renderer,
    RendererType,
    type RenderPipe,
    type Shader,
    State,
    UniformGroup,
    type WebGLRenderer,
    type WebGPURenderer,
} from 'pixi.js';
import { POLY_WIDTH, STRIDE } from './constants';
import { SilkGeometry, SilkGraphics } from './SilkGraphics';
import { createSilkShader } from './shader';
import { silkGpu } from './shader-slot';

/*
 * Batching across objects. Consecutive SilkGraphics with the same blend mode and settings render
 * in one instanced draw: their instances are copied into one buffer, each tagged with its object
 * index (aFx.w). The vertex shader reads that object's matrix, tint and path-texel base from an
 * object table texture. Path texels are copied into one shared texture at that base.
 *
 * WebGL2 and WebGPU share all of it: the packing, the textures and the shader resources. Only the
 * bind groups of Pixi's global and local uniforms differ: GL binds them by name, WebGPU by group.
 */

/** Texels per object in the object table: matrix (a, b, c, d), (tx, ty, path base, 0), tint. */
export const TABLE_TEXELS = 3;
/** Width of the object table texture. */
const TABLE_WIDTH = 1024;

/** What a batch copies from one SilkGraphics. */
export interface BatchSource {
    /** Instance data, STRIDE floats per instance. */
    f: Float32Array;
    /** Instances. */
    count: number;
    /** Path texels, 4 floats each. */
    poly: Float32Array;
    /** Path texels in use. */
    polyCount: number;
}

/** Sizes of a packed batch. */
export interface BatchSize {
    /** Instances in all. */
    instances: number;
    /** Path texels in all. */
    texels: number;
}

/** Returns `a` when it holds `n` floats, or a copy grown to at least `n` (doubling). */
export function grow(a: Float32Array, n: number): Float32Array {
    if (a.length >= n) return a;
    const bigger = new Float32Array(Math.max(n, a.length * 2));

    bigger.set(a);

    return bigger;
}

/**
 * Counts the instances and path texels of `sources`. Path texels round up to whole rows of the
 * path texture, so every object's texels start on a row of their own.
 */
export function measureBatch(sources: readonly BatchSource[]): BatchSize {
    let instances = 0;
    let texels = 0;

    for (const s of sources) {
        instances += s.count;
        texels += Math.ceil(s.polyCount / POLY_WIDTH) * POLY_WIDTH;
    }

    return { instances, texels };
}

/**
 * Copies the instances of every source into `out`, tagging each with its object index + 1 in
 * `aFx.w`, and the path texels into `poly`. Writes each object's path base into `bases`.
 * The arrays must be large enough ({@link measureBatch}).
 */
export function packBatch(
    sources: readonly BatchSource[],
    out: Float32Array,
    poly: Float32Array,
    bases: number[],
): BatchSize {
    let o = 0;
    let t = 0;

    sources.forEach((s, i) => {
        const n = s.count * STRIDE;

        out.set(s.f.subarray(0, n), o);
        for (let k = o + STRIDE - 1; k < o + n; k += STRIDE) out[k] = i + 1;
        o += n;
        bases[i] = t;
        if (s.polyCount > 0) {
            poly.set(s.poly.subarray(0, s.polyCount * 4), t * 4);
            t += Math.ceil(s.polyCount / POLY_WIDTH) * POLY_WIDTH;
        }
    });

    return { instances: o / STRIDE, texels: t };
}

/** Writes one object's row of the object table: its 2x3 matrix, path base and premultiplied tint. */
export function writeObject(
    table: Float32Array,
    i: number,
    m: { a: number; b: number; c: number; d: number; tx: number; ty: number },
    base: number,
    abgr: number,
): void {
    const o = i * TABLE_TEXELS * 4;
    const alpha = ((abgr >>> 24) & 255) / 255;

    table[o] = m.a;
    table[o + 1] = m.b;
    table[o + 2] = m.c;
    table[o + 3] = m.d;
    table[o + 4] = m.tx;
    table[o + 5] = m.ty;
    table[o + 6] = base;
    table[o + 7] = 0;
    table[o + 8] = ((abgr & 255) / 255) * alpha;
    table[o + 9] = (((abgr >>> 8) & 255) / 255) * alpha;
    table[o + 10] = (((abgr >>> 16) & 255) / 255) * alpha;
    table[o + 11] = alpha;
}

/** Whether two settings arrays (dither, aaWidth, minStrokePx) match, so their objects can share a draw. */
export function sameSettings(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
    return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

function dataTexture(label: string, width: number): BufferImageSource {
    return new BufferImageSource({
        resource: new Float32Array(width * 4),
        width,
        height: 1,
        format: 'rgba32float',
        alphaMode: 'premultiplied-alpha',
        scaleMode: 'nearest',
        autoGenerateMipmaps: false,
        label,
    });
}

/** Uploads `data` into `src`, `width` texels per row, resizing it when the row count changes. */
function upload(src: BufferImageSource, data: Float32Array, texels: number, width: number): void {
    const rows = Math.max(1, Math.ceil(texels / width));
    const view = data.subarray(0, rows * width * 4);

    if (src.height !== rows || (src.resource as Float32Array).length !== view.length) {
        src.resource = view;
        src.resize(width, rows);
    } else src.resource = view;
    src.update();
}

/** @internal One draw: a run of consecutive SilkGraphics. */
class SilkBatch implements Instruction {
    readonly renderPipeId = 'silk';
    readonly canBundle = false;
    /** Position in its instruction set, to tell a rebuild of the set from more of the same build. */
    index = -1;
    items: SilkGraphics[] = [];
    blendMode: BLEND_MODES = 'normal';
    settings = new Float32Array(3);
    readonly geometry = new SilkGeometry();
    readonly polys = dataTexture('silk-batch-paths', POLY_WIDTH);
    readonly table = dataTexture('silk-batch-objects', TABLE_WIDTH);
    readonly state = State.for2d();
    shader: Shader | null = null;
    data: Float32Array = new Float32Array(STRIDE * 64);
    polyData: Float32Array = new Float32Array(POLY_WIDTH * 4);
    tableData: Float32Array = new Float32Array(TABLE_WIDTH * 4);
    /** What was packed last time: the items and their versions. */
    packed: SilkGraphics[] = [];
    versions: number[] = [];
    bases: number[] = [];
    instances = 0;

    destroy(): void {
        this.geometry.destroy(true);
        this.shader?.destroy();
        this.polys.destroy();
        this.table.destroy();
        this.items = [];
        this.packed = [];
    }
}

/** Pixi's mesh pipe takes any Mesh: SilkGraphics is one, with its own geometry type. */
const asMesh = (g: SilkGraphics): Mesh => g as unknown as Mesh;

interface SetRecord {
    batches: SilkBatch[];
    used: number;
}

/**
 * Render pipe that draws runs of consecutive SilkGraphics in one instanced draw call, under WebGL2
 * and WebGPU. {@link enableSilkBatching} installs it.
 */
export class SilkPipe implements RenderPipe<SilkGraphics> {
    /** Pixi extension metadata, for `extensions.add(SilkPipe)` if you register it yourself. */
    static extension: {
        /** Renderer pipe lists the pipe joins. */
        type: ExtensionType[];
        /** Key in `renderer.renderPipes`, and the `renderPipeId` of batched objects. */
        name: string;
    } = {
        type: [ExtensionType.WebGLPipes, ExtensionType.WebGPUPipes],
        name: 'silk',
    };

    private _renderer: Renderer;
    private _sets = new Map<number, SetRecord>();
    private readonly _local = new UniformGroup({
        uTransformMatrix: { value: new Matrix(), type: 'mat3x3<f32>' },
        uColor: { value: new Float32Array([1, 1, 1, 1]), type: 'vec4<f32>' },
        uRound: { value: 0, type: 'f32' },
    });
    private readonly _localGroup = new BindGroup({ 0: this._local });

    /** Created once per renderer, by the pipe that `enableSilkBatching()` installs or by Pixi's extensions. */
    constructor(renderer: Renderer) {
        this._renderer = renderer;
    }

    /**
     * Whether this renderer batches. WebGPU needs the WGSL program (`enableWebGPU()`), or the batch
     * would have no program to draw with: without it, objects go to the mesh pipe as before.
     */
    private get _batching(): boolean {
        return this._renderer.type === RendererType.WEBGL || silkGpu.program !== null;
    }

    /** Adds `g` to the current run when it can share its draw, or starts a new run. */
    addRenderable(g: SilkGraphics, set: InstructionSet): void {
        const pipes = this._renderer.renderPipes;

        if (!this._batching) {
            pipes.mesh.addRenderable(asMesh(g), set);

            return;
        }
        // whatever Pixi was batching before this object draws first
        pipes.batch.break(set);
        const last = set.instructions[set.instructionSize - 1];
        const settings = g._settings;

        if (
            last instanceof SilkBatch &&
            last.index === set.instructionSize - 1 &&
            last.blendMode === g.groupBlendMode &&
            sameSettings(last.settings, settings)
        ) {
            last.items.push(g);

            return;
        }
        const batch = this._next(set);

        batch.items.length = 0;
        batch.items.push(g);
        batch.blendMode = g.groupBlendMode;
        batch.settings.set(settings.subarray(0, 3));
        batch.index = set.instructionSize;
        set.add(batch);
    }

    /** Nothing to do: a batch reads every object again when it draws. */
    updateRenderable(g: SilkGraphics): void {
        if (!this._batching) this._renderer.renderPipes.mesh.updateRenderable(asMesh(g));
    }

    /** A batch never needs a rebuild for changes inside its objects. */
    validateRenderable(g: SilkGraphics): boolean {
        return this._batching ? false : this._renderer.renderPipes.mesh.validateRenderable(asMesh(g));
    }

    /** Draws a batch, or hands a single object to the mesh pipe. */
    execute(instruction: Instruction): void {
        if (instruction instanceof SilkBatch) this._draw(instruction);
        else this._renderer.renderPipes.mesh.execute(asMesh(instruction as SilkGraphics));
    }

    /** Frees the batches of an instruction set that Pixi no longer uses. */
    destroyInstructionSet(set: InstructionSet): void {
        const rec = this._sets.get(set.uid);

        if (!rec) return;
        for (const b of rec.batches) b.destroy();
        this._sets.delete(set.uid);
    }

    /** @ignore */
    destroy(): void {
        for (const rec of this._sets.values()) for (const b of rec.batches) b.destroy();
        this._sets.clear();
        this._renderer = null as unknown as Renderer;
    }

    /** The next batch of a set's pool. A set that is being rebuilt starts its pool over. */
    private _next(set: InstructionSet): SilkBatch {
        let rec = this._sets.get(set.uid);

        if (!rec) {
            rec = { batches: [], used: 0 };
            this._sets.set(set.uid, rec);
        }
        const prev = rec.used > 0 ? rec.batches[rec.used - 1] : null;

        if (prev && !(prev.index < set.instructionSize && set.instructions[prev.index] === prev)) rec.used = 0;
        let batch = rec.batches[rec.used];

        if (!batch) {
            batch = new SilkBatch();
            rec.batches.push(batch);
        }
        rec.used++;

        return batch;
    }

    private _draw(b: SilkBatch): void {
        const items = b.items.filter((g) => !g.destroyed && g.isRenderable && g.primitiveCount > 0);

        if (!items.length) return;
        // instances and path texels: packed again only when an object or the list changed
        let dirty = items.length !== b.packed.length;

        for (let i = 0; !dirty && i < items.length; i++) {
            dirty = items[i] !== b.packed[i] || items[i]._version !== b.versions[i];
        }
        if (dirty) {
            const sources = items.map((g) => g._batchSource);
            const size = measureBatch(sources);

            b.data = grow(b.data, Math.max(size.instances, 1) * STRIDE);
            b.polyData = grow(b.polyData, Math.max(size.texels, POLY_WIDTH) * 4);
            const packed = packBatch(sources, b.data, b.polyData, b.bases);

            b.instances = packed.instances;
            b.geometry.instanceBuffer.data = b.data;
            b.geometry.instanceBuffer.update(packed.instances * STRIDE * 4);
            b.geometry.instanceCount = packed.instances;
            upload(b.polys, b.polyData, packed.texels, POLY_WIDTH);
            b.packed = items;
            b.versions = items.map((g) => g._version);
        }
        // matrices and tints change every frame without a version bump
        b.tableData = grow(b.tableData, Math.ceil((items.length * TABLE_TEXELS) / TABLE_WIDTH) * TABLE_WIDTH * 4);
        items.forEach((g, i) => {
            writeObject(b.tableData, i, g.groupTransform, b.bases[i], g.groupColorAlpha);
        });
        upload(b.table, b.tableData, items.length * TABLE_TEXELS, TABLE_WIDTH);

        if (!b.shader) {
            const [dither, aaWidth, minStrokePx] = b.settings;

            b.shader = createSilkShader({ dither, aaWidth, minStrokePx }, b.polys, b.table);
        }
        const shader = b.shader;
        const silk = (shader.resources.silkUniforms as UniformGroup).uniforms.uSilk as Float32Array;

        if (!sameSettings(silk, b.settings)) {
            silk.set(b.settings);
            (shader.resources.silkUniforms as UniformGroup).update();
        }
        b.state.blendMode = b.blendMode;
        if (this._renderer.type === RendererType.WEBGPU) {
            // WGSL groups 0 and 1: Pixi's globals, and identity local uniforms (the object table moves objects)
            const renderer = this._renderer as WebGPURenderer;

            shader.groups[0] = renderer.globalUniforms.bindGroup;
            shader.groups[1] = renderer.renderPipes.uniformBatch.getUniformBindGroup(this._local, true);
            renderer.encoder.draw({ geometry: b.geometry, shader, state: b.state });
        } else {
            const renderer = this._renderer as WebGLRenderer;

            shader.groups[100] = renderer.globalUniforms.bindGroup;
            shader.groups[101] = this._localGroup;
            renderer.encoder.draw({ geometry: b.geometry, shader, state: b.state });
        }
    }
}

/**
 * Turns on batching across objects, which is off by default. Runs of consecutive SilkGraphics with
 * the same blend mode and settings then render in one draw call. Only objects created after the
 * call take part, and an object with `batch: false` never does. There is no call to turn it off. Each renderer gets
 * the pipe the first time it draws one of them, so you can call it before or after creating the
 * Application. It is safe to call again.
 *
 * It works with WebGL2 and with WebGPU. On WebGPU, call `enableWebGPU()` too ({@link createSilkApp}
 * does it for you), or objects draw one call each, as without batching.
 *
 * @example
 * ```ts
 * import { enableSilkBatching, SilkGraphics } from 'pixi-silk';
 *
 * enableSilkBatching();
 * const app = new Application();
 * await app.init();
 * ```
 */
export function enableSilkBatching(): void {
    SilkGraphics._pipeId = 'silk';
    SilkGraphics._installPipe ??= (renderer) => {
        (renderer.renderPipes as unknown as Record<string, unknown>).silk = new SilkPipe(renderer);
    };
}
