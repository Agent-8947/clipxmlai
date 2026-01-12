export const getVideoMetadata = async (file: File): Promise<{ duration: number, thumbnail: string }> => {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        const url = URL.createObjectURL(file);
        video.src = url;
        video.muted = true;
        video.playsInline = true;

        // Timeout to prevent hanging
        const timeout = setTimeout(() => {
            URL.revokeObjectURL(url);
            resolve({ duration: 0, thumbnail: '' });
        }, 5000);

        video.onloadeddata = () => {
            // Ready to seek
            video.currentTime = Math.min(1, video.duration / 5);
        };

        video.onseeked = () => {
            clearTimeout(timeout);
            const canvas = document.createElement('canvas');
            // 16:9 aspect ratio
            canvas.width = 320;
            canvas.height = 180;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const thumbnail = canvas.toDataURL('image/jpeg', 0.7);
                URL.revokeObjectURL(url);
                resolve({ duration: video.duration, thumbnail });
            } else {
                URL.revokeObjectURL(url);
                resolve({ duration: video.duration, thumbnail: '' });
            }
        };

        video.onerror = () => {
            clearTimeout(timeout);
            URL.revokeObjectURL(url);
            resolve({ duration: 0, thumbnail: '' });
        };
    });
};
