import { platform } from 'playcanvas';

import { Events } from './events';
import { Shortcuts, ShortcutBinding } from './shortcuts';

// Mac uses different labels for modifier keys.
const isMac = platform.name === 'osx';
const STORAGE_KEY = 'ningjing.shortcuts';

// Default shortcut bindings - the source of truth for key mappings.
const defaultShortcuts: Record<string, ShortcutBinding> = {
    // File
    'doc.new': { keys: ['n'], ctrl: 'required', capture: true },
    'doc.open': { keys: ['o'], ctrl: 'required', capture: true },
    'doc.save': { keys: ['s'], ctrl: 'required', capture: true },
    'doc.saveAs': { keys: ['s'], ctrl: 'required', shift: 'required', capture: true },
    'scene.import': { keys: ['i'], ctrl: 'required', capture: true },

    // Navigation
    'camera.reset': { keys: ['f'], shift: 'required' },
    'camera.focus': { keys: ['f'] },
    'camera.toggleControlMode': { keys: ['v'] },

    // Show
    'camera.toggleOverlay': { keys: ['Tab'] },
    'camera.toggleMode': { keys: ['m'] },
    'grid.toggleVisible': { keys: ['g'] },
    'select.hide': { keys: ['h'] },
    'select.unhide': { keys: ['h'], shift: 'required' },

    // Playback
    'timeline.togglePlay': { keys: [' '] },
    'timeline.prevFrame': { keys: [','], repeat: true },
    'timeline.nextFrame': { keys: ['.'], repeat: true },
    'timeline.prevKey': { keys: ['<'], shift: 'optional', repeat: true },
    'timeline.nextKey': { keys: ['>'], shift: 'optional', repeat: true },
    'track.addKey': { keys: ['Enter'] },
    'track.removeKey': { keys: ['Enter'], shift: 'required' },

    // Selection
    'select.all': { keys: ['a'], ctrl: 'required', capture: true },
    'select.none': { keys: ['a'], ctrl: 'required', shift: 'required', capture: true },
    'select.invert': { keys: ['i'], ctrl: 'required', shift: 'required', capture: true },
    'select.delete': { keys: ['Delete', 'Backspace'] },

    // Tools
    'tool.move': { keys: ['1'] },
    'tool.rotate': { keys: ['2'] },
    'tool.scale': { keys: ['3'] },
    'tool.rectSelection': { keys: ['r'] },
    'tool.lassoSelection': { keys: ['l'] },
    'tool.polygonSelection': { keys: ['p'] },
    'tool.brushSelection': { keys: ['b'] },
    'tool.floodSelection': { keys: ['o'] },
    'tool.eyedropperSelection': { keys: ['e'], ctrl: 'required', capture: true },
    'tool.brushSelection.smaller': { keys: ['['], repeat: true },
    'tool.brushSelection.bigger': { keys: [']'], repeat: true },
    'tool.deactivate': { keys: ['Escape'] },
    'tool.toggleCoordSpace': { keys: ['c'], shift: 'required' },

    // Other
    'edit.undo': { keys: ['z'], ctrl: 'required', repeat: true, capture: true },
    'edit.redo': { keys: ['z'], ctrl: 'required', shift: 'required', repeat: true, capture: true },
    'dataPanel.toggle': { keys: ['d'], ctrl: 'required', capture: true },
    'timelinePanel.toggle': { keys: ['t'], ctrl: 'required', capture: true },
    'preferences.open': { keys: [','], ctrl: 'required', capture: true },

    // Camera fly keys - use physical positions (codes) for WASD layout on non-QWERTY keyboards.
    'camera.fly.forward': { codes: ['KeyW'], held: true, shift: 'optional', alt: 'optional' },
    'camera.fly.backward': { codes: ['KeyS'], held: true, shift: 'optional', alt: 'optional' },
    'camera.fly.left': { codes: ['KeyA'], held: true, shift: 'optional', alt: 'optional' },
    'camera.fly.right': { codes: ['KeyD'], held: true, shift: 'optional', alt: 'optional' },
    'camera.fly.down': { codes: ['KeyQ'], held: true, shift: 'optional', alt: 'optional' },
    'camera.fly.up': { codes: ['KeyE'], held: true, shift: 'optional', alt: 'optional' },
    'camera.modifier.fast': { codes: ['ShiftLeft', 'ShiftRight'], held: true, alt: 'optional' },
    'camera.modifier.slow': { codes: ['AltLeft', 'AltRight'], held: true, shift: 'optional' }
};

interface ShortcutConflict {
    id: string;
    binding: ShortcutBinding;
}

const modifierState = (state: ShortcutBinding['ctrl']) => state ?? 'forbidden';

const modifiersOverlap = (a: ShortcutBinding['ctrl'], b: ShortcutBinding['ctrl']) => {
    const left = modifierState(a);
    const right = modifierState(b);

    return left === 'optional' || right === 'optional' || left === right;
};

