import { useEffect, useRef } from 'react';
import { useStore, BeatAlgorithm } from '@/store/useStore';

export function useAudioAnalysis() {
    const { audio, setAudioBuffer, setBeats, setStatus, syncSettings } = useStore();
    const processingRef = useRef(false);

    // 1. Decode Audio (Once per file)
    useEffect(() => {
        if (!audio || audio.buffer || processingRef.current) return;

        const decodeAudio = async () => {
            processingRef.current = true;
            setStatus('analyzing');
            try {
                const arrayBuffer = await audio.file.arrayBuffer();
                const AudioContext = (window.AudioContext || (window as any).webkitAudioContext) as typeof window.AudioContext;
                const audioContext = new AudioContext();
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                setAudioBuffer(audioBuffer); // This triggers the next effect
            } catch (e) {
                console.error("Audio decoding error", e);
                setStatus('idle');
            } finally {
                processingRef.current = false;
            }
        };

        decodeAudio();
    }, [audio, setAudioBuffer, setStatus]);

    // Track last processed settings to avoid infinite loops
    const lastProcessedRef = useRef<string>('');

    // 2. Detect Beats (Re-run if buffer, algorithm, or sensitivity changes)
    useEffect(() => {
        if (!audio?.buffer) return;

        // Create a settings key to compare
        const settingsKey = `${audio.id}-${syncSettings.algorithm}-${syncSettings.beatSensitivity}`;

        // Skip if already processed with these exact settings
        if (lastProcessedRef.current === settingsKey) return;
        if (processingRef.current) return;

        const processBeats = async () => {
            processingRef.current = true;
            lastProcessedRef.current = settingsKey;
            setStatus('analyzing');
            console.log(`Analyzing beats with algorithm: ${syncSettings.algorithm}, sensitivity: ${syncSettings.beatSensitivity}ms`);

            try {
                // Apply filters if needed
                let processingBuffer = audio.buffer!;

                // Standard instrument filters
                if (['drums', 'bass', 'guitar', 'vocals', 'voice', 'words', 'sentences', 'melody', 'brass', 'keys'].includes(syncSettings.algorithm)) {
                    processingBuffer = await applyAudioFilter(audio.buffer!, syncSettings.algorithm);
                }

                // Combo modes: combine multiple filtered analyses
                if (syncSettings.algorithm === 'combo-edm') {
                    // EDM: Drums + Bass
                    processingBuffer = await applyAudioFilter(audio.buffer!, 'drums');
                } else if (syncSettings.algorithm === 'combo-clip') {
                    // Music Video: Vocals + Drums  
                    processingBuffer = await applyAudioFilter(audio.buffer!, 'vocals');
                }

                // Run detection (wrapped in timeout to unblock UI)
                const currentAlgo = syncSettings.algorithm;
                const sensitivity = syncSettings.beatSensitivity ?? 100; // Use ?? to allow 0
                const originalBuffer = audio.buffer!;

                setTimeout(() => {
                    let beats: number[];

                    // Special algorithms
                    if (currentAlgo === 'silence') {
                        beats = detectSilence(originalBuffer, sensitivity);
                    } else if (currentAlgo === 'downbeat') {
                        beats = detectDownbeats(originalBuffer, sensitivity);
                    } else if (currentAlgo === 'phrase') {
                        beats = detectPhrases(originalBuffer, sensitivity);
                    } else if (currentAlgo === 'intensity') {
                        beats = detectIntensityChanges(originalBuffer, sensitivity);
                    } else if (currentAlgo === 'harmonic') {
                        beats = detectHarmonicChanges(originalBuffer, sensitivity);
                    } else {
                        beats = detectBeats(processingBuffer, currentAlgo, sensitivity);
                    }

                    // Calculate BPM from beats
                    const bpm = calculateBPM(beats);

                    setBeats(beats, currentAlgo, bpm);
                    setStatus('ready');
                    processingRef.current = false;
                }, 50);

            } catch (e) {
                console.error("Beat analysis error", e);
                setStatus('ready');
                processingRef.current = false;
            }
        };

        processBeats();

    }, [audio?.buffer, audio?.id, syncSettings.algorithm, syncSettings.beatSensitivity, setBeats, setStatus]);
}



