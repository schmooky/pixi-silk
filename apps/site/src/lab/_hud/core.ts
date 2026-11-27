/*
 * The HUD's logic, with no Pixi in it. It follows the model of open-slot-ui:
 *
 * - every control is a small state machine. Its state says what it shows and whether it takes
 *   input, and that interactivity is derived, never stored;
 * - the HUD never runs a round. It emits intent (`spinRequested`) and the host answers through
 *   the facade (`ui.spin.busy()`, `ui.reportRound(win, bet)`);
 * - money is held in integer minor units, so counting never drifts.
 *
 * The views read these signals and repaint. Nothing here knows how it is drawn.
 */
import { type Computed, computed, type ReadSignal, type Signal, signal } from 'pixi-silk/signal';

/** The intents the HUD emits. The host listens and drives the game. */
export interface HudEvents {
    spinRequested: undefined;
    skipRequested: undefined;
    autoplayStarted: { count: number };
    autoplayStopped: undefined;
    betChanged: { bet: number };
    toggled: { id: string; on: boolean };
    menuRequested: undefined;
    featureRequested: { id: string };
}

type Handler<T> = (payload: T) => void;

/** A typed event bus. `on` returns the unsubscribe function. */
export class Bus<E> {
    private readonly _subs = new Map<keyof E, Set<Handler<never>>>();

    on<K extends keyof E>(name: K, fn: Handler<E[K]>): () => void {
        const set = this._subs.get(name) ?? new Set<Handler<never>>();

        this._subs.set(name, set);
        set.add(fn as Handler<never>);

        return () => set.delete(fn as Handler<never>);
    }

    emit<K extends keyof E>(name: K, payload: E[K]): void {
        for (const fn of [...(this._subs.get(name) ?? [])]) (fn as Handler<E[K]>)(payload);
    }
}

/** One state of a control: does it take input, and how does the view enter it. */
export interface StateDef {
    interactable: boolean;
    /** What the view plays on entry: a scale it springs through, then back to 1. */
    kick?: number;
}

/** A control: a finite state machine plus an optional host gate (an input lock). */
export class Control<S extends string> {
    readonly state: Signal<S>;
    /** Derived from the state and the gate. Never set directly. */
    readonly interactable: Computed<boolean>;

    constructor(
        readonly id: string,
        readonly states: Record<S, StateDef>,
        initial: S,
        gate: ReadSignal<boolean>,
    ) {
        this.state = signal(initial);
        this.interactable = computed(
            [this.state, gate],
            () => this.states[this.state.value].interactable && gate.value,
        );
    }

    /** Moves to `to`. An unknown state throws, so an illegal state cannot exist. */
    go(to: S): void {
        if (!(to in this.states)) throw new Error(`hud: control "${this.id}" has no state "${to}"`);
        this.state.value = to;
    }
}

export type SpinState = 'idle' | 'spinning' | 'stopping' | 'disabled';

/** The round button. The host drives its state, the view calls `press()`. */
export class SpinControl extends Control<SpinState> {
    constructor(
        private readonly bus: Bus<HudEvents>,
        gate: ReadSignal<boolean>,
    ) {
        super(
            'spin',
            {
                idle: { interactable: true },
                // tapping mid-spin slam-stops the reels
                spinning: { interactable: true, kick: 0.94 },
                stopping: { interactable: false },
                disabled: { interactable: false },
            },
            'idle',
            gate,
        );
    }

    busy(): void {
        this.go('spinning');
    }

    idle(): void {
        this.go('idle');
    }

    press(): void {
        if (!this.interactable.value) return;
        if (this.state.value === 'spinning') {
            this.go('stopping');
            this.bus.emit('skipRequested', undefined);
        } else this.bus.emit('spinRequested', undefined);
    }
}

/** A bet ladder: the bet is always one of `levels`. */
export class BetControl extends Control<'idle' | 'locked'> {
    readonly index: Signal<number>;
    readonly bet: Computed<number>;
    readonly canUp: Computed<boolean>;
    readonly canDown: Computed<boolean>;

    constructor(
        readonly levels: readonly number[],
        index: number,
        private readonly bus: Bus<HudEvents>,
        gate: ReadSignal<boolean>,
    ) {
        super('bet', { idle: { interactable: true }, locked: { interactable: false } }, 'idle', gate);
        this.index = signal(Math.max(0, Math.min(levels.length - 1, index)));
        this.bet = computed([this.index], () => levels[this.index.value]);
        this.canUp = computed(
            [this.index, this.interactable],
            () => this.interactable.value && this.index.value < levels.length - 1,
        );
        this.canDown = computed([this.index, this.interactable], () => this.interactable.value && this.index.value > 0);
    }

    step(by: 1 | -1): void {
        if (!(by > 0 ? this.canUp : this.canDown).value) return;
        this.index.value += by;
        this.bus.emit('betChanged', { bet: this.bet.value });
    }
}

/** An on/off control (turbo, sound). */
export class ToggleControl extends Control<'off' | 'on'> {
    constructor(
        id: string,
        private readonly bus: Bus<HudEvents>,
        gate: ReadSignal<boolean>,
        on = false,
    ) {
        super(id, { off: { interactable: true }, on: { interactable: true, kick: 1.08 } }, on ? 'on' : 'off', gate);
    }

    get on(): boolean {
        return this.state.value === 'on';
    }

