import { JogDial, Scrubber } from 'pixi-silk/ui/dial';
import { defineDemo } from './runtime';

// Drag around a dial: the value keeps adding up over full turns, and further out turns slower.
// Flick it and it keeps turning. The right dial clicks through steps and stretches past its limits.
// Scrub the fields sideways. Shift is fine, Ctrl or Cmd snaps, a tap on either end steps.
export default defineDemo({
    size: [600, 300],
    touchAction: 'none',
    setup({ silk, stage }) {
        const ticker = silk.app.ticker;
        const endless = new JogDial({ ticker, radius: 62, turn: 360, format: (v) => `${Math.round(v)}°` });
        const stepped = new JogDial({
            ticker,
            radius: 62,
            step: 1,
            min: 0,
            max: 24,
            value: 6,
            theme: { fill: 0x30d158 },
        });
        const size = new Scrubber({ ticker, label: 'Size', value: 24, step: 1, min: 1, max: 200, perPixel: 0.5 });
        const opacity = new Scrubber({
            ticker,
            label: 'Opacity',
            value: 0.8,
            step: 0.05,
            min: 0,
            max: 1,
            perPixel: 0.005,
            format: (v) => `${Math.round(v * 100)}%`,
            theme: { fill: 0xbf5af2 },
        });
        const angle = new Scrubber({
            ticker,
            label: 'Angle',
            value: 0,
            step: 15,
            perPixel: 1,
            format: (v) => `${v.toFixed(1)}°`,
        });

        endless.position.set(110, 130);
        stepped.position.set(290, 130);
        size.position.set(420, 70);
        opacity.position.set(420, 125);
        angle.position.set(420, 180);
        // the endless dial drives the angle field
        endless.state.value.subscribe((v) => angle.state.value.set(Math.round(v * 10) / 10));
        stage.addChild(endless, stepped, size, opacity, angle);

        return undefined;
    },
});
