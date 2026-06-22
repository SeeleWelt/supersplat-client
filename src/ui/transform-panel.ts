import { Container, Label } from '@playcanvas/pcui';

import { Events } from '../events';
import { localize } from './localization';
import transformPanelSvg from './svg/transform-panel.svg';
import { Tooltips } from './tooltips';
import { Transform } from './transform';

const createSvg = (svgString: string) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement;
};

class TransformPanel extends Container {
    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: 'transform-panel',
            class: 'panel'
        };

        super(args);

        // stop pointer events bubbling
        ['pointerdown', 'pointerup', 'pointermove', 'wheel', 'dblclick'].forEach((eventName) => {
            this.dom.addEventListener(eventName, (event: Event) => event.stopPropagation());
        });

        const header = new Container({
            class: 'panel-header'
        });

        const icon = new Container({
            class: 'panel-header-icon'
        });
        icon.dom.appendChild(createSvg(transformPanelSvg));

        const label = new Label({
            text: localize('panel.scene-manager.transform'),
            class: 'panel-header-label'
        });

        const close = new Label({
            text: 'x',
            class: ['panel-header-button', 'transform-panel-close']
        });

        close.on('click', () => {
            events.fire('transformPanel.setVisible', false);
        });
        close.dom.addEventListener('pointerdown', (event) => {
            event.stopPropagation();
        });

        header.append(icon);
        header.append(label);
        header.append(close);

        this.append(header);
        this.append(new Transform(events));

        const panelDom = this.dom;
        let dragPointerId: number | null = null;
        let dragFrame = 0;
        let dragOffsetX = 0;
        let dragOffsetY = 0;
        let dragStartLeft = 0;
        let dragStartTop = 0;
        let dragNextLeft = 0;
        let dragNextTop = 0;
        let dragParentLeft = 0;
        let dragParentTop = 0;
        let dragMaxLeft = 0;
        let dragMaxTop = 0;

        const clamp = (value: number, min: number, max: number) => {
            return Math.min(Math.max(value, min), Math.max(min, max));
        };

        const flushDrag = () => {
            dragFrame = 0;
            panelDom.style.transform = `translate3d(${dragNextLeft - dragStartLeft}px, ${dragNextTop - dragStartTop}px, 0)`;
        };

        function endDrag(event?: PointerEvent) {
            const pointerId = event?.pointerId ?? dragPointerId;
            if (dragPointerId === null || pointerId !== dragPointerId) {
                return;
            }

            if (dragFrame) {
                cancelAnimationFrame(dragFrame);
                dragFrame = 0;
            }

            panelDom.style.left = `${dragNextLeft}px`;
            panelDom.style.top = `${dragNextTop}px`;
            panelDom.style.transform = '';
            dragPointerId = null;
            header.dom.classList.remove('dragging');
            if (header.dom.hasPointerCapture(pointerId)) {
                header.dom.releasePointerCapture(pointerId);
            }
            header.dom.removeEventListener('pointermove', movePanel);
            header.dom.removeEventListener('pointerup', endDrag);
            header.dom.removeEventListener('pointercancel', endDrag);
            header.dom.removeEventListener('lostpointercapture', endDrag);
            event?.preventDefault();
            event?.stopPropagation();
        }

        function movePanel(event: PointerEvent) {
            if (dragPointerId !== event.pointerId) {
                return;
            }

            if ((event.buttons & 1) === 0) {
                endDrag(event);
                return;
            }

            dragNextLeft = clamp(event.clientX - dragParentLeft - dragOffsetX, 8, dragMaxLeft);
            dragNextTop = clamp(event.clientY - dragParentTop - dragOffsetY, 8, dragMaxTop);

            if (!dragFrame) {
                dragFrame = requestAnimationFrame(flushDrag);
            }

            event.preventDefault();
            event.stopPropagation();
        }

        header.dom.addEventListener('pointerdown', (event: PointerEvent) => {
            if (!event.isPrimary || event.button !== 0) {
                return;
            }

            endDrag();

            const parent = panelDom.offsetParent as HTMLElement;
            const parentRect = parent?.getBoundingClientRect() ?? document.body.getBoundingClientRect();
            const rect = panelDom.getBoundingClientRect();
            dragPointerId = event.pointerId;
            dragOffsetX = event.clientX - rect.left;
            dragOffsetY = event.clientY - rect.top;
            dragStartLeft = rect.left - parentRect.left;
            dragStartTop = rect.top - parentRect.top;
            dragNextLeft = dragStartLeft;
            dragNextTop = dragStartTop;
            dragParentLeft = parentRect.left;
            dragParentTop = parentRect.top;
            dragMaxLeft = Math.max(8, parentRect.width - rect.width - 8);
            dragMaxTop = Math.max(8, parentRect.height - rect.height - 8);
            panelDom.style.left = `${dragStartLeft}px`;
            panelDom.style.top = `${dragStartTop}px`;
            panelDom.style.transform = '';
            header.dom.classList.add('dragging');
            header.dom.setPointerCapture(event.pointerId);
            header.dom.addEventListener('pointermove', movePanel);
            header.dom.addEventListener('pointerup', endDrag);
            header.dom.addEventListener('pointercancel', endDrag);
            header.dom.addEventListener('lostpointercapture', endDrag);
            event.preventDefault();
            event.stopPropagation();
        });

        const updateBodyState = (visible: boolean) => {
            document.body.classList.toggle('transform-panel-hidden', !visible);
        };

        const setVisible = (visible: boolean) => {
            if (visible === this.hidden) {
                this.hidden = !visible;
                updateBodyState(visible);
                events.fire('transformPanel.visible', visible);
            }
        };

        updateBodyState(!this.hidden);

        events.function('transformPanel.visible', () => {
            return !this.hidden;
        });

        events.on('transformPanel.setVisible', (visible: boolean) => {
            setVisible(visible);
        });

        events.on('transformPanel.toggleVisible', () => {
            setVisible(this.hidden);
        });

        tooltips.register(close, 'Hide transform panel', 'top');
    }
}

export { TransformPanel };
