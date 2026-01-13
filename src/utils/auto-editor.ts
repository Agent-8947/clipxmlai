import { MediaClip, AudioTrack, SyncSettings } from "@/store/useStore";

export interface TimelineClip {
    id: string; // Unique ID for the timeline event
    videoId: string;
    videoIndex: number; // Index in the storyboard (1-based)
    videoName: string;
    videoPath: string;
    file: File;
    type: 'video' | 'image';
    duration: number; // Clip duration in the timeline
    timelineStart: number;
    timelineEnd: number;
    sourceStart: number;
    sourceEnd: number;
}

export function generateTimeline(media: MediaClip[], audio: AudioTrack, settings: SyncSettings): TimelineClip[] {
    if (media.length === 0 || !audio) return [];

    const timeline: TimelineClip[] = [];

    // Use instrument-specific beats if available and relevant
    let beats = audio.beats || [];

    if (audio.instrumentBeats) {
        // Map generic algorithms to specific instrument tracks if available
        if (settings.algorithm === 'drums' && audio.instrumentBeats.kick?.length > 0) {
            beats = audio.instrumentBeats.kick;
        } else if (settings.algorithm === 'combo-edm' && audio.instrumentBeats.kick?.length > 0) {
            beats = audio.instrumentBeats.kick;
        } else if (settings.algorithm === 'voice' && audio.instrumentBeats.hihat?.length > 0) {
            // For high freq focus, use hihats if available
            beats = audio.instrumentBeats.hihat;
        }
        // Add more mappings as needed
    }

    const totalDuration = audio.duration || 1;

    // Map media to their storyboard index (1-based) for easy lookup
    const mediaToIndexMap = new Map(media.map((v, i) => [v.id, i + 1]));

    // Track used segments to avoid repetition
    // Key: mediaId, Value: Array of {start, end}
    const usedMediaSegments = new Map<string, Array<{ start: number, end: number }>>();

    // Parameters from Settings
    const MIN_CLIP_DURATION = settings.minDuration; // e.g. 0.5
    const MAX_CLIP_DURATION = settings.maxDuration; // e.g. 4.0
    const skipEveryN = settings.skipEveryN || 1; // Use every Nth beat
    const durationVariance = (settings.durationVariance || 0) / 100; // 0-0.5

    // ========== SELECT CUT POINTS BASED ON MODE ==========
    let cutPoints: number[] = [];

    if (settings.videoMode === 'beat-locked' && beats.length > 0) {
        // Mode 1: Beat-locked
        // Instead of strict filtering, we step through beats using skipEveryN + variance
        const cutPointsList: number[] = [0];

        let currentBeatIndex = 0;

        // Find the first beat that is > 0 to start indexing correctly
        // (Usually beats[0] is near 0, but we want to start counting intervals from there)

        while (currentBeatIndex < beats.length) {

            // Determine skip factor for this moment
            // Check if current beat falls into a specific rhythm segment
            const currentBeatTime = beats[currentBeatIndex];
            const activeSegment = settings.rhythmSegments?.find(
                s => currentBeatTime >= s.startTime && currentBeatTime < s.endTime
            );

            const currentSkipN = activeSegment ? activeSegment.skipEveryN : skipEveryN;
            let step = currentSkipN;

            // Apply variance to the STEP amount (rhythm variance)
            if (durationVariance > 0) {
                const maxVar = Math.floor(step * durationVariance * 2); // Increased effect range
                if (maxVar > 0) {
                    const delta = Math.floor(Math.random() * (maxVar * 2 + 1)) - maxVar;
                    step += delta;
                }
                step = Math.max(1, step); // At least 1 beat
            }

            currentBeatIndex += step;

            if (currentBeatIndex < beats.length) {
                const beatTime = beats[currentBeatIndex];
                // Validate beat
                if (beatTime > cutPointsList[cutPointsList.length - 1] && beatTime <= totalDuration) {
                    cutPointsList.push(beatTime);
                }
            } else {
                break;
            }
        }

        cutPoints = cutPointsList;

        // Ensure we end at total duration
        if (cutPoints[cutPoints.length - 1] < totalDuration) {
            cutPoints.push(totalDuration);
        }

    } else if (settings.videoMode === 'metronome' && (settings.manualBpm || audio.bpm || beats.length > 0)) {
        // Mode 2: Metronome - steady grid based on BPM
        const bpm = settings.manualBpm || audio.bpm || 120;
        const beatInterval = 60 / bpm;
        const baseInterval = beatInterval * skipEveryN;

        cutPoints = [0];
        let currentPoint = 0;

        // Find start point
        if (beats.length > 0 && beats[0] < 0.5) {
            currentPoint = beats[0]; // Align to first beat if close
            if (currentPoint > 0.05) cutPoints.push(currentPoint);
        }

        while (currentPoint < totalDuration) {
            let interval = baseInterval;

            // Apply variance to interval
            if (durationVariance > 0) {
                const varianceAmount = baseInterval * durationVariance;
                const randomFactor = (Math.random() - 0.5) * 2;
                interval += (varianceAmount * randomFactor);
                interval = Math.max(0.1, interval);
            }

            const nextPoint = currentPoint + interval;

            if (nextPoint > totalDuration) break;

            if (nextPoint > cutPoints[cutPoints.length - 1] + 0.05) {
                cutPoints.push(nextPoint);
            }
            currentPoint = nextPoint;
        }

        if (cutPoints[cutPoints.length - 1] < totalDuration) {
            cutPoints.push(totalDuration);
        }
    }

    // Common Clip Generation for beat-based modes
    if (cutPoints.length > 0) {

        // Create clips between consecutive cut points
        let videoIdx = 0;
        for (let i = 0; i < cutPoints.length - 1; i++) {
            const clipStart = cutPoints[i];
            const clipEnd = cutPoints[i + 1];
            const clipDuration = clipEnd - clipStart;

            if (clipDuration < 0.05) continue; // Skip only extremely tiny gaps (< 50ms)

            // Cycle through media
            const selectedMedia = media[videoIdx % media.length];
            videoIdx++;

            // Select source segment
            let sourceStart = 0;

            if (selectedMedia.type === 'video') {
                const used = usedMediaSegments.get(selectedMedia.id) || [];
                let start = findBestSourceRange(selectedMedia.duration, clipDuration, settings.cropMode === 'smart', used);

                if (start === null) {
                    // Video is saturated, clear usage and retry
                    usedMediaSegments.set(selectedMedia.id, []);
                    start = findBestSourceRange(selectedMedia.duration, clipDuration, settings.cropMode === 'smart', []);
                }

                // If still null (e.g. clip > video), fallback to 0
                sourceStart = start !== null ? start : 0;

                // Record usage
                const currentUsed = usedMediaSegments.get(selectedMedia.id) || [];
                currentUsed.push({ start: sourceStart, end: sourceStart + clipDuration });
                usedMediaSegments.set(selectedMedia.id, currentUsed);
            } else {
                // Image: Always start at 0
                sourceStart = 0;
            }

            timeline.push({
                id: crypto.randomUUID(),
                videoId: selectedMedia.id,
                videoIndex: mediaToIndexMap.get(selectedMedia.id) || 0,
                videoName: selectedMedia.name,
                file: selectedMedia.file,
                type: selectedMedia.type,
                videoPath: `file://${selectedMedia.name}`,
                duration: clipDuration,
                timelineStart: clipStart,
                timelineEnd: clipEnd,
                sourceStart: sourceStart,
                sourceEnd: sourceStart + clipDuration
            });
        }

        return timeline;
    }


    // ========== LEGACY MODES (sequential-once, random-loop) ==========
    let currentTime = 0;
    let nextMediaIdx = 0; // for sequential mode

    while (currentTime < totalDuration) {
        // 1. Determine Clip Duration
        let nextCutTime = totalDuration;

        if (beats && beats.length > 0) {
            // Find valid beats that are after (currentTime + MIN_CLIP_DURATION)
            const validBeats = beats.filter(b => b > currentTime + MIN_CLIP_DURATION);

            if (validBeats.length > 0) {
                // If using a specific instrument algorithm, we should be MORE PRECISE.
                // For 'energy' we can keep some randomness, but for 'drums/vocals' we want the hits.
                const isInstrumentMode = ['drums', 'vocals', 'voice'].includes(settings.algorithm);

                // Tighten the range for instrument modes (pick 1st or 2nd beat) 
                // vs broader range for energy (pick up to 4th beat for variety)
                const range = isInstrumentMode ? Math.min(validBeats.length, 1) : Math.min(validBeats.length, 4);
                const offset = Math.floor(Math.random() * range);

                const candidateBeat = validBeats[offset];

                // If candidate is within reasonable distance, use it. 
                // If it's too far (> MAX), we must cut anyway, but let's try to find if there's ONLY ONE beat that's slightly over
                if (candidateBeat - currentTime > MAX_CLIP_DURATION) {
                    // If we are in instrument mode, we'd rather wait 0.2s more for a beat than cut early
                    const gracePeriod = isInstrumentMode ? 0.3 : 0;
                    if (candidateBeat - currentTime <= MAX_CLIP_DURATION + gracePeriod) {
                        nextCutTime = candidateBeat;
                    } else {
                        // Still too far, find the best intermediate beat or just cap it
                        const bestIntermediate = validBeats.find(b => b - currentTime <= MAX_CLIP_DURATION);
                        nextCutTime = bestIntermediate || (currentTime + MAX_CLIP_DURATION);
                    }
                } else {
                    nextCutTime = candidateBeat;
                }
            } else {
                nextCutTime = Math.min(currentTime + MAX_CLIP_DURATION, totalDuration);
            }
        } else {
            nextCutTime = Math.min(currentTime + 2.0, totalDuration);
        }

        const clipDuration = nextCutTime - currentTime;

        // 2. Select Media based on Mode
        let selectedMedia: MediaClip;

        if (settings.videoMode === 'sequential-once') {
            if (nextMediaIdx >= media.length) {
                // Stop generating if we run out of media in one-pass mode
                break;
            }
            selectedMedia = media[nextMediaIdx];
            nextMediaIdx++;
        } else {
            // 'random-loop' (or fallback): Pick randomly from all available
            selectedMedia = media[Math.floor(Math.random() * media.length)];

            // Optional: Avoid immediate repeat if more than 1 item
            if (media.length > 1 && timeline.length > 0 && timeline[timeline.length - 1].videoId === selectedMedia.id) {
                const otherMedia = media.filter(v => v.id !== selectedMedia.id);
                selectedMedia = otherMedia[Math.floor(Math.random() * otherMedia.length)];
            }
        }

        // 3. Select Source Segment
        let sourceStart = 0;

        if (selectedMedia.type === 'video') {
            const used = usedMediaSegments.get(selectedMedia.id) || [];
            let start = findBestSourceRange(selectedMedia.duration, clipDuration, settings.cropMode === 'smart', used);

            if (start === null) {
                // Video is saturated, clear usage and retry
                usedMediaSegments.set(selectedMedia.id, []);
                start = findBestSourceRange(selectedMedia.duration, clipDuration, settings.cropMode === 'smart', []);
            }

            sourceStart = start !== null ? start : 0;

            const currentUsed = usedMediaSegments.get(selectedMedia.id) || [];
            currentUsed.push({ start: sourceStart, end: sourceStart + clipDuration });
            usedMediaSegments.set(selectedMedia.id, currentUsed);
        } else {
            // Image triggers: start at 0
            sourceStart = 0;
        }

        timeline.push({
            id: crypto.randomUUID(),
            videoId: selectedMedia.id,
            videoIndex: mediaToIndexMap.get(selectedMedia.id) || 0,
            videoName: selectedMedia.name,
            file: selectedMedia.file,
            type: selectedMedia.type,
            videoPath: `file://${selectedMedia.name}`,
            duration: clipDuration,
            timelineStart: currentTime,
            timelineEnd: nextCutTime,
            sourceStart: sourceStart,
            sourceEnd: sourceStart + clipDuration
        });

        currentTime = nextCutTime;

        // Safety break to prevent infinite loops if something goes wrong
        if (clipDuration <= 0.01) {
            currentTime += 0.5; // Force advance
        }
    }

    return timeline;
}


