import {
    BLEND_NONE,
    BLEND_NORMAL,
    BoundingBox,
    Color,
    CULLFACE_NONE,
    Entity,
    Mat4,
    Mesh,
    MeshInstance,
    PRIMITIVE_LINES,
    PRIMITIVE_LINELOOP,
    PRIMITIVE_LINESTRIP,
    PRIMITIVE_POINTS,
    PRIMITIVE_TRIANGLES,
    Quat,
    Ray,
    RENDERSTYLE_SOLID,
    RENDERSTYLE_WIREFRAME,
    SEMANTIC_COLOR,
    StandardMaterial,
    Texture,
    Vec3,
    Vec4,
    calculateNormals,
} from 'playcanvas';

import { Element, ElementType } from './element';
import { ParsedMeshData } from './mesh-data';
import { Serializer } from './serializer';
import { Transform } from './transform';

type ModelElementMaterialState = {
    diffuse: Color;
    opacity: number;
    metalness: number;
    gloss: number;
    emissive: Color;
    emissiveIntensity: number;
    useLighting: boolean;
    useVertexColors: boolean;
    cull: number;
    renderStyle: number;
    hasDiffuseMap: boolean;
    hasNormalMap: boolean;
};

type MeshViewportMode = 'wireframe' | 'solid' | 'material' | 'rendered';

type MeshTextureSlot = 'diffuse' | 'normal';

type MeshTextureInfo = {
    slot: MeshTextureSlot;
    name: string;
    path: string;
    width: number;
    height: number;
    hasTexture: boolean;
    hasInitialTexture: boolean;
};

type MeshStats = {
    vertices: number;
    selectedVertices: number;
    triangles: number;
    selectedTriangles: number;
    fullySelectedTriangles: number;
    lines: number;
    points: number;
    meshInstances: number;
    vertexStreams: number;
    materials: number;
    hasVertexColors: boolean;
    hasDiffuseMap: boolean;
    hasNormalMap: boolean;
    width: number;
    height: number;
    depth: number;
};

type MeshDataDomain = 'vertex' | 'face';

type MeshDataProperty = {
    id: string;
    domain: MeshDataDomain;
};

type MeshHistogramData = {
    selected: Float32Array;
    unselected: Float32Array;
    min: number;
    max: number;
    numValues: number;
};

type MeshVertexCache = {
    meshInstance: MeshInstance;
    primitiveType: number;
    positions: Float32Array;
    normals: Float32Array | null;
    uvs: Float32Array | null;
    colors: Float32Array | null;
    indices: number[] | null;
    selected: Uint8Array;
};

type MeshVertexCacheSnapshot = {
    primitiveType: number;
    positions: Float32Array;
    normals: Float32Array | null;
    uvs: Float32Array | null;
    colors: Float32Array | null;
    indices: number[] | null;
    selected: Uint8Array;
};

type MeshGeometrySnapshot = MeshVertexCacheSnapshot[];

type VertexHitOptions = {
    through: boolean;
};

const defaultMaterialState = (): ModelElementMaterialState => ({
    diffuse: new Color(0.85, 0.85, 0.85),
    opacity: 1,
    metalness: 0,
    gloss: 0.5,
    emissive: new Color(0, 0, 0),
    emissiveIntensity: 0,
    useLighting: true,
    useVertexColors: false,
    cull: CULLFACE_NONE,
    renderStyle: RENDERSTYLE_SOLID,
    hasDiffuseMap: false,
    hasNormalMap: false
});

const applyVertexColorMaterial = (material: StandardMaterial) => {
    material.diffuseVertexColor = true;
    material.diffuseVertexColorChannel = 'rgb';
    material.emissiveVertexColor = false;
    material.emissiveVertexColorChannel = 'rgb';
    material.diffuse = new Color(1, 1, 1);
    material.emissive = new Color(0, 0, 0);
    material.emissiveIntensity = 0;
};

const vertexColorElement = (mesh: Mesh) => {
    return mesh.vertexBuffer?.format?.elements?.find((element: any) => element.name === SEMANTIC_COLOR) ?? null;
};

const hasVertexColorStream = (mesh: Mesh) => {
    return !!vertexColorElement(mesh);
};

const normalizeColorValue = (value: number | undefined, scale: number, fallback = 1) => {
    return value === undefined ? fallback : value * scale;
};

const normalizeVertexColors = (colors: number[], vertexCount: number, componentCount: number) => {
    const result = new Float32Array(vertexCount * 4);
    const scale = colors.some(value => value > 1) ? 1 / 255 : 1;

    for (let i = 0; i < vertexCount; i++) {
        const src = i * componentCount;
        const dst = i * 4;
        result[dst] = normalizeColorValue(colors[src], scale);
        result[dst + 1] = normalizeColorValue(colors[src + 1], scale, result[dst]);
        result[dst + 2] = normalizeColorValue(colors[src + 2], scale, result[dst]);
        result[dst + 3] = componentCount > 3 ? normalizeColorValue(colors[src + 3], scale) : 1;
    }

    return result;
};

const normalizeParsedVertexColors = (colors: number[] | undefined, vertexCount: number) => {
    if (!colors?.length) {
        return undefined;
    }

    const componentCount = colors.length === vertexCount * 3 ? 3 : 4;
    return normalizeVertexColors(colors, vertexCount, componentCount);
};

const getParsedMeshNormals = (data: ParsedMeshData, vertexCount: number) => {
    if (data.normals) {
        return data.normals;
    }

    if (data.primitiveType !== PRIMITIVE_TRIANGLES) {
        return undefined;
    }

    if (data.indices) {
        return calculateNormals(data.positions, data.indices);
    }

    if (vertexCount % 3 !== 0) {
        return undefined;
    }

    const indices = new Array(vertexCount);
    for (let i = 0; i < vertexCount; i++) {
        indices[i] = i;
    }
    return calculateNormals(data.positions, indices);
};

const worldToLocal = new Mat4();
const meshWorld = new Mat4();
const viewProj = new Mat4();
const vertexLocal = new Vec3();
const vertexWorld = new Vec3();
const vertexClip = new Vec4();
const vertexTransformed = new Vec3();
const normalLocal = new Vec3();
const normalWorld = new Vec3();
const normalTransformed = new Vec3();
const selectedVertexMin = new Vec3();
const selectedVertexMax = new Vec3();
const faceA = new Vec3();
const faceB = new Vec3();
const faceC = new Vec3();
const faceAB = new Vec3();
const faceAC = new Vec3();
const faceCenter = new Vec3();
const faceNormal = new Vec3();
const vertexKeyScale = 100000;

const copyVertexStream = (source: Float32Array | null, keep: Uint32Array, components: number) => {
    if (!source) {
        return null;
    }

    const result = new Float32Array(keep.length * components);
    keep.forEach((oldIndex, newIndex) => {
        const src = oldIndex * components;
        const dst = newIndex * components;
        for (let i = 0; i < components; i++) {
            result[dst + i] = source[src + i];
        }
    });
    return result;
};

const pushPrimitiveIfAlive = (
    sourceIndices: (index: number) => number,
    start: number,
    count: number,
    selected: Uint8Array,
    target: number[]
) => {
    for (let i = 0; i < count; i++) {
        if (selected[sourceIndices(start + i)]) {
            return;
        }
    }

    for (let i = 0; i < count; i++) {
        target.push(sourceIndices(start + i));
    }
};

