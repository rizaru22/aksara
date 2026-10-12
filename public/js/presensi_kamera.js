window.createAksaraAttendanceCapture = function () {
    const tasksVisionUrl = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs';
    const wasmRoot = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm';
    const modelUrl = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
    let landmarkerPromise;

    async function getLandmarker() {
        if (!landmarkerPromise) {
            landmarkerPromise = (async () => {
                const { FilesetResolver, FaceLandmarker } = await import(tasksVisionUrl);
                const vision = await FilesetResolver.forVisionTasks(wasmRoot);
                return FaceLandmarker.createFromOptions(vision, {
                    baseOptions: { modelAssetPath: modelUrl, delegate: 'CPU' },
                    runningMode: 'VIDEO',
                    numFaces: 2,
                    minFaceDetectionConfidence: 0.55,
                    minFacePresenceConfidence: 0.55,
                    minTrackingConfidence: 0.6,
                });
            })().catch((error) => {
                landmarkerPromise = null;
                throw error;
            });
        }
        return landmarkerPromise;
    }

    const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

    function eyeRatio(points, corners, upper1, lower1, upper2, lower2) {
        return (distance(points[upper1], points[lower1]) + distance(points[upper2], points[lower2]))
            / (2 * distance(points[corners[0]], points[corners[1]]));
    }

    function inspectLight(video, box) {
        const canvas = document.createElement('canvas');
        canvas.width = 96;
        canvas.height = 96;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
        const x1 = Math.max(0, Math.floor(box.minX * canvas.width));
        const x2 = Math.min(canvas.width, Math.ceil(box.maxX * canvas.width));
        const y1 = Math.max(0, Math.floor(box.minY * canvas.height));
        const y2 = Math.min(canvas.height, Math.ceil(box.maxY * canvas.height));
        let faceTotal = 0; let faceCount = 0; let allTotal = 0; let allCount = 0;
        for (let y = 0; y < canvas.height; y += 3) {
            for (let x = 0; x < canvas.width; x += 3) {
                const offset = (y * canvas.width + x) * 4;
                const luminance = (data[offset] * 0.2126) + (data[offset + 1] * 0.7152) + (data[offset + 2] * 0.0722);
                allTotal += luminance; allCount++;
                if (x >= x1 && x <= x2 && y >= y1 && y <= y2) { faceTotal += luminance; faceCount++; }
            }
        }
        return { face: faceCount ? faceTotal / faceCount : 0, all: allCount ? allTotal / allCount : 0 };
    }

    async function capture(video, guide, status, signal) {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Browser ini tidak mendukung kamera. Buka aplikasi melalui HTTPS dan izinkan akses kamera.');
        if (signal?.aborted) throw new DOMException('Pengambilan dibatalkan.', 'AbortError');
        let stream;
        let landmarker;
        try {
            status.textContent = 'Meminta akses kamera depan…';
            stream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: { facingMode: { ideal: 'user' }, width: { ideal: 720 }, height: { ideal: 1280 }, frameRate: { ideal: 24, max: 30 } },
            });
            if (signal?.aborted) throw new DOMException('Pengambilan dibatalkan.', 'AbortError');
            video.srcObject = stream;
            await video.play();
            status.textContent = 'Memuat pendeteksi wajah di perangkat…';
            landmarker = await getLandmarker();
            if (signal?.aborted) throw new DOMException('Pengambilan dibatalkan.', 'AbortError');
        } catch (error) {
            stream?.getTracks().forEach((track) => track.stop());
            if (error.name === 'NotAllowedError') throw new Error('Akses kamera ditolak. Izinkan kamera pada pengaturan browser lalu coba kembali.');
            if (error.name === 'NotFoundError') throw new Error('Kamera depan tidak ditemukan pada perangkat ini.');
            if (error.name === 'NotReadableError') throw new Error('Kamera sedang digunakan aplikasi lain. Tutup aplikasi kamera lain lalu coba lagi.');
            if (error.name === 'AbortError') throw error;
            throw new Error(`Kamera atau pendeteksi wajah tidak dapat dijalankan: ${error.message || error}`);
        }

        const challenge = 'BLINK';
        let blinkOpened = false;
        let blinkClosedFrames = 0;
        let challengePassed = false;
        let clearFrames = 0;
        let lastTimestamp = -1;
        let lastInference = 0;
        let lastLightCheck = 0;
        let lightingGood = false;
        let cancelled = false;
        let frameId;
        let abortHandler;

        const stop = () => {
            cancelled = true;
            cancelAnimationFrame(frameId);
            stream?.getTracks().forEach((track) => track.stop());
            video.srcObject = null;
        };

        return new Promise((resolve, reject) => {
            const takePhoto = () => {
                const canvas = document.createElement('canvas');
                const sourceWidth = video.videoWidth;
                const sourceHeight = video.videoHeight;
                const targetRatio = 9 / 16;
                const sourceRatio = sourceWidth / sourceHeight;
                let cropX = 0; let cropY = 0; let cropWidth = sourceWidth; let cropHeight = sourceHeight;
                if (sourceRatio > targetRatio) {
                    cropWidth = sourceHeight * targetRatio;
                    cropX = (sourceWidth - cropWidth) / 2;
                } else {
                    cropHeight = sourceWidth / targetRatio;
                    cropY = (sourceHeight - cropHeight) / 2;
                }
                const scale = Math.min(1, 1600 / Math.max(cropWidth, cropHeight));
                canvas.width = Math.round(cropWidth * scale);
                canvas.height = Math.round(cropHeight * scale);
                canvas.getContext('2d').drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
                canvas.toBlob((blob) => {
                    if (!blob) { stop(); reject(new Error('Foto tidak berhasil dibuat. Coba ulangi pengambilan.')); return; }
                    if (blob.size > 5 * 1024 * 1024) { stop(); reject(new Error('Ukuran foto lebih dari 5 MB. Dekatkan wajah dan coba ulangi.')); return; }
                    resolve({ photo: blob, livenessType: challenge });
                }, 'image/jpeg', 0.94);
            };

            const processFrame = () => {
                if (cancelled) { reject(new DOMException('Pengambilan dibatalkan.', 'AbortError')); return; }
                if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.currentTime === lastTimestamp) {
                    frameId = requestAnimationFrame(processFrame);
                    return;
                }
                if (performance.now() - lastInference < 120) {
                    frameId = requestAnimationFrame(processFrame);
                    return;
                }
                lastTimestamp = video.currentTime;
                lastInference = performance.now();
                try {
                    const result = landmarker.detectForVideo(video, performance.now());
                    const faces = result.faceLandmarks || [];
                    if (faces.length !== 1) {
                        guide.classList.remove('is-ready');
                        clearFrames = 0;
                        status.textContent = faces.length > 1 ? 'Pastikan hanya wajah Anda yang terlihat.' : 'Posisikan satu wajah di dalam lingkaran.';
                        frameId = requestAnimationFrame(processFrame);
                        return;
                    }
                    const points = faces[0];
                    const rawXs = points.map((point) => point.x);
                    const rawYs = points.map((point) => point.y);
                    const rawBox = { minX: Math.min(...rawXs), maxX: Math.max(...rawXs), minY: Math.min(...rawYs), maxY: Math.max(...rawYs) };
                    const sourceRatio = video.videoWidth / video.videoHeight;
                    const targetRatio = 9 / 16;
                    const visibleWidth = sourceRatio > targetRatio ? targetRatio / sourceRatio : 1;
                    const visibleHeight = sourceRatio < targetRatio ? sourceRatio / targetRatio : 1;
                    const offsetX = (1 - visibleWidth) / 2;
                    const offsetY = (1 - visibleHeight) / 2;
                    const xs = points.map((point) => (point.x - offsetX) / visibleWidth);
                    const ys = points.map((point) => (point.y - offsetY) / visibleHeight);
                    const box = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
                    const width = box.maxX - box.minX;
                    const height = box.maxY - box.minY;
                    const centerX = (box.minX + box.maxX) / 2;
                    const centerY = (box.minY + box.maxY) / 2;
                    const corners = [[box.minX, box.minY], [box.minX, box.maxY], [box.maxX, box.minY], [box.maxX, box.maxY]];
                    const fitsCircle = Math.max(...corners.map(([x, y]) => Math.hypot(x - 0.5, y - 0.5))) <= 0.4;
                    const aligned = fitsCircle && centerX > 0.27 && centerX < 0.73 && centerY > 0.23 && centerY < 0.77 && width > 0.18 && width < 0.76 && height > 0.18 && height < 0.8;
                    if (!aligned) {
                        guide.classList.remove('is-ready');
                        clearFrames = 0;
                        status.textContent = 'Atur jarak dan posisikan seluruh wajah di dalam lingkaran.';
                        frameId = requestAnimationFrame(processFrame);
                        return;
                    }
                    guide.classList.add('is-ready');

                    if (performance.now() - lastLightCheck > 350) {
                        const light = inspectLight(video, rawBox);
                        lightingGood = light.face >= 70 && !(light.all > 175 && light.face < 112 && light.all - light.face > 55);
                        lastLightCheck = performance.now();
                    }
                    if (!lightingGood) {
                        clearFrames = 0;
                        status.textContent = 'Wajah terlalu gelap atau ada backlight. Hadap sumber cahaya dan jangan membelakangi jendela.';
                        frameId = requestAnimationFrame(processFrame);
                        return;
                    }

                    if (!challengePassed) {
                        const left = eyeRatio(points, [33, 133], 159, 145, 158, 153);
                        const right = eyeRatio(points, [362, 263], 386, 374, 387, 373);
                        const ratio = (left + right) / 2;
                        if (ratio > 0.18) blinkOpened = true;
                        if (blinkOpened && ratio < 0.18) blinkClosedFrames++;
                        else blinkClosedFrames = 0;
                        if (blinkClosedFrames >= 2) challengePassed = true;
                        status.textContent = challengePassed ? 'Kedipan terdeteksi. Tahan wajah sebentar…' : 'Kedipkan mata satu kali.';
                    } else {
                        clearFrames++;
                        status.textContent = clearFrames >= 8 ? 'Liveness berhasil. Mengambil foto…' : 'Liveness terdeteksi. Tahan wajah tetap di dalam lingkaran…';
                    }

                    if (challengePassed && clearFrames >= 8) {
                        takePhoto();
                        return;
                    }
                } catch (error) {
                    reject(error);
                    return;
                }
                frameId = requestAnimationFrame(processFrame);
            };

            abortHandler = () => { stop(); reject(new DOMException('Pengambilan dibatalkan.', 'AbortError')); };
            signal?.addEventListener('abort', abortHandler, { once: true });
            frameId = requestAnimationFrame(processFrame);
        }).finally(() => {
            stop();
            if (abortHandler) signal?.removeEventListener('abort', abortHandler);
        });
    }

    return { capture };
};