function findBestSourceRange(
    mediaDuration: number,
    clipDuration: number,
    isSmartCrop: boolean,
    usedRanges: Array<{ start: number, end: number }>
): number | null {
    const margin = mediaDuration * 0.05;
    const effectiveDuration = mediaDuration - (2 * margin);

    // Fallback if clip is too long for the video (ignore margin)
    if (effectiveDuration < clipDuration) {
        if (mediaDuration > clipDuration) return (mediaDuration - clipDuration) / 2;
        return 0;
    }

    // Calculate free intervals
    let free = [{ start: margin, end: mediaDuration - margin }];

    // Sort used ranges by start
    const sortedUsed = [...usedRanges].sort((a, b) => a.start - b.start);

    for (const u of sortedUsed) {
        const nextFree: Array<{ start: number, end: number }> = [];
        for (const f of free) {
            // Subtract u from f
            // If u is completely outside f, keep f
            if (u.end <= f.start + 0.01 || u.start >= f.end - 0.01) {
                nextFree.push(f);
                continue;
            }

            // If overlap, split f
            if (u.start > f.start) {
                nextFree.push({ start: f.start, end: u.start });
            }
            if (u.end < f.end) {
                nextFree.push({ start: u.end, end: f.end });
            }
        }
        free = nextFree;
    }

    // Filter for valid size
    const valid = free.filter(f => (f.end - f.start) >= clipDuration);

    if (valid.length === 0) return null; // Saturated

    // Pick a range
    // Heuristic: weighted purely by length to be fair
    const totalLength = valid.reduce((acc, f) => acc + (f.end - f.start), 0);
    let r = Math.random() * totalLength;
    let selectedRange = valid[0];

    for (const f of valid) {
        const len = f.end - f.start;
        if (r <= len) {
            selectedRange = f;
            break;
        }
        r -= len;
    }

    // Now pick start within selectedRange
    const maxLocalStart = (selectedRange.end - selectedRange.start) - clipDuration;

    // Crop Modes Logic
    if (typeof isSmartCrop === 'string') {
        const mode = isSmartCrop as string;
        switch (mode) {
            case 'center':
                return selectedRange.start + (maxLocalStart / 2);
            case 'start':
                return selectedRange.start; // Begining of valid slot
            case 'end':
                return selectedRange.start + maxLocalStart; // End of valid slot
            case 'golden':
                // Golden Ratio (approx 0.618 or 0.382)
                return selectedRange.start + (maxLocalStart * 0.382);
            case 'smart':
            default:
                // Gaussian-ish within the available slot
                const rand = (Math.random() + Math.random()) / 2;
                return selectedRange.start + (rand * maxLocalStart);
        }
    }

    // Fallback for legacy boolean calls if any (though we updated types)
    if (isSmartCrop === true) { // smart legacy
        const rand = (Math.random() + Math.random()) / 2;
        return selectedRange.start + (rand * maxLocalStart);
    } else { // random legacy
        return selectedRange.start + (Math.random() * maxLocalStart);
    }
}
