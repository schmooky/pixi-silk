import type { Container } from 'pixi.js';
import { Camera, zoomLabel } from 'pixi-silk/ui/camera';

/**
 * Pan and zoom for Studio's preview, on the library camera. SDF shapes stay sharp at any zoom,
 * so the range is wide. A small `- 100% +` bar sits in the corner: the percentage resets the view.
 */
export function attachCamera(root: Container, host: HTMLElement): Camera {
    const camera = new Camera({ world: root, element: host, zoomRange: [0.05, 100_000] });
    const bar = document.createElement('div');
    const button = (text: string, title: string, onclick: () => void) => {
        const el = Object.assign(document.createElement('button'), {
            type: 'button',
            textContent: text,
            title,
            onclick,
        });

        bar.append(el);

        return el;
    };

    bar.className = 'studio-zoom';
    button('−', 'Zoom out (-)', () => camera.zoomBy(1 / 1.5));
    const label = button(
        '100%',
        'Reset the view. Pinch or ctrl + scroll zooms. Scroll, Space + drag or right drag pans.',
        () => camera.reset(),
    );

    button('+', 'Zoom in (+)', () => camera.zoomBy(1.5));
    // the bar is part of the host, so clicks on it must not start a pan or reach the demo
    bar.addEventListener('pointerdown', (e) => e.stopPropagation(), true);
    host.append(bar);
    camera.state.zoom.subscribe((k) => {
        label.textContent = zoomLabel(k);
    });
    const moved = () =>
        bar.classList.toggle('moved', camera.zoom !== 1 || camera.state.x.value !== 0 || camera.state.y.value !== 0);

    camera.state.x.subscribe(moved);
    camera.state.y.subscribe(moved);
    camera.state.zoom.subscribe(moved);

    return camera;
}
