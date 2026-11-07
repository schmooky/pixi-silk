import { Container, Text } from 'pixi.js';
import { damp, SilkGraphics, Spring } from 'pixi-silk';
import { signal } from 'pixi-silk/signal';
import { type GesturePoint, trackGesture } from 'pixi-silk/ui/gesture';
import { type RadialItem, RadialMenu } from 'pixi-silk/ui/radial';
import { defineDemo } from './runtime';

// A slot spin button built from the atoms (copy it into your game and restyle it):
// idle breathing, press squash, hold for the autoplay picker, a stop square while spinning and the
// autoplay count left as a shrinking ring. The picker is a half RadialMenu fanning up from the button.

type Phase = 'idle' | 'spinning' | 'stopping';

class SpinButton extends Container {
    readonly phase = signal<Phase>('idle');
    readonly autoplay = signal(0);
    /** Spins in the current autoplay run, for the ring. */
    autoplayTotal = 1;
    onSpin: () => void = () => {};
    onStop: () => void = () => {};
    onHold: (p: GesturePoint) => void = () => {};

    private readonly g = new SilkGraphics();
    private readonly press = new Spring(0, 700, 30);
    private readonly morph = new Spring(0, 260, 22);
    private spinAngle = 0;
    private ring = 0;
    private t = 0;

    constructor(private readonly radius = 44) {
        super();
        this.addChild(this.g);
        this.hitArea = { contains: (x, y) => Math.hypot(x, y) <= radius + 10 };
        trackGesture(
            this,
            {
                onDown: () => (this.press.target = 1),
                onUp: () => (this.press.target = 0),
                onTap: () => (this.phase.value === 'idle' ? this.onSpin() : this.onStop()),
                onHold: (p) => this.phase.value === 'idle' && this.onHold(p),
            },
            { holdMs: 380, flickSpeed: 0 },
        );
    }

    update(dt: number): void {
        const spinning = this.phase.value !== 'idle';
        const r = this.radius;
        const total = Math.max(1, this.autoplayTotal);

        this.t += dt;
        this.press.step(dt);
        this.morph.target = spinning ? 1 : 0;
        this.morph.step(dt);
        this.spinAngle += dt * (2 + 8 * this.morph.value);
        this.ring = damp(this.ring, this.autoplay.value > 0 ? this.autoplay.value / total : 0, 10, dt);

        const breathe = spinning ? 0 : Math.sin(this.t * 2.4) * 0.025;

        this.scale.set((1 + breathe) * (1 - 0.08 * this.press.value));
        const m = Math.min(1, Math.max(0, this.morph.value));
        const g = this.g.clear();

        g.circle(0, 4, r).fill({ color: 0x000000, alpha: 0.35, blur: 10 });
        g.circle(0, 0, r).fill(spinning ? 0xff453a : 0x30d158);
        g.circle(0, 0, r - 5).stroke({ width: 2, color: 0xffffff, alpha: 0.25 });
        // the arrow turns into a stop square as the reels start
        g.save().rotateTransform(this.spinAngle * (1 - m) * 0.15);
        if (m < 0.5) {
            g.arcSweep(0, 0, r * 0.42, -Math.PI * 0.3, Math.PI * 1.45).stroke({
                width: 7,
                cap: 'round',
                color: 0xffffff,
                alpha: 1 - m * 2,
            });
            g.regularPoly(r * 0.12, -r * 0.42, 9, 3, Math.PI / 2, 2).fill({ color: 0xffffff, alpha: 1 - m * 2 });
        } else {
            const s = r * 0.42 * (m - 0.5) * 2;

            g.roundRect(-s / 2, -s / 2, s, s, 5).fill(0xffffff);
        }
        g.restore();
        if (this.ring > 0.002) {
            g.arcSweep(0, 0, r + 8, -Math.PI / 2, Math.PI * 2 * this.ring).stroke({
                width: 4,
                cap: 'round',
                color: 0xffd60a,
            });
        }
    }
}

const chip = (n: string): RadialItem => ({ id: n, label: n });

export default defineDemo({
    size: [520, 320],
    touchAction: 'none',
    setup({ silk, stage, tick }) {
        const spin = new SpinButton();
        const status = new Text({
            text: 'tap to spin, hold for autoplay',
            style: { fill: 0x8e8e93, fontFamily: 'system-ui, sans-serif', fontSize: 13 },
        });
        const picker = new RadialMenu({
            items: ['10', '25', '50', '100', '∞'].map(chip),
            sweep: Math.PI * 0.95,
            direction: -Math.PI / 2,
            innerRadius: 58,
            hub: false,
            outerRadius: 108,
            ticker: silk.app.ticker,
            theme: { segment: 0x2c2c2e, segmentHover: 0x3a3a3c, icon: 0xf2f2f7, iconHover: 0xffd60a, accent: 0xffd60a },
            onSelect: (item) => startAutoplay(item.id === '∞' ? 999 : Number(item.id)),
        });
        let timer: ReturnType<typeof setTimeout> | null = null;

        status.anchor.set(0.5);
        status.position.set(260, 30);
        spin.position.set(260, 250);
        picker.position.set(260, 250);
        stage.addChild(status, spin, picker);

        const spinOnce = () => {
            spin.phase.set('spinning');
            status.text = spin.autoplay.value > 0 ? `autoplay: ${spin.autoplay.value} left` : 'spinning';
            timer = setTimeout(() => {
                spin.phase.set('idle');
                if (spin.autoplay.value > 0) {
                    spin.autoplay.update((n) => n - 1);
                    if (spin.autoplay.value > 0) timer = setTimeout(spinOnce, 250);
                    else status.text = 'autoplay done';
                } else status.text = 'tap to spin, hold for autoplay';
            }, 1100);
        };
        const startAutoplay = (n: number) => {
            spin.autoplayTotal = n;
            spin.autoplay.set(n);
            spinOnce();
        };

        spin.onSpin = spinOnce;
        spin.onStop = () => {
            spin.autoplay.set(0);
            status.text = 'stopped';
        };
        spin.onHold = (p) => picker.openAt(260, 250, p);
        tick((_t, dt) => spin.update(dt));

        return () => {
            if (timer) clearTimeout(timer);
        };
    },
});
