window.createAksaraJournalProof = function (config = {}) {
    const DEFAULT_MAX_GPS_ACCURACY = 40;
    const getMaxGpsAccuracy = async () => {
        const limit = Number(config.maxGpsAccuracy ?? window.aksaraJournalProofMaxGpsAccuracy ?? DEFAULT_MAX_GPS_ACCURACY);
        if (Number.isFinite(limit) && limit > 0) return limit;
        try {
            const response = await fetch(window.aksaraApiUrl('/api/v1/teacher/attendance/today'), {
                headers: { Accept: 'application/json', Authorization: `Bearer ${localStorage.getItem('token') || sessionStorage.getItem('token')}` },
            });
            const data = await response.json().catch(() => ({}));
            const serverLimit = Number(data?.gps_accuracy_limit_meters ?? data?.data?.gps_accuracy_limit_meters ?? DEFAULT_MAX_GPS_ACCURACY);
            return Number.isFinite(serverLimit) && serverLimit > 0 ? serverLimit : DEFAULT_MAX_GPS_ACCURACY;
        } catch {
            return DEFAULT_MAX_GPS_ACCURACY;
        }
    };

    async function startCamera(video) {
        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error('Browser tidak mendukung kamera. Buka aplikasi melalui HTTPS dan izinkan akses kamera.');
        }
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        video.srcObject = stream;
        await video.play();
        return stream;
    }

    function stopCamera(video) {
        video.srcObject?.getTracks().forEach((track) => track.stop());
        video.srcObject = null;
    }

    function capture(video) {
        if (!video.videoWidth || !video.videoHeight) return Promise.reject(new Error('Kamera belum siap. Coba beberapa detik lagi.'));
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight));
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        return new Promise((resolve, reject) => canvas.toBlob((blob) => {
            if (!blob) return reject(new Error('Foto gagal diambil. Silakan coba lagi.'));
            if (blob.size > 5 * 1024 * 1024) return reject(new Error('Ukuran foto melebihi 5 MB.'));
            resolve(blob);
        }, 'image/jpeg', 0.9));
    }

    async function findPreciseLocation(status) {
        if (!navigator.geolocation) return Promise.reject(new Error('Browser ini tidak menyediakan GPS.'));
        const maxGpsAccuracy = await getMaxGpsAccuracy();
        return new Promise((resolve, reject) => {
            let watchId;
            let timer;
            let settled = false;
            const finish = (callback, value) => {
                if (settled) return;
                settled = true;
                if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
                clearTimeout(timer);
                callback(value);
            };
            watchId = navigator.geolocation.watchPosition((position) => {
                const accuracy = Number(position.coords.accuracy);
                status.textContent = `Akurasi GPS ±${Math.ceil(accuracy)} meter; membutuhkan maksimal ${maxGpsAccuracy} meter.`;
                if (accuracy <= maxGpsAccuracy) finish(resolve, {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy,
                });
            }, (error) => {
                if (error.code === error.TIMEOUT) {
                    status.textContent = 'GPS masih mencari posisi. Tetap di area terbuka...';
                    return;
                }
                finish(reject, new Error(error.code === error.PERMISSION_DENIED
                    ? 'Izin lokasi ditolak. Aktifkan GPS dan izinkan lokasi untuk situs ini.'
                    : 'Lokasi GPS tidak tersedia. Periksa pengaturan lokasi perangkat.'));
            }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
            timer = setTimeout(() => finish(reject, new Error(`GPS belum mencapai akurasi ${maxGpsAccuracy} meter. Coba lagi di area terbuka.`)), 60000);
            status.textContent = 'Mencari lokasi GPS akurasi tinggi...';
        });
    }

    return { startCamera, stopCamera, capture, findPreciseLocation };
};