async function applyAudioFilter(buffer: AudioBuffer, type: BeatAlgorithm): Promise<AudioBuffer> {
    const offlineCtx = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
    const source = offlineCtx.createBufferSource();
    source.buffer = buffer;

    // Create a chain of filters for better isolation
    const filter = offlineCtx.createBiquadFilter();
    const compressor = offlineCtx.createDynamicsCompressor(); // Normalize transients

    if (type === 'drums') {
        // Hard isolation for kicks (Lowpass)
        filter.type = 'lowpass';
        filter.frequency.value = 150; // Slightly higher for snare attack
        filter.Q.value = 0.8;
    } else if (type === 'bass') {
        // Bass guitar: Low frequencies 60-250Hz
        filter.type = 'lowpass';
        filter.frequency.value = 250;
        filter.Q.value = 0.7;
    } else if (type === 'guitar') {
        // Electric/Acoustic guitar: Mid-range 200Hz - 2kHz
        filter.type = 'bandpass';
        filter.frequency.value = 800;
        filter.Q.value = 0.6;
    } else if (type === 'vocals') {
        // High-mid focus for singing transients
        filter.type = 'bandpass';
        filter.frequency.value = 2500; // Presence range
        filter.Q.value = 0.8;
    } else if (type === 'voice') {
        // Wide bandpass for speech clarity
        filter.type = 'bandpass';
        filter.frequency.value = 1000;
        filter.Q.value = 0.4;
    } else if (type === 'words') {
        // Words/Syllables: Focus on consonant frequencies (high transients)
        filter.type = 'highpass';
        filter.frequency.value = 2000; // Consonants are in higher frequencies
        filter.Q.value = 0.5;
    } else if (type === 'sentences') {
        // Sentences: Wide speech range to detect pauses between phrases
        filter.type = 'bandpass';
        filter.frequency.value = 800; // Core speech frequencies
        filter.Q.value = 0.2; // Very wide to catch all speech
    } else if (type === 'melody') {
        // Melody: Mid-high range where melodic content lives
        filter.type = 'bandpass';
        filter.frequency.value = 1200; // Melodic sweet spot
        filter.Q.value = 0.3; // Wide to catch harmonics
    } else if (type === 'brass') {
        // Horns/Trumpets have strong 1kHz - 3kHz presence
        filter.type = 'bandpass';
        filter.frequency.value = 1500;
        filter.Q.value = 1.2;
    } else if (type === 'keys') {
        // Pianos/Synths are bright. Highpass + Peaking
        filter.type = 'highpass';
        filter.frequency.value = 800;
    }

    // Connect chain
    source.connect(filter);
    filter.connect(compressor);
    compressor.connect(offlineCtx.destination);

    source.start();

    return await offlineCtx.startRendering();
}

// Detection parameters per algorithm
interface DetectionParams {
    fftSize: number;
    hopSize: number;
    windowSize: number;
    multiplier: number;
    noiseFloor: number;
    minInterval: number; // Debounce in seconds
}

function getDetectionParams(algorithm: BeatAlgorithm): DetectionParams {
    switch (algorithm) {
        case 'drums':
            // Drums: Very tight timing, fast transients
            return {
                fftSize: 256,      // ~6ms resolution
                hopSize: 128,      // ~3ms steps
                windowSize: 10,    // Quick response
                multiplier: 1.3,   // Sensitive
                noiseFloor: 0.01,
                minInterval: 0.08  // 750 BPM max (for fast hi-hats)
            };
        case 'bass':
            // Bass: Low frequencies, need larger window for accuracy
            return {
                fftSize: 1024,     // Larger for low freq resolution
                hopSize: 256,
                windowSize: 12,
                multiplier: 1.4,
                noiseFloor: 0.015,
                minInterval: 0.12  // Bass lines are usually slower
            };
        case 'guitar':
            // Guitar: Mid-range, medium transients
            return {
                fftSize: 512,
                hopSize: 256,
                windowSize: 12,
                multiplier: 1.35,
                noiseFloor: 0.01,
                minInterval: 0.10
            };
        case 'vocals':
        case 'voice':
            // Vocals: Slower attacks, need wider detection
            return {
                fftSize: 1024,     // ~23ms resolution
                hopSize: 512,      // ~12ms steps
                windowSize: 20,    // Medium response
                multiplier: 1.5,
                noiseFloor: 0.008,
                minInterval: 0.15  // 400 BPM max
            };
        case 'words':
            // Words/Syllables: Detect consonant onsets (speech articulation)
            return {
                fftSize: 256,      // Fast response for consonants
                hopSize: 128,
                windowSize: 8,
                multiplier: 1.25,  // Very sensitive
                noiseFloor: 0.005,
                minInterval: 0.12  // Allow fast speech
            };
        case 'sentences':
            // Sentences/Phrases: Detect pauses between phrases (longer intervals)
            return {
                fftSize: 2048,     // Large window to detect silence
                hopSize: 1024,     // Bigger steps
                windowSize: 30,    // Long averaging window
                multiplier: 1.8,   // Only detect strong onsets after silence
                noiseFloor: 0.015,
                minInterval: 0.8   // Min 0.8s between cuts (phrase length)
            };
        case 'melody':
            // Melody: Detect note changes (pitch variations)
            return {
                fftSize: 2048,     // Large for pitch resolution
                hopSize: 512,
                windowSize: 25,
                multiplier: 1.6,   // Less sensitive (only major changes)
                noiseFloor: 0.01,
                minInterval: 0.20  // Slower, melodic phrases
            };
        case 'brass':
        case 'keys':
            // Instruments: Medium timing
            return {
                fftSize: 512,
                hopSize: 256,
                windowSize: 15,
                multiplier: 1.4,
                noiseFloor: 0.01,
                minInterval: 0.12
            };
        case 'combo-edm':
            // EDM: Tight timing for drops/builds
            return {
                fftSize: 256,
                hopSize: 128,
                windowSize: 10,
                multiplier: 1.3,
                noiseFloor: 0.01,
                minInterval: 0.08
            };
        case 'combo-clip':
            // Music Video: Balance vocals and drums
            return {
                fftSize: 512,
                hopSize: 256,
                windowSize: 15,
                multiplier: 1.35,
                noiseFloor: 0.008,
                minInterval: 0.15
            };
        case 'energy':
        case 'spectral':
        default:
            // General: Balanced parameters
            return {
                fftSize: 512,
                hopSize: 256,
                windowSize: 15,
                multiplier: 1.4,
                noiseFloor: 0.008,
                minInterval: 0.10
            };
    }
}

