import Editor, { type OnMount } from '@monaco-editor/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** One runnable module: a docs demo or a lab experiment. */
export interface StudioEntry {
    /** `demo:<name>` or `lab:<slug>`, also the URL query (`?demo=` / `?lab=`). */
    id: string;
    kind: 'demo' | 'lab';
    /** File name without extension. */
    name: string;
    title: string;
}

/** Entries grouped the way the docs read: area, then page. */
export interface StudioGroup {
    area: string;
    pages: { title: string; href: string; entries: StudioEntry[] }[];
}

const demoSources = import.meta.glob<string>('../../demos/*.demo.ts', { query: '?raw', import: 'default' });
const labSources = import.meta.glob<string>('../../lab/[0-9]*.ts', { query: '?raw', import: 'default' });

const sourceOf = (e: StudioEntry) =>
    (e.kind === 'demo' ? demoSources[`../../demos/${e.name}.demo.ts`] : labSources[`../../lab/${e.name}.ts`])?.();
const fileOf = (e: StudioEntry) => (e.kind === 'demo' ? `src/demos/${e.name}.demo.ts` : `src/lab/${e.name}.ts`);

type Status = { state: 'idle' | 'running' | 'ok' } | { state: 'error'; message: string };

/**
 * Code next to canvas for every demo and lab experiment. Edits run in a sandboxed frame
 * (`/studio/run/`), each run on a fresh document. Edits stay per entry until reset.
 */
