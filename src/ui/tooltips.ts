import { Container, Element, Label } from '@playcanvas/pcui';

type Direction = 'left' | 'right' | 'top' | 'bottom';

class Tooltips extends Container {
    register: (target: Element, text: string, direction?: Direction) => void;
    unregister: (target: Element) => void;
    destroy: () => void;

    constructor(args: any = {}) {
        args = {
            ...args,
            class: 'tooltips',
            hidden: true
        };

        super(args);

        const text = new Label({
            class: 'tooltips-content'
        });

        this.append(text);

        const targets = new Map<Element, any>();
        const style = this.dom.style;
        let timer: number = 0;
        let activeTarget: Element | null = null;

        this.register = (target: Element, textString: string, direction: Direction = 'bottom') => {
            if (!target.dom.getAttribute('title')) {
                target.dom.setAttribute('title', textString);
            }
            if (!target.dom.getAttribute('aria-label')) {
                target.dom.setAttribute('aria-label', textString);
            }

            const activate = () => {
                activeTarget = target;
                const rect = target.dom.getBoundingClientRect();
                const midx = Math.floor((rect.left + rect.right) * 0.5);
                const midy = Math.floor((rect.top + rect.bottom) * 0.5);

                switch (direction) {
                    case 'left':
                        style.left = `${rect.left}px`;
                        style.top = `${midy}px`;
                        style.transform = 'translate(calc(-100% - 10px), -50%)';
                        break;
                    case 'right':
                        style.left = `${rect.right}px`;
                        style.top = `${midy}px`;
                        style.transform = 'translate(10px, -50%)';
                        break;
                    case 'top':
                        style.left = `${midx}px`;
                        style.top = `${rect.top}px`;
                        style.transform = 'translate(-50%, calc(-100% - 10px))';
                        break;
                    case 'bottom':
                        style.left = `${midx}px`;
                        style.top = `${rect.bottom}px`;
                        style.transform = 'translate(-50%, 10px)';
                        break;
                }

                text.text = textString;
                this.hidden = false;
                // inline-block so max-width / wrapping in SCSS apply (inline
                // would stay one long line).
                style.display = 'inline-block';

                // clamp to viewport so tooltip doesn't go off-screen
                const tooltipRect = this.dom.getBoundingClientRect();
                if (tooltipRect.left < 0) {
                    style.left = `${parseFloat(style.left) - tooltipRect.left}px`;
                } else if (tooltipRect.right > window.innerWidth) {
                    style.left = `${parseFloat(style.left) - (tooltipRect.right - window.innerWidth)}px`;
                }
            };

            const startTimer = (fn: () => void) => {
                timer = window.setTimeout(() => {
                    fn();
                    timer = -1;
                }, 250);
            };

            const cancelTimer = () => {
                if (timer >= 0) {
                    clearTimeout(timer);
                    timer = -1;
                }
            };

            const enter = () => {
                cancelTimer();

                if (style.display === 'inline-block') {
                    activate();
                } else {
                    startTimer(() => activate());
                }
            };

            const leave = () => {
                cancelTimer();

                if (style.display === 'inline-block') {
                    startTimer(() => {
                        style.display = 'none';
                        this.hidden = true;
                        if (activeTarget === target) {
                            activeTarget = null;
                        }
                    });
                }
            };

            target.dom.addEventListener('pointerenter', enter);
            target.dom.addEventListener('pointerleave', leave);
            target.dom.addEventListener('mouseenter', enter);
            target.dom.addEventListener('mouseleave', leave);
            target.dom.addEventListener('focus', enter);
            target.dom.addEventListener('blur', leave);

            target.on('destroy', () => {
                this.unregister(target);
            });

            targets.set(target, { enter, leave });
        };

        this.unregister = (target: Element) => {
            const value = targets.get(target);
            if (value) {
                target.dom.removeEventListener('pointerenter', value.enter);
                target.dom.removeEventListener('pointerleave', value.leave);
                target.dom.removeEventListener('mouseenter', value.enter);
                target.dom.removeEventListener('mouseleave', value.leave);
                target.dom.removeEventListener('focus', value.enter);
                target.dom.removeEventListener('blur', value.leave);
                targets.delete(target);
                if (activeTarget === target) {
                    style.display = 'none';
                    this.hidden = true;
                    activeTarget = null;
                }
            }
        };

        this.destroy = () => {
            for (const target of targets.keys()) {
                this.unregister(target);
            }
        };
    }
}

export { Tooltips };
