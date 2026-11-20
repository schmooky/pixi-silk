import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A stand-in Application: `init` fails on WebGPU when the test says so, and records each call.
const calls: { preference: unknown }[] = [];
let failWebGPU = false;
let webGLVersion = 2;

vi.mock('pixi.js', () => {
    class Application {
        renderer = { name: 'webgl', resize: () => {}, events: {}, context: { webGLVersion: 2 } };
        screen = { width: 1, height: 1 };
        canvas = { style: {} as Record<string, string>, getBoundingClientRect: () => ({ width: 1, height: 1 }) };
        destroyed = false;
        async init(options: { preference?: unknown }) {
            calls.push({ preference: options.preference });
            if (failWebGPU && options.preference === 'webgpu') throw new Error('no WebGPU context');
            this.renderer.name = 'webgl';
            this.renderer.context.webGLVersion = webGLVersion;
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
    webGLVersion = 2;
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

    it('calls the webgl1 option when Pixi starts WebGL1, and only then', async () => {
        const webgl1 = vi.fn();

        await createSilkApp({ parent, webgl1 });
        expect(webgl1).not.toHaveBeenCalled();
        webGLVersion = 1;
        const silk = await createSilkApp({ parent, webgl1 });

        expect(webgl1).toHaveBeenCalledWith(silk.app.renderer);
    });

    it('logs an error on WebGL1 without the webgl1 option', async () => {
        webGLVersion = 1;
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});

        await createSilkApp({ parent });
        expect(error).toHaveBeenCalledOnce();
        expect(String(error.mock.calls[0][0])).toContain('pixi-silk/webgl1');
        error.mockRestore();
    });
});
