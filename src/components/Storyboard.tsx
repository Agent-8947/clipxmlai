'use client';

import React from 'react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent
} from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    rectSortingStrategy,
    useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useStore, MediaClip } from '@/store/useStore';
import { GripVertical, Image as ImageIcon, Video } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

function SortableItem({ clip, index }: { clip: MediaClip; index: number }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: clip.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : 'auto',
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={twMerge(
                "relative group bg-surface rounded-lg overflow-hidden border border-gray-800 shadow-md hover:border-primary transition-all",
                isDragging && "opacity-50 ring-2 ring-primary"
            )}
        >
            {/* Thumbnail */}
            <div className="aspect-video w-full bg-black relative">
                <img src={clip.thumbnail} alt={clip.name} className="w-full h-full object-cover" />
                <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-1 rounded">
                    {clip.type === 'video' ? `${clip.duration.toFixed(1)}s` : 'IMG'}
                </div>
                <div className="absolute top-2 left-2 bg-primary/80 text-black text-xs px-1 rounded font-bold flex items-center gap-1">
                    {clip.type === 'image' ? <ImageIcon className="w-3 h-3" /> : <Video className="w-3 h-3" />} #{index + 1}
                </div>

                {/* Drag Handle Overlay */}
                <div
                    {...attributes}
                    {...listeners}
                    className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors cursor-grab active:cursor-grabbing flex items-center justify-center opacity-0 group-hover:opacity-100"
                >
                    <GripVertical className="bg-black/50 text-white rounded p-1 w-8 h-8" />
                </div>
            </div>

            {/* Info */}
            <div className="p-2 text-xs font-bold text-white bg-black/40 flex justify-between items-center">
                <span className="truncate max-w-[80px]">{clip.name}</span>
            </div>
        </div>
    );
}

export default function Storyboard() {
    const { media, reorderMedia } = useStore();

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = media.findIndex((v) => v.id === active.id);
            const newIndex = media.findIndex((v) => v.id === over.id);
            reorderMedia(oldIndex, newIndex);
        }
    };

    if (media.length === 0) return null;

    return (
        <div className="mt-8">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                    Storyboard <span className="text-sm font-normal text-muted">({media.length} items)</span>
                </h2>
            </div>

            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <SortableContext
                    items={media.map(v => v.id)}
                    strategy={rectSortingStrategy}
                >
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {media.map((clip, index) => (
                            <SortableItem key={clip.id} clip={clip} index={index} />
                        ))}
                    </div>
                </SortableContext>
            </DndContext>
        </div>
    );
}
