'use client';

import React, { useMemo, useRef, useEffect, useState } from 'react';
import { useStore } from '@/store/useStore';
import { generateTimeline } from '@/utils/auto-editor';
import { clsx } from 'clsx';
import { Play, Pause, SkipBack, ZoomIn, ZoomOut } from 'lucide-react';
import RhythmTrack from './RhythmTrack';

export default function Timeline() {
    const { media, audio, currentTime, setCurrentTime, syncSettings, isPlaying, setIsPlaying } = useStore();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);


    const [zoom, setZoom] = useState(1);
    const [showGrid, setShowGrid] = useState(false);

    // Anchor zoom to playhead (Keep playhead centered when zooming)
    const prevZoomRef = useRef(zoom);
    React.useLayoutEffect(() => {
        if (Math.abs(prevZoomRef.current - zoom) > 0.001) {
            if (scrollContainerRef.current && audio?.duration) {
                const container = scrollContainerRef.current;
                const viewWidth = container.clientWidth;
                // Calculate position relative to the playhead
                const playHeadPct = currentTime / (audio.duration || 1);

                // New total width approx (since zoom is relative to viewWidth)
                const totalWidth = viewWidth * zoom;
                const centerPos = totalWidth * playHeadPct;

                // Center the playhead
                container.scrollLeft = centerPos - (viewWidth / 2);
            }
            prevZoomRef.current = zoom;
        }
    }, [zoom, currentTime, audio?.duration]);

    const handleZoomIn = () => setZoom(prev => Math.min(prev * 1.2, 50));
    const handleZoomOut = () => setZoom(prev => Math.max(prev / 1.2, 1));

    const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            // Smoother, finer control
            const delta = e.deltaY * -0.002;
            setZoom(prev => {
                const next = prev + delta;
                return Math.min(Math.max(next, 1), 50);
            });
        }
    };

    const [isDragging, setIsDragging] = useState(false);

    // Generate timeline data
    const timelineClips = useMemo(() => {
        if (!audio || media.length === 0) return [];
        return generateTimeline(media, audio, syncSettings);
    }, [media, audio, syncSettings]);

    // --- Audio Playback & Sync ---

    // Force re-render of audio element when file changes to ensure clean state
    const audioKey = audio?.id || 'no-audio';

    // Effect: Handle Play/Pause
    useEffect(() => {
        const el = audioRef.current;
        if (!el) return;

        if (isPlaying) {
            const playPromise = el.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    console.warn("Playback prevented:", error);
                });
            }
        } else {
            el.pause();
        }
    }, [isPlaying, audioKey]);

    const handleAudioEnded = () => {
        setIsPlaying(false);
    };

    // Reset state when audio file changes
    useEffect(() => {
        if (audio?.id) {
            setCurrentTime(0);
            setIsPlaying(false);
        }
    }, [audio?.id, setCurrentTime, setIsPlaying]);

    // Initialize audio source when mounting (controlled by key)
    useEffect(() => {
        const el = audioRef.current;
        if (el && audio?.file) {
            const url = URL.createObjectURL(audio.file);
            el.src = url;
            el.load();
            return () => {
                URL.revokeObjectURL(url);
            };
        }
    }, [audio?.file]);

    useEffect(() => {
        if (!isPlaying || !audioRef.current) return;

        let frameId: number;
        const tick = () => {
            if (audioRef.current) {
                setCurrentTime(audioRef.current.currentTime);
                if (audioRef.current.ended) {
                    setIsPlaying(false);
                } else {
                    frameId = requestAnimationFrame(tick);
                }
            }
        };

        frameId = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frameId);
    }, [isPlaying, setCurrentTime, setIsPlaying]);

    // Sync audio if user seeks via store
    useEffect(() => {
        const el = audioRef.current;
        if (!el) return;

        const diff = Math.abs(el.currentTime - currentTime);
        const tolerance = isPlaying ? 0.2 : 0.05;

        if (diff > tolerance) {
            el.currentTime = currentTime;
        }
    }, [currentTime, isPlaying]);

    const togglePlay = () => {
        setIsPlaying(!isPlaying);
    };

    // Auto-Scroll Logic
    const [autoScroll, setAutoScroll] = useState(true);

    useEffect(() => {
        if (!autoScroll || !isPlaying || !scrollContainerRef.current || !audio?.duration) return;

        const container = scrollContainerRef.current;
        const totalWidth = container.scrollWidth;
        const viewWidth = container.clientWidth;

        const playHeadPct = currentTime / audio.duration;
        const playHeadPos = totalWidth * playHeadPct;

        // Keep playhead centered (offset by half view width)
        const targetScroll = playHeadPos - (viewWidth / 2);

        // Apply scroll (don't smooth scroll during playback as it causes lag/jitters)
        container.scrollLeft = targetScroll;

    }, [currentTime, isPlaying, audio?.duration, autoScroll, zoom]);

    // --- Visualization ---
    useEffect(() => {
        if (!audio?.buffer || !canvasRef.current || !containerRef.current) return;

        const canvas = canvasRef.current;
        const container = containerRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const draw = () => {
            const dpr = window.devicePixelRatio || 1;
            const width = container.clientWidth;
            const height = container.clientHeight;

            canvas.width = width * dpr;
            canvas.height = height * dpr;
            ctx.scale(dpr, dpr);
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;

            const buffer = audio.buffer;
            if (!buffer) return;

            const data = buffer.getChannelData(0);
            const step = Math.ceil(data.length / width);
            const amp = height * 0.8;

            ctx.clearRect(0, 0, width, height);

            ctx.beginPath();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.moveTo(0, height / 2);
            ctx.lineTo(width, height / 2);
            ctx.stroke();

            const gradient = ctx.createLinearGradient(0, 0, 0, height);
            gradient.addColorStop(0, 'rgba(56, 189, 248, 0.2)');
            gradient.addColorStop(0.5, 'rgba(56, 189, 248, 0.9)');
            gradient.addColorStop(1, 'rgba(56, 189, 248, 0.2)');

            ctx.fillStyle = gradient;
            ctx.beginPath();

            for (let i = 0; i < width; i++) {
                let min = 1.0;
                let max = -1.0;
                for (let j = 0; j < step; j++) {
                    const datum = data[(i * step) + j];
                    if (datum < min) min = datum;
                    if (datum > max) max = datum;
                }
                const yMin = (height / 2) + (min * amp * 0.5);
                const yMax = (height / 2) + (max * amp * 0.5);
                ctx.fillRect(i, yMin, 1, Math.max(1, yMax - yMin));
            }
        };

        draw();

        const observer = new ResizeObserver(draw);
        if (container) {
            observer.observe(container);
        }

        return () => observer.disconnect();

    }, [audio?.buffer, zoom]);

    // Interaction Handlers (Attached to Inner Container)
    const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!audio?.duration) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percent = Math.min(Math.max(x / rect.width, 0), 1);
        setCurrentTime(percent * audio.duration);
    };
    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (isDragging) handleSeek(e);
    };

    if (!audio) return null;

    const totalDuration = audio.duration || 1;

    return (
        <div className="flex flex-col h-full bg-[#1e1e1e] rounded-lg border border-[#333] select-none text-[#ccc] font-sans text-xs">

            {/* 1. Header & Controls */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-[#333] shrink-0 bg-[#252526]">
                <div className="flex items-center gap-3">
                    <button
                        onClick={togglePlay}
                        title={isPlaying ? "Pause" : "Play"}
                        aria-label={isPlaying ? "Pause" : "Play"}
                        className="w-8 h-8 rounded-full bg-primary text-black flex items-center justify-center hover:bg-primary/90 transition-all"
                    >
                        {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                    </button>
                    <button onClick={() => setCurrentTime(0)} title="Rewind to Start" className="text-[#aaa] hover:text-white transition-colors">
                        <SkipBack className="w-5 h-5" />
                    </button>

                    {/* Zoom Controls */}
                    <div className="flex items-center gap-1 ml-4 border-l border-[#444] pl-4">
                        <button onClick={handleZoomOut} title="Zoom Out" className="p-1.5 text-[#aaa] hover:text-white hover:bg-[#333] rounded">
                            <ZoomOut className="w-4 h-4" />
                        </button>
                        <span className="w-8 text-center text-[10px] text-[#888]">{Math.round(zoom * 100)}%</span>
                        <button onClick={handleZoomIn} title="Zoom In" className="p-1.5 text-[#aaa] hover:text-white hover:bg-[#333] rounded">
                            <ZoomIn className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Grid Toggle */}
                    <button
                        onClick={() => setShowGrid(prev => !prev)}
                        title={showGrid ? "Hide Beat Grid" : "Show Beat Grid"}
                        className={`ml-2 px-2 py-1 text-[10px] rounded border transition-all ${showGrid ? 'bg-primary/20 border-primary text-primary' : 'bg-transparent border-[#444] text-[#666]'}`}
                    >
                        Grid {showGrid ? 'ON' : 'OFF'}
                    </button>

                    {/* Auto-Scroll Toggle */}
                    <button
                        onClick={() => setAutoScroll(prev => !prev)}
                        title={autoScroll ? "Disable Auto-Follow" : "Enable Auto-Follow"}
                        className={`ml-2 px-2 py-1 text-[10px] rounded border transition-all ${autoScroll ? 'bg-primary/20 border-primary text-primary' : 'bg-transparent border-[#444] text-[#666]'}`}
                    >
                        Follow {autoScroll ? 'ON' : 'OFF'}
                    </button>
                </div>
                <div className="font-mono text-lg text-blue-400">
                    {formatTime(currentTime)}
                </div>
            </div>

            {/* 2. Scrollable Timeline Area */}
            <div
                ref={scrollContainerRef}
                className="relative flex-1 w-full overflow-x-auto overflow-y-hidden custom-scrollbar bg-[#1e1e1e]"
                onWheel={handleWheel}
            >
                {/* 3. Zoomable Inner Container */}
                <div
                    className="relative h-full min-w-full cursor-crosshair group"
                    style={{ width: `${zoom * 100}%` }}
                    onMouseDown={(e) => { setIsDragging(true); handleSeek(e); }}
                    onMouseUp={() => setIsDragging(false)}
                    onMouseLeave={() => setIsDragging(false)}
                    onMouseMove={handleMouseMove}
                >
                    {/* Time Ruler */}
                    <div className="h-6 bg-[#252526] border-b border-[#333] flex items-end pb-1 px-2 text-[10px] text-[#888] font-mono pointer-events-none sticky top-0 z-20">
                        <div className="flex justify-between w-full">
                            <span>00:00</span>
                            {/* Intermediate markers could be added here based on zoom */}
                            <span>{formatTime(totalDuration / 2)}</span>
                            <span>{formatTime(totalDuration)}</span>
                        </div>
                    </div>

                    {/* Content Area */}
                    <div className="relative h-[calc(100%-24px)] w-full">

                        {/* A. Video Tracks Area */}
                        <div className="absolute top-2 left-0 right-0 h-[80px]">
                            <div className="relative w-full h-full">
                                {timelineClips.map((clip, idx) => (
                                    <div
                                        key={clip.id}
                                        className={clsx(
                                            "absolute top-0 bottom-0 border border-black/20 overflow-hidden flex items-center px-2",
                                            "shadow-sm transition-opacity hover:opacity-90",
                                            // Specific Premiere-like colors
                                            clip.type === 'image' ? "bg-purple-400" : // Image = Purple
                                                idx % 3 === 0 ? "bg-[#6d9eeb]" :     // Blue
                                                    idx % 3 === 1 ? "bg-[#e06666]" :     // Red/Pink
                                                        "bg-[#ffd966]"                       // Yellow
                                        )}
                                        style={{
                                            left: `${(clip.timelineStart / totalDuration) * 100}%`,
                                            width: `${(clip.duration / totalDuration) * 100}%`
                                        }}
                                    >
                                        <div className="text-black font-bold text-sm truncate leading-tight">
                                            {clip.type === 'image' ? `IMG ${clip.videoIndex}` : `V${clip.videoIndex}`}
                                        </div>
                                        <span className="absolute bottom-1 right-1 text-[9px] text-black/60 font-mono font-bold">
                                            {clip.duration.toFixed(1)}s
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* B. Audio Track Area */}
                        <div className="absolute top-[90px] left-0 right-0 h-[60px] bg-[#2d3a40] border-t border-b border-[#3a4b53]">
                            <div ref={containerRef} className="w-full h-full opacity-80">
                                <canvas ref={canvasRef} className="w-full h-full" />
                            </div>
                            <div className="absolute top-1 left-2 text-[10px] text-[#4db8ff] font-medium bg-black/40 px-1 rounded">
                                Audio Track 1
                            </div>
                        </div>

                        {/* C. Rhythm Track Area */}
                        <div className="absolute top-[150px] left-0 right-0 h-[40px] z-10">
                            <RhythmTrack zoom={zoom} />
                        </div>

                        {/* D. Beat Markers (Full Height Overlay) */}
                        {showGrid && audio.beats && audio.beats.map((beat, i) => (
                            <div
                                key={i}
                                className="absolute top-0 bottom-0 w-[1px] bg-[#ffffff40] pointer-events-none z-10"
                                style={{ left: `${(beat / totalDuration) * 100}%` }}
                            />
                        ))}

                        {/* D. Playhead (Premiere Style) */}
                        <div
                            className="absolute top-[-24px] bottom-0 w-[1px] bg-[#3399ff] z-50 pointer-events-none"
                            style={{ left: `${(currentTime / totalDuration) * 100}%` }}
                        >
                            {/* Blue Handle Head */}
                            <div className="absolute top-0 -left-[6px] w-[13px] h-[16px] bg-[#3399ff] clip-path-playhead shadow-sm" style={{ clipPath: 'polygon(0% 0%, 100% 0%, 100% 70%, 50% 100%, 0% 70%)' }} />
                        </div>
                    </div>
                </div>
            </div>

            <audio
                key={audioKey}
                ref={audioRef}
                preload="auto"
                onEnded={handleAudioEnded}
            />
        </div>
    );
}

function formatTime(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${m}:${s.toString().padStart(2, '0')}.${ms}`;
}
