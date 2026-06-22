import { BooleanInput, Button, Container, Element, Label } from '@playcanvas/pcui';

import { Events } from '../events';
import { localize } from './localization';
import viewerPanelSvg from './svg/viewer-panel.svg';
import { Tooltips } from './tooltips';

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

        let advancedMode = false;

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
            collapseToggle.dom.textContent = collapsed ? '<' : '>';
            collapseToggle.dom.title = collapsed ? localize('panel.viewer.expand') : localize('panel.viewer.collapse');
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

        const advancedSection = makeSection(localize('panel.viewer.advanced'));
        const advancedRow = new Container({
            class: ['viewer-panel-toggle-row', 'viewer-panel-advanced-row']
        });
        const advancedLabel = new Label({
            class: 'viewer-panel-toggle-label',
            text: localize('panel.viewer.advanced-editing')
        });
        const advancedToggle = new BooleanInput({
            type: 'toggle',
            class: 'viewer-panel-toggle',
            value: false
        });
        advancedRow.append(advancedLabel);
        advancedRow.append(advancedToggle);
        advancedSection.append(advancedRow);

        const setVisible = (visible: boolean) => {
            if (visible === this.hidden) {
                this.hidden = !visible;
                events.fire('viewerPanel.visible', visible);
            }

            if (visible) {
                events.fire('viewPanel.setVisible', false);
                events.fire('colorPanel.setVisible', false);
            }
        };

        const setAdvancedMode = (value: boolean) => {
            advancedMode = value;
            advancedToggle.value = value;
            document.body.classList.toggle('viewer-mode', !value);
            events.fire('viewer.advancedMode', value);

            if (!value) {
                setVisible(true);
                events.fire('transformPanel.setVisible', false);
                events.fire('statusBar.panelChanged', null);
            }
        };

        advancedToggle.on('change', (value: boolean) => {
            setAdvancedMode(value);
        });

        events.function('viewer.advancedMode', () => {
            return advancedMode;
        });

        events.on('viewer.setAdvancedMode', (value: boolean) => {
            setAdvancedMode(value);
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

        events.on('viewPanel.visible', (visible: boolean) => {
            if (visible) {
                setVisible(false);
            } else if (!events.invoke('colorPanel.visible')) {
                setVisible(true);
            }
        });

        events.on('colorPanel.visible', (visible: boolean) => {
            if (visible) {
                setVisible(false);
            } else if (!events.invoke('viewPanel.visible')) {
                setVisible(true);
            }
        });

        this.append(header);
        this.append(presetSection);
        this.append(cameraSection);
        this.append(displaySection);

        tooltips.register(focusButton, localize('tooltip.right-toolbar.frame-selection'), 'left');
        tooltips.register(resetButton, localize('tooltip.right-toolbar.reset-camera'), 'left');

        setAdvancedMode(false);
        setVisible(true);
    }
}

export { ViewerPanel };
