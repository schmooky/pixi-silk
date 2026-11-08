import { Container } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';
import { bindHistoryKeys, History } from 'pixi-silk/history';
import { bindOutline, Selection } from 'pixi-silk/selection';
import { watch } from 'pixi-silk/signal';
import { Inspector, type InspectorField } from 'pixi-silk/ui/inspector';
import { SelectionOutline } from 'pixi-silk/ui/outline';
import { Panel } from 'pixi-silk/ui/panel';
import { defineDemo } from './runtime';

/** A card with a fill and a corner radius, so the inspector has something of its own to edit. */
class Card extends Container {
    private readonly g = new SilkGraphics();
    private _fill: number;
    private _radius = 18;
    shadow = true;

    constructor(label: string, fill: number) {
        super({ label });
        this._fill = fill;
        this.addChild(this.g);
        this.redraw();
    }

    get fill(): number {
        return this._fill;
    }
    set fill(v: number) {
        this._fill = v;
        this.redraw();
    }
    get radius(): number {
        return this._radius;
    }
    set radius(v: number) {
        this._radius = v;
        this.redraw();
    }
    get glow(): boolean {
        return this.shadow;
    }
    set glow(v: boolean) {
        this.shadow = v;
        this.redraw();
    }

    redraw(): void {
        const g = this.g.clear();

        if (this.shadow)
            g.roundRect(0, 8, 120, 120, this._radius, 0.6).fill({ color: this._fill, alpha: 0.45, blur: 7 });
        g.roundRect(0, 0, 120, 120, this._radius, 0.6).fill(this._fill);
    }
}

const schema: InspectorField[] = [
    { type: 'text', key: 'label', label: 'Name' },
    { type: 'vector', keys: ['position.x', 'position.y'], label: 'Position' },
    { type: 'vector', keys: ['scale.x', 'scale.y'], label: 'Scale', labels: ['X', 'Y'], step: 0.01, lockAspect: true },
    { type: 'number', key: 'angle', label: 'Rotation', unit: 'deg' },
    { type: 'number', key: 'alpha', label: 'Opacity', min: 0, max: 1, step: 0.01, perPixel: 0.005 },
    {
        type: 'section',
        label: 'Style',
        fields: [
            { type: 'color', key: 'fill', label: 'Fill' },
            { type: 'number', key: 'radius', label: 'Radius', min: 0, max: 60, unit: 'px' },
            { type: 'toggle', key: 'glow', label: 'Glow' },
            {
                type: 'choice',
                key: 'blendMode',
                label: 'Blend',
                options: [
                    { value: 'inherit', label: 'Pass' },
                    { value: 'normal', label: 'Normal' },
                    { value: 'add', label: 'Add' },
                ],
            },
        ],
    },
];

// Click a card, or Shift + click to edit several: values that differ show as Mixed, and a scrub
// moves each from its own start. Drag a number sideways, or click it to type. Open the swatch for
// the colour picker. Cmd or ctrl + Z undoes each drag as one step.
export default defineDemo({
    size: [760, 480],
    background: 0x141416,
    touchAction: 'none',
    setup({ silk, stage }) {
        const canvas = silk.app.canvas;
        const still = (e: WheelEvent) => e.preventDefault();

        canvas.addEventListener('wheel', still, { passive: false });
        const selection = new Selection<Container>();
        const history = new History();
        const scene = new Container();
        const outline = new SelectionOutline({ ticker: silk.app.ticker });
        const panel = new Panel({ title: 'Inspector', x: 452, y: 20, width: 288, height: 440 });
        const inspector = new Inspector({ schema, history, element: canvas, popoverLayer: stage });
        const cards = [new Card('Blue', 0x0a84ff), new Card('Pink', 0xff375f), new Card('Mint', 0x30d158)];

        cards.forEach((card, i) => {
            card.position.set(40 + (i % 2) * 180, 50 + Math.floor(i / 2) * 200 + (i % 2) * 40);
            card.eventMode = 'static';
            card.cursor = 'pointer';
            card.on('pointerdown', (e) => {
                e.stopPropagation();
                selection.pick(card, e.shiftKey ? 'toggle' : 'replace');
            });
            scene.addChild(card);
        });
        stage.eventMode = 'static';
        stage.hitArea = { contains: () => true };
        stage.on('pointerdown', (e) => {
            if (e.target === stage) selection.clear();
        });
        panel.content.add(inspector);
        stage.addChild(scene, outline, panel);
        const stops = [
            bindOutline(selection, outline),
            watch(selection.state.items, (items) => {
                inspector.bind(items);
                panel.title = items.length > 1 ? `${items.length} cards` : (items[0]?.label ?? 'Inspector');
            }),
            history.onChange(() => inspector.refresh()),
            bindHistoryKeys(history),
        ];

        selection.replace([cards[0], cards[1]]);

        return () => {
            for (const stop of stops) stop();
            canvas.removeEventListener('wheel', still);
        };
    },
});
