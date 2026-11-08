import { Container } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';
import { SilkText } from 'pixi-silk/text';
import { PANEL_THEME, PANEL_THEME_LIGHT, Panel } from 'pixi-silk/ui/panel';
import { BG, defineDemo } from './runtime';

// Drag a panel by its title bar. Drop it near an edge or a corner to dock it there, drag it off to
// float it again. Drag an edge to resize it, click the chevron to fold it, and scroll its list.
export default defineDemo({
    title: 'Docking panels',
    size: [720, 460],
    touchAction: 'none',
    controls: {
        theme: { type: 'select', label: 'theme', options: ['dark', 'light'], value: 'dark' },
    },
    setup({ silk, stage, width, height, params, tick }) {
        const viewport = { width, height };
        const canvas = silk.app.canvas;
        // the panels scroll with the wheel: keep the page still while the pointer is over the demo
        const still = (e: WheelEvent) => e.preventDefault();

        canvas.addEventListener('wheel', still, { passive: false });
        const backdrop = new SilkGraphics();

        stage.addChild(backdrop);
        let panels: Panel[] = [];
        const build = (light: boolean) => {
            for (const p of panels) p.destroy({ children: true });
            const theme = light ? PANEL_THEME_LIGHT : PANEL_THEME;

            backdrop
                .clear()
                .rect(0, 0, width, height)
                .fill(light ? 0xe6e6eb : BG);
            const colours = new Panel({ title: 'Colours', x: 200, y: 60, width: 240, height: 320, viewport, theme });
            const notes = new Panel({ title: 'Notes', dock: 'right', width: 220, viewport, theme });

            // forty swatch rows, laid out by the panel's flex column and clipped by its body
            for (let i = 0; i < 40; i++) {
                const row = new Container();
                const hue = (i * 37) % 360;
                const chip = new SilkGraphics().roundRect(0, 0, 22, 22, 6, 0.6).fill(`hsl(${hue} 70% 58%)`);
                const name = new SilkText({
                    text: `Swatch ${i + 1}`,
                    fontFamily: theme.fontFamily,
                    fontSize: 12,
                    fontWeight: 500,
                    fill: theme.text,
                });
                const code = new SilkText({
                    text: `${hue} deg`,
                    fontFamily: theme.fontFamily,
                    fontSize: 11,
                    fill: theme.textDim,
                    anchor: { x: 1, y: 0 },
                });

                name.position.set(32, 4);
                code.position.set(216, 5);
                row.addChild(chip, name, code);
                colours.content.add(row);
            }
            const text = new SilkText({
                text: 'Panels are Pixi containers. They pan, zoom and stay sharp like the rest of the scene, and need no DOM on top of the canvas.',
                fontFamily: theme.fontFamily,
                fontSize: 12,
                lineHeight: 18,
                fill: theme.textDim,
                wordWrap: true,
                wordWrapWidth: 190,
            });

            notes.content.add(text);
            panels = [colours, notes];
            stage.addChild(...panels);
        };
        let light = params.theme === 'light';

        build(light);
        tick(() => {
            if ((params.theme === 'light') === light) return;
            light = params.theme === 'light';
            build(light);
        });

        return () => {
            canvas.removeEventListener('wheel', still);
        };
    },
});
