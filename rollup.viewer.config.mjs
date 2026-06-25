import path from 'path';

import alias from '@rollup/plugin-alias';
import json from '@rollup/plugin-json';
import resolve from '@rollup/plugin-node-resolve';
import strip from '@rollup/plugin-strip';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import autoprefixer from 'autoprefixer';
import postcss from 'postcss';
import scss from 'rollup-plugin-scss';
import sass from 'sass';

import copyAndWatch from './copy-and-watch.mjs';

if (process.env.BUILD_TYPE === 'prod') {
    process.env.BUILD_TYPE = 'release';
}

const BUILD_TYPE = process.env.BUILD_TYPE || 'release';
const ENGINE_DIR = path.resolve(`node_modules/playcanvas/build/playcanvas${BUILD_TYPE === 'debug' ? '.dbg' : ''}/src/index.js`);
const HREF = process.env.BASE_HREF || '';
const ASSET_VERSION = process.env.ASSET_VERSION || Date.now().toString(36);

const outputHeader = () => {
    const BLUE_OUT = '\x1b[34m';
    const BOLD_OUT = '\x1b[1m';
    const REGULAR_OUT = '\x1b[22m';
    const RESET_OUT = '\x1b[0m';

    const title = [
        'Building Ningjing Viewer',
        `type ${BOLD_OUT}${BUILD_TYPE}${REGULAR_OUT}`
    ].map(l => `${BLUE_OUT}${l}`).join('\n');
    console.log(`${BLUE_OUT}${title}${RESET_OUT}\n`);
};

outputHeader();

export default {
    input: 'viewer-client/main.ts',
    output: {
        dir: 'dist-viewer',
        format: 'esm',
        entryFileNames: 'viewer.js',
        chunkFileNames: '[name]-[hash].js',
        sourcemap: true
    },
    plugins: [
        copyAndWatch({
            targets: [
                {
                    src: 'viewer-client/index.html',
                    destFilename: 'index.html',
                    transform: (contents) => {
                        return contents.toString()
                        .replace('__BASE_HREF__', HREF)
                        .replaceAll('__ASSET_VERSION__', ASSET_VERSION);
                    }
                },
                { src: 'viewer-client/assets' },
                { src: 'static/icons', dest: 'static' },
                { src: 'static/lib', dest: 'static' },
                { src: 'static/locales', dest: 'static' },
                { src: 'static/env/VertebraeHDRI_v1_512.png', dest: 'static/env' }
            ]
        }),
        alias({
            entries: {
                'playcanvas': ENGINE_DIR
            }
        }),
        typescript({
            tsconfig: './tsconfig.viewer.json'
        }),
        resolve(),
        json(),
        scss({
            sourceMap: true,
            runtime: sass,
            processor: (css) => {
                return postcss([autoprefixer])
                .process(css, { from: undefined })
                .then(result => result.css);
            },
            fileName: 'viewer.css',
            watch: 'viewer-client'
        }),
        BUILD_TYPE === 'release' &&
        strip({
            include: ['**/*.ts'],
            functions: ['Debug.exec']
        }),
        BUILD_TYPE !== 'debug' && terser()
    ],
    treeshake: 'smallest',
    cache: false
};