// Advanced beat detection using Energy Flux (Delta Energy)
function detectBeats(audioBuffer: AudioBuffer, algorithm: BeatAlgorithm, userSensitivityMs: number): number[] {
    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;

    // Get algorithm-specific parameters
    const params = getDetectionParams(algorithm);
    const { fftSize, hopSize, windowSize, multiplier, noiseFloor } = params;

    // Use user-defined sensitivity (converted from ms to seconds)
    // If 0 (OFF), use minimal debounce (10ms) to catch virtually every beat
    const minInterval = userSensitivityMs === 0 ? 0.01 : userSensitivityMs / 1000;

    console.log(`[Detection] Using params for '${algorithm}', sensitivity: ${userSensitivityMs === 0 ? 'OFF (10ms)' : `${userSensitivityMs}ms`}`);


    const energies: number[] = [];
    const flux: number[] = [];

    // 1. Calculate RMS Energy Envelope
    for (let i = 0; i < channelData.length; i += hopSize) {
        let sum = 0;
        for (let j = 0; j < fftSize; j++) {
            if (i + j < channelData.length) {
                const val = channelData[i + j];
                sum += val * val;
            }
        }
        energies.push(Math.sqrt(sum / fftSize));
    }

    // 2. Calculate Spectral/Energy Flux (rate of change)
    // We only care about POSITIVE increases in energy (onsets)
    flux.push(0);
    for (let i = 1; i < energies.length; i++) {
        const diff = energies[i] - energies[i - 1];
        flux.push(diff > 0 ? diff : 0);
    }

    // 3. Dynamic Thresholding on Flux
    const peaks: number[] = [];

    // Safety check for empty audio
    if (flux.length < windowSize) return [];

    for (let i = windowSize; i < flux.length - 1; i++) {
        const currentFlux = flux[i];

        // Calculate local threshold (mean)
        let sumLocal = 0;
        for (let h = 1; h <= windowSize; h++) sumLocal += flux[i - h];
        const localAvg = sumLocal / windowSize;

        // Peak detection
        if (currentFlux > localAvg * multiplier &&
            currentFlux > flux[i - 1] &&
            currentFlux > flux[i + 1] &&
            currentFlux > noiseFloor) {

            // Calculate precise timestamp with offset correction
            const rawTimestamp = (i * hopSize) / sampleRate;
            const offsetCorrection = (fftSize / 2) / sampleRate;
            const timestamp = Math.max(0, rawTimestamp - offsetCorrection);

            // Debouncing
            if (peaks.length === 0 || (timestamp - peaks[peaks.length - 1] > minInterval)) {
                peaks.push(timestamp);
            }
        }
    }

    console.log(`[Analysis] Detected ${peaks.length} precise onsets for '${algorithm}'`);
    return peaks;
}

