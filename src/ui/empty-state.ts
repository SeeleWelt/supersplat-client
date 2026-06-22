import { Container, Label } from '@playcanvas/pcui';

import { Events } from '../events';
import { localize } from './localization';
import sceneImport from './svg/import.svg';
import sceneNew from './svg/new.svg';
import sceneOpen from './svg/open.svg';
import { createActionButton } from './workspace-actions';

class EmptyState extends Container {
    constructor(events: Events, onEnterWorkspace: () => void, args = {}) {
        args = {
            ...args,
            id: 'empty-state',
            hidden: true
        };

        super(args);

        const panel = new Container({
            class: 'empty-state-panel'
        });

        panel.append(new Label({
            class: 'empty-state-title',
            text: localize('workspace.empty.title')
        }));
        panel.append(new Label({
            class: 'empty-state-text',
            text: localize('workspace.empty.text')
        }));

        const actions = new Container({
            class: 'empty-state-actions'
        });

        actions.append(createActionButton(['workspace-action', 'compact', 'primary'], localize('workspace.action.import'), sceneImport, async () => {
            const result = await events.invoke('scene.import');
            if (result !== false) {
                onEnterWorkspace();
            }
        }));

        actions.append(createActionButton(['workspace-action', 'compact'], localize('workspace.action.open'), sceneOpen, async () => {
            const ok = await events.invoke('doc.open');
            if (ok) {
                onEnterWorkspace();
            }
        }));

        actions.append(createActionButton(['workspace-action', 'compact'], localize('workspace.action.new'), sceneNew, async () => {
            const ok = await events.invoke('doc.new');
            if (ok !== false) {
                onEnterWorkspace();
            }
        }));

        panel.append(actions);
        this.append(panel);
    }
}

export { EmptyState };
