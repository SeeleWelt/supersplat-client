import { Container, Element, Label } from '@playcanvas/pcui';

import { localize } from './localization';

class Spinner extends Container {
    setMessage: (message?: string) => void;

    constructor(args = {}) {
        args = {
            ...args,
            id: 'spinner-container',
            hidden: true
        };

        super(args);

        this.dom.tabIndex = 0;

        const panel = new Container({
            class: 'spinner-panel'
        });

        const spinner = new Element({
            dom: 'div',
            class: 'spinner'
        });

        const title = new Label({
            class: 'spinner-title',
            text: localize('busy.title')
        });

        const message = new Label({
            class: 'spinner-message'
        });

        const progress = new Element({
            dom: 'div',
            class: 'spinner-progress'
        });

        panel.append(spinner);
        panel.append(title);
        panel.append(message);
        panel.append(progress);

        this.append(panel);

        this.setMessage = (text?: string) => {
            message.text = text || localize('busy.default');
        };

        this.setMessage();

        this.dom.addEventListener('keydown', (event) => {
            if (this.hidden) return;
            event.stopPropagation();
            event.preventDefault();
        });
    }
}

export { Spinner };
