import { Element } from './element';
import { EntityTransformHandler } from './entity-transform-handler';
import { Events } from './events';
import { MeshVertexTransformHandler } from './mesh-vertex-transform-handler';
import { ModelElement } from './model-element';
import { registerPivotEvents } from './pivot';
import { Splat } from './splat';
import { SplatsTransformHandler } from './splats-transform-handler';

interface TransformHandler {
    activate: () => void;
    deactivate: () => void;
}

const registerTransformHandlerEvents = (events: Events) => {
    const transformHandlers: TransformHandler[] = [];

    const push = (handler: TransformHandler) => {
        if (transformHandlers.length > 0) {
            const transformHandler = transformHandlers[transformHandlers.length - 1];
            transformHandler.deactivate();
        }
        transformHandlers.push(handler);
        handler.activate();
    };

    const pop = () => {
        if (transformHandlers.length > 0) {
            const transformHandler = transformHandlers.pop();
            transformHandler.deactivate();
        }
        if (transformHandlers.length > 0) {
            const transformHandler = transformHandlers[transformHandlers.length - 1];
            transformHandler.activate();
        }
    };

    // bind transform target when selection changes
    const entityTransformHandler = new EntityTransformHandler(events);
    const splatsTransformHandler = new SplatsTransformHandler(events);
    const meshVertexTransformHandler = new MeshVertexTransformHandler(events);

    const update = () => {
        const selection = events.functions.has('selection') ? events.invoke('selection') as Element : null;

        pop();
        if (selection) {
            if (selection instanceof Splat && selection.numSelected > 0) {
                push(splatsTransformHandler);
            } else if (selection instanceof Splat) {
                push(entityTransformHandler);
            } else if (selection instanceof ModelElement && selection.selectedVertexCount > 0) {
                push(meshVertexTransformHandler);
            } else if (selection instanceof ModelElement) {
                push(entityTransformHandler);
            }
        }
    };

    events.on('selection.changed', update);
    events.on('splat.stateChanged', update);
    events.on('model.vertexSelection', update);

    events.on('transformHandler.push', (handler: TransformHandler) => {
        push(handler);
    });

    events.on('transformHandler.pop', () => {
        pop();
    });

    registerPivotEvents(events);
};

export { registerTransformHandlerEvents, TransformHandler };
