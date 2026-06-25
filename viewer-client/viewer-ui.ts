import { Vec3 } from 'playcanvas';

import { Events } from '../src/events';
import { Scene } from '../src/scene';
import { getTauriInvoke } from '../src/tauri';
import { ToolManager } from '../src/tools/tool-manager';

type ToolMode = 'viewerMeasure' | 'viewerAnnotate';

type ViewerPopupOptions = {
    type?: string;
    header?: string;
    message?: string;
    link?: string;
};

type ScreenPoint = {
    x: number;
    y: number;
    visible: boolean;
};

type RecentProject = {
    name: string;
    openedAt: number;
    handleKey?: string;
    fileKey?: string;
    url?: string;
};

type ViewerImportFile = {
    filename: string;
    url?: string;
    contents?: File;
    handle?: FileSystemFileHandle;
};

type NativeDroppedFile = {
    filename: string;
    url: string;
};

type ViewerPickResult = {
    element: unknown;
    position: Vec3;
};

const RECENT_PROJECTS_KEY = 'ningjing.viewer.recentProjects';
const RECENT_HANDLES_DB = 'ningjing.viewer.recentHandles';
const RECENT_HANDLES_STORE = 'handles';
const RECENT_FILES_DB = 'ningjing.viewer.recentFiles';
const RECENT_FILES_STORE = 'files';
const MAX_RECENT_PROJECTS = 6;
const FILE_ACCEPT = '.ply,.splat,meta.json,.json,.webp,.sog,.lcc,.bin,.txt,.ksplat,.spz,.glb,.gltf,.obj,.stl,.png,.jpg,.jpeg';
const CLICK_TOLERANCE_PX = 6;

const formatDistance = (distance: number) => {
    if (distance >= 1000) {
        return `${(distance / 1000).toFixed(2)} km`;
    }
    if (distance >= 1) {
        return `${distance.toFixed(3)} m`;
    }
    return `${(distance * 100).toFixed(1)} cm`;
};

const createButton = (icon: string, label: string, title: string, active = false) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `viewer-button${active ? ' active' : ''}`;
    button.title = title;
    button.setAttribute('aria-label', title);

    const iconEl = document.createElement('span');
    iconEl.className = 'viewer-button-icon';
    iconEl.textContent = icon;

    const labelEl = document.createElement('span');
    labelEl.className = 'viewer-button-label';
    labelEl.textContent = label;

    button.append(iconEl, labelEl);
    return button;
};

const bindButtonAction = (button: HTMLButtonElement, action: () => void) => {
    button.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        action();
    }, { capture: true });
    button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
    });
};

const readRecentProjects = (): RecentProject[] => {
    try {
        const data = JSON.parse(localStorage.getItem(RECENT_PROJECTS_KEY) ?? '[]');
        return Array.isArray(data) ? data.filter(item => item?.name).slice(0, MAX_RECENT_PROJECTS) : [];
    } catch {
        return [];
    }
};

const writeRecentProjects = (projects: RecentProject[]) => {
    localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(projects.slice(0, MAX_RECENT_PROJECTS)));
};

