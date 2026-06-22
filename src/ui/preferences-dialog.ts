import { Button, Container, Element, Label, SelectInput } from '@playcanvas/pcui';

import { Events } from '../events';
import { ShortcutManager } from '../shortcut-manager';
import { ShortcutBinding } from '../shortcuts';
import { localize } from './localization';

type AppTheme = 'classic' | 'light' | 'dim' | 'contrast';
type AppDensity = 'comfortable' | 'compact';
type StartupMode = 'viewer' | 'editor';

interface AppPreferences {
    theme: AppTheme;
    density: AppDensity;
    startupMode: StartupMode;
}

interface EditableShortcut {
    id: string;
    localeKey: string;
}

interface ShortcutGroup {
    localeKey: string;
    shortcuts: EditableShortcut[];
}

const PREFERENCES_KEY = 'ningjing.preferences';

const DEFAULT_PREFERENCES: AppPreferences = {
    theme: 'classic',
    density: 'comfortable',
    startupMode: 'viewer'
};

const SHORTCUT_GROUPS: ShortcutGroup[] = [
    {
        localeKey: 'popup.preferences.shortcuts.general',
        shortcuts: [
            { id: 'preferences.open', localeKey: 'popup.shortcuts.preferences' },
            { id: 'edit.undo', localeKey: 'popup.shortcuts.undo' },
            { id: 'edit.redo', localeKey: 'popup.shortcuts.redo' },
            { id: 'dataPanel.toggle', localeKey: 'popup.shortcuts.toggle-data-panel' },
            { id: 'timelinePanel.toggle', localeKey: 'popup.shortcuts.toggle-timeline-panel' }
        ]
    },
    {
        localeKey: 'popup.shortcuts.navigation',
        shortcuts: [
            { id: 'camera.focus', localeKey: 'popup.shortcuts.focus-camera' },
            { id: 'camera.reset', localeKey: 'popup.shortcuts.reset-camera' },
            { id: 'camera.toggleControlMode', localeKey: 'popup.shortcuts.toggle-control-mode' }
        ]
    },
    {
        localeKey: 'popup.shortcuts.show',
        shortcuts: [
            { id: 'camera.toggleOverlay', localeKey: 'popup.shortcuts.toggle-splat-overlay' },
            { id: 'camera.toggleMode', localeKey: 'popup.shortcuts.toggle-overlay-mode' },
            { id: 'grid.toggleVisible', localeKey: 'popup.shortcuts.toggle-grid' }
        ]
    },
    {
        localeKey: 'popup.shortcuts.selection',
        shortcuts: [
            { id: 'select.all', localeKey: 'popup.shortcuts.select-all' },
            { id: 'select.none', localeKey: 'popup.shortcuts.deselect-all' },
            { id: 'select.invert', localeKey: 'popup.shortcuts.invert-selection' },
            { id: 'select.delete', localeKey: 'popup.shortcuts.delete-selected-splats' }
        ]
    },
    {
        localeKey: 'popup.shortcuts.tools',
        shortcuts: [
            { id: 'tool.move', localeKey: 'popup.shortcuts.move' },
            { id: 'tool.rotate', localeKey: 'popup.shortcuts.rotate' },
            { id: 'tool.scale', localeKey: 'popup.shortcuts.scale' },
            { id: 'tool.rectSelection', localeKey: 'popup.shortcuts.rect-selection' },
            { id: 'tool.lassoSelection', localeKey: 'popup.shortcuts.lasso-selection' },
            { id: 'tool.polygonSelection', localeKey: 'popup.shortcuts.polygon-selection' },
            { id: 'tool.brushSelection', localeKey: 'popup.shortcuts.brush-selection' },
            { id: 'tool.floodSelection', localeKey: 'popup.shortcuts.flood-selection' },
            { id: 'tool.eyedropperSelection', localeKey: 'popup.shortcuts.eyedropper-selection' },
            { id: 'tool.deactivate', localeKey: 'popup.shortcuts.deactivate-tool' },
            { id: 'tool.toggleCoordSpace', localeKey: 'popup.shortcuts.toggle-gizmo-coordinate-space' }
        ]
    },
    {
        localeKey: 'popup.shortcuts.playback',
        shortcuts: [
            { id: 'timeline.togglePlay', localeKey: 'popup.shortcuts.play-pause' },
            { id: 'timeline.prevFrame', localeKey: 'popup.shortcuts.prev-frame' },
            { id: 'timeline.nextFrame', localeKey: 'popup.shortcuts.next-frame' },
            { id: 'timeline.prevKey', localeKey: 'popup.shortcuts.prev-key' },
            { id: 'timeline.nextKey', localeKey: 'popup.shortcuts.next-key' },
            { id: 'track.addKey', localeKey: 'popup.shortcuts.add-key' },
            { id: 'track.removeKey', localeKey: 'popup.shortcuts.remove-key' }
        ]
    }
];

const EDITABLE_SHORTCUTS = SHORTCUT_GROUPS.flatMap(group => group.shortcuts);

