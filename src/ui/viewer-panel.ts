import { BooleanInput, Button, Container, Label } from '@playcanvas/pcui';

import { Events } from '../events';
import { localize } from './localization';
import viewerPanelSvg from './svg/viewer-panel.svg';
import { Tooltips } from './tooltips';
import { ViewPanel } from './view-panel';

const createSvg = (svgString: string) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement;
};

class ViewerPanel extends Container {
    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: 'viewer-panel',
            class: 'panel'
        };

        super(args);

        ['pointerdown', 'pointerup', 'pointermove', 'wheel', 'dblclick'].forEach((eventName) => {
            this.dom.addEventListener(eventName, (event: Event) => event.stopPropagation());
        });

        const makeSection = (title: string) => {
            const section = new Container({
                class: 'viewer-panel-section'
            });
            const label = new Label({
                class: 'viewer-panel-section-title',
                text: title
            });
            section.append(label);
            return section;
        };

        const makeButton = (text: string, className: string | string[] = 'viewer-panel-button') => {
            return new Button({
                text,
                class: className
            });
        };

        const header = new Container({
            class: 'panel-header'
        });

        const icon = new Container({
            class: 'panel-header-icon'
        });
        icon.dom.appendChild(createSvg(viewerPanelSvg));

        const label = new Label({
            text: localize('panel.viewer'),
            class: 'panel-header-label'
        });

        const collapseToggle = new Container({
            class: ['panel-header-button', 'panel-collapse-button', 'panel-collapse-right']
        });

        const updateCollapsedState = () => {
            const collapsed = document.body.classList.contains('right-panel-collapsed');
            collapseToggle.class[collapsed ? 'add' : 'remove']('is-collapsed');
            collapseToggle.dom.title = collapsed ? localize('panel.viewer.expand') : localize('panel.viewer.collapse');
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

        const presetSection = makeSection(localize('panel.viewer.presets'));
        const presetGrid = new Container({
            class: 'viewer-panel-preset-grid'
        });

        const presets = [
            { key: 'front', axis: 'pz' },
            { key: 'back', axis: 'nz' },
            { key: 'left', axis: 'nx' },
            { key: 'right', axis: 'px' },
            { key: 'top', axis: 'py' },
            { key: 'bottom', axis: 'ny' }
        ];

        presets.forEach((preset) => {
            const button = makeButton(localize(`panel.viewer.${preset.key}`), 'viewer-panel-preset-button');
            button.on('click', () => events.fire('camera.align', preset.axis));
            presetGrid.append(button);
            tooltips.register(button, localize(`panel.viewer.${preset.key}`), 'left');
        });

        presetSection.append(presetGrid);

        const cameraSection = makeSection(localize('panel.viewer.camera'));
        const cameraActions = new Container({
            class: 'viewer-panel-action-row'
        });
        const focusButton = makeButton(localize('panel.viewer.focus'));
        const resetButton = makeButton(localize('panel.viewer.reset-camera'));
        focusButton.on('click', () => events.fire('camera.focus'));
        resetButton.on('click', () => events.fire('camera.reset'));
        cameraActions.append(focusButton);
        cameraActions.append(resetButton);
        cameraSection.append(cameraActions);

        const modeRow = new Container({
            class: 'viewer-panel-mode-row'
        });
        const orbitMode = makeButton(localize('panel.view-options.control-mode.orbit'), ['viewer-panel-mode-button', 'active']);
        const flyMode = makeButton(localize('panel.view-options.control-mode.fly'), 'viewer-panel-mode-button');
        orbitMode.on('click', () => events.fire('camera.setControlMode', 'orbit'));
        flyMode.on('click', () => events.fire('camera.setControlMode', 'fly'));
        modeRow.append(orbitMode);
        modeRow.append(flyMode);
        cameraSection.append(modeRow);

        const displaySection = makeSection(localize('panel.viewer.display'));
        const makeToggleRow = (labelText: string, toggle: BooleanInput) => {
            const row = new Container({
                class: 'viewer-panel-toggle-row'
            });
            const rowLabel = new Label({
                class: 'viewer-panel-toggle-label',
                text: labelText
            });
            row.append(rowLabel);
            row.append(toggle);
            return row;
        };

        const overlayToggle = new BooleanInput({
            type: 'toggle',
            class: 'viewer-panel-toggle',
            value: true
        });
        const gridToggle = new BooleanInput({
            type: 'toggle',
            class: 'viewer-panel-toggle',
            value: true
        });
        const boundToggle = new BooleanInput({
            type: 'toggle',
            class: 'viewer-panel-toggle',
            value: true
        });

        displaySection.append(makeToggleRow(localize('tooltip.right-toolbar.show-hide'), overlayToggle));
        displaySection.append(makeToggleRow(localize('panel.view-options.show-grid'), gridToggle));
        displaySection.append(makeToggleRow(localize('panel.view-options.show-bound'), boundToggle));

        const viewOptionsSection = makeSection(localize('panel.view-options'));
        viewOptionsSection.append(new ViewPanel(events, tooltips, {}, { embedded: true }));

        const setVisible = (visible: boolean) => {
            if (visible === this.hidden) {
                this.hidden = !visible;
                events.fire('viewerPanel.visible', visible);
            }

            if (visible) {
                events.fire('colorPanel.setVisible', false);
                events.fire('meshPanel.setVisible', false);
            }
        };

        const setAdvancedMode = () => {
            document.body.classList.remove('viewer-mode');
            events.fire('viewer.advancedMode', true);
        };

        events.function('viewer.advancedMode', () => {
            return true;
        });

        events.on('viewer.setAdvancedMode', () => {
            setAdvancedMode();
        });

        events.function('viewerPanel.visible', () => {
            return !this.hidden;
        });

        events.on('viewerPanel.setVisible', (visible: boolean) => {
            setVisible(visible);
        });

        events.on('viewerPanel.toggleVisible', () => {
            setVisible(this.hidden);
        });

        events.on('camera.controlMode', (mode: 'orbit' | 'fly') => {
            orbitMode.class[mode === 'orbit' ? 'add' : 'remove']('active');
            flyMode.class[mode === 'fly' ? 'add' : 'remove']('active');
        });

        events.on('camera.overlay', (value: boolean) => {
            overlayToggle.value = value;
        });
        overlayToggle.on('change', (value: boolean) => {
            events.fire('camera.setOverlay', value);
        });

        events.on('grid.visible', (value: boolean) => {
            gridToggle.value = value;
        });
        gridToggle.on('change', (value: boolean) => {
            events.fire('grid.setVisible', value);
        });

        events.on('camera.bound', (value: boolean) => {
            boundToggle.value = value;
        });
        boundToggle.on('change', (value: boolean) => {
            events.fire('camera.setBound', value);
        });

        events.on('colorPanel.visible', (visible: boolean) => {
            if (visible) {
                setVisible(false);
            } else if (!events.invoke('meshPanel.visible')) {
                setVisible(true);
            }
        });

        events.on('meshPanel.visible', (visible: boolean) => {
            if (visible) {
                setVisible(false);
            } else if (!events.invoke('colorPanel.visible')) {
                setVisible(true);
            }
        });

        this.append(header);
        this.append(presetSection);
        this.append(cameraSection);
        this.append(displaySection);
        this.append(viewOptionsSection);

        tooltips.register(focusButton, localize('tooltip.right-toolbar.frame-selection'), 'left');
        tooltips.register(resetButton, localize('tooltip.right-toolbar.reset-camera'), 'left');

        setAdvancedMode();
        setVisible(true);
    }
}

export { ViewerPanel };
