import { Text } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';
import { signal } from 'pixi-silk/signal';
import { SilkButton } from 'pixi-silk/ui/button';
import { ButtonDock } from 'pixi-silk/ui/dock';
import { SegmentedSwitch } from 'pixi-silk/ui/modes';
import { defineDemo } from './runtime';

const play = (g: SilkGraphics, s: number) => g.regularPoly(s * 0.06, 0, s * 0.42, 3, Math.PI / 2, 2).fill(0xffffff);
const minus = (g: SilkGraphics, s: number) =>
    g.line(-s * 0.3, 0, s * 0.3, 0).stroke({ width: s * 0.14, cap: 'round', color: 0xffffff });
const plus = (g: SilkGraphics, s: number) => {
    minus(g, s);
    g.line(0, -s * 0.3, 0, s * 0.3).stroke({ width: s * 0.14, cap: 'round', color: 0xffffff });
};
// a lightning bolt as two rounded triangles (closed polygons cannot be filled yet)
const bolt = (g: SilkGraphics, s: number) => {
    g.triangle(s * 0.12, -s * 0.5, -s * 0.3, s * 0.08, s * 0.08, s * 0.02, 1).fill(0xffffff);
    g.triangle(-s * 0.12, s * 0.5, s * 0.3, -s * 0.08, -s * 0.08, -s * 0.02, 1).fill(0xffffff);
};

// Tap SPIN for one spin, hold it for five. While the reels run, the side buttons leave, the speed
// switch locks and the spin button turns busy: nothing can be pressed twice. The bet lives in a signal.
const SPEED: Record<string, number> = { normal: 1.1, turbo: 0.6, quick: 0.3 };
export default defineDemo({
    size: [560, 340],
    touchAction: 'none',
    controls: {
        enabled: { type: 'toggle', label: 'spin enabled', value: true },
    },
    setup({ silk, stage, params, tick }) {
        const ticker = silk.app.ticker;
        const bet = signal(1);
        const reels = new SilkGraphics();
        const label = new Text({
            text: '',
            style: { fill: 0xf2f2f7, fontFamily: 'system-ui, sans-serif', fontSize: 15, fontWeight: '600' },
        });
        const side = { ticker, theme: { fill: 0x2c2c2e, fillHover: 0x3a3a3c, fillPress: 0x1c1c1e } };
        const less = new SilkButton({
            ...side,
            shape: 'circle',
            height: 48,
            icon: minus,
            onPress: () => bet.update((b) => Math.max(1, b - 1)),
        });
        const more = new SilkButton({
            ...side,
            shape: 'circle',
            height: 48,
            icon: plus,
            onPress: () => bet.update((b) => Math.min(10, b + 1)),
        });
        const speed = new SegmentedSwitch({
            ticker,
            value: 'normal',
            segmentWidth: 78,
            height: 34,
            options: [
                { id: 'normal', label: 'Normal' },
                { id: 'turbo', icon: bolt },
                { id: 'quick', label: 'Quick' },
            ],
        });
        const spin = new SilkButton({
            ticker,
            shape: 'circle',
            height: 76,
            icon: play,
            iconSize: 30,
            holdMs: 450,
            theme: { fill: 0x30d158, fillHover: 0x4ade80, fillPress: 0x248a3d },
            onPress: () => run(1),
            onHold: () => run(5),
        });
        const dock = new ButtonDock({ ticker, gap: 14 }).add(less, spin, more);
        let spinning = 0;
        let duration = 1.1;
        let left = 0;

        bet.subscribe((b) => (label.text = `bet ${b}`));
        label.text = `bet ${bet.value}`;
        label.anchor.set(0.5);
        label.position.set(90, 34);
        speed.position.set(400, 34);
        dock.position.set(280, 282);
        stage.addChild(reels, label, speed, dock);

        async function run(count: number) {
            left = count;
            spin.state.busy.set(true);
            speed.state.enabled.set(false);
            await Promise.all([less.hide(), more.hide()]);
            while (left-- > 0) {
                duration = SPEED[speed.state.value.value] ?? 1.1;
                spinning = duration;
                await new Promise((r) => setTimeout(r, duration * 1000));
            }
            spin.state.busy.set(false);
            speed.state.enabled.set(true);
            await dock.showAll();
        }

        tick((t, dt) => {
            spin.state.enabled.set(params.enabled);
            spinning = Math.max(0, spinning - dt);
            reels.clear();
            for (let c = 0; c < 5; c++) {
                const x = 60 + c * 92;
                const run = spinning > 0 && spinning < duration * (1 - c * 0.05) ? 1 : 0;

                reels.roundRect(x, 62, 80, 168, 14, 0.6).fill(0x1c1c1e);
                for (let r = 0; r < 3; r++) {
                    const y = 70 + r * 54 + (run ? ((t * 900 + c * 40) % 54) - 27 : 0);
                    const hue = [0xff453a, 0xffd60a, 0x0a84ff, 0xbf5af2][(r + c + (run ? Math.floor(t * 20) : 0)) % 4];

                    reels.roundRect(x + 12, y + 6, 56, 40, 10, 0.6).fill({ color: hue, alpha: run ? 0.55 : 0.9 });
                }
            }
        });

        return undefined;
    },
});
