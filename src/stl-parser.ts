import { PRIMITIVE_TRIANGLES } from 'playcanvas';

import { ParsedMeshData } from './mesh-data';

const parseAsciiStl = (text: string): ParsedMeshData => {
    const positions: number[] = [];
    const normals: number[] = [];
    let currentNormal = [0, 0, 0];

    text.split(/\r?\n/).forEach((rawLine) => {
        const line = rawLine.trim();
        const normalMatch = line.match(/^facet\s+normal\s+(\S+)\s+(\S+)\s+(\S+)/i);
        if (normalMatch) {
            currentNormal = [Number(normalMatch[1]), Number(normalMatch[2]), Number(normalMatch[3])];
            return;
        }

        const vertexMatch = line.match(/^vertex\s+(\S+)\s+(\S+)\s+(\S+)/i);
        if (vertexMatch) {
            positions.push(Number(vertexMatch[1]), Number(vertexMatch[2]), Number(vertexMatch[3]));
            normals.push(currentNormal[0], currentNormal[1], currentNormal[2]);
        }
    });

    if (!positions.length) {
        throw new Error('ASCII STL file does not contain vertices');
    }

    return {
        positions,
        normals,
        primitiveType: PRIMITIVE_TRIANGLES
    };
};

const parseBinaryStl = (bytes: Uint8Array): ParsedMeshData => {
    if (bytes.byteLength < 84) {
        throw new Error('Binary STL file is too small');
    }

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const triangleCount = view.getUint32(80, true);
    const expectedSize = 84 + triangleCount * 50;
    if (expectedSize > bytes.byteLength) {
        throw new Error('Binary STL file is truncated');
    }

    const positions: number[] = [];
    const normals: number[] = [];
    let offset = 84;

    for (let i = 0; i < triangleCount; i++) {
        const nx = view.getFloat32(offset, true);
        const ny = view.getFloat32(offset + 4, true);
        const nz = view.getFloat32(offset + 8, true);
        offset += 12;

        for (let j = 0; j < 3; j++) {
            positions.push(
                view.getFloat32(offset, true),
                view.getFloat32(offset + 4, true),
                view.getFloat32(offset + 8, true)
            );
            normals.push(nx, ny, nz);
            offset += 12;
        }

        offset += 2;
    }

    if (!positions.length) {
        throw new Error('Binary STL file does not contain triangles');
    }

    return {
        positions,
        normals,
        primitiveType: PRIMITIVE_TRIANGLES
    };
};

const looksLikeBinaryStl = (bytes: Uint8Array) => {
    if (bytes.byteLength < 84) {
        return false;
    }

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const triangleCount = view.getUint32(80, true);
    return 84 + triangleCount * 50 === bytes.byteLength;
};

const parseStlModel = (bytes: Uint8Array): ParsedMeshData => {
    if (looksLikeBinaryStl(bytes)) {
        return parseBinaryStl(bytes);
    }

    const text = new TextDecoder().decode(bytes);
    if (/^\s*solid\b/i.test(text)) {
        return parseAsciiStl(text);
    }

    return parseBinaryStl(bytes);
};

export { parseStlModel };
