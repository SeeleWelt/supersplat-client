import { PRIMITIVE_TRIANGLES } from 'playcanvas';

import { ParsedMeshData } from './mesh-data';

type ObjVertexRef = {
    position: number;
    uv?: number;
    normal?: number;
};

const parseIndex = (value: string, count: number) => {
    if (!value) {
        return undefined;
    }

    const index = parseInt(value, 10);
    if (!Number.isFinite(index) || index === 0) {
        return undefined;
    }

    return index > 0 ? index - 1 : count + index;
};

const parseVertexRef = (token: string, positionCount: number, uvCount: number, normalCount: number): ObjVertexRef => {
    const [positionToken, uvToken, normalToken] = token.split('/');
    const position = parseIndex(positionToken, positionCount);
    if (position === undefined) {
        throw new Error(`Invalid OBJ face vertex '${token}'`);
    }

    return {
        position,
        uv: parseIndex(uvToken, uvCount),
        normal: parseIndex(normalToken, normalCount)
    };
};

const parseObjModel = (text: string): ParsedMeshData => {
    const sourcePositions: number[][] = [];
    const sourceColors: number[][] = [];
    const sourceUvs: number[][] = [];
    const sourceNormals: number[][] = [];

    const positions: number[] = [];
    const colors: number[] = [];
    const uvs: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    const vertexMap = new Map<string, number>();

    let hasColors = false;
    let hasUvs = false;
    let hasNormals = false;

    const appendVertex = (ref: ObjVertexRef) => {
        const key = `${ref.position}/${ref.uv ?? ''}/${ref.normal ?? ''}`;
        let index = vertexMap.get(key);
        if (index !== undefined) {
            return index;
        }

        const position = sourcePositions[ref.position];
        if (!position) {
            throw new Error(`OBJ face references missing vertex ${ref.position + 1}`);
        }

        index = positions.length / 3;
        vertexMap.set(key, index);
        positions.push(position[0], position[1], position[2]);

        const color = sourceColors[ref.position];
        if (color) {
            hasColors = true;
            colors.push(color[0], color[1], color[2], color[3] ?? 1);
        } else {
            colors.push(1, 1, 1, 1);
        }

        const uv = ref.uv !== undefined ? sourceUvs[ref.uv] : undefined;
        if (uv) {
            hasUvs = true;
            uvs.push(uv[0], uv[1]);
        } else {
            uvs.push(0, 0);
        }

        const normal = ref.normal !== undefined ? sourceNormals[ref.normal] : undefined;
        if (normal) {
            hasNormals = true;
            normals.push(normal[0], normal[1], normal[2]);
        } else {
            normals.push(0, 0, 0);
        }

        return index;
    };

    text.split(/\r?\n/).forEach((rawLine) => {
        const line = rawLine.replace(/#.*/, '').trim();
        if (!line) {
            return;
        }

        const parts = line.split(/\s+/);
        switch (parts[0]) {
            case 'v': {
                if (parts.length < 4) {
                    throw new Error('OBJ vertex must contain x, y and z');
                }
                sourcePositions.push(parts.slice(1, 4).map(Number));
                if (parts.length >= 7) {
                    hasColors = true;
                    sourceColors.push(parts.slice(4, 8).map(Number));
                } else {
                    sourceColors.push(null);
                }
                break;
            }
            case 'vt':
                if (parts.length >= 3) {
                    sourceUvs.push([Number(parts[1]), Number(parts[2])]);
                }
                break;
            case 'vn':
                if (parts.length >= 4) {
                    sourceNormals.push(parts.slice(1, 4).map(Number));
                }
                break;
            case 'f': {
                if (parts.length < 4) {
                    break;
                }

                const refs = parts.slice(1).map(token => parseVertexRef(
                    token,
                    sourcePositions.length,
                    sourceUvs.length,
                    sourceNormals.length
                ));
                for (let i = 1; i < refs.length - 1; i++) {
                    indices.push(appendVertex(refs[0]), appendVertex(refs[i]), appendVertex(refs[i + 1]));
                }
                break;
            }
        }
    });

    if (!positions.length) {
        throw new Error('OBJ file does not contain renderable faces');
    }

    return {
        positions,
        normals: hasNormals ? normals : undefined,
        colors: hasColors ? colors : undefined,
        uvs: hasUvs ? uvs : undefined,
        indices,
        primitiveType: PRIMITIVE_TRIANGLES
    };
};

export { parseObjModel };
