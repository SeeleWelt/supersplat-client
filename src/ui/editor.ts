import { Container, Label } from '@playcanvas/pcui';
import { Mat4, path, Vec3 } from 'playcanvas';

import { ElementType } from '../element';
import { Events } from '../events';
import { getTauriInvoke } from '../tauri';
import { AboutPopup } from './about-popup';
import logo from './app-logo.png';
import { BottomToolbar } from './bottom-toolbar';
import { ColorPanel } from './color-panel';
import { DataPanel } from './data-panel';
import { EmptyState } from './empty-state';
import { ExportPopup } from './export-popup';
import { ImageSettingsDialog } from './image-settings-dialog';
import { localize } from './localization';
import { Menu } from './menu';
import { MeshPanel } from './mesh-panel';
import { ModeToggle } from './mode-toggle';
import { Popup, ShowOptions } from './popup';
import { PreferencesDialog, applyPreferences, loadPreferences } from './preferences-dialog';
import { Progress } from './progress';
import { PublishSettingsDialog } from './publish-settings-dialog';
import { RightToolbar } from './right-toolbar';
import { ScenePanel } from './scene-panel';
import { initFloatingComponentBehavior } from './floating-component-behavior';
import { ShortcutsPopup } from './shortcuts-popup';
import { Spinner } from './spinner';
import { StatusBar } from './status-bar';
import { TimelinePanel } from './timeline-panel';
import { Tooltips } from './tooltips';
import { TransformPanel } from './transform-panel';
import { VideoSettingsDialog } from './video-settings-dialog';
import { ViewCube } from './view-cube';
import { ViewerPanel } from './viewer-panel';
import { WelcomeScreen } from './welcome-screen';

// ts compiler and vscode find this type, but eslint does not
type FilePickerAcceptType = unknown;

const removeExtension = (filename: string) => {
    return filename.substring(0, filename.length - path.getExtension(filename).length);
};

class EditorUI {
    appContainer: Container;
    topContainer: Container;
    canvasContainer: Container;
    toolsContainer: Container;
    canvas: HTMLCanvasElement;
    popup: Popup;

