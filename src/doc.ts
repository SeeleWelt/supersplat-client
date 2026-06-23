import { ZipFileSystem, ZipReadFileSystem } from '@playcanvas/splat-transform';

import { Events } from './events';
import { BrowserFileSystem, BlobReadSource } from './io';
import { recentFiles } from './recent-files';
import { Scene } from './scene';
import { Splat } from './splat';
import { serializePly } from './splat-serialize';
import { Transform } from './transform';
import { localize } from './ui/localization';

// ts compiler and vscode find this type, but eslint does not
type FilePickerAcceptType = unknown;

const PROJECT_EXTENSION = '.metop';
const LEGACY_PROJECT_EXTENSION = '.ssproj';
const PROJECT_FILENAME = `scene${PROJECT_EXTENSION}`;

const SuperFileType: FilePickerAcceptType[] = [{
    description: 'Metop scene',
    accept: {
        'application/x-metop': [PROJECT_EXTENSION],
        'application/x-ningjing': [LEGACY_PROJECT_EXTENSION]
    }
}];

type FileSelectorCallback = (fileList: File) => void;

// helper class to show a file selector dialog.
// used when showOpenFilePicker is not available.
class FileSelector {
    show: (callbackFunc: FileSelectorCallback) => void;

    constructor() {
        const fileSelector = document.createElement('input');
        fileSelector.setAttribute('id', 'document-file-selector');
        fileSelector.setAttribute('type', 'file');
        fileSelector.setAttribute('accept', `${PROJECT_EXTENSION},${LEGACY_PROJECT_EXTENSION}`);
        fileSelector.setAttribute('multiple', 'false');

        document.body.append(fileSelector);

        let callbackFunc: FileSelectorCallback = null;

        fileSelector.addEventListener('change', () => {
            callbackFunc(fileSelector.files[0]);
        });

        fileSelector.addEventListener('cancel', () => {
            callbackFunc(null);
        });

        this.show = (func: FileSelectorCallback) => {
            callbackFunc = func;
            fileSelector.click();
        };
    }
}