const collectAlivePrimitiveIndices = (item: MeshVertexCacheSnapshot, oldCount: number) => {
    const selected = item.selected;
    const source = item.indices ? (index: number) => item.indices[index] : (index: number) => index;
    const sourceCount = item.indices ? item.indices.length : oldCount;
    const indices: number[] = [];
    let primitiveType = item.primitiveType;

    if (item.primitiveType === PRIMITIVE_TRIANGLES) {
        for (let i = 0; i + 2 < sourceCount; i += 3) {
            pushPrimitiveIfAlive(source, i, 3, selected, indices);
        }
    } else if (item.primitiveType === PRIMITIVE_LINES) {
        for (let i = 0; i + 1 < sourceCount; i += 2) {
            pushPrimitiveIfAlive(source, i, 2, selected, indices);
        }
    } else if (item.primitiveType === PRIMITIVE_LINESTRIP || item.primitiveType === PRIMITIVE_LINELOOP) {
        primitiveType = PRIMITIVE_LINES;
        const max = item.primitiveType === PRIMITIVE_LINELOOP ? sourceCount : sourceCount - 1;
        for (let i = 0; i < max; i++) {
            const a = source(i);
            const b = source((i + 1) % sourceCount);
            if (!selected[a] && !selected[b]) {
                indices.push(a, b);
            }
        }
    } else {
        for (let i = 0; i < sourceCount; i++) {
            const index = source(i);
            if (!selected[index]) {
                indices.push(index);
            }
        }
    }

    return { indices, primitiveType };
};

class ModelElement extends Element {
    filename: string;
    entity: Entity;
    mesh: Mesh | null = null;
    material: StandardMaterial | null = null;
    meshInstance: MeshInstance | null = null;
    localBoundStorage = new BoundingBox();
    worldBoundStorage = new BoundingBox();
    selectedVertexWorldBoundStorage = new BoundingBox();
    changedCounter = 0;
    hasVertexColors = false;
    initialVertexCount = 0;

    private data: ParsedMeshData | null;
    private vertexCaches: MeshVertexCache[] = [];
    private sourceMaterials = new Map<MeshInstance, StandardMaterial>();
    private viewportMaterials = new Map<MeshViewportMode, StandardMaterial>();
    private _viewportMode: MeshViewportMode = 'rendered';
    private vertexSelectionPreview = new Map<StandardMaterial, {
        opacity: number;
        blendType: number;
        depthWrite: boolean;
    }>();
    private initialTextureState = new Map<StandardMaterial, {
        diffuse: Texture | null;
        normal: Texture | null;
    }>();

    _name: string;
    _visible = true;

    constructor(filename: string, source: ParsedMeshData | Entity) {
        super(ElementType.model);

        this.filename = filename;
        this._name = filename;

        if (source instanceof Entity) {
            this.data = null;
            this.entity = source;
            this.entity.name = source.name || 'modelEntity';
        } else {
            this.data = source;
            this.entity = new Entity('modelEntity');
        }
    }

    destroy() {
        super.destroy();
        this.entity.destroy();
        this.mesh?.destroy();
        this.material?.destroy();
        this.viewportMaterials.forEach(material => material.destroy());
    }

    add() {
        const { scene, data } = this;

        if (data) {
            const vertexCount = data.positions.length / 3;
            const colors = normalizeParsedVertexColors(data.colors, vertexCount);
            const normals = getParsedMeshNormals(data, vertexCount);

            this.hasVertexColors = !!colors;
            this.mesh = new Mesh(scene.graphicsDevice);
            this.mesh.setPositions(data.positions, 3, vertexCount);
            if (normals) {
                this.mesh.setNormals(normals, 3, vertexCount);
            }
            if (data.uvs) {
                this.mesh.setUvs(0, data.uvs, 2, vertexCount);
            }
            if (colors) {
                this.mesh.setColors(colors, 4, vertexCount);
            }
            if (data.indices) {
                this.mesh.setIndices(data.indices);
            }
            this.mesh.update(data.primitiveType);

            this.material = new StandardMaterial();
            this.material.name = 'Mesh Material';
            this.material.diffuse = new Color(0.85, 0.85, 0.85);
            this.material.useLighting = true;
            this.material.cull = CULLFACE_NONE;
            this.material.blendType = BLEND_NONE;
            if (colors) {
                applyVertexColorMaterial(this.material);
            }
            this.material.update();

            this.meshInstance = new MeshInstance(this.mesh, this.material);
            this.entity.addComponent('render', {
                meshInstances: [this.meshInstance],
                layers: [scene.worldLayer.id]
            });
        }

        this.applyWorldLayer();
        scene.contentRoot.addChild(this.entity);
        this.captureSourceMaterials();
        this.buildVertexCaches();
        this.updateVertexColorSupport();
        this.applyVertexColorFallback();
        this.applyViewportMode(this._viewportMode, false);
        this.initialVertexCount = this.vertexCount;
        this.captureInitialTextures();
        this.updateLocalBound();
        this.updateWorldBound();
    }

    remove() {
        if (this.entity.parent) {
            this.entity.parent.removeChild(this.entity);
        }
        this.scene.boundDirty = true;
    }

    serialize(serializer: Serializer) {
        serializer.packa(this.entity.getWorldTransform().data);
        serializer.pack(this.changedCounter, this.visible);
    }

    onPreRender() {
        this.entity.enabled = this.visible;
    }

    move(position?: Vec3, rotation?: Quat, scale?: Vec3) {
        if (position) {
            this.entity.setLocalPosition(position);
        }
        if (rotation) {
            this.entity.setLocalRotation(rotation);
        }
        if (scale) {
            this.entity.setLocalScale(scale);
        }
        this.updateWorldBound();
        this.changedCounter++;
        this.scene.events.fire('model.moved', this);
    }

    private applyWorldLayer() {
        const layerId = this.scene.worldLayer.id;
        this.entity.findComponents('render').forEach((render: any) => {
            render.layers = [layerId];
        });
    }

    private get meshInstances() {
        const result: MeshInstance[] = [];
        this.entity.findComponents('render').forEach((render: any) => {
            if (render.meshInstances) {
                result.push(...render.meshInstances);
            }
        });
        return result;
    }

    private get standardMaterials() {
        const materials: StandardMaterial[] = [];
        const seen = new Set<StandardMaterial>();

        this.meshInstances.forEach((meshInstance) => {
            const material = this.sourceMaterials.get(meshInstance) ?? meshInstance.material;
            if (material instanceof StandardMaterial && !seen.has(material)) {
                seen.add(material);
                materials.push(material);
            }
        });

        return materials;
    }

    private captureSourceMaterials() {
        this.sourceMaterials.clear();
        this.meshInstances.forEach((meshInstance) => {
            if (meshInstance.material instanceof StandardMaterial) {
                this.sourceMaterials.set(meshInstance, meshInstance.material);
            }
        });
    }

    private getViewportMaterial(mode: MeshViewportMode) {
        let material = this.viewportMaterials.get(mode);
        if (material) {
            return material;
        }

        material = new StandardMaterial();
        material.name = `Mesh ${mode} View Material`;
        material.diffuse = mode === 'wireframe' ? new Color(0.78, 0.86, 0.92) : new Color(0.72, 0.72, 0.72);
        material.emissive = mode === 'wireframe' ? new Color(0.78, 0.86, 0.92) : new Color(0.72, 0.72, 0.72);
        material.emissiveIntensity = mode === 'wireframe' ? 0.18 : 0;
        material.useLighting = false;
        material.cull = CULLFACE_NONE;
        material.blendType = BLEND_NONE;
        material.update();
        this.viewportMaterials.set(mode, material);
        return material;
    }

    private captureInitialTextures() {
        this.initialTextureState.clear();
        this.standardMaterials.forEach((material) => {
            this.initialTextureState.set(material, {
                diffuse: material.diffuseMap ?? null,
                normal: material.normalMap ?? null
            });
        });
    }

    private textureFor(material: StandardMaterial, slot: MeshTextureSlot) {
        return slot === 'diffuse' ? material.diffuseMap : material.normalMap;
    }

    private setTextureFor(material: StandardMaterial, slot: MeshTextureSlot, texture: Texture | null) {
        if (slot === 'diffuse') {
            material.diffuseMap = texture;
        } else {
            material.normalMap = texture;
            material.useLighting = !!texture || material.useLighting;
        }
        material.update();
    }

    private firstTexture(slot: MeshTextureSlot) {
        for (const material of this.standardMaterials) {
            const texture = this.textureFor(material, slot);
            if (texture) {
                return texture;
            }
        }
        return null;
    }

