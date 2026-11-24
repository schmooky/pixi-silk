import { TextureSource } from 'pixi.js';

/** One layer of a {@link PageArraySource}: an atlas page as decoded pixels. */
export interface PageLayer {
    /** A decoded image, or RGBA bytes. */
    pixels: ImageBitmap | Uint8Array;
    /** Width in pixels. */
    width: number;
    /** Height in pixels. */
    height: number;
}

/** The upload method id the uploaders below answer to. */
const METHOD = 'silk-page-array';

/**
 * Every atlas page of a bundle in one 2D array texture, layer = page slot, so a bundle can draw from
 * any number of pages in one draw call. Layers are as large as the largest page. Smaller pages sit
 * at the top left of theirs, which the shader allows for (it samples in atlas pixels). Needs WebGL2
 * or WebGPU, and the uploaders `installPageArrays` adds to the renderer.
 */
export class PageArraySource extends TextureSource<PageLayer[]> {
    override uploadMethodId: string = METHOD;

    constructor(layers: PageLayer[], label = 'silk-page-array') {
        super({
            resource: layers,
            width: Math.max(1, ...layers.map((l) => l.width)),
            height: Math.max(1, ...layers.map((l) => l.height)),
            format: 'rgba8unorm',
            arrayLayerCount: layers.length,
            viewDimension: '2d-array',
            alphaMode: 'no-premultiply-alpha',
            scaleMode: 'linear',
            autoGenerateMipmaps: false,
            label,
        });
    }
}

interface GlLike {
    TEXTURE_2D_ARRAY: number;
    RGBA: number;
    UNSIGNED_BYTE: number;
    texImage3D(...args: unknown[]): void;
    texSubImage3D(...args: unknown[]): void;
}

/** WebGL2 uploader: allocates the array, then writes each layer (bytes or a decoded image). */
const glUpload = {
    id: METHOD,
    upload(
        source: TextureSource,
        glTexture: { internalFormat: number; format: number; type: number },
        gl: unknown,
    ): void {
        const g = gl as GlLike;
        const layers = source.resource as PageLayer[];

        g.texImage3D(
            g.TEXTURE_2D_ARRAY,
            0,
            glTexture.internalFormat,
            source.pixelWidth,
            source.pixelHeight,
            layers.length,
            0,
            glTexture.format,
            glTexture.type,
            null,
        );
        layers.forEach((l, z) => {
            g.texSubImage3D(g.TEXTURE_2D_ARRAY, 0, 0, 0, z, l.width, l.height, 1, g.RGBA, g.UNSIGNED_BYTE, l.pixels);
        });
    },
};

interface GpuLike {
    device: {
        queue: {
            writeTexture(dest: object, data: Uint8Array, layout: object, size: object): void;
            copyExternalImageToTexture(src: object, dest: object, size: object): void;
        };
    };
}

/** WebGPU uploader: one copy per layer, no premultiplying. */
const gpuUpload = {
    type: METHOD,
    upload(source: TextureSource, gpuTexture: unknown, gpu: unknown): void {
        const g = gpu as GpuLike;

        (source.resource as PageLayer[]).forEach((l, z) => {
            const origin = { x: 0, y: 0, z };

            if (l.pixels instanceof Uint8Array) {
                g.device.queue.writeTexture(
                    { texture: gpuTexture, origin },
                    l.pixels,
                    { bytesPerRow: l.width * 4, rowsPerImage: l.height },
                    { width: l.width, height: l.height, depthOrArrayLayers: 1 },
                );
            } else {
                g.device.queue.copyExternalImageToTexture(
                    { source: l.pixels },
                    { texture: gpuTexture, origin, premultipliedAlpha: false },
                    { width: l.width, height: l.height },
                );
            }
        });
    },
};

/**
 * Adds the page array uploaders to a renderer's texture system. Returns false when the renderer
 * cannot draw array textures (WebGL1), so the caller keeps binding pages one by one.
 */
export function installPageArrays(renderer: unknown): boolean {
    const r = renderer as {
        name?: string;
        context?: { webGLVersion?: number };
        texture?: { _uploads?: Record<string, unknown> };
    };
    const uploads = r.texture?._uploads;

    if (!uploads) return false;
    if (r.name === 'webgl') {
        if (r.context?.webGLVersion !== 2) return false;
        uploads[METHOD] ??= glUpload;
        return true;
    }
    if (r.name === 'webgpu') {
        uploads[METHOD] ??= gpuUpload;
        return true;
    }

    return false;
}
