import { ReadFileSystem } from '@playcanvas/splat-transform';
import { AppBase, Asset, GSplatResource, Quat } from 'playcanvas';

import { Events } from './events';
import { displayNameForFile } from './file-name';
import { loadGSplatData, validateGSplatData } from './io';
import { ModelElement } from './model-element';
import { parseObjModel } from './obj-parser';
import { parsePlyModel } from './ply-parser';
import { Splat } from './splat';
import { parseStlModel } from './stl-parser';
import { localize } from './ui/localization';

type SourceFile = {
    filename: string;
    contents?: Blob;
};

const directModelExtensions = ['.glb', '.gltf', '.obj', '.stl'];
const conversionOnlyModelExtensions = ['.fbx', '.dae', '.3ds', '.blend', '.usdz', '.usd', '.usda', '.usdc', '.abc'];
const gsplatPlyRequiredProperties = [
    'x', 'y', 'z',
    'scale_0', 'scale_1', 'scale_2',
    'rot_0', 'rot_1', 'rot_2', 'rot_3',
    'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity'
];

const readAllBytes = async (filename: string, fileSystem: ReadFileSystem) => {
    const source = await fileSystem.createSource(filename);
    try {
        const result = new Uint8Array(source.size);
        const stream = source.read();
        let offset = 0;

        while (offset < result.length) {
            const bytesRead = await stream.pull(result.subarray(offset));
            if (bytesRead <= 0) {
                break;
            }
            offset += bytesRead;
        }

        return offset === result.length ? result : result.subarray(0, offset);
    } finally {
        source.close();
    }
};

const readText = async (filename: string, fileSystem: ReadFileSystem) => {
    return new TextDecoder().decode(await readAllBytes(filename, fileSystem));
};

const endsWithAny = (filename: string, extensions: string[]) => {
    return extensions.some(ext => filename.endsWith(ext));
};

const isExternalGltfUri = (uri: string) => {
    return !!uri && !uri.startsWith('#') && !/^(?:data|blob|https?|file):/i.test(uri);
};

