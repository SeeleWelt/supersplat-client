import { Container, Element, Label } from '@playcanvas/pcui';

const createSvg = (svgString: string) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new Element({
        dom: new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement
    });
};

const createActionButton = (className: string | string[], text: string, icon: string, onSelect: () => void | Promise<void>) => {
    const action = new Container({
        class: className
    });
    action.dom.setAttribute('role', 'button');
    action.dom.setAttribute('tabindex', '0');
    action.dom.appendChild(createSvg(icon).dom);
    action.append(new Label({
        text,
        class: 'workspace-action-label'
    }));

    const run = () => {
        onSelect();
    };

    action.dom.addEventListener('click', run);
    action.dom.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            run();
        }
    });

    return action;
};

export { createActionButton, createSvg };
