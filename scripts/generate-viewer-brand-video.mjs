import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const root = process.cwd();
const edgeCandidates = [
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\EdgeCore\\Optimized\\msedge.exe'
];

const edgePath = edgeCandidates.find(candidate => fs.existsSync(candidate));
if (!edgePath) {
    throw new Error('Microsoft Edge was not found; cannot generate brand video.');
}

const logoPath = path.join(root, 'static', 'icons', 'opcmate-logo.png');
const logoData = fs.readFileSync(logoPath).toString('base64');
const logoUrl = `data:image/png;base64,${logoData}`;
const outputDir = path.join(root, 'viewer-client', 'assets');
const outputPath = path.join(outputDir, 'brand-intro.webm');
fs.mkdirSync(outputDir, { recursive: true });

const port = 9357;
const profile = path.join(root, '.tmp-edge-brand-video');
fs.rmSync(profile, { recursive: true, force: true });

const edge = spawn(edgePath, [
    '--headless=new',
    '--disable-gpu',
    '--mute-audio',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    'about:blank'
], {
    stdio: ['ignore', 'ignore', 'ignore']
});

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const getJson = async (url) => {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return response.json();
};

const connectPage = async () => {
    for (let i = 0; i < 80; i++) {
        try {
            const pages = await getJson(`http://127.0.0.1:${port}/json`);
            const page = pages.find(item => item.type === 'page' && item.webSocketDebuggerUrl);
            if (page) {
                return new WebSocket(page.webSocketDebuggerUrl);
            }
        } catch {
            // wait for remote debugging server
        }
        await wait(100);
    }
    throw new Error('Timed out waiting for Edge DevTools endpoint.');
};

const ws = await connectPage();
await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
});

let id = 0;
const pending = new Map();
ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
        const { resolve, reject } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) {
            reject(new Error(message.error.message));
        } else {
            resolve(message.result);
        }
    }
});

const send = (method, params = {}) => {
    const callId = ++id;
    ws.send(JSON.stringify({ id: callId, method, params }));
    return new Promise((resolve, reject) => {
        pending.set(callId, { resolve, reject });
    });
};

