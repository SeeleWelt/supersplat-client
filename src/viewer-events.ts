import { Color, Vec3 } from 'playcanvas';

import { Element, ElementType } from './element';
import { Events } from './events';
import { ModelElement } from './model-element';
import { Scene } from './scene';
import { Splat } from './splat';

const registerViewerEvents = (events: Events, scene: Scene) => {
    const vec = new Vec3();
    const vec2 = new Vec3();

    const selectedElement = () => {
        return events.functions.has('selection') ? events.invoke('selection') as Element : null;
    };

    const focusElement = (element: Element, speed = 1) => {
        if (element instanceof Splat) {
            const bound = element.localBound;
            vec.copy(bound.center);

            const worldTransform = element.worldTransform;
            worldTransform.transformPoint(vec, vec);
            worldTransform.getScale(vec2);

            scene.camera.focus({
                focalPoint: vec,
                radius: bound.halfExtents.length() * vec2.x,
                speed
            });
        } else if (element instanceof ModelElement && element.worldBound) {
            scene.camera.focus({
                focalPoint: element.worldBound.center,
                radius: element.worldBound.halfExtents.length(),
                speed
            });
        }
    };

    events.function('targetSize', () => {
        return scene.targetSize;
    });

    events.function('scene.dirty', () => false);

    events.on('scene.clear', () => {
        scene.clear();
    });

    [
        'camera.mode',
        'camera.overlay',
        'camera.splatSize',
        'view.outlineSelection',
        'view.centersUseGaussianColor',
        'view.bands',
        'camera.bound',
        'camera.boundDimensions',
        'camera.showPoses',
        'selection.changed',
        'grid.visible'
    ].forEach((eventName) => {
        events.on(eventName, () => {
            scene.forceRender = true;
        });
    });

    const setGridVisible = (visible: boolean) => {
        if (visible !== scene.grid.visible) {
            scene.grid.visible = visible;
            events.fire('grid.visible', visible);
        }
    };

    events.function('grid.visible', () => scene.grid.visible);
    events.on('grid.setVisible', setGridVisible);
    events.on('grid.toggleVisible', () => setGridVisible(!scene.grid.visible));
    setGridVisible(scene.config.show.grid);

    const setCameraFov = (fov: number) => {
        if (fov !== scene.camera.fov) {
            scene.camera.fov = fov;
            events.fire('camera.fov', scene.camera.fov);
        }
    };

    events.function('camera.fov', () => scene.camera.fov);
    events.on('camera.setFov', setCameraFov);

    events.function('camera.tonemapping', () => scene.camera.tonemapping);
    events.on('camera.setTonemapping', (value: string) => {
        scene.camera.tonemapping = value;
    });

    let bound = scene.config.show.bound;
    const setBoundVisible = (visible: boolean) => {
        if (visible !== bound) {
            bound = visible;
            events.fire('camera.bound', bound);
        }
    };
    events.function('camera.bound', () => bound);
    events.on('camera.setBound', setBoundVisible);
    events.on('camera.toggleBound', () => setBoundVisible(!bound));

    let boundDimensions = false;
    events.function('camera.boundDimensions', () => boundDimensions);
    events.on('camera.setBoundDimensions', (visible: boolean) => {
        if (visible !== boundDimensions) {
            boundDimensions = visible;
            events.fire('camera.boundDimensions', boundDimensions);
        }
    });

    let showPoses = false;
    events.function('camera.showPoses', () => showPoses);
    events.on('camera.setShowPoses', (visible: boolean) => {
        if (visible !== showPoses) {
            showPoses = visible;
            events.fire('camera.showPoses', showPoses);
        }
    });

    events.on('camera.focus', () => {
        const selected = selectedElement();
        if (selected) {
            focusElement(selected, 1);
        } else {
            scene.camera.focus();
        }
    });

    events.on('scene.elementAdded', (element: Element) => {
        if (element.type === ElementType.splat || element.type === ElementType.model) {
            events.fire('selection', element);
            requestAnimationFrame(() => {
                focusElement(element, 0);
            });
        }
    });

    events.on('camera.reset', () => {
        const { initialAzim, initialElev, initialZoom } = scene.config.controls;
        const x = Math.sin(initialAzim * Math.PI / 180) * Math.cos(initialElev * Math.PI / 180);
        const y = -Math.sin(initialElev * Math.PI / 180);
        const z = Math.cos(initialAzim * Math.PI / 180) * Math.cos(initialElev * Math.PI / 180);

        scene.camera.setPose(new Vec3(x * initialZoom, y * initialZoom, z * initialZoom), new Vec3(0, 0, 0));
    });

    events.on('camera.align', (axis: string) => {
        switch (axis) {
            case 'px': scene.camera.setAzimElev(90, 0); break;
            case 'py': scene.camera.setAzimElev(0, -90); break;
            case 'pz': scene.camera.setAzimElev(0, 0); break;
            case 'nx': scene.camera.setAzimElev(270, 0); break;
            case 'ny': scene.camera.setAzimElev(0, 90); break;
            case 'nz': scene.camera.setAzimElev(180, 0); break;
        }
        scene.camera.ortho = true;
    });

    let controlMode: 'orbit' | 'fly' = 'orbit';
    const setControlMode = (mode: 'orbit' | 'fly') => {
        if (mode !== controlMode) {
            controlMode = mode;
            scene.camera.controlMode = mode;
            events.fire('camera.controlMode', controlMode);
        }
    };
    events.function('camera.controlMode', () => controlMode);
    events.on('camera.setControlMode', setControlMode);
    events.on('camera.toggleControlMode', () => setControlMode(controlMode === 'orbit' ? 'fly' : 'orbit'));

    let cameraOverlay = scene.config.camera.overlay;
    const setCameraOverlay = (enabled: boolean) => {
        if (enabled !== cameraOverlay) {
            cameraOverlay = enabled;
            events.fire('camera.overlay', cameraOverlay);
        }
    };
    events.function('camera.overlay', () => cameraOverlay);
    events.on('camera.setOverlay', setCameraOverlay);
    events.on('camera.toggleOverlay', () => setCameraOverlay(!cameraOverlay));

    let activeMode = 'centers';
    events.function('camera.mode.available', () => selectedElement() instanceof Splat);
    events.function('camera.mode', () => activeMode);
    events.on('camera.setMode', (mode: string) => {
        const next = mode === 'rings' && selectedElement() instanceof Splat ? 'rings' : 'centers';
        if (next !== activeMode) {
            activeMode = next;
            events.fire('camera.mode', activeMode);
        }
    });
    events.on('camera.toggleMode', () => {
        events.fire('camera.setMode', activeMode === 'centers' ? 'rings' : 'centers');
    });

    let splatSize = 2;
    events.function('camera.splatSize', () => splatSize);
    events.on('camera.setSplatSize', (value: number) => {
        if (value !== splatSize) {
            splatSize = value;
            events.fire('camera.splatSize', splatSize);
        }
    });

    events.function('camera.flySpeed', () => scene.camera.flySpeed);
    events.on('camera.setFlySpeed', (value: number) => {
        if (value !== scene.camera.flySpeed) {
            scene.camera.flySpeed = value;
            events.fire('camera.flySpeed', value);
        }
    });

    let outlineSelection = false;
    events.function('view.outlineSelection', () => outlineSelection);
    events.on('view.setOutlineSelection', (value: boolean) => {
        if (value !== outlineSelection) {
            outlineSelection = value;
            events.fire('view.outlineSelection', outlineSelection);
        }
    });

    let viewBands = scene.config.show.shBands;
    events.function('view.bands', () => viewBands);
    events.on('view.setBands', (value: number) => {
        if (value !== viewBands) {
            viewBands = value;
            events.fire('view.bands', viewBands);
        }
    });

    let centersUseGaussianColor = false;
    events.function('view.centersUseGaussianColor', () => centersUseGaussianColor);
    events.on('view.setCentersUseGaussianColor', (value: boolean) => {
        if (value !== centersUseGaussianColor) {
            centersUseGaussianColor = value;
            events.fire('view.centersUseGaussianColor', value);
        }
    });

    events.function('camera.getPose', () => {
        const camera = scene.camera;
        return {
            position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
            target: { x: camera.focalPoint.x, y: camera.focalPoint.y, z: camera.focalPoint.z },
            fov: camera.fov
        };
    });

    events.on('camera.setPose', (pose: { position: Vec3, target: Vec3, fov?: number }, speed = 1) => {
        if (pose.fov !== undefined) {
            scene.camera.fov = pose.fov;
            events.fire('camera.fov', pose.fov);
        }
        scene.camera.setPose(pose.position, pose.target, speed);
    });

    events.function('tool.allowed', (toolName: string) => !toolName || toolName === 'viewerMeasure' || toolName === 'viewerAnnotate');
    events.function('docSerialize.view', () => {
        const packC = (c: Color) => [c.r, c.g, c.b, c.a];
        return {
            bgColor: packC(events.invoke('bgClr')),
            selectedColor: packC(events.invoke('selectedClr')),
            unselectedColor: packC(events.invoke('unselectedClr')),
            lockedColor: packC(events.invoke('lockedClr')),
            shBands: viewBands,
            centersSize: splatSize,
            outlineSelection,
            showGrid: scene.grid.visible,
            showBound: bound,
            showBoundDimensions: boundDimensions,
            showCameraPoses: showPoses,
            flySpeed: scene.camera.flySpeed
        };
    });

    events.function('docDeserialize.view', (docView: any) => {
        if (!docView) {
            return;
        }

        events.fire('setBgClr', new Color(docView.bgColor));
        events.fire('setSelectedClr', new Color(docView.selectedColor));
        events.fire('setUnselectedClr', new Color(docView.unselectedColor));
        events.fire('setLockedClr', new Color(docView.lockedColor));
        events.fire('view.setBands', docView.shBands);
        events.fire('camera.setSplatSize', docView.centersSize);
        events.fire('view.setOutlineSelection', docView.outlineSelection);
        events.fire('grid.setVisible', docView.showGrid);
        events.fire('camera.setBound', docView.showBound);
        events.fire('camera.setBoundDimensions', docView.showBoundDimensions ?? false);
        events.fire('camera.setShowPoses', docView.showCameraPoses ?? false);
        events.fire('camera.setFlySpeed', docView.flySpeed);
    });

    events.fire('camera.fov', scene.camera.fov);
    events.fire('camera.overlay', cameraOverlay);
    events.fire('camera.controlMode', controlMode);
    events.fire('view.bands', viewBands);
};

export { registerViewerEvents };