const openRecentHandleDB = () => {
    return new Promise<IDBDatabase | null>((resolve) => {
        if (!window.indexedDB) {
            resolve(null);
            return;
        }

        const request = indexedDB.open(RECENT_HANDLES_DB, 1);
        request.onupgradeneeded = () => {
            request.result.createObjectStore(RECENT_HANDLES_STORE);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
    });
};

const putRecentHandle = async (key: string, handle: FileSystemFileHandle) => {
    const db = await openRecentHandleDB();
    if (!db) {
        return;
    }

    await new Promise<void>((resolve) => {
        const tx = db.transaction(RECENT_HANDLES_STORE, 'readwrite');
        tx.objectStore(RECENT_HANDLES_STORE).put(handle, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
    });
    db.close();
};

const getRecentHandle = async (key: string) => {
    const db = await openRecentHandleDB();
    if (!db) {
        return null;
    }

    const handle = await new Promise<FileSystemFileHandle | null>((resolve) => {
        const tx = db.transaction(RECENT_HANDLES_STORE, 'readonly');
        const request = tx.objectStore(RECENT_HANDLES_STORE).get(key);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => resolve(null);
    });
    db.close();
    return handle;
};

const openRecentFileDB = () => {
    return new Promise<IDBDatabase | null>((resolve) => {
        if (!window.indexedDB) {
            resolve(null);
            return;
        }

        const request = indexedDB.open(RECENT_FILES_DB, 1);
        request.onupgradeneeded = () => {
            request.result.createObjectStore(RECENT_FILES_STORE);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
    });
};

const putRecentFile = async (key: string, file: File) => {
    const db = await openRecentFileDB();
    if (!db) {
        return;
    }

    await new Promise<void>((resolve) => {
        const tx = db.transaction(RECENT_FILES_STORE, 'readwrite');
        tx.objectStore(RECENT_FILES_STORE).put(file, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
    });
    db.close();
};

const getRecentFile = async (key: string) => {
    const db = await openRecentFileDB();
    if (!db) {
        return null;
    }

    const file = await new Promise<File | null>((resolve) => {
        const tx = db.transaction(RECENT_FILES_STORE, 'readonly');
        const request = tx.objectStore(RECENT_FILES_STORE).get(key);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => resolve(null);
    });
    db.close();
    return file;
};

const requestHandlePermission = async (handle: FileSystemFileHandle) => {
    const options = { mode: 'read' as const };
    if ((await handle.queryPermission(options)) === 'granted') {
        return true;
    }
    return (await handle.requestPermission(options)) === 'granted';
};

class ViewerMagnifier {
    private root: HTMLDivElement;
    private canvas: HTMLCanvasElement;
    private raf = 0;
    enabled = true;

    constructor(canvas: HTMLCanvasElement, parent: HTMLElement) {
        this.canvas = canvas;
        this.root = document.createElement('div');
        this.root.id = 'viewer-magnifier';
        this.root.hidden = true;
        parent.appendChild(this.root);
    }

    show(clientX: number, clientY: number) {
        if (!this.enabled || this.raf) {
            return;
        }

        this.raf = requestAnimationFrame(() => {
            this.raf = 0;

            const rect = this.canvas.getBoundingClientRect();
            const x = clientX - rect.left;
            const y = clientY - rect.top;
            if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
                this.hide();
                return;
            }

            const size = 178;
            const zoom = 3;

            try {
                this.root.style.backgroundImage = `url(${this.canvas.toDataURL('image/png')})`;
                this.root.style.backgroundSize = `${rect.width * zoom}px ${rect.height * zoom}px`;
                this.root.style.backgroundPosition = `${size / 2 - x * zoom}px ${size / 2 - y * zoom}px`;
            } catch {
                this.root.style.backgroundImage = '';
            }

            const parentRect = (this.root.offsetParent as HTMLElement)?.getBoundingClientRect() ?? rect;
            this.root.style.left = `${clientX - parentRect.left + 26}px`;
            this.root.style.top = `${clientY - parentRect.top - size - 20}px`;
            this.root.hidden = false;
        });
    }

    hide() {
        this.root.hidden = true;
    }
}

class ViewerPointTool {
    protected events: Events;
    protected scene: Scene;
    protected parent: HTMLElement;
    protected canvas: HTMLCanvasElement;
    protected magnifier: ViewerMagnifier;
    protected active = false;
    protected pointerStart: { x: number, y: number } | null = null;

    constructor(events: Events, scene: Scene, parent: HTMLElement, canvas: HTMLCanvasElement, magnifier: ViewerMagnifier) {
        this.events = events;
        this.scene = scene;
        this.parent = parent;
        this.canvas = canvas;
        this.magnifier = magnifier;
    }

    protected canvasPoint(event: PointerEvent) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
            nx: (event.clientX - rect.left) / rect.width,
            ny: (event.clientY - rect.top) / rect.height
        };
    }

    protected isControlEvent(event: PointerEvent) {
        const target = event.target as HTMLElement | null;
        return !!target?.closest('#viewer-toolbar, #viewer-topbar, #viewer-annotation-panel, #viewer-landing, #viewer-loading');
    }

    protected beginPointer(event: PointerEvent) {
        if (this.isControlEvent(event)) {
            return false;
        }
        if (event.pointerType === 'mouse' && event.button !== 0) {
            return false;
        }
        this.pointerStart = { x: event.clientX, y: event.clientY };
        event.preventDefault();
        event.stopPropagation();
        return true;
    }

    protected updatePointer(event: PointerEvent) {
        if (this.isControlEvent(event)) {
            this.magnifier.hide();
            return;
        }
        this.magnifier.show(event.clientX, event.clientY);
    }

    protected isClick(event: PointerEvent) {
        if (!this.pointerStart || (event.pointerType === 'mouse' && event.button !== 0)) {
            this.pointerStart = null;
            return false;
        }

        const dx = event.clientX - this.pointerStart.x;
        const dy = event.clientY - this.pointerStart.y;
        this.pointerStart = null;
        return Math.hypot(dx, dy) <= CLICK_TOLERANCE_PX;
    }

    protected async pick(event: PointerEvent) {
        const point = this.canvasPoint(event);
        return await this.scene.camera.intersect(point.nx, point.ny) as ViewerPickResult | null;
    }

    protected worldToOverlay(position: Vec3): ScreenPoint {
        const screen = new Vec3();
        this.scene.camera.worldToScreen(position, screen);

        const canvasRect = this.canvas.getBoundingClientRect();
        const parentRect = this.parent.getBoundingClientRect();

        return {
            x: canvasRect.left - parentRect.left + screen.x * canvasRect.width,
            y: canvasRect.top - parentRect.top + screen.y * canvasRect.height,
            visible: screen.z >= 0 && screen.z <= 1
        };
    }

    activate() {
        this.active = true;
    }

    deactivate() {
        this.active = false;
        this.pointerStart = null;
        this.magnifier.hide();
    }
}

class ViewerMeasureTool extends ViewerPointTool {
    private svg: SVGSVGElement;
    private line: SVGLineElement;
    private startMarker: SVGCircleElement;
    private endMarker: SVGCircleElement;
    private label: HTMLDivElement;
    private points: Vec3[] = [];

    constructor(events: Events, scene: Scene, parent: HTMLElement, canvas: HTMLCanvasElement, magnifier: ViewerMagnifier) {
        super(events, scene, parent, canvas, magnifier);

        this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        this.svg.id = 'viewer-measure-svg';
        this.svg.classList.add('viewer-overlay-svg');

        this.line = document.createElementNS(this.svg.namespaceURI, 'line') as SVGLineElement;
        this.line.classList.add('viewer-measure-line');
        this.startMarker = document.createElementNS(this.svg.namespaceURI, 'circle') as SVGCircleElement;
        this.endMarker = document.createElementNS(this.svg.namespaceURI, 'circle') as SVGCircleElement;
        this.startMarker.classList.add('viewer-measure-point');
        this.endMarker.classList.add('viewer-measure-point');
        this.startMarker.setAttribute('r', '8');
        this.endMarker.setAttribute('r', '8');

        this.svg.append(this.line, this.startMarker, this.endMarker);
        parent.appendChild(this.svg);

        this.label = document.createElement('div');
        this.label.id = 'viewer-measure-label';
        parent.appendChild(this.label);

        events.on('postrender', () => this.updateVisuals());
        events.on('viewerMeasure.clear', () => this.clear());
    }

    private clear() {
        this.points.length = 0;
        this.updateVisuals();
        this.scene.forceRender = true;
    }

    private pointerdown = (event: PointerEvent) => {
        this.beginPointer(event);
    };

    private pointermove = (event: PointerEvent) => {
        this.updatePointer(event);
    };

    private pointerup = async (event: PointerEvent) => {
        if (!this.isClick(event)) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        const result = await this.pick(event);
        if (!result) {
            this.events.fire('viewer.pickMissed', '未点中模型表面');
            return;
        }

        this.events.fire('selection', result.element);
        if (this.points.length === 2) {
            this.points.length = 0;
        }
        this.points.push(result.position.clone());
        this.updateVisuals();
        this.scene.forceRender = true;

    };

    private updateVisuals() {
        const hasStart = this.active && this.points.length > 0;
        const hasLine = this.active && this.points.length === 2;
        this.startMarker.setAttribute('visibility', hasStart ? 'visible' : 'hidden');
        this.endMarker.setAttribute('visibility', hasLine ? 'visible' : 'hidden');
        this.line.setAttribute('visibility', hasLine ? 'visible' : 'hidden');
        this.label.hidden = !hasLine;

        if (hasStart) {
            const start = this.worldToOverlay(this.points[0]);
            this.startMarker.setAttribute('cx', start.x.toString());
            this.startMarker.setAttribute('cy', start.y.toString());
        }

        if (hasLine) {
            const start = this.worldToOverlay(this.points[0]);
            const end = this.worldToOverlay(this.points[1]);
            const distance = this.points[0].distance(this.points[1]);

            this.line.setAttribute('x1', start.x.toString());
            this.line.setAttribute('y1', start.y.toString());
            this.line.setAttribute('x2', end.x.toString());
            this.line.setAttribute('y2', end.y.toString());
            this.endMarker.setAttribute('cx', end.x.toString());
            this.endMarker.setAttribute('cy', end.y.toString());

            this.label.textContent = formatDistance(distance);
            this.label.style.left = `${(start.x + end.x) * 0.5}px`;
            this.label.style.top = `${(start.y + end.y) * 0.5}px`;
        }
    }

    activate() {
        super.activate();
        this.parent.addEventListener('pointerdown', this.pointerdown, true);
        this.parent.addEventListener('pointermove', this.pointermove);
        this.parent.addEventListener('pointerup', this.pointerup, true);
        this.updateVisuals();
    }

    deactivate() {
        super.deactivate();
        this.parent.removeEventListener('pointerdown', this.pointerdown, true);
        this.parent.removeEventListener('pointermove', this.pointermove);
        this.parent.removeEventListener('pointerup', this.pointerup, true);
        this.updateVisuals();
    }
}

type Annotation = {
    id: number;
    position: Vec3;
    text: string;
    marker: HTMLButtonElement;
};

class ViewerAnnotationTool extends ViewerPointTool {
    private annotations: Annotation[] = [];
    private list: HTMLDivElement;
    private nextId = 1;

    constructor(events: Events, scene: Scene, parent: HTMLElement, canvas: HTMLCanvasElement, magnifier: ViewerMagnifier, list: HTMLDivElement) {
        super(events, scene, parent, canvas, magnifier);
        this.list = list;

        events.on('postrender', () => this.updateVisuals());
        events.on('viewerAnnotate.clear', () => this.clear());
        this.refreshList();
    }

    private clear() {
        this.annotations.forEach(annotation => annotation.marker.remove());
        this.annotations.length = 0;
        this.refreshList();
    }

    private remove(annotation: Annotation) {
        annotation.marker.remove();
        this.annotations.splice(this.annotations.indexOf(annotation), 1);
        this.refreshList();
    }

    private refreshList() {
        this.list.innerHTML = '';

        if (!this.annotations.length) {
            const empty = document.createElement('div');
            empty.className = 'viewer-annotation-empty';
            empty.textContent = '暂无标注';
            this.list.appendChild(empty);
            return;
        }

        this.annotations.forEach((annotation, index) => {
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'viewer-annotation-row';
            row.textContent = `${index + 1}. ${annotation.text}`;
            row.title = '点击聚焦，双击删除';
            row.addEventListener('click', () => {
                this.scene.camera.focus({
                    focalPoint: annotation.position,
                    radius: Math.max(0.2, this.scene.bound.halfExtents.length() * 0.08),
                    speed: 1
                });
            });
            row.addEventListener('dblclick', () => this.remove(annotation));
            this.list.appendChild(row);
        });
    }

    private pointerdown = (event: PointerEvent) => {
        this.beginPointer(event);
    };

    private pointermove = (event: PointerEvent) => {
        this.updatePointer(event);
    };

    private pointerup = async (event: PointerEvent) => {
        if (!this.isClick(event)) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        const result = await this.pick(event);
        if (!result) {
            this.events.fire('viewer.pickMissed', '未点中模型表面');
            return;
        }

        const text = window.prompt('写一句标注', `标注 ${this.nextId}`);
        if (text === null) {
            return;
        }

        this.events.fire('selection', result.element);

        const marker = document.createElement('button');
        marker.type = 'button';
        marker.className = 'viewer-annotation-marker';
        marker.textContent = '!';
        marker.title = text || `标注 ${this.nextId}`;

        const annotation: Annotation = {
            id: this.nextId++,
            position: result.position.clone(),
            text: text.trim() || marker.title,
            marker
        };

        marker.addEventListener('click', (e) => {
            e.stopPropagation();
            this.scene.camera.focus({
                focalPoint: annotation.position,
                radius: Math.max(0.2, this.scene.bound.halfExtents.length() * 0.08),
                speed: 1
            });
        });
        marker.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            this.remove(annotation);
        });

        this.annotations.push(annotation);
        this.parent.appendChild(marker);
        this.refreshList();
        this.updateVisuals();

    };

    private updateVisuals() {
        this.annotations.forEach((annotation) => {
            const point = this.worldToOverlay(annotation.position);
            annotation.marker.hidden = !point.visible;
            annotation.marker.style.left = `${point.x}px`;
            annotation.marker.style.top = `${point.y}px`;
        });
    }

    activate() {
        super.activate();
        this.parent.addEventListener('pointerdown', this.pointerdown, true);
        this.parent.addEventListener('pointermove', this.pointermove);
        this.parent.addEventListener('pointerup', this.pointerup, true);
    }

    deactivate() {
        super.deactivate();
        this.parent.removeEventListener('pointerdown', this.pointerdown, true);
        this.parent.removeEventListener('pointermove', this.pointermove);
        this.parent.removeEventListener('pointerup', this.pointerup, true);
    }
}

