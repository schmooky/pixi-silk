import { BufferImageSource, Container, ImageSource, Mesh, Sprite, Texture, type TextureSource } from 'pixi.js';
import type { RunSprite, SilkBackend, TextBufferHandle } from '../backend';
import { INSTANCE_FLOATS } from '../layout';
import { STYLE_FLOATS } from '../theme';
import { MessageGeometry } from './geometry';
import { createMessageShader } from './shader';

/**
 * Style rows on the GPU: an RGBA32F texture, 8 texels per row and 64 rows per texture row, as
 * `packStyle` packs them. The `writeStyleRows` part of {@link SilkBackend}, one per theme.
 */
export class PixiStyleRows implements Pick<SilkBackend, 'writeStyleRows'> {
    /** The texture the message shader reads. */
    readonly source: BufferImageSource = new BufferImageSource({
        resource: new Float32Array(512 * 4),
        width: 512,
        height: 1,
        format: 'rgba32float',
        alphaMode: 'premultiplied-alpha',
        scaleMode: 'nearest',
        autoGenerateMipmaps: false,
        label: 'silk-message-styles',
    });

    writeStyleRows(firstRow: number, rows: Float32Array): void {
        const src = this.source;
        const need = Math.max(1, Math.ceil((firstRow * STYLE_FLOATS + rows.length) / (512 * 4)));

        if (src.height < need) {
            const grown = new Float32Array(need * 512 * 4);

            grown.set(src.resource as Float32Array);
            src.resource = grown;
            src.resize(512, need);
        }
        (src.resource as Float32Array).set(rows, firstRow * STYLE_FLOATS);
        src.update();
    }
}

interface BufferState {
    geometry: MessageGeometry;
    styles: TextureSource | null;
    sprites: Map<number, Container>;
}

/**
 * The PixiJS {@link SilkBackend} (brief sec. 2.3): atlas pages as textures, style rows as a data
 * texture, text buffers as instanced geometries, run sprites as one-glyph meshes drawn by the
 * message shader. `Silk` drives it. The core never touches Pixi.
 */
export class PixiBackend implements SilkBackend {
    /** Atlas pages by id. */
    readonly pages: Map<number, TextureSource> = new Map();
    /** The default style rows (themes keep their own, see `SilkTheme`). */
    readonly styleRows: PixiStyleRows = new PixiStyleRows();
    private readonly _buffers = new Map<number, BufferState>();
    private _next = 1;

    uploadAtlasPage(
        page: number,
        source: Uint8Array | ImageBitmap,
        width: number,
        height: number,
        kind: 'msdf' | 'sdf' | 'mtsdf',
    ): void {
        this.pages.get(page)?.destroy();
        // distances must reach the shader unchanged: no premultiplied alpha, linear filtering
        const texture =
            source instanceof Uint8Array
                ? new BufferImageSource({
                      resource: source,
                      width,
                      height,
                      format: 'rgba8unorm',
                      alphaMode: 'no-premultiply-alpha',
                      scaleMode: 'linear',
                      autoGenerateMipmaps: false,
                      label: `silk-page-${page}-${kind}`,
                  })
                : new ImageSource({
                      resource: source,
                      alphaMode: 'no-premultiply-alpha',
                      scaleMode: 'linear',
                      autoGenerateMipmaps: false,
                      label: `silk-page-${page}-${kind}`,
                  });

        this.pages.set(page, texture);
    }

    /** Destroys a page no bundle uses any more. Not part of {@link SilkBackend}. */
    removeAtlasPage(page: number): void {
        this.pages.get(page)?.destroy();
        this.pages.delete(page);
    }

    writeStyleRows(firstRow: number, rows: Float32Array): void {
        this.styleRows.writeStyleRows(firstRow, rows);
    }

    createTextBuffer(capacityGlyphs: number): TextBufferHandle {
        const id = this._next++;

        this._buffers.set(id, { geometry: new MessageGeometry(capacityGlyphs), styles: null, sprites: new Map() });
        return { id };
    }

    /** The geometry of a text buffer, for the mesh that draws it. */
    geometry(handle: TextBufferHandle): MessageGeometry {
        return this._state(handle).geometry;
    }

    /** The style texture the buffer's run sprites read (its message's theme). */
    bindStyles(handle: TextBufferHandle, styles: TextureSource): void {
        this._state(handle).styles = styles;
    }

