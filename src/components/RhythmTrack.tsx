import React, { useRef, useState, useEffect } from 'react';
import { useStore, RhythmSegment } from '@/store/useStore';
import { clsx } from 'clsx';
import { Trash2, Zap, GripVertical } from 'lucide-react';

interface RhythmTrackProps {
    zoom: number;
}

type DragMode = 'move' | 'resize-left' | 'resize-right' | null;

interface DragState {
    mode: DragMode;
    segmentId: string;
    startX: number;
    initialStartTime: number;
    initialEndTime: number;
    hasMoved: boolean; // To distinguish click from drag
}

export default function RhythmTrack({ zoom }: RhythmTrackProps) {
    const { audio, syncSettings, setSyncSettings } = useStore();
    const containerRef = useRef<HTMLDivElement>(null);
    const [dragState, setDragState] = useState<DragState | null>(null);

    // Local segments state for smooth dragging without constant store updates
    // We sync this with store on mount and when store changes (unless dragging)
    const [localSegments, setLocalSegments] = useState<RhythmSegment[]>([]);

    useEffect(() => {
        if (!dragState) {
            setLocalSegments(syncSettings.rhythmSegments || []);
        }
    }, [syncSettings.rhythmSegments, dragState]);

    if (!audio) return null;
    const totalDuration = audio.duration || 1;

    // --- Handlers ---

    const handlePointerDown = (e: React.PointerEvent, customMode: DragMode, seg: RhythmSegment) => {
        e.preventDefault();
        e.stopPropagation();

        setDragState({
            mode: customMode,
            segmentId: seg.id,
            startX: e.clientX,
            initialStartTime: seg.startTime,
            initialEndTime: seg.endTime,
            hasMoved: false
        });
    };

    const handleContainerClick = (e: React.MouseEvent) => {
        // If we just finished a drag or resize, ignore click
        // (This is handled by hasMoved check usually, but container click is separate)
        if (dragState) return;
        if ((e.target as HTMLElement) !== containerRef.current) return;

        const rect = containerRef.current!.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const time = (x / rect.width) * totalDuration;

        // Check overlaps with existing (store) segments
        const segments = syncSettings.rhythmSegments || [];
        const overlaps = segments.some(s => time >= s.startTime && time < s.endTime);
        if (overlaps) return;

        // Default 5s or until next segment
        let endTime = time + 5;
        const nextSegment = segments
            .filter(s => s.startTime > time)
            .sort((a, b) => a.startTime - b.startTime)[0];

        if (nextSegment) endTime = Math.min(endTime, nextSegment.startTime);
        endTime = Math.min(endTime, totalDuration);

        const newSegment: RhythmSegment = {
            id: crypto.randomUUID(),
            startTime: time,
            endTime: endTime,
            skipEveryN: 4
        };

        setSyncSettings({
            rhythmSegments: [...segments, newSegment]
        });
    };

    // Global Pointer Events for Dragging
    useEffect(() => {
        const handlePointerMove = (e: PointerEvent) => {
            if (!dragState || !containerRef.current) return;

            const deltaX = e.clientX - dragState.startX;
            const rect = containerRef.current.getBoundingClientRect();
            const deltaTime = (deltaX / rect.width) * totalDuration;

            // Update local state is cheap
            if (Math.abs(deltaX) > 2) {
                setDragState(prev => prev ? { ...prev, hasMoved: true } : null);
            }

            setLocalSegments(prev => prev.map(seg => {
                if (seg.id !== dragState.segmentId) return seg;

                let newStart = dragState.initialStartTime;
                let newEnd = dragState.initialEndTime;

                if (dragState.mode === 'move') {
                    newStart += deltaTime;
                    newEnd += deltaTime;
                } else if (dragState.mode === 'resize-left') {
                    newStart += deltaTime;
                } else if (dragState.mode === 'resize-right') {
                    newEnd += deltaTime;
                }

                // Constraints
                // 1. Min duration
                if (newEnd - newStart < 0.5) {
                    if (dragState.mode === 'resize-left') newStart = newEnd - 0.5;
                    if (dragState.mode === 'resize-right') newEnd = newStart + 0.5;
                }

                // 2. Bounds (0 to totalDuration)
                if (newStart < 0) {
                    const diff = 0 - newStart;
                    newStart = 0;
                    if (dragState.mode === 'move') newEnd += diff;
                }
                if (newEnd > totalDuration) {
                    const diff = newEnd - totalDuration;
                    newEnd = totalDuration;
                    if (dragState.mode === 'move') newStart -= diff;
                }

                // 3. Collision logic could go here (clamp to neighbors), simpler to just allow overlap or simple clamp
                // Simple clamp against neighbors for now?
                // Let's rely on visual feedback and fix properly later if needed. For now allow overlaps (last one wins based on logic)

                return { ...seg, startTime: newStart, endTime: newEnd };
            }));
        };

        const handlePointerUp = () => {
            if (dragState) {
                // Commit changes to store
                if (dragState.hasMoved) {
                    setSyncSettings({ rhythmSegments: localSegments });
                }
                setDragState(null);
            }
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
        };
    }, [dragState, localSegments, totalDuration, setSyncSettings]);


    const toggleValue = (segId: string) => {
        // Don't toggle if we dragged
        if (dragState?.hasMoved) return;

        const segments = syncSettings.rhythmSegments || [];
        const seg = segments.find(s => s.id === segId);
        if (!seg) return;

        const values = [1, 2, 4, 8, 16, 24, 32, 48];
        const idx = values.indexOf(seg.skipEveryN);
        const nextVal = values[(idx + 1) % values.length];

        const updated = segments.map(s => s.id === segId ? { ...s, skipEveryN: nextVal } : s);
        setSyncSettings({ rhythmSegments: updated });
    };

    const removeSegment = (id: string) => {
        setSyncSettings({ rhythmSegments: (syncSettings.rhythmSegments || []).filter(s => s.id !== id) });
    };

    return (
        <div className="absolute top-[152px] left-0 right-0 h-[40px] bg-[#2a2a2a] border-t border-b border-[#3a4b53] z-10 select-none">
            <div className="absolute top-0 left-2 text-[9px] text-yellow-400 font-medium bg-black/40 px-1 rounded z-20 pointer-events-none">
                Rhythm Automation
            </div>

            <div
                ref={containerRef}
                className="w-full h-full relative cursor-crosshair"
                onClick={handleContainerClick}
            >
                {localSegments.map(seg => {
                    const left = (seg.startTime / totalDuration) * 100;
                    const width = ((seg.endTime - seg.startTime) / totalDuration) * 100;
                    const isDragging = dragState?.segmentId === seg.id;

                    return (
                        <div
                            key={seg.id}
                            className={clsx(
                                "absolute top-1 bottom-1 rounded border flex items-center justify-center group overflow-visible",
                                seg.skipEveryN === 1 ? "bg-red-500/40 border-red-400" :
                                    seg.skipEveryN <= 4 ? "bg-orange-500/40 border-orange-400" :
                                        "bg-blue-500/40 border-blue-400",
                                isDragging ? "z-30 opacity-90 cursor-grabbing" : "z-10 cursor-grab hover:brightness-110"
                            )}
                            style={{ left: `${left}%`, width: `${width}%` }}
                            onPointerDown={(e) => handlePointerDown(e, 'move', seg)}
                            onClick={(e) => { e.stopPropagation(); toggleValue(seg.id); }}
                            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); removeSegment(seg.id); }}
                        >
                            {/* Content */}
                            <div className="text-[10px] font-mono font-bold text-white drop-shadow-md pointer-events-none flex items-center gap-1">
                                <Zap className="w-3 h-3 fill-current" />
                                1/{seg.skipEveryN}
                            </div>

                            {/* Left Resize Handle */}
                            <div
                                className="absolute left-0 top-0 bottom-0 w-3 bg-white/0 hover:bg-white/20 cursor-w-resize flex items-center justify-center group/left"
                                onPointerDown={(e) => handlePointerDown(e, 'resize-left', seg)}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="w-[1px] h-3 bg-white/50 group-hover/left:bg-white" />
                            </div>

                            {/* Right Resize Handle */}
                            <div
                                className="absolute right-0 top-0 bottom-0 w-3 bg-white/0 hover:bg-white/20 cursor-e-resize flex items-center justify-center group/right"
                                onPointerDown={(e) => handlePointerDown(e, 'resize-right', seg)}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="w-[1px] h-3 bg-white/50 group-hover/right:bg-white" />
                            </div>

                            {/* Delete Btn (only visible on hover and not dragging) */}
                            {!isDragging && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        removeSegment(seg.id);
                                    }}
                                    className="absolute -top-2 -right-2 p-1 bg-black/80 rounded-full text-white/50 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity z-40"
                                    title="Remove Segment"
                                >
                                    <Trash2 className="w-3 h-3" />
                                </button>
                            )}
                        </div>
                    );
                })}

                {localSegments.length === 0 && (
                    <div className="w-full h-full flex items-center justify-center text-white/20 text-[10px] pointer-events-none">
                        Click to add beat changes
                    </div>
                )}
            </div>
        </div>
    );
}
