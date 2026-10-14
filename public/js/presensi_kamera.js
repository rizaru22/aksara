window.createAksaraAttendanceCapture = function () {
    // URL model MediaPipe dan root WebAssembly untuk deteksi wajah yang dipakai di flow liveness presensi.
    const tasksVisionUrl = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs';
    const wasmRoot = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm';
    const modelUrl = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
    let landmarkerPromise;

    // Membuat instance FaceLandmarker satu kali agar deteksi wajah tidak perlu di-load ulang setiap kali kamera dibuka.
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

    // Menghitung jarak Euclidean antara dua titik landmark untuk kebutuhan deteksi mata dan overlay face guide.
    const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

    // Menghitung rasio pembukaan mata berdasarkan jarak antar landmark mata dan ukuran wajah yang terdeteksi.
    function eyeRatio(points, corners, upper1, lower1, upper2, lower2) {
        return (distance(points[upper1], points[lower1]) + distance(points[upper2], points[lower2]))
            / (2 * distance(points[corners[0]], points[corners[1]]));
    }

    // Menentukan area crop yang paling terlihat dari video saat object-fit menggunakan cover agar landmark tetap konsisten.
   
    
    function getVisibleCrop(video, frame, zoom = 1) {
        const width = video.videoWidth;
        const height = video.videoHeight;

        const frameRatio =
            frame.clientWidth && frame.clientHeight
                ? frame.clientWidth / frame.clientHeight
                : 9 / 16;

        const sourceRatio = width / height;
        const safeZoom = Math.max(0.1, Number(zoom) || 1);

        let cropWidth;
        let cropHeight;

        if (safeZoom < 1) {
            // Zoom out: gunakan seluruh sumber video.
            cropWidth = width;
            cropHeight = height;
        } else {
            // Zoom normal/in: hitung crop sesuai rasio frame.
            cropWidth = width;
            cropHeight = height;

            if (sourceRatio > frameRatio) {
                cropWidth = height * frameRatio;
            } else {
                cropHeight = width / frameRatio;
            }

            cropWidth /= safeZoom;
            cropHeight /= safeZoom;
        }

        return {
            x: (width - cropWidth) / 2,
            y: (height - cropHeight) / 2,
            width: cropWidth,
            height: cropHeight,
        };
    }



    // Mengaktifkan alur pengambilan foto dengan liveness blink: buka kamera, deteksi wajah, tunggu kedipan mata, lalu ambil foto.
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
        let lowestClosedEyeRatio = 1;
        let lastTimestamp = -1;
        let lastInference = 0;
        let cancelled = false;
        let frameId;
        let abortHandler;
        const frame = video.parentElement;
        
        const previewCanvas = frame.querySelector('.attendance-camera-preview');
        const previewContext = previewCanvas?.getContext('2d');

        const renderPreview = () => {
            if (
                !previewCanvas ||
                !previewContext ||
                video.videoWidth === 0 ||
                video.videoHeight === 0
            ) {
                return;
            }

            const width = frame.clientWidth;
            const height = frame.clientHeight;

            if (!width || !height) return;

            // Sesuaikan resolusi canvas dengan ukuran frame.
            if (previewCanvas.width !== width || previewCanvas.height !== height) {
                previewCanvas.width = width;
                previewCanvas.height = height;
            }

            const crop = getVisibleCrop(video, frame, zoomConfig.value);

            // Pertahankan tampilan selfie seperti preview sebelumnya.
            previewContext.save();
            previewContext.clearRect(0, 0, width, height);
            previewContext.translate(width, 0);
            previewContext.scale(-1, 1);

            
            const scale = Math.max(
                width / crop.width,
                height / crop.height
            );

            const drawWidth = crop.width * scale;
            const drawHeight = crop.height * scale;

            const offsetX = (width - drawWidth) / 2;
            const offsetY = (height - drawHeight) / 2;

            previewContext.drawImage(
                video,
                crop.x,
                crop.y,
                crop.width,
                crop.height,
                offsetX,
                offsetY,
                drawWidth,
                drawHeight
            );

            previewContext.restore();
        };

        
        const zoomConfig = {
            min: 0.75,
            max: 1.5,
            step: 0.05,
            value: 1,
        };

        
        const cameraContainer = video.closest('.attendance-camera');
        const zoomControls = cameraContainer?.querySelector('.attendance-zoom-controls');

        const zoomSlider = zoomControls?.querySelector('#attendanceZoomLevel');
        const zoomOutButton = zoomControls?.querySelector('#attendanceZoomOut');
        const zoomInButton = zoomControls?.querySelector('#attendanceZoomIn');
        const zoomValueLabel = zoomControls?.querySelector('#attendanceZoomValue');


        const updateZoom = (value) => {
            zoomConfig.value = Math.min(
                zoomConfig.max,
                Math.max(zoomConfig.min, Number(value))
            );

            if (zoomSlider) {
                zoomSlider.value = String(zoomConfig.value);
            }

            if (zoomValueLabel) {
                zoomValueLabel.textContent =
                    `${zoomConfig.value.toFixed(2).replace('.', ',')}×`;
            }

            if (zoomOutButton) {
                zoomOutButton.disabled = zoomConfig.value <= zoomConfig.min;
            }

            if (zoomInButton) {
                zoomInButton.disabled = zoomConfig.value >= zoomConfig.max;
            }
        };

        updateZoom(zoomSlider?.value ?? 1);

        const onZoomSliderChange = () => updateZoom(zoomSlider.value);
        const onZoomOutClick = () =>
            updateZoom(zoomConfig.value - zoomConfig.step);
        const onZoomInClick = () =>
            updateZoom(zoomConfig.value + zoomConfig.step);

        zoomSlider?.addEventListener('input', onZoomSliderChange);
        zoomOutButton?.addEventListener('click', onZoomOutClick);
        zoomInButton?.addEventListener('click', onZoomInClick);


      
        const stop = () => {
            if (cancelled) return;

            cancelled = true;
            cancelAnimationFrame(frameId);
            stream?.getTracks().forEach((track) => track.stop());
            video.srcObject = null;

            zoomSlider?.removeEventListener('input', onZoomSliderChange);
            zoomOutButton?.removeEventListener('click', onZoomOutClick);
            zoomInButton?.removeEventListener('click', onZoomInClick);

            updateZoom(1);
        };


        return new Promise((resolve, reject) => {
            const takePhoto = () => {
                const crop = getVisibleCrop(video, frame, zoomConfig.value);
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
                    || performance.now() - lastInference < 50) {
                    frameId = requestAnimationFrame(processFrame);
                    return;
                }
                lastTimestamp = video.currentTime;
                lastInference = performance.now();

                try {
                    renderPreview();
                    const result = landmarker.detectForVideo(video, lastInference);
                    const points = result.faceLandmarks?.[0];
                    if (!points) {
                        guide.classList.remove('is-ready');
                        eyesOpened = false;
                        eyesClosed = false;
                        lowestClosedEyeRatio = 1;
                        status.textContent = 'Arahkan wajah ke dalam lingkaran.';
                        frameId = requestAnimationFrame(processFrame);
                        return;
                    }

                    // Cocokkan hitungan dengan area video yang benar-benar terlihat setelah object-fit: cover.
                    const crop = getVisibleCrop(video, frame,zoomConfig.value);
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
                        lowestClosedEyeRatio = 1;
                        status.textContent = 'Posisikan wajah di dalam lingkaran.';
                        frameId = requestAnimationFrame(processFrame);
                        return;
                    }

                    guide.classList.add('is-ready');
                    const left = eyeRatio(points, [33, 133], 159, 145, 158, 153);
                    const right = eyeRatio(points, [362, 263], 386, 374, 387, 373);
                    const ratio = (left + right) / 2;

                    if (eyesClosed) {
                        lowestClosedEyeRatio = Math.min(lowestClosedEyeRatio, ratio);
                        if (ratio > Math.max(0.14, lowestClosedEyeRatio + 0.015)) {
                            status.textContent = 'Kedipan terdeteksi. Mengambil foto…';
                            takePhoto();
                            return;
                        }
                        status.textContent = 'Kedipan terdeteksi. Buka mata…';
                    } else if (ratio > 0.18) {
                        eyesOpened = true;
                        status.textContent = 'Wajah pas. Kedipkan mata satu kali.';
                    } else if (ratio < 0.2 && eyesOpened) {
                        eyesClosed = true;
                        lowestClosedEyeRatio = ratio;
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