    /**
     * Writes instances from `firstGlyph` on. Writing from 0 also sets the instance count to what
     * was written. A later write (a number slot's range) keeps the count.
     */
    writeInstances(handle: TextBufferHandle, firstGlyph: number, data: ArrayBufferView): void {
        const { geometry } = this._state(handle);
        const floats = new Float32Array(data.buffer, data.byteOffset, data.byteLength >> 2);
        const buffer = geometry.instances;
        const end = firstGlyph * INSTANCE_FLOATS + floats.length;
        let target = buffer.data as Float32Array;

        if (target.length < end) {
            const grown = new Float32Array(Math.max(end, target.length * 2));

            grown.set(target);
            target = grown;
            buffer.data = target;
        }
        target.set(floats, firstGlyph * INSTANCE_FLOATS);
        if (firstGlyph === 0) geometry.instanceCount = floats.length / INSTANCE_FLOATS;
        buffer.update(Math.max(end, geometry.instanceCount * INSTANCE_FLOATS) * 4);
    }

    setRunSprite(handle: TextBufferHandle, slot: number, sprite: RunSprite | null): void {
        const state = this._state(handle);

        state.sprites.get(slot)?.destroy({ children: true });
        state.sprites.delete(slot);
        if (!sprite || !state.styles) return;
        state.sprites.set(slot, runSpriteView(sprite, state.styles));
    }

    /** The display object of a run sprite, positioned with the pen at 0, 0 on the baseline. */
    runSprite(handle: TextBufferHandle, slot: number): Container | undefined {
        return this._state(handle).sprites.get(slot);
    }

    destroyTextBuffer(handle: TextBufferHandle): void {
        const state = this._buffers.get(handle.id);

        if (!state) return;
        for (const view of state.sprites.values()) view.destroy({ children: true });
        state.geometry.destroy();
        this._buffers.delete(handle.id);
    }

    private _state(handle: TextBufferHandle): BufferState {
        const state = this._buffers.get(handle.id);

        if (!state) throw new Error(`pixi-silk: text buffer ${handle.id} was destroyed`);
        return state;
    }
}

/** A run sprite as one glyph of a one-glyph `sdf` page, plus its emoji bitmap on top. */
function runSpriteView(sprite: RunSprite, styles: TextureSource): Container {
    const { width, height, scale: s, left, top } = sprite;
    const view = new Container({ label: 'silk-text-slot' });
    const page = new BufferImageSource({
        resource: sprite.pixels,
        width,
        height,
        format: 'r8unorm',
        scaleMode: 'linear',
        autoGenerateMipmaps: false,
        label: 'silk-run-sprite',
    });
    // glyph 1: local pixels are its font units, atlas pixels per unit is the raster scale
    const metrics = new BufferImageSource({
        resource: new Float32Array([
            ...new Float32Array(12),
            0,
            0,
            0,
            width,
            height,
            left,
            top - height / s,
            left + width / s,
            top,
            s,
            0,
            0,
        ]),
        width: 6,
        height: 1,
        format: 'rgba32float',
        alphaMode: 'premultiplied-alpha',
        scaleMode: 'nearest',
        autoGenerateMipmaps: false,
        label: 'silk-run-sprite-metrics',
    });
    const geometry = new MessageGeometry(1);

    // pen at 0 on the baseline, scale 1, glyph 1, the slot's style row
    (geometry.instances.data as Float32Array).set([0, 0, 1, 1, sprite.row, 0, sprite.size, 0]);
    geometry.instances.update();
    geometry.instanceCount = 1;
    view.addChild(
        new Mesh({
            geometry,
            shader: createMessageShader({
                metrics,
                styles,
                pages: [page],
                pageInfo: [new Float32Array([width, height, sprite.range, 1])],
            }),
        }),
    );
    if (sprite.color) {
        const bitmap = new BufferImageSource({
            resource: sprite.color,
            width,
            height,
            format: 'rgba8unorm',
            alphaMode: 'premultiply-alpha-on-upload',
            scaleMode: 'linear',
            label: 'silk-run-emoji',
        });
        const emoji = new Sprite(new Texture({ source: bitmap }));

        emoji.position.set(left, -top);
        emoji.scale.set(1 / s);
        view.addChild(emoji);
    }
    view.on('destroyed', () => {
        page.destroy();
        metrics.destroy();
        geometry.destroy();
    });

    return view;
}
