import { PRIMITIVE_POINTS, PRIMITIVE_TRIANGLES } from 'playcanvas';

import { ParsedMeshData } from './mesh-data';

type PlyFormat = 'ascii' | 'binary_little_endian' | 'binary_big_endian';
type PlyScalarType = 'char' | 'uchar' | 'short' | 'ushort' | 'int' | 'uint' | 'float' | 'double';

type PlyScalarProperty = {
    kind: 'scalar';
    type: PlyScalarType;
    name: string;
};

type PlyListProperty = {
    kind: 'list';
    countType: PlyScalarType;
    itemType: PlyScalarType;
    name: string;
};

type PlyProperty = PlyScalarProperty | PlyListProperty;

type PlyElement = {
    name: string;
    count: number;
    properties: PlyProperty[];
};

type ParsedPlyModel = ParsedMeshData;

const plyTypeAliases: Record<string, PlyScalarType> = {
    char: 'char',
    int8: 'char',
    uchar: 'uchar',
    uint8: 'uchar',
    short: 'short',
    int16: 'short',
    ushort: 'ushort',
    uint16: 'ushort',
    int: 'int',
    int32: 'int',
    uint: 'uint',
    uint32: 'uint',
    float: 'float',
    float32: 'float',
    double: 'double',
    float64: 'double'
};

const plyTypeSize: Record<PlyScalarType, number> = {
    char: 1,
    uchar: 1,
    short: 2,
    ushort: 2,
    int: 4,
    uint: 4,
    float: 4,
    double: 8
};

const parseType = (value: string): PlyScalarType => {
    const type = plyTypeAliases[value.toLowerCase()];
    if (!type) {
        throw new Error(`Unsupported PLY property type '${value}'`);
    }
    return type;
};

const findHeaderEnd = (bytes: Uint8Array) => {
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
            return end < bytes.length ? end + 1 : end;
        }
    }

    throw new Error('Invalid PLY file: missing end_header');
};

const parseHeader = (header: string) => {
    const lines = header.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (lines[0] !== 'ply') {
        throw new Error('Invalid PLY file: missing ply header');
    }

    let format: PlyFormat | null = null;
    const elements: PlyElement[] = [];
    let current: PlyElement | null = null;

    for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(/\s+/);
        switch (parts[0].toLowerCase()) {
            case 'format':
                if (!['ascii', 'binary_little_endian', 'binary_big_endian'].includes(parts[1].toLowerCase())) {
                    throw new Error(`Unsupported PLY format '${parts[1]}'`);
                }
                format = parts[1].toLowerCase() as PlyFormat;
                break;
            case 'element':
                current = {
                    name: parts[1].toLowerCase(),
                    count: parseInt(parts[2], 10),
                    properties: []
                };
                elements.push(current);
                break;
            case 'property':
                if (!current) {
                    throw new Error('Invalid PLY file: property without element');
                }
                if (parts[1] === 'list') {
                    current.properties.push({
                        kind: 'list',
                        countType: parseType(parts[2]),
                        itemType: parseType(parts[3]),
                        name: parts[4].toLowerCase()
                    });
                } else {
                    current.properties.push({
                        kind: 'scalar',
                        type: parseType(parts[1]),
                        name: parts[2].toLowerCase()
                    });
                }
                break;
        }
    }

    if (!format) {
        throw new Error('Invalid PLY file: missing format');
    }

    return { format, elements };
};

const normalizeColor = (value: number) => {
    return value > 1 ? value / 255 : value;
};

const getColorValue = (vertex: Record<string, number>, names: string[], fallback: number) => {
    for (const name of names) {
        if (vertex[name] !== undefined) {
            return normalizeColor(vertex[name]);
        }
    }
    return fallback;
};

const colorPropertyNames = {
    red: ['red', 'r', 'diffuse_red'],
    green: ['green', 'g', 'diffuse_green'],
    blue: ['blue', 'b', 'diffuse_blue'],
    alpha: ['alpha', 'a', 'diffuse_alpha']
};

const hasAnyProperty = (vertex: Record<string, number>, names: string[]) => {
    return names.some(name => vertex[name] !== undefined);
};

const appendVertex = (
    vertex: Record<string, number>,
    positions: number[],
    normals: number[],
    colors: number[],
    uvs: number[],
    flags: { hasNormals: boolean; hasColors: boolean; hasUvs: boolean }
) => {
    const x = vertex.x;
    const y = vertex.y;
    const z = vertex.z;
    if (x === undefined || y === undefined || z === undefined) {
        throw new Error('PLY vertex element must contain x, y and z properties');
    }

    positions.push(x, y, z);

    const nx = vertex.nx ?? vertex.normal_x;
    const ny = vertex.ny ?? vertex.normal_y;
    const nz = vertex.nz ?? vertex.normal_z;
    if (nx !== undefined && ny !== undefined && nz !== undefined) {
        flags.hasNormals = true;
        normals.push(nx, ny, nz);
    } else {
        normals.push(0, 0, 0);
    }

    const hasColor = hasAnyProperty(vertex, [
        ...colorPropertyNames.red,
        ...colorPropertyNames.green,
        ...colorPropertyNames.blue
    ]);
    if (hasColor) {
        flags.hasColors = true;
        colors.push(
            getColorValue(vertex, colorPropertyNames.red, 1),
            getColorValue(vertex, colorPropertyNames.green, 1),
            getColorValue(vertex, colorPropertyNames.blue, 1),
            getColorValue(vertex, colorPropertyNames.alpha, 1)
        );
    } else {
        colors.push(1, 1, 1, 1);
    }

    const u = vertex.u ?? vertex.s ?? vertex.texture_u ?? vertex.texcoord_u;
    const v = vertex.v ?? vertex.t ?? vertex.texture_v ?? vertex.texcoord_v;
    if (u !== undefined && v !== undefined) {
        flags.hasUvs = true;
        uvs.push(u, v);
    } else {
        uvs.push(0, 0);
    }
};

