import { VideoClip, AudioTrack, SyncSettings } from "@/store/useStore";

export interface TimelineClip {
    id: string; // Unique ID for the timeline event
    videoId: string;
    videoIndex: number; // Index in the storyboard (1-based)
    videoName: string;
    videoPath: string;
    file: File;
    duration: number; // Clip duration in the timeline
    timelineStart: number;
    timelineEnd: number;
    sourceStart: number;
    sourceEnd: number;
}

export function generateTimeline(videos: VideoClip[], audio: AudioTrack, settings: SyncSettings): TimelineClip[] {
    if (videos.length === 0 || !audio) return [];

    const timeline: TimelineClip[] = [];
    const beats = audio.beats || [];
    const totalDuration = audio.duration || 1;

    // Map videos to their storyboard index (1-based) for easy lookup
    const videoToIndexMap = new Map(videos.map((v, i) => [v.id, i + 1]));

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
            let step = skipEveryN;

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

    } else if (settings.videoMode === 'metronome' && (audio.bpm || beats.length > 0)) {
        // Mode 2: Metronome - steady grid based on BPM
        const bpm = audio.bpm || 120;
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

            // Cycle through videos
            const selectedVideo = videos[videoIdx % videos.length];
            videoIdx++;

            // Select source segment
            let sourceStart = 0;
            if (selectedVideo.duration > clipDuration) {
                if (settings.cropMode === 'smart') {
                    const margin = selectedVideo.duration * 0.05;
                    const usableDuration = selectedVideo.duration - (margin * 2);
                    if (usableDuration > clipDuration) {
                        const rand = (Math.random() + Math.random() + Math.random()) / 3;
                        const maxPossibleStart = usableDuration - clipDuration;
                        sourceStart = margin + (rand * maxPossibleStart);
                    }
                } else {
                    const maxStart = selectedVideo.duration - clipDuration;
                    sourceStart = Math.random() * maxStart;
                }
            }

            timeline.push({
                id: crypto.randomUUID(),
                videoId: selectedVideo.id,
                videoIndex: videoToIndexMap.get(selectedVideo.id) || 0,
                videoName: selectedVideo.name,
                file: selectedVideo.file,
                videoPath: `file://${selectedVideo.name}`,
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
    let nextVideoIdx = 0; // for sequential mode

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

        // 2. Select Video based on Mode
        let selectedVideo: VideoClip;

        if (settings.videoMode === 'sequential-once') {
            if (nextVideoIdx >= videos.length) {
                // Stop generating if we run out of videos in one-pass mode
                break;
            }
            selectedVideo = videos[nextVideoIdx];
            nextVideoIdx++;
        } else {
            // 'random-loop' (or fallback): Pick randomly from all available
            selectedVideo = videos[Math.floor(Math.random() * videos.length)];

            // Optional: Avoid immediate repeat if more than 1 video
            if (videos.length > 1 && timeline.length > 0 && timeline[timeline.length - 1].videoId === selectedVideo.id) {
                const otherVideos = videos.filter(v => v.id !== selectedVideo.id);
                selectedVideo = otherVideos[Math.floor(Math.random() * otherVideos.length)];
            }
        }

        // 3. Select Source Segment
        let sourceStart = 0;

        if (selectedVideo.duration > clipDuration) {
            if (settings.cropMode === 'smart') {
                // Smart Crop: Weighted towards the center (Gaussian-like)
                // Avoid the first and last 5% of the clip to bypass technical "trash"
                const margin = selectedVideo.duration * 0.05;
                const usableDuration = selectedVideo.duration - (margin * 2);

                if (usableDuration > clipDuration) {
                    // Pick a "center of gravity" for the clip
                    // Summing 3 random numbers approximates a normal distribution
                    const rand = (Math.random() + Math.random() + Math.random()) / 3;
                    const maxPossibleStart = usableDuration - clipDuration;
                    sourceStart = margin + (rand * maxPossibleStart);
                } else {
                    sourceStart = 0;
                }
            } else {
                // Legacy Random Crop: Uniform distribution
                const maxStart = selectedVideo.duration - clipDuration;
                sourceStart = Math.random() * maxStart;
            }
        } else {
            // Video is shorter than slot
            sourceStart = 0;
        }

        timeline.push({
            id: crypto.randomUUID(),
            videoId: selectedVideo.id,
            videoIndex: videoToIndexMap.get(selectedVideo.id) || 0,
            videoName: selectedVideo.name,
            file: selectedVideo.file,
            videoPath: `file://${selectedVideo.name}`,
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

