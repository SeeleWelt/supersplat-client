const vertexShader = /* glsl*/ `
    attribute vec2 vertex_position;
    void main(void) {
        gl_Position = vec4(vertex_position, 0.0, 1.0);
    }
`;

const fragmentShader = /* glsl*/ `
    uniform sampler2D srcTexture;
    uniform vec4 bgClr;

    void main(void) {
        ivec2 texel = ivec2(gl_FragCoord.xy);
        vec4 src = texelFetch(srcTexture, texel, 0);
        gl_FragColor = vec4(src.rgb + bgClr.rgb * (1.0 - src.a), 1.0);
    }
`;

export { vertexShader, fragmentShader };
