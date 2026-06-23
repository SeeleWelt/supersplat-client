import { Mat4, Vec3 } from 'playcanvas';

import { MeshGeometryOp, PlacePivotOp, MultiOp } from './edit-ops';
import { Events } from './events';
import { ModelElement, MeshGeometrySnapshot } from './model-element';
import { Pivot } from './pivot';
import { Transform } from './transform';
import { TransformHandler } from './transform-handler';

const startMat = new Mat4();
const currentMat = new Mat4();
const deltaMat = new Mat4();
const transform = new Transform();

const geometryEquals = (a: MeshGeometrySnapshot, b: MeshGeometrySnapshot) => {
    if (a.length !== b.length) {
        return false;
    }

    for (let i = 0; i < a.length; i++) {
        const apos = a[i].positions;
        const bpos = b[i].positions;
        if (apos.length !== bpos.length) {
            return false;
        }
        for (let j = 0; j < apos.length; j++) {
            if (Math.abs(apos[j] - bpos[j]) > 1e-6) {
                return false;
            }
        }
    }

    return true;
};

class MeshVertexTransformHandler implements TransformHandler {
    events: Events;
    model: ModelElement;
    pivotStart = new Transform();
    geometryStart: MeshGeometrySnapshot | null = null;

    constructor(events: Events) {
        this.events = events;

        events.on('pivot.started', () => {
            if (this.model) {
                this.start();
            }
        });

        events.on('pivot.moved', (pivot: Pivot) => {
            if (this.model) {
                this.update(pivot.transform);
            }
        });

        events.on('pivot.ended', () => {
            if (this.model) {
                this.end();
            }
        });

        events.on('model.vertexSelection', (model: ModelElement) => {
            if (this.model === model) {
                this.placePivot();
            }
        });

        events.on('pivot.origin', () => {
            if (this.model) {
                this.placePivot();
            }
        });

        events.on('camera.focalPointPicked', (details: { element?: ModelElement, position: Vec3 }) => {
            if (this.model && details.element === this.model && ['move', 'rotate', 'scale'].includes(this.events.invoke('tool.active'))) {
                const pivot = events.invoke('pivot') as Pivot;
                const oldt = pivot.transform.clone();
                const newt = new Transform(details.position, pivot.transform.rotation, pivot.transform.scale);
                events.fire('edit.add', new PlacePivotOp({ pivot, oldt, newt }));
            }
        });
    }

    placePivot() {
        const origin = this.events.invoke('pivot.origin');
        this.model.getPivot(origin === 'center' ? 'center' : 'boundCenter', true, transform);
        this.events.invoke('pivot').place(transform);
    }

    activate() {
        this.model = this.events.invoke('selection') as ModelElement;
        if (this.model) {
            this.placePivot();
        }
    }

    deactivate() {
        this.model = null;
        this.geometryStart = null;
    }

    start() {
        const pivot = this.events.invoke('pivot') as Pivot;
        this.pivotStart.copy(pivot.transform);
        this.geometryStart = this.model.getGeometrySnapshot();
    }

    update(nextTransform: Transform) {
        if (!this.geometryStart) {
            return;
        }

        startMat.setTRS(this.pivotStart.position, this.pivotStart.rotation, this.pivotStart.scale);
        currentMat.setTRS(nextTransform.position, nextTransform.rotation, nextTransform.scale);
        deltaMat.copy(startMat).invert();
        deltaMat.mul2(currentMat, deltaMat);

        this.model.transformSelectedVerticesFromSnapshot(this.geometryStart, deltaMat);
    }

    end() {
        if (!this.geometryStart) {
            return;
        }

        const geometryEnd = this.model.getGeometrySnapshot();
        if (!geometryEquals(this.geometryStart, geometryEnd)) {
            const pivot = this.events.invoke('pivot') as Pivot;
            const pop = new PlacePivotOp({
                pivot,
                oldt: this.pivotStart.clone(),
                newt: pivot.transform.clone()
            });

            this.events.fire('edit.add', new MultiOp([
                new MeshGeometryOp(this.model, this.geometryStart, geometryEnd),
                pop
            ]), true);
        }

        this.geometryStart = null;
    }
}

export { MeshVertexTransformHandler };
