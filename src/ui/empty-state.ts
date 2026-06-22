import { Container, Label } from '@playcanvas/pcui';

import { Events } from '../events';
import { localize } from './localization';
import sceneImport from './svg/import.svg';
import sceneOpen from './svg/open.svg';
import { createActionButton } from './workspace-actions';

class EmptyState extends Container {
    constructor(events: Events, onEnterWorkspace: () => void, onDismiss: () => void, args = {}) {
        args = {
            ...args,
            id: 'empty-state',
            hidden: true
        };

        super(args);

        const panel = new Container({
            class: 'empty-state-panel'
        });

        const header = new Container({
            class: 'empty-state-header'
        });

        header.append(new Label({
            class: 'empty-state-title',
            text: localize('workspace.empty.title')
        }));

        const dismiss = () => {
            this.hidden = true;
            onDismiss();
        };

        const closeButton = document.createElement('button');
        closeButton.className = 'empty-state-close';
        closeButton.type = 'button';
        closeButton.setAttribute('aria-label', localize('workspace.empty.close'));
        closeButton.textContent = 'x';

        closeButton.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            event.stopPropagation();
            dismiss();
        });

        closeButton.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            dismiss();
        });

        closeButton.addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                dismiss();
            }
        });

        header.dom.appendChild(closeButton);
        panel.append(header);
        panel.append(new Label({
            class: 'empty-state-text',
            text: localize('workspace.empty.text')
        }));

        const actions = new Container({
            class: 'empty-state-actions'
        });

        actions.append(createActionButton(['workspace-action', 'compact', 'primary'], localize('workspace.action.import-model'), sceneImport, async () => {
            const result = await events.invoke('scene.import');
            if (result !== false) {
                onEnterWorkspace();
            }
        }));

        actions.append(createActionButton(['workspace-action', 'compact'], localize('workspace.action.import-scene'), sceneOpen, async () => {
            const ok = await events.invoke('doc.open');
            if (ok) {
                onEnterWorkspace();
            }
        }));

        panel.append(actions);
        this.append(panel);
    }
}

export { EmptyState };
