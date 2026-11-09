import { SilkGraphics } from 'pixi-silk';
import { JogDial } from 'pixi-silk/ui/dial';
import { MiniTimeline } from 'pixi-silk/ui/timeline';
import { defineDemo, PALETTE } from './runtime';

// Scrub the ruler (past the ends it stretches), drag keys, Shift-click or box-select several,
// and move the green loop handles. The wheel zooms, sideways or with Shift it pans, and a
// double tap on the ruler zooms in or back out. Tap the dial to play or pause.
// The scene is drawn small and scaled up, so the ruler's 9 px labels read at 11 px.
export default defineDemo({
    title: 'Timeline and jog dial',
    size: [540, 184],
    // phones: the dial under the timeline, and 11 px ruler labels as the scene is not scaled up
    phone: { size: [360, 290] },
    touchAction: 'none',
    setup({ silk, stage, tick, phone }) {
        const span = phone ? 312 : 380;
        const ticker = silk.app.ticker;
        const timeline = new MiniTimeline({
            ticker,
            width: span,
            height: 70,
            textStyle: phone ? { fontSize: 11 } : undefined,
            duration: 120,
            loop: [24, 96],
            keys: [0, 12, 30, 44, 60, 72, 90, 108].map((time, i) => ({ id: `k${i}`, time })),
        });
        const ball = new SilkGraphics();
        const jog = new JogDial({ ticker, radius: 34, thickness: 10, turn: 24, readout: false });
        let last = 0;

        timeline.position.set(24, 104);
        if (phone) jog.position.set(180, 236);
        else jog.position.set(472, 139);
        // the dial scrubs the playhead, a tap on it plays or pauses
        jog.state.value.subscribe((v) => {
            timeline.state.time.set(Math.max(0, Math.min(120, timeline.state.time.value + v - last)));
            last = v;
        });
        jog.on('pointertap', () => timeline.toggle());
        timeline.state.playing.set(true);
        stage.addChild(ball, timeline, jog);
        tick(() => {
            // something to animate: a ball eased between the keys
            const time = timeline.state.time.value;
            const keys = timeline.keys.map((k) => k.time).sort((a, b) => a - b);
            const i = keys.findIndex((k) => k > time);
            const a = keys[Math.max(0, i - 1)] ?? 0;
            const b = keys[i] ?? 120;
            const u = b > a ? (time - a) / (b - a) : 0;
            const y = 80 - Math.sin(Math.PI * u) * 44;
            const x = 24 + (time / 120) * span;

            ball.clear();
            ball.circle(x, 92, 12).fill({ color: 0x000000, alpha: 0.4, blur: 6 });
            ball.circle(x, y, 12).fill(PALETTE.blue);
        });

        return undefined;
    },
});
