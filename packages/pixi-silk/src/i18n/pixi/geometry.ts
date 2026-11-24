import { Buffer, BufferUsage, Geometry } from 'pixi.js';
import { INSTANCE_FLOATS } from '../layout';

/**
 * The geometry of a SilkMessage's text buffer: one unit quad, and one instance (`INSTANCE_FLOATS`
 * floats) per glyph or line. `PixiBackend` owns it. You rarely need it directly.
 */
export class MessageGeometry extends Geometry {
    /** Instance data, `INSTANCE_FLOATS` floats per instance. */
    readonly instances: Buffer;

    /** Makes room for `capacity` instances. The buffer grows when more are written. */
    constructor(capacity: number = 16) {
        const instances = new Buffer({
            data: new Float32Array(INSTANCE_FLOATS * Math.max(1, capacity)),
            usage: BufferUsage.VERTEX | BufferUsage.COPY_DST,
            label: 'silk-message-instances',
            shrinkToFit: false,
        });
        const inst = (offset: number) => ({
            buffer: instances,
            format: 'float32x4' as const,
            stride: INSTANCE_FLOATS * 4,
            offset,
            instance: true,
        });

        super({
            attributes: {
                aCorner: {
                    buffer: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
                    format: 'float32x2',
                    stride: 8,
                    offset: 0,
                },
                aInst0: inst(0),
                aInst1: inst(16),
            },
            indexBuffer: new Uint16Array([0, 1, 2, 0, 2, 3]),
            instanceCount: 0,
        });
        this.instances = instances;
    }
}
