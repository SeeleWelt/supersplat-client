import {
    BLEND_NORMAL,
    CULLFACE_NONE,
    Entity,
    Mesh,
    MeshInstance,
    PRIMITIVE_LINES,
    SEMANTIC_COLOR,
    SEMANTIC_POSITION,
    ShaderMaterial
} from 'playcanvas';

import { Element, ElementType } from './element';
import { ModelElement } from './model-element';

const blenderSelectedColor = [1.0, 0.48, 0.0, 1.0];

const createOverlayMesh = (device: any, positions: number[], colors: number[], primitiveType: number) => {
    const mesh = new Mesh(device);
    const vertexCount = positions.length / 3;
    mesh.setPositions(positions, 3, vertexCount);
    mesh.setColors(colors, 4, vertexCount);
    mesh.update(primitiveType);
    return mesh;
};

const createEdgeMaterial = (uniqueName: string) => {
    const material = new ShaderMaterial({
        uniqueName,
        attributes: {
            vertex_position: SEMANTIC_POSITION,
            vertex_color: SEMANTIC_COLOR
        },
        vertexGLSL: /* glsl */ `
            attribute vec3 vertex_position;
            attribute vec4 vertex_color;

            uniform mat4 matrix_model;
            uniform mat4 matrix_viewProjection;

            varying vec4 vColor;

            void main(void) {
                vColor = vertex_color;
                gl_Position = matrix_viewProjection * matrix_model * vec4(vertex_position, 1.0);
            }
        `,
        fragmentGLSL: /* glsl */ `
            precision highp float;

            uniform vec4 tintClr;

            varying vec4 vColor;

            void main(void) {
                gl_FragColor = vec4(tintClr.rgb, tintClr.a * vColor.a);
            }
        `
    });

    material.blendType = BLEND_NORMAL;
    material.depthWrite = false;
    material.depthTest = true;
    material.cull = CULLFACE_NONE;
    material.update();
    return material;
};

class MeshVertexOverlay extends Element {
    entity: Entity;
    selectedEdgeMaterial: ShaderMaterial;
    meshes: Mesh[] = [];
    meshInstances: MeshInstance[] = [];
    model: ModelElement | null = null;
    dirty = true;

    constructor() {
        super(ElementType.debug);
    }

    add() {
        const { scene } = this;

        this.selectedEdgeMaterial = createEdgeMaterial('meshVertexSelectedEdgeOverlayMaterial');

        this.entity = new Entity('meshVertexOverlay');
        this.entity.addComponent('render', {
            meshInstances: [],
            layers: [scene.gizmoLayer.id]
        });
        scene.app.root.addChild(this.entity);

        scene.events.on('selection.changed', (selection: Element) => {
            this.model?.setVertexSelectionPreviewVisible(false);
            this.model = selection instanceof ModelElement ? selection : null;
            this.model?.setVertexSelectionPreviewVisible(true);
            this.dirty = true;
        });

        scene.events.on('model.vertexSelection', (model: ModelElement) => {
            if (model === this.model) {
                model.setVertexSelectionPreviewVisible(true);
                this.dirty = true;
            }
        });

        scene.events.on('model.geometry', (model: ModelElement) => {
            if (model === this.model) {
                model.setVertexSelectionPreviewVisible(true);
                this.dirty = true;
            }
        });

        scene.events.on('model.material', (model: ModelElement) => {
            if (model === this.model) {
                this.dirty = true;
            }
        });

        scene.events.on('model.moved', (model: ModelElement) => {
            if (model === this.model) {
                this.dirty = true;
            }
        });

    }

    destroy() {
        this.model?.setVertexSelectionPreviewVisible(false);
        this.entity?.remove();
        this.meshes.forEach(mesh => mesh.destroy());
        this.selectedEdgeMaterial?.destroy();
        this.entity?.destroy();
    }

    private setMeshInstances(meshInstances: MeshInstance[]) {
        this.entity.render.meshInstances = meshInstances;
    }

    private rebuild() {
        this.meshes.forEach(mesh => mesh.destroy());
        this.meshes = [];
        this.meshInstances = [];

        if (!this.visible) {
            this.setMeshInstances([]);
            return;
        }

        if (this.model.selectedVertexCount > 0) {
            const wireData = this.model.getWireOverlayData(true, 1, 1);

            if (wireData.edgePositions.length) {
                const mesh = createOverlayMesh(
                    this.scene.graphicsDevice,
                    wireData.edgePositions,
                    wireData.edgeColors,
                    PRIMITIVE_LINES
                );

                const meshInstance = new MeshInstance(mesh, this.selectedEdgeMaterial);
                meshInstance.cull = false;
                meshInstance.drawBucket = 129;
                this.meshes.push(mesh);
                this.meshInstances.push(meshInstance);
            }
        }

        this.setMeshInstances(this.meshInstances);
    }

    private updateMaterialParameters() {
        this.selectedEdgeMaterial.setParameter('tintClr', blenderSelectedColor);
    }

    onPreRender() {
        if (this.dirty) {
            this.rebuild();
            this.dirty = false;
        }
        this.updateMaterialParameters();
        this.entity.enabled = this.visible;
    }

    get visible() {
        return !!this.model && this.model.selectedVertexCount > 0;
    }
}

export { MeshVertexOverlay };