// Calculate BPM from detected beats
function calculateBPM(beats: number[]): number {
    if (beats.length < 2) return 0;

    // Calculate intervals between consecutive beats
    const intervals: number[] = [];
    for (let i = 1; i < beats.length; i++) {
        intervals.push(beats[i] - beats[i - 1]);
    }

    // Filter out outliers (too short or too long intervals)
    const validIntervals = intervals.filter(i => i > 0.2 && i < 2.0);
    if (validIntervals.length === 0) return 0;

    // Calculate median interval (more robust than mean)
    validIntervals.sort((a, b) => a - b);
    const medianInterval = validIntervals[Math.floor(validIntervals.length / 2)];

    // Convert to BPM
    const bpm = Math.round(60 / medianInterval);

    // Clamp to reasonable range
    return Math.min(300, Math.max(40, bpm));
}

// Detect silence/pauses in audio (returns timestamps after silence ends)
function detectSilence(audioBuffer: AudioBuffer, sensitivityMs: number): number[] {
    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    const silenceThreshold = 0.02; // RMS below this = silence
    const minSilenceDuration = 0.3; // At least 300ms of silence

    const windowSize = 1024;
    const hopSize = 512;

    const silenceStarts: number[] = [];
    let inSilence = false;
    let silenceStartTime = 0;

    for (let i = 0; i < channelData.length; i += hopSize) {
        // Calculate RMS
        let sum = 0;
        for (let j = 0; j < windowSize && i + j < channelData.length; j++) {
            const val = channelData[i + j];
            sum += val * val;
        }
        const rms = Math.sqrt(sum / windowSize);
        const timestamp = i / sampleRate;

        if (rms < silenceThreshold) {
            if (!inSilence) {
                inSilence = true;
                silenceStartTime = timestamp;
            }
        } else {
            if (inSilence) {
                const silenceDuration = timestamp - silenceStartTime;
                if (silenceDuration >= minSilenceDuration) {
                    // Add the moment when sound resumes (after silence)
                    silenceStarts.push(timestamp);
                }
                inSilence = false;
            }
        }
    }

    // Apply sensitivity debounce
    const minInterval = sensitivityMs === 0 ? 0.01 : sensitivityMs / 1000;
    const filtered = silenceStarts.filter((t, i) =>
        i === 0 || t - silenceStarts[i - 1] > minInterval
    );

    console.log(`[Silence] Detected ${filtered.length} silence breaks`);
    return filtered;
}

// Detect downbeats (first beat of each bar) - estimates bar structure
function detectDownbeats(audioBuffer: AudioBuffer, sensitivityMs: number): number[] {
    // First detect all beats
    const allBeats = detectBeats(audioBuffer, 'drums', sensitivityMs);

    if (allBeats.length < 4) return allBeats;

    // Calculate most common interval (beat interval)
    const intervals: number[] = [];
    for (let i = 1; i < allBeats.length; i++) {
        intervals.push(allBeats[i] - allBeats[i - 1]);
    }

    intervals.sort((a, b) => a - b);
    const beatInterval = intervals[Math.floor(intervals.length / 2)];

    // Assume 4/4 time signature - every 4th beat is a downbeat
    // Find beats that are roughly 4x the median interval apart
    const barInterval = beatInterval * 4;
    const downbeats: number[] = [];

    let lastDownbeat = allBeats[0];
    downbeats.push(lastDownbeat);

    for (let i = 1; i < allBeats.length; i++) {
        const timeSinceLast = allBeats[i] - lastDownbeat;
        // If we're close to a bar boundary (within 20%), mark as downbeat
        if (timeSinceLast >= barInterval * 0.8) {
            downbeats.push(allBeats[i]);
            lastDownbeat = allBeats[i];
        }
    }

    console.log(`[Downbeat] Detected ${downbeats.length} downbeats (1 per bar)`);
    return downbeats;
}

// Detect musical phrases (4-8 bars) - for melodic cuts
function detectPhrases(audioBuffer: AudioBuffer, sensitivityMs: number): number[] {
    // First get all downbeats (bars)
    const downbeats = detectDownbeats(audioBuffer, sensitivityMs);

    if (downbeats.length < 4) return downbeats;

    // Musical phrases are typically 4 or 8 bars
    // For sensitivity: lower ms = more phrases (every 4 bars), higher = fewer (every 8 bars)
    const barsPerPhrase = sensitivityMs <= 500 ? 4 : 8;

    const phrases: number[] = [];
    for (let i = 0; i < downbeats.length; i += barsPerPhrase) {
        phrases.push(downbeats[i]);
    }

    console.log(`[Phrase] Detected ${phrases.length} musical phrases (every ${barsPerPhrase} bars)`);
    return phrases;
}

