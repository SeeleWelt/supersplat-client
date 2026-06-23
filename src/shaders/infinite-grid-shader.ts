const vertexShader = /* glsl*/ `
    uniform vec3 near_origin;
    uniform vec3 near_x;
    uniform vec3 near_y;

    uniform vec3 far_origin;
    uniform vec3 far_x;
    uniform vec3 far_y;

    attribute vec2 vertex_position;

    varying vec3 worldFar;
    varying vec3 worldNear;

    void main(void) {
        gl_Position = vec4(vertex_position, 0.0, 1.0);

        vec2 p = vertex_position * 0.5 + 0.5;
        worldNear = near_origin + near_x * p.x + near_y * p.y;
        worldFar = far_origin + far_x * p.x + far_y * p.y;
    }
`;

const fragmentShader = /* glsl*/ `
    uniform vec3 view_position;
    uniform mat4 matrix_viewProjection;
    uniform sampler2D blueNoiseTex32;

    uniform int plane;  // 0: x (yz), 1: y (xz), 2: z (xy)

    vec4 planes[3] = vec4[3](
        vec4(1.0, 0.0, 0.0, 0.0),
        vec4(0.0, 1.0, 0.0, 0.0),
        vec4(0.0, 0.0, 1.0, 0.0)
    );

    vec3 axisColors[3] = vec3[3](
        vec3(0.86, 0.42, 0.34),
        vec3(0.48, 0.70, 0.45),
        vec3(0.42, 0.58, 0.86)
    );

    const vec3 originColor = vec3(0.90, 0.76, 0.48);
    const vec3 majorColor = vec3(0.55, 0.45, 0.30);
    const vec3 minorColor = vec3(0.34, 0.31, 0.28);
    const vec3 microColor = vec3(0.25, 0.23, 0.22);

    int axis0[3] = int[3](1, 0, 0);
    int axis1[3] = int[3](2, 2, 1);

    varying vec3 worldNear;
    varying vec3 worldFar;

    bool intersectPlane(inout float t, vec3 pos, vec3 dir, vec4 plane) {
        float d = dot(dir, plane.xyz);
        if (abs(d) < 1e-06) {
            return false;
        }

        float n = -(dot(pos, plane.xyz) + plane.w) / d;
        if (n < 0.0) {
            return false;
        }

        t = n;

        return true;
    }

    // https://bgolus.medium.com/the-best-darn-grid-shader-yet-727f9278b9d8#1e7c
    float pristineGrid(in vec2 uv, in vec2 ddx, in vec2 ddy, vec2 lineWidth) {
        vec2 uvDeriv = vec2(length(vec2(ddx.x, ddy.x)), length(vec2(ddx.y, ddy.y)));
        bvec2 invertLine = bvec2(lineWidth.x > 0.5, lineWidth.y > 0.5);
        vec2 targetWidth = vec2(
            invertLine.x ? 1.0 - lineWidth.x : lineWidth.x,
            invertLine.y ? 1.0 - lineWidth.y : lineWidth.y
        );
        vec2 drawWidth = clamp(targetWidth, uvDeriv, vec2(0.5));
        vec2 lineAA = uvDeriv * 1.5;
        vec2 gridUV = abs(fract(uv) * 2.0 - 1.0);
        gridUV.x = invertLine.x ? gridUV.x : 1.0 - gridUV.x;
        gridUV.y = invertLine.y ? gridUV.y : 1.0 - gridUV.y;
        vec2 grid2 = smoothstep(drawWidth + lineAA, drawWidth - lineAA, gridUV);

        grid2 *= clamp(targetWidth / drawWidth, 0.0, 1.0);
        grid2 = mix(grid2, targetWidth, clamp(uvDeriv * 2.0 - 1.0, 0.0, 1.0));
        grid2.x = invertLine.x ? 1.0 - grid2.x : grid2.x;
        grid2.y = invertLine.y ? 1.0 - grid2.y : grid2.y;

        return mix(grid2.x, 1.0, grid2.y);
    }

    float calcDepth(vec3 p) {
        vec4 v = matrix_viewProjection * vec4(p, 1.0);
        return (v.z / v.w) * 0.5 + 0.5;
    }

    bool writeDepth(float alpha) {
        vec2 uv = fract(gl_FragCoord.xy / 32.0);
        float noise = texture2DLod(blueNoiseTex32, uv, 0.0).y;
        return alpha > noise;
    }

    void main(void) {
        vec3 p = worldNear;
        vec3 v = normalize(worldFar - worldNear);

        // intersect ray with the world xz plane
        float t;
        if (!intersectPlane(t, p, v, planes[plane])) {
            discard;
        }

        // calculate grid intersection
        vec3 worldPos = p + v * t;
        vec2 pos = plane == 0 ? worldPos.yz : (plane == 1 ? worldPos.xz : worldPos.xy);
        vec2 ddx = dFdx(pos);
        vec2 ddy = dFdy(pos);

        float epsilon = 1.0 / 255.0;

        // calculate fade
        float fade = 1.0 - smoothstep(400.0, 1000.0, length(worldPos - view_position));
        if (fade < epsilon) {
            discard;
        }

        vec2 levelPos;
        float levelSize;
        float levelAlpha;

        // 5m drafting grid with restrained axis accents
        levelPos = pos * 0.2;
        levelSize = 3.0 / 1000.0;
        levelAlpha = pristineGrid(levelPos, ddx * 0.2, ddy * 0.2, vec2(levelSize)) * fade * 0.82;
        if (levelAlpha > epsilon) {
            vec3 color;
            vec2 loc = abs(levelPos);
            if (loc.x < levelSize) {
                if (loc.y < levelSize) {
                    color = originColor;
                } else {
                    color = axisColors[axis1[plane]];
                    levelAlpha *= 1.3;
                }
            } else if (loc.y < levelSize) {
                color = axisColors[axis0[plane]];
                levelAlpha *= 1.3;
            } else {
                color = majorColor;
            }
            gl_FragColor = vec4(color, levelAlpha);
            gl_FragDepth = writeDepth(levelAlpha) ? calcDepth(worldPos) : 1.0;
            return;
        }

        // 0.5m grid
        levelPos = pos * 2.0;
        levelSize = 1.0 / 100.0;
        levelAlpha = pristineGrid(levelPos, ddx * 2.0, ddy * 2.0, vec2(levelSize)) * fade * 0.36;
        if (levelAlpha > epsilon) {
            gl_FragColor = vec4(minorColor, levelAlpha);
            gl_FragDepth = writeDepth(levelAlpha) ? calcDepth(worldPos) : 1.0;
            return;
        }

        // 0.1m grid
        levelPos = pos * 10.0;
        levelSize = 0.8 / 100.0;
        levelAlpha = pristineGrid(levelPos, ddx * 10.0, ddy * 10.0, vec2(levelSize)) * fade * 0.20;
        if (levelAlpha > epsilon) {
            gl_FragColor = vec4(microColor, levelAlpha);
            gl_FragDepth = writeDepth(levelAlpha) ? calcDepth(worldPos) : 1.0;
            return;
        }

        discard;
    }
`;

export { vertexShader, fragmentShader };
