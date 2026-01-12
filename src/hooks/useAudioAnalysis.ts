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

    // 2. Detect Beats (Re-run if buffer or algorithm changes)
    useEffect(() => {
        if (!audio?.buffer) return;

        // Skip if same algorithm was already processed for this audio
        if (audio.detectedWithAlgorithm === syncSettings.algorithm) return;

        if (processingRef.current) return;

        const processBeats = async () => {
            processingRef.current = true;
            setStatus('analyzing');
            console.log(`Analyzing beats with algorithm: ${syncSettings.algorithm}`);

            try {
                // Apply filters if needed
                let processingBuffer = audio.buffer!;

                if (['drums', 'vocals', 'voice', 'brass', 'keys'].includes(syncSettings.algorithm)) {
                    processingBuffer = await applyAudioFilter(audio.buffer!, syncSettings.algorithm);
                }

                // Run detection (wrapped in timeout to unblock UI)
                const currentAlgo = syncSettings.algorithm;
                setTimeout(() => {
                    const beats = detectBeats(processingBuffer);
                    setBeats(beats, currentAlgo);
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

    }, [audio?.buffer, audio?.detectedWithAlgorithm, syncSettings.algorithm, setBeats, setStatus]);
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
        filter.frequency.value = 120; // Tighten kick detection
        filter.Q.value = 1.0;
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

// Advanced beat detection using Energy Flux (Delta Energy)
function detectBeats(audioBuffer: AudioBuffer): number[] {
    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;

    // Parameters for analysis
    const fftSize = 1024; // Smaller window for better time resolution (~23ms)
    const hopSize = 512;  // 50% overlap (~11ms steps)

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
    // We look for peaks in the flux that are significantly higher than the local average
    const peaks: number[] = [];
    const windowSize = 25; // ~280ms local window

    // Safety check for empty audio
    if (flux.length < windowSize) return [];

    for (let i = windowSize; i < flux.length - 1; i++) {
        const currentFlux = flux[i];

        // Calculate local threshold (mean + small constant)
        let sumLocal = 0;
        for (let h = 1; h <= windowSize; h++) sumLocal += flux[i - h];
        const localAvg = sumLocal / windowSize;

        // Peak detection logic
        // 1. Must be higher than local average * multiplier
        // 2. Must be a local maximum (to avoid multiple triggers on same slope)
        // 3. Must be above an absolute noise floor
        const multiplier = 1.6;
        const noiseFloor = 0.01;

        if (currentFlux > localAvg * multiplier &&
            currentFlux > flux[i - 1] &&
            currentFlux > flux[i + 1] &&
            currentFlux > noiseFloor) {

            const timestamp = (i * hopSize) / sampleRate;

            // 4. Debouncing (Minimum 200ms between beats to feel rhythmic - ~300 BPM max)
            if (peaks.length === 0 || (timestamp - peaks[peaks.length - 1] > 0.20)) {
                peaks.push(timestamp);
            }
        }
    }

    console.log(`[Analysis] Detected ${peaks.length} precise onsets`);
    return peaks;
}
