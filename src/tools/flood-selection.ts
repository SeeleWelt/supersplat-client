import { Button, Container, NumericInput } from '@playcanvas/pcui';

import { Events } from '../events';
import { elementSize, pointerToElement } from './pointer';
import { localize } from '../ui/localization';

type Pt = {x : number, y: number };

const RED = 0;
const GREEN = 1;
const BLUE = 2;
const ALPHA = 3;
const PIXEL = 4;
const VISITED = 1;
const EMPTY_ALPHA = 8;

class FloodSelection {
    activate: () => void;
    deactivate: () => void;

    constructor(events: Events, parent: HTMLElement, mask: { canvas: HTMLCanvasElement, context: CanvasRenderingContext2D }, canvasContainer: Container) {

        // create canvas
        const { canvas, context } = mask;

        const defaultThreshold = 0.2;
        let threshold = defaultThreshold;
        let point: Pt;
        let imageData: ImageData;

        // ui
        const selectToolbar = new Container({
            class: 'select-toolbar',
            hidden: true
        });

        selectToolbar.dom.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
        });

        const thresholdInput = new NumericInput({
            value: threshold,
            placeholder: 'Threshold',
            width: 120,
            precision: 3,
            min: 0.001,
            max: 0.999
        });
        const resetButton = new Button({ text: localize('panel.colors.reset'), class: ['select-toolbar-button', 'reset-action-button', 'select-toolbar-reset-button'] });
        selectToolbar.append(thresholdInput);
        selectToolbar.append(resetButton);

        canvasContainer.append(selectToolbar);

        const apply = async (op: 'set' | 'add' | 'remove') => {
            await events.invoke(
                'select.byMask',
                op,
                canvas,
                context
            );
        };

        const refreshSelection = async () => {
            if (!point) return;

            const { width, height } = elementSize(parent);

            if (!imageData || canvas.width !== width || canvas.height !== height) {
                canvas.width = width;
                canvas.height = height;
                imageData = context.createImageData(width, height);
            }

            const data = await (events.invoke('render.offscreen', width, height) as Promise<Uint8Array>);
            let current: Pt = {
                ...point
            };

            let idx = (current.y * width + current.x) * PIXEL;
            const pickedRed = data[idx + RED];
            const pickedGreen = data[idx + GREEN];
            const pickedBlue = data[idx + BLUE];
            const pickedAlpha = data[idx + ALPHA];

            const testPixels: Pt[] = [current];
            const d = imageData.data;

            d.fill(0);

            if (pickedAlpha < EMPTY_ALPHA) {
                context.putImageData(imageData, 0, 0);
                return;
            }

            const visited = new Uint8Array(width * height);
            const colorThreshold = threshold * 255;

            const isColorMatch = (pixel: number) => {
                if (data[pixel + ALPHA] < EMPTY_ALPHA) {
                    return false;
                }

                return Math.abs(data[pixel + RED] - pickedRed) <= colorThreshold &&
                    Math.abs(data[pixel + GREEN] - pickedGreen) <= colorThreshold &&
                    Math.abs(data[pixel + BLUE] - pickedBlue) <= colorThreshold;
            };

            while (testPixels.length > 0) {
                current = testPixels.pop();
                const pixelIndex = current.y * width + current.x;
                if (visited[pixelIndex] === VISITED) {
                    continue;
                }
                visited[pixelIndex] = VISITED;

                idx = (current.y * width + current.x) * PIXEL;
                if (isColorMatch(idx)) {
                    d[idx + RED] = 255;
                    d[idx + GREEN] = 0;
                    d[idx + BLUE] = 0;
                    d[idx + ALPHA] = 255;

                    if (current.x > 0 && visited[pixelIndex - 1] !== VISITED) testPixels.push({ x: current.x - 1, y: current.y });
                    if (current.x < width - 1 && visited[pixelIndex + 1] !== VISITED) testPixels.push({ x: current.x + 1, y: current.y });
                    if (current.y > 0 && visited[pixelIndex - width] !== VISITED) testPixels.push({ x: current.x, y: current.y - 1 });
                    if (current.y < height - 1 && visited[pixelIndex + width] !== VISITED) testPixels.push({ x: current.x, y: current.y + 1 });
                }
            }

            context.putImageData(imageData, 0, 0);
        };

        thresholdInput.on('change', () => {
            threshold = thresholdInput.value;
        });

        resetButton.dom.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            threshold = defaultThreshold;
            thresholdInput.value = defaultThreshold;
        });

        const isPrimary = (e: PointerEvent) => {
            return e.pointerType === 'mouse' ? e.button === 0 : e.isPrimary;
        };

        let clicked = false;

        const pointerdown = (e: PointerEvent) => {
            if (!clicked && isPrimary(e)) {
                e.preventDefault();
                e.stopPropagation();
                clicked = true;
            }
        };

        const pointermove = (e: PointerEvent) => {
            if (clicked) {
                e.preventDefault();
                e.stopPropagation();
            }
            clicked = false;
        };

        const pointerup = async (e: PointerEvent) => {
            if (clicked && isPrimary(e)) {
                e.preventDefault();
                e.stopPropagation();
                clicked = false;

                const localPoint = pointerToElement(e, parent);
                const { width, height } = elementSize(parent);
                point = {
                    x: Math.min(width - 1, Math.floor(localPoint.x)),
                    y: Math.min(height - 1, Math.floor(localPoint.y))
                };

                await refreshSelection();

                await apply(e.shiftKey ? 'add' : (e.ctrlKey ? 'remove' : 'set'));

                context.clearRect(0, 0, canvas.width, canvas.height);
            }
        };

        this.activate = () => {
            parent.style.display = 'block';
            selectToolbar.hidden = false;
            parent.addEventListener('pointerdown', pointerdown);
            parent.addEventListener('pointermove', pointermove);
            parent.addEventListener('pointerup', pointerup, true);
        };

        this.deactivate = () => {
            parent.style.display = 'none';
            selectToolbar.hidden = true;
            parent.removeEventListener('pointerdown', pointerdown);
            parent.removeEventListener('pointermove', pointermove);
            parent.removeEventListener('pointerup', pointerup, true);
            point = undefined;
        };
    }
}

export { FloodSelection };
