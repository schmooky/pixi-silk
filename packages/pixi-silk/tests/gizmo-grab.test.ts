import {
    Container,
    EventBoundary,
    FederatedContainer,
    FederatedPointerEvent,
    Rectangle,
    updateRenderGroupTransforms,
} from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { TransformGizmo, type TransformGizmoOptions } from '../src/ui/gizmo';

// the EventSystem adds these to Container when a renderer starts; there is none in node
Container.mixin(FederatedContainer);

/**
 * A stage with a pressable box and a gizmo in an overlay above it, driven through Pixi's own
 * EventBoundary, so presses, releases and moves reach the objects Pixi would send them to.
 */
const rig = (options: TransformGizmoOptions = {}) => {
    const stage = new Container();
    const box = new Container();
    const overlay = new Container();
    const gizmo = new TransformGizmo({ ticker: null, readout: false, ...options });
    const boundary = new EventBoundary(stage);

    stage.enableRenderGroup();
    stage.eventMode = 'static';
    box.eventMode = 'static';
    box.hitArea = new Rectangle(-50, -25, 100, 50);
    box.position.set(200, 100);
    stage.addChild(box, overlay);
    overlay.addChild(gizmo);
    // press the box and move it in one go, the way grab() is meant to be used
    box.on('pointerdown', (e) => {
        gizmo.attach(box);
        gizmo.grab(e, 'move-free');
    });
    const send = (type: string, x: number, y: number) => {
        // hit testing reads world transforms, which a render would bring up to date
        if (stage.renderGroup) updateRenderGroupTransforms(stage.renderGroup, true);
        const e = new FederatedPointerEvent(boundary);

        e.type = type;
        e.pointerId = 1;
        e.pointerType = 'mouse';
        e.isPrimary = true;
        e.button = 0;
        e.buttons = type === 'pointerup' ? 0 : 1;
        e.global.set(x, y);
        e.screen.set(x, y);
        boundary.mapEvent(e);
    };

    return { box, gizmo, send };
};

describe('TransformGizmo.grab', () => {
    it('ends the drag when the pointer is released over the pressed object', () => {
        const { box, gizmo, send } = rig();

        send('pointerdown', 200, 100);
        expect(gizmo.state.dragging.value).toBe(true);
        send('pointermove', 260, 130);
        expect(box.x).toBe(260);
        send('pointerup', 260, 130);
        expect(gizmo.state.dragging.value).toBe(false);
        // the box no longer follows the pointer
        send('pointermove', 400, 300);
        expect(box.position).toMatchObject({ x: 260, y: 130 });
    });

    it('ends the drag when the pointer is released outside every object', () => {
        const onChange = vi.fn();
        const onEnd = vi.fn();
        // apply: false keeps the box where it is, so the release lands outside it
        const { gizmo, send } = rig({ apply: false, onChange, onEnd });

        send('pointerdown', 200, 100);
        send('pointermove', 700, 600);
        send('pointerup', 700, 600);
        expect(gizmo.state.dragging.value).toBe(false);
        expect(onEnd).toHaveBeenCalledOnce();
        const calls = onChange.mock.calls.length;

        send('pointermove', 800, 650);
        expect(onChange.mock.calls.length).toBe(calls);
    });

    it('ends the drag on a pointercancel sent to the pressed object', () => {
        const { box, gizmo, send } = rig();

        send('pointerdown', 200, 100);
        send('pointermove', 230, 110);
        // Pixi does not map the browser's pointercancel, so an app forwards it to the pressed object
        const cancel = new FederatedPointerEvent(new EventBoundary(box));

        cancel.type = 'pointercancel';
        cancel.pointerId = 1;
        box.emit('pointercancel', cancel);
        expect(gizmo.state.dragging.value).toBe(false);
        send('pointermove', 400, 300);
        expect(box.x).toBe(230);
    });

    it('ends the drag when the window loses focus or cancels the pointer', () => {
        const target = new EventTarget();

        vi.stubGlobal('addEventListener', target.addEventListener.bind(target));
        vi.stubGlobal('removeEventListener', target.removeEventListener.bind(target));
        try {
            const { gizmo, send } = rig();

            send('pointerdown', 200, 100);
            target.dispatchEvent(new Event('blur'));
            expect(gizmo.state.dragging.value).toBe(false);
            send('pointerdown', 200, 100);
            const other = Object.assign(new Event('pointercancel'), { pointerId: 2 });
            const same = Object.assign(new Event('pointercancel'), { pointerId: 1 });

            target.dispatchEvent(other);
            expect(gizmo.state.dragging.value).toBe(true);
            target.dispatchEvent(same);
            expect(gizmo.state.dragging.value).toBe(false);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('stops listening on the pressed object once the drag ends', () => {
        const { box, send } = rig();

        send('pointerdown', 200, 100);
        send('pointerup', 200, 100);
        expect(box.listenerCount('pointerup')).toBe(0);
        expect(box.listenerCount('pointerupoutside')).toBe(0);
        expect(box.listenerCount('pointercancel')).toBe(0);
    });
});