class ViewerUI {
    appContainer: HTMLElement;
    canvasContainer: HTMLElement;
    toolsContainer: HTMLElement;
    canvas: HTMLCanvasElement;

    private statusText: HTMLDivElement;
    private loading: HTMLDivElement;
    private progressBar: HTMLDivElement;
    private measureButton: HTMLButtonElement;
    private annotateButton: HTMLButtonElement;
    private orbitButton: HTMLButtonElement;
    private flyButton: HTMLButtonElement;
    private magnifierButton: HTMLButtonElement;
    private annotationList: HTMLDivElement;
    private landing: HTMLElement;
    private recentList: HTMLDivElement;
    private fileInput: HTMLInputElement;
    private magnifier: ViewerMagnifier;
    private openScene: () => Promise<void> = async () => {};
    private events: Events;
    private importButton: HTMLButtonElement;

    constructor(events: Events) {
        this.events = events;
        document.body.classList.add('viewer-effects', 'viewer-empty');

        const appContainer = document.createElement('main');
        appContainer.id = 'viewer-app';

        this.fileInput = document.createElement('input');
        this.fileInput.id = 'viewer-file-input';
        this.fileInput.type = 'file';
        this.fileInput.multiple = true;
        this.fileInput.accept = FILE_ACCEPT;

        const canvasContainer = document.createElement('section');
        canvasContainer.id = 'canvas-container';

        const canvas = document.createElement('canvas');
        canvas.id = 'canvas';

        const toolsContainer = document.createElement('div');
        toolsContainer.id = 'viewer-tools';

        canvasContainer.append(canvas, toolsContainer);
        appContainer.appendChild(canvasContainer);
        appContainer.appendChild(this.fileInput);

        const topbar = document.createElement('header');
        topbar.id = 'viewer-topbar';
        topbar.innerHTML = `
            <div id="viewer-brand">
                <img id="viewer-logo" src="./static/icons/opcmate-logo.png" alt="">
                <div>
                    <div id="viewer-title">METOP 查看器</div>
                    <div id="viewer-subtitle">轻量查看 / 测量 / 标注</div>
                </div>
            </div>
            <div id="viewer-top-hints">
                <span>左键旋转</span>
                <span>滚轮缩放</span>
                <span>右键平移</span>
                <span>拖拽导入</span>
            </div>
        `;

        const toolbar = document.createElement('nav');
        toolbar.id = 'viewer-toolbar';
        toolbar.setAttribute('aria-label', '查看器操作');

        const openButton = createButton('+', '打开', '打开模型文件');
        this.measureButton = createButton('↔', '测量', '测量两个点之间的距离');
        this.annotateButton = createButton('!', '标注', '给模型表面添加标注');
        const clearButton = createButton('×', '清空', '清空测量与标注');
        this.magnifierButton = createButton('◎', '放大镜', '测量和标注时显示放大镜', true);
        const focusButton = createButton('⌖', '聚焦', '聚焦当前模型');
        const resetButton = createButton('R', '重置', '重置相机');
        this.orbitButton = createButton('◉', '环绕', '环绕相机', true);
        this.flyButton = createButton('➤', '漫游', '漫游相机');
        const effectsButton = createButton('✦', '特效', '开关柔光特效', true);

        [
            openButton,
            this.measureButton,
            this.annotateButton,
            clearButton,
            this.magnifierButton,
            focusButton,
            resetButton,
            this.orbitButton,
            this.flyButton,
            effectsButton
        ].forEach(button => toolbar.appendChild(button));

        this.annotationList = document.createElement('div');
        this.annotationList.id = 'viewer-annotation-list';

        const annotationPanel = document.createElement('aside');
        annotationPanel.id = 'viewer-annotation-panel';
        annotationPanel.innerHTML = '<div class="viewer-panel-title">标注</div>';
        annotationPanel.appendChild(this.annotationList);

        const brandVideo = document.createElement('video');
        brandVideo.id = 'viewer-landing-video';
        brandVideo.src = './assets/brand-intro.webm';
        brandVideo.autoplay = true;
        brandVideo.muted = true;
        brandVideo.loop = true;
        brandVideo.playsInline = true;
        this.recentList = document.createElement('div');
        this.recentList.id = 'viewer-recent-list';

        this.landing = document.createElement('section');
        this.landing.id = 'viewer-landing';
        this.landing.innerHTML = `
            <div id="viewer-landing-scrim"></div>
            <div id="viewer-landing-shell">
                <section id="viewer-import-panel" aria-label="导入场景">
                    <button id="viewer-import-plus" type="button" aria-label="导入模型">
                        <span id="viewer-import-plus-icon">+</span>
                    </button>
                    <section id="viewer-recent-panel">
                        <div id="viewer-recent-title">最近项目</div>
                    </section>
                </section>
            </div>
        `;
        this.landing.prepend(brandVideo);
        this.landing.querySelector('#viewer-recent-panel')!.appendChild(this.recentList);
        this.importButton = this.landing.querySelector('#viewer-import-plus') as HTMLButtonElement;

        this.statusText = document.createElement('div');
        this.statusText.id = 'viewer-status';
        this.statusText.textContent = '查看模式';

        this.loading = document.createElement('div');
        this.loading.id = 'viewer-loading';
        this.loading.hidden = true;
        this.loading.innerHTML = '<div class="viewer-loading-card"><div id="viewer-loading-text">加载中</div><div class="viewer-progress-track"><div id="viewer-progress-bar"></div></div></div>';
        this.progressBar = this.loading.querySelector('#viewer-progress-bar') as HTMLDivElement;

        canvasContainer.append(topbar, toolbar, annotationPanel, this.landing, this.statusText, this.loading);
        document.body.appendChild(appContainer);
        document.body.setAttribute('tabIndex', '-1');

        this.appContainer = appContainer;
        this.canvasContainer = canvasContainer;
        this.toolsContainer = toolsContainer;
        this.canvas = canvas;
        this.magnifier = new ViewerMagnifier(canvas, canvasContainer);
        void brandVideo.play().catch(() => {});

        const setLandingVisible = (visible: boolean) => {
            document.body.classList.toggle('viewer-empty', visible);
            this.landing.classList.toggle('viewer-landing-hidden', !visible);
        };

        const setImportBusy = (busy: boolean) => {
            this.importButton.disabled = busy;
            this.importButton.classList.toggle('viewer-import-busy', busy);
        };

        const handleImportedFiles = async (importFiles: ViewerImportFile[], result: unknown) => {
            if (result !== false) {
                events.fire('scene.filesDropped');
                events.fire('scene.importedFiles', importFiles);
                setLandingVisible(false);
                this.statusText.textContent = '查看模式';
                return true;
            }

            await events.invoke('showPopup', {
                type: 'error',
                header: '导入失败',
                message: '没有找到可导入的模型文件。'
            });
            return false;
        };

        const importSelectedFiles = async (selectedFiles: File[]) => {
            if (!selectedFiles.length) {
                return;
            }

            if (!events.functions.has('import')) {
                await events.invoke('showPopup', {
                    type: 'error',
                    header: '导入失败',
                    message: '导入系统尚未初始化，请稍后再试。'
                });
                return;
            }

            const importFiles = selectedFiles.map(file => ({
                filename: file.name,
                contents: file
            }));
            setImportBusy(true);
            try {
                const result = await events.invoke('import', importFiles);
                await handleImportedFiles(importFiles, result);
            } catch (error) {
                await events.invoke('showPopup', {
                    type: 'error',
                    header: '导入失败',
                    message: error?.message ?? String(error)
                });
            } finally {
                setImportBusy(false);
            }
        };

        const importNativePaths = async (paths: string[]) => {
            if (!paths.length || !events.functions.has('import')) {
                return false;
            }

            const tauriInvoke = getTauriInvoke();
            if (!tauriInvoke) {
                return false;
            }

            setImportBusy(true);
            try {
                const files = await tauriInvoke('resolve_native_dropped_files', { paths }) as NativeDroppedFile[];
                const result = await events.invoke('import', files);
                return await handleImportedFiles(files, result);
            } catch (error) {
                await events.invoke('showPopup', {
                    type: 'error',
                    header: '导入失败',
                    message: error?.message ?? String(error)
                });
                return false;
            } finally {
                setImportBusy(false);
            }
        };

        const openBrowserFileInput = async () => {
            try {
                this.fileInput.click();
            } catch (error) {
                console.warn('viewer file input click failed', error);
                await events.invoke('showPopup', {
                    type: 'error',
                    header: '导入失败',
                    message: '当前环境无法打开文件选择器，请尝试拖拽文件到窗口中。'
                });
            }
        };

        const openScene = async () => {
            const tauriInvoke = getTauriInvoke();
            if (tauriInvoke) {
                try {
                    const paths = await tauriInvoke('open_native_file_dialog') as string[];
                    await importNativePaths(paths);
                    return;
                } catch (error) {
                    console.warn('viewer native file dialog failed, falling back to browser input', error);
                }
            }

            await openBrowserFileInput();
        };
        this.openScene = openScene;

        const openFromClick = () => {
            if (!getTauriInvoke()) {
                this.fileInput.click();
                return;
            }
            void openScene();
        };

        bindButtonAction(openButton, openFromClick);
        bindButtonAction(this.importButton, openFromClick);
        this.fileInput.addEventListener('change', async () => {
            const selectedFiles = Array.from(this.fileInput.files ?? []);
            this.fileInput.value = '';
            await importSelectedFiles(selectedFiles);
        });
        this.refreshRecentProjects();

        bindButtonAction(this.measureButton, () => events.fire('tool.viewerMeasure'));
        bindButtonAction(this.annotateButton, () => events.fire('tool.viewerAnnotate'));
        bindButtonAction(clearButton, () => {
            events.fire('viewerMeasure.clear');
            events.fire('viewerAnnotate.clear');
        });
        bindButtonAction(this.magnifierButton, () => {
            this.magnifier.enabled = !this.magnifier.enabled;
            this.magnifierButton.classList.toggle('active', this.magnifier.enabled);
            if (!this.magnifier.enabled) {
                this.magnifier.hide();
            }
        });
        bindButtonAction(focusButton, () => events.fire('camera.focus'));
        bindButtonAction(resetButton, () => events.fire('camera.reset'));
        bindButtonAction(this.orbitButton, () => events.fire('camera.setControlMode', 'orbit'));
        bindButtonAction(this.flyButton, () => events.fire('camera.setControlMode', 'fly'));
        bindButtonAction(effectsButton, () => {
            document.body.classList.toggle('viewer-effects');
            effectsButton.classList.toggle('active', document.body.classList.contains('viewer-effects'));
        });

        events.on('tool.activated', (toolName: ToolMode | null) => {
            this.measureButton.classList.toggle('active', toolName === 'viewerMeasure');
            this.annotateButton.classList.toggle('active', toolName === 'viewerAnnotate');
            this.statusText.textContent = toolName === 'viewerMeasure' ?
                '测量模式：点击两个表面点' :
                toolName === 'viewerAnnotate' ?
                    '标注模式：点击表面点并输入说明' :
                    '查看模式';
        });

        events.on('viewer.pickMissed', (message: string) => {
            this.statusText.textContent = message;
            window.setTimeout(() => {
                if (!events.functions.has('tool.active')) {
                    return;
                }
                const active = events.invoke('tool.active');
                this.statusText.textContent = active === 'viewerMeasure' ?
                    '测量模式：点击两个表面点' :
                    active === 'viewerAnnotate' ?
                        '标注模式：点击表面点并输入说明' :
                        '查看模式';
            }, 1400);
        });

        events.on('camera.controlMode', (mode: 'orbit' | 'fly') => {
            this.orbitButton.classList.toggle('active', mode === 'orbit');
            this.flyButton.classList.toggle('active', mode === 'fly');
        });

        events.on('doc.name', (name: string | null) => {
            if (name) {
                document.title = `${name} - Ningjing Viewer`;
                void this.addRecentProject(name);
            }
        });

        events.on('scene.emptyChanged', (empty: boolean) => {
            setLandingVisible(empty);
        });

        events.on('scene.elementAdded', (element: { name?: string, filename?: string }) => {
            const name = element?.name || element?.filename;
            if (name) {
                void this.addRecentProject(name);
            }
        });

        events.on('scene.importedFiles', (files: ViewerImportFile[]) => {
            const primary = files.find(file => file.handle || file.contents) ?? files[0];
            if (primary) {
                void this.addRecentProject(primary);
            }
        });

        events.function('showPopup', (options: ViewerPopupOptions) => {
            const message = [options.header, options.message, options.link].filter(Boolean).join('\n\n');
            if (options.type === 'yesno') {
                return { action: window.confirm(message) ? 'yes' : 'no' };
            }
            if (options.type === 'okcancel') {
                return { action: window.confirm(message) ? 'ok' : 'cancel' };
            }
            if (options.type === 'savecancel') {
                return { action: window.confirm(message) ? 'discard' : 'cancel' };
            }
            window.alert(message);
            return { action: 'ok' };
        });

        events.on('startSpinner', (message?: string) => {
            this.loading.hidden = false;
            this.progressBar.style.width = '18%';
            const text = this.loading.querySelector('#viewer-loading-text') as HTMLDivElement;
            text.textContent = message || '加载中';
        });

        events.on('stopSpinner', () => {
            this.loading.hidden = true;
            this.progressBar.style.width = '0%';
        });

        events.on('progressStart', (header: string) => {
            this.loading.hidden = false;
            this.progressBar.style.width = '0%';
            const text = this.loading.querySelector('#viewer-loading-text') as HTMLDivElement;
            text.textContent = header;
        });

        events.on('progressUpdate', (options: { text?: string, progress?: number }) => {
            if (options.text) {
                const text = this.loading.querySelector('#viewer-loading-text') as HTMLDivElement;
                text.textContent = options.text;
            }
            if (options.progress !== undefined) {
                this.progressBar.style.width = `${Math.max(0, Math.min(100, options.progress))}%`;
            }
        });

        events.on('progressEnd', () => {
            this.loading.hidden = true;
            this.progressBar.style.width = '0%';
        });

        const pixelRatio = window.devicePixelRatio;
        canvas.width = Math.ceil(canvas.clientWidth * pixelRatio);
        canvas.height = Math.ceil(canvas.clientHeight * pixelRatio);

        ['contextmenu', 'gesturestart', 'gesturechange', 'gestureend'].forEach((eventName) => {
            document.addEventListener(eventName, (event) => {
                event.preventDefault();
            }, true);
        });

        canvasContainer.addEventListener('pointerdown', () => {
            document.body.focus();
        }, true);
    }

