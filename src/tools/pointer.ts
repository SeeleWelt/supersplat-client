type ElementPoint = {
    x: number;
    y: number;
    width: number;
    height: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const elementSize = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    return {
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height))
    };
};

const pointerToElement = (event: PointerEvent | MouseEvent, element: HTMLElement): ElementPoint => {
    const rect = element.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);

    return {
        x: clamp(event.clientX - rect.left, 0, width),
        y: clamp(event.clientY - rect.top, 0, height),
        width,
        height
    };
};

const resizeCanvasToElement = (canvas: HTMLCanvasElement, element: HTMLElement) => {
    const { width, height } = elementSize(element);
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }
};

export { elementSize, pointerToElement, resizeCanvasToElement };
