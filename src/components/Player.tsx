'use client';
import { useRef, useEffect, useMemo, useState } from 'react';
import { useStore } from '@/store/useStore';
import { generateTimeline } from '@/utils/auto-editor';
import { Play, Pause, SkipBack, SkipForward } from 'lucide-react';

// Formatting utility
function formatTime(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function Player() {
    const { videos, audio, currentTime, setCurrentTime, setStatus, syncSettings, isPlaying, setIsPlaying } = useStore();

    const audioRef = useRef<HTMLAudioElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);



    // Memoize timeline logic
    const timeline = useMemo(() => audio ? generateTimeline(videos, audio, syncSettings) : [], [videos, audio, syncSettings]);

    // Manage Video Object URLs
    const [videoUrls, setVideoUrls] = useState<Record<string, string>>({});

    useEffect(() => {
        const newUrls: Record<string, string> = { ...videoUrls };
        let changed = false;
        videos.forEach(v => {
            if (!newUrls[v.id]) {
                newUrls[v.id] = URL.createObjectURL(v.file);
                changed = true;
            }
        });

        if (changed) {
            setVideoUrls(newUrls);
        }

        // Potential cleanup if needed:
        // return () => Object.values(newUrls).forEach(URL.revokeObjectURL);
    }, [videos]);

    // Audio Source setup
    useEffect(() => {
        if (audio?.file && audioRef.current) {
            const url = URL.createObjectURL(audio.file);
            audioRef.current.src = url;
            return () => URL.revokeObjectURL(url);
        }
    }, [audio?.id, audio?.file]);

    // Sync Loop (RAF)
    useEffect(() => {
        let animationFrame: number = 0;

        const tick = () => {
            if (audioRef.current && isPlaying) {
                const time = audioRef.current.currentTime;
                if (Math.abs(time - currentTime) > 0.05) {
                    // Throttle updates slightly to avoid react render thrashing? 
                    // Zustand is fast.
                    setCurrentTime(time);
                }

                if (time >= (audioRef.current.duration || 0) && !audioRef.current.paused) {
                    if (audioRef.current.ended) {
                        setIsPlaying(false);
                    }
                }
            }
            animationFrame = requestAnimationFrame(tick);
        };

        if (isPlaying) {
            audioRef.current?.play().catch(e => console.error("Audio play failed", e));
            tick();
        } else {
            audioRef.current?.pause();
            cancelAnimationFrame(animationFrame);
        }

        return () => cancelAnimationFrame(animationFrame);
    }, [isPlaying, setCurrentTime]);

    // Video Sync Logic
    useEffect(() => {
        if (!videoRef.current || timeline.length === 0) return;

        const activeClip = timeline.find(c => currentTime >= c.timelineStart && currentTime < c.timelineEnd);

        if (activeClip) {
            const url = videoUrls[activeClip.videoId];

            // 1. Check if we need to swap source
            // Comparing src directly might be full absolute path vs blob, so strictly check
            if (videoRef.current.getAttribute('data-id') !== activeClip.videoId) {
                videoRef.current.src = url;
                videoRef.current.setAttribute('data-id', activeClip.videoId);
                // Ensure we don't flash
            }

            // 2. Sync Time
            const offset = currentTime - activeClip.timelineStart;
            const targetTime = activeClip.sourceStart + offset;

            // Only seek if drift is significant (> 1 frame roughly)
            if (Math.abs(videoRef.current.currentTime - targetTime) > 0.1) {
                videoRef.current.currentTime = targetTime;
            }

            // 3. Play/Pause video element
            if (isPlaying && videoRef.current.paused) {
                videoRef.current.play().catch(() => { });
            } else if (!isPlaying && !videoRef.current.paused) {
                videoRef.current.pause();
            }

            // Playback rate sync? Usually 1.0
        } else {
            // Should not happen if timeline covers all, but valid check
            if (!videoRef.current.paused) videoRef.current.pause();
        }
    }, [currentTime, timeline, isPlaying, videoUrls]);

    // External Seek Handling (User clicked timeline)
    useEffect(() => {
        if (audioRef.current) {
            if (Math.abs(audioRef.current.currentTime - currentTime) > 0.5) {
                audioRef.current.currentTime = currentTime;
            }
        }
    }, [currentTime]);

    const togglePlay = () => {
        setIsPlaying(!isPlaying);
    };

    if (!audio) return null;

    return (
        <div className="bg-black rounded-xl overflow-hidden shadow-2xl shadow-primary/10 border border-gray-800 flex flex-col items-center max-w-4xl mx-auto w-full">
            <div className="aspect-video w-full relative bg-black flex items-center justify-center group">
                <video
                    ref={videoRef}
                    className="w-full h-full object-contain"
                    muted
                    playsInline
                />

                <div
                    className={`absolute inset-0 flex items-center justify-center bg-black/40 transition-opacity cursor-pointer ${isPlaying ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'}`}
                    onClick={togglePlay}
                >
                    {isPlaying ? (
                        <Pause className="w-16 h-16 text-white drop-shadow-lg" />
                    ) : (
                        <Play className="w-16 h-16 text-white drop-shadow-lg" />
                    )}
                </div>
            </div>

            <div className="w-full bg-surface p-4 flex items-center justify-between gap-6 border-t border-gray-800">
                <div className="flex items-center gap-4">
                    <button onClick={() => { setCurrentTime(0); }} className="p-2 hover:text-primary transition-colors" aria-label="Skip Back">
                        <SkipBack className="w-5 h-5" />
                    </button>

                    <button onClick={togglePlay} className="p-3 bg-primary text-black rounded-full hover:bg-primary/80 transition-all neon-box" aria-label={isPlaying ? "Pause" : "Play"}>
                        {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
                    </button>

                    <button className="p-2 hover:text-primary transition-colors" aria-label="Skip Forward">
                        <SkipForward className="w-5 h-5" />
                    </button>
                </div>

                <div className="text-mono text-xl neon-text font-bold">
                    {formatTime(currentTime)}
                </div>
            </div>

            <audio ref={audioRef} />
        </div>
    );
}
