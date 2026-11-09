import Editor, { type BeforeMount, type OnMount } from '@monaco-editor/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** One runnable module: a docs demo or a lab experiment. */
export interface StudioEntry {
    /** `demo:<name>`, `lab:<slug>` or `card:<id>`, also the URL query (`?demo=`, `?lab=`, `?card=`). */
    id: string;
    /** A docs demo, a lab page, or one widget of a reference sheet. */
    kind: 'demo' | 'lab' | 'card';
    /** File name without extension. */
    name: string;
    title: string;
}

/** A reference sheet: its widgets, listed under the page that shows the sheet. */
export interface StudioSheet {
    title: string;
    href: string;
    entries: StudioEntry[];
}

/** A docs page and the demos it runs. */
export interface StudioPage {
    title: string;
    href: string;
    entries: StudioEntry[];
    sheets: StudioSheet[];
}

/** Entries grouped the way the docs read: section, area, then page. */
export interface StudioSection {
    title: string;
    areas: { title: string; pages: StudioPage[] }[];
}

type Located = StudioEntry & { page: { title: string; href: string }; where: string };

/** Does an entry match the filter? Every word must appear in its title, file, page or group. */
const matches = (words: string[], ...text: string[]) => {
    const hay = text.join(' ').toLowerCase();

    return words.every((w) => hay.includes(w));
};

const demoSources = import.meta.glob<string>('../../demos/*.demo.ts', { query: '?raw', import: 'default' });
const labSources = import.meta.glob<string>('../../lab/[0-9]*.ts', { query: '?raw', import: 'default' });
const cardSources = import.meta.glob<string>('../../lab/_cards/*.ts', { query: '?raw', import: 'default' });

const fileOf = (e: StudioEntry) =>
    e.kind === 'demo'
        ? `src/demos/${e.name}.demo.ts`
        : e.kind === 'card'
          ? `src/lab/_cards/${e.name}.ts`
          : `src/lab/${e.name}.ts`;
const sourceOf = (e: StudioEntry) =>
    (e.kind === 'demo' ? demoSources : e.kind === 'card' ? cardSources : labSources)[`../../${fileOf(e).slice(4)}`]?.();

type Status = { state: 'idle' | 'running' | 'ok' } | { state: 'error'; message: string };

/**
 * Code next to canvas for every demo and lab experiment. Edits run in a sandboxed frame
 * (`/studio/run/`), each run on a fresh document. Edits stay per entry until reset.
 */
