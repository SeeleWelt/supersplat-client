import { Container, Element, Label } from '@playcanvas/pcui';

const createSvg = (svgString: string) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new Element({
        dom: new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement
    });
};

const createActionButton = (className: string | string[], text: string, icon: string, onSelect: () => void | Promise<void>) => {
    const action = new Container({
        dom: 'button',
        class: className
    });
    action.dom.setAttribute('type', 'button');
    action.dom.appendChild(createSvg(icon).dom);
    action.append(new Label({
        text,
        class: 'workspace-action-label'
    }));

    let pointerHandled = false;

    const run = (event?: Event) => {
        event?.preventDefault();
        event?.stopPropagation();
        onSelect();
    };

    action.dom.addEventListener('pointerdown', (event: PointerEvent) => {
        pointerHandled = true;
        run(event);
        window.setTimeout(() => {
            pointerHandled = false;
        });
    });

    action.dom.addEventListener('click', (event: MouseEvent) => {
        if (pointerHandled) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        run(event);
    });
    action.dom.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
            run(event);
        }
    });

    return action;
};

export { createActionButton, createSvg };
