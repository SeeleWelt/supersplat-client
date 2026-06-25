import './viewer.scss';

import { WebPCodec } from '@playcanvas/splat-transform';
import { Color, createGraphicsDevice } from 'playcanvas';

import { registerCameraPosesEvents } from '../src/camera-poses';
import { CommandQueue } from '../src/command-queue';
import { registerDocEvents } from '../src/doc';
import { Events } from '../src/events';
import { initFileHandler } from '../src/file-handler';
import { registerPlySequenceEvents } from '../src/ply-sequence';
import { registerPivotEvents } from '../src/pivot';
import { Scene } from '../src/scene';
import { getSceneConfig } from '../src/scene-config';
import { registerSelectionEvents } from '../src/selection';
import { getTauriInvoke } from '../src/tauri';
import { registerTimelineEvents } from '../src/timeline';
import { ToolManager } from '../src/tools/tool-manager';
import { localize, localizeInit } from '../src/ui/localization';
import { registerViewerEvents } from '../src/viewer-events';
import { ViewerUI } from './viewer-ui';

declare global {
    interface Window {
        scene: Scene;
        __supersplatNativeFileDrop?: (paths: string[]) => void;
        __supersplatPendingNativeFileDrops?: string[][];
    }
}

type NativeDroppedFile = {
    filename: string;
    url: string;
};

const getURLArgs = () => {
    const config = {};

    const apply = (key: string, value: string) => {
        let obj: any = config;
        key.split('.').forEach((k, i, a) => {
            if (i === a.length - 1) {
                obj[k] = value;
            } else {
                if (!obj.hasOwnProperty(k)) {
                    obj[k] = {};
                }
                obj = obj[k];
            }
        });
    };

    const params = new URLSearchParams(window.location.search.slice(1));
    params.forEach((value: string, key: string) => {
        apply(key, value);
    });

    return config;
};

const main = async () => {
    const events = new Events();
    const commandQueue = new CommandQueue();
    const url = new URL(window.location.href);

    events.function('queue', (fn: () => Promise<void> | void) => commandQueue.enqueue(fn));

    await localizeInit('zh-CN');
    WebPCodec.wasmUrl = new URL('static/lib/webp/webp.wasm', document.baseURI).toString();

    registerTimelineEvents(events);
    registerCameraPosesEvents(events);
    registerPlySequenceEvents(events);
    registerPivotEvents(events);

    const viewerUI = new ViewerUI(events);

    const graphicsDevice = await createGraphicsDevice(viewerUI.canvas, {
        deviceTypes: ['webgl2'],
        antialias: false,
        depth: false,
        stencil: false,
        xrCompatible: false,
        powerPreference: 'high-performance'
    });

    const sceneConfig = getSceneConfig([getURLArgs()]);
    const scene = new Scene(
        events,
        sceneConfig,
        viewerUI.canvas,
        graphicsDevice,
        commandQueue
    );

    const bgClr = new Color();
    const selectedClr = new Color();
    const unselectedClr = new Color();
    const lockedClr = new Color();

    const setClr = (target: Color, value: Color, event: string) => {
        if (!target.equals(value)) {
            target.copy(value);
            events.fire(event, target);
        }
    };

    events.on('setBgClr', (clr: Color) => setClr(bgClr, clr, 'bgClr'));
    events.on('setSelectedClr', (clr: Color) => setClr(selectedClr, clr, 'selectedClr'));
    events.on('setUnselectedClr', (clr: Color) => setClr(unselectedClr, clr, 'unselectedClr'));
    events.on('setLockedClr', (clr: Color) => setClr(lockedClr, clr, 'lockedClr'));

    events.function('bgClr', () => bgClr);
    events.function('selectedClr', () => selectedClr);
    events.function('unselectedClr', () => unselectedClr);
    events.function('lockedClr', () => lockedClr);

    events.on('bgClr', (clr: Color) => {
        const cnv = (v: number) => `${Math.max(0, Math.min(255, (v * 255))).toFixed(0)}`;
        document.body.style.backgroundColor = `rgba(${cnv(clr.r)},${cnv(clr.g)},${cnv(clr.b)},1)`;
        scene.camera.setBackgroundColor(clr);
    });
    events.on('selectedClr', () => {
        scene.forceRender = true;
    });
    events.on('unselectedClr', () => {
        scene.forceRender = true;
    });
    events.on('lockedClr', () => {
        scene.forceRender = true;
    });

    const toColor = (value: { r: number, g: number, b: number, a: number }) => {
        return new Color(value.r, value.g, value.b, value.a);
    };
    setClr(bgClr, toColor(sceneConfig.bgClr), 'bgClr');
    setClr(selectedClr, toColor(sceneConfig.selectedClr), 'selectedClr');
    setClr(unselectedClr, toColor(sceneConfig.unselectedClr), 'unselectedClr');
    setClr(lockedClr, toColor(sceneConfig.lockedClr), 'lockedClr');

    const toolManager = new ToolManager(events);
    viewerUI.bindScene(events, scene, toolManager);

    window.scene = scene;

    registerViewerEvents(events, scene);
    registerSelectionEvents(events, scene);
    registerDocEvents(scene, events);
    initFileHandler(scene, events, viewerUI.appContainer);

    const tauriInvoke = getTauriInvoke();
    if (tauriInvoke) {
        const importNativeDroppedPaths = async (paths: string[]) => {
            if (!Array.isArray(paths) || paths.length === 0) {
                return;
            }

            try {
                const files = await tauriInvoke('resolve_native_dropped_files', { paths }) as NativeDroppedFile[];
                const result = await events.invoke('import', files);
                if (result !== false) {
                    events.fire('scene.filesDropped');
                }
            } catch (error) {
                console.error(error);
                await events.invoke('showPopup', {
                    type: 'error',
                    header: localize('popup.error-loading'),
                    message: localize('popup.file-load-error', {
                        filename: paths[0] ?? 'drop',
                        message: error.message ?? error
                    })
                });
            }
        };

        window.__supersplatNativeFileDrop = (paths: string[]) => {
            void importNativeDroppedPaths(paths);
        };

        const pendingDrops = window.__supersplatPendingNativeFileDrops ?? [];
        window.__supersplatPendingNativeFileDrops = [];
        pendingDrops.forEach((paths) => {
            void importNativeDroppedPaths(paths);
        });
    }

    scene.start();

    const loadList = url.searchParams.getAll('load');
    const filenameList = url.searchParams.getAll('filename');
    for (const [i, value] of loadList.entries()) {
        const decoded = decodeURIComponent(value);
        const filename = i < filenameList.length ?
            decodeURIComponent(filenameList[i]) :
            decoded.split('/').pop();

        await events.invoke('import', [{
            filename,
            url: decoded
        }]);
    }

    if (loadList.length) {
        events.fire('scene.filesDropped');
    }
};

main().catch(async (error) => {
    console.error(error);
    window.alert(`${localize('popup.error')}: ${error.message ?? error}`);
});

export { main };
