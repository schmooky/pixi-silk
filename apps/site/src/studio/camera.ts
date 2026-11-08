import type { Container } from 'pixi.js';

/** How far the camera zooms. Past about 1e5 float precision in the shaders starts to show. */
const MIN = 0.05;
const MAX = 100_000;

export interface Camera {
    /** Back to 100%, centred. */
    reset(): void;
    /** Removes every listener and the badge. */
    destroy(): void;
}

/**
 * Pan and zoom for Studio's preview. The demo keeps its own pointer input, so the camera takes
 * gestures a demo never uses:
 * - trackpad pinch or ctrl / cmd + wheel zooms around the cursor, scroll pans
 * - Space + drag, middle drag or right drag pans
 * - two fingers on a touch screen pinch and pan
 * - `0` resets, `+` and `-` zoom around the centre, and so does the badge
 */
export function attachCamera(root: Container, host: HTMLElement): Camera {
    let k = 1;
    let x = 0;
    let y = 0;
    let space = false;
    let pan: { id: number; x: number; y: number } | null = null;
    const touches = new Map<number, { x: number; y: number }>();
    let pinch: { d: number; cx: number; cy: number } | null = null;

    // zoom out, the zoom level (click to reset), zoom in
    const bar = document.createElement('div');
    const button = (text: string, title: string) => {
        const el = Object.assign(document.createElement('button'), { type: 'button', textContent: text, title });

        bar.append(el);

        return el;
    };
    const out = button('\u2212', 'Zoom out (-)');
    const badge = button(
        '100%',
        'Reset the view (0). Pinch or ctrl + scroll zooms. Scroll, Space + drag or right drag pans.',
    );
    const zin = button('+', 'Zoom in (+)');

    bar.className = 'studio-zoom';
    host.append(bar);

    const apply = () => {
        root.scale.set(k);
        root.position.set(x, y);
        badge.textContent = label(k);
        bar.classList.toggle('moved', k !== 1 || x !== 0 || y !== 0);
        host.classList.toggle('studio-panning', pan !== null || space);
    };
    const local = (e: { clientX: number; clientY: number }) => {
        const r = host.getBoundingClientRect();

        return [e.clientX - r.left, e.clientY - r.top] as const;
    };
    /** Zooms by `f` keeping the point (px, py) of the view still. */
    const zoomAt = (f: number, px: number, py: number) => {
        const next = Math.min(MAX, Math.max(MIN, k * f));
        const g = next / k;

        x = px - (px - x) * g;
        y = py - (py - y) * g;
        k = next;
        apply();
    };
    const zoomCentre = (f: number) => zoomAt(f, host.clientWidth / 2, host.clientHeight / 2);
    const reset = () => {
        k = 1;
        x = 0;
        y = 0;
        apply();
    };

    const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        const [px, py] = local(e);
        const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? host.clientHeight : 1;
        const dx = e.deltaX * scale;
        const dy = e.deltaY * scale;
        // Like Figma: a trackpad pinch arrives as ctrl + wheel and zooms, so does ctrl or cmd + a
        // mouse wheel. A plain wheel or two-finger scroll pans (Shift turns it sideways).
        if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-dy * (Math.abs(dy) < 50 ? 0.01 : 0.002)), px, py);
        else {
            x -= e.shiftKey && dx === 0 ? dy : dx;
            y -= e.shiftKey && dx === 0 ? 0 : dy;
            apply();
        }
    };

    // Capture phase on the host, so a pan never reaches the demo underneath.
    const onDown = (e: PointerEvent) => {
        if (bar.contains(e.target as Node)) return;
        if (e.pointerType === 'touch') {
            touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (touches.size === 2) {
                pinch = pinchOf(touches);
                e.stopPropagation();
            }
            return;
        }
        if (!(space && e.button === 0) && e.button !== 1 && e.button !== 2) return;
        e.preventDefault();
        e.stopPropagation();
        pan = { id: e.pointerId, x: e.clientX, y: e.clientY };
        try {
            host.setPointerCapture(e.pointerId);
        } catch {
            // the pointer is already gone: the move and up handlers still end the pan
        }
        apply();
    };
    const onMove = (e: PointerEvent) => {
        if (touches.has(e.pointerId)) {
            touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (pinch && touches.size === 2) {
                e.stopPropagation();
                const next = pinchOf(touches);
                const [px, py] = local({ clientX: next.cx, clientY: next.cy });

                x += next.cx - pinch.cx;
                y += next.cy - pinch.cy;
                zoomAt(next.d / pinch.d, px, py);
                pinch = next;
            }
            return;
        }
        if (pan?.id !== e.pointerId) return;
        e.stopPropagation();
        x += e.clientX - pan.x;
        y += e.clientY - pan.y;
        pan.x = e.clientX;
        pan.y = e.clientY;
        apply();
    };
    const onUp = (e: PointerEvent) => {
        if (touches.delete(e.pointerId)) {
            if (pinch) e.stopPropagation();
            if (touches.size < 2) pinch = null;
            return;
        }
        if (pan?.id !== e.pointerId) return;
        e.stopPropagation();
        pan = null;
        apply();
    };
    const onMenu = (e: Event) => e.preventDefault();
    const onKey = (e: KeyboardEvent) => {
        const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement;

        if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.code === 'Space') {
            e.preventDefault();
            space = e.type === 'keydown';
            apply();
        } else if (e.type === 'keydown') {
            if (e.key === '0') reset();
            else if (e.key === '+' || e.key === '=') zoomCentre(1.5);
            else if (e.key === '-' || e.key === '_') zoomCentre(1 / 1.5);
        }
    };

    badge.onclick = reset;
    out.onclick = () => zoomCentre(1 / 1.5);
    zin.onclick = () => zoomCentre(1.5);
    host.addEventListener('wheel', onWheel, { passive: false });
    host.addEventListener('pointerdown', onDown, true);
    host.addEventListener('pointermove', onMove, true);
    host.addEventListener('pointerup', onUp, true);
    host.addEventListener('pointercancel', onUp, true);
    host.addEventListener('contextmenu', onMenu);
    addEventListener('keydown', onKey);
    addEventListener('keyup', onKey);
    apply();

    return {
        reset,
        destroy() {
            host.removeEventListener('wheel', onWheel);
            host.removeEventListener('pointerdown', onDown, true);
            host.removeEventListener('pointermove', onMove, true);
            host.removeEventListener('pointerup', onUp, true);
            host.removeEventListener('pointercancel', onUp, true);
            host.removeEventListener('contextmenu', onMenu);
            removeEventListener('keydown', onKey);
            removeEventListener('keyup', onKey);
            bar.remove();
        },
    };
}

function pinchOf(touches: Map<number, { x: number; y: number }>) {
    const [a, b] = [...touches.values()];

    return { d: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
}

/** 100%, 2.5k%, 1.2M%: short enough for a badge at any zoom. */
function label(k: number): string {
    const p = k * 100;

    if (p >= 1e6) return `${(p / 1e6).toFixed(1)}M%`;
    if (p >= 1e4) return `${(p / 1e3).toFixed(1)}k%`;

    return `${p >= 100 ? Math.round(p) : p.toFixed(p >= 10 ? 0 : 1)}%`;
}