    private firstInitialTexture(slot: MeshTextureSlot) {
        for (const material of this.standardMaterials) {
            const texture = this.initialTextureState.get(material)?.[slot];
            if (texture) {
                return texture;
            }
        }
        return null;
    }

    private textureDisplayPath(texture: Texture | null, fallback: string) {
        if (!texture) {
            return fallback;
        }

        const source = texture.getSource?.() as HTMLImageElement | HTMLCanvasElement | null;
        const rawName = texture.name || (source instanceof HTMLImageElement ? source.currentSrc || source.src : '') || fallback;
        const withoutQuery = rawName.split('?')[0].split('#')[0];

        try {
            return decodeURIComponent(withoutQuery);
        } catch {
            return withoutQuery;
        }
    }

    private textureDisplayName(texture: Texture | null, fallback: string) {
        const path = this.textureDisplayPath(texture, fallback);
        return path.split(/[\\/]/).pop() || path;
    }

    private buildVertexCaches() {
        this.vertexCaches = [];
        this.meshInstances.forEach((meshInstance) => {
            if (meshInstance.skinInstance || meshInstance.morphInstance) {
                return;
            }

            const mesh = meshInstance.mesh;
            const positions: number[] = [];
            const count = mesh.getPositions(positions);
            if (count > 0) {
                const normals: number[] = [];
                const uvs: number[] = [];
                const colors: number[] = [];
                const indices: number[] = [];
                const normalCount = mesh.getNormals(normals);
                const uvCount = mesh.getUvs(0, uvs);
                const colorCount = mesh.getColors(colors);
                const colorComponentCount = vertexColorElement(mesh)?.numComponents ?? 4;
                const indexCount = mesh.getIndices(indices);
                this.vertexCaches.push({
                    meshInstance,
                    primitiveType: mesh.primitive[0].type ?? PRIMITIVE_TRIANGLES,
                    positions: new Float32Array(positions.slice(0, count * 3)),
                    normals: normalCount === count ? new Float32Array(normals.slice(0, count * 3)) : null,
                    uvs: uvCount === count ? new Float32Array(uvs.slice(0, count * 2)) : null,
                    colors: colorCount === count ? normalizeVertexColors(colors, count, colorComponentCount) : null,
                    indices: indexCount > 0 ? indices.slice(0, indexCount) : null,
                    selected: new Uint8Array(count)
                });
            }
        });
    }

    private updateVertexColorSupport() {
        this.hasVertexColors = this.vertexCaches.some(cache => !!cache.colors) ||
            this.meshInstances.some(meshInstance => hasVertexColorStream(meshInstance.mesh));
    }

    private applyVertexColorFallback() {
        if (!this.hasVertexColors) {
            return;
        }

        this.standardMaterials.forEach((material) => {
            if (!material.diffuseMap) {
                applyVertexColorMaterial(material);
                material.update();
            }
        });
    }

    private syncMesh(cache: MeshVertexCache) {
        const mesh = cache.meshInstance.mesh;
        const vertexCount = cache.positions.length / 3;

        mesh.clear(true);
        mesh.setPositions(cache.positions, 3, vertexCount);
        if (cache.normals) {
            mesh.setNormals(cache.normals, 3, vertexCount);
        }
        if (cache.uvs) {
            mesh.setUvs(0, cache.uvs, 2, vertexCount);
        }
        if (cache.colors) {
            mesh.setColors(cache.colors, 4, vertexCount);
        }
        if (cache.indices) {
            mesh.setIndices(cache.indices);
        }
        mesh.update(cache.primitiveType, true);
    }

    private forEachVertex(action: (cache: MeshVertexCache, vertexIndex: number, globalIndex: number) => void) {
        let globalIndex = 0;
        this.vertexCaches.forEach((cache) => {
            const count = cache.positions.length / 3;
            for (let i = 0; i < count; i++) {
                action(cache, i, globalIndex++);
            }
        });
    }

    private forEachTriangle(action: (cache: MeshVertexCache, a: number, b: number, c: number, faceIndex: number) => void) {
        let faceIndex = 0;
        this.vertexCaches.forEach((cache) => {
            if (cache.primitiveType !== PRIMITIVE_TRIANGLES) {
                return;
            }

            const vertexCount = cache.positions.length / 3;
            if (cache.indices) {
                for (let i = 0; i + 2 < cache.indices.length; i += 3) {
                    action(cache, cache.indices[i], cache.indices[i + 1], cache.indices[i + 2], faceIndex++);
                }
            } else {
                for (let i = 0; i + 2 < vertexCount; i += 3) {
                    action(cache, i, i + 1, i + 2, faceIndex++);
                }
            }
        });
    }

    private getVertexWorldPosition(cache: MeshVertexCache, vertexIndex: number, result: Vec3) {
        const offset = vertexIndex * 3;
        vertexLocal.set(cache.positions[offset], cache.positions[offset + 1], cache.positions[offset + 2]);
        meshWorld.copy(cache.meshInstance.node.getWorldTransform());
        meshWorld.transformPoint(vertexLocal, result);
        return result;
    }

    private getVertexWorldNormal(cache: MeshVertexCache, vertexIndex: number, result: Vec3) {
        if (!cache.normals) {
            return null;
        }

        const offset = vertexIndex * 3;
        normalLocal.set(cache.normals[offset], cache.normals[offset + 1], cache.normals[offset + 2]);
        meshWorld.copy(cache.meshInstance.node.getWorldTransform());
        meshWorld.transformVector(normalLocal, result).normalize();
        return result;
    }

    private getVertexCameraDepth(worldPosition: Vec3) {
        const camera = this.scene.camera.camera;
        camera.viewMatrix.transformPoint(worldPosition, vertexTransformed);
        return -vertexTransformed.z;
    }

    private getVertexDataValue(cache: MeshVertexCache, vertexIndex: number, prop: string) {
        const offset3 = vertexIndex * 3;
        const offset2 = vertexIndex * 2;
        const offset4 = vertexIndex * 4;

        switch (prop) {
            case 'vertex:x':
            case 'vertex:y':
            case 'vertex:z':
            case 'vertex:distance':
            case 'vertex:camera-depth': {
                this.getVertexWorldPosition(cache, vertexIndex, vertexWorld);
                if (prop === 'vertex:x') return vertexWorld.x;
                if (prop === 'vertex:y') return vertexWorld.y;
                if (prop === 'vertex:z') return vertexWorld.z;
                if (prop === 'vertex:distance') return vertexWorld.length();
                return this.getVertexCameraDepth(vertexWorld);
            }
            case 'vertex:normal-x':
            case 'vertex:normal-y':
            case 'vertex:normal-z': {
                const normal = this.getVertexWorldNormal(cache, vertexIndex, normalWorld);
                if (!normal) return null;
                if (prop === 'vertex:normal-x') return normal.x;
                if (prop === 'vertex:normal-y') return normal.y;
                return normal.z;
            }
            case 'vertex:u':
                return cache.uvs ? cache.uvs[offset2] : null;
            case 'vertex:v':
                return cache.uvs ? cache.uvs[offset2 + 1] : null;
            case 'vertex:red':
                return cache.colors ? cache.colors[offset4] : null;
            case 'vertex:green':
                return cache.colors ? cache.colors[offset4 + 1] : null;
            case 'vertex:blue':
                return cache.colors ? cache.colors[offset4 + 2] : null;
            case 'vertex:alpha':
                return cache.colors ? cache.colors[offset4 + 3] : null;
            case 'vertex:index':
                return offset3 / 3;
            default:
                return null;
        }
    }

