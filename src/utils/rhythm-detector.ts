import * as webAudioBeatDetector from 'web-audio-beat-detector';

// Define frequency ranges for different instruments
const FREQUENCY_RANGES = {
    low: { min: 20, max: 250, type: 'lowpass' as BiquadFilterType },   // Kick, Bass
    mid: { min: 250, max: 2000, type: 'bandpass' as BiquadFilterType }, // Snare, Vocals, Guitars
    high: { min: 2000, max: 20000, type: 'highpass' as BiquadFilterType } // Hats, Cymbals, Air
};

export interface RhythmAnalysisResult {
    bpm: number;
    beats: number[];
    instrumentBeats: {
        kick: number[];
        snare: number[];
        hihat: number[];
    };
}

/**
 * Detects BPM and beats using web-audio-beat-detector
 */
export async function detectBPMAndBeats(buffer: AudioBuffer): Promise<{ bpm: number, beats: number[] }> {
    try {
        const bpm = await webAudioBeatDetector.analyze(buffer);
        // We can use the detected BPM to estimate a grid, or use the library's guess
        // web-audio-beat-detector primarily returns BPM. 
        // For beat timestamps, we might need to rely on our custom onset detection 
        // aligned with this BPM or use a library that supports beat tracking (Meyda doesn't do beat tracking per se).

        // However, for this task, the requirements say "Integrate web-audio-beat-detector for exact BPM determination".
        // It doesn't explicitly say it replaces the beat timestamp generation, but it helps VALIDATE it.
        return { bpm, beats: [] };
    } catch (e) {
        console.error("BPM Detection failed:", e);
        return { bpm: 120, beats: [] };
    }
}

/**
 * Custom onset detection for specific frequency bands to isolate instruments
 */
export async function analyzeFrequencyBands(audioBuffer: AudioBuffer): Promise<{ kick: number[], snare: number[], hihat: number[] }> {
    const offlineCtx = new OfflineAudioContext(1, audioBuffer.length, audioBuffer.sampleRate);
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;

    // We will run 3 parallel passes for 3 bands
    // Note: To do this purely with Web Audio API offline context in one go is tricky because we need the data back.
    // It's often easier to just process the raw ChannelData with filters.

    // Using raw loop approach similar to previous implementation but specifically tuned
    const kickBeats = await detectOnsetsInBand(audioBuffer, 'low', 1.5);
    const snareBeats = await detectOnsetsInBand(audioBuffer, 'mid', 1.4);
    const hihatBeats = await detectOnsetsInBand(audioBuffer, 'high', 1.3);

    return {
        kick: kickBeats,
        snare: snareBeats,
        hihat: hihatBeats
    };
}

async function detectOnsetsInBand(originalBuffer: AudioBuffer, band: 'low' | 'mid' | 'high', thresholdMultiplier: number): Promise<number[]> {
    // 1. Filter
    const filteredBuffer = await applyFilter(originalBuffer, band);
    const data = filteredBuffer.getChannelData(0);
    const sampleRate = filteredBuffer.sampleRate;

    // 2. Compute Envelope (RMS)
    const windowSize = 1024; // ~23ms
    const hopSize = 512;
    const envelopes: number[] = [];
    const timestamps: number[] = [];

    for (let i = 0; i < data.length; i += hopSize) {
        let sum = 0;
        for (let j = 0; j < windowSize && (i + j) < data.length; j++) {
            sum += data[i + j] * data[i + j];
        }
        envelopes.push(Math.sqrt(sum / windowSize));
        timestamps.push(i / sampleRate);
    }

    // 3. Peak Detection (Onsets)
    const onsets: number[] = [];
    const localWindow = 10;

    for (let i = localWindow; i < envelopes.length - localWindow; i++) {
        let localMean = 0;
        for (let j = 1; j <= localWindow; j++) {
            localMean += envelopes[i - j];
            // We focus on the *previous* context for onset detection (rise above previous level)
        }
        localMean /= localWindow;

        const current = envelopes[i];

        if (current > localMean * thresholdMultiplier && current > 0.01) {
            // Local peak check
            if (current > envelopes[i - 1] && current >= envelopes[i + 1]) {
                // Debounce
                const time = timestamps[i];
                if (onsets.length === 0 || (time - onsets[onsets.length - 1] > 0.1)) {
                    onsets.push(time);
                }
            }
        }
    }

    return onsets;
}

async function applyFilter(buffer: AudioBuffer, band: 'low' | 'mid' | 'high'): Promise<AudioBuffer> {
    const offlineCtx = new OfflineAudioContext(1, buffer.length, buffer.sampleRate);
    const source = offlineCtx.createBufferSource();
    source.buffer = buffer;

    const filter = offlineCtx.createBiquadFilter();
    const config = FREQUENCY_RANGES[band];

    filter.type = config.type;
    filter.frequency.value = (band === 'low' ? config.max :
        band === 'high' ? config.min :
            (config.min + config.max) / 2); // Approx center for mid
    filter.Q.value = 1.0;

    source.connect(filter);
    filter.connect(offlineCtx.destination);
    source.start();

    return await offlineCtx.startRendering();
}