export default function Studio({ groups }: { groups: StudioGroup[] }) {
    const all = useMemo(
        () => groups.flatMap((g) => g.pages.flatMap((p) => p.entries.map((e) => ({ ...e, page: p, area: g.area })))),
        [groups],
    );
    const [current, setCurrent] = useState(() => {
        const q = new URLSearchParams(location.search);
        const id = q.has('lab') ? `lab:${q.get('lab')}` : `demo:${q.get('demo') ?? ''}`;

        return all.find((e) => e.id === id) ?? all[0];
    });
    const [original, setOriginal] = useState<Record<string, string>>({});
    const [edits, setEdits] = useState<Record<string, string>>({});
    const [status, setStatus] = useState<Status>({ state: 'idle' });
    const [run, setRun] = useState(0);
    const [auto, setAuto] = useState(true);
    const [copied, setCopied] = useState(false);
    const frame = useRef<HTMLIFrameElement>(null);
    const pending = useRef<string | null>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const code = edits[current.id] ?? original[current.id];
    const edited = edits[current.id] !== undefined && edits[current.id] !== original[current.id];

    // load the source of the selected entry once
    useEffect(() => {
        if (original[current.id] !== undefined) return;
        sourceOf(current)?.then((text) => setOriginal((o) => ({ ...o, [current.id]: text })));
    }, [current, original]);

    // keep the URL in step, so a link opens the same entry
    useEffect(() => {
        const url = new URL(location.href);

        url.search = `?${current.kind}=${current.name}`;
        history.replaceState(null, '', url);
        document.title = `${current.title}: Studio | pixi-silk`;
        listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' });
    }, [current]);

    const start = useCallback(() => {
        if (code === undefined) return;
        pending.current = code;
        setStatus({ state: 'running' });
        setRun((n) => n + 1);
    }, [code]);

    // the frame says `ready` on every load: hand it the code of this run
    useEffect(() => {
        const onMessage = (e: MessageEvent) => {
            if (e.origin !== location.origin || e.data?.source !== 'silk-studio') return;
            if (e.data.type === 'ready' && pending.current !== null) {
                frame.current?.contentWindow?.postMessage(
                    { type: 'run', kind: current.kind, code: pending.current },
                    location.origin,
                );
            } else if (e.data.type === 'ok') setStatus((s) => (s.state === 'error' ? s : { state: 'ok' }));
            else if (e.data.type === 'error') setStatus({ state: 'error', message: e.data.message });
        };

        addEventListener('message', onMessage);

        return () => removeEventListener('message', onMessage);
    }, [current.kind]);

    // run on open, and shortly after typing stops
    // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the code or the entry changes
    useEffect(() => {
        if (code === undefined) return;
        if (!edited) {
            start();

            return;
        }
        if (!auto) return;
        const t = setTimeout(start, 700);

        return () => clearTimeout(t);
    }, [current.id, code === undefined, edits[current.id], auto]);

    const onMount: OnMount = (editor, monaco) => {
        // the imports resolve at run time, not in the editor: keep it free of red squiggles
        monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
            noSemanticValidation: true,
            noSyntaxValidation: false,
        });
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () =>
            document.getElementById('studio-run')?.click(),
        );
    };

    const select = (id: string) => {
        const next = all.find((e) => e.id === id);

        if (next) setCurrent(next);
    };
    const copy = async () => {
        if (code === undefined) return;
        await navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
    };

    return (
        <div className="fixed inset-x-0 bottom-0 top-14 z-30 grid grid-rows-[auto_minmax(0,1fr)] bg-background lg:grid-cols-[230px_minmax(0,1fr)] lg:grid-rows-1">
            {/* entries: a list on wide screens, a menu on narrow ones */}
            <div className="border-b p-2 lg:hidden">
                <select
                    value={current.id}
                    onChange={(e) => select(e.target.value)}
                    className="w-full rounded-md border bg-card px-2 py-1.5 text-sm"
                    aria-label="Open a demo or experiment"
                >
                    {groups.map((g) =>
                        g.pages.map((p) => (
                            <optgroup key={`${g.area}/${p.title}`} label={`${g.area}: ${p.title}`}>
                                {p.entries.map((e) => (
                                    <option key={e.id} value={e.id}>
                                        {e.title}
                                    </option>
                                ))}
                            </optgroup>
                        )),
                    )}
                </select>
            </div>
            <nav
                ref={listRef}
                aria-label="Demos and experiments"
                className="hidden overflow-y-auto border-r py-3 text-sm lg:block"
            >
                {groups.map((g) => (
                    <div key={g.area} className="mb-4">
                        <div className="px-4 pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                            {g.area}
                        </div>
                        {g.pages.map((p) => (
                            <div key={p.href} className="mb-1">
                                <div className="px-4 pt-1 text-xs text-muted-foreground/80">{p.title}</div>
                                {p.entries.map((e) => (
                                    <button
                                        key={e.id}
                                        type="button"
                                        onClick={() => select(e.id)}
                                        aria-current={e.id === current.id}
                                        className={`block w-full truncate px-4 py-1 pl-6 text-left transition-colors ${
                                            e.id === current.id
                                                ? 'bg-accent font-medium text-foreground'
                                                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                                        }`}
                                    >
                                        {e.title}
                                        {edits[e.id] !== undefined && edits[e.id] !== original[e.id] && (
                                            <span className="ml-1 text-silk">•</span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        ))}
                    </div>
                ))}
            </nav>

            <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] xl:grid-cols-2 xl:grid-rows-[auto_minmax(0,1fr)]">
                <header className="col-span-full flex flex-wrap items-center gap-2 border-b px-3 py-2">
                    <div className="mr-auto min-w-0">
                        <div className="truncate text-sm font-semibold">{current.title}</div>
                        <div className="truncate font-mono text-[11px] text-muted-foreground">
                            {fileOf(current)} ·{' '}
                            <a href={current.page.href} className="hover:text-foreground hover:underline">
                                {current.page.title}
                            </a>
                        </div>
                    </div>
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
                        Run as I type
                    </label>
                    {edited && (
                        <button
                            type="button"
                            onClick={() => setEdits((x) => ({ ...x, [current.id]: original[current.id] }))}
                            className="rounded-md border px-2.5 py-1 text-xs hover:bg-accent"
                        >
                            Reset
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={copy}
                        className="rounded-md border px-2.5 py-1 text-xs hover:bg-accent"
                    >
                        {copied ? 'Copied' : 'Copy'}
                    </button>
                    {current.kind === 'lab' && (
                        <a
                            href={`/lab/${current.name}/`}
                            className="rounded-md border px-2.5 py-1 text-xs hover:bg-accent"
                        >
                            Full screen
                        </a>
                    )}
                    <button
                        id="studio-run"
                        type="button"
                        onClick={start}
                        className="rounded-md bg-foreground px-3 py-1 text-xs font-semibold text-background"
                    >
                        Run <span className="opacity-60">⌘↵</span>
                    </button>
                </header>

                <div className="min-h-[280px] border-b xl:border-b-0 xl:border-r">
                    {code === undefined ? (
                        <div className="p-4 font-mono text-xs text-muted-foreground">Loading source…</div>
                    ) : (
                        <Editor
                            key={current.id}
                            language="typescript"
                            theme="vs-dark"
                            value={code}
                            onChange={(v) => setEdits((x) => ({ ...x, [current.id]: v ?? '' }))}
                            onMount={onMount}
                            options={{
                                fontSize: 13,
                                minimap: { enabled: false },
                                scrollBeyondLastLine: false,
                                tabSize: 4,
                                automaticLayout: true,
                            }}
                        />
                    )}
                </div>

                <div className="relative min-h-[320px] bg-[#0b0b0d]">
                    <iframe
                        ref={frame}
                        key={run}
                        src={`/studio/run/?r=${run}`}
                        title={`${current.title}, live`}
                        className="absolute inset-0 h-full w-full border-0"
                    />
                    {status.state === 'error' && (
                        <pre className="absolute inset-x-0 bottom-0 max-h-[45%] overflow-auto border-t border-red-500/40 bg-[#1a0b0b]/95 p-3 font-mono text-[11px] leading-relaxed text-red-300">
                            {status.message}
                        </pre>
                    )}
                    {status.state === 'running' && (
                        <div className="pointer-events-none absolute right-3 top-3 font-mono text-[10px] uppercase tracking-wider text-white/40">
                            running
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
