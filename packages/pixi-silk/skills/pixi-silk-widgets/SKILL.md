---
name: pixi-silk-widgets
description: "Use this skill when building interface widgets on a PixiJS canvas with pixi-silk. Covers SilkButton (shapes, icons, press and hold, busy state, show and hide animations), ButtonDock, RadialMenu with submenus and bindRadialTrigger, ValuePill, Odometer, JogDial and Scrubber, SegmentedSwitch, ContextHalo, trackGesture, input profiles per pointer kind, widget state as signals (signal, computed, watch, batch from pixi-silk/signal), driving widgets without a ticker. Triggers on: SilkButton, button, ButtonDock, RadialMenu, radial menu, ring menu, Odometer, rolling counter, JogDial, Scrubber, SegmentedSwitch, ContextHalo, ValuePill, trackGesture, signal, computed, pixi-silk/ui, pixi-silk/signal."
license: MIT
---

Each widget is a Pixi `Container` drawn with SilkGraphics, under its own entry point (`pixi-silk/ui/button`, `pixi-silk/ui/radial` ...). Its state is a set of signals on `widget.state`, so an app binds to it with a callback, without a framework. Widgets animate on `Ticker.shared` while something moves, and leave the ticker when idle.

## Quick Start

```ts
import { Container } from 'pixi.js';
import { SilkButton } from 'pixi-silk/ui/button';

const drawPlay = (g: import('pixi-silk').SilkGraphics, size: number) => {
    g.triangle(-size * 0.3, -size * 0.4, size * 0.45, 0, -size * 0.3, size * 0.4, size * 0.08).fill(0xffffff);
};
const play = new SilkButton({ shape: 'circle', height: 64, icon: drawPlay, holdMs: 450, onPress: () => console.log('play'), onHold: () => console.log('loop') });
const save = new SilkButton({ label: 'Save', shape: 'squircle' });
const bar = new Container();

save.x = 90;
bar.addChild(play, save);
app.stage.addChild(bar);
play.state.busy.set(true); // spinner, input off
```

## Core Patterns

### Signals

```ts
import { batch, computed, signal, watch } from 'pixi-silk/signal';

const count = signal(1);
const label = computed([count], () => `${count.value} items`);
const stop = watch(label, (text) => console.log(text)); // runs now and on every change

count.subscribe((now, before) => console.log(before, 'to', now));
batch(() => {
    count.set(2);
    count.value = 3;
}); // one notification
stop();
```

### Radial menu

```ts
import { Container } from 'pixi.js';
import { bindRadialTrigger, RadialMenu } from 'pixi-silk/ui/radial';

const trigger = new Container();
const menu = new RadialMenu({
    items: [
        { id: 'select', label: 'Select' },
        { id: 'move', label: 'Move', children: [{ id: 'axis', label: 'Axis' }, { id: 'free', label: 'Free' }] },
        { id: 'delete', label: 'Delete', disabled: true },
    ],
    sweep: Math.PI * 2, // Math.PI for a half ring
    bounds: { x: 0, y: 0, width: app.screen.width, height: app.screen.height },
    onSelect: (item, path) => console.log(path.map((i) => i.id).join(' > '), item.id),
});

app.stage.addChild(trigger, menu);
bindRadialTrigger(trigger, menu); // or menu.openAt(x, y, event)
```

### Dock, odometer, dial

```ts
import { ButtonDock } from 'pixi-silk/ui/dock';
import { SilkButton } from 'pixi-silk/ui/button';
import { JogDial } from 'pixi-silk/ui/dial';
import { Odometer } from 'pixi-silk/ui/odometer';

const undo = new SilkButton({ label: 'Undo' });
const dock = new ButtonDock({ direction: 'row', gap: 12 }).add(new SilkButton({ label: 'Cut' }), undo);
const total = new Odometer({ value: 1250, decimals: 2, prefix: '$', fontSize: 44 });
const zoom = new JogDial({ radius: 64, turn: 2, step: 0.1, min: 0.1, max: 8, onChange: (v) => console.log(v) });

await undo.hide(); // the dock closes the gap; resolves when the animation ends
total.set(9800); // counts up, longer for bigger jumps
total.skip(); // straight to the end
app.stage.addChild(dock, total, zoom);
```

### Widgets without a ticker

```ts
import { SilkButton } from 'pixi-silk/ui/button';

const button = new SilkButton({ label: 'Step', ticker: null });

app.ticker.add((t) => button.tick(t.deltaMS / 1000)); // advance it yourself, in seconds
```

## Common Mistakes

### [HIGH] Importing everything from `pixi-silk/ui`

Symptom: the bundle carries every widget and the editor kit. `pixi-silk/ui` is a convenience barrel. Import from the per-widget subpath.

Wrong:

```ts nocheck
import { SilkButton } from 'pixi-silk/ui';
```

Correct:

```ts
import { SilkButton } from 'pixi-silk/ui/button';

app.stage.addChild(new SilkButton({ label: 'OK' }));
```

### [HIGH] Mutating an object inside a signal

Symptom: subscribers never fire. A signal compares with `Object.is`, so `items.value.push(x)` is not a change. Write a new value: `items.update((list) => [...list, x])`.

### [HIGH] `ticker: null` without calling `tick(dt)`

Symptom: the widget freezes mid-animation. With `ticker: null` you drive it: call `widget.tick(dt)` every frame, with `dt` in seconds.

### [MEDIUM] A radial menu without `bounds`

Symptom: a partial ring (`sweep` under a full turn) opens off screen near an edge. Pass `bounds`, the screen rectangle, so it turns to face the inside.

### [MEDIUM] Blurry widget labels under zoom

Symptom: labels soften when the stage scales. Widgets use Pixi `Text` by default. Pass `label: silkLabel()` from `pixi-silk/text` where a widget takes a label factory, such as `ValuePill`.

## API Reference

- [pixi-silk/ui/button](https://pixi-silk.schmooky.dev/api/ui/button.md), [pixi-silk/ui/dock](https://pixi-silk.schmooky.dev/api/ui/dock.md), [pixi-silk/ui/radial](https://pixi-silk.schmooky.dev/api/ui/radial.md)
- [pixi-silk/ui/odometer](https://pixi-silk.schmooky.dev/api/ui/odometer.md), [pixi-silk/ui/dial](https://pixi-silk.schmooky.dev/api/ui/dial.md), [pixi-silk/ui/pill](https://pixi-silk.schmooky.dev/api/ui/pill.md), [pixi-silk/ui/modes](https://pixi-silk.schmooky.dev/api/ui/modes.md), [pixi-silk/ui/gesture](https://pixi-silk.schmooky.dev/api/ui/gesture.md)
- [pixi-silk/signal](https://pixi-silk.schmooky.dev/api/signal.md)
- Guides: [Radial menus and buttons](https://pixi-silk.schmooky.dev/docs/radial-menus-and-buttons.md), [Dials and timeline](https://pixi-silk.schmooky.dev/docs/dials-and-timeline.md)
