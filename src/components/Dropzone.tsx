'use client';

import React, { useCallback, useState } from 'react';
import { useDropzone, Accept } from 'react-dropzone';
import { Upload, Music, Video, Loader2, FileAudio, FileVideo } from 'lucide-react';
import { useStore, MediaClip } from '@/store/useStore';
import { getVideoMetadata } from '@/utils/file-helpers';
import { twMerge } from 'tailwind-merge';

interface DropzoneProps {
    type: 'video' | 'audio' | 'mixed';
    label?: string;
    className?: string;
}

export default function Dropzone({ type, label, className }: DropzoneProps) {
    const { addMedia, setAudio, audio, media } = useStore();
    const [loading, setLoading] = useState(false);

    // Set accepted checks based on type prop
    // Modified: 'video' type now accepts images too
    const accept: Accept = type === 'video'
        ? { 'video/*': [], 'image/*': [] }
        : type === 'audio'
            ? { 'audio/*': [] }
            : { 'video/*': [], 'image/*': [], 'audio/*': [] };

    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        setLoading(true);
        const newMedia: MediaClip[] = [];
        let newAudio = null;

        try {
            for (const file of acceptedFiles) {
                const isAudio = file.type.startsWith('audio/');
                const isVideo = file.type.startsWith('video/');
                const isImage = file.type.startsWith('image/');

                // Guard clause for strict modes
                if (type === 'audio' && !isAudio) continue;
                if (type === 'video' && !isVideo && !isImage) continue;

                if (isAudio) {
                    // If dropping into audio zone, replace current
                    if (type === 'audio' || (!newAudio && !audio)) {
                        newAudio = {
                            id: crypto.randomUUID(),
                            file,
                            name: file.name,
                            duration: 0,
                            buffer: null,
                            beats: []
                        };
                    }
                } else if (isVideo) {
                    const metadata = await getVideoMetadata(file);
                    if (metadata.duration > 0) {
                        newMedia.push({
                            id: crypto.randomUUID(),
                            type: 'video',
                            file,
                            name: file.name,
                            duration: metadata.duration,
                            thumbnail: metadata.thumbnail
                        });
                    }
                } else if (isImage) {
                    // Quick image processing to get thumbnail (URL)
                    const url = URL.createObjectURL(file);
                    newMedia.push({
                        id: crypto.randomUUID(),
                        type: 'image',
                        file,
                        name: file.name,
                        duration: 5.0, // Default virtual duration for images
                        thumbnail: url
                    });
                }
            }

            if (newAudio) setAudio(newAudio);
            if (newMedia.length > 0) addMedia(newMedia);
        } catch (e) {
            console.error("Error processing files", e);
        } finally {
            setLoading(false);
        }
    }, [addMedia, setAudio, audio, type]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept
    });

    // Visuals dependent on type
    const isFilled = type === 'audio' ? !!audio : media.length > 0;

    const Icon = type === 'audio'
        ? (audio ? Music : FileAudio)
        : (media.length > 0 ? Video : FileVideo);

    return (
        <div
            {...getRootProps()}
            className={twMerge(
                "relative group bg-surface border-2 border-dashed border-border rounded-xl p-6 flex flex-col items-center justify-center transition-all cursor-pointer min-h-[160px] hover:border-primary hover:bg-surface-hover",
                isDragActive && "border-primary bg-primary/10",
                isFilled && "border-primary/50 bg-primary/5",
                className
            )}
        >
            <input {...getInputProps()} />
            {loading ? (
                <Loader2 className="w-10 h-10 animate-spin text-primary" />
            ) : (
                <>
                    <div className={twMerge("p-4 rounded-full mb-3 transition-colors", isFilled ? "bg-primary/20 text-primary" : "bg-neutral-800 text-muted group-hover:text-primary group-hover:scale-110 transform duration-200")}>
                        <Icon className="w-8 h-8" />
                    </div>

                    <div className="text-center z-10 space-y-1">
                        <p className="text-base font-semibold text-foreground">
                            {label || (type === 'audio' ? "Upload Audio Track" : "Upload Video Clips")}
                        </p>
                        <p className="text-xs text-muted max-w-[200px] mx-auto truncate">
                            {type === 'audio'
                                ? (audio ? `Current: ${audio.name}` : "Drop MP3/WAV file")
                                : (media.length > 0 ? `${media.length} items ready` : "Drop videos or images")
                            }
                        </p>
                    </div>

                    {/* Simple status indicator */}
                    {isFilled && (
                        <div className="absolute top-2 right-2 w-2 h-2 bg-accent rounded-full animate-pulse" />
                    )}
                </>
            )}
        </div>
    );
}