const recorderScript = `
(async () => {
    const logoUrl = ${JSON.stringify(logoUrl)};
    const width = 1280;
    const height = 720;
    const fps = 30;
    const duration = 5.2;
    const frameDuration = 1000 / fps;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    document.body.style.margin = '0';
    document.body.style.background = '#02040a';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d', { alpha: false });

    const sourceLogo = new Image();
    sourceLogo.src = logoUrl;
    await new Promise((resolve, reject) => {
        sourceLogo.onload = resolve;
        sourceLogo.onerror = reject;
    });

    const icon = document.createElement('canvas');
    icon.width = 300;
    icon.height = 220;
    const iconCtx = icon.getContext('2d');
    iconCtx.drawImage(sourceLogo, 110, 86, 292, 236, 0, 0, icon.width, icon.height);
    const iconData = iconCtx.getImageData(0, 0, icon.width, icon.height);
    for (let i = 0; i < iconData.data.length; i += 4) {
        const r = iconData.data[i];
        const g = iconData.data[i + 1];
        const b = iconData.data[i + 2];
        const alpha = r > 214 && g > 214 && b > 214 ? 255 : 0;
        iconData.data[i] = 255;
        iconData.data[i + 1] = 255;
        iconData.data[i + 2] = 255;
        iconData.data[i + 3] = alpha;
    }
    iconCtx.putImageData(iconData, 0, 0);

    const outline = document.createElement('canvas');
    outline.width = icon.width;
    outline.height = icon.height;
    const outlineCtx = outline.getContext('2d');
    const outlineImage = outlineCtx.createImageData(icon.width, icon.height);
    const alphaAt = (x, y) => {
        if (x < 0 || y < 0 || x >= icon.width || y >= icon.height) {
            return 0;
        }
        return iconData.data[(y * icon.width + x) * 4 + 3];
    };
    for (let y = 0; y < icon.height; y++) {
        for (let x = 0; x < icon.width; x++) {
            const alpha = alphaAt(x, y);
            if (!alpha) {
                continue;
            }
            if (alphaAt(x - 2, y) < 128 || alphaAt(x + 2, y) < 128 || alphaAt(x, y - 2) < 128 || alphaAt(x, y + 2) < 128) {
                const index = (y * icon.width + x) * 4;
                outlineImage.data[index] = 255;
                outlineImage.data[index + 1] = 255;
                outlineImage.data[index + 2] = 255;
                outlineImage.data[index + 3] = 255;
            }
        }
    }
    outlineCtx.putImageData(outlineImage, 0, 0);

    const clamp = v => Math.max(0, Math.min(1, v));
    const lerp = (a, b, p) => a + (b - a) * p;
    const easeOut = v => 1 - Math.pow(1 - clamp(v), 3);
    const easeInOut = v => {
        v = clamp(v);
        return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2;
    };

    const pointOn = (curve, u) => {
        const v = 1 - u;
        return {
            x: v * v * v * curve[0].x + 3 * v * v * u * curve[1].x + 3 * v * u * u * curve[2].x + u * u * u * curve[3].x,
            y: v * v * v * curve[0].y + 3 * v * v * u * curve[1].y + 3 * v * u * u * curve[2].y + u * u * u * curve[3].y
        };
    };

    const drawSegment = (targetCtx, curve, start, end) => {
        start = clamp(start);
        end = clamp(end);
        if (end <= start) {
            return;
        }
        const first = pointOn(curve, start);
        targetCtx.beginPath();
        targetCtx.moveTo(first.x, first.y);
        for (let i = 1; i <= 84; i++) {
            const p = pointOn(curve, start + (end - start) * i / 84);
            targetCtx.lineTo(p.x, p.y);
        }
        targetCtx.stroke();
    };

    const ribbonCurves = [
        [{ x: -470, y: -72 }, { x: -212, y: -178 }, { x: 156, y: -152 }, { x: 246, y: -36 }],
        [{ x: -412, y: 86 }, { x: -130, y: 168 }, { x: 212, y: 156 }, { x: 278, y: 38 }],
        [{ x: 438, y: -84 }, { x: 174, y: -174 }, { x: -160, y: -142 }, { x: -248, y: -30 }],
        [{ x: 414, y: 84 }, { x: 154, y: 174 }, { x: -218, y: 150 }, { x: -286, y: 34 }],
        [{ x: -288, y: -126 }, { x: -88, y: -218 }, { x: 98, y: 210 }, { x: 288, y: 122 }],
        [{ x: 294, y: -122 }, { x: 78, y: -210 }, { x: -92, y: 218 }, { x: -294, y: 120 }],
        [{ x: -360, y: -6 }, { x: -176, y: -74 }, { x: 184, y: -72 }, { x: 360, y: -10 }],
        [{ x: 358, y: 20 }, { x: 172, y: 86 }, { x: -174, y: 76 }, { x: -358, y: 12 }]
    ];

    const drawBrandFrame = (t) => {
        ctx.fillStyle = '#02040a';
        ctx.fillRect(0, 0, width, height);

        const centerX = width * 0.5;
        const centerY = height * 0.5;
        const word = easeOut((t - 3.05) / 0.72);
        const compact = easeInOut((t - 2.78) / 0.72);
        const markW = lerp(278, 124, word);
        const markH = markW * icon.height / icon.width;
        const markX = centerX - word * 132;
        const markY = centerY - 14;

        const vignette = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, width * 0.74);
        vignette.addColorStop(0, '#081020');
        vignette.addColorStop(0.42, '#03070f');
        vignette.addColorStop(1, '#000000');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, width, height);

        const orbitFade = 1 - easeOut((t - 2.85) / 0.62);
        ctx.save();
        ctx.translate(markX, markY);
        ctx.scale(markW / 278, markW / 278);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ribbonCurves.forEach((curve, index) => {
            const appear = easeOut((t - 0.08 - index * 0.055) / 1.08);
            const settle = easeInOut((t - 0.9 - index * 0.035) / 1.8);
            const twist = (1 - settle) * 86;
            const shifted = curve.map((point, pointIndex) => ({
                x: point.x * lerp(1.38, 0.62, settle) + Math.sin(t * 2.3 + index * 0.8 + pointIndex) * twist,
                y: point.y * lerp(1.2, 0.55, settle) + Math.cos(t * 1.9 + index + pointIndex * 0.7) * twist * 0.54
            }));
            const head = appear;
            const tail = Math.max(0, head - lerp(0.22, 0.66, settle));
            const grad = ctx.createLinearGradient(shifted[0].x, shifted[0].y, shifted[3].x, shifted[3].y);
            const alpha = orbitFade * (0.34 + index * 0.018);
            grad.addColorStop(0, 'rgba(255, 255, 255, 0)');
            grad.addColorStop(0.3, 'rgba(86, 170, 255, ' + (alpha * 0.75) + ')');
            grad.addColorStop(0.52, 'rgba(255, 255, 255, ' + alpha + ')');
            grad.addColorStop(0.78, 'rgba(104, 220, 255, ' + (alpha * 0.72) + ')');
            grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.strokeStyle = grad;
            ctx.lineWidth = 1.8 + (index % 3) * 0.8;
            ctx.shadowColor = 'rgba(82, 168, 255, ' + (0.2 * orbitFade) + ')';
            ctx.shadowBlur = 8;
            drawSegment(ctx, shifted, tail, head);
        });
        ctx.restore();

        const trace = easeOut((t - 1.12) / 1.12) * (1 - compact * 0.72);
        if (trace > 0) {
            ctx.save();
            ctx.translate(markX, markY);
            ctx.globalAlpha = trace;
            ctx.shadowColor = 'rgba(105, 190, 255, 0.22)';
            ctx.shadowBlur = 10;
            ctx.drawImage(outline, -markW / 2, -markH / 2, markW, markH);
            ctx.restore();
        }

        const cleanLogo = easeOut((t - 2.22) / 0.58);
        ctx.save();
        ctx.translate(markX, markY);
        ctx.globalAlpha = cleanLogo;
        ctx.shadowColor = 'rgba(255, 255, 255, ' + (0.22 * (1 - compact)) + ')';
        ctx.shadowBlur = 18 * (1 - compact);
        ctx.drawImage(icon, -markW / 2, -markH / 2, markW, markH);
        ctx.restore();

        if (word > 0) {
            ctx.save();
            const textX = markX + markW * 0.5 + 34;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.globalAlpha = word;
            ctx.fillStyle = '#ffffff';
            ctx.font = '760 54px Segoe UI, Arial, sans-serif';
            ctx.fillText('METOP', textX, markY - 4);
            ctx.globalAlpha = word * 0.68;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
            ctx.font = '520 18px Microsoft YaHei, Segoe UI, sans-serif';
            ctx.fillText('元企业科技', textX + 2, markY + 42);
            ctx.restore();
        }
    };

    const stream = canvas.captureStream(0);
    const [track] = stream.getVideoTracks();
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm;codecs=vp8';
    const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 5200000
    });
    const chunks = [];
    recorder.ondataavailable = event => {
        if (event.data.size) chunks.push(event.data);
    };
    const finished = new Promise(resolve => {
        recorder.onstop = resolve;
    });

    recorder.start();
    const start = performance.now();
    for (let frame = 0; frame < Math.ceil(duration * fps); frame++) {
        drawBrandFrame(frame / fps);
        track.requestFrame();
        const target = start + frame * frameDuration;
        const delay = Math.max(0, target - performance.now());
        await new Promise(resolve => setTimeout(resolve, delay));
    }
    recorder.stop();
    await finished;
    stream.getTracks().forEach(videoTrack => videoTrack.stop());

    const blob = new Blob(chunks, { type: 'video/webm' });
    const dataUrl = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
    });
    return dataUrl;
})()
`;

await send('Runtime.enable');
const result = await send('Runtime.evaluate', {
    expression: recorderScript,
    awaitPromise: true,
    returnByValue: true,
    timeout: 30000
});

const dataUrl = result.result?.value;
if (!dataUrl || !dataUrl.startsWith('data:video/webm')) {
    throw new Error('Brand video generation did not return a WebM data URL.');
}

const base64 = dataUrl.substring(dataUrl.indexOf(',') + 1);
fs.writeFileSync(outputPath, Buffer.from(base64, 'base64'));
console.log(`Generated ${outputPath} (${fs.statSync(outputPath).size} bytes)`);

ws.close();
edge.kill();
await wait(500);
try {
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 250 });
} catch {
    // Edge can keep profile locks briefly after exit. The video has already been written.
}