const appendFace = (values: number[], indices: number[]) => {
    for (let i = 1; i < values.length - 1; i++) {
        indices.push(values[0], values[i], values[i + 1]);
    }
};

const readBinaryScalar = (view: DataView, offset: number, type: PlyScalarType, littleEndian: boolean) => {
    switch (type) {
        case 'char': return view.getInt8(offset);
        case 'uchar': return view.getUint8(offset);
        case 'short': return view.getInt16(offset, littleEndian);
        case 'ushort': return view.getUint16(offset, littleEndian);
        case 'int': return view.getInt32(offset, littleEndian);
        case 'uint': return view.getUint32(offset, littleEndian);
        case 'float': return view.getFloat32(offset, littleEndian);
        case 'double': return view.getFloat64(offset, littleEndian);
    }
};

const parseAsciiBody = (text: string, elements: PlyElement[]): ParsedPlyModel => {
    const tokens = text.trim().length ? text.trim().split(/\s+/) : [];
    let cursor = 0;

    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const flags = { hasNormals: false, hasColors: false, hasUvs: false };

    for (const element of elements) {
        for (let i = 0; i < element.count; i++) {
            const vertex: Record<string, number> = {};
            let faceIndices: number[] | null = null;

            for (const property of element.properties) {
                if (property.kind === 'list') {
                    const count = parseInt(tokens[cursor++], 10);
                    const values = new Array<number>(count);
                    for (let j = 0; j < count; j++) {
                        values[j] = parseInt(tokens[cursor++], 10);
                    }
                    if (element.name === 'face' && !faceIndices) {
                        faceIndices = values;
                    }
                } else {
                    const value = Number(tokens[cursor++]);
                    if (element.name === 'vertex') {
                        vertex[property.name] = value;
                    }
                }
            }

            if (element.name === 'vertex') {
                appendVertex(vertex, positions, normals, colors, uvs, flags);
            } else if (element.name === 'face' && faceIndices && faceIndices.length >= 3) {
                appendFace(faceIndices, indices);
            }
        }
    }

    return {
        positions,
        normals: flags.hasNormals ? normals : undefined,
        colors: flags.hasColors ? colors : undefined,
        uvs: flags.hasUvs ? uvs : undefined,
        indices: indices.length ? indices : undefined,
        primitiveType: indices.length ? PRIMITIVE_TRIANGLES : PRIMITIVE_POINTS
    };
};

const parseBinaryBody = (bytes: Uint8Array, offset: number, format: PlyFormat, elements: PlyElement[]): ParsedPlyModel => {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const littleEndian = format === 'binary_little_endian';
    let cursor = offset;

    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const flags = { hasNormals: false, hasColors: false, hasUvs: false };

    for (const element of elements) {
        for (let i = 0; i < element.count; i++) {
            const vertex: Record<string, number> = {};
            let faceIndices: number[] | null = null;

            for (const property of element.properties) {
                if (property.kind === 'list') {
                    const count = readBinaryScalar(view, cursor, property.countType, littleEndian);
                    cursor += plyTypeSize[property.countType];
                    const values = new Array<number>(count);
                    for (let j = 0; j < count; j++) {
                        values[j] = readBinaryScalar(view, cursor, property.itemType, littleEndian);
                        cursor += plyTypeSize[property.itemType];
                    }
                    if (element.name === 'face' && !faceIndices) {
                        faceIndices = values;
                    }
                } else {
                    const value = readBinaryScalar(view, cursor, property.type, littleEndian);
                    cursor += plyTypeSize[property.type];
                    if (element.name === 'vertex') {
                        vertex[property.name] = value;
                    }
                }
            }

            if (element.name === 'vertex') {
                appendVertex(vertex, positions, normals, colors, uvs, flags);
            } else if (element.name === 'face' && faceIndices && faceIndices.length >= 3) {
                appendFace(faceIndices, indices);
            }
        }
    }

    return {
        positions,
        normals: flags.hasNormals ? normals : undefined,
        colors: flags.hasColors ? colors : undefined,
        uvs: flags.hasUvs ? uvs : undefined,
        indices: indices.length ? indices : undefined,
        primitiveType: indices.length ? PRIMITIVE_TRIANGLES : PRIMITIVE_POINTS
    };
};

const parsePlyModel = (bytes: Uint8Array): ParsedPlyModel => {
    const headerEnd = findHeaderEnd(bytes);
    const header = new TextDecoder().decode(bytes.subarray(0, headerEnd));
    const { format, elements } = parseHeader(header);

    const vertexElement = elements.find(element => element.name === 'vertex');
    if (!vertexElement || vertexElement.count <= 0) {
        throw new Error('PLY file does not contain vertices');
    }

    if (format === 'ascii') {
        return parseAsciiBody(new TextDecoder().decode(bytes.subarray(headerEnd)), elements);
    }

    return parseBinaryBody(bytes, headerEnd, format, elements);
};

export { parsePlyModel, ParsedPlyModel };
