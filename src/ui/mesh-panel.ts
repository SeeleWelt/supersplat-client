import { BooleanInput, Button, ColorPicker, Container, Label, SelectInput, SliderInput } from '@playcanvas/pcui';
import {
    Color,
    CULLFACE_BACK,
    CULLFACE_FRONT,
    CULLFACE_NONE
} from 'playcanvas';

import { Element } from '../element';
import { Events } from '../events';
import { MeshViewportMode, ModelElement } from '../model-element';
import { localize } from './localization';
import { Tooltips } from './tooltips';

const row = (label: string, control: any) => {
    const container = new Container({
        class: 'mesh-panel-row'
    });
    container.append(new Label({
        text: label,
        class: 'mesh-panel-row-label'
    }));
    container.append(control);
    return container;
};

const section = (title: string, children: any[]) => {
    const container = new Container({
        class: 'mesh-panel-section-group'
    });
    container.append(new Label({
        text: title,
        class: 'mesh-panel-section'
    }));
    children.forEach(child => container.append(child));
    return container;
};

type TextureSlot = 'diffuse' | 'normal';

type TextureSlotView = {
    slot: TextureSlot;
    container: Container;
    preview: HTMLImageElement;
    placeholder: HTMLDivElement;
    path: HTMLDivElement;
    size: HTMLDivElement;
    replace: Button;
    save: Button;
    clear: Button;
    reset: Button;
    previewUrl: string | null;
    updateId: number;
};