const readStoredPreferences = (): Partial<AppPreferences> => {
    try {
        return JSON.parse(localStorage.getItem(PREFERENCES_KEY) || '{}');
    } catch {
        return {};
    }
};

const loadPreferences = (): AppPreferences => {
    const stored = readStoredPreferences();
    const theme = ['classic', 'light', 'dim', 'contrast'].includes(stored.theme ?? '') ? stored.theme : DEFAULT_PREFERENCES.theme;
    const density = ['comfortable', 'compact'].includes(stored.density ?? '') ? stored.density : DEFAULT_PREFERENCES.density;
    const startupMode = ['viewer', 'editor'].includes(stored.startupMode ?? '') ? stored.startupMode : DEFAULT_PREFERENCES.startupMode;

    return {
        theme,
        density,
        startupMode
    };
};

const savePreferences = (preferences: AppPreferences) => {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
};

const applyPreferences = (preferences: AppPreferences) => {
    const body = document.body;

    body.classList.toggle('app-theme-light', preferences.theme === 'light');
    body.classList.toggle('app-theme-dim', preferences.theme === 'dim');
    body.classList.toggle('app-theme-contrast', preferences.theme === 'contrast');
    body.classList.toggle('ui-density-compact', preferences.density === 'compact');
};

const normalizeShortcutKey = (event: KeyboardEvent): string | null => {
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) {
        return null;
    }

    if (event.key === 'Spacebar') {
        return ' ';
    }

    return event.key.length === 1 ? event.key.toLowerCase() : event.key;
};

const shortcutFromEvent = (event: KeyboardEvent): ShortcutBinding | null => {
    const key = normalizeShortcutKey(event);
    if (!key) return null;

    return {
        keys: [key],
        codes: undefined,
        ctrl: event.ctrlKey || event.metaKey ? 'required' : 'forbidden',
        shift: event.shiftKey ? 'required' : 'forbidden',
        alt: event.altKey ? 'required' : 'forbidden'
    };
};

class PreferencesDialog extends Container {
    private preferences: AppPreferences;