    private getFaceDataValue(cache: MeshVertexCache, a: number, b: number, c: number, prop: string) {
        this.getVertexWorldPosition(cache, a, faceA);
        this.getVertexWorldPosition(cache, b, faceB);
        this.getVertexWorldPosition(cache, c, faceC);
        faceCenter.add2(faceA, faceB).add(faceC).mulScalar(1 / 3);
        faceAB.sub2(faceB, faceA);
        faceAC.sub2(faceC, faceA);
        faceNormal.cross(faceAB, faceAC);
        const doubleArea = faceNormal.length();
        const area = doubleArea * 0.5;
        if (doubleArea > 0) {
            faceNormal.mulScalar(1 / doubleArea);
        } else {
            faceNormal.set(0, 0, 0);
        }

        switch (prop) {
            case 'face:center-x':
                return faceCenter.x;
            case 'face:center-y':
                return faceCenter.y;
            case 'face:center-z':
                return faceCenter.z;
            case 'face:normal-x':
                return faceNormal.x;
            case 'face:normal-y':
                return faceNormal.y;
            case 'face:normal-z':
                return faceNormal.z;
            case 'face:area':
                return area;
            case 'face:distance':
                return faceCenter.length();
            case 'face:camera-depth':
                return this.getVertexCameraDepth(faceCenter);
            default:
                return null;
        }
    }

    private valueToBucket(value: number, min: number, max: number, numBins: number) {
        const n = min === max ? 0 : (value - min) / (max - min);
        return Math.max(0, Math.min(numBins - 1, Math.floor(n * numBins)));
    }

    private getVertexWorldKey(cache: MeshVertexCache, vertexIndex: number) {
        this.getVertexWorldPosition(cache, vertexIndex, vertexWorld);
        return [
            Math.round(vertexWorld.x * vertexKeyScale),
            Math.round(vertexWorld.y * vertexKeyScale),
            Math.round(vertexWorld.z * vertexKeyScale)
        ].join(',');
    }

    private expandHitMaskByPosition(hitMask: Uint8Array) {
        if (hitMask.length !== this.vertexCount) {
            return hitMask;
        }

        const keys = new Set<string>();
        this.forEachVertex((cache, vertexIndex, globalIndex) => {
            if (hitMask[globalIndex]) {
                keys.add(this.getVertexWorldKey(cache, vertexIndex));
            }
        });

        if (!keys.size) {
            return hitMask;
        }

        const expanded = hitMask.slice();
        this.forEachVertex((cache, vertexIndex, globalIndex) => {
            if (keys.has(this.getVertexWorldKey(cache, vertexIndex))) {
                expanded[globalIndex] = 255;
            }
        });
        return expanded;
    }

    get vertexCount() {
        return this.vertexCaches.reduce((sum, cache) => sum + cache.selected.length, 0);
    }

    get selectedVertexCount() {
        return this.vertexCaches.reduce((sum, cache) => {
            for (let i = 0; i < cache.selected.length; i++) {
                sum += cache.selected[i] ? 1 : 0;
            }
            return sum;
        }, 0);
    }

    get supportsVertexSelection() {
        return this.vertexCount > 0;
    }

    get deletedVertexCount() {
        return Math.max(0, this.initialVertexCount - this.vertexCount);
    }

    get meshStats(): MeshStats {
        let triangles = 0;
        let selectedTriangles = 0;
        let fullySelectedTriangles = 0;
        let lines = 0;
        let points = 0;

        const countTriangle = (cache: MeshVertexCache, a: number, b: number, c: number) => {
            triangles++;
            const selectedCount = (cache.selected[a] ? 1 : 0) + (cache.selected[b] ? 1 : 0) + (cache.selected[c] ? 1 : 0);
            if (selectedCount > 0) {
                selectedTriangles++;
            }
            if (selectedCount === 3) {
                fullySelectedTriangles++;
            }
        };

        this.vertexCaches.forEach((cache) => {
            const vertexCount = cache.positions.length / 3;
            if (cache.primitiveType === PRIMITIVE_TRIANGLES) {
                if (cache.indices) {
                    for (let i = 0; i + 2 < cache.indices.length; i += 3) {
                        countTriangle(cache, cache.indices[i], cache.indices[i + 1], cache.indices[i + 2]);
                    }
                } else {
                    for (let i = 0; i + 2 < vertexCount; i += 3) {
                        countTriangle(cache, i, i + 1, i + 2);
                    }
                }
            } else if (cache.primitiveType === PRIMITIVE_LINES) {
                lines += cache.indices ? Math.floor(cache.indices.length / 2) : Math.floor(vertexCount / 2);
            } else if (cache.primitiveType === PRIMITIVE_LINESTRIP) {
                lines += Math.max(0, vertexCount - 1);
            } else if (cache.primitiveType === PRIMITIVE_LINELOOP) {
                lines += vertexCount;
            } else if (cache.primitiveType === PRIMITIVE_POINTS) {
                points += vertexCount;
            }
        });

        const diffuse = this.getTextureInfo('diffuse');
        const normal = this.getTextureInfo('normal');
        const halfExtents = this.worldBound.halfExtents;

        return {
            vertices: this.vertexCount,
            selectedVertices: this.selectedVertexCount,
            triangles,
            selectedTriangles,
            fullySelectedTriangles,
            lines,
            points,
            meshInstances: this.meshInstances.length,
            vertexStreams: this.vertexCaches.length,
            materials: this.standardMaterials.length,
            hasVertexColors: this.hasVertexColors,
            hasDiffuseMap: diffuse.hasTexture,
            hasNormalMap: normal.hasTexture,
            width: halfExtents.x * 2,
            height: halfExtents.y * 2,
            depth: halfExtents.z * 2
        };
    }

    getMeshDataProperties(): MeshDataProperty[] {
        const hasNormals = this.vertexCaches.some(cache => !!cache.normals);
        const hasUvs = this.vertexCaches.some(cache => !!cache.uvs);
        const hasColors = this.vertexCaches.some(cache => !!cache.colors);
        let hasFaces = false;
        this.forEachTriangle(() => {
            hasFaces = true;
        });

        const props: MeshDataProperty[] = [
            { id: 'vertex:x', domain: 'vertex' },
            { id: 'vertex:y', domain: 'vertex' },
            { id: 'vertex:z', domain: 'vertex' },
            { id: 'vertex:distance', domain: 'vertex' },
            { id: 'vertex:camera-depth', domain: 'vertex' }
        ];

        if (hasNormals) {
            props.push(
                { id: 'vertex:normal-x', domain: 'vertex' },
                { id: 'vertex:normal-y', domain: 'vertex' },
                { id: 'vertex:normal-z', domain: 'vertex' }
            );
        }

        if (hasUvs) {
            props.push(
                { id: 'vertex:u', domain: 'vertex' },
                { id: 'vertex:v', domain: 'vertex' }
            );
        }

        if (hasColors) {
            props.push(
                { id: 'vertex:red', domain: 'vertex' },
                { id: 'vertex:green', domain: 'vertex' },
                { id: 'vertex:blue', domain: 'vertex' },
                { id: 'vertex:alpha', domain: 'vertex' }
            );
        }

        if (hasFaces) {
            props.push(
                { id: 'face:center-x', domain: 'face' },
                { id: 'face:center-y', domain: 'face' },
                { id: 'face:center-z', domain: 'face' },
                { id: 'face:normal-x', domain: 'face' },
                { id: 'face:normal-y', domain: 'face' },
                { id: 'face:normal-z', domain: 'face' },
                { id: 'face:area', domain: 'face' },
                { id: 'face:distance', domain: 'face' },
                { id: 'face:camera-depth', domain: 'face' }
            );
        }

        return props;
    }