// Detect intensity/energy changes (buildups, drops, quiet sections)
function detectIntensityChanges(audioBuffer: AudioBuffer, sensitivityMs: number): number[] {
    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;

    // Large window for averaging energy over time
    const windowSize = Math.floor(sampleRate * 0.5); // 500ms window
    const hopSize = Math.floor(sampleRate * 0.1);    // 100ms steps

    const energies: number[] = [];
    const timestamps: number[] = [];

    // Calculate RMS energy over time
    for (let i = 0; i < channelData.length - windowSize; i += hopSize) {
        let sum = 0;
        for (let j = 0; j < windowSize; j++) {
            const val = channelData[i + j];
            sum += val * val;
        }
        energies.push(Math.sqrt(sum / windowSize));
        timestamps.push(i / sampleRate);
    }

    // Find significant energy changes
    const changes: number[] = [];
    const threshold = sensitivityMs / 1000; // Higher sensitivity = smaller changes detected
    const minChange = 0.1 + (threshold * 0.5); // Minimum RMS change to detect

    for (let i = 5; i < energies.length - 5; i++) {
        // Compare current to previous average (detect sudden changes)
        const prevAvg = (energies[i - 5] + energies[i - 4] + energies[i - 3] + energies[i - 2] + energies[i - 1]) / 5;
        const currAvg = (energies[i] + energies[i + 1] + energies[i + 2]) / 3;

        const delta = Math.abs(currAvg - prevAvg);

        if (delta > minChange) {
            // Check it's the peak of change
            const prevDelta = Math.abs(energies[i] - energies[i - 1]);
            const nextDelta = Math.abs(energies[i + 1] - energies[i]);

            if (delta >= prevDelta && delta >= nextDelta) {
                const timestamp = timestamps[i];
                // Debounce
                if (changes.length === 0 || timestamp - changes[changes.length - 1] > 1.0) {
                    changes.push(timestamp);
                }
            }
        }
    }

    console.log(`[Intensity] Detected ${changes.length} energy changes (buildups/drops)`);
    return changes;
}

// Detect harmonic/chord changes using spectral analysis
function detectHarmonicChanges(audioBuffer: AudioBuffer, sensitivityMs: number): number[] {
    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;

    // Use larger FFT for frequency resolution (needed for chords)
    const fftSize = 4096;
    const hopSize = 2048;

    // Simplified spectral centroid tracking (approximates tonal changes)
    const centroids: number[] = [];
    const timestamps: number[] = [];

    for (let i = 0; i < channelData.length - fftSize; i += hopSize) {
        // Calculate spectral centroid (weighted mean of frequencies)
        let sumMag = 0;
        let sumFreqMag = 0;

        // Simple energy in different frequency bands
        const lowBand = { start: 0, end: Math.floor(fftSize * 0.1), energy: 0 };   // Bass
        const midBand = { start: Math.floor(fftSize * 0.1), end: Math.floor(fftSize * 0.4), energy: 0 }; // Mids
        const highBand = { start: Math.floor(fftSize * 0.4), end: Math.floor(fftSize * 0.8), energy: 0 }; // Highs

        for (let j = 0; j < fftSize; j++) {
            const sample = channelData[i + j] || 0;
            const mag = Math.abs(sample);
            sumMag += mag;
            sumFreqMag += j * mag;

            if (j >= lowBand.start && j < lowBand.end) lowBand.energy += mag;
            if (j >= midBand.start && j < midBand.end) midBand.energy += mag;
            if (j >= highBand.start && j < highBand.end) highBand.energy += mag;
        }

        const centroid = sumMag > 0 ? sumFreqMag / sumMag : 0;
        centroids.push(centroid);
        timestamps.push(i / sampleRate);
    }

    // Find significant centroid changes (indicate chord/key changes)
    const changes: number[] = [];
    const windowSize = 5;
    const minInterval = sensitivityMs / 1000;

    for (let i = windowSize; i < centroids.length - windowSize; i++) {
        // Local average comparison
        let prevSum = 0, nextSum = 0;
        for (let j = 1; j <= windowSize; j++) {
            prevSum += centroids[i - j];
            nextSum += centroids[i + j];
        }
        const prevAvg = prevSum / windowSize;
        const nextAvg = nextSum / windowSize;

        const changeRatio = Math.abs(nextAvg - prevAvg) / (prevAvg + 0.001);

        // Significant tonal shift
        if (changeRatio > 0.15) {
            const timestamp = timestamps[i];
            if (changes.length === 0 || timestamp - changes[changes.length - 1] > minInterval) {
                changes.push(timestamp);
            }
        }
    }

    console.log(`[Harmonic] Detected ${changes.length} harmonic/chord changes`);
    return changes;
}