    constructor(events: Events, args = {}) {
        args = {
            ...args,
            id: 'preferences-dialog',
            class: ['settings-dialog', 'preferences-dialog'],
            hidden: true
        };

        super(args);

        this.preferences = loadPreferences();

        const shortcutManager: ShortcutManager = events.invoke('shortcutManager');
        const shortcutButtons = new Map<string, Button>();
        const shortcutRows = new Map<string, Container>();
        let recordingShortcutId: string | null = null;

        const refreshShortcutButtons = () => {
            for (const shortcut of EDITABLE_SHORTCUTS) {
                const button = shortcutButtons.get(shortcut.id);
                const row = shortcutRows.get(shortcut.id);
                if (!button || !row) continue;

                const recording = recordingShortcutId === shortcut.id;
                button.text = recording ? localize('popup.preferences.shortcut-recording') : shortcutManager.formatShortcut(shortcut.id);
                row.dom.classList.toggle('recording', recording);
            }
        };

        const cancelRecording = () => {
            recordingShortcutId = null;
            refreshShortcutButtons();
        };

        const recordShortcut = (event: KeyboardEvent) => {
            event.preventDefault();
            event.stopPropagation();

            if (event.key === 'Escape') {
                cancelRecording();
                return;
            }

            const binding = shortcutFromEvent(event);
            if (!binding || !recordingShortcutId) return;

            shortcutManager.set(recordingShortcutId, binding);
            recordingShortcutId = null;
            refreshShortcutButtons();
        };

        this.dom.addEventListener('keydown', (event: KeyboardEvent) => {
            event.stopPropagation();

            if (recordingShortcutId) {
                recordShortcut(event);
                return;
            }

            if (event.key === 'Escape') {
                this.hidden = true;
            }
        });

        ['pointerdown', 'pointerup', 'pointermove', 'wheel', 'dblclick'].forEach((eventName) => {
            this.dom.addEventListener(eventName, (event: Event) => event.stopPropagation());
        });

        const dialog = new Container({
            id: 'dialog'
        });

        const header = new Container({
            id: 'header'
        });

        header.append(new Label({
            id: 'icon',
            text: '\uE283'
        }));

        header.append(new Label({
            id: 'text',
            text: localize('popup.preferences.header')
        }));

        const content = new Container({
            id: 'content'
        });

        const makeSection = (titleKey: string) => {
            const section = new Container({
                class: 'preferences-section'
            });
            section.append(new Label({
                class: 'preferences-section-title',
                text: localize(titleKey)
            }));
            content.append(section);
            return section;
        };

        const makeRow = (section: Container, labelKey: string, control: Element) => {
            const row = new Container({
                class: 'row'
            });
            row.append(new Label({
                class: 'label',
                text: localize(labelKey)
            }));
            row.append(control);
            section.append(row);
            return row;
        };

        const appearanceSection = makeSection('popup.preferences.appearance');

        const themeSelect = new SelectInput({
            class: 'select',
            defaultValue: this.preferences.theme,
            options: [
                { v: 'classic', t: localize('popup.preferences.theme.classic') },
                { v: 'light', t: localize('popup.preferences.theme.light') },
                { v: 'dim', t: localize('popup.preferences.theme.dim') },
                { v: 'contrast', t: localize('popup.preferences.theme.contrast') }
            ]
        });
        themeSelect.value = this.preferences.theme;
        makeRow(appearanceSection, 'popup.preferences.theme', themeSelect);

        const densitySelect = new SelectInput({
            class: 'select',
            defaultValue: this.preferences.density,
            options: [
                { v: 'comfortable', t: localize('popup.preferences.density.comfortable') },
                { v: 'compact', t: localize('popup.preferences.density.compact') }
            ]
        });
        densitySelect.value = this.preferences.density;
        makeRow(appearanceSection, 'popup.preferences.density', densitySelect);

        const workspaceSection = makeSection('popup.preferences.workspace');

        const startupSelect = new SelectInput({
            class: 'select',
            defaultValue: this.preferences.startupMode,
            options: [
                { v: 'viewer', t: localize('popup.preferences.startup.viewer') },
                { v: 'editor', t: localize('popup.preferences.startup.editor') }
            ]
        });
        startupSelect.value = this.preferences.startupMode;
        makeRow(workspaceSection, 'popup.preferences.startup-mode', startupSelect);

        const keyboardSection = makeSection('popup.preferences.keyboard');
        const shortcutsList = new Container({
            class: 'preferences-shortcut-list'
        });

        SHORTCUT_GROUPS.forEach((group) => {
            shortcutsList.append(new Label({
                class: 'preferences-shortcut-group-title',
                text: localize(group.localeKey)
            }));

            group.shortcuts.forEach((shortcut) => {
                const row = new Container({
                    class: 'preferences-shortcut-row'
                });

                const label = new Label({
                    class: 'shortcut-action-label',
                    text: localize(shortcut.localeKey)
                });

                const shortcutButton = new Button({
                    class: ['button', 'shortcut-binding-button'],
                    text: shortcutManager.formatShortcut(shortcut.id)
                });

                const resetShortcutButton = new Button({
                    class: ['button', 'shortcut-reset-button'],
                    text: localize('popup.preferences.shortcut-default')
                });

                shortcutButton.on('click', () => {
                    recordingShortcutId = shortcut.id;
                    refreshShortcutButtons();
                    shortcutButton.dom.focus();
                });

                resetShortcutButton.on('click', () => {
                    shortcutManager.reset(shortcut.id);
                    if (recordingShortcutId === shortcut.id) {
                        recordingShortcutId = null;
                    }
                    refreshShortcutButtons();
                });

                row.append(label);
                row.append(shortcutButton);
                row.append(resetShortcutButton);
                shortcutsList.append(row);
                shortcutButtons.set(shortcut.id, shortcutButton);
                shortcutRows.set(shortcut.id, row);
            });
        });

        keyboardSection.append(shortcutsList);

        const shortcutsActions = new Container({
            class: 'preferences-shortcut-actions'
        });

        const resetShortcutsButton = new Button({
            class: ['button', 'reset-action-button', 'preferences-reset-shortcuts-button'],
            text: localize('popup.preferences.reset-shortcuts')
        });
        shortcutsActions.append(resetShortcutsButton);
        keyboardSection.append(shortcutsActions);

        const footer = new Container({
            id: 'footer'
        });

        const resetButton = new Button({
            class: ['button', 'reset-action-button', 'dialog-reset-button'],
            text: localize('popup.preferences.reset-settings')
        });

        const closeButton = new Button({
            class: 'button',
            text: localize('popup.ok')
        });

        footer.append(resetButton);
        footer.append(closeButton);

        dialog.append(header);
        dialog.append(content);
        dialog.append(footer);
        this.append(dialog);

        const applyAndSave = () => {
            savePreferences(this.preferences);
            applyPreferences(this.preferences);
            events.fire('viewer.setAdvancedMode', this.preferences.startupMode === 'editor');
            events.fire('preferences.changed', this.preferences);
        };

        themeSelect.on('change', (value: AppTheme) => {
            this.preferences.theme = value;
            applyAndSave();
        });

        densitySelect.on('change', (value: AppDensity) => {
            this.preferences.density = value;
            applyAndSave();
        });

        startupSelect.on('change', (value: StartupMode) => {
            this.preferences.startupMode = value;
            applyAndSave();
        });

        resetShortcutsButton.on('click', () => {
            shortcutManager.resetAll();
            cancelRecording();
        });

        resetButton.on('click', () => {
            this.preferences = { ...DEFAULT_PREFERENCES };
            themeSelect.value = this.preferences.theme;
            densitySelect.value = this.preferences.density;
            startupSelect.value = this.preferences.startupMode;
            applyAndSave();
        });

        closeButton.on('click', () => {
            this.hidden = true;
        });
    }
}

export { PreferencesDialog, loadPreferences, applyPreferences };
export type { AppPreferences };