    calcMeshDataHistogram(prop: string, numBins: number): MeshHistogramData {
        const samples: { value: number; selected: boolean }[] = [];

        if (prop.startsWith('face:')) {
            this.forEachTriangle((cache, a, b, c) => {
                const value = this.getFaceDataValue(cache, a, b, c, prop);
                if (value !== null && Number.isFinite(value)) {
                    samples.push({
                        value,
                        selected: !!(cache.selected[a] || cache.selected[b] || cache.selected[c])
                    });
                }
            });
        } else {
            this.forEachVertex((cache, vertexIndex) => {
                const value = this.getVertexDataValue(cache, vertexIndex, prop);
                if (value !== null && Number.isFinite(value)) {
                    samples.push({
                        value,
                        selected: !!cache.selected[vertexIndex]
                    });
                }
            });
        }

        const selected = new Float32Array(numBins);
        const unselected = new Float32Array(numBins);
        if (!samples.length) {
            return { selected, unselected, min: 0, max: 0, numValues: 0 };
        }

        let min = Infinity;
        let max = -Infinity;
        samples.forEach(({ value }) => {
            min = Math.min(min, value);
            max = Math.max(max, value);
        });

        samples.forEach(({ value, selected: isSelected }) => {
            const bucket = this.valueToBucket(value, min, max, numBins);
            if (isSelected) {
                selected[bucket]++;
            } else {
                unselected[bucket]++;
            }
        });

        return { selected, unselected, min, max, numValues: samples.length };
    }

    hitTestDataRange(prop: string, min: number, max: number, numBins: number, rangeStart: number, rangeEnd: number) {
        const hitMask = new Uint8Array(this.vertexCount);
        const inRange = (value: number) => {
            const bucket = this.valueToBucket(value, min, max, numBins);
            return bucket >= rangeStart && bucket <= rangeEnd;
        };

        if (prop.startsWith('face:')) {
            this.forEachTriangle((cache, a, b, c) => {
                const value = this.getFaceDataValue(cache, a, b, c, prop);
                if (value !== null && Number.isFinite(value) && inRange(value)) {
                    let globalIndex = 0;
                    for (const candidate of this.vertexCaches) {
                        if (candidate === cache) {
                            hitMask[globalIndex + a] = 255;
                            hitMask[globalIndex + b] = 255;
                            hitMask[globalIndex + c] = 255;
                            break;
                        }
                        globalIndex += candidate.selected.length;
                    }
                }
            });
        } else {
            this.forEachVertex((cache, vertexIndex, globalIndex) => {
                const value = this.getVertexDataValue(cache, vertexIndex, prop);
                if (value !== null && Number.isFinite(value) && inRange(value)) {
                    hitMask[globalIndex] = 255;
                }
            });
        }

        return hitMask;
    }

    getVertexSelectionSnapshot() {
        const snapshot = new Uint8Array(this.vertexCount);
        let offset = 0;
        this.vertexCaches.forEach((cache) => {
            snapshot.set(cache.selected, offset);
            offset += cache.selected.length;
        });
        return snapshot;
    }

    setVertexSelectionSnapshot(snapshot: Uint8Array) {
        let offset = 0;
        this.vertexCaches.forEach((cache) => {
            cache.selected.set(snapshot.subarray(offset, offset + cache.selected.length));
            offset += cache.selected.length;
        });
        this.updateVertexSelectionPreview();
        this.changedCounter++;
        this.scene.forceRender = true;
        this.scene.events.fire('model.vertexSelection', this);
    }

    applyVertexSelection(op: 'add' | 'remove' | 'set', hitMask: Uint8Array) {
        const before = this.getVertexSelectionSnapshot();
        const after = before.slice();
        const expandedHitMask = this.expandHitMaskByPosition(hitMask);
        for (let i = 0; i < after.length; i++) {
            const hit = expandedHitMask[i] !== 0;
            if (op === 'set') {
                after[i] = hit ? 1 : 0;
            } else if (op === 'add' && hit) {
                after[i] = 1;
            } else if (op === 'remove' && hit) {
                after[i] = 0;
            }
        }
        return { before, after };
    }

    getGeometrySnapshot(): MeshGeometrySnapshot {
        return this.vertexCaches.map(cache => ({
            primitiveType: cache.primitiveType,
            positions: cache.positions.slice(),
            normals: cache.normals?.slice() ?? null,
            uvs: cache.uvs?.slice() ?? null,
            colors: cache.colors?.slice() ?? null,
            indices: cache.indices ? [...cache.indices] : null,
            selected: cache.selected.slice()
        }));
    }

    setGeometrySnapshot(snapshot: MeshGeometrySnapshot) {
        snapshot.forEach((item, idx) => {
            const cache = this.vertexCaches[idx];
            if (!cache) {
                return;
            }

            cache.positions = item.positions.slice();
            cache.primitiveType = item.primitiveType;
            cache.normals = item.normals?.slice() ?? null;
            cache.uvs = item.uvs?.slice() ?? null;
            cache.colors = item.colors?.slice() ?? null;
            cache.indices = item.indices ? [...item.indices] : null;
            cache.selected = item.selected.slice();
            this.syncMesh(cache);
        });

        this.updateLocalBound();
        this.updateWorldBound();
        this.changedCounter++;
        this.scene.forceRender = true;
        this.scene.events.fire('model.geometry', this);
        this.scene.events.fire('model.vertexSelection', this);
        this.updateVertexSelectionPreview();
    }

    transformSelectedVerticesFromSnapshot(snapshot: MeshGeometrySnapshot, transformWorld: Mat4) {
        snapshot.forEach((item, idx) => {
            const cache = this.vertexCaches[idx];
            if (!cache) {
                return;
            }

            cache.positions = item.positions.slice();
            cache.primitiveType = item.primitiveType;
            cache.normals = item.normals?.slice() ?? null;
            cache.uvs = item.uvs?.slice() ?? null;
            cache.colors = item.colors?.slice() ?? null;
            cache.indices = item.indices ? [...item.indices] : null;
            cache.selected = item.selected.slice();

            const world = cache.meshInstance.node.getWorldTransform();
            const local = worldToLocal.copy(world).invert();

            for (let i = 0; i < cache.selected.length; i++) {
                if (!cache.selected[i]) {
                    continue;
                }

                const offset = i * 3;
                vertexLocal.set(cache.positions[offset], cache.positions[offset + 1], cache.positions[offset + 2]);
                world.transformPoint(vertexLocal, vertexWorld);
                transformWorld.transformPoint(vertexWorld, vertexTransformed);
                local.transformPoint(vertexTransformed, vertexLocal);
                cache.positions[offset] = vertexLocal.x;
                cache.positions[offset + 1] = vertexLocal.y;
                cache.positions[offset + 2] = vertexLocal.z;

                if (cache.normals) {
                    normalLocal.set(cache.normals[offset], cache.normals[offset + 1], cache.normals[offset + 2]);
                    world.transformVector(normalLocal, normalWorld);
                    transformWorld.transformVector(normalWorld, normalTransformed);
                    local.transformVector(normalTransformed, normalLocal).normalize();
                    cache.normals[offset] = normalLocal.x;
                    cache.normals[offset + 1] = normalLocal.y;
                    cache.normals[offset + 2] = normalLocal.z;
                }
            }

            this.syncMesh(cache);
        });

        this.updateLocalBound();
        this.updateWorldBound();
        this.changedCounter++;
        this.scene.forceRender = true;
        this.scene.events.fire('model.geometry', this);
    }

    deleteSelectedVerticesFromSnapshot(snapshot = this.getGeometrySnapshot()) {
        const before = snapshot;
        let deleted = false;

        before.forEach((item, idx) => {
            const cache = this.vertexCaches[idx];
            if (!cache) {
                return;
            }

            const oldCount = item.positions.length / 3;
            const alive = collectAlivePrimitiveIndices(item, oldCount);
            const keep = Array.from(new Set(alive.indices));
            const remap = new Int32Array(oldCount).fill(-1);
            keep.forEach((oldIndex, newIndex) => {
                remap[oldIndex] = newIndex;
            });

            for (let i = 0; i < item.selected.length; i++) {
                if (item.selected[i]) {
                    deleted = true;
                }
            }

            const keepArray = Uint32Array.from(keep);
            cache.positions = copyVertexStream(item.positions, keepArray, 3) ?? new Float32Array();
            cache.normals = copyVertexStream(item.normals, keepArray, 3);
            cache.uvs = copyVertexStream(item.uvs, keepArray, 2);
            cache.colors = copyVertexStream(item.colors, keepArray, 4);
            cache.selected = new Uint8Array(keep.length);
            cache.primitiveType = alive.primitiveType;

            if (alive.primitiveType === PRIMITIVE_POINTS) {
                cache.indices = null;
            } else {
                cache.indices = alive.indices.map(index => remap[index]).filter(index => index >= 0);
            }

            this.syncMesh(cache);
        });

        this.updateLocalBound();
        this.updateWorldBound();
        this.changedCounter++;
        this.scene.forceRender = true;
        this.scene.events.fire('model.geometry', this);
        this.scene.events.fire('model.vertexSelection', this);
        this.updateVertexSelectionPreview();

        return {
            before,
            after: this.getGeometrySnapshot(),
            deleted
        };
    }

