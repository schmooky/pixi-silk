import { useEffect, useRef, useState } from 'react';
import { type Control, type Demo, initialValues, type MountedDemo, mountDemo } from '@/demos/runtime';

/** Import failures after a deploy: the page asks for script files that no longer exist. */
const STALE =
    /Importing a module script failed|Failed to fetch dynamically imported module|error loading dynamically imported module/i;

// one lazily loaded chunk per demo
const modules = import.meta.glob<{ default: Demo }>('../../demos/*.demo.ts');

interface Props {
    name: string;
    height?: number;
    /** Accessible description of what the canvas shows. */
    label?: string;
    /** The demo has controls: the bar under the canvas is drawn before the module loads. */
    hasControls?: boolean;
    /** Studio URL of this demo. */
    studio?: string;
}

/**
 * Copies what the demo's canvases show into one 2D canvas, so the frame keeps its last picture
 * while the WebGL context is gone. A WebGL canvas keeps its pixels only until the next composite,
 * so this renders a frame first and copies it in the same task.
 */
function freeze(host: HTMLElement, mounted: MountedDemo): HTMLCanvasElement | null {
    const box = host.getBoundingClientRect();
    const sources = [...host.querySelectorAll('canvas')].filter((c) => !c.dataset.frozen);

    if (box.width === 0 || box.height === 0 || sources.length === 0) return null;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const out = document.createElement('canvas');
    const ctx = out.getContext('2d');

    if (!ctx) return null;
    out.width = Math.round(box.width * ratio);
    out.height = Math.round(box.height * ratio);
    out.dataset.frozen = 'true';
    out.setAttribute('aria-hidden', 'true');
    out.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
    try {
        mounted.silk.app.render();
        for (const c of sources) {
            const r = c.getBoundingClientRect();

            ctx.drawImage(c, (r.left - box.left) * ratio, (r.top - box.top) * ratio, r.width * ratio, r.height * ratio);
        }
    } catch {
        return null;
    }

    return out;
}

/**
 * Pixi's filter system keeps the last filter input bound in a bind group it never releases.
 * Destroying the app then frees that pooled texture under it and Pixi warns. Releasing the
 * bind group first keeps teardown quiet; the renderer is destroyed right after anyway.
 */
function releaseFilterBindings(mounted: MountedDemo) {
    try {
        const filter = (
            mounted.silk.app.renderer as unknown as { filter?: { _globalFilterBindGroup?: { destroy(): void } } }
        ).filter;

        filter?._globalFilterBindGroup?.destroy();
    } catch {
        // a renderer without a filter system has nothing to release
    }
}

/**
 * Live demo island: loads the demo module, mounts it only while it is near the viewport
 * (browsers allow ~16 WebGL contexts per page) and renders its controls. Scrolled away, the
 * frame keeps a still of its last frame.
 */