export default function Studio({ sections, hidden = [] }: { sections: StudioSection[]; hidden?: StudioEntry[] }) {
    const all = useMemo<Located[]>(
        () => [
            ...sections.flatMap((s) =>
                s.areas.flatMap((a) =>
                    a.pages.flatMap((p) => [
                        ...p.entries.map((e) => ({ ...e, page: p, where: `${s.title} ${a.title}` })),
                        ...p.sheets.flatMap((sh) =>
                            sh.entries.map((e) => ({
                                ...e,
                                page: { title: sh.title, href: sh.href },
                                where: `${s.title} ${a.title} ${p.title}`,
                            })),
                        ),
                    ]),
                ),
            ),
            // experiments listed nowhere still open from a link
            ...hidden.map((e) => ({ ...e, page: { title: e.title, href: `/lab/${e.name}/` }, where: '' })),
        ],
        [sections, hidden],
    );
    const [current, setCurrent] = useState(() => {
        const q = new URLSearchParams(location.search);
        const id = q.has('lab')
            ? `lab:${q.get('lab')}`
            : q.has('card')
              ? `card:${q.get('card')}`
              : `demo:${q.get('demo') ?? ''}`;

        return all.find((e) => e.id === id) ?? all[0];
    });
    const [original, setOriginal] = useState<Record<string, string>>({});
    const [edits, setEdits] = useState<Record<string, string>>({});
    const [status, setStatus] = useState<Status>({ state: 'idle' });
    const [run, setRun] = useState(0);
    const [auto, setAuto] = useState(true);
    const [copied, setCopied] = useState(false);
    const [query, setQuery] = useState('');
    // narrow screens show one pane at a time
    const [pane, setPane] = useState<'code' | 'canvas'>('canvas');
    const [browse, setBrowse] = useState(false);
    const words = useMemo(() => query.trim().toLowerCase().split(/\s+/).filter(Boolean), [query]);
    const shown = useMemo(() => {
        if (words.length === 0) return sections;

        return sections
            .map((s) => ({
                ...s,
                areas: s.areas
                    .map((a) => ({
                        ...a,
                        pages: a.pages
                            .map((p) => ({
                                ...p,
                                entries: p.entries.filter((e) =>
                                    matches(words, s.title, a.title, p.title, e.title, e.name),
                                ),
                                sheets: p.sheets
                                    .map((sh) => ({
                                        ...sh,
                                        entries: sh.entries.filter((e) =>
                                            matches(words, s.title, a.title, p.title, sh.title, e.title, e.name),
                                        ),
                                    }))
                                    .filter((sh) => sh.entries.length > 0),
                            }))
                            .filter((p) => p.entries.length > 0 || p.sheets.length > 0),
                    }))
                    .filter((a) => a.pages.length > 0),
            }))
            .filter((s) => s.areas.length > 0);
    }, [sections, words]);
    // sheets are closed until opened, filtered, or holding the open entry
    const [openSheets, setOpenSheets] = useState<Record<string, boolean>>({});
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

    const beforeMount: BeforeMount = (monaco) => {
        // the site's own dark: the editor and the canvas read as one surface
        monaco.editor.defineTheme('silk', {
            base: 'vs-dark',
            inherit: true,
            rules: [
                { token: 'comment', foreground: '6b6b76', fontStyle: 'italic' },
                { token: 'keyword', foreground: 'c4a7ff' },
                { token: 'string', foreground: '9ee6b8' },
                { token: 'number', foreground: 'ffcf7a' },
                { token: 'type', foreground: '7cc7ff' },
            ],
            colors: {
                'editor.background': '#0b0b0d',
                'editor.lineHighlightBackground': '#ffffff08',
                'editorLineNumber.foreground': '#3a3a40',
                'editorLineNumber.activeForeground': '#8e8e93',
                'editor.selectionBackground': '#6b5cff44',
                'editorIndentGuide.background1': '#ffffff0d',
            },
        });
    };
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

    const isEdited = (id: string) => edits[id] !== undefined && edits[id] !== original[id];
    const item = (e: StudioEntry, depth: number, label = e.title) => (
        <button
            key={e.id}
            type="button"
            onClick={() => {
                select(e.id);
                setBrowse(false);
            }}
            aria-current={e.id === current.id}
            title={label}
            className={`-ml-px block w-full truncate border-l py-[5px] pr-3 text-left transition-colors ${depth > 1 ? 'pl-7' : 'pl-4'} ${
                e.id === current.id
                    ? 'border-silk bg-accent/70 font-medium text-foreground'
                    : 'border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            }`}
        >
            {label}
            {isEdited(e.id) && (
                <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-silk align-middle" title="Edited" />
            )}
        </button>
    );

    return (
        <div className="fixed inset-x-0 bottom-0 top-14 z-30 grid grid-rows-[auto_minmax(0,1fr)] bg-background lg:grid-cols-[264px_minmax(0,1fr)] lg:grid-rows-1">
            {/* entries: a list on wide screens, a panel behind a button on narrow ones */}
            <div className="flex items-center gap-2 border-b p-2 lg:hidden">
                <button
                    type="button"
                    onClick={() => setBrowse((b) => !b)}
                    aria-expanded={browse}
                    aria-controls="studio-list"
                    className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md border bg-card px-3 py-1.5 text-left text-sm"
                >
                    <span className="truncate">{current.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{browse ? 'Close' : 'Browse'}</span>
                </button>
            </div>
            <nav
                id="studio-list"
                ref={listRef}
                aria-label="Demos and experiments"
                className={`overflow-y-auto border-r bg-background pb-6 text-[13px] max-lg:absolute max-lg:inset-x-0 max-lg:bottom-0 max-lg:top-[49px] max-lg:z-20 ${browse ? 'block' : 'hidden'} lg:block`}
            >
                <div className="sticky top-0 z-10 border-b bg-background p-2.5">
                    <input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={`Filter ${all.length} demos`}
                        aria-label="Filter demos and experiments"
                        className="w-full rounded-md border bg-card px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus:border-silk/60"
                    />
                </div>
                {shown.length === 0 && <p className="px-4 py-3 text-xs text-muted-foreground">Nothing matches.</p>}
                {shown.map((s) => (
                    <div key={s.title} className="px-2 pt-5">
                        <div className="eyebrow px-2 pb-2">{s.title}</div>
                        {s.areas.map((a) => (
                            <div key={a.title} className="mb-3">
                                {(s.areas.length > 1 || a.title !== s.title) && (
                                    <div className="px-2 pb-1 text-xs font-semibold text-foreground">{a.title}</div>
                                )}
                                {a.pages.map((p) => (
                                    <div key={p.href} className="mb-1.5 ml-2 border-l">
                                        {/* a page with one demo is that demo: no heading above it */}
                                        {(p.entries.length > 1 || p.sheets.length > 0) && (
                                            <div className="truncate pb-0.5 pl-4 pt-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground/70">
                                                {p.title}
                                            </div>
                                        )}
                                        {p.entries.map((e) =>
                                            item(
                                                e,
                                                1,
                                                p.entries.length === 1 && p.sheets.length === 0 ? p.title : e.title,
                                            ),
                                        )}
                                        {p.sheets.map((sh) => {
                                            const key = `${p.href}#${sh.title}`;
                                            const open =
                                                words.length > 0 ||
                                                openSheets[key] ||
                                                sh.entries.some((e) => e.id === current.id);

                                            return (
                                                <div key={key}>
                                                    <button
                                                        type="button"
                                                        aria-expanded={open}
                                                        onClick={() => setOpenSheets((o) => ({ ...o, [key]: !open }))}
                                                        className="-ml-px flex w-full items-center gap-1.5 border-l border-transparent py-[5px] pl-4 pr-3 text-left text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                                                    >
                                                        <svg
                                                            viewBox="0 0 24 24"
                                                            className={`h-3 w-3 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
                                                            fill="none"
                                                            stroke="currentColor"
                                                            strokeWidth="2.5"
                                                            aria-hidden="true"
                                                        >
                                                            <path d="m9 6 6 6-6 6" />
                                                        </svg>
                                                        <span className="truncate">{sh.title}</span>
                                                        <span className="ml-auto font-mono text-[10px] text-muted-foreground/70">
                                                            {sh.entries.length}
                                                        </span>
                                                    </button>
                                                    {open && sh.entries.map((e) => item(e, 2))}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                ))}
            </nav>

            <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] xl:grid-cols-2">
                <header className="col-span-full flex flex-wrap items-center gap-2 border-b px-3 py-2">
                    <div className="mr-auto min-w-0">
                        <div className="truncate text-sm font-semibold">{current.title}</div>
                        <div className="truncate font-mono text-[11px] text-muted-foreground">
                            {fileOf(current)}
                            <span className="mx-1.5 opacity-50">/</span>
                            <a href={current.page.href} className="hover:text-foreground hover:underline">
                                {current.page.title}
                            </a>
                        </div>
                    </div>
                    <div className="flex rounded-md border p-0.5 text-xs xl:hidden" role="tablist" aria-label="Pane">
                        {(['code', 'canvas'] as const).map((p) => (
                            <button
                                key={p}
                                type="button"
                                role="tab"
                                aria-selected={pane === p}
                                onClick={() => setPane(p)}
                                className={`rounded px-2.5 py-0.5 capitalize ${pane === p ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground'}`}
                            >
                                {p}
                            </button>
                        ))}
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

                <div className={`min-h-0 xl:block xl:border-r ${pane === 'code' ? 'block' : 'hidden'}`}>
                    {code === undefined ? (
                        <div className="p-4 font-mono text-xs text-muted-foreground">Loading source</div>
                    ) : (
                        <Editor
                            key={current.id}
                            language="typescript"
                            theme="silk"
                            value={code}
                            onChange={(v) => setEdits((x) => ({ ...x, [current.id]: v ?? '' }))}
                            beforeMount={beforeMount}
                            onMount={onMount}
                            loading={<div className="p-4 font-mono text-xs text-muted-foreground">Loading editor</div>}
                            options={{
                                fontSize: 13,
                                fontFamily: "'JetBrains Mono', 'SF Mono', ui-monospace, Menlo, monospace",
                                fontLigatures: true,
                                lineNumbersMinChars: 3,
                                padding: { top: 12 },
                                renderLineHighlight: 'line',
                                smoothScrolling: true,
                                cursorBlinking: 'smooth',
                                minimap: { enabled: false },
                                scrollBeyondLastLine: false,
                                tabSize: 4,
                                automaticLayout: true,
                            }}
                        />
                    )}
                </div>

                <div className={`relative min-h-0 bg-[#0b0b0d] xl:block ${pane === 'canvas' ? 'block' : 'hidden'}`}>
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
