import { Button, Container, Element, Label, SelectInput } from '@playcanvas/pcui';

import { Events } from '../events';
import { ShortcutManager } from '../shortcut-manager';
import { ShortcutBinding } from '../shortcuts';
import { changeLocale, localize } from './localization';

type AppTheme = 'classic' | 'light' | 'dim' | 'contrast';
type AppDensity = 'comfortable' | 'compact';
type StartupMode = 'viewer' | 'editor';
type AppLocale = 'zh-CN' | 'en';

interface AppPreferences {
    theme: AppTheme;
    density: AppDensity;
    startupMode: StartupMode;
    locale: AppLocale;
    fontFamily: string;
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
const THEMES: AppTheme[] = ['classic', 'light', 'dim', 'contrast'];
const DENSITIES: AppDensity[] = ['comfortable', 'compact'];
const STARTUP_MODES: StartupMode[] = ['viewer', 'editor'];
const LOCALES: AppLocale[] = ['zh-CN', 'en'];

const FONT_STACKS = {
    system: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    chinese: "'Microsoft YaHei', 'PingFang SC', 'Segoe UI', Arial, Helvetica, sans-serif",
    proxima: "'Proxima Nova Regular', 'Helvetica Neue', Arial, Helvetica, sans-serif"
};

const COMMON_FONT_FAMILIES = [
    'Microsoft YaHei',
    'Microsoft JhengHei',
    'PingFang SC',
    'Hiragino Sans GB',
    'Source Han Sans CN',
    'Noto Sans CJK SC',
    'Noto Sans SC',
    'SimHei',
    'SimSun',
    'KaiTi',
    'FangSong',
    'Segoe UI',
    'Arial',
    'Helvetica Neue',
    'Verdana',
    'Tahoma',
    'Trebuchet MS',
    'Georgia',
    'Times New Roman',
    'Consolas',
    'Courier New'
];

const DEFAULT_PREFERENCES: AppPreferences = {
    theme: 'classic',
    density: 'comfortable',
    startupMode: 'editor',
    locale: 'zh-CN',
    fontFamily: FONT_STACKS.chinese
};

const SHORTCUT_GROUPS: ShortcutGroup[] = [
    {
        localeKey: 'popup.shortcuts.file',
        shortcuts: [
            { id: 'doc.new', localeKey: 'popup.shortcuts.new-scene' },
            { id: 'doc.open', localeKey: 'popup.shortcuts.open-file' },
            { id: 'doc.save', localeKey: 'popup.shortcuts.save' },
            { id: 'doc.saveAs', localeKey: 'popup.shortcuts.save-as' },
            { id: 'scene.import', localeKey: 'popup.shortcuts.import-scene' }
        ]
    },
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
const SHORTCUT_LABEL_KEYS = new Map<string, string>([
    ...EDITABLE_SHORTCUTS.map(shortcut => [shortcut.id, shortcut.localeKey] as [string, string]),
    ['camera.fly.forward', 'popup.shortcuts.fly-movement'],
    ['camera.fly.backward', 'popup.shortcuts.fly-movement'],
    ['camera.fly.left', 'popup.shortcuts.fly-movement'],
    ['camera.fly.right', 'popup.shortcuts.fly-movement'],
    ['camera.fly.down', 'popup.shortcuts.fly-vertical'],
    ['camera.fly.up', 'popup.shortcuts.fly-vertical'],
    ['camera.modifier.fast', 'popup.shortcuts.fly-speed-fast'],
    ['camera.modifier.slow', 'popup.shortcuts.fly-speed-slow']
]);

const quoteCssFontFamily = (family: string) => {
    return `'${family.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
};

const fontStackFromFamily = (family: string) => {
    return `${quoteCssFontFamily(family)}, ${FONT_STACKS.system}`;
};

const normalizeStoredFontFamily = (fontFamily: unknown) => {
    if (fontFamily === 'system') return FONT_STACKS.system;
    if (fontFamily === 'chinese') return FONT_STACKS.chinese;
    if (fontFamily === 'proxima') return FONT_STACKS.proxima;

    return typeof fontFamily === 'string' && fontFamily.trim() ? fontFamily : DEFAULT_PREFERENCES.fontFamily;
};

const isFontAvailable = (family: string) => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return true;

    const text = 'mmmmmmmmmlli';
    const size = '72px';
    const baselines = ['monospace', 'serif', 'sans-serif'].map((baseline) => {
        context.font = `${size} ${baseline}`;
        return context.measureText(text).width;
    });

    return ['monospace', 'serif', 'sans-serif'].some((baseline, index) => {
        context.font = `${size} ${quoteCssFontFamily(family)}, ${baseline}`;
        return context.measureText(text).width !== baselines[index];
    });
};

const getLocalFontFamilies = async () => {
    if (!window.queryLocalFonts) {
        return [];
    }

    try {
        const fonts = await window.queryLocalFonts();
        return Array.from(new Set(fonts.map(font => font.family).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    } catch {
        return [];
    }
};

const readStoredPreferences = (): Partial<AppPreferences> => {
    try {
        return JSON.parse(localStorage.getItem(PREFERENCES_KEY) || '{}');
    } catch {
        return {};
    }
};

const loadPreferences = (): AppPreferences => {
    const stored = readStoredPreferences();
    const theme = THEMES.includes(stored.theme as AppTheme) ? stored.theme : DEFAULT_PREFERENCES.theme;
    const density = DENSITIES.includes(stored.density as AppDensity) ? stored.density : DEFAULT_PREFERENCES.density;
    const startupMode = STARTUP_MODES.includes(stored.startupMode as StartupMode) ? stored.startupMode : DEFAULT_PREFERENCES.startupMode;
    const locale = LOCALES.includes(stored.locale as AppLocale) ? stored.locale : DEFAULT_PREFERENCES.locale;
    const fontFamily = normalizeStoredFontFamily(stored.fontFamily);

    return {
        theme,
        density,
        startupMode,
        locale,
        fontFamily
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
    body.style.setProperty('--app-font-family', preferences.fontFamily);
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
    loadLocalFonts: (showStatus?: boolean) => Promise<void>;

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
        let conflictState: { recordingId: string, conflictId: string, binding: ShortcutBinding } | null = null;
        let refreshConflictNotice = () => {};

        const shortcutActionLabel = (id: string) => {
            const key = SHORTCUT_LABEL_KEYS.get(id);
            return key ? localize(key) : id;
        };

        const refreshShortcutButtons = () => {
            for (const shortcut of EDITABLE_SHORTCUTS) {
                const button = shortcutButtons.get(shortcut.id);
                const row = shortcutRows.get(shortcut.id);
                if (!button || !row) continue;

                const recording = recordingShortcutId === shortcut.id;
                button.text = recording ? localize('popup.preferences.shortcut-recording') : shortcutManager.formatShortcut(shortcut.id);
                row.dom.classList.toggle('recording', recording);
                row.dom.classList.toggle('conflict-source', conflictState?.recordingId === shortcut.id);
                row.dom.classList.toggle('conflict-target', conflictState?.conflictId === shortcut.id);
            }
            refreshConflictNotice();
        };

        const cancelRecording = () => {
            recordingShortcutId = null;
            conflictState = null;
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

            const conflict = shortcutManager.findConflict(recordingShortcutId, binding);
            if (conflict) {
                conflictState = {
                    recordingId: recordingShortcutId,
                    conflictId: conflict.id,
                    binding
                };
                refreshShortcutButtons();
                return;
            }

            shortcutManager.set(recordingShortcutId, binding);
            recordingShortcutId = null;
            conflictState = null;
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

        const headerText = new Label({
            id: 'text',
            text: localize('popup.preferences.header')
        });
        header.append(headerText);

        const content = new Container({
            id: 'content'
        });

        const localizedLabels: { label: Label, key: string }[] = [
            { label: headerText, key: 'popup.preferences.header' }
        ];
        const localizedButtons: { button: Button, key: string }[] = [];

        const makeSection = (titleKey: string) => {
            const section = new Container({
                class: 'preferences-section'
            });
            const label = new Label({
                class: 'preferences-section-title',
                text: localize(titleKey)
            });
            localizedLabels.push({ label, key: titleKey });
            section.append(label);
            content.append(section);
            return section;
        };

        const makeRow = (section: Container, labelKey: string, control: Element) => {
            const row = new Container({
                class: 'row'
            });
            const label = new Label({
                class: 'label',
                text: localize(labelKey)
            });
            localizedLabels.push({ label, key: labelKey });
            row.append(label);
            row.append(control);
            section.append(row);
            return row;
        };

        const makeFontOptions = (localFontFamilies: string[] = []) => {
            const options = [
                { v: FONT_STACKS.system, t: localize('popup.preferences.font.system') },
                { v: FONT_STACKS.chinese, t: localize('popup.preferences.font.chinese') },
                { v: FONT_STACKS.proxima, t: localize('popup.preferences.font.proxima') }
            ];
            const optionValues = new Set(options.map(option => option.v));
            const families = [
                ...COMMON_FONT_FAMILIES.filter(isFontAvailable),
                ...localFontFamilies
            ];

            for (const family of Array.from(new Set(families)).sort((a, b) => a.localeCompare(b))) {
                const stack = fontStackFromFamily(family);
                if (!optionValues.has(stack)) {
                    options.push({ v: stack, t: family });
                    optionValues.add(stack);
                }
            }

            if (!optionValues.has(this.preferences.fontFamily)) {
                options.push({ v: this.preferences.fontFamily, t: this.preferences.fontFamily });
            }

            return options;
        };

        const appearanceSection = makeSection('popup.preferences.appearance');

        const localeSelect = new SelectInput({
            class: 'select',
            defaultValue: this.preferences.locale,
            options: [
                { v: 'zh-CN', t: localize('popup.preferences.language.zh-CN') },
                { v: 'en', t: localize('popup.preferences.language.en') }
            ]
        });
        localeSelect.value = this.preferences.locale;
        makeRow(appearanceSection, 'popup.preferences.language', localeSelect);

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

        let addCreatedFontFamily = (value: string) => {};
        let localFontFamilies: string[] = [];
        let localFontsLoading = false;
        let localFontsLoaded = false;

        const fontFamilySelect = new SelectInput({
            class: 'select',
            defaultValue: this.preferences.fontFamily,
            allowInput: true,
            allowCreate: true,
            createFn: (value: string) => addCreatedFontFamily(value),
            createLabelText: localize('popup.preferences.font.create'),
            options: makeFontOptions(localFontFamilies)
        });
        fontFamilySelect.value = this.preferences.fontFamily;

        const loadLocalFontsButton = new Button({
            class: ['button', 'preferences-load-fonts-button'],
            text: localize('popup.preferences.font.load-local')
        });
        localizedButtons.push({ button: loadLocalFontsButton, key: 'popup.preferences.font.load-local' });

        const fontControls = new Container({
            class: 'preferences-font-controls'
        });
        fontControls.append(fontFamilySelect);
        fontControls.append(loadLocalFontsButton);
        makeRow(appearanceSection, 'popup.preferences.font', fontControls);

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
        keyboardSection.dom.classList.add('preferences-keyboard-section');

        const shortcutIntro = new Label({
            class: 'preferences-shortcut-intro',
            text: localize('popup.preferences.shortcut-intro')
        });
        localizedLabels.push({ label: shortcutIntro, key: 'popup.preferences.shortcut-intro' });
        keyboardSection.append(shortcutIntro);

        const conflictNotice = new Label({
            class: 'preferences-shortcut-conflict',
            text: ''
        });
        keyboardSection.append(conflictNotice);

        const shortcutsList = new Container({
            class: 'preferences-shortcut-list'
        });

        SHORTCUT_GROUPS.forEach((group) => {
            const groupLabel = new Label({
                class: 'preferences-shortcut-group-title',
                text: localize(group.localeKey)
            });
            localizedLabels.push({ label: groupLabel, key: group.localeKey });
            shortcutsList.append(groupLabel);

            group.shortcuts.forEach((shortcut) => {
                const row = new Container({
                    class: 'preferences-shortcut-row'
                });

                const label = new Label({
                    class: 'shortcut-action-label',
                    text: localize(shortcut.localeKey)
                });
                localizedLabels.push({ label, key: shortcut.localeKey });

                const shortcutButton = new Button({
                    class: ['button', 'shortcut-binding-button'],
                    text: shortcutManager.formatShortcut(shortcut.id)
                });

                const resetShortcutButton = new Button({
                    class: ['button', 'shortcut-reset-button'],
                    text: localize('popup.preferences.shortcut-default')
                });
                localizedButtons.push({ button: resetShortcutButton, key: 'popup.preferences.shortcut-default' });

                shortcutButton.on('click', () => {
                    recordingShortcutId = shortcut.id;
                    conflictState = null;
                    refreshShortcutButtons();
                    shortcutButton.dom.focus();
                });

                resetShortcutButton.on('click', () => {
                    shortcutManager.reset(shortcut.id);
                    if (recordingShortcutId === shortcut.id) {
                        recordingShortcutId = null;
                    }
                    conflictState = null;
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
        localizedButtons.push({ button: resetShortcutsButton, key: 'popup.preferences.reset-shortcuts' });
        shortcutsActions.append(resetShortcutsButton);
        keyboardSection.append(shortcutsActions);

        const footer = new Container({
            id: 'footer'
        });

        const resetButton = new Button({
            class: ['button', 'reset-action-button', 'dialog-reset-button'],
            text: localize('popup.preferences.reset-settings')
        });
        localizedButtons.push({ button: resetButton, key: 'popup.preferences.reset-settings' });

        const closeButton = new Button({
            class: 'button',
            text: localize('popup.ok')
        });
        localizedButtons.push({ button: closeButton, key: 'popup.ok' });

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

        refreshConflictNotice = () => {
            conflictNotice.text = conflictState ? localize('popup.preferences.shortcut-conflict', {
                shortcut: shortcutManager.formatBinding(conflictState.binding),
                action: shortcutActionLabel(conflictState.conflictId)
            }) : localize('popup.preferences.shortcut-ready');
            conflictNotice.dom.classList.toggle('active', !!conflictState);
        };
        refreshConflictNotice();

        const relocalizeDialog = () => {
            for (const item of localizedLabels) {
                item.label.text = localize(item.key);
            }

            for (const item of localizedButtons) {
                item.button.text = localize(item.key);
            }
            refreshConflictNotice();

            const themeValue = themeSelect.value;
            themeSelect.options = [
                { v: 'classic', t: localize('popup.preferences.theme.classic') },
                { v: 'light', t: localize('popup.preferences.theme.light') },
                { v: 'dim', t: localize('popup.preferences.theme.dim') },
                { v: 'contrast', t: localize('popup.preferences.theme.contrast') }
            ];
            themeSelect.value = themeValue;

            const densityValue = densitySelect.value;
            densitySelect.options = [
                { v: 'comfortable', t: localize('popup.preferences.density.comfortable') },
                { v: 'compact', t: localize('popup.preferences.density.compact') }
            ];
            densitySelect.value = densityValue;

            const startupValue = startupSelect.value;
            startupSelect.options = [
                { v: 'viewer', t: localize('popup.preferences.startup.viewer') },
                { v: 'editor', t: localize('popup.preferences.startup.editor') }
            ];
            startupSelect.value = startupValue;

            const fontValue = fontFamilySelect.value;
            fontFamilySelect.options = makeFontOptions(localFontFamilies);
            fontFamilySelect.value = fontValue;
        };

        localeSelect.on('change', async (value: AppLocale) => {
            this.preferences.locale = value;
            savePreferences(this.preferences);
            await changeLocale(value);
            relocalizeDialog();
            events.fire('preferences.changed', this.preferences);
            events.fire('locale.changed', value);
        });

        themeSelect.on('change', (value: AppTheme) => {
            this.preferences.theme = value;
            applyAndSave();
        });

        densitySelect.on('change', (value: AppDensity) => {
            this.preferences.density = value;
            applyAndSave();
        });

        const selectFontFamily = (value: string, label?: string) => {
            const currentOptions = fontFamilySelect.options;
            if (!currentOptions.some(option => option.v === value)) {
                fontFamilySelect.options = [
                    ...currentOptions,
                    { v: value, t: label ?? value }
                ];
            }
            fontFamilySelect.value = value;
        };

        fontFamilySelect.on('change', (value: string) => {
            this.preferences.fontFamily = value;
            applyAndSave();
        });

        startupSelect.on('change', (value: StartupMode) => {
            this.preferences.startupMode = value;
            applyAndSave();
        });

        addCreatedFontFamily = (value: string) => {
            const family = value.trim();
            if (!family) return;
            selectFontFamily(fontStackFromFamily(family), family);
        };

        this.loadLocalFonts = async (showStatus = false) => {
            if (localFontsLoading || localFontsLoaded) {
                return;
            }

            localFontsLoading = true;
            const previousText = loadLocalFontsButton.text;
            if (showStatus) {
                loadLocalFontsButton.text = localize('popup.preferences.font.loading-local');
            }
            const families = await getLocalFontFamilies();

            if (families.length > 0) {
                localFontFamilies = families;
                const value = fontFamilySelect.value;
                fontFamilySelect.options = makeFontOptions(localFontFamilies);
                fontFamilySelect.value = value;
                loadLocalFontsButton.text = localize('popup.preferences.font.loaded-local');
                localFontsLoaded = true;
            } else {
                loadLocalFontsButton.text = showStatus ? localize(window.queryLocalFonts ? 'popup.preferences.font.no-local' : 'popup.preferences.font.unsupported-local') : previousText;
            }
            localFontsLoading = false;
        };

        loadLocalFontsButton.on('click', async () => {
            await this.loadLocalFonts(true);
        });

        resetShortcutsButton.on('click', () => {
            shortcutManager.resetAll();
            cancelRecording();
        });

        resetButton.on('click', () => {
            this.preferences = { ...DEFAULT_PREFERENCES };
            localeSelect.value = this.preferences.locale;
            themeSelect.value = this.preferences.theme;
            densitySelect.value = this.preferences.density;
            fontFamilySelect.value = this.preferences.fontFamily;
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