const normalizeUri = (uri: string) => {
    return decodeURIComponent(uri.split(/[?#]/)[0]).replace(/\\/g, '/').toLowerCase();
};

const basename = (uri: string) => {
    const normalized = normalizeUri(uri);
    return normalized.substring(normalized.lastIndexOf('/') + 1);
};

const displayNameForSource = (filename: string, sourceFiles?: SourceFile[]) => {
    return displayNameForFile(sourceFiles?.[0]?.filename ?? filename);
};

const getPlyHeader = (bytes: Uint8Array) => {
    const marker = new TextEncoder().encode('end_header');
    for (let i = 0; i <= bytes.length - marker.length; i++) {
        let match = true;
        for (let j = 0; j < marker.length; j++) {
            if (bytes[i + j] !== marker[j]) {
                match = false;
                break;
            }
        }

        if (match) {
            let end = i + marker.length;
            while (end < bytes.length && bytes[end] !== 10) {
                end++;
            }
            return new TextDecoder().decode(bytes.subarray(0, end < bytes.length ? end + 1 : end));
        }
    }

    throw new Error('Invalid PLY file: missing end_header');
};

const inspectPlyHeader = (bytes: Uint8Array) => {
    const properties = new Set<string>();
    let currentElement = '';
    let hasFaceElement = false;

    getPlyHeader(bytes).split(/\r?\n/).forEach((line) => {
        const parts = line.trim().toLowerCase().split(/\s+/);
        if (parts[0] === 'element') {
            currentElement = parts[1] ?? '';
            hasFaceElement ||= currentElement === 'face';
        } else if (parts[0] === 'property' && currentElement === 'vertex') {
            properties.add(parts[parts.length - 1]);
        }
    });

    return { hasFaceElement, properties };
};

const shouldLoadPlyAsMesh = (bytes: Uint8Array) => {
    const { hasFaceElement, properties } = inspectPlyHeader(bytes);
    const hasGaussianProperties = gsplatPlyRequiredProperties.every(property => properties.has(property));
    return hasFaceElement || !hasGaussianProperties;
};

// handles loading gsplat assets using splat-transform
class AssetLoader {
    app: AppBase;
    events: Events;

    constructor(app: AppBase, events: Events) {
        this.app = app;
        this.events = events;
    }

    async load(
        filename: string,
        fileSystem: ReadFileSystem,
        animationFrame?: boolean,
        skipReorder?: boolean,
        sourceFiles?: SourceFile[]
    ) {
        if (!animationFrame) {
            this.events.fire('startSpinner', localize('busy.loading-model'));
        }

        try {
            const lowerFilename = filename.toLowerCase();
            const displayName = displayNameForSource(filename, sourceFiles);
            if (conversionOnlyModelExtensions.some(ext => lowerFilename.endsWith(ext))) {
                throw new Error(localize('popup.browser-import-conversion-required'));
            }

            if (endsWithAny(lowerFilename, directModelExtensions)) {
                return await this.loadModel(filename, fileSystem, sourceFiles, displayName);
            }

            if (lowerFilename.endsWith('.ply') && !lowerFilename.endsWith('.compressed.ply')) {
                const bytes = await readAllBytes(filename, fileSystem);
                if (shouldLoadPlyAsMesh(bytes)) {
                    return new ModelElement(filename, parsePlyModel(bytes), displayName, sourceFiles);
                }
            }

            try {
                // Skip reordering for animation frames (speed) or when explicitly requested (already ordered)
                const { gsplatData } = await loadGSplatData(filename, fileSystem, skipReorder || animationFrame);
                validateGSplatData(gsplatData);

                const asset = new Asset(displayName, 'gsplat', { url: `local-asset-${Date.now()}`, filename: displayName });
                this.app.assets.add(asset);
                asset.resource = new GSplatResource(this.app.graphicsDevice, gsplatData);

                return new Splat(asset, new Quat());
            } catch (error) {
                if (!lowerFilename.endsWith('.ply')) {
                    throw error;
                }

                const data = parsePlyModel(await readAllBytes(filename, fileSystem));
                return new ModelElement(filename, data, displayName, sourceFiles);
            }
        } finally {
            if (!animationFrame) {
                this.events.fire('stopSpinner');
            }
        }
    }

    private async loadModel(filename: string, fileSystem: ReadFileSystem, sourceFiles?: SourceFile[], displayName = displayNameForSource(filename, sourceFiles)) {
        const lowerFilename = filename.toLowerCase();

        if (lowerFilename.endsWith('.obj')) {
            return new ModelElement(filename, parseObjModel(await readText(filename, fileSystem)), displayName, sourceFiles);
        }

        if (lowerFilename.endsWith('.stl')) {
            return new ModelElement(filename, parseStlModel(await readAllBytes(filename, fileSystem)), displayName, sourceFiles);
        }

        return await this.loadContainerModel(filename, fileSystem, sourceFiles, displayName);
    }

    private async loadContainerModel(filename: string, fileSystem: ReadFileSystem, sourceFiles?: SourceFile[], displayName = displayNameForSource(filename, sourceFiles)) {
        const createdUrls: string[] = [];
        const lowerFilename = filename.toLowerCase();
        let blob: Blob = new Blob([await readAllBytes(filename, fileSystem)]);

        if (lowerFilename.endsWith('.gltf')) {
            const gltf = JSON.parse(await readText(filename, fileSystem));
            const localFiles = new Map<string, SourceFile>();
            sourceFiles?.forEach((file) => {
                localFiles.set(normalizeUri(file.filename), file);
                localFiles.set(basename(file.filename), file);
            });

            const createObjectUrl = async (uri: string) => {
                const key = normalizeUri(uri);
                const file = localFiles.get(key) ?? localFiles.get(basename(key));
                const dependencyBlob = file?.contents ?? new Blob([await readAllBytes(uri, fileSystem)]);
                const objectUrl = URL.createObjectURL(dependencyBlob);
                createdUrls.push(objectUrl);
                return objectUrl;
            };

            for (const buffer of gltf.buffers ?? []) {
                if (isExternalGltfUri(buffer.uri)) {
                    buffer.uri = await createObjectUrl(buffer.uri);
                }
            }

            for (const image of gltf.images ?? []) {
                if (isExternalGltfUri(image.uri)) {
                    image.uri = await createObjectUrl(image.uri);
                }
            }

            blob = new Blob([JSON.stringify(gltf)], { type: 'model/gltf+json' });
        }

        const url = URL.createObjectURL(blob);
        createdUrls.push(url);

        try {
            const asset = await new Promise<Asset>((resolve, reject) => {
                this.app.assets.loadFromUrlAndFilename(url, displayName, 'container', (error, asset) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(asset);
                    }
                });
            });
            const entity = (asset.resource as any).instantiateRenderEntity({
                castShadows: false,
                receiveShadows: false
            });
            entity.name = displayName;
            return new ModelElement(filename, entity, displayName, sourceFiles);
        } finally {
            createdUrls.forEach(objectUrl => URL.revokeObjectURL(objectUrl));
        }
    }
}

export { AssetLoader };