    toggle(): void {
        if (!this.interactable.value) return;
        this.go(this.on ? 'off' : 'on');
        this.bus.emit('toggled', { id: this.id, on: this.on });
    }
}

/** Autoplay: off, or running with rounds left. Tapping while running stops it. */
export class AutoplayControl extends Control<'off' | 'running'> {
    readonly left = signal(0);

    constructor(
        readonly count: number,
        private readonly bus: Bus<HudEvents>,
        gate: ReadSignal<boolean>,
    ) {
        super('autoplay', { off: { interactable: true }, running: { interactable: true, kick: 1.08 } }, 'off', gate);
    }

    press(): void {
        if (!this.interactable.value) return;
        if (this.state.value === 'running') this.stop();
        else {
            this.left.value = this.count;
            this.go('running');
            this.bus.emit('autoplayStarted', { count: this.count });
        }
    }

    stop(): void {
        if (this.state.value !== 'running') return;
        this.left.value = 0;
        this.go('off');
        this.bus.emit('autoplayStopped', undefined);
    }
}

/** A money readout. The value is in integer minor units. */
export class Readout {
    readonly minor: Signal<number>;

    constructor(
        readonly id: string,
        readonly caption: string,
        readonly decimals: number,
        initial = 0,
    ) {
        this.minor = signal(Math.round(initial * 10 ** decimals));
    }

    get(): number {
        return this.minor.value / 10 ** this.decimals;
    }

    set(major: number): void {
        this.minor.value = Math.round(major * 10 ** this.decimals);
    }
}

/** Formats minor units as money: `$1,234.50`. */
export function money(minor: number, decimals: number, symbol = '$'): string {
    const neg = minor < 0;
    const s = Math.abs(Math.round(minor))
        .toString()
        .padStart(decimals + 1, '0');
    const int = s.slice(0, s.length - decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const frac = decimals ? `.${s.slice(s.length - decimals)}` : '';

    return `${neg ? '-' : ''}${symbol}${int}${frac}`;
}

/** What the host configures. */
export interface HudSpec {
    decimals?: number;
    betLevels?: readonly number[];
    betIndex?: number;
    autoplayCount?: number;
    balance?: number;
}

/**
 * The facade the host talks to. It owns every control, the input lock and the round rules:
 * during a round the bet locks, and autoplay counts down and stops when funds run out.
 */
export class HudModel {
    readonly bus = new Bus<HudEvents>();
    /** Ref-counted input lock (a modal, a feature intro). Every control folds it in. */
    readonly locks = signal(0);
    private readonly _open = computed([this.locks], () => this.locks.value === 0);
    readonly decimals: number;
    readonly balance: Readout;
    readonly win: Readout;
    readonly spin: SpinControl;
    readonly bet: BetControl;
    readonly turbo: ToggleControl;
    readonly sound: ToggleControl;
    readonly autoplay: AutoplayControl;
    /** One line under the bar: "PLACE YOUR BET", "WIN $12.00". */
    readonly message = signal('PRESS SPIN TO PLAY');

    constructor(spec: HudSpec = {}) {
        this.decimals = spec.decimals ?? 2;
        this.balance = new Readout('balance', 'BALANCE', this.decimals, spec.balance ?? 1000);
        this.win = new Readout('win', 'WIN', this.decimals, 0);
        this.spin = new SpinControl(this.bus, this._open);
        this.bet = new BetControl(
            spec.betLevels ?? [0.2, 0.5, 1, 2, 5, 10, 20, 50],
            spec.betIndex ?? 2,
            this.bus,
            this._open,
        );
        this.turbo = new ToggleControl('turbo', this.bus, this._open);
        this.sound = new ToggleControl('sound', this.bus, this._open, true);
        this.autoplay = new AutoplayControl(spec.autoplayCount ?? 25, this.bus, this._open);
    }

    on<K extends keyof HudEvents>(name: K, fn: (payload: HudEvents[K]) => void): () => void {
        return this.bus.on(name, fn);
    }

    /** Takes an input lock. Returns the release function. */
    lock(): () => void {
        this.locks.value++;
        let done = false;

        return () => {
            if (!done) this.locks.value--;
            done = true;
        };
    }

    /** The host starts a round: the bet is taken, the bet locks, the spin button goes busy. */
    startRound(): boolean {
        const bet = this.bet.bet.value;

        if (this.balance.get() + 1e-9 < bet) {
            this.message.value = 'INSUFFICIENT FUNDS';
            this.autoplay.stop();

            return false;
        }
        this.balance.set(this.balance.get() - bet);
        this.win.set(0);
        this.bet.go('locked');
        this.spin.busy();
        this.message.value =
            this.autoplay.state.value === 'running' ? `AUTOPLAY ${this.autoplay.left.value} LEFT` : 'GOOD LUCK!';

        return true;
    }

    /** The host settles a round, in major units. Returns true when autoplay wants another one. */
    reportRound(win: number): boolean {
        this.win.set(win);
        this.balance.set(this.balance.get() + win);
        this.bet.go('idle');
        this.spin.idle();
        this.message.value = win > 0 ? `WIN ${money(this.win.minor.value, this.decimals)}` : 'PRESS SPIN TO PLAY';
        if (this.autoplay.state.value !== 'running') return false;
        this.autoplay.left.value--;
        if (this.autoplay.left.value <= 0 || this.balance.get() + 1e-9 < this.bet.bet.value) {
            this.autoplay.stop();

            return false;
        }

        return true;
    }
}
