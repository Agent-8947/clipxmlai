import { create } from 'zustand';

export interface MediaClip {
  id: string;
  type: 'video' | 'image';
  file: File;
  name: string;
  duration: number; // For images, default to a reasonable value or 0
  thumbnail: string;
}

export interface AudioTrack {
  id: string;
  file: File;
  name: string;
  duration: number;
  buffer: AudioBuffer | null;
  beats: number[]; // Array of timestamps in seconds
  bpm?: number; // Detected tempo
  detectedWithAlgorithm?: BeatAlgorithm;
  instrumentBeats?: {
    kick: number[];
    snare: number[];
    hihat: number[];
  };
}

export type BeatAlgorithm = 'energy' | 'spectral' | 'ai' | 'drums' | 'bass' | 'guitar' | 'vocals' | 'voice' | 'words' | 'sentences' | 'melody' | 'brass' | 'keys' | 'silence' | 'downbeat' | 'phrase' | 'intensity' | 'harmonic' | 'combo-edm' | 'combo-clip';

export interface RhythmSegment {
  id: string;
  startTime: number;
  endTime: number;
  skipEveryN: number;
}

export interface SyncSettings {
  minDuration: number;
  maxDuration: number;
  algorithm: BeatAlgorithm;
  videoMode: 'sequential-once' | 'random-loop' | 'beat-locked' | 'metronome';
  cropMode: 'random' | 'smart' | 'center' | 'start' | 'end' | 'golden';
  beatSensitivity: number; // Min interval between beats in ms (debounce)
  durationVariance: number; // 0-100% random variance in clip duration
  skipEveryN: number; // Default fallback
  rhythmSegments?: RhythmSegment[]; // Regions with specific override settings
  manualBpm?: number; // Override BPM for metronome mode
}

interface AppState {
  media: MediaClip[];
  audio: AudioTrack | null;
  status: 'idle' | 'analyzing' | 'ready' | 'playing' | 'exporting';
  currentStage: 'upload' | 'editor' | 'export';
  syncSettings: SyncSettings;
  currentTime: number;
  isPlaying: boolean;

  // Actions
  addMedia: (newMedia: MediaClip[]) => void;
  setAudio: (audio: AudioTrack) => void;
  setBeats: (beats: number[], algorithm: BeatAlgorithm, bpm?: number, instrumentBeats?: { kick: number[], snare: number[], hihat: number[] }) => void;
  setAudioBuffer: (buffer: AudioBuffer) => void;
  setStatus: (status: AppState['status']) => void;
  setStage: (stage: AppState['currentStage']) => void;
  setSyncSettings: (settings: Partial<SyncSettings>) => void;
  setCurrentTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  reorderMedia: (startIndex: number, endIndex: number) => void;
  removeMedia: (id: string) => void;
  removeAudio: () => void;
  reset: () => void;
}

export const useStore = create<AppState>((set) => ({
  media: [],
  audio: null,
  status: 'idle',
  currentStage: 'upload',
  syncSettings: { minDuration: 0.5, maxDuration: 4.0, algorithm: 'energy', videoMode: 'beat-locked', cropMode: 'smart', beatSensitivity: 100, durationVariance: 0, skipEveryN: 1 },
  currentTime: 0,
  isPlaying: false,

  addMedia: (newMedia) => set((state) => ({
    media: [...state.media, ...newMedia]
  })),

  setAudio: (audio) => set({ audio }),

  setBeats: (beats, algorithm, bpm, instrumentBeats) => set((state) => ({
    audio: state.audio ? { ...state.audio, beats, bpm, detectedWithAlgorithm: algorithm, instrumentBeats } : null
  })),

  setAudioBuffer: (buffer) => set((state) => ({
    audio: state.audio ? { ...state.audio, buffer, duration: buffer.duration } : null
  })),

  setStatus: (status) => set({ status }),

  setStage: (stage) => set({ currentStage: stage }),

  setSyncSettings: (settings) => set((state) => ({
    syncSettings: { ...state.syncSettings, ...settings }
  })),

  setCurrentTime: (time) => set({ currentTime: time }),
  setIsPlaying: (playing) => set({ isPlaying: playing, status: playing ? 'playing' : 'ready' }),

  reorderMedia: (startIndex, endIndex) => set((state) => {
    const result = Array.from(state.media);
    const [removed] = result.splice(startIndex, 1);
    result.splice(endIndex, 0, removed);
    return { media: result };
  }),

  removeMedia: (id) => set((state) => ({
    media: state.media.filter((v) => v.id !== id)
  })),

  removeAudio: () => set({ audio: null }),

  reset: () => set({
    media: [],
    audio: null,
    status: 'idle',
    currentStage: 'upload',
    syncSettings: { minDuration: 0.5, maxDuration: 4.0, algorithm: 'energy', videoMode: 'beat-locked', cropMode: 'smart', beatSensitivity: 100, durationVariance: 0, skipEveryN: 1 },
    currentTime: 0,
    isPlaying: false
  }),
}));
