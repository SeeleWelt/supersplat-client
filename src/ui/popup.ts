import { Button, Container, Label, TextInput } from '@playcanvas/pcui';

import { localize } from './localization';
import { Tooltips } from './tooltips';

interface ShowOptions {
    type: 'error' | 'info' | 'yesno' | 'okcancel' | 'savecancel';
    message: string;
    header?: string;
    link?: string;
}

class Popup extends Container {
    show: (options: ShowOptions) => void;
    hide: () => void;
    destroy: () => void;

    constructor(tooltips: Tooltips, args = {}) {
        args = {
            id: 'popup',
            hidden: true,
            tabIndex: -1,
            ...args
        };

        super(args);

        const dialog = new Container({
            id: 'popup-dialog'
        });

        const header = new Label({
            id: 'popup-header'
        });

        const text = new Label({
            id: 'popup-text'
        });

        const linkText = new Label({
            id: 'popup-link-text'
        });

        const linkCopy = new Button({
            id: 'popup-link-copy',
            icon: 'E351'
        });

        const linkRow = new Container({
            id: 'popup-link-row'
        });

        linkRow.append(linkText);
        linkRow.append(linkCopy);

        const closeButton = new Button({
            class: 'popup-button',
            text: localize('popup.close')
        });

        const continueButton = new Button({
            class: 'popup-button',
            text: localize('popup.continue')
        });

        const cancelButton = new Button({
            class: 'popup-button',
            text: localize('popup.cancel')
        });

        const yesButton = new Button({
            class: 'popup-button',
            text: localize('popup.yes')
        });

        const noButton = new Button({
            class: 'popup-button',
            text: localize('popup.no')
        });

        const buttons = new Container({
            id: 'popup-buttons'
        });

        buttons.append(closeButton);
        buttons.append(cancelButton);
        buttons.append(continueButton);
        buttons.append(yesButton);
        buttons.append(noButton);

        dialog.append(header);
        dialog.append(text);
        dialog.append(linkRow);
        dialog.append(buttons);

        this.append(dialog);

        let closeFn: () => void;
        let continueFn: () => void;
        let cancelFn: () => void;
        let yesFn: () => void;
        let noFn: () => void;
        let containerFn: () => void;
        let copyFn: () => void;

        closeButton.on('click', () => {
            closeFn();
        });

        continueButton.on('click', () => {
            continueFn();
        });

        cancelButton.on('click', () => {
            cancelFn();
        });

        yesButton.on('click', () => {
            yesFn();
        });

        noButton.on('click', () => {
            noFn();
        });

        this.on('click', () => {
            containerFn();
        });

        dialog.on('click', (event) => {
            event.stopPropagation();
        });

        linkCopy.on('click', () => {
            copyFn();
        });

        this.show = (options: ShowOptions) => {
            closeButton.text = localize('popup.close');
            continueButton.text = localize('popup.continue');
            cancelButton.text = localize('popup.cancel');
            yesButton.text = localize('popup.yes');
            noButton.text = localize('popup.no');
            buttons.dom.classList.toggle('savecancel', options.type === 'savecancel');
            if (options.type === 'savecancel') {
                closeButton.text = localize('doc.close-save');
                noButton.text = localize('doc.close-discard');
            }

            header.text = options.header;
            text.text = options.message;

            const { type, link } = options;

            ['error', 'info', 'yesno', 'okcancel', 'savecancel'].forEach((t) => {
                text.class[t === type ? 'add' : 'remove'](t);
            });

            // configure based on message type
            const showButton = (button: Button, visible: boolean) => {
                button.hidden = !visible;
                button.dom.style.display = visible ? '' : 'none';
            };

            showButton(closeButton, type === 'error' || type === 'info' || type === 'savecancel');
            showButton(continueButton, type === 'okcancel');
            showButton(cancelButton, type === 'okcancel' || type === 'savecancel');
            showButton(yesButton, type === 'yesno');
            showButton(noButton, type === 'yesno' || type === 'savecancel');
            this.hidden = false;

            linkRow.hidden = link === undefined;
            if (link !== undefined) {
                linkText.dom.innerHTML = `<a href='${link}' target='_blank'>${link}</a>`;
                linkCopy.icon = 'E352';
            }

            // take keyboard focus so shortcuts stop working
            this.dom.focus();

            return new Promise<{action: string, value?: string}>((resolve) => {
                closeFn = () => {
                    this.hide();
                    resolve({
                        action: type === 'savecancel' ? 'save' : 'ok'
                    });
                };
                continueFn = () => {
                    this.hide();
                    resolve({
                        action: 'ok'
                    });
                };
                cancelFn = () => {
                    this.hide();
                    resolve({ action: 'cancel' });
                };
                yesFn = () => {
                    this.hide();
                    resolve({ action: 'yes' });
                };
                noFn = () => {
                    this.hide();
                    resolve({ action: type === 'savecancel' ? 'discard' : 'no' });
                };
                containerFn = () => {
                    if (type === 'info' && link === undefined) {
                        closeFn();
                    }
                };
                copyFn = () => {
                    navigator.clipboard.writeText(link);
                    linkCopy.icon = 'E348';
                };
            });
        };

        this.hide = () => {
            this.hidden = true;
        };

        this.destroy = () => {
            this.hide();
            super.destroy();
        };

        tooltips.register(linkCopy, localize('popup.copy-to-clipboard'));
    }
}

export { ShowOptions, Popup };