const keyTokens = (binding: ShortcutBinding) => {
    const tokens = new Set<string>();

    for (const key of binding.keys ?? []) {
        const normalized = key.toLowerCase();
        tokens.add(`key:${normalized}`);

        if (/^[a-z]$/.test(normalized)) {
            tokens.add(`code:key${normalized}`);
        }
    }

    for (const code of binding.codes ?? []) {
        const normalized = code.toLowerCase();
        tokens.add(`code:${normalized}`);

        if (normalized.startsWith('key') && normalized.length === 4) {
            tokens.add(`key:${normalized.slice(3)}`);
        }
    }

    return tokens;
};

const shortcutsOverlap = (a: ShortcutBinding, b: ShortcutBinding) => {
    const left = keyTokens(a);
    const right = keyTokens(b);

    for (const token of left) {
        if (right.has(token)) {
            return true;
        }
    }

    return false;
};

class ShortcutManager {
    private bindings: Record<string, ShortcutBinding>;
    private shortcuts: Shortcuts;
    private events: Events;

    constructor(events: Events) {
        this.events = events;
        this.bindings = this.cloneDefaults();
        this.loadCustomBindings();

        this.shortcuts = new Shortcuts(events);
        this.applyBindings();
    }

    private cloneDefaults() {
        const bindings: Record<string, ShortcutBinding> = {};
        for (const id in defaultShortcuts) {
            bindings[id] = { ...defaultShortcuts[id] };
        }
        return bindings;
    }

    private loadCustomBindings() {
        try {
            const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Record<string, ShortcutBinding>;
            for (const id in stored) {
                if (defaultShortcuts[id]) {
                    this.bindings[id] = {
                        ...defaultShortcuts[id],
                        ...stored[id]
                    };
                }
            }
        } catch {
            // Ignore malformed stored shortcut data and keep defaults.
        }
    }

    private saveCustomBindings() {
        const custom: Record<string, ShortcutBinding> = {};
        for (const id in this.bindings) {
            if (JSON.stringify(this.bindings[id]) !== JSON.stringify(defaultShortcuts[id])) {
                custom[id] = this.bindings[id];
            }
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
    }

    private applyBindings() {
        this.shortcuts.shortcuts.length = 0;
        for (const id in this.bindings) {
            const binding = this.bindings[id];
            this.shortcuts.register({
                event: id,
                keys: binding.keys,
                codes: binding.codes,
                ctrl: binding.ctrl,
                shift: binding.shift,
                alt: binding.alt,
                held: binding.held,
                repeat: binding.repeat,
                capture: binding.capture
            });
        }
    }

    get(id: string): ShortcutBinding | undefined {
        return this.bindings[id];
    }

    set(id: string, binding: ShortcutBinding) {
        if (!defaultShortcuts[id]) return;
        this.bindings[id] = {
            ...defaultShortcuts[id],
            ...binding
        };
        this.saveCustomBindings();
        this.applyBindings();
        this.events.fire('shortcuts.changed');
    }

    reset(id: string) {
        if (!defaultShortcuts[id]) return;
        this.bindings[id] = { ...defaultShortcuts[id] };
        this.saveCustomBindings();
        this.applyBindings();
        this.events.fire('shortcuts.changed');
    }

    resetAll() {
        this.bindings = this.cloneDefaults();
        localStorage.removeItem(STORAGE_KEY);
        this.applyBindings();
        this.events.fire('shortcuts.changed');
    }

    defaultBinding(id: string): ShortcutBinding | undefined {
        return defaultShortcuts[id] ? { ...defaultShortcuts[id] } : undefined;
    }

    findConflict(id: string, binding: ShortcutBinding): ShortcutConflict | null {
        for (const otherId in this.bindings) {
            if (otherId === id) continue;

            const otherBinding = this.bindings[otherId];
            if (!shortcutsOverlap(binding, otherBinding)) continue;
            if (!modifiersOverlap(binding.ctrl, otherBinding.ctrl)) continue;
            if (!modifiersOverlap(binding.shift, otherBinding.shift)) continue;
            if (!modifiersOverlap(binding.alt, otherBinding.alt)) continue;

            return {
                id: otherId,
                binding: { ...otherBinding }
            };
        }

        return null;
    }

    /**
     * Format a shortcut for display (e.g., "Ctrl + Shift + Z" or "Cmd Shift Z" on Mac).
     */
    formatBinding(binding: ShortcutBinding): string {
        if (!binding) return '';

        const parts: string[] = [];

        if (binding.ctrl === 'required') parts.push(isMac ? 'Cmd' : 'Ctrl');
        if (binding.alt === 'required') parts.push(isMac ? 'Option' : 'Alt');
        if (binding.shift === 'required') parts.push('Shift');

        let keyDisplay = binding.keys?.[0] ?? binding.codes?.[0];
        if (!keyDisplay) return '';

        if (keyDisplay === ' ') {
            keyDisplay = 'Space';
        } else if (keyDisplay === 'Escape') {
            keyDisplay = 'Esc';
        } else if (keyDisplay.startsWith('Key')) {
            keyDisplay = keyDisplay.slice(3);
        } else if (keyDisplay.length === 1) {
            keyDisplay = keyDisplay.toUpperCase();
        }

        parts.push(keyDisplay);

        return isMac ? parts.join(' ') : parts.join(' + ');
    }

    formatShortcut(id: string): string {
        return this.formatBinding(this.bindings[id]);
    }
}

export { ShortcutManager };
