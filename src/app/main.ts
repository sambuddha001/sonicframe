/**
 * src/app/main.ts
 * Application Bootstrap & Route Orchestrator
 * Implements Section 8.1 & 8.2 of SONICFRAME Enterprise Architecture v4.0
 */

import { store } from './state/store';
import { AppActions } from './state/actions';
import { DropzoneComponent } from '../modules/video/DropzoneComponent';
import { TimelineCanvas } from '../modules/timeline/TimelineCanvas';
import { CueEditorModal } from '../modules/timeline/CueEditorModal';
import { WavExporter } from '../modules/audio/Exporter';
import type { FoleyCue } from '../types/cueSheet';

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function logMsg(text: string, type: 'ok' | 'warn' | 'cyan' = 'ok'): void {
  const logEl = document.getElementById('log');
  if (!logEl) return;
  const time = new Date().toTimeString().split(' ')[0];
  const p = document.createElement('div');
  p.className = type;
  p.textContent = `[${time}] ${text}`;
  logEl.prepend(p);
}

export function initApp(): void {
  AppActions.initActions();

  // Decorative musical glyphs for TetraByte vibe
  const glyphs = ['♫', '♪', '♬', '♩', '𝄞'];
  for (let i = 0; i < 12; i++) {
    const g = document.createElement('span');
    g.className = 'floating-note';
    g.textContent = glyphs[i % glyphs.length]!;
    g.style.cssText = `position:fixed;z-index:-1;left:${(i * 37) % 96}%;top:${(i * 19) % 92}%;font-size:${16 + (i % 4) * 10}px;color:#e6ebf2;opacity:.035;text-shadow:0 0 16px #fff;pointer-events:none;animation:noteDrift ${9 + i % 5}s ease-in-out ${i * .3}s infinite alternate`;
    document.body.appendChild(g);
  }

  // Elements
  const videoEl = document.getElementById('video') as HTMLVideoElement;
  const dropzoneEl = document.getElementById('dropzone') as HTMLElement;
  const fileInputEl = document.getElementById('fileInput') as HTMLInputElement;
  const browseBtn = document.getElementById('browseBtn') as HTMLButtonElement;
  const emptyStateEl = document.getElementById('empty') as HTMLElement;

  const playBtn = document.getElementById('playBtn') as HTMLButtonElement;
  const backBtn = document.getElementById('backBtn') as HTMLButtonElement;
  const forwardBtn = document.getElementById('forwardBtn') as HTMLButtonElement;
  const seekEl = document.getElementById('seek') as HTMLInputElement;
  const clockEl = document.getElementById('clock') as HTMLElement;

  const fileNameEl = document.getElementById('fileName') as HTMLElement;
  const durationLabelEl = document.getElementById('durationLabel') as HTMLElement;
  const resolutionEl = document.getElementById('resolution') as HTMLElement;

  const sensitivityEl = document.getElementById('sensitivity') as HTMLInputElement;
  const sensitivityValEl = document.getElementById('sensitivityVal') as HTMLElement;
  const moodEl = document.getElementById('mood') as HTMLSelectElement;
  const analyzeBtn = document.getElementById('analyzeBtn') as HTMLButtonElement;
  const analysisStateEl = document.getElementById('analysisState') as HTMLElement;

  const motionMetricEl = document.getElementById('motionMetric') as HTMLElement;
  const impactMetricEl = document.getElementById('impactMetric') as HTMLElement;
  const shiftMetricEl = document.getElementById('shiftMetric') as HTMLElement;

  const tracksEl = document.getElementById('tracks') as HTMLElement;
  const timelineStateEl = document.getElementById('timelineState') as HTMLElement;
  const eventListEl = document.getElementById('eventList') as HTMLElement;

  const exportWavBtn = document.getElementById('exportWavBtn') as HTMLButtonElement;
  const resetBtn = document.getElementById('resetBtn') as HTMLButtonElement;

  // Stems
  const stems = [
    { id: 'ambience', key: 'atmosphere' },
    { id: 'pulse', key: 'pulse' },
    { id: 'foley', key: 'foley' },
    { id: 'texture', key: 'texture' },
  ] as const;

  // 1. Timeline Canvas Controller
  const timelineCanvas = new TimelineCanvas(tracksEl, (timeSec) => {
    AppActions.seekTo(timeSec);
  });

  // 2. Cue Editor Modal Inspector
  const cueEditor = new CueEditorModal(AppActions.audioEngine, (updatedCue: FoleyCue) => {
    const cs = store.getState().orchestrator.cueSheet;
    if (cs) {
      const idx = cs.foley_events.findIndex((c) => c.id === updatedCue.id);
      if (idx !== -1) {
        cs.foley_events[idx] = updatedCue;
        AppActions.audioEngine.loadCueSheet(cs);
        renderEventList(cs.foley_events);
        logMsg(`Updated cue parameters: [Frame ${updatedCue.frame_number}] ${updatedCue.category}`, 'cyan');
      }
    }
  });

  // 3. Dropzone & File Ingestion
  const onFile = async (file: File) => {
    try {
      emptyStateEl.style.display = 'none';
      videoEl.style.display = 'block';
      await AppActions.loadVideoFile(file);
      fileNameEl.textContent = file.name.toUpperCase();
      durationLabelEl.textContent = fmtTime(videoEl.duration || 0);
      resolutionEl.textContent = `${videoEl.videoWidth}×${videoEl.videoHeight}`;
      timelineCanvas.setDuration(videoEl.duration || 15);
      logMsg(`Loaded visual asset: ${file.name} (${fmtTime(videoEl.duration)} @ 30fps)`, 'ok');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logMsg(`Failed to load video: ${msg}`, 'warn');
    }
  };

  if (dropzoneEl) {
    new DropzoneComponent(dropzoneEl, onFile);
  }

  browseBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    fileInputEl?.click();
  });

  fileInputEl?.addEventListener('change', () => {
    if (fileInputEl.files && fileInputEl.files[0]) {
      onFile(fileInputEl.files[0]);
    }
  });

  // 4. Transport Controls
  playBtn?.addEventListener('click', async () => {
    await AppActions.togglePlay();
    playBtn.textContent = videoEl.paused ? '▶' : '❚❚';
  });

  backBtn?.addEventListener('click', () => {
    AppActions.seekTo(Math.max(0, videoEl.currentTime - 1.0));
  });

  forwardBtn?.addEventListener('click', () => {
    AppActions.seekTo(Math.min(videoEl.duration, videoEl.currentTime + 1.0));
  });

  seekEl?.addEventListener('input', () => {
    const frac = Number(seekEl.value) / 1000;
    AppActions.seekTo(frac * (videoEl.duration || 0));
  });

  // Continuous Playback Time Update Loop
  videoEl?.addEventListener('timeupdate', () => {
    const cur = videoEl.currentTime;
    const dur = videoEl.duration || 1;
    clockEl.textContent = fmtTime(cur);
    seekEl.value = String(Math.floor((cur / dur) * 1000));
    timelineCanvas.updatePlayhead(cur);
  });

  // 5. Analysis Trigger & Settings
  sensitivityEl?.addEventListener('input', () => {
    sensitivityValEl.textContent = `${sensitivityEl.value}%`;
  });

  moodEl?.addEventListener('change', () => {
    store.setState({
      orchestrator: {
        ...store.getState().orchestrator,
        mood: moodEl.value as any,
      },
    });
  });

  analyzeBtn?.addEventListener('click', async () => {
    try {
      analyzeBtn.disabled = true;
      analyzeBtn.textContent = '⏳ Computing optical flow & telemetry…';
      analysisStateEl.textContent = 'ANALYZING';
      logMsg('Initiating Dense Pyramidal Optical Flow Worker…', 'cyan');

      await AppActions.runAnalysis();

      analyzeBtn.disabled = false;
      analyzeBtn.textContent = '↻ Re-analyze motion & build score';
      analysisStateEl.textContent = 'TELEMETRY READY';
      timelineStateEl.textContent = 'STEMS ACTIVE';
      logMsg('Analysis complete. Frame-locked modal Foley cues ready.', 'ok');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      analyzeBtn.disabled = false;
      analyzeBtn.textContent = '↻ Retry analysis';
      analysisStateEl.textContent = 'ERROR';
      logMsg(`Analysis error: ${msg}`, 'warn');
    }
  });

  // 6. Mixer Controls
  stems.forEach(({ id, key }) => {
    const volEl = document.getElementById(`${id}Vol`) as HTMLInputElement;
    const pctEl = document.getElementById(`${id}Pct`) as HTMLElement;
    const chkEl = document.getElementById(`${id}On`) as HTMLInputElement;

    volEl?.addEventListener('input', () => {
      const val = Number(volEl.value) / 100;
      if (pctEl) pctEl.textContent = `${volEl.value}%`;
      AppActions.setStemVolume(key as any, chkEl?.checked ? val : 0);
    });

    chkEl?.addEventListener('change', () => {
      const val = Number(volEl.value) / 100;
      AppActions.setStemVolume(key as any, chkEl.checked ? val : 0);
    });
  });

  // 7. Event List Renderer with Click-to-Edit Inspector
  function renderEventList(cues: FoleyCue[]): void {
    if (!eventListEl) return;
    eventListEl.innerHTML = '';
    if (cues.length === 0) {
      eventListEl.textContent = 'Analyze a clip to populate frame-aligned cues.';
      return;
    }

    cues.forEach((c) => {
      const row = document.createElement('div');
      row.className = 'event-row';
      row.style.cursor = 'pointer';
      row.title = 'Click to inspect & edit physical modal synthesis parameters';

      const timecode = fmtTime(c.timestamp_ms / 1000);
      const isMetal = c.category.includes('metal');
      const label = isMetal ? 'Metallic Clash (Resonant)' : 'Ground Impact (Low Thud)';

      row.innerHTML = `
        <time>${timecode}</time>
        <span>${label}</span>
        <small style="color:${isMetal ? '#d7a77b' : '#5ce1e6'}">${Math.round(c.velocity * 100)}% VELOCITY</small>
      `;

      row.onclick = () => {
        AppActions.seekTo(c.timestamp_ms / 1000);
        cueEditor.open(c);
      };

      eventListEl.appendChild(row);
    });
  }

  // 8. 24-Bit Lossless WAV Exporter
  exportWavBtn?.addEventListener('click', async () => {
    try {
      if (!videoEl.duration) {
        logMsg('Please load and analyze a video clip before exporting audio.', 'warn');
        return;
      }
      exportWavBtn.disabled = true;
      exportWavBtn.textContent = 'Rendering 24-bit 48kHz WAV…';
      logMsg('OfflineAudioContext rendering 5-channel master bus…', 'cyan');

      const blob = await AppActions.exportLosslessWav();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sonicframe-${videoEl.duration.toFixed(1)}s-master-24bit.wav`;
      a.click();
      URL.revokeObjectURL(url);

      exportWavBtn.disabled = false;
      exportWavBtn.textContent = 'EXPORT 24-BIT LOSSLESS MASTER WAV ↗';
      logMsg('Lossless 24-bit WAV file generated and downloaded successfully.', 'ok');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      exportWavBtn.disabled = false;
      exportWavBtn.textContent = 'EXPORT 24-BIT LOSSLESS MASTER WAV ↗';
      logMsg(`WAV export failed: ${msg}`, 'warn');
    }
  });

  // 9. Reset Session
  resetBtn?.addEventListener('click', () => {
    store.reset();
    AppActions.audioEngine.pausePlayback();
    videoEl.pause();
    videoEl.removeAttribute('src');
    videoEl.load();
    videoEl.style.display = 'none';
    emptyStateEl.style.display = 'flex';
    fileNameEl.textContent = 'NO SOURCE LOADED';
    durationLabelEl.textContent = '00:00.000';
    resolutionEl.textContent = '—';
    motionMetricEl.textContent = '—';
    impactMetricEl.textContent = '—';
    shiftMetricEl.textContent = '—';
    analysisStateEl.textContent = 'AWAITING CLIP';
    timelineStateEl.textContent = 'NO GENERATED STEMS';
    eventListEl.textContent = 'Analyze a clip to populate frame-aligned cues.';
    playBtn.textContent = '▶';
    timelineCanvas.render([], []);
    logMsg('Studio session reset.', 'cyan');
  });

  // 10. Reactive Store Subscription
  store.subscribe((state) => {
    const { telemetry, orchestrator } = state;

    // Update telemetry metrics
    if (telemetry.vectors.length > 0) {
      let maxE = 0;
      telemetry.vectors.forEach((v) => { if (v.kineticEnergy > maxE) maxE = v.kineticEnergy; });
      motionMetricEl.textContent = `${Math.round(maxE * 100)}%`;
      impactMetricEl.textContent = String(telemetry.detectedImpacts.length);
      const cuts = telemetry.vectors.filter((v) => v.isSceneCut).length;
      shiftMetricEl.textContent = String(cuts);
    }

    // Re-render timeline tracks when cue sheet changes
    if (orchestrator.cueSheet) {
      timelineCanvas.render(telemetry.vectors, orchestrator.cueSheet.foley_events);
      renderEventList(orchestrator.cueSheet.foley_events);
    }
  });

  logMsg('SONICFRAME Enterprise Architecture v4.0 loaded with strict ECC pattern.', 'ok');
}

// Auto-boot on DOM ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
}