class MeshPanel extends Container {
    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: 'mesh-panel',
            class: 'panel',
            hidden: true
        };

        super(args);

        ['pointerdown', 'pointerup', 'pointermove', 'wheel', 'dblclick'].forEach((eventName) => {
            this.dom.addEventListener(eventName, (event: Event) => event.stopPropagation());
        });

        const header = new Container({
            class: 'panel-header'
        });

        const icon = new Label({
            text: '\uE220',
            class: 'panel-header-icon'
        });

        const label = new Label({
            text: localize('panel.mesh'),
            class: 'panel-header-label'
        });

        const reset = new Button({
            text: localize('panel.mesh.reset'),
            class: ['reset-action-button', 'panel-reset-action']
        });

        const collapseToggle = new Container({
            class: ['panel-header-button', 'panel-collapse-button', 'panel-collapse-right']
        });

        const updateCollapsedState = () => {
            const collapsed = document.body.classList.contains('right-panel-collapsed');
            collapseToggle.class[collapsed ? 'add' : 'remove']('is-collapsed');
            collapseToggle.dom.title = collapsed ? localize('panel.mesh.expand') : localize('panel.mesh.collapse');
            collapseToggle.dom.setAttribute('aria-label', collapseToggle.dom.title);
        };

        collapseToggle.on('click', () => {
            document.body.classList.toggle('right-panel-collapsed');
            updateCollapsedState();
        });
        updateCollapsedState();

        header.append(icon);
        header.append(label);
        header.append(collapseToggle);

        const diffuse = new ColorPicker({
            class: 'mesh-panel-row-picker',
            channels: 3,
            value: [0.85, 0.85, 0.85]
        });

        const emissive = new ColorPicker({
            class: 'mesh-panel-row-picker',
            channels: 3,
            value: [0, 0, 0]
        });

        const opacity = new SliderInput({ class: 'mesh-panel-row-slider', min: 0, max: 1, precision: 2, value: 1 });
        const metalness = new SliderInput({ class: 'mesh-panel-row-slider', min: 0, max: 1, precision: 2, value: 0 });
        const gloss = new SliderInput({ class: 'mesh-panel-row-slider', min: 0, max: 1, precision: 2, value: 0.5 });
        const emissiveIntensity = new SliderInput({ class: 'mesh-panel-row-slider', min: 0, max: 8, precision: 2, value: 0 });

        const useVertexColors = new BooleanInput({
            type: 'toggle',
            class: 'mesh-panel-row-toggle',
            value: false
        });

        const cull = new SelectInput({
            class: 'mesh-panel-row-select',
            defaultValue: `${CULLFACE_NONE}`,
            options: [
                { v: `${CULLFACE_NONE}`, t: localize('panel.mesh.cull.double-sided') },
                { v: `${CULLFACE_BACK}`, t: localize('panel.mesh.cull.back-face') },
                { v: `${CULLFACE_FRONT}`, t: localize('panel.mesh.cull.front-face') }
            ]
        });

        const viewportModes: MeshViewportMode[] = ['wireframe', 'solid', 'material', 'rendered'];
        const viewportModeButtons = new Map<MeshViewportMode, Button>();
        const viewportModeRow = new Container({ class: 'mesh-panel-view-mode-row' });
        viewportModes.forEach((mode) => {
            const button = new Button({
                text: localize(`panel.mesh.viewport.${mode}`),
                class: 'mesh-panel-view-mode-button'
            });
            viewportModeButtons.set(mode, button);
            viewportModeRow.append(button);
        });

        const vertexSelectionCount = new Label({
            text: '0 / 0',
            class: 'mesh-panel-row-value'
        });

        const vertexActions = new Container({ class: 'mesh-panel-button-grid' });
        const selectAllVertices = new Button({ text: localize('panel.mesh.vertices.all'), class: 'mesh-panel-texture-button' });
        const clearVertices = new Button({ text: localize('panel.mesh.vertices.clear'), class: 'mesh-panel-texture-button' });
        const invertVertices = new Button({ text: localize('panel.mesh.vertices.invert'), class: 'mesh-panel-texture-button' });
        const deleteVertices = new Button({ text: localize('panel.mesh.vertices.delete'), class: 'mesh-panel-texture-button' });
        vertexActions.append(selectAllVertices);
        vertexActions.append(clearVertices);
        vertexActions.append(invertVertices);
        vertexActions.append(deleteVertices);

        const createTextureSlotView = (slot: TextureSlot, title: string): TextureSlotView => {
            const container = new Container({ class: 'mesh-panel-texture-block' });
            const main = document.createElement('div');
            main.className = 'mesh-panel-texture-main';
            const previewWrap = document.createElement('div');
            previewWrap.className = 'mesh-panel-texture-preview';
            const preview = document.createElement('img');
            preview.alt = title;
            const placeholder = document.createElement('div');
            placeholder.textContent = localize('panel.mesh.texture.none');
            previewWrap.appendChild(preview);
            previewWrap.appendChild(placeholder);

            const info = document.createElement('div');
            info.className = 'mesh-panel-texture-info';
            const name = document.createElement('div');
            name.className = 'mesh-panel-texture-name';
            name.textContent = title;
            const path = document.createElement('div');
            path.className = 'mesh-panel-texture-path';
            const size = document.createElement('div');
            size.className = 'mesh-panel-texture-size';
            info.appendChild(name);
            info.appendChild(path);
            info.appendChild(size);
            main.appendChild(previewWrap);
            main.appendChild(info);

            const actions = new Container({ class: 'mesh-panel-texture-actions' });
            const replace = new Button({ text: localize('panel.mesh.texture.replace'), class: 'mesh-panel-texture-button' });
            const save = new Button({ text: localize('panel.mesh.texture.save'), class: 'mesh-panel-texture-button' });
            const clear = new Button({ text: localize('panel.mesh.texture.clear'), class: 'mesh-panel-texture-button' });
            const resetTexture = new Button({ text: localize('panel.mesh.texture.reset'), class: 'mesh-panel-texture-button' });
            actions.append(replace);
            actions.append(save);
            actions.append(clear);
            actions.append(resetTexture);

            container.dom.appendChild(main);
            container.append(actions);

            return {
                slot,
                container,
                preview,
                placeholder,
                path,
                size,
                replace,
                save,
                clear,
                reset: resetTexture,
                previewUrl: null,
                updateId: 0
            };
        };

        const diffuseTextureView = createTextureSlotView('diffuse', localize('panel.mesh.texture.diffuse-map'));
        const normalTextureView = createTextureSlotView('normal', localize('panel.mesh.texture.normal-map'));

        const ambient = new SliderInput({ class: 'mesh-panel-row-slider', min: 0, max: 2, precision: 2, value: 0.28 });
        const keyIntensity = new SliderInput({ class: 'mesh-panel-row-slider', min: 0, max: 8, precision: 2, value: 1.4 });
        const keyYaw = new SliderInput({ class: 'mesh-panel-row-slider', min: -180, max: 180, precision: 0, value: -35 });
        const keyPitch = new SliderInput({ class: 'mesh-panel-row-slider', min: -90, max: 90, precision: 0, value: 45 });
        const keyColor = new ColorPicker({
            class: 'mesh-panel-row-picker',
            channels: 3,
            value: [1, 0.94, 0.84]
        });

        this.append(header);
        this.append(section(localize('panel.mesh.viewport'), [
            viewportModeRow
        ]));
        this.append(section(localize('panel.mesh.material'), [
            row(localize('panel.mesh.diffuse'), diffuse),
            row(localize('panel.mesh.opacity'), opacity),
            row(localize('panel.mesh.metalness'), metalness),
            row(localize('panel.mesh.gloss'), gloss),
            row(localize('panel.mesh.emissive'), emissive),
            row(localize('panel.mesh.glow'), emissiveIntensity),
            row(localize('panel.mesh.vertex-color'), useVertexColors),
            row(localize('panel.mesh.cull'), cull)
        ]));
        this.append(section(localize('panel.mesh.vertex-selection'), [
            row(localize('panel.mesh.selected'), vertexSelectionCount),
            vertexActions
        ]));
        this.append(section(localize('panel.mesh.textures'), [
            diffuseTextureView.container,
            normalTextureView.container
        ]));
        this.append(section(localize('panel.mesh.scene-light'), [
            row(localize('panel.mesh.ambient'), ambient),
            row(localize('panel.mesh.key-light'), keyIntensity),
            row(localize('panel.mesh.key-color'), keyColor),
            row(localize('panel.mesh.yaw'), keyYaw),
            row(localize('panel.mesh.pitch'), keyPitch)
        ]));
        const actions = new Container({
            class: 'mesh-panel-actions'
        });
        actions.append(reset);
        this.append(actions);

        const texturePicker = document.createElement('input');
        texturePicker.type = 'file';
        texturePicker.accept = 'image/*';
        texturePicker.style.display = 'none';
        document.body.appendChild(texturePicker);

        let selected: ModelElement | null = null;
        let textureSlot: 'diffuse' | 'normal' = 'diffuse';
        let suppress = false;

        const controls = [
            diffuse, emissive, opacity, metalness, gloss, emissiveIntensity,
            useVertexColors, cull, ...viewportModeButtons.values(),
            diffuseTextureView.replace, diffuseTextureView.save, diffuseTextureView.clear, diffuseTextureView.reset,
            normalTextureView.replace, normalTextureView.save, normalTextureView.clear, normalTextureView.reset,
            selectAllVertices, clearVertices, invertVertices, deleteVertices
        ];

        const setControlsEnabled = (enabled: boolean) => {
            controls.forEach((control) => {
                control.enabled = enabled;
            });
        };

        const releaseTexturePreview = (view: TextureSlotView) => {
            if (view.previewUrl) {
                URL.revokeObjectURL(view.previewUrl);
                view.previewUrl = null;
            }
            view.preview.removeAttribute('src');
        };

        const updateTextureSlotUI = (view: TextureSlotView) => {
            const updateId = ++view.updateId;
            releaseTexturePreview(view);

            const info = selected?.getTextureInfo(view.slot);
            const hasTexture = !!info?.hasTexture;
            view.path.textContent = hasTexture ? info.name : localize('panel.mesh.texture.none');
            view.path.title = hasTexture ? info.path : view.path.textContent;
            view.size.textContent = hasTexture ? `${info.width} x ${info.height}` : '';
            view.preview.hidden = !hasTexture;
            view.placeholder.hidden = hasTexture;
            view.replace.enabled = !!selected;
            view.save.enabled = hasTexture;
            view.clear.enabled = hasTexture;
            view.reset.enabled = !!info?.hasInitialTexture;

            if (!selected || !hasTexture) {
                return;
            }

            const activeSelection = selected;
            activeSelection.createTexturePreviewUrl(view.slot).then((url) => {
                if (updateId !== view.updateId || activeSelection !== selected) {
                    if (url) {
                        URL.revokeObjectURL(url);
                    }
                    return;
                }
                if (!url) {
                    view.preview.hidden = true;
                    view.placeholder.hidden = false;
                    return;
                }
                view.previewUrl = url;
                view.preview.src = url;
            }).catch(() => {
                if (updateId === view.updateId) {
                    view.preview.hidden = true;
                    view.placeholder.hidden = false;
                }
            });
        };

        const updateTextureUI = () => {
            updateTextureSlotUI(diffuseTextureView);
            updateTextureSlotUI(normalTextureView);
        };

        const updateViewportModeUI = () => {
            const mode = selected?.viewportMode ?? 'material';
            viewportModeButtons.forEach((button, buttonMode) => {
                button.class[buttonMode === mode ? 'add' : 'remove']('active');
            });
        };

        const updateMaterialUI = () => {
            suppress = true;
            if (!selected) {
                diffuse.value = [0.85, 0.85, 0.85];
                emissive.value = [0, 0, 0];
                opacity.value = 1;
                metalness.value = 0;
                gloss.value = 0.5;
                emissiveIntensity.value = 0;
                useVertexColors.value = false;
                cull.value = `${CULLFACE_NONE}`;
                vertexSelectionCount.text = '0 / 0';
            } else {
                const state = selected.materialState;
                diffuse.value = [state.diffuse.r, state.diffuse.g, state.diffuse.b];
                emissive.value = [state.emissive.r, state.emissive.g, state.emissive.b];
                opacity.value = state.opacity;
                metalness.value = state.metalness;
                gloss.value = state.gloss;
                emissiveIntensity.value = state.emissiveIntensity;
                useVertexColors.value = state.useVertexColors;
                cull.value = `${state.cull}`;
                vertexSelectionCount.text = `${selected.selectedVertexCount} / ${selected.vertexCount}`;
            }
            setControlsEnabled(!!selected);
            updateViewportModeUI();
            updateTextureUI();
            selectAllVertices.enabled = !!selected?.supportsVertexSelection;
            clearVertices.enabled = !!selected?.supportsVertexSelection;
            invertVertices.enabled = !!selected?.supportsVertexSelection;
            deleteVertices.enabled = !!selected?.selectedVertexCount;
            useVertexColors.enabled = !!selected?.hasVertexColors;
            suppress = false;
        };

        const apply = (state: Parameters<ModelElement['applyMaterialState']>[0]) => {
            if (!suppress && selected) {
                selected.applyMaterialState(state);
            }
        };

        diffuse.on('change', (value: number[]) => apply({ diffuse: new Color(value[0], value[1], value[2]) }));
        emissive.on('change', (value: number[]) => apply({ emissive: new Color(value[0], value[1], value[2]) }));
        opacity.on('change', (value: number) => apply({ opacity: value }));
        metalness.on('change', (value: number) => apply({ metalness: value }));
        gloss.on('change', (value: number) => apply({ gloss: value }));
        emissiveIntensity.on('change', (value: number) => apply({ emissiveIntensity: value }));
        useVertexColors.on('change', (value: boolean) => apply({ useVertexColors: value }));
        cull.on('change', (value: string) => apply({ cull: parseInt(value, 10) }));
        viewportModeButtons.forEach((button, mode) => {
            button.on('click', () => selected?.applyViewportMode(mode));
        });

        const pickTexture = (slot: 'diffuse' | 'normal') => {
            textureSlot = slot;
            texturePicker.value = '';
            texturePicker.click();
        };

        const downloadBlob = (blob: Blob, filename: string) => {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        };

        const showTextureSaveError = (message: string) => {
            events.invoke('showPopup', {
                type: 'error',
                header: localize('popup.error'),
                message
            });
        };

        const saveTexture = async (slot: TextureSlot) => {
            if (!selected) return;

            events.fire('startSpinner');
            try {
                const texturePng = await selected.createTexturePng(slot);
                if (!texturePng) {
                    showTextureSaveError(localize('panel.mesh.texture.save-unsupported'));
                    return;
                }

                if (window.showSaveFilePicker) {
                    const handle = await window.showSaveFilePicker({
                        suggestedName: texturePng.filename,
                        types: [{
                            description: 'PNG',
                            accept: { 'image/png': ['.png'] }
                        }]
                    });
                    const stream = await handle.createWritable();
                    await stream.write(texturePng.blob);
                    await stream.close();
                } else {
                    downloadBlob(texturePng.blob, texturePng.filename);
                }
            } catch (error) {
                if ((error as DOMException)?.name !== 'AbortError') {
                    showTextureSaveError(`${error}`);
                }
            } finally {
                events.fire('stopSpinner');
            }
        };

        diffuseTextureView.replace.on('click', () => pickTexture('diffuse'));
        normalTextureView.replace.on('click', () => pickTexture('normal'));
        diffuseTextureView.save.on('click', () => saveTexture('diffuse'));
        normalTextureView.save.on('click', () => saveTexture('normal'));
        diffuseTextureView.clear.on('click', () => selected?.clearTexture('diffuse'));
        normalTextureView.clear.on('click', () => selected?.clearTexture('normal'));
        diffuseTextureView.reset.on('click', () => selected?.resetTexture('diffuse'));
        normalTextureView.reset.on('click', () => selected?.resetTexture('normal'));
        selectAllVertices.on('click', () => events.fire('select.all'));
        clearVertices.on('click', () => events.fire('select.none'));
        invertVertices.on('click', () => events.fire('select.invert'));
        deleteVertices.on('click', () => events.fire('select.delete'));

        texturePicker.addEventListener('change', async () => {
            const file = texturePicker.files?.[0];
            if (!selected || !file) return;
            events.fire('startSpinner');
            try {
                await selected.setTexture(textureSlot, file);
            } finally {
                events.fire('stopSpinner');
            }
        });

        const updateLightingUI = () => {
            const lighting = events.functions.has('mesh.lighting') ? events.invoke('mesh.lighting') : {
                ambientIntensity: 0.28,
                keyIntensity: 1.4,
                keyYaw: -35,
                keyPitch: 45,
                keyColor: new Color(1, 0.94, 0.84)
            };
            suppress = true;
            ambient.value = lighting.ambientIntensity;
            keyIntensity.value = lighting.keyIntensity;
            keyYaw.value = lighting.keyYaw;
            keyPitch.value = lighting.keyPitch;
            keyColor.value = [lighting.keyColor.r, lighting.keyColor.g, lighting.keyColor.b];
            suppress = false;
        };

        const applyLighting = (settings: any) => {
            if (!suppress) {
                events.fire('mesh.setLighting', settings);
            }
        };

        ambient.on('change', (value: number) => applyLighting({ ambientIntensity: value }));
        keyIntensity.on('change', (value: number) => applyLighting({ keyIntensity: value }));
        keyYaw.on('change', (value: number) => applyLighting({ keyYaw: value }));
        keyPitch.on('change', (value: number) => applyLighting({ keyPitch: value }));
        keyColor.on('change', (value: number[]) => applyLighting({ keyColor: new Color(value[0], value[1], value[2]) }));
        events.on('mesh.lighting', updateLightingUI);

        reset.on('click', () => {
            if (selected) {
                selected.applyMaterialState({
                    diffuse: new Color(0.85, 0.85, 0.85),
                    opacity: 1,
                    metalness: 0,
                    gloss: 0.5,
                    emissive: new Color(0, 0, 0),
                    emissiveIntensity: 0,
                    useVertexColors: selected.hasVertexColors,
                    cull: CULLFACE_NONE
                });
                selected.applyViewportMode('material');
                selected.resetTexture('diffuse');
                selected.resetTexture('normal');
            }
            events.fire('mesh.setLighting', {
                ambientIntensity: 0.28,
                keyIntensity: 1.4,
                keyYaw: -35,
                keyPitch: 45,
                keyColor: new Color(1, 0.94, 0.84)
            });
        });

        events.on('model.material', (model: ModelElement) => {
            if (model === selected) {
                updateMaterialUI();
            }
        });

        ['model.vertexSelection', 'model.geometry'].forEach((eventName) => {
            events.on(eventName, (model: ModelElement) => {
                if (model === selected) {
                    updateMaterialUI();
                }
            });
        });

        const setVisible = (visible: boolean) => {
            if (visible && !selected) {
                return;
            }
            if (visible === this.hidden) {
                this.hidden = !visible;
                events.fire('meshPanel.visible', visible);
            }
        };

        events.function('meshPanel.visible', () => {
            return !this.hidden;
        });

        events.on('meshPanel.setVisible', (visible: boolean) => {
            setVisible(visible);
        });

        events.on('meshPanel.toggleVisible', () => {
            setVisible(this.hidden);
        });

        events.on('selection.changed', (selection: Element) => {
            selected = selection instanceof ModelElement ? selection : null;
            updateMaterialUI();
            if (selected) {
                events.fire('colorPanel.setVisible', false);
                events.fire('viewerPanel.setVisible', false);
                events.fire('viewPanel.setVisible', false);
                setVisible(true);
            } else {
                setVisible(false);
            }
        });

        ['colorPanel.visible', 'viewerPanel.visible', 'viewPanel.visible'].forEach((name) => {
            events.on(name, (visible: boolean) => {
                if (visible) {
                    setVisible(false);
                }
            });
        });

        updateMaterialUI();
        updateLightingUI();
        tooltips.register(reset, localize('panel.mesh.reset-tooltip'), 'left');
        tooltips.register(collapseToggle, localize('panel.mesh.toggle'), 'top');
    }
}

export { MeshPanel };