    bindScene(events: Events, scene: Scene, toolManager: ToolManager) {
        toolManager.register('viewerMeasure', new ViewerMeasureTool(events, scene, this.canvasContainer, this.canvas, this.magnifier));
        toolManager.register('viewerAnnotate', new ViewerAnnotationTool(events, scene, this.canvasContainer, this.canvas, this.magnifier, this.annotationList));
    }

    private async addRecentProject(fileOrName: ViewerImportFile | string, handle?: FileSystemFileHandle) {
        const name = typeof fileOrName === 'string' ? fileOrName : fileOrName.filename;
        const trimmed = name.trim();
        if (!trimmed) {
            return;
        }

        const source = typeof fileOrName === 'string' ? null : fileOrName;
        const sourceHandle = source?.handle ?? handle;
        const handleKey = sourceHandle ? `${trimmed}:handle:${Date.now()}` : undefined;
        const fileKey = source?.contents instanceof File ? `${trimmed}:file:${Date.now()}` : undefined;

        if (sourceHandle && handleKey) {
            await putRecentHandle(handleKey, sourceHandle);
        }
        if (source?.contents instanceof File && fileKey) {
            await putRecentFile(fileKey, source.contents);
        }

        const projects = readRecentProjects()
        .filter(project => project.name !== trimmed);
        projects.unshift({
            name: trimmed,
            openedAt: Date.now(),
            handleKey,
            fileKey,
            url: source?.url
        });
        writeRecentProjects(projects);
        this.refreshRecentProjects();
    }