    constructor(events: Events) {
        initFloatingComponentBehavior();

        const preferences = loadPreferences();
        applyPreferences(preferences);

        // favicon
        const link = document.createElement('link');
        link.rel = 'icon';
        link.href = logo;
        document.head.appendChild(link);

        // app
        const appContainer = new Container({
            id: 'app-container'
        });

        // editor
        const editorContainer = new Container({
            id: 'editor-container'
        });

        // tooltips container
        const tooltipsContainer = new Container({
            id: 'tooltips-container'
        });

        // top container
        const topContainer = new Container({
            id: 'top-container'
        });

        // canvas
        const canvas = document.createElement('canvas');
        canvas.id = 'canvas';

        // cursor label
        const cursorLabel = new Label({
            id: 'cursor-label'
        });

        let fullprecision = '';

        events.on('camera.focalPointPicked', (details: { position: Vec3 }) => {
            cursorLabel.text = `${details.position.x.toFixed(2)}, ${details.position.y.toFixed(2)}, ${details.position.z.toFixed(2)}`;
            fullprecision = `${details.position.x}, ${details.position.y}, ${details.position.z}`;
        });

        ['pointerdown', 'pointerup', 'pointermove', 'wheel', 'dblclick'].forEach((eventName) => {
            cursorLabel.dom.addEventListener(eventName, (event: Event) => event.stopPropagation());
        });

        cursorLabel.dom.addEventListener('pointerdown', () => {
            navigator.clipboard.writeText(fullprecision);

            const orig = cursorLabel.text;
            cursorLabel.text = localize('cursor.copied');
            setTimeout(() => {
                cursorLabel.text = orig;
            }, 1000);
        });

        // canvas container
        const canvasContainer = new Container({
            id: 'canvas-container'
        });

        // tools container
        const toolsContainer = new Container({
            id: 'tools-container'
        });

        // tooltips
        const tooltips = new Tooltips();
        tooltipsContainer.append(tooltips);

        // bottom toolbar
        const scenePanel = new ScenePanel(events, tooltips);
        const transformPanel = new TransformPanel(events, tooltips);
        const viewerPanel = new ViewerPanel(events, tooltips);
        const colorPanel = new ColorPanel(events, tooltips);
        const meshPanel = new MeshPanel(events, tooltips);
        const bottomToolbar = new BottomToolbar(events, tooltips);
        const rightToolbar = new RightToolbar(events, tooltips);
        const modeToggle = new ModeToggle(events, tooltips);
        const menu = new Menu(events);

        let workspaceActive = false;
        let sceneEmpty = true;
        let currentDocName: string = null;
        let currentDirty = false;
        let emptyStateDismissed = false;
        const workspaceUi: {
            welcomeScreen?: WelcomeScreen;
            emptyState?: EmptyState;
        } = {};

        const titlebarTitle = document.getElementById('desktop-titlebar-title');

        const refreshTitle = () => {
            const title = currentDocName || localize('workspace.untitled');
            const fullTitle = `${title}${currentDirty ? ' *' : ''}`;
            if (titlebarTitle) {
                titlebarTitle.textContent = fullTitle;
                titlebarTitle.setAttribute('title', fullTitle);
            }
            document.title = fullTitle;
        };

        const refreshDirty = () => {
            if (events.functions.has('scene.dirty')) {
                currentDirty = !!events.invoke('scene.dirty');
            }
            refreshTitle();
        };

        events.on('locale.changed', () => {
            refreshTitle();
        });

        const enterWorkspace = () => {
            if (!workspaceActive) {
                workspaceActive = true;
                document.body.classList.remove('workspace-welcome');
            }
            workspaceUi.welcomeScreen!.hidden = true;
            workspaceUi.emptyState!.hidden = !sceneEmpty || emptyStateDismissed;
            workspaceUi.welcomeScreen!.refreshRecent();
        };

        const refreshEmptyState = () => {
            workspaceUi.emptyState!.hidden = !workspaceActive || !sceneEmpty || emptyStateDismissed;
        };

        workspaceUi.welcomeScreen = new WelcomeScreen(events, enterWorkspace);
        workspaceUi.emptyState = new EmptyState(events, enterWorkspace, () => {
            emptyStateDismissed = true;
        });

        canvasContainer.dom.appendChild(canvas);
        canvasContainer.append(cursorLabel);
        canvasContainer.append(toolsContainer);
        canvasContainer.append(workspaceUi.emptyState);
        canvasContainer.append(scenePanel);
        canvasContainer.append(transformPanel);
        canvasContainer.append(viewerPanel);
        canvasContainer.append(colorPanel);
        canvasContainer.append(meshPanel);
        canvasContainer.append(bottomToolbar);
        canvasContainer.append(rightToolbar);
        canvasContainer.append(modeToggle);
        canvasContainer.append(menu);

        // view axes container
        const viewCube = new ViewCube(events);
        canvasContainer.append(viewCube);
        events.on('prerender', (cameraMatrix: Mat4) => {
            viewCube.update(cameraMatrix);
        });

        // main container
        const mainContainer = new Container({
            id: 'main-container'
        });

        const timelinePanel = new TimelinePanel(events, tooltips);
        const dataPanel = new DataPanel(events, tooltips);
        const statusBar = new StatusBar(events, tooltips);

        timelinePanel.hidden = true;

        mainContainer.append(canvasContainer);
        mainContainer.append(timelinePanel);
        mainContainer.append(dataPanel);
        mainContainer.append(statusBar);

        // Wire up status bar panel toggles
        events.on('statusBar.panelChanged', (panel: string | null) => {
            timelinePanel.hidden = panel !== 'timeline';
            dataPanel.hidden = panel !== 'splatData';
        });

        editorContainer.append(mainContainer);

        tooltips.register(cursorLabel, localize('cursor.click-to-copy'), 'top');

        // message popup
        const popup = new Popup(tooltips);

        // shortcuts popup
        const shortcutsPopup = new ShortcutsPopup(events);

        // export popup
        const exportPopup = new ExportPopup(events);

        // publish settings
        const publishSettingsDialog = new PublishSettingsDialog(events);

        // image settings
        const imageSettingsDialog = new ImageSettingsDialog(events);

        // video settings
        const videoSettingsDialog = new VideoSettingsDialog(events);

        // about popup
        const aboutPopup = new AboutPopup();

        // preferences
        const preferencesDialog = new PreferencesDialog(events);

        topContainer.append(popup);
        topContainer.append(exportPopup);
        topContainer.append(publishSettingsDialog);
        topContainer.append(imageSettingsDialog);
        topContainer.append(videoSettingsDialog);
        topContainer.append(shortcutsPopup);
        topContainer.append(aboutPopup);
        topContainer.append(preferencesDialog);

        appContainer.append(editorContainer);
        appContainer.append(workspaceUi.welcomeScreen);
        appContainer.append(topContainer);
        appContainer.append(tooltipsContainer);

        this.appContainer = appContainer;
        this.topContainer = topContainer;
        this.canvasContainer = canvasContainer;
        this.toolsContainer = toolsContainer;
        this.canvas = canvas;
        this.popup = popup;

        document.body.appendChild(appContainer.dom);
        document.body.setAttribute('tabIndex', '-1');
        document.body.classList.add('workspace-welcome');
        refreshTitle();

        events.on('doc.name', (name: string | null) => {
            currentDocName = name;
            if (name) {
                enterWorkspace();
            }
            refreshTitle();
            workspaceUi.welcomeScreen!.refreshRecent();
        });

        events.on('doc.nameChanged', (name: string | null) => {
            currentDocName = name;
            refreshTitle();
        });

        events.on('doc.saved', () => {
            currentDirty = false;
            refreshTitle();
        });

        events.on('doc.created', () => {
            sceneEmpty = true;
            emptyStateDismissed = false;
            enterWorkspace();
            refreshEmptyState();
        });

        events.on('scene.dirtyChanged', (dirty: boolean) => {
            currentDirty = dirty;
            refreshTitle();
        });

        events.on('edit.apply', refreshDirty);

        events.on('scene.emptyChanged', (empty: boolean) => {
            sceneEmpty = empty;
            if (!empty) {
                emptyStateDismissed = false;
                enterWorkspace();
            }
            refreshEmptyState();
        });

        events.on('scene.contentImported', () => {
            enterWorkspace();
            refreshDirty();
        });

        events.on('scene.filesDropped', () => {
            enterWorkspace();
            refreshDirty();
        });

        events.on('scene.elementAdded', (element: { type: ElementType }) => {
            if (element.type === ElementType.splat || element.type === ElementType.model) {
                sceneEmpty = false;
                emptyStateDismissed = false;
                enterWorkspace();
                refreshEmptyState();
            }
        });

        events.on('scene.elementRemoved', () => {
            if (events.functions.has('scene.empty')) {
                sceneEmpty = !!events.invoke('scene.empty');
            }
            refreshEmptyState();
        });

        events.on('show.shortcuts', () => {
            shortcutsPopup.hidden = false;
        });

        events.function('show.exportPopup', (exportType, splatNames: [string], showFilenameEdit: boolean) => {
            return exportPopup.show(exportType, splatNames, showFilenameEdit);
        });

        events.function('show.publishSettingsDialog', async () => {
            // show popup if user isn't logged in
            const userStatus = await events.invoke('publish.userStatus');
            if (!userStatus) {
                await events.invoke('showPopup', {
                    type: 'error',
                    header: localize('popup.error'),
                    message: localize('popup.publish.please-log-in')
                });
                return false;
            }

            // get user publish settings
            const publishSettings = await publishSettingsDialog.show(userStatus);

            // do publish
            if (publishSettings) {
                await events.invoke('scene.publish', publishSettings);
            }
        });

        events.function('show.imageSettingsDialog', async () => {
            const imageSettings = await imageSettingsDialog.show();

            if (imageSettings) {
                try {
                    const docName = events.invoke('doc.name');
                    const suggested = `${removeExtension(docName ?? 'ningjing')}-image.png`;

                    let writable: FileSystemWritableFileStream | undefined;
                    let fileHandle: FileSystemFileHandle | undefined;

                    if (window.showSaveFilePicker) {
                        fileHandle = await window.showSaveFilePicker({
                            id: 'NingjingImageFileExport',
                            types: [{
                                description: 'PNG Image',
                                accept: { 'image/png': ['.png'] }
                            }],
                            suggestedName: suggested
                        });

                        writable = await fileHandle.createWritable();
                    }

                    const result = await events.invoke('render.image', imageSettings, writable);
                    if (result === false && fileHandle?.remove) {
                        await fileHandle.remove();
                    }
                } catch (error) {
                    if (error instanceof DOMException && error.name === 'AbortError') {
                        return;
                    }

                    await events.invoke('showPopup', {
                        type: 'error',
                        header: localize('panel.render.failed'),
                        message: `'${error.message ?? error}'`
                    });
                }
            }
        });

        events.function('show.videoSettingsDialog', async () => {
            const videoSettings = await videoSettingsDialog.show();

            if (videoSettings) {

                try {
                    const docName = events.invoke('doc.name');

                    // Determine file extension and mime type based on format
                    let fileExtension: string;
                    let filePickerTypes: FilePickerAcceptType[];

                    // Codec name mapping for display
                    const codecNames: Record<string, string> = {
                        'h264': 'H.264',
                        'h265': 'H.265',
                        'vp9': 'VP9',
                        'av1': 'AV1'
                    };
                    const codecName = codecNames[videoSettings.codec] || videoSettings.codec.toUpperCase();

                    if (videoSettings.format === 'webm') {
                        fileExtension = '.webm';
                        filePickerTypes = [{
                            description: `WebM Video (${codecName})`,
                            accept: { 'video/webm': ['.webm'] }
                        }];
                    } else if (videoSettings.format === 'mov') {
                        fileExtension = '.mov';
                        filePickerTypes = [{
                            description: `MOV Video (${codecName})`,
                            accept: { 'video/quicktime': ['.mov'] }
                        }];
                    } else if (videoSettings.format === 'mkv') {
                        fileExtension = '.mkv';
                        filePickerTypes = [{
                            description: `MKV Video (${codecName})`,
                            accept: { 'video/x-matroska': ['.mkv'] }
                        }];
                    } else {
                        fileExtension = '.mp4';
                        filePickerTypes = [{
                            description: `MP4 Video (${codecName})`,
                            accept: { 'video/mp4': ['.mp4'] }
                        }];
                    }

                    const suggested = `${removeExtension(docName ?? 'ningjing')}${fileExtension}`;

                    let writable;
                    let fileHandle: FileSystemFileHandle | undefined;

                    if (window.showSaveFilePicker) {
                        fileHandle = await window.showSaveFilePicker({
                            id: 'NingjingVideoFileExport',
                            types: filePickerTypes,
                            suggestedName: suggested
                        });

                        writable = await fileHandle.createWritable();
                    }

                    const result = await events.invoke('render.video', videoSettings, writable);

                    // if the render was cancelled, remove the empty file left on disk
                    if (result === false && fileHandle?.remove) {
                        await fileHandle.remove();
                    }
                } catch (error) {
                    if (error instanceof DOMException && error.name === 'AbortError') {
                        // user cancelled save dialog
                        return;
                    }

                    await events.invoke('showPopup', {
                        type: 'error',
                        header: localize('popup.render-video.failed'),
                        message: `'${error.message ?? error}'`
                    });
                }
            }
        });

        events.on('show.about', () => {
            aboutPopup.hidden = false;
        });

        events.on('show.preferences', () => {
            preferencesDialog.hidden = false;
            void preferencesDialog.loadLocalFonts();
        });

        events.on('preferences.open', () => {
            preferencesDialog.hidden = false;
            void preferencesDialog.loadLocalFonts();
        });

        window.addEventListener('desktop-settings-request', () => {
            preferencesDialog.hidden = false;
            void preferencesDialog.loadLocalFonts();
        });

        events.function('showPopup', (options: ShowOptions) => {
            return this.popup.show(options);
        });

        let closePromptActive = false;
        const closeDesktopWindow = async () => {
            const tauriInvoke = getTauriInvoke();
            if (tauriInvoke) {
                await tauriInvoke('window_close');
            } else {
                window.close();
            }
        };

        const requestClose = async () => {
            if (closePromptActive) {
                return;
            }

            if (!events.functions.has('scene.dirty') || !events.invoke('scene.dirty')) {
                await closeDesktopWindow();
                return;
            }

            closePromptActive = true;
            const restorePreferencesDialog = !preferencesDialog.hidden;
            if (restorePreferencesDialog) {
                preferencesDialog.hidden = true;
            }

            let closingWindow = false;
            try {
                const result = await events.invoke('showPopup', {
                    type: 'savecancel',
                    header: localize('doc.close-unsaved-title'),
                    message: localize('doc.close-unsaved-message')
                });

                if (result.action === 'save') {
                    const saved = await events.invoke('doc.save');
                    if (saved && !events.invoke('scene.dirty')) {
                        closingWindow = true;
                        await closeDesktopWindow();
                    }
                } else if (result.action === 'discard') {
                    closingWindow = true;
                    await closeDesktopWindow();
                }
            } finally {
                if (restorePreferencesDialog && !closingWindow) {
                    preferencesDialog.hidden = false;
                    void preferencesDialog.loadLocalFonts();
                }
                closePromptActive = false;
            }
        };

        window.addEventListener('desktop-window-close-request', (event) => {
            if (events.functions.has('scene.dirty') && events.invoke('scene.dirty')) {
                event.preventDefault();
                void requestClose();
            }
        });

        // spinner with reference counting to handle nested operations
        const spinner = new Spinner();
        topContainer.append(spinner);

        let spinnerCount = 0;
        let spinnerMessage = '';
        let busyCount = 0;

        const setAppBusy = (busy: boolean) => {
            busyCount = Math.max(0, busyCount + (busy ? 1 : -1));
            document.body.classList.toggle('app-busy', busyCount > 0);
        };

        events.on('startSpinner', (message?: string) => {
            if (message) {
                spinnerMessage = message;
            } else if (spinnerCount === 0) {
                spinnerMessage = localize('busy.default');
            }

            spinner.setMessage(spinnerMessage);
            spinnerCount++;
            if (spinnerCount === 1) {
                spinner.hidden = false;
                setAppBusy(true);
                spinner.dom.focus();
            }
        });

        events.on('stopSpinner', () => {
            spinnerCount = Math.max(0, spinnerCount - 1);
            if (spinnerCount === 0) {
                spinner.hidden = true;
                spinnerMessage = '';
                spinner.setMessage();
                setAppBusy(false);
            }
        });

        // progress

        const progress = new Progress();

        topContainer.append(progress);

        events.on('progressStart', (header: string, cancellable?: boolean) => {
            progress.hidden = false;
            setAppBusy(true);
            progress.setHeader(header);
            progress.setText('');
            progress.setProgress(0);
            progress.showCancelButton(!!cancellable);
            progress.onCancel = cancellable ? () => events.fire('progressCancel') : null;
            progress.dom.focus();
        });

        events.on('progressUpdate', (options: { text?: string, progress?: number }) => {
            if (options.text !== undefined) {
                progress.setText(options.text);
            }
            if (options.progress !== undefined) {
                progress.setProgress(options.progress);
            }
        });

        events.on('progressEnd', () => {
            progress.hidden = true;
            setAppBusy(false);
            progress.showCancelButton(false);
            progress.onCancel = null;
        });

        // initialize canvas to correct size before creating graphics device etc
        const pixelRatio = window.devicePixelRatio;
        canvas.width = Math.ceil(canvas.clientWidth * pixelRatio);
        canvas.height = Math.ceil(canvas.clientHeight * pixelRatio);

        ['contextmenu', 'gesturestart', 'gesturechange', 'gestureend'].forEach((event) => {
            document.addEventListener(event, (e) => {
                e.preventDefault();
            }, true);
        });

        // whenever the canvas container is clicked, set keyboard focus on the body
        canvasContainer.dom.addEventListener('pointerdown', (event: PointerEvent) => {
            // set focus on the body if user is busy pressing on the canvas or a child of the tools
            // element
            if (event.target === canvas || toolsContainer.dom.contains(event.target as Node)) {
                document.body.focus();
            }
        }, true);
    }
}

export { EditorUI };
