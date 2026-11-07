import { type InnerShadow, SilkGraphics, vertical } from 'pixi-silk';
import { defineDemo } from './runtime';

// The four inner shadows of a glowing app icon, straight from a Figma spec.
// Each one is an extra instance of the same shape, so the icon stays one draw call.
export default defineDemo({
    size: [560, 360],
    background: 0x1d1f22,
    controls: {
        deep: { type: 'toggle', label: 'blue 0, -80', value: true },
        soft: { type: 'toggle', label: 'light 0, -40', value: true },
        rim: { type: 'toggle', label: 'white, plus lighter', value: true },
        lip: { type: 'toggle', label: 'blue 0, 6', value: true },
    },
    setup({ stage, params, tick }) {
        const g = new SilkGraphics();
        const body = vertical([0x0a0909, 0x09101f]);
        let key = '';

        stage.addChild(g);
        tick(() => {
            const next = `${params.deep}${params.soft}${params.rim}${params.lip}`;

            if (next === key) return;
            key = next;
            g.clear();
            // drop shadow under the icon
            g.roundRect(186, 92, 188, 188, 40).fill({ color: 0x000000, alpha: 0.55, blur: 18, spread: -6 });
            const shadows: (InnerShadow | false)[] = [
                params.deep && { color: 0x144ccd, x: 0, y: -40, blur: 30, spread: -15 },
                params.soft && { color: 0x6694ff, alpha: 0.5, x: 0, y: -20, blur: 15, spread: -4 },
                params.rim && { color: 0xffffff, alpha: 0.4, x: 0, y: -10, blur: 10, spread: -3, blend: 'add' },
                params.lip && { color: 0x2365ff, alpha: 0.15, x: 0, y: 3, blur: 3, spread: -1 },
            ];

            g.roundRect(180, 80, 200, 200, 40).fill({
                gradient: body,
                innerShadow: shadows.filter((s): s is InnerShadow => s !== false),
            });
        });

        return undefined;
    },
});
