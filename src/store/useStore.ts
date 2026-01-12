import { create } from 'zustand';

export interface VideoClip {
  id: string;
  file: File;
  name: string;
  duration: number;
  thumbnail: string;
}

export interface AudioTrack {
  id: string;
  file: File;
  name: string;
  duration: number;
  buffer: AudioBuffer | null;
  beats: number[]; // Array of timestamps in seconds
  detectedWithAlgorithm?: BeatAlgorithm;
}

export type BeatAlgorithm = 'energy' | 'spectral' | 'ai' | 'drums' | 'vocals' | 'voice' | 'brass' | 'keys';

export interface SyncSettings {
  minDuration: number;
  maxDuration: number;
  algorithm: BeatAlgorithm;
  videoMode: 'sequential-once' | 'random-loop';
  cropMode: 'random' | 'smart';
}

interface AppState {
  videos: VideoClip[];
  audio: AudioTrack | null;
  status: 'idle' | 'analyzing' | 'ready' | 'playing' | 'exporting';
  currentStage: 'upload' | 'editor' | 'export';
  syncSettings: SyncSettings;
  currentTime: number;

  // Actions
  addVideos: (videos: VideoClip[]) => void;
  setAudio: (audio: AudioTrack) => void;
  setBeats: (beats: number[], algorithm: BeatAlgorithm) => void;
  setAudioBuffer: (buffer: AudioBuffer) => void;
  setStatus: (status: AppState['status']) => void;
  setStage: (stage: AppState['currentStage']) => void;
  setSyncSettings: (settings: Partial<SyncSettings>) => void;
  setCurrentTime: (time: number) => void;
  reorderVideos: (startIndex: number, endIndex: number) => void;
  removeVideo: (id: string) => void;
  removeAudio: () => void;
  reset: () => void;
}

export const useStore = create<AppState>((set) => ({
  videos: [],
  audio: null,
  status: 'idle',
  currentStage: 'upload',
  syncSettings: { minDuration: 0.5, maxDuration: 4.0, algorithm: 'energy', videoMode: 'random-loop', cropMode: 'smart' },
  currentTime: 0,

  addVideos: (newVideos) => set((state) => ({
    videos: [...state.videos, ...newVideos]
  })),

  setAudio: (audio) => set({ audio }),

  setBeats: (beats, algorithm) => set((state) => ({
    audio: state.audio ? { ...state.audio, beats, detectedWithAlgorithm: algorithm } : null
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

  reorderVideos: (startIndex, endIndex) => set((state) => {
    const result = Array.from(state.videos);
    const [removed] = result.splice(startIndex, 1);
    result.splice(endIndex, 0, removed);
    return { videos: result };
  }),

  removeVideo: (id) => set((state) => ({
    videos: state.videos.filter((v) => v.id !== id)
  })),

  removeAudio: () => set({ audio: null }),

  reset: () => set({
    videos: [],
    audio: null,
    status: 'idle',
    currentStage: 'upload',
    syncSettings: { minDuration: 0.5, maxDuration: 4.0, algorithm: 'energy', videoMode: 'random-loop', cropMode: 'smart' },
    currentTime: 0
  }),
}));