    private async openRecentProject(project: RecentProject) {
        if (project.handleKey && this.events.functions.has('import')) {
            const handle = await getRecentHandle(project.handleKey);
            if (handle && await requestHandlePermission(handle)) {
                const file = await handle.getFile();
                const importFiles = [{
                    filename: handle.name,
                    contents: file,
                    handle
                }];
                const result = await this.events.invoke('import', importFiles);
                if (result !== false) {
                    this.events.fire('scene.filesDropped');
                    this.events.fire('scene.importedFiles', importFiles);
                }
                return;
            }
        }

        if (project.fileKey && this.events.functions.has('import')) {
            const file = await getRecentFile(project.fileKey);
            if (file) {
                const importFiles = [{
                    filename: file.name || project.name,
                    contents: file
                }];
                const result = await this.events.invoke('import', importFiles);
                if (result !== false) {
                    this.events.fire('scene.filesDropped');
                    this.events.fire('scene.importedFiles', importFiles);
                }
                return;
            }
        }

        if (project.url && this.events.functions.has('import')) {
            const importFiles = [{
                filename: project.name,
                url: project.url
            }];
            const result = await this.events.invoke('import', importFiles);
            if (result !== false) {
                this.events.fire('scene.filesDropped');
                this.events.fire('scene.importedFiles', importFiles);
                return;
            }
        }

        await this.events.invoke('showPopup', {
            type: 'error',
            header: '需要重新选择文件',
            message: '浏览器不能长期访问这个文件，请重新选择一次。'
        });
        await this.openScene();
    }

    private refreshRecentProjects() {
        const projects = readRecentProjects();
        this.recentList.innerHTML = '';

        if (!projects.length) {
            const empty = document.createElement('div');
            empty.className = 'viewer-recent-empty';
            empty.textContent = '暂无最近项目';
            this.recentList.appendChild(empty);
            return;
        }

        const formatter = new Intl.DateTimeFormat('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });

        projects.forEach((project) => {
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'viewer-recent-row';
            row.title = project.handleKey || project.fileKey || project.url ? '点击重新打开项目' : '点击后重新选择该项目文件';
            row.innerHTML = `
                <span class="viewer-recent-name"></span>
                <span class="viewer-recent-date">${formatter.format(project.openedAt)}</span>
            `;
            row.querySelector('.viewer-recent-name')!.textContent = project.name;
            row.addEventListener('click', () => {
                void this.openRecentProject(project);
            });
            this.recentList.appendChild(row);
        });
    }
}

export { ViewerUI };