    get selectedVertexWorldCenter() {
        const center = new Vec3();
        let count = 0;
        this.forEachVertex((cache, vertexIndex) => {
            if (cache.selected[vertexIndex]) {
                this.getVertexWorldPosition(cache, vertexIndex, vertexWorld);
                center.add(vertexWorld);
                count++;
            }
        });
        return count > 0 ? center.mulScalar(1 / count) : null;
    }

    get selectedVertexWorldBound() {
        let count = 0;
        selectedVertexMin.set(Infinity, Infinity, Infinity);
        selectedVertexMax.set(-Infinity, -Infinity, -Infinity);

        this.forEachVertex((cache, vertexIndex) => {
            if (cache.selected[vertexIndex]) {
                this.getVertexWorldPosition(cache, vertexIndex, vertexWorld);
                selectedVertexMin.min(vertexWorld);
                selectedVertexMax.max(vertexWorld);
                count++;
            }
        });

        if (count === 0) {
            return null;
        }

        this.selectedVertexWorldBoundStorage.setMinMax(selectedVertexMin, selectedVertexMax);
        return this.selectedVertexWorldBoundStorage;
    }

    private buildProjectedVertexList(options: VertexHitOptions) {
        const { width, height } = this.scene.targetSize;
        const vertices: { x: number; y: number; depth: number; globalIndex: number }[] = [];
        const projectedCaches: { cache: MeshVertexCache; vertices: ({ x: number; y: number; depth: number; globalIndex: number } | null)[] }[] = [];
        const closestDepth = new Map<string, number>();
        const cellSize = 6;

        viewProj.copy(this.scene.camera.camera.camera._viewProjMat);

        let globalIndex = 0;
        this.vertexCaches.forEach((cache) => {
            const cacheVertices: ({ x: number; y: number; depth: number; globalIndex: number } | null)[] = [];
            for (let vertexIndex = 0; vertexIndex < cache.selected.length; vertexIndex++) {
                this.getVertexWorldPosition(cache, vertexIndex, vertexWorld);
                vertexClip.set(vertexWorld.x, vertexWorld.y, vertexWorld.z, 1);
                viewProj.transformVec4(vertexClip, vertexClip);
                if (vertexClip.w <= 0) {
                    cacheVertices.push(null);
                    globalIndex++;
                    continue;
                }

                const nx = vertexClip.x / vertexClip.w;
                const ny = vertexClip.y / vertexClip.w;
                const nz = vertexClip.z / vertexClip.w;
                if (nx < -1 || nx > 1 || ny < -1 || ny > 1 || nz < -1 || nz > 1) {
                    cacheVertices.push(null);
                    globalIndex++;
                    continue;
                }

                const vertex = {
                    x: (nx * 0.5 + 0.5) * width,
                    y: (-ny * 0.5 + 0.5) * height,
                    depth: nz,
                    globalIndex
                };
                cacheVertices.push(vertex);
                vertices.push(vertex);
                globalIndex++;
            }
            projectedCaches.push({ cache, vertices: cacheVertices });
        });

        if (options.through) {
            return vertices;
        }

        const setClosestDepth = (cellX: number, cellY: number, depth: number) => {
            const key = `${cellX},${cellY}`;
            const existing = closestDepth.get(key);
            if (existing === undefined || depth < existing) {
                closestDepth.set(key, depth);
            }
        };

        const setVertexDepth = (vertex: { x: number; y: number; depth: number }) => {
            setClosestDepth(Math.floor(vertex.x / cellSize), Math.floor(vertex.y / cellSize), vertex.depth);
        };

        const addTriangleDepth = (
            a: { x: number; y: number; depth: number } | null,
            b: { x: number; y: number; depth: number } | null,
            c: { x: number; y: number; depth: number } | null
        ) => {
            if (!a || !b || !c) {
                return;
            }

            setVertexDepth(a);
            setVertexDepth(b);
            setVertexDepth(c);

            const minCellX = Math.floor(Math.max(0, Math.min(a.x, b.x, c.x)) / cellSize);
            const maxCellX = Math.floor(Math.min(width - 1, Math.max(a.x, b.x, c.x)) / cellSize);
            const minCellY = Math.floor(Math.max(0, Math.min(a.y, b.y, c.y)) / cellSize);
            const maxCellY = Math.floor(Math.min(height - 1, Math.max(a.y, b.y, c.y)) / cellSize);
            const denom = ((b.y - c.y) * (a.x - c.x)) + ((c.x - b.x) * (a.y - c.y));
            if (Math.abs(denom) < 1e-6) {
                return;
            }

            for (let cellY = minCellY; cellY <= maxCellY; cellY++) {
                for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
                    const x = cellX * cellSize + cellSize * 0.5;
                    const y = cellY * cellSize + cellSize * 0.5;
                    const wa = (((b.y - c.y) * (x - c.x)) + ((c.x - b.x) * (y - c.y))) / denom;
                    const wb = (((c.y - a.y) * (x - c.x)) + ((a.x - c.x) * (y - c.y))) / denom;
                    const wc = 1 - wa - wb;
                    if (wa >= -0.02 && wb >= -0.02 && wc >= -0.02) {
                        setClosestDepth(cellX, cellY, wa * a.depth + wb * b.depth + wc * c.depth);
                    }
                }
            }
        };

        projectedCaches.forEach(({ cache, vertices }) => {
            if (cache.primitiveType === PRIMITIVE_TRIANGLES) {
                if (cache.indices) {
                    for (let i = 0; i + 2 < cache.indices.length; i += 3) {
                        addTriangleDepth(vertices[cache.indices[i]], vertices[cache.indices[i + 1]], vertices[cache.indices[i + 2]]);
                    }
                } else {
                    for (let i = 0; i + 2 < vertices.length; i += 3) {
                        addTriangleDepth(vertices[i], vertices[i + 1], vertices[i + 2]);
                    }
                }
            } else {
                vertices.forEach((vertex) => {
                    if (vertex) {
                        setVertexDepth(vertex);
                    }
                });
            }
        });

