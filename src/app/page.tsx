'use client';

import Dropzone from '@/components/Dropzone';
import Storyboard from '@/components/Storyboard';

import Timeline from '@/components/Timeline';
import {
  useStore,
  BeatAlgorithm
} from '@/store/useStore';
import { useAudioAnalysis } from '@/hooks/useAudioAnalysis';
import { useState } from 'react';
import { generateTimeline } from '@/utils/auto-editor';
import { generateXML } from '@/utils/xml-generator';
import {
  Download, Sparkles, Wand2, Music, Video as VideoIcon,
  ChevronRight, CheckCircle2, LayoutTemplate, ArrowRight, Trash2, X,
  Settings, RefreshCw, GripVertical, CodeXml
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export default function Home() {
  const { videos, audio, status, currentStage, setStage, removeVideo, removeAudio, syncSettings, setSyncSettings } = useStore();
  useAudioAnalysis();

  const [title, setTitle] = useState("CLIP--XML");

  // Auto-advance logic (optional, but convenient)
  // useEffect(() => {
  //   if (currentStage === 'upload' && videos.length > 0 && !!audio) {
  //     setStage('editor');
  //   }
  // }, [videos.length, !!audio, currentStage, setStage]);

  const handleExport = () => {
    if (!audio) return;
    const timeline = generateTimeline(videos, audio, syncSettings);
    const xml = generateXML(timeline, audio, title);

    const blob = new Blob([xml], { type: 'text/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isUploadComplete = videos.length > 0 && !!audio;

  // Navigation Steps
  const steps = [
    { id: 'upload', label: 'Upload Media', icon: <VideoIcon className="w-4 h-4" /> },
    { id: 'editor', label: 'Edit & Sync', icon: <LayoutTemplate className="w-4 h-4" /> },
    { id: 'export', label: 'Export', icon: <Download className="w-4 h-4" /> },
  ] as const;

  return (
    <main className="min-h-screen bg-background text-foreground p-4 md:p-8 font-sans selection:bg-primary/20">

      {/* Header & Navigation */}
      <header className="mb-12 pt-8 flex flex-col items-center">
        <div className="inline-flex items-center justify-center gap-2 mb-8 group cursor-default">
          <div className="bg-primary/20 p-2 rounded-xl group-hover:bg-primary/30 transition-colors">
            <CodeXml className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white uppercase">
            CLIP <span className="text-primary">--</span> XML <span className="text-sm font-medium text-muted">AI</span>
          </h1>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-4 bg-surface/50 p-2 rounded-full border border-border/50 backdrop-blur-sm shadow-xl">
          {steps.map((step, idx) => {
            const isActive = currentStage === step.id;
            const isCompleted = steps.indexOf(step) < steps.findIndex(s => s.id === currentStage);

            return (
              <div key={step.id} className="flex items-center">
                <button
                  onClick={() => setStage(step.id)}
                  className={twMerge(
                    "flex items-center gap-2 px-4 py-2 rounded-full transition-all text-sm font-medium",
                    isActive ? "bg-primary text-white shadow-lg shadow-primary/20" :
                      isCompleted ? "text-green-400 hover:bg-surface/80" : "text-muted hover:text-white hover:bg-surface/50"
                  )}
                >
                  {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : step.icon}
                  {step.label}
                </button>
                {idx < steps.length - 1 && (
                  <div className="w-8 h-[1px] bg-border mx-2" />
                )}
              </div>
            );
          })}
        </div>
      </header>

      <div className="max-w-7xl mx-auto pb-20">

        {/* VIEW: UPLOAD */}
        {currentStage === 'upload' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold text-white mb-2">Start Your Project</h2>
              <p className="text-muted text-lg">Upload your source footage and a backing track.</p>
            </div>

            <section className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
              {/* Video Section */}
              <div className="space-y-4 flex flex-col">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold flex items-center gap-2 text-white">
                    <VideoIcon className="w-5 h-5 text-blue-400" /> Video Clips
                  </h3>
                  <span className={clsx("text-xs px-2 py-1 rounded-full", videos.length > 0 ? "bg-green-500/20 text-green-400" : "bg-surface text-muted")}>
                    {videos.length} clips
                  </span>
                </div>

                <Dropzone type="video" className="h-[200px] border-dashed border-2 border-border hover:border-primary/50 transition-colors" />

                {/* Video List */}
                {videos.length > 0 && (
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 animate-in fade-in slide-in-from-top-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                    {videos.map((video) => (
                      <div key={video.id} className="group relative aspect-video bg-surface rounded-lg overflow-hidden border border-border shadow-sm hover:border-primary/50 transition-all">
                        {video.thumbnail && (
                          <img src={video.thumbnail} alt={video.name} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                        )}
                        <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors" />

                        <button
                          onClick={() => removeVideo(video.id)}
                          className="absolute top-1.5 right-1.5 p-1.5 bg-black/60 hover:bg-red-500 text-white rounded-md backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100 transform translate-y-1 group-hover:translate-y-0"
                          title="Remove clip"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>

                        <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/90 via-black/50 to-transparent">
                          <p className="text-xs text-white truncate font-medium">{video.name}</p>
                          <p className="text-[10px] text-gray-300 font-mono">{(video.duration).toFixed(1)}s</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Audio Section */}
              <div className="space-y-4 flex flex-col">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold flex items-center gap-2 text-white">
                    <Music className="w-5 h-5 text-purple-400" /> Audio Track
                  </h3>
                  <span className={clsx("text-xs px-2 py-1 rounded-full", audio ? "bg-green-500/20 text-green-400" : "bg-surface text-muted")}>
                    {audio ? 'Ready' : 'Required'}
                  </span>
                </div>

                {!audio ? (
                  <Dropzone type="audio" className="h-[200px] border-dashed border-2 border-border hover:border-primary/50 transition-colors" />
                ) : (
                  <div className="animate-in fade-in zoom-in-95 duration-300">
                    <div className="bg-surface/50 border border-border p-4 rounded-xl flex items-center gap-4 group relative overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                      <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center text-purple-400">
                        <Music className="w-6 h-6" />
                      </div>
                      <div className="flex-1 min-w-0 z-10">
                        <p className="font-medium text-white truncate text-lg">{audio.name}</p>
                        <p className="text-sm text-muted">
                          <span className="text-purple-300">{audio.duration.toFixed(1)}s</span> • {audio.beats.length} beats detected
                        </p>
                      </div>
                      <button
                        onClick={removeAudio}
                        className="p-2.5 hover:bg-red-500/10 hover:text-red-500 text-muted transition-colors rounded-lg z-10"
                        title="Remove audio"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl text-sm text-blue-200 flex gap-2 items-start">
                      <div className="mt-0.5">💡</div>
                      <p>Tip: Ensure your audio has a clear rhythmic beat for the best auto-sync results.</p>
                    </div>
                  </div>
                )}
              </div>
            </section>

            <div className="flex justify-center">
              <button
                disabled={!isUploadComplete}
                onClick={() => setStage('editor')}
                className={twMerge(
                  "group py-3 px-8 rounded-full font-bold text-lg flex items-center gap-3 transition-all",
                  "bg-white text-black hover:bg-gray-200 shadow-xl shadow-white/10",
                  "disabled:opacity-20 disabled:cursor-not-allowed"
                )}
              >
                Start Editing
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        )}

        {/* VIEW: EDITOR */}
        {currentStage === 'editor' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 mt-4">
            {/* Status Bar */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Editor</h2>
              <div className="flex items-center gap-4">
                {status === 'analyzing' ? (
                  <div className="flex items-center gap-2 px-3 py-1 bg-yellow-500/20 rounded-full text-yellow-400 text-sm">
                    <span className="animate-spin">⏳</span> Analyzing Audio...
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-1 bg-green-500/20 rounded-full text-green-400 text-sm">
                    <CheckCircle2 className="w-4 h-4" /> Synced to Beat
                  </div>
                )}

                <button
                  onClick={() => setStage('export')}
                  className="bg-primary hover:bg-primary-hover text-white px-5 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
                >
                  Next Step <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-[calc(100vh-250px)]">
              {/* Left: Settings & Storyboard */}
              <div className="lg:col-span-12 xl:col-span-4 flex flex-col gap-4 h-full overflow-hidden">

                {/* Sync Settings Panel */}
                <div className="bg-surface rounded-xl border border-gray-800 p-4 shadow-sm shrink-0">
                  <div className="flex items-center gap-2 mb-4 text-white font-medium border-b border-gray-800 pb-2">
                    <Settings className="w-4 h-4 text-primary" /> Sync Settings
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs text-muted uppercase tracking-wider font-semibold">Min Clip (s)</label>
                      <input
                        type="number"
                        title="Minimum Clip Duration"
                        step="0.1"
                        min="0.1"
                        max={syncSettings.maxDuration}
                        value={isNaN(syncSettings.minDuration) ? '' : syncSettings.minDuration}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setSyncSettings({ minDuration: isNaN(val) ? 0.1 : val });
                        }}
                        className="w-full bg-black/50 border border-gray-800 rounded px-2 py-1.5 text-sm text-white focus:border-primary outline-none"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs text-muted uppercase tracking-wider font-semibold">Max Clip (s)</label>
                      <input
                        type="number"
                        title="Maximum Clip Duration"
                        step="0.1"
                        min={syncSettings.minDuration}
                        max="10"
                        value={isNaN(syncSettings.maxDuration) ? '' : syncSettings.maxDuration}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setSyncSettings({ maxDuration: isNaN(val) ? 1.0 : val });
                        }}
                        className="w-full bg-black/50 border border-gray-800 rounded px-2 py-1.5 text-sm text-white focus:border-primary outline-none"
                      />
                    </div>
                  </div>

                  {/* Algorithm Selector */}
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-muted uppercase tracking-wider font-semibold">Analysis Algorithm</label>
                      {audio?.bpm && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-primary font-mono font-bold">{audio.bpm} BPM</span>
                          <span className="text-xs text-muted">•</span>
                          <span className="text-xs text-muted">{audio.beats?.length || 0} beats</span>
                        </div>
                      )}
                    </div>
                    <select
                      value={syncSettings.algorithm}
                      title="Music Analysis Algorithm"
                      onChange={(e) => setSyncSettings({ algorithm: e.target.value as BeatAlgorithm })}
                      className="w-full bg-black/50 border border-gray-800 rounded px-2 py-1.5 text-sm text-white focus:border-primary outline-none"
                    >
                      <optgroup label="🎯 General">
                        <option value="energy">⚡ Energy Based (Standard)</option>
                        <option value="spectral">🌊 Frequency (spectral)</option>
                      </optgroup>
                      <optgroup label="🎛️ Instruments">
                        <option value="drums">🥁 Drums (Kick/Snare)</option>
                        <option value="bass">🎸 Bass (Low Freq)</option>
                        <option value="guitar">🎸 Guitar (Mid Freq)</option>
                        <option value="brass">🎺 Brass (Horns)</option>
                        <option value="keys">🎹 Keys (Piano/Synth)</option>
                      </optgroup>
                      <optgroup label="🎤 Voice">
                        <option value="vocals">🎤 Vocals (Singing)</option>
                        <option value="voice">🗣️ Voice (Speech)</option>
                        <option value="words">💬 Words (По словам)</option>
                        <option value="sentences">📝 Sentences (По предложениям)</option>
                      </optgroup>
                      <optgroup label="🎼 Structure">
                        <option value="melody">🎵 Melody (Мелодия)</option>
                        <option value="silence">🔇 Silence (Паузы)</option>
                        <option value="downbeat">1️⃣ Downbeat (Первый бит)</option>
                        <option value="phrase">🎼 Phrase (Фразы 4-8 тактов)</option>
                        <option value="intensity">📈 Intensity (Build-up/Drop)</option>
                        <option value="harmonic">🎹 Harmonic (Смена аккордов)</option>
                      </optgroup>
                      <optgroup label="🔥 Combo">
                        <option value="combo-edm">🔥 EDM (Drums+Bass)</option>
                        <option value="combo-clip">🎬 Music Video (Vocals+Drums)</option>
                      </optgroup>
                      <optgroup label="🧪 Experimental">
                        <option value="ai">🧠 AI Model (Legacy)</option>
                      </optgroup>
                    </select>
                  </div>

                  {/* Beat Sensitivity (Debounce) */}
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={(syncSettings.beatSensitivity || 0) > 0}
                          onChange={(e) => setSyncSettings({ beatSensitivity: e.target.checked ? 100 : 0 })}
                          className="w-4 h-4 accent-primary cursor-pointer"
                        />
                        <span className="text-xs text-muted uppercase tracking-wider font-semibold">Beat Sensitivity</span>
                      </label>
                      <span className="text-xs text-primary font-mono">
                        {(syncSettings.beatSensitivity || 0) === 0
                          ? 'OFF'
                          : syncSettings.beatSensitivity >= 1000
                            ? `${(syncSettings.beatSensitivity / 1000).toFixed(1)}s`
                            : `${syncSettings.beatSensitivity}ms`}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="2000"
                      step="50"
                      value={syncSettings.beatSensitivity || 100}
                      onChange={(e) => setSyncSettings({ beatSensitivity: parseInt(e.target.value) })}
                      disabled={(syncSettings.beatSensitivity || 0) === 0}
                      className={`w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-primary ${(syncSettings.beatSensitivity || 0) === 0 ? 'opacity-30' : ''}`}
                      title="Минимальный интервал между битами (меньше = больше битов)"
                    />
                    <div className="flex justify-between text-[10px] text-muted">
                      <span>50ms (очень часто)</span>
                      <span>2s (редко)</span>
                    </div>
                  </div>

                  {/* Skip Every N */}
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-muted uppercase tracking-wider font-semibold">Skip Beats</label>
                      <span className="text-xs text-primary font-mono">каждый {syncSettings.skipEveryN || 1}-й</span>
                    </div>
                    <select
                      value={syncSettings.skipEveryN || 1}
                      onChange={(e) => setSyncSettings({ skipEveryN: parseInt(e.target.value) })}
                      className="w-full bg-black/50 border border-gray-800 rounded px-2 py-1.5 text-sm text-white focus:border-primary outline-none"
                    >
                      <option value={1}>Каждый бит</option>
                      <option value={2}>Каждый 2-й бит</option>
                      <option value={3}>Каждый 3-й бит</option>
                      <option value={4}>Каждый 4-й бит (1 на такт)</option>
                      <option value={8}>Каждый 8-й бит (редко)</option>
                    </select>
                  </div>

                  {/* Duration Variance */}
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-muted uppercase tracking-wider font-semibold">Duration Variance</label>
                      <span className="text-xs text-primary font-mono">{syncSettings.durationVariance || 0}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="50"
                      step="5"
                      value={syncSettings.durationVariance || 0}
                      onChange={(e) => setSyncSettings({ durationVariance: parseInt(e.target.value) })}
                      className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-primary"
                      title="Случайная вариация длительности клипов"
                    />
                    <div className="flex justify-between text-[10px] text-muted">
                      <span>0% (точно)</span>
                      <span>50% (разнообразно)</span>
                    </div>
                  </div>

                  {/* Quick Presets */}
                  <div className="mt-4 space-y-2">
                    <label className="text-xs text-muted uppercase tracking-wider font-semibold">Quick Preset</label>
                    <select
                      onChange={(e) => {
                        const preset = e.target.value;
                        if (preset === 'fast-cuts') {
                          setSyncSettings({ algorithm: 'drums', beatSensitivity: 100, skipEveryN: 1, durationVariance: 10 });
                        } else if (preset === 'chill') {
                          setSyncSettings({ algorithm: 'phrase', beatSensitivity: 1000, skipEveryN: 4, durationVariance: 20 });
                        } else if (preset === 'music-video') {
                          setSyncSettings({ algorithm: 'combo-clip', beatSensitivity: 200, skipEveryN: 2, durationVariance: 15 });
                        } else if (preset === 'edm-drop') {
                          setSyncSettings({ algorithm: 'intensity', beatSensitivity: 500, skipEveryN: 1, durationVariance: 0 });
                        } else if (preset === 'melodic') {
                          setSyncSettings({ algorithm: 'harmonic', beatSensitivity: 800, skipEveryN: 4, durationVariance: 25 });
                        } else if (preset === 'speech') {
                          setSyncSettings({ algorithm: 'sentences', beatSensitivity: 500, skipEveryN: 1, durationVariance: 10 });
                        }
                      }}
                      className="w-full bg-black/50 border border-gray-800 rounded px-2 py-1.5 text-sm text-white focus:border-primary outline-none"
                    >
                      <option value="">— Выбрать пресет —</option>
                      <option value="fast-cuts">⚡ Fast Cuts (быстрые склейки)</option>
                      <option value="chill">🌊 Chill (спокойный)</option>
                      <option value="music-video">🎬 Music Video (клип)</option>
                      <option value="edm-drop">🔥 EDM Drop (дропы)</option>
                      <option value="melodic">🎵 Melodic (мелодичный)</option>
                      <option value="speech">🎤 Speech (речь/подкаст)</option>
                    </select>
                  </div>

                  {/* Crop Mode Selector */}
                  <div className="mt-4 space-y-2">
                    <label className="text-xs text-muted uppercase tracking-wider font-semibold">Crop Method</label>
                    <select
                      value={syncSettings.cropMode || 'smart'}
                      title="Video Fragment Selection Method"
                      onChange={(e) => setSyncSettings({ cropMode: e.target.value as 'smart' | 'random' })}
                      className="w-full bg-black/50 border border-gray-800 rounded px-2 py-1.5 text-sm text-white focus:border-primary outline-none"
                    >
                      <option value="smart">🎯 Smart (Weighted Center)</option>
                      <option value="random">🎲 Random (Full Range)</option>
                    </select>
                  </div>

                  {/* Video Placement Selector */}
                  <div className="mt-4 space-y-2">
                    <label className="text-xs text-muted uppercase tracking-wider font-semibold">Video Arrangement</label>
                    <select
                      value={syncSettings.videoMode || 'beat-locked'}
                      title="Video Clip Arrangement Mode"
                      onChange={(e) => setSyncSettings({ videoMode: e.target.value as 'sequential-once' | 'random-loop' | 'beat-locked' })}
                      className="w-full bg-black/50 border border-gray-800 rounded px-2 py-1.5 text-sm text-white focus:border-primary outline-none"
                    >
                      <option value="beat-locked">🎯 Beat-Locked (Точно по битам)</option>
                      <option value="random-loop">🔀 Random Loop (Fill Track)</option>
                      <option value="sequential-once">1️⃣ Sequential (One Pass)</option>
                    </select>
                  </div>


                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={() => {
                        // Trick to force regen: slightly toggle minDuration then back? 
                        // Actually, purely creating a new object ref in store might trigger it if we change a 'seed' or similar. 
                        // But right now randomization happens every time generateTimeline is called.
                        // And generateTimeline is called when syncSettings changes.
                        // So just 'confirming' isn't needed if it's instant, OR we want a "Re-roll" button.
                        setSyncSettings({ ...syncSettings }); // Force update ref to re-trigger memo
                      }}
                      className="text-xs flex items-center gap-1.5 text-primary hover:text-white transition-colors"
                    >
                      <RefreshCw className="w-3 h-3" /> Regenerate Sync
                    </button>
                  </div>
                </div>

                <div className="bg-surface rounded-xl border border-border p-4 shadow-sm flex-1 overflow-y-auto">
                  <Storyboard />
                </div>
              </div>

              {/* Right: Timeline (Replaces Player) */}
              <div className="lg:col-span-12 xl:col-span-8 flex flex-col gap-6 h-full min-h-0">
                <Timeline />
              </div>
            </div>
          </div>
        )}

        {/* VIEW: EXPORT */}
        {currentStage === 'export' && (
          <div className="animate-in fade-in zoom-in-95 duration-500 max-w-xl mx-auto mt-10">
            <div className="bg-surface p-8 rounded-2xl border border-border/50 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2 pointer-events-none" />

              <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                <Sparkles className="w-6 h-6 text-primary" /> Finalize & Export
              </h2>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-muted mb-2 uppercase tracking-wide">Project Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full bg-background border border-border rounded-xl p-4 focus:border-primary outline-none text-white text-lg transition-all focus:ring-2 focus:ring-primary/20"
                    placeholder="My Masterpiece"
                  />
                </div>

                <div className="space-y-3">
                  <div className="p-4 bg-background/50 rounded-xl border border-border flex justify-between items-center group hover:border-primary/50 transition-colors">
                    <span className="text-muted group-hover:text-white transition-colors">Output Format</span>
                    <span className="font-mono text-primary bg-primary/10 px-2 py-1 rounded">FCP7 XML</span>
                  </div>
                  <div className="p-4 bg-background/50 rounded-xl border border-border flex justify-between items-center group hover:border-primary/50 transition-colors">
                    <span className="text-muted group-hover:text-white transition-colors">Target Resolution</span>
                    <span className="font-mono text-white">Original / Source</span>
                  </div>
                  <div className="p-4 bg-background/50 rounded-xl border border-border flex justify-between items-center group hover:border-primary/50 transition-colors">
                    <span className="text-muted group-hover:text-white transition-colors">Total Duration</span>
                    <span className="font-mono text-white">{audio ? `${audio.duration.toFixed(1)}s` : '--'}</span>
                  </div>
                </div>

                <button
                  onClick={handleExport}
                  className={twMerge(
                    "w-full py-5 px-6 rounded-xl font-bold text-xl flex items-center justify-center gap-3 transition-all relative overflow-hidden",
                    "bg-white text-black hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-white/20",
                  )}
                >
                  <Wand2 className="w-6 h-6" />
                  Download XML
                </button>

                <p className="text-center text-xs text-muted">
                  Import the generated XML int Premiere Pro, DaVinci Resolve, or Final Cut.
                </p>
              </div>
            </div>
          </div>
        )}

      </div>
    </main >
  );
}
