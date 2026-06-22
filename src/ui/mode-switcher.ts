import { Button, Container } from '@playcanvas/pcui';

import { Events } from '../events';
import { localize } from './localization';

class ModeSwitcher extends Container {
    private viewerButton: Button;
    private editorButton: Button;

    constructor(events: Events, args = {}) {
        args = {
            ...args,
            id: 'mode-switcher'
        };

        super(args);

        this.viewerButton = new Button({
            class: 'mode-switcher-button',
            text: localize('workspace.mode.viewer')
        });

        this.editorButton = new Button({
            class: 'mode-switcher-button',
            text: localize('workspace.mode.editor')
        });

        this.viewerButton.on('click', () => events.fire('viewer.setAdvancedMode', false));
        this.editorButton.on('click', () => events.fire('viewer.setAdvancedMode', true));

        this.append(this.viewerButton);
        this.append(this.editorButton);

        const update = (advanced: boolean) => {
            this.viewerButton.dom.classList.toggle('active', !advanced);
            this.editorButton.dom.classList.toggle('active', advanced);
            this.dom.setAttribute('aria-label', localize('workspace.mode.label'));
        };

        events.on('viewer.advancedMode', update);
        update(!!events.functions.get('viewer.advancedMode')?.());
    }
}

export { ModeSwitcher };
