import { linear, SilkGraphics } from 'pixi-silk';
import { Island } from 'pixi-silk/ui/island';
import { defineDemo } from './runtime';

const W = 640;
const H = 400;

// Two lips that ask to be found: one pulses, one wiggles. Change the kind and the strength.
export default defineDemo({
    title: 'Island hints',
    size: [W, H],
    touchAction: 'none',
    controls: {
        kind: { type: 'select', label: 'hint', options: ['pulse', 'wiggle'], value: 'pulse' },
        strength: { type: 'range', label: 'strength', min: 0.3, max: 2, step: 0.1, value: 1 },
        every: { type: 'range', label: 'every', min: 0.6, max: 4, step: 0.2, value: 1.6, unit: ' s' },
    },
    setup({ silk, stage, params, tick }) {
        const ticker = silk.app.ticker;
        const view = { width: W, height: H };
        const sky = new SilkGraphics()
            .rect(0, 0, W, H)
            .fill({ gradient: linear([0xfbe3a1, 0xe76f51], { from: [0, 0], to: [0.3, 1] }) });
        const right = new Island({ viewport: view, edge: 'right', length: 200, depth: 110, ticker });
        const left = new Island({ viewport: view, edge: 'left', peek: 0, length: 200, depth: 110, ticker });
        const top = new Island({
            viewport: view,
            edge: 'top',
            peek: 8,
            peekLength: 60,
            length: 260,
            depth: 80,
            ticker,
        });

        stage.addChild(sky, right, left, top);
        let wait = 0;

        // hint on a timer of our own, so the controls apply at once (`hintEvery` does this for you)
        tick((_, dt) => {
            wait -= dt;
            if (wait > 0) return;
            wait = params.every;
            for (const island of [right, left, top]) {
                if (island.state.name.value !== 'open') island.hint(params.kind as 'pulse' | 'wiggle', params.strength);
            }
        });

        return undefined;
    },
});
