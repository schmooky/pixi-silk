// The preview page: every message of the chosen locale, rendered by pixi-silk from the bundles the
// server compiles on each save, with the lint list and a live theme editor beside it.
import { Application, Assets, extensions, Graphics } from 'pixi.js';
import { Silk, SilkMessage, silkBundleLoader } from '/lib/pixi-silk/i18n-pixi.js';

const $ = (id) => document.getElementById(id);
const state = await (await fetch('/state.json')).json();
const params = new URLSearchParams(location.search);
const locale = params.get('locale') ?? state.locales.find((l) => l !== 'en') ?? state.locales[0];
const app = new Application();

await app.init({
    width: 720,
    height: 600,
    background: 0x111113,
    antialias: false,
    resolution: devicePixelRatio,
    autoDensity: true,
});
$('stage').appendChild(app.canvas);
extensions.add(silkBundleLoader);
const silk = await Silk.create({ dynamicText: { mode: 'canvas' } });
const theme = silk.createTheme(await (await fetch('/i18n/theme.json')).json());

for (const l of state.locales) {
    if (state.bundles.includes(l)) await silk.addBundle(await Assets.load(`/i18n/${l}.silk?v=${state.version}`));
}
silk.registerInline({
    coin: { texture: app.renderer.generateTexture(new Graphics().circle(32, 32, 30).fill('#FFC53D')), size: '1.1em' },
});

// locale picker
for (const l of state.locales) $('locale').append(new Option(l, l, l === locale, l === locale));
$('locale').onchange = (e) => {
    params.set('locale', e.target.value);
    location.search = params.toString();
};

// lint list: one row per problem, with its cell
const errors = state.diagnostics.filter((d) => d.severity === 'error').length;

$('count').textContent = `${errors} errors, ${state.diagnostics.length - errors} warnings`;
for (const d of state.diagnostics) {
    const row = document.createElement('tr');

    for (const [text, cls] of [
        [d.sheet ? `${d.sheet}!${d.column ?? ''}${d.row ?? ''}` : 'config'],
        [d.locale ?? ''],
        [d.key ?? ''],
        [d.message, d.severity],
    ]) {
        const td = document.createElement('td');

        td.textContent = text;
        if (cls) td.className = cls;
        row.append(td);
    }
    $('lint').tBodies[0].append(row);
}

// every message with sample values
const sample = { number: 1250, text: locale === 'ar' || locale === 'he' ? 'Alex' : 'ليلى' };
const keys = state.messages.filter((m) => m.locales.includes(locale) || m.locales.includes('en'));
const set = await silk.prepare({
    locale: silk.bundles.has(locale) ? locale : 'en',
    fallbackLocale: 'en',
    theme,
    defaults: { size: 22, maxWidth: Number($('width').value), lineHeight: 1.35 },
    messages: Object.fromEntries(
        keys.map((m) => [
            m.key,
            { key: m.key, values: Object.fromEntries(m.slots.map((s) => [s.name, sample[s.type]])) },
        ]),
    ),
});
const shown = [];
let y = 24;

for (const name of set.names()) {
    const m = new SilkMessage(set.get(name));

    m.position.set(24, y);
    y += Math.max(40, m.layout.height + 20);
    app.stage.addChild(m);
    shown.push(m);
}
app.renderer.resize(720, Math.max(600, y + 24));
$('width').oninput = (e) => {
    let top = 24;

    for (const m of shown) {
        m.maxWidth = Number(e.target.value);
        m.y = top;
        top += Math.max(40, m.layout.height + 20);
    }
};
$('status').textContent = `${locale}: ${shown.length} messages, compiled in ${state.ms} ms`;

// theme editor: paint properties only, applied with theme.set
const data = JSON.parse(JSON.stringify(theme.table.theme));
const field = (style, path, type, value) => {
    const label = document.createElement('label');
    const input = document.createElement('input');

    input.type = type;
    if (type === 'number') input.step = '0.05';
    input.value = value;
    input.oninput = () => {
        const v = type === 'number' ? Number(input.value) : input.value;
        const target = style === 'base' ? data.base : data.styles[style];
        const [a, b] = path.split('.');

        if (b) target[a] = { ...target[a], [b]: v };
        else target[a] = v;
        theme.set(style, { [a]: target[a] });
    };
    label.append(path, input);
    return label;
};

for (const [name, style] of [['base', data.base ?? {}], ...Object.entries(data.styles ?? {})]) {
    const box = document.createElement('fieldset');
    const legend = document.createElement('legend');

    legend.textContent = name === 'base' ? 'base (untagged text)' : `<${name}>`;
    box.append(legend, field(name, 'fill', 'color', (style.fill ?? '#ffffff').slice(0, 7)));
    if (style.outline)
        box.append(
            field(name, 'outline.width', 'number', style.outline.width),
            field(name, 'outline.color', 'color', style.outline.color ?? '#000000'),
        );
    if (style.glow)
        box.append(
            field(name, 'glow.strength', 'number', style.glow.strength ?? 0.5),
            field(name, 'glow.color', 'color', style.glow.color),
        );
    if (style.shadow)
        box.append(
            field(name, 'shadow.alpha', 'number', style.shadow.alpha ?? 0.5),
            field(name, 'shadow.softness', 'number', style.shadow.softness ?? 0.5),
        );
    $('theme').append(box);
}
$('save').onclick = async () => {
    await fetch('/theme.json', { method: 'POST', body: JSON.stringify(data) });
    $('status').textContent = 'theme.json saved';
};

// reload when the server compiled a new version
setInterval(async () => {
    const next = await (await fetch('/state.json')).json();

    if (next.version !== state.version) location.reload();
}, 1000);
