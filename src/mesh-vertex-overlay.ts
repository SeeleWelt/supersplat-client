import {
    BLEND_NORMAL,
    CULLFACE_NONE,
    Entity,
    Mesh,
    MeshInstance,
    PRIMITIVE_POINTS,
    RENDERSTYLE_POINTS,
    SEMANTIC_COLOR,
    SEMANTIC_POSITION,
    ShaderMaterial,
    createMesh
} from 'playcanvas';

import { Element, ElementType } from './element';
import { ModelElement } from './model-element';

const meshVertexSelectionTools = new Set([
    'rectSelection',
    'brushSelection',
    'lassoSelection',
    'polygonSelection'
]);

class MeshVertexOverlay extends Element {
    entity: Entity;
    pointMaterial: ShaderMaterial;
    meshes: Mesh[] = [];
    meshInstances: MeshInstance[] = [];
    model: ModelElement | null = null;
    dirty = true;
    toolActive = false;

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
                    gl_PointSize = (vSelected > 0.5 ? 14.0 : 3.0) * pointScale;
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

                    if (vSelected > 0.5) {
                        float outer = smoothstep(0.25, 0.2, radius);
                        float core = smoothstep(0.14, 0.08, radius);
                        vec3 outline = selectedClr.rgb * 0.22;
                        vec3 fill = mix(selectedClr.rgb, vec3(1.0), 0.24);
                        gl_FragColor = vec4(mix(outline, fill, core), outer);
                    } else {
                        float soft = smoothstep(0.25, 0.09, radius);
                        gl_FragColor = vec4(unselectedClr.rgb, min(unselectedClr.a, 0.28) * vColor.a * soft);
                    }
                }
            `
        });
        this.pointMaterial.blendType = BLEND_NORMAL;
        this.pointMaterial.depthWrite = false;
        this.pointMaterial.depthTest = true;
        this.pointMaterial.cull = CULLFACE_NONE;
        this.pointMaterial.update();

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

        scene.events.on('model.moved', (model: ModelElement) => {
            if (model === this.model) {
                this.dirty = true;
            }
        });

        scene.events.on('tool.activated', (toolName: string) => {
            this.toolActive = meshVertexSelectionTools.has(toolName);
            this.dirty = true;
        });

        scene.events.on('tool.deactivated', () => {
            this.toolActive = false;
            this.dirty = true;
        });
    }

    destroy() {
        this.model?.setVertexSelectionPreviewVisible(false);
        this.entity?.remove();
        this.meshes.forEach(mesh => mesh.destroy());
        this.pointMaterial?.destroy();
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

        const vertexData = this.model.getVertexOverlayData(this.model.selectedVertexCount === 0);
        if (!vertexData.positions.length) {
            this.setMeshInstances([]);
            return;
        }

        if (vertexData.positions.length) {
            const mesh = createMesh(this.scene.graphicsDevice, vertexData.positions, {
                colors: vertexData.colors
            });
            mesh.primitive[0].type = PRIMITIVE_POINTS;
            mesh.primitive[0].count = vertexData.positions.length / 3;

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
        const selectedClr = this.scene.events.invoke('selectedClr');
        const unselectedClr = this.scene.events.invoke('unselectedClr');
        const selected = [selectedClr.r, selectedClr.g, selectedClr.b, selectedClr.a];
        const unselected = [unselectedClr.r, unselectedClr.g, unselectedClr.b, unselectedClr.a];

        this.pointMaterial.setParameter('pointScale', window.devicePixelRatio);
        this.pointMaterial.setParameter('selectedClr', selected);
        this.pointMaterial.setParameter('unselectedClr', unselected);
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
        return !!this.model && (this.toolActive || this.model.selectedVertexCount > 0);
    }
}

export { MeshVertexOverlay };
