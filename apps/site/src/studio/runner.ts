/**
 * The page inside Studio's preview frame. The parent posts `{ type: 'run', kind, code }`, this page
 * compiles and runs it full window, and posts back `ready`, `ok` or `error`. Every run gets a fresh
 * document (the parent reloads the frame), so WebGL contexts, listeners and globals never leak.
 */
import { type Control, type Demo, initialValues, mountDemo } from '@/demos/runtime';
import { attachCamera } from './camera';
import { runModule } from './modules';

type Message = { type: 'run'; kind: 'demo' | 'lab'; code: string };

const post = (data: Record<string, unknown>) => parent.postMessage({ source: 'silk-studio', ...data }, location.origin);
const fail = (e: unknown) => post({ type: 'error', message: e instanceof Error ? (e.stack ?? e.message) : String(e) });

addEventListener('error', (e) => fail(e.error ?? e.message));
addEventListener('unhandledrejection', (e) => fail(e.reason));

function controlInput(
    key: string,
    control: Control,
    values: Record<string, unknown>,
    set: (k: string, v: unknown) => void,
) {
    const label = document.createElement('label');
    const name = document.createElement('span');

    name.textContent = control.label ?? key;
    label.append(name);
    if (control.type === 'range') {
        const input = Object.assign(document.createElement('input'), {
            type: 'range',
            min: String(control.min),
            max: String(control.max),
            step: String(control.step ?? 1),
            value: String(values[key]),
        });
        const out = document.createElement('output');
        const show = () => (out.textContent = `${input.value}${control.unit ?? ''}`);

        input.oninput = () => {
            set(key, Number(input.value));
            show();
        };
        show();
        label.append(input, out);
    } else if (control.type === 'toggle') {
        const input = Object.assign(document.createElement('input'), {
            type: 'checkbox',
            checked: Boolean(values[key]),
        });

        input.onchange = () => set(key, input.checked);
        label.prepend(input);
    } else {
        const select = document.createElement('select');

        for (const option of control.options) select.append(new Option(option, option, false, option === values[key]));
        select.onchange = () => set(key, select.value);
        label.append(select);
    }

    return label;
}

async function runDemo(code: string) {
    const exports = await runModule(code);
    const demo = exports.default as Demo | undefined;

    if (!demo?.setup) throw new Error('A demo module exports `defineDemo({ ... })` as its default export.');
    const host = document.getElementById('studio-stage')!;
    const bar = document.getElementById('studio-controls')!;
    const values = initialValues(demo.controls);
    const mounted = await mountDemo(demo, host, values);

    // SDF shapes stay sharp at any zoom, so the preview can pan and zoom without limit
    if (!demo.ownsCamera) attachCamera(mounted.silk.app.stage, host);
    const entries = Object.entries(demo.controls ?? {});

    for (const [key, control] of entries) {
        bar.append(
            controlInput(key, control, values, (k, v) => {
                values[k] = v;
                mounted.setParam(k, v);
            }),
        );
    }
    bar.hidden = entries.length === 0;
}

addEventListener('message', async (e: MessageEvent<Message>) => {
    if (e.origin !== location.origin || e.data?.type !== 'run') return;
    document.body.dataset.kind = e.data.kind;
    try {
        if (e.data.kind === 'demo') await runDemo(e.data.code);
        // a lab page builds its own full-window scene when it runs
        else await runModule(e.data.code);
        post({ type: 'ok' });
    } catch (error) {
        fail(error);
    }
});

post({ type: 'ready' });
