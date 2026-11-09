import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A stand-in Application: `init` fails on WebGPU when the test says so, and records each call.
const calls: { preference: unknown }[] = [];
let failWebGPU = false;

vi.mock('pixi.js', () => {
    class Application {
        renderer = { name: 'webgl', resize: () => {}, events: {} };
        screen = { width: 1, height: 1 };
        canvas = { style: {} as Record<string, string>, getBoundingClientRect: () => ({ width: 1, height: 1 }) };
        destroyed = false;
        async init(options: { preference?: unknown }) {
            calls.push({ preference: options.preference });
            if (failWebGPU && options.preference === 'webgpu') throw new Error('no WebGPU context');
            this.renderer.name = 'webgl';
        }
        destroy() {
            this.destroyed = true;
        }
    }

    return { Application, Filter: { defaultOptions: {} } };
});

const { createSilkApp } = await import('../src/app');

const parent = { clientWidth: 10, clientHeight: 10, appendChild: () => {} } as unknown as HTMLElement;

beforeEach(() => {
    calls.length = 0;
    failWebGPU = false;
    vi.stubGlobal('window', {
        devicePixelRatio: 1,
        matchMedia: () => ({ addEventListener: () => {}, removeEventListener: () => {} }),
    });
    vi.stubGlobal('addEventListener', () => {});
    vi.stubGlobal(
        'ResizeObserver',
        class {
            observe() {}
            disconnect() {}
        },
    );
});

afterEach(() => vi.unstubAllGlobals());

describe('createSilkApp renderer fallback', () => {
    it('retries on WebGL2 when WebGPU fails to start', async () => {
        failWebGPU = true;
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const silk = await createSilkApp({ parent, preference: 'webgpu' });

        expect(calls.map((c) => c.preference)).toEqual(['webgpu', 'webgl']);
        expect(silk.app.renderer.name).toBe('webgl');
        expect(warn).toHaveBeenCalledOnce();
        warn.mockRestore();
    });

    it('does not retry when WebGL2 was asked for', async () => {
        failWebGPU = true;
        await createSilkApp({ parent });

        expect(calls.map((c) => c.preference)).toEqual(['webgl']);
    });
});
