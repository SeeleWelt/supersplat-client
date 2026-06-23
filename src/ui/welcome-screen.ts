import { Container, Label } from '@playcanvas/pcui';

import { Events } from '../events';
import { recentFiles } from '../recent-files';
import { localize } from './localization';
import sceneImport from './svg/import.svg';
import sceneNew from './svg/new.svg';
import sceneOpen from './svg/open.svg';
import { createActionButton } from './workspace-actions';

type ImportFile = {
    filename: string;
    contents: File;
};

class WelcomeScreen extends Container {
    private recentList: Container;
    private emptyRecent: Label;
    private events: Events;
    private onEnterWorkspace: () => void;

    constructor(events: Events, onEnterWorkspace: () => void, args = {}) {
        args = {
            ...args,
            id: 'welcome-screen'
        };

        super(args);

        this.events = events;
        this.onEnterWorkspace = onEnterWorkspace;

        const shell = new Container({
            class: 'welcome-shell'
        });

        const heading = new Container({
            class: 'welcome-heading'
        });

        heading.append(new Label({
            class: 'welcome-kicker',
            text: localize('workspace.welcome.kicker')
        }));
        heading.append(new Label({
            class: 'welcome-title',
            text: localize('workspace.welcome.title')
        }));
        heading.append(new Label({
            class: 'welcome-subtitle',
            text: localize('workspace.welcome.subtitle')
        }));

        const actions = new Container({
            class: 'welcome-actions'
        });

        actions.append(createActionButton(['workspace-action', 'primary'], localize('workspace.action.new'), sceneNew, async () => {
            const ok = await events.invoke('doc.new');
            if (ok !== false) {
                this.onEnterWorkspace();
            }
        }));

        actions.append(createActionButton('workspace-action', localize('workspace.action.open'), sceneOpen, async () => {
            const ok = await events.invoke('doc.open');
            if (ok) {
                this.onEnterWorkspace();
            }
        }));

        actions.append(createActionButton('workspace-action', localize('workspace.action.import'), sceneImport, async () => {
            const result = await events.invoke('scene.import');
            if (result !== false) {
                this.onEnterWorkspace();
            }
        }));

        const dragPanel = document.createElement('div');
        dragPanel.className = 'welcome-drag-panel';
        const dragHint = document.createElement('p');
        dragHint.className = 'welcome-drag-panel-text';
        dragHint.textContent = localize('workspace.welcome.drag-hint');
        dragPanel.appendChild(dragHint);

        const recent = new Container({
            class: 'welcome-recent'
        });

        const recentHeader = new Container({
            class: 'welcome-section-header'
        });
        recentHeader.append(new Label({
            class: 'welcome-section-title',
            text: localize('workspace.recent')
        }));

        this.recentList = new Container({
            class: 'welcome-recent-list'
        });
        this.emptyRecent = new Label({
            class: 'welcome-empty-recent',
            text: localize('workspace.recent.empty')
        });

        recent.append(recentHeader);
        recent.append(this.recentList);
        recent.append(this.emptyRecent);

        shell.append(heading);
        shell.append(actions);
        shell.dom.appendChild(dragPanel);
        shell.append(recent);
        this.append(shell);

        const setDragActive = (active: boolean) => {
            this.dom.classList.toggle('drag-active', active);
        };

        this.dom.addEventListener('dragenter', (event) => {
            event.preventDefault();
            setDragActive(true);
        });

        this.dom.addEventListener('dragover', (event) => {
            event.preventDefault();
        });

        this.dom.addEventListener('dragleave', (event) => {
            const nextTarget = event.relatedTarget;
            if (!nextTarget || !this.dom.contains(nextTarget as Node)) {
                setDragActive(false);
            }
        });

        this.dom.addEventListener('drop', async (event: DragEvent) => {
            event.preventDefault();
            setDragActive(false);

            if ((event as any).__supersplatDropHandled) {
                return;
            }

            const files = Array.from(event.dataTransfer?.files ?? []).map((file): ImportFile => {
                return {
                    filename: file.webkitRelativePath || file.name,
                    contents: file
                };
            });

            const result = await events.invoke('import', files);
            if (result !== false) {
                this.onEnterWorkspace();
            }
        });

        this.refreshRecent();
    }

    async refreshRecent() {
        const files = await recentFiles.get();
        this.recentList.clear();
        this.emptyRecent.hidden = files.length > 0;

        files.slice(0, 8).forEach((file) => {
            const row = new Container({
                class: 'welcome-recent-row'
            });
            row.dom.setAttribute('role', 'button');
            row.dom.setAttribute('tabindex', '0');

            row.append(new Label({
                class: 'welcome-recent-name',
                text: file.name
            }));
            row.append(new Label({
                class: 'welcome-recent-date',
                text: new Intl.DateTimeFormat(undefined, {
                    month: '2-digit',
                    day: '2-digit'
                }).format(file.date)
            }));

            const open = async () => {
                const ok = await this.events.invoke('doc.openRecent', file.handle);
                if (ok) {
                    this.onEnterWorkspace();
                }
            };

            row.dom.addEventListener('click', () => {
                open();
            });
            row.dom.addEventListener('keydown', (event: KeyboardEvent) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    open();
                }
            });

            this.recentList.append(row);
        });
    }
}

export { WelcomeScreen };