export default function DemoRunner({ name, height = 280, label, hasControls = false, studio }: Props) {
    const frame = useRef<HTMLDivElement>(null);
    const host = useRef<HTMLDivElement>(null);
    const mounted = useRef<MountedDemo | null>(null);
    const still = useRef<HTMLCanvasElement | null>(null);
    const values = useRef<Record<string, unknown>>({});
    const [demo, setDemo] = useState<Demo | null>(null);
    const [params, setParams] = useState<Record<string, unknown>>({});
    const [visible, setVisible] = useState(false);
    const [generation, setGeneration] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [live, setLive] = useState(false);

    useEffect(() => {
        const load = modules[`../../demos/${name}.demo.ts`];

        if (!load) {
            setError(`Unknown demo "${name}"`);

            return;
        }
        load().then(
            (m) => {
                values.current = initialValues(m.default.controls);
                setParams(values.current);
                setDemo(m.default);
            },
            // a script from before the last deploy: reload once (Base.astro), otherwise show the error
            (e: unknown) => {
                if (!window.silkRecover?.(e)) setError(String(e));
            },
        );
    }, [name]);

    useEffect(() => {
        const el = frame.current;

        if (!el) return;
        const io = new IntersectionObserver(([entry]) => setVisible(entry?.isIntersecting ?? false), {
            rootMargin: '400px 0px',
        });

        io.observe(el);

        return () => io.disconnect();
    }, []);

    // biome-ignore lint/correctness/useExhaustiveDependencies: bumping `generation` (Reset) remounts the demo
    useEffect(() => {
        const el = host.current;

        if (!demo || !visible || !el) return;
        let cancelled = false;
        let instance: MountedDemo | null = null;

        mountDemo(demo, el, values.current).then(
            (m) => {
                if (cancelled) {
                    releaseFilterBindings(m);
                    m.destroy();

                    return;
                }
                mounted.current = instance = m;
                // the live canvas is up: drop the still of the previous run
                still.current?.remove();
                still.current = null;
                setLive(true);
            },
            (e: unknown) => setError(String(e)),
        );

        return () => {
            cancelled = true;
            if (instance) {
                // keep a still of the last frame, stop the clock, then tear down
                const picture = freeze(el, instance);

                instance.pause(true);
                releaseFilterBindings(instance);
                instance.destroy();
                if (picture) {
                    still.current?.remove();
                    el.appendChild(picture);
                    still.current = picture;
                }
            }
            mounted.current = null;
            setLive(false);
        };
    }, [demo, visible, generation]);

    const set = (key: string, value: unknown) => {
        values.current = { ...values.current, [key]: value };
        setParams(values.current);
        mounted.current?.setParam(key, value);
    };
    const reset = () => {
        values.current = initialValues(demo?.controls);
        setParams(values.current);
        setGeneration((g) => g + 1);
    };
    const controls = Object.entries(demo?.controls ?? {});
    const bar = hasControls || controls.length > 0;

    return (
        <div ref={frame}>
            <div
                ref={host}
                role="img"
                aria-label={label}
                aria-busy={!live && !error}
                data-live={live || undefined}
                className="relative w-full overflow-hidden bg-demo"
                style={{ height }}
            >
                {!bar && studio && (
                    <a href={studio} className="demo-chip" title="Open this demo in Studio">
                        <StudioIcon />
                        Studio
                    </a>
                )}
                {error && (
                    <div className="absolute inset-0 z-[3] flex flex-col items-center justify-center gap-3 bg-demo p-4 text-center font-mono text-xs text-red-400">
                        {STALE.test(error) ? (
                            <>
                                <span className="text-white/60">
                                    The site was updated. Reload the page to run this demo.
                                </span>
                                <button
                                    type="button"
                                    onClick={() => location.reload()}
                                    className="rounded-md border border-white/20 px-3 py-1.5 text-white/80 hover:bg-white/10"
                                >
                                    Reload
                                </button>
                            </>
                        ) : (
                            error
                        )}
                    </div>
                )}
            </div>
            {bar && (
                <div className="demo-bar">
                    {controls.map(([key, control]) => (
                        <ControlInput
                            key={key}
                            name={key}
                            control={control}
                            value={params[key]}
                            onChange={(v) => set(key, v)}
                        />
                    ))}
                    <div className="ml-auto flex items-center gap-0.5">
                        <button type="button" onClick={reset} className="demo-icon-btn" title="Reset the demo">
                            <svg
                                viewBox="0 0 24 24"
                                className="h-3.5 w-3.5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                            >
                                <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                                <path d="M3 3v5h5" />
                            </svg>
                            <span>Reset</span>
                        </button>
                        {studio && (
                            <a
                                href={studio}
                                className="demo-icon-btn"
                                title="Open this demo in Studio"
                                aria-label="Open in Studio"
                            >
                                <StudioIcon />
                            </a>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function StudioIcon() {
    return (
        <svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M15 3h6v6" />
            <path d="M10 14 21 3" />
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        </svg>
    );
}

function ControlInput({
    name,
    control,
    value,
    onChange,
}: {
    name: string;
    control: Control;
    value: unknown;
    onChange: (v: unknown) => void;
}) {
    const label = control.label ?? name;

    if (control.type === 'range') {
        const v = Number(value);

        return (
            <label className="flex items-center gap-2">
                <span className="text-muted-foreground">{label}</span>
                <input
                    type="range"
                    min={control.min}
                    max={control.max}
                    step={control.step ?? 'any'}
                    value={v}
                    onChange={(e) => onChange(Number(e.target.value))}
                    className="w-24 accent-[hsl(var(--silk))] sm:w-28"
                />
                <span className="min-w-10 font-mono tabular-nums text-foreground">
                    {Number.isInteger(v) ? v : v.toFixed(2)}
                    {control.unit ?? ''}
                </span>
            </label>
        );
    }
    if (control.type === 'toggle') {
        return (
            <label className="flex cursor-pointer items-center gap-2">
                <input
                    type="checkbox"
                    checked={Boolean(value)}
                    onChange={(e) => onChange(e.target.checked)}
                    className="accent-[hsl(var(--silk))]"
                />
                <span className="text-muted-foreground">{label}</span>
            </label>
        );
    }

    return (
        <div className="flex items-center gap-2">
            <span className="text-muted-foreground">{label}</span>
            <div className="flex overflow-hidden rounded-md border">
                {control.options.map((option) => (
                    <button
                        key={option}
                        type="button"
                        onClick={() => onChange(option)}
                        aria-pressed={value === option}
                        className={`px-2 py-1 font-mono ${value === option ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-accent'}`}
                    >
                        {option}
                    </button>
                ))}
            </div>
        </div>
    );
}
