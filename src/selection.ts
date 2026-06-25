import { Element, ElementType } from './element';
import { Events } from './events';
import { Scene } from './scene';
import { Splat } from './splat';

const registerSelectionEvents = (events: Events, scene: Scene) => {
    let selection: Element = null;

    const selectable = (element: Element) => {
        return element?.type === ElementType.splat || element?.type === ElementType.model;
    };

    const visible = (element: Element) => {
        return !element || (element as any).visible;
    };

    const getSelectableElements = () => {
        return scene.elements.filter(selectable);
    };

    const setSelection = (splat: Element) => {
        if (splat !== selection && (!splat || visible(splat))) {
            const prev = selection;
            selection = splat;
            events.fire('selection.changed', selection, prev);
        }
    };

    events.on('selection', (splat: Element) => {
        setSelection(splat);
    });

    events.function('selection', () => {
        return selection;
    });

    events.on('selection.next', () => {
        const elements = getSelectableElements();
        if (elements.length > 1) {
            const idx = elements.indexOf(selection);
            setSelection(elements[(idx + 1) % elements.length]);
        }
    });

    events.on('scene.elementAdded', (element: Element) => {
        if (selectable(element)) {
            setSelection(element);
        }
    });

    events.on('scene.elementRemoved', (element: Element) => {
        if (element === selection) {
            const elements = getSelectableElements();
            setSelection(elements[0] ?? null);
        }
    });

    events.on('splat.visibility', (splat: Splat) => {
        if (splat === selection && !splat.visible) {
            setSelection(null);
        }
    });

    events.on('model.visibility', (model: Element) => {
        if (model === selection && !(model as any).visible) {
            setSelection(null);
        }
    });

    events.on('camera.focalPointPicked', (details: { element?: Element, splat?: Splat }) => {
        setSelection(details.element ?? details.splat);
    });
};

export { registerSelectionEvents };