        return vertices.filter((vertex) => {
            const key = `${Math.floor(vertex.x / cellSize)},${Math.floor(vertex.y / cellSize)}`;
            return vertex.depth <= (closestDepth.get(key) ?? vertex.depth) + 0.015;
        });
    }

    hitTestRect(rect: { start: { x: number; y: number }; end: { x: number; y: number } }, options: VertexHitOptions) {
        const { width, height } = this.scene.targetSize;
        const x1 = Math.min(rect.start.x, rect.end.x) * width;
        const y1 = Math.min(rect.start.y, rect.end.y) * height;
        const x2 = Math.max(rect.start.x, rect.end.x) * width;
        const y2 = Math.max(rect.start.y, rect.end.y) * height;
        const hitMask = new Uint8Array(this.vertexCount);

        this.buildProjectedVertexList(options).forEach((vertex) => {
            if (vertex.x >= x1 && vertex.x <= x2 && vertex.y >= y1 && vertex.y <= y2) {
                hitMask[vertex.globalIndex] = 255;
            }
        });

        return hitMask;
    }

    hitTestMask(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, options: VertexHitOptions) {
        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        const { width, height } = this.scene.targetSize;
        const hitMask = new Uint8Array(this.vertexCount);

        this.buildProjectedVertexList(options).forEach((vertex) => {
            const x = Math.floor(vertex.x / width * canvas.width);
            const y = Math.floor(vertex.y / height * canvas.height);
            if (x >= 0 && x < canvas.width && y >= 0 && y < canvas.height && image.data[(y * canvas.width + x) * 4 + 3] > 0) {
                hitMask[vertex.globalIndex] = 255;
            }
        });

        return hitMask;
    }

    hitTestPoint(point: { x: number; y: number }, options: VertexHitOptions, radius = 10) {
        const { width, height } = this.scene.targetSize;
        const px = point.x * width;
        const py = point.y * height;
        const hitMask = new Uint8Array(this.vertexCount);
        let bestIndex = -1;
        let bestDistanceSq = radius * radius;

        this.buildProjectedVertexList(options).forEach((vertex) => {
            const dx = vertex.x - px;
            const dy = vertex.y - py;
            const distanceSq = dx * dx + dy * dy;
            if (distanceSq <= bestDistanceSq) {
                bestDistanceSq = distanceSq;
                bestIndex = vertex.globalIndex;
            }
        });

        if (bestIndex >= 0) {
            hitMask[bestIndex] = 255;
        }
        return hitMask;
    }

    getVertexOverlayData(includeUnselected = true, maxVertices = 120000) {
        const positions: number[] = [];
        const colors: number[] = [];
        const total = this.vertexCount;
        const stride = Math.max(1, Math.ceil(total / maxVertices));
        let selectedCount = 0;

        this.forEachVertex((cache, vertexIndex, globalIndex) => {
            const selected = !!cache.selected[vertexIndex];
            if (!selected && (!includeUnselected || globalIndex % stride !== 0)) {
                return;
            }

            this.getVertexWorldPosition(cache, vertexIndex, vertexWorld);
            positions.push(vertexWorld.x, vertexWorld.y, vertexWorld.z);
            if (selected) {
                selectedCount++;
                colors.push(1, 1, 1, 1);
            } else {
                colors.push(1, 1, 1, 0.14);
            }
        });

        return { positions, colors, selectedCount };
    }

    getSelectedFaceOverlayData(maxTriangles = 100000) {
        const trianglePositions: number[] = [];
        const triangleColors: number[] = [];
        const edgePositions: number[] = [];
        const edgeColors: number[] = [];
        let triangleCount = 0;

        const pushVertex = (cache: MeshVertexCache, vertexIndex: number, target: number[]) => {
            this.getVertexWorldPosition(cache, vertexIndex, vertexWorld);
            target.push(vertexWorld.x, vertexWorld.y, vertexWorld.z);
        };

        const pushTriangle = (cache: MeshVertexCache, a: number, b: number, c: number) => {
            if (triangleCount >= maxTriangles || (!cache.selected[a] && !cache.selected[b] && !cache.selected[c])) {
                return;
            }

            const allSelected = !!(cache.selected[a] && cache.selected[b] && cache.selected[c]);
            const alpha = allSelected ? 0.95 : 0.76;
            pushVertex(cache, a, trianglePositions);
            pushVertex(cache, b, trianglePositions);
            pushVertex(cache, c, trianglePositions);
            for (let i = 0; i < 3; i++) {
                triangleColors.push(1, 1, 1, alpha);
            }

            [[a, b], [b, c], [c, a]].forEach(([start, end]) => {
                pushVertex(cache, start, edgePositions);
                pushVertex(cache, end, edgePositions);
                edgeColors.push(1, 1, 1, 1, 1, 1, 1, 1);
            });

            triangleCount++;
        };

        const pushLine = (cache: MeshVertexCache, a: number, b: number) => {
            if (!cache.selected[a] && !cache.selected[b]) {
                return;
            }
            pushVertex(cache, a, edgePositions);
            pushVertex(cache, b, edgePositions);
            edgeColors.push(1, 1, 1, 1, 1, 1, 1, 1);
        };

        this.vertexCaches.forEach((cache) => {
            if (cache.primitiveType === PRIMITIVE_TRIANGLES) {
                if (cache.indices) {
                    for (let i = 0; i + 2 < cache.indices.length; i += 3) {
                        pushTriangle(cache, cache.indices[i], cache.indices[i + 1], cache.indices[i + 2]);
                    }
                } else {
                    for (let i = 0; i + 2 < cache.selected.length; i += 3) {
                        pushTriangle(cache, i, i + 1, i + 2);
                    }
                }
            } else if (cache.primitiveType === PRIMITIVE_LINES) {
                const indices = cache.indices;
                if (indices) {
                    for (let i = 0; i + 1 < indices.length; i += 2) {
                        pushLine(cache, indices[i], indices[i + 1]);
                    }
                } else {
                    for (let i = 0; i + 1 < cache.selected.length; i += 2) {
                        pushLine(cache, i, i + 1);
                    }
                }
            } else if (cache.primitiveType === PRIMITIVE_LINESTRIP || cache.primitiveType === PRIMITIVE_LINELOOP) {
                const count = cache.selected.length;
                const max = cache.primitiveType === PRIMITIVE_LINELOOP ? count : count - 1;
                for (let i = 0; i < max; i++) {
                    pushLine(cache, i, (i + 1) % count);
                }
            }
        });

        return {
            trianglePositions,
            triangleColors,
            edgePositions,
            edgeColors,
            triangleCount
        };
    }

    private updateLocalBound() {
        const instances = this.meshInstances;
        if (!instances.length) {
            this.localBoundStorage.center.set(0, 0, 0);
            this.localBoundStorage.halfExtents.set(0, 0, 0);
            return;
        }

        this.updateWorldBoundFromInstances(instances);
        worldToLocal.copy(this.entity.getWorldTransform()).invert();
        this.localBoundStorage.setFromTransformedAabb(this.worldBoundStorage, worldToLocal);
    }

    private updateWorldBoundFromInstances(instances = this.meshInstances) {
        if (!instances.length) {
            this.worldBoundStorage.center.set(0, 0, 0);
            this.worldBoundStorage.halfExtents.set(0, 0, 0);
            return;
        }

        this.worldBoundStorage.copy(instances[0].aabb);
        for (let i = 1; i < instances.length; i++) {
            this.worldBoundStorage.add(instances[i].aabb);
        }
    }

    private updateWorldBound() {
        this.updateWorldBoundFromInstances();
        this.scene.boundDirty = true;
    }

    intersectsRay(ray: Ray, point?: Vec3) {
        this.updateWorldBound();
        return this.worldBoundStorage.intersectsRay(ray, point);
    }

    focalPoint() {
        return this.worldBound.center;
    }

    getPivot(_mode: 'center' | 'boundCenter', selection: boolean, result: Transform) {
        const { entity } = this;
        const selectedCenter = selection ? this.selectedVertexWorldCenter : null;
        if (selectedCenter) {
            result.position.copy(selectedCenter);
        } else {
            result.position.copy(this.worldBound.center);
        }
        result.rotation.copy(entity.getLocalRotation());
        result.scale.copy(entity.getLocalScale());
    }

    get materialState(): ModelElementMaterialState {
        const material = this.standardMaterials[0] ?? this.material;
        const meshInstance = this.meshInstances[0] ?? this.meshInstance;
        if (!material) {
            return defaultMaterialState();
        }
        const previewState = this.vertexSelectionPreview.get(material);

        return {
            diffuse: material.diffuse.clone(),
            opacity: previewState?.opacity ?? material.opacity,
            metalness: material.metalness,
            gloss: material.gloss,
            emissive: material.emissive.clone(),
            emissiveIntensity: material.emissiveIntensity,
            useLighting: material.useLighting,
            useVertexColors: material.diffuseVertexColor,
            cull: material.cull,
            renderStyle: meshInstance?.renderStyle ?? RENDERSTYLE_SOLID,
            hasDiffuseMap: !!material.diffuseMap,
            hasNormalMap: !!material.normalMap
        };
    }

    get viewportMode() {
        return this._viewportMode;
    }

    applyViewportMode(mode: MeshViewportMode, notify = true) {
        this._viewportMode = mode;

        const useViewportMaterial = mode === 'solid' || mode === 'wireframe';
        const renderStyle = mode === 'wireframe' ? RENDERSTYLE_WIREFRAME : RENDERSTYLE_SOLID;

        this.meshInstances.forEach((meshInstance) => {
            const sourceMaterial = this.sourceMaterials.get(meshInstance);
            if (useViewportMaterial) {
                meshInstance.material = this.getViewportMaterial(mode);
            } else if (sourceMaterial) {
                meshInstance.material = sourceMaterial;
            }
            meshInstance.renderStyle = renderStyle;
        });

        if (mode === 'material' || mode === 'rendered') {
            this.standardMaterials.forEach((material) => {
                if (this.hasVertexColors && !material.diffuseMap) {
                    applyVertexColorMaterial(material);
                }
                material.useLighting = true;
                material.update();
            });
        }

        this.scene.forceRender = true;
        if (notify) {
            this.changedCounter++;
            this.scene.events.fire('model.material', this);
        }
    }

    private async textureToPngBlob(texture: Texture | null, maxSize?: number) {
        if (!texture) {
            return null;
        }

        const source = texture.getSource?.() as HTMLImageElement | HTMLCanvasElement | null;
        if (!source) {
            return null;
        }

        if (source instanceof HTMLImageElement && !source.complete) {
            await source.decode();
        }

        const width = (source instanceof HTMLImageElement ? source.naturalWidth : (source as any).width) || texture.width;
        const height = (source instanceof HTMLImageElement ? source.naturalHeight : (source as any).height) || texture.height;
        if (!width || !height) {
            return null;
        }

        const scale = maxSize ? Math.min(1, maxSize / Math.max(width, height)) : 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));

        const context = canvas.getContext('2d');
        if (!context) {
            return null;
        }

        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(source, 0, 0, canvas.width, canvas.height);

        return await new Promise<Blob | null>((resolve) => {
            canvas.toBlob(resolve, 'image/png');
        });
    }

    getTextureInfo(slot: MeshTextureSlot): MeshTextureInfo {
        const texture = this.firstTexture(slot);
        const initialTexture = this.firstInitialTexture(slot);
        return {
            slot,
            name: this.textureDisplayName(texture, `${slot}-texture`),
            path: this.textureDisplayPath(texture, `${slot}-texture`),
            width: texture?.width ?? 0,
            height: texture?.height ?? 0,
            hasTexture: !!texture,
            hasInitialTexture: !!initialTexture
        };
    }

    async createTexturePreviewUrl(slot: MeshTextureSlot, maxSize = 192) {
        const blob = await this.textureToPngBlob(this.firstTexture(slot), maxSize);
        return blob ? URL.createObjectURL(blob) : null;
    }

    async createTexturePng(slot: MeshTextureSlot) {
        const texture = this.firstTexture(slot);
        const blob = await this.textureToPngBlob(texture);
        if (!blob) {
            return null;
        }

        return {
            blob,
            filename: `${this.textureDisplayName(texture, `${slot}-texture.png`).replace(/\.[^.\\/]+$/, '')}.png`
        };
    }

    applyMaterialState(state: Partial<ModelElementMaterialState>) {
        const previewWasActive = this.vertexSelectionPreview.size > 0;
        if (previewWasActive) {
            this.clearVertexSelectionPreview();
        }

        const materials = this.standardMaterials;
        const instances = this.meshInstances;

        materials.forEach((material) => {
            if (state.diffuse) material.diffuse = state.diffuse;
            if (state.opacity !== undefined) {
                material.opacity = state.opacity;
                material.blendType = state.opacity < 1 ? BLEND_NORMAL : BLEND_NONE;
                material.depthWrite = state.opacity >= 1;
            }
            if (state.metalness !== undefined) material.metalness = state.metalness;
            if (state.gloss !== undefined) material.gloss = state.gloss;
            if (state.emissive) material.emissive = state.emissive;
            if (state.emissiveIntensity !== undefined) material.emissiveIntensity = state.emissiveIntensity;
            if (state.useLighting !== undefined) material.useLighting = state.useLighting;
            if (state.useVertexColors !== undefined) {
                const enabled = state.useVertexColors && this.hasVertexColors;
                material.diffuseVertexColor = enabled;
                material.diffuseVertexColorChannel = enabled ? 'rgb' : material.diffuseVertexColorChannel;
                material.emissiveVertexColor = enabled;
                material.emissiveVertexColorChannel = enabled ? 'rgb' : material.emissiveVertexColorChannel;
                if (enabled && !material.diffuseMap) {
                    applyVertexColorMaterial(material);
                }
            }
            if (state.cull !== undefined) material.cull = state.cull;
            material.update();
        });

        if (state.renderStyle !== undefined) {
            instances.forEach((meshInstance) => {
                meshInstance.renderStyle = state.renderStyle;
            });
        }

        if (previewWasActive) {
            this.updateVertexSelectionPreview();
        }

        this.changedCounter++;
        this.scene.forceRender = true;
        this.scene.events.fire('model.material', this);
    }

    private clearVertexSelectionPreview() {
        this.vertexSelectionPreview.forEach((state, material) => {
            material.opacity = state.opacity;
            material.blendType = state.blendType;
            material.depthWrite = state.depthWrite;
            material.update();
        });
        this.vertexSelectionPreview.clear();
    }

    private updateVertexSelectionPreview() {
        this.clearVertexSelectionPreview();
    }

    setVertexSelectionPreviewVisible(visible: boolean) {
        if (visible) {
            this.updateVertexSelectionPreview();
        } else {
            this.clearVertexSelectionPreview();
        }
    }

    async setTexture(slot: 'diffuse' | 'normal', file: File) {
        const url = URL.createObjectURL(file);
        try {
            const asset = await new Promise<any>((resolve, reject) => {
                this.scene.app.assets.loadFromUrlAndFilename(url, file.name, 'texture', (error, asset) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(asset);
                    }
                });
            });
            const texture = asset.resource as Texture;
            texture.name = (file as any).webkitRelativePath || file.name;
            this.standardMaterials.forEach((material) => {
                this.setTextureFor(material, slot, texture);
            });
            this.applyViewportMode(this._viewportMode, false);
            this.changedCounter++;
            this.scene.forceRender = true;
            this.scene.events.fire('model.material', this);
        } finally {
            URL.revokeObjectURL(url);
        }
    }

    clearTexture(slot: 'diffuse' | 'normal') {
        this.standardMaterials.forEach((material) => {
            this.setTextureFor(material, slot, null);
        });
        if (slot === 'diffuse') {
            this.applyVertexColorFallback();
        }
        this.applyViewportMode(this._viewportMode, false);
        this.changedCounter++;
        this.scene.forceRender = true;
        this.scene.events.fire('model.material', this);
    }

    resetTexture(slot: 'diffuse' | 'normal') {
        this.standardMaterials.forEach((material) => {
            const initial = this.initialTextureState.get(material)?.[slot] ?? null;
            this.setTextureFor(material, slot, initial);
        });
        if (slot === 'diffuse') {
            this.applyVertexColorFallback();
        }
        this.applyViewportMode(this._viewportMode, false);
        this.changedCounter++;
        this.scene.forceRender = true;
        this.scene.events.fire('model.material', this);
    }

    get localBound() {
        return this.localBoundStorage;
    }

    get worldBound() {
        return this.worldBoundStorage;
    }

    set name(newName: string) {
        if (newName !== this.name) {
            this._name = newName;
            this.scene?.events.fire('model.name', this);
        }
    }

    get name() {
        return this._name;
    }

    set visible(value: boolean) {
        if (value !== this.visible) {
            this._visible = value;
            this.scene?.events.fire('model.visibility', this);
        }
    }

    get visible() {
        return this._visible;
    }

    get pointCloud() {
        return this.data?.primitiveType === PRIMITIVE_POINTS;
    }
}

export { ModelElement, ModelElementMaterialState, MeshViewportMode, MeshGeometrySnapshot, MeshDataProperty, MeshHistogramData };
