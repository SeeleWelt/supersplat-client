import { ColorPicker, SelectInput } from '@playcanvas/pcui';

type FloatingComponent = {
    dom: HTMLElement;
    isOpen: () => boolean;
    close: () => void;
};

type SelectInputInternals = SelectInput & {
    _containerOptions?: { hidden: boolean };
    dom: HTMLElement;
};

type ColorPickerInternals = ColorPicker & {
    _overlay?: { hidden: boolean };
    _openColorPicker?: () => void;
    dom: HTMLElement;
};

let activeFloating: FloatingComponent | null = null;
let initialized = false;

const setActiveFloating = (floating: FloatingComponent) => {
    activeFloating = floating.isOpen() ? floating : null;
};

const closeActiveFloating = (eventTarget?: EventTarget | null) => {
    if (!activeFloating?.isOpen()) {
        activeFloating = null;
        return;
    }

    if (eventTarget instanceof Node && activeFloating.dom.contains(eventTarget)) {
        return;
    }

    const current = activeFloating;
    activeFloating = null;
    current.close();
};

const patchSelectInput = () => {
    const proto = SelectInput.prototype as SelectInputInternals;
    const open = proto.open;
    const close = proto.close;

    proto.open = function () {
        closeActiveFloating(this.dom);
        open.call(this);

        setActiveFloating({
            dom: this.dom,
            isOpen: () => !!this._containerOptions && !this._containerOptions.hidden,
            close: () => this.close()
        });
    };

    proto.close = function () {
        close.call(this);

        if (activeFloating?.dom === this.dom && (!this._containerOptions || this._containerOptions.hidden)) {
            activeFloating = null;
        }
    };
};

const patchColorPicker = () => {
    const proto = ColorPicker.prototype as ColorPickerInternals;
    const openColorPicker = proto._openColorPicker;

    if (!openColorPicker) {
        return;
    }

    proto._openColorPicker = function () {
        closeActiveFloating(this.dom);
        openColorPicker.call(this);

        setActiveFloating({
            dom: this.dom,
            isOpen: () => !!this._overlay && !this._overlay.hidden,
            close: () => {
                if (this._overlay && !this._overlay.hidden) {
                    this._overlay.hidden = true;
                }
            }
        });
    };
};

const initFloatingComponentBehavior = () => {
    if (initialized) {
        return;
    }
    initialized = true;

    patchSelectInput();
    patchColorPicker();

    document.addEventListener('pointerdown', (event) => {
        closeActiveFloating(event.composedPath()[0] ?? event.target);
    }, true);

    window.addEventListener('blur', () => {
        closeActiveFloating();
    });
};

export { initFloatingComponentBehavior };
