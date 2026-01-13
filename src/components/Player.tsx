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
    const { media, audio, currentTime, setCurrentTime, syncSettings, isPlaying, setIsPlaying } = useStore();

    const audioRef = useRef<HTMLAudioElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);

    // Memoize timeline logic
    const timeline = useMemo(() => audio ? generateTimeline(media, audio, syncSettings) : [], [media, audio, syncSettings]);

    // Manage Media Object URLs
    const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});

    useEffect(() => {
        const newUrls: Record<string, string> = { ...mediaUrls };
        let changed = false;
        media.forEach(v => {
            if (!newUrls[v.id]) {
                newUrls[v.id] = URL.createObjectURL(v.file);
                changed = true;
            }
        });

        if (changed) {
            setMediaUrls(newUrls);
        }

        // Potential cleanup if needed:
        // return () => Object.values(newUrls).forEach(URL.revokeObjectURL);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [media]);

    // Audio Source setup
    useEffect(() => {
        if (audio?.file && audioRef.current) {
            const url = URL.createObjectURL(audio.file);
            audioRef.current.src = url;
            return () => URL.revokeObjectURL(url);
        }
    }, [audio?.id, audio?.file]);

    // Effect: Handle Play/Pause Command
    useEffect(() => {
        const audioEl = audioRef.current;
        if (!audioEl) return;

        if (isPlaying) {
            const playPromise = audioEl.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    console.warn("Playback prevented/interrupted:", error);
                });
            }
        } else {
            audioEl.pause();
        }
    }, [isPlaying, audio?.id]); // Re-run if playing state changes or audio file changes

    // Effect: Sync Loop (RAF) - Update Store Time from Audio
    // Use a ref to track last dispatched time to avoid dependency cycles and stale closures
    const lastDispatchedTimeRef = useRef(currentTime);

    useEffect(() => {
        if (!isPlaying) return;

        let animationFrame: number = 0;
        const tick = () => {
            if (audioRef.current) {
                const time = audioRef.current.currentTime;
                // Only update store if difference is significant to avoid thrashing
                if (Math.abs(time - lastDispatchedTimeRef.current) > 0.05) {
                    setCurrentTime(time);
                    lastDispatchedTimeRef.current = time;
                }

                if (audioRef.current.ended) {
                    setIsPlaying(false);
                }
            }
            animationFrame = requestAnimationFrame(tick);
        };

        tick();

        return () => cancelAnimationFrame(animationFrame);
    }, [isPlaying, setCurrentTime, setIsPlaying]);

    // Effect: Sync Audio Time from Store (Scrubbing/Seeking)
    // Only seek audio if store time changes significantly AND it wasn't just updated by the loop (check vs lastDispatchedTimeRef)
    useEffect(() => {
        if (audioRef.current) {
            const diff = Math.abs(audioRef.current.currentTime - currentTime);
            // If playing, we expect small diffs (lag), ignore them.
            // If paused, we want precise sync.
            const tolerance = isPlaying ? 0.25 : 0.05;

            if (diff > tolerance) {
                // Check if this change came from our own loop to avoid fighting
                // If currentTime matches lastDispatchedTimeRef, it likely came from the loop.
                if (Math.abs(currentTime - lastDispatchedTimeRef.current) > 0.001) {
                    audioRef.current.currentTime = currentTime;
                    lastDispatchedTimeRef.current = currentTime;
                }
            }
        }
        // Always update ref to current time to keep in sync
        if (!isPlaying) {
            lastDispatchedTimeRef.current = currentTime;
        }
    }, [currentTime, isPlaying]);

    // Derived State for Render
    const activeClip = useMemo(() => {
        if (timeline.length === 0) return null;
        return timeline.find(c => currentTime >= c.timelineStart && currentTime < c.timelineEnd);
    }, [currentTime, timeline]);

    const activeClipType = activeClip?.type || null;
    const activeImgSrc = (activeClip && activeClip.type === 'image') ? mediaUrls[activeClip.videoId] : null;

    // Effect: Sync Video Element only
    useEffect(() => {
        const videoEl = videoRef.current;
        if (!videoEl) return;

        if (activeClip && activeClip.type === 'video') {
            const url = mediaUrls[activeClip.videoId];

            // 1. Check if we need to swap source
            if (videoEl.getAttribute('data-id') !== activeClip.videoId) {
                videoEl.src = url || '';
                videoEl.setAttribute('data-id', activeClip.videoId);
            }

            // 2. Sync Time
            const offset = currentTime - activeClip.timelineStart;
            const targetTime = activeClip.sourceStart + offset;

            if (Math.abs(videoEl.currentTime - targetTime) > 0.1) {
                videoEl.currentTime = targetTime;
            }

            // 3. Play/Pause
            if (isPlaying && videoEl.paused) {
                videoEl.play().catch(() => { });
            } else if (!isPlaying && !videoEl.paused) {
                videoEl.pause();
            }
        } else {
            // Not a video clip or no clip
            if (!videoEl.paused) videoEl.pause();
        }
    }, [currentTime, activeClip, isPlaying, mediaUrls]);

    const togglePlay = () => {
        setIsPlaying(!isPlaying);
    };

    if (!audio) return null;

    return (
        <div className="bg-black rounded-xl overflow-hidden shadow-2xl shadow-primary/10 border border-gray-800 flex flex-col items-center max-w-4xl mx-auto w-full">
            <div className="aspect-video w-full relative bg-black flex items-center justify-center group text-white">
                {/* Video Element */}
                <video
                    ref={videoRef}
                    className={`w-full h-full object-contain ${activeClipType === 'video' ? 'block' : 'hidden'}`}
                    muted
                    playsInline
                />

                {/* Image Element */}
                {activeClipType === 'image' && activeImgSrc && (
                    <img
                        src={activeImgSrc}
                        alt="Current Frame"
                        className="w-full h-full object-contain animate-in fade-in duration-300"
                    />
                )}

                {!activeClipType && <div className="text-muted text-sm">No Signal</div>}

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