const registerDocEvents = (scene: Scene, events: Events) => {
    // construct the file selector
    const fileSelector = window.showOpenFilePicker ? null : new FileSelector();

    // this file handle is updated as the current document is loaded and saved
    let documentFileHandle: FileSystemFileHandle = null;

    // show the user a reset confirmation popup
    const getResetConfirmation = async () => {
        const result = await events.invoke('showPopup', {
            type: 'yesno',
            header: localize('doc.reset'),
            message: localize(events.invoke('scene.dirty') ? 'doc.unsaved-message' : 'doc.reset-message')
        });

        if (result.action !== 'yes') {
            return false;
        }

        return true;
    };

    const getNewSceneConfirmation = async () => {
        if (!events.invoke('scene.dirty')) {
            return true;
        }

        const result = await events.invoke('showPopup', {
            type: 'savecancel',
            header: localize('doc.new-unsaved-title'),
            message: localize('doc.new-unsaved-message')
        });

        if (result.action === 'save') {
            const saved = await events.invoke('doc.save');
            return saved && !events.invoke('scene.dirty');
        }

        return result.action === 'discard';
    };

    // reset the scene
    const resetScene = () => {
        events.fire('scene.clear');
        events.fire('camera.reset');
        events.fire('doc.setName', null);
        documentFileHandle = null;
    };

    // load the document from the given file
    const loadDocument = async (file: File) => {
        events.fire('startSpinner');

        // Create streaming ZIP reader from the file
        const blobSource = new BlobReadSource(file);
        const zipFs = new ZipReadFileSystem(blobSource);

        try {
            // reset the scene
            resetScene();

            // read document.json via streaming (only reads what's needed)
            const docSource = await zipFs.createSource('document.json');
            const docData = await docSource.read().readAll();
            docSource.close();
            const document = JSON.parse(new TextDecoder().decode(docData));

            // run through each splat and load it
            for (let i = 0; i < document.splats.length; ++i) {
                const filename = `splat_${i}.ply`;
                const splatSettings = document.splats[i];

                // load splat directly from the zip filesystem (streams on-demand)
                // skipReorder=true because project PLY files are already in morton order
                const splat = await scene.assetLoader.load(filename, zipFs, false, true) as Splat;

                await scene.add(splat);

                splat.docDeserialize(splatSettings);
            }

            // FIXME: trigger scene bound calc in a better way
            const tmp = scene.bound;
            if (tmp === null) {
                console.error('this should never fire');
            }

            events.invoke('docDeserialize.timeline', document.timeline);
            events.invoke('docDeserialize.poseSets', document.poseSets, document.camera?.fov);
            events.invoke('docDeserialize.view', document.view);
            scene.camera.docDeserialize(document.camera);

            // refresh the pivot to reflect the loaded transform
            const currentSelection = events.invoke('selection');
            if (currentSelection) {
                const pivot = events.invoke('pivot');
                const transform = new Transform();
                const pivotOrigin = events.invoke('pivot.origin');
                currentSelection.getPivot(pivotOrigin, false, transform);
                pivot.place(transform);
            }
            return true;
        } catch (error) {
            await events.invoke('showPopup', {
                type: 'error',
                header: localize('doc.load-failed'),
                message: `'${error.message ?? error}'`
            });
            return false;
        } finally {
            // Clean up resources
            zipFs.close();
            events.fire('stopSpinner');
        }
    };

    const saveDocument = async (options: { stream?: FileSystemWritableFileStream, filename?: string }) => {
        events.fire('startSpinner');

        try {
            const splats = events.invoke('scene.allSplats') as Splat[];

            const document = {
                version: 0,
                camera: scene.camera.docSerialize(),
                view: events.invoke('docSerialize.view'),
                poseSets: events.invoke('docSerialize.poseSets'),
                timeline: events.invoke('docSerialize.timeline'),
                splats: splats.map(s => s.docSerialize())
            };

            const serializeSettings = {
                // even though we support saving selection state, we disable that for now
                // because including a uint8 array in the document PLY results in slow loading
                // path.
                keepStateData: false,
                keepWorldTransform: true,
                keepColorTint: true
            };

            // Create browser filesystem and zip filesystem
            const browserFs = new BrowserFileSystem(options.filename, options.stream);
            const browserWriter = await browserFs.createWriter(options.filename);
            const zipFs = new ZipFileSystem(browserWriter);

            // Write document.json
            const docWriter = await zipFs.createWriter('document.json');
            await docWriter.write(new TextEncoder().encode(JSON.stringify(document)));
            await docWriter.close();

            // Write each splat as PLY
            for (let i = 0; i < splats.length; ++i) {
                await serializePly([splats[i]], serializeSettings, zipFs, `splat_${i}.ply`);
            }

            // Close zip (also closes underlying browser writer)
            await zipFs.close();
            return true;
        } catch (error) {
            await events.invoke('showPopup', {
                type: 'error',
                header: localize('doc.save-failed'),
                message: `'${error.message ?? error}'`
            });
            return false;
        } finally {
            events.fire('stopSpinner');
        }
    };

    // handle user requesting a new document
    events.function('doc.new', async () => {
        if (!await getNewSceneConfirmation()) {
            return false;
        }
        resetScene();
        events.fire('doc.created');
        return true;
    });

    // handle document file being dropped
    // NOTE: on chrome it's possible to get the FileSystemFileHandle from the DataTransferItem
    // (which would result in more seamless user experience), but this is not yet supported in
    // other browsers.
    events.function('doc.load', async (file: File, handle?: FileSystemFileHandle) => {
        if (!events.invoke('scene.empty') && !await getResetConfirmation()) {
            return false;
        }

        if (!await loadDocument(file)) {
            return false;
        }

        events.fire('doc.setName', file.name);

        if (handle) {
            documentFileHandle = handle;
            recentFiles.add(handle);
        }

        events.fire('doc.saved');
        return true;
    });

    events.function('doc.open', async () => {
        if (!events.invoke('scene.empty') && !await getResetConfirmation()) {
            return false;
        }

        if (fileSelector) {
            return new Promise<boolean>((resolve) => {
                fileSelector.show(async (file?: File) => {
                    if (file) {
                        if (!await loadDocument(file)) {
                            resolve(false);
                            return;
                        }
                        events.fire('doc.setName', file.name);
                        events.fire('doc.saved');
                        resolve(true);
                    } else {
                        resolve(false);
                    }
                });
            });
        }

        try {
            const fileHandles = await window.showOpenFilePicker({
                id: 'NingjingDocumentOpen',
                multiple: false,
                types: SuperFileType
            });

            if (fileHandles?.length === 1) {
                const fileHandle = fileHandles[0];

                // null file handle incase loadDocument fails
                if (!await loadDocument(await fileHandle.getFile())) {
                    return false;
                }

                // store file handle for subsequent saves
                documentFileHandle = fileHandle;
                events.fire('doc.setName', fileHandle.name);
                recentFiles.add(fileHandle);
                events.fire('doc.saved');
                return true;
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error(error);
            }
        }

        return false;
    });

    events.function('doc.openRecent', async (fileHandle: FileSystemFileHandle) => {
        if (!events.invoke('scene.empty') && !await getResetConfirmation()) {
            return false;
        }

        try {
            if (await fileHandle.queryPermission({ mode: 'read' }) !== 'granted') {
                if (await fileHandle.requestPermission({ mode: 'read' }) !== 'granted') {
                    return false;
                }
            }

            if (!await loadDocument(await fileHandle.getFile())) {
                return false;
            }

            // store file handle for subsequent saves
            documentFileHandle = fileHandle;
            events.fire('doc.setName', fileHandle.name);
            recentFiles.add(fileHandle);
            events.fire('doc.saved');
            return true;
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error(error);
                await events.invoke('showPopup', {
                    type: 'error',
                    header: localize('popup.error-loading'),
                    message: `${error.message ?? error}`
                });
            }
        }

        return false;
    });

    events.function('doc.save', async () => {
        if (documentFileHandle) {
            try {
                const saved = await saveDocument({
                    stream: await documentFileHandle.createWritable()
                });
                if (saved) {
                    events.fire('doc.saved');
                }
                return saved;
            } catch (error) {
                if (error.name !== 'AbortError' && error.name !== 'NotAllowedError') {
                    console.error(error);
                }
                return false;
            }
        } else {
            return await events.invoke('doc.saveAs');
        }
    });

    events.function('doc.saveAs', async () => {
        if (window.showSaveFilePicker) {
            try {
                const handle = await window.showSaveFilePicker({
                    id: 'NingjingDocumentSave',
                    types: SuperFileType,
                    suggestedName: PROJECT_FILENAME
                });
                const saved = await saveDocument({ stream: await handle.createWritable() });
                if (!saved) {
                    return false;
                }
                documentFileHandle = handle;
                events.fire('doc.setName', handle.name);
                events.fire('doc.saved');
                recentFiles.add(handle);
                return true;
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error(error);
                }
                return false;
            }
        } else {
            const saved = await saveDocument({
                filename: PROJECT_FILENAME
            });
            if (saved) {
                events.fire('doc.saved');
            }
            return saved;
        }
    });

    events.on('doc.new', async () => {
        await events.invoke('doc.new');
    });

    events.on('doc.open', async () => {
        await events.invoke('doc.open');
    });

    events.on('doc.save', async () => {
        await events.invoke('doc.save');
    });

    events.on('doc.saveAs', async () => {
        await events.invoke('doc.saveAs');
    });

    // doc name

    let docName: string = null;

    const setDocName = (name: string) => {
        if (name !== docName) {
            docName = name;
            events.fire('doc.name', docName);
            events.fire('doc.nameChanged', docName);
        }
    };

    events.function('doc.name', () => {
        return docName;
    });

    events.on('doc.setName', (name) => {
        setDocName(name);
    });
};

export { registerDocEvents };
