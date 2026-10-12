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
                    numFaces: 1,
                    minFaceDetectionConfidence: 0.5,
                    minFacePresenceConfidence: 0.5,
                    minTrackingConfidence: 0.5,
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

    function getVisibleCrop(video, frame) {
        const width = video.videoWidth;
        const height = video.videoHeight;
        const frameRatio = frame.clientWidth && frame.clientHeight
            ? frame.clientWidth / frame.clientHeight
            : 9 / 16;
        const sourceRatio = width / height;
        let x = 0; let y = 0; let cropWidth = width; let cropHeight = height;
        if (sourceRatio > frameRatio) {
            cropWidth = height * frameRatio;
            x = (width - cropWidth) / 2;
        } else {
            cropHeight = width / frameRatio;
            y = (height - cropHeight) / 2;
        }
        return { x, y, width: cropWidth, height: cropHeight };
    }

    async function capture(video, guide, status, signal) {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Browser ini tidak mendukung kamera. Buka aplikasi melalui HTTPS dan izinkan akses kamera.');
        if (signal?.aborted) throw new DOMException('Pengambilan dibatalkan.', 'AbortError');
        let stream;
        let landmarker;
        try {
            status.textContent = 'Membuka kamera depan…';
            stream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: { facingMode: { ideal: 'user' }, width: { ideal: 720 }, height: { ideal: 1280 }, frameRate: { ideal: 24, max: 30 } },
            });
            if (signal?.aborted) throw new DOMException('Pengambilan dibatalkan.', 'AbortError');
            video.srcObject = stream;
            await video.play();
            status.textContent = 'Menyiapkan deteksi wajah…';
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

        let eyesOpened = false;
        let eyesClosed = false;
        let lastTimestamp = -1;
        let lastInference = 0;
        let cancelled = false;
        let frameId;
        let abortHandler;
        const frame = video.parentElement;

        const stop = () => {
            cancelled = true;
            cancelAnimationFrame(frameId);
            stream?.getTracks().forEach((track) => track.stop());
            video.srcObject = null;
        };

        return new Promise((resolve, reject) => {
            const takePhoto = () => {
                const crop = getVisibleCrop(video, frame);
                const scale = Math.min(1, 1600 / Math.max(crop.width, crop.height));
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(crop.width * scale);
                canvas.height = Math.round(crop.height * scale);
                canvas.getContext('2d').drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
                canvas.toBlob((blob) => {
                    if (!blob) { stop(); reject(new Error('Foto tidak berhasil dibuat. Coba ulangi pengambilan.')); return; }
                    if (blob.size > 5 * 1024 * 1024) { stop(); reject(new Error('Ukuran foto lebih dari 5 MB. Coba ulangi pengambilan.')); return; }
                    resolve({ photo: blob, livenessType: 'BLINK' });
                }, 'image/jpeg', 0.9);
            };

            const processFrame = () => {
                if (cancelled) { reject(new DOMException('Pengambilan dibatalkan.', 'AbortError')); return; }
                if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.currentTime === lastTimestamp
                    || performance.now() - lastInference < 80) {
                    frameId = requestAnimationFrame(processFrame);
                    return;
                }
                lastTimestamp = video.currentTime;
                lastInference = performance.now();

                try {
                    const result = landmarker.detectForVideo(video, lastInference);
                    const points = result.faceLandmarks?.[0];
                    if (!points) {
                        guide.classList.remove('is-ready');
                        eyesOpened = false;
                        eyesClosed = false;
                        status.textContent = 'Arahkan wajah ke dalam lingkaran.';
                        frameId = requestAnimationFrame(processFrame);
                        return;
                    }

                    // Cocokkan hitungan dengan area video yang benar-benar terlihat setelah object-fit: cover.
                    const crop = getVisibleCrop(video, frame);
                    const frameRect = frame.getBoundingClientRect();
                    const guideRect = guide.getBoundingClientRect();
                    const centerX = guideRect.left + guideRect.width / 2 - frameRect.left;
                    const centerY = guideRect.top + guideRect.height / 2 - frameRect.top;
                    const radius = Math.min(guideRect.width, guideRect.height) / 2 * 1.06;
                    const faceFitsGuide = points.every((point) => {
                        const x = (point.x * video.videoWidth - crop.x) / crop.width * frameRect.width;
                        const y = (point.y * video.videoHeight - crop.y) / crop.height * frameRect.height;
                        return Math.hypot(x - centerX, y - centerY) <= radius;
                    });

                    if (!faceFitsGuide) {
                        guide.classList.remove('is-ready');
                        eyesOpened = false;
                        eyesClosed = false;
                        status.textContent = 'Posisikan wajah di dalam lingkaran.';
                        frameId = requestAnimationFrame(processFrame);
                        return;
                    }

                    guide.classList.add('is-ready');
                    const left = eyeRatio(points, [33, 133], 159, 145, 158, 153);
                    const right = eyeRatio(points, [362, 263], 386, 374, 387, 373);
                    const ratio = (left + right) / 2;

                    if (ratio > 0.18) {
                        if (eyesClosed) {
                            status.textContent = 'Kedipan terdeteksi. Mengambil foto…';
                            takePhoto();
                            return;
                        }
                        eyesOpened = true;
                        status.textContent = 'Wajah pas. Kedipkan mata satu kali.';
                    } else if (eyesOpened) {
                        eyesClosed = true;
                        status.textContent = 'Kedipan terdeteksi. Buka mata…';
                    } else {
                        status.textContent = 'Arahkan wajah ke lingkaran, lalu kedipkan mata satu kali.';
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
