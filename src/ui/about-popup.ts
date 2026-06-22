import { Container, Label, version as pcuiVersion, revision as pcuiRevision } from '@playcanvas/pcui';
import { version as engineVersion, revision as engineRevision } from 'playcanvas';

import appLogo from './app-logo.png';
import { version as appVersion } from '../../package.json';

class AboutPopup extends Container {
    constructor(args = {}) {
        args = {
            ...args,
            id: 'about-popup',
            hidden: true,
            tabIndex: -1
        };

        super(args);

        this.dom.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                this.hidden = true;
            }
            e.stopPropagation();
        });

        this.on('click', () => {
            this.hidden = true;
        });

        const dialog = new Container({
            id: 'about-dialog'
        });

        dialog.on('click', (event: MouseEvent) => {
            event.stopPropagation();
        });

        const header = new Label({
            id: 'about-header',
            text: '关于'
        });

        const content = new Container({
            id: 'about-content'
        });

        const logoContainer = new Container({
            id: 'about-logo'
        });

        const logoImage = document.createElement('img');
        logoImage.src = appLogo;
        logoImage.alt = 'OPCMate.ai';
        logoContainer.dom.appendChild(logoImage);

        const appInfo = new Container({
            id: 'about-app-info'
        });

        const appName = new Label({
            id: 'about-app-name',
            text: '凝境'
        });

        const appVersionLabel = new Label({
            id: 'about-app-version',
            text: `OPCMate.ai · v${appVersion}`
        });

        appInfo.append(appName);
        appInfo.append(appVersionLabel);

        const depsContainer = new Container({
            id: 'about-deps'
        });

        const pcuiRow = new Container({
            class: 'about-dep-row'
        });
        const pcuiName = new Label({ class: 'about-dep-name', text: 'UI Runtime' });
        const pcuiVersionL = new Label({ class: 'about-dep-version', text: `v${pcuiVersion}` });
        const pcuiRev = new Label({ class: 'about-dep-revision', text: `(${pcuiRevision.substring(0, 7)})` });
        pcuiRow.append(pcuiName);
        pcuiRow.append(pcuiVersionL);
        pcuiRow.append(pcuiRev);

        const engineRow = new Container({
            class: 'about-dep-row'
        });
        const engineName = new Label({ class: 'about-dep-name', text: '3D Engine' });
        const engineVer = new Label({ class: 'about-dep-version', text: `v${engineVersion}` });
        const engineRev = new Label({ class: 'about-dep-revision', text: `(${engineRevision.substring(0, 7)})` });
        engineRow.append(engineName);
        engineRow.append(engineVer);
        engineRow.append(engineRev);

        depsContainer.append(pcuiRow);
        depsContainer.append(engineRow);

        content.append(logoContainer);
        content.append(appInfo);
        content.append(depsContainer);

        dialog.append(header);
        dialog.append(content);

        this.append(dialog);

        this.on('show', () => {
            this.dom.focus();
        });
    }
}

export { AboutPopup };
