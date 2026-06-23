import { Button, Container, Label } from '@playcanvas/pcui';

import { Events } from '../events';
import { ModelElement } from '../model-element';
import { ShortcutManager } from '../shortcut-manager';
import { Splat } from '../splat';
import { localize, formatInteger, formatTooltipWithShortcut } from './localization';
import { Tooltips } from './tooltips';

class StatusBar extends Container {
    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: 'status-bar'
        };

        super(args);

        // Track the currently active panel
        let activePanel = '';

        // Toggle buttons for panels
        const timelineButton = new Button({
            class: 'status-bar-toggle',
            text: localize('status-bar.timeline').toUpperCase()
        });

        const splatDataButton = new Button({
            class: 'status-bar-toggle',
            text: localize('status-bar.splat-data').toUpperCase()
        });

        const fileState = new Container({
            class: 'status-bar-file-state'
        });

        const fileNameLabel = new Label({
            class: 'status-bar-file-name',
            text: localize('workspace.untitled')
        });

        const saveStateLabel = new Label({
            class: ['status-bar-save-state', 'saved'],
            text: localize('workspace.file.saved')
        });

        fileState.append(fileNameLabel);
        fileState.append(saveStateLabel);

        // Panel toggle logic
        const setActivePanel = (panel: string) => {
            activePanel = panel;
            timelineButton.dom.classList[panel === 'timeline' ? 'add' : 'remove']('active');
            splatDataButton.dom.classList[panel === 'splatData' ? 'add' : 'remove']('active');
            events.fire('statusBar.panelChanged', panel || null);
        };

        timelineButton.on('click', () => {
            setActivePanel(activePanel === 'timeline' ? '' : 'timeline');
        });

        splatDataButton.on('click', () => {
            setActivePanel(activePanel === 'splatData' ? '' : 'splatData');
        });

        // Right section: stats
        const statsContainer = new Container({
            class: 'status-bar-stats'
        });

        const createStat = (labelText: string) => {
            const container = new Container({
                class: 'status-bar-stat'
            });
            const label = new Label({
                class: 'status-bar-stat-label',
                text: labelText
            });
            const value = new Label({
                class: 'status-bar-stat-value',
                text: '0'
            });
            container.append(label);
            container.append(value);
            statsContainer.append(container);
            return value;
        };

        const splatsLabel = localize('status-bar.splats');
        const verticesLabel = localize('status-bar.vertices');
        const splatDataLabel = localize('status-bar.splat-data');
        const meshDataLabel = localize('status-bar.mesh-data');
        const selectedLabel = localize('status-bar.selected');
        const lockedLabel = localize('status-bar.locked');
        const modeLabel = localize('status-bar.mode');
        const deletedLabel = localize('status-bar.deleted');
        const editModeLabel = localize('status-bar.mode.edit');
        const objectModeLabel = localize('status-bar.mode.object');
        const splatsValue = createStat(splatsLabel);
        const selectedValue = createStat(selectedLabel);
        const lockedValue = createStat(lockedLabel);
        const deletedValue = createStat(deletedLabel);

        this.append(timelineButton);
        this.append(splatDataButton);
        this.append(fileState);
        this.append(statsContainer);

        // register tooltips
        const shortcutManager: ShortcutManager = events.invoke('shortcutManager');
        const tooltip = (localeKey: string, shortcutId?: string) => {
            const text = localize(localeKey);
            if (shortcutId) {
                const shortcut = shortcutManager.formatShortcut(shortcutId);
                if (shortcut) {
                    return formatTooltipWithShortcut(text, shortcut);
                }
            }
            return text;
        };

        tooltips.register(timelineButton, tooltip('tooltip.status-bar.timeline', 'timelinePanel.toggle'), 'top');
        tooltips.register(splatDataButton, tooltip('tooltip.status-bar.splat-data', 'dataPanel.toggle'), 'top');

        const updateFileState = (name?: string | null, dirty?: boolean) => {
            if (name !== undefined) {
                fileNameLabel.text = name || localize('workspace.untitled');
            }
            if (dirty !== undefined) {
                saveStateLabel.text = dirty ? localize('workspace.file.unsaved') : localize('workspace.file.saved');
                saveStateLabel.dom.classList.toggle('saved', !dirty);
                saveStateLabel.dom.classList.toggle('unsaved', dirty);
            }
        };

        events.on('doc.name', (name: string | null) => updateFileState(name));
        events.on('doc.nameChanged', (name: string | null) => updateFileState(name));
        events.on('scene.dirtyChanged', (dirty: boolean) => updateFileState(undefined, dirty));
        events.on('doc.saved', () => updateFileState(undefined, false));

        // Handle keyboard shortcuts for panel toggles
        events.on('dataPanel.toggle', () => {
            setActivePanel(activePanel === 'splatData' ? '' : 'splatData');
        });

        events.on('timelinePanel.toggle', () => {
            setActivePanel(activePanel === 'timeline' ? '' : 'timeline');
        });

        // Update stats from splat state
        let currentSelection: unknown = null;

        const updateStats = () => {
            const statLabels = statsContainer.dom.querySelectorAll('.status-bar-stat-label');

            if (currentSelection instanceof Splat) {
                const state = currentSelection.splatData.getProp('state') as Uint8Array;
                if (state) {
                    statLabels[0].textContent = splatsLabel;
                    statLabels[1].textContent = selectedLabel;
                    statLabels[2].textContent = lockedLabel;
                    statLabels[3].textContent = deletedLabel;
                    splatsValue.text = formatInteger(state.length - currentSelection.numDeleted);
                    selectedValue.text = formatInteger(currentSelection.numSelected);
                    lockedValue.text = formatInteger(currentSelection.numLocked);
                    deletedValue.text = formatInteger(currentSelection.numDeleted);
                }
            } else if (currentSelection instanceof ModelElement) {
                splatDataButton.text = meshDataLabel.toUpperCase();
                statLabels[0].textContent = verticesLabel;
                statLabels[1].textContent = selectedLabel;
                statLabels[2].textContent = modeLabel;
                statLabels[3].textContent = deletedLabel;
                splatsValue.text = formatInteger(currentSelection.vertexCount);
                selectedValue.text = formatInteger(currentSelection.selectedVertexCount);
                lockedValue.text = currentSelection.supportsVertexSelection ? editModeLabel : objectModeLabel;
                deletedValue.text = formatInteger(currentSelection.deletedVertexCount);
            } else {
                splatDataButton.text = splatDataLabel.toUpperCase();
                splatsValue.text = '0';
                selectedValue.text = '0';
                lockedValue.text = '0';
                deletedValue.text = '0';
            }
        };

        events.on('splat.stateChanged', (splat_: Splat) => {
            if (currentSelection === splat_) {
                updateStats();
            }
        });

        events.on('model.vertexSelection', (model: ModelElement) => {
            if (currentSelection === model) {
                updateStats();
            }
        });

        events.on('model.geometry', (model: ModelElement) => {
            if (currentSelection === model) {
                updateStats();
            }
        });

        events.on('selection.changed', (selection: unknown) => {
            currentSelection = selection;
            if (selection instanceof Splat) {
                splatDataButton.text = splatDataLabel.toUpperCase();
            }
            updateStats();
        });
    }
}

export { StatusBar };
