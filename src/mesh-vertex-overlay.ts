import {
    BLEND_NORMAL,
    CULLFACE_NONE,
    Entity,
    Mesh,
    MeshInstance,
    PRIMITIVE_LINES,
    PRIMITIVE_POINTS,
    PRIMITIVE_TRIANGLES,
    RENDERSTYLE_POINTS,
    SEMANTIC_COLOR,
    SEMANTIC_POSITION,
    ShaderMaterial
} from 'playcanvas';

import { Element, ElementType } from './element';
import { ModelElement } from './model-element';

const blenderSelectedColor = [1.0, 0.48, 0.0, 1.0];
const blenderUnselectedColor = [0.04, 0.04, 0.04, 0.45];

const createOverlayMesh = (device: any, positions: number[], colors: number[], primitiveType: number) => {
    const mesh = new Mesh(device);
    const vertexCount = positions.length / 3;
    mesh.setPositions(positions, 3, vertexCount);
    mesh.setColors(colors, 4, vertexCount);
    mesh.update(primitiveType);
    return mesh;
};

class MeshVertexOverlay extends Element {
    entity: Entity;
    pointMaterial: ShaderMaterial;
    faceMaterial: ShaderMaterial;
    edgeMaterial: ShaderMaterial;
    meshes: Mesh[] = [];
    meshInstances: MeshInstance[] = [];
    model: ModelElement | null = null;
    dirty = true;

    constructor() {
        super(ElementType.debug);
    }

    add() {
        const { scene } = this;

        this.pointMaterial = new ShaderMaterial({
            uniqueName: 'meshVertexOverlayMaterial',
            attributes: {
                vertex_position: SEMANTIC_POSITION,
                vertex_color: SEMANTIC_COLOR
            },
            vertexGLSL: /* glsl */ `
                attribute vec3 vertex_position;
                attribute vec4 vertex_color;

                uniform mat4 matrix_model;
                uniform mat4 matrix_viewProjection;
                uniform float pointScale;

                varying vec4 vColor;
                varying float vSelected;

                void main(void) {
                    vColor = vertex_color;
                    vSelected = vertex_color.a > 0.9 ? 1.0 : 0.0;
                    gl_Position = matrix_viewProjection * matrix_model * vec4(vertex_position, 1.0);
                    gl_PointSize = 4.0 * pointScale;
                }
            `,
            fragmentGLSL: /* glsl */ `
                precision highp float;

                uniform vec4 selectedClr;
                uniform vec4 unselectedClr;

                varying vec4 vColor;
                varying float vSelected;

                void main(void) {
                    vec2 delta = gl_PointCoord - vec2(0.5);
                    float radius = dot(delta, delta);
                    if (radius > 0.25) {
                        discard;
                    }

                    float soft = smoothstep(0.25, 0.09, radius);
                    vec4 clr = vSelected > 0.5 ? selectedClr : unselectedClr;
                    gl_FragColor = vec4(clr.rgb, min(clr.a, 0.45) * vColor.a * soft);
                }
            `
        });
        this.pointMaterial.blendType = BLEND_NORMAL;
        this.pointMaterial.depthWrite = false;
        this.pointMaterial.depthTest = false;
        this.pointMaterial.cull = CULLFACE_NONE;
        this.pointMaterial.update();

        this.faceMaterial = new ShaderMaterial({
            uniqueName: 'meshVertexFaceOverlayMaterial',
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

                uniform vec4 selectedClr;

                varying vec4 vColor;

                void main(void) {
                    gl_FragColor = vec4(selectedClr.rgb, vColor.a * 0.22);
                }
            `
        });
        this.faceMaterial.blendType = BLEND_NORMAL;
        this.faceMaterial.depthWrite = false;
        this.faceMaterial.depthTest = true;
        this.faceMaterial.cull = CULLFACE_NONE;
        this.faceMaterial.update();

        this.edgeMaterial = new ShaderMaterial({
            uniqueName: 'meshVertexEdgeOverlayMaterial',
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

                uniform vec4 selectedClr;

                varying vec4 vColor;

                void main(void) {
                    gl_FragColor = vec4(selectedClr.rgb, vColor.a);
                }
            `
        });
        this.edgeMaterial.blendType = BLEND_NORMAL;
        this.edgeMaterial.depthWrite = false;
        this.edgeMaterial.depthTest = false;
        this.edgeMaterial.cull = CULLFACE_NONE;
        this.edgeMaterial.update();

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
        this.pointMaterial?.destroy();
        this.faceMaterial?.destroy();
        this.edgeMaterial?.destroy();
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

        const selectedVertexCount = this.model.selectedVertexCount;
        const vertexData = this.model.getVertexOverlayData(selectedVertexCount === 0);
        if (!vertexData.positions.length) {
            this.setMeshInstances([]);
            return;
        }

        if (selectedVertexCount > 0) {
            const faceData = this.model.getSelectedFaceOverlayData();
            if (faceData.trianglePositions.length && this.model.viewportMode !== 'wireframe') {
                const mesh = createOverlayMesh(
                    this.scene.graphicsDevice,
                    faceData.trianglePositions,
                    faceData.triangleColors,
                    PRIMITIVE_TRIANGLES
                );

                const meshInstance = new MeshInstance(mesh, this.faceMaterial);
                meshInstance.cull = false;
                meshInstance.drawBucket = 128;
                this.meshes.push(mesh);
                this.meshInstances.push(meshInstance);
            }

            if (faceData.edgePositions.length && this.model.viewportMode !== 'wireframe') {
                const mesh = createOverlayMesh(
                    this.scene.graphicsDevice,
                    faceData.edgePositions,
                    faceData.edgeColors,
                    PRIMITIVE_LINES
                );

                const meshInstance = new MeshInstance(mesh, this.edgeMaterial);
                meshInstance.cull = false;
                meshInstance.drawBucket = 129;
                this.meshes.push(mesh);
                this.meshInstances.push(meshInstance);
            }
        }

        if (vertexData.positions.length) {
            const mesh = createOverlayMesh(
                this.scene.graphicsDevice,
                vertexData.positions,
                vertexData.colors,
                PRIMITIVE_POINTS
            );

            const meshInstance = new MeshInstance(mesh, this.pointMaterial);
            meshInstance.renderStyle = RENDERSTYLE_POINTS;
            meshInstance.cull = false;
            meshInstance.drawBucket = 130;
            this.meshes.push(mesh);
            this.meshInstances.push(meshInstance);
        }

        this.setMeshInstances(this.meshInstances);
    }

    private updateMaterialParameters() {
        this.pointMaterial.setParameter('pointScale', window.devicePixelRatio);
        this.pointMaterial.setParameter('selectedClr', blenderSelectedColor);
        this.pointMaterial.setParameter('unselectedClr', blenderUnselectedColor);
        this.faceMaterial.setParameter('selectedClr', blenderSelectedColor);
        this.edgeMaterial.setParameter('selectedClr', blenderSelectedColor);
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
