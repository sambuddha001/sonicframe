# 🎬 SONICFRAME
### "Motion2Stem" — Optical-Flow Driven Foley & Adaptive Score Engine
*Target Tracks: Soundscapes & Composition · Best Creative Artist Co-Pilot*  
*Project of Team TetraByte*

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x%20Strict-blue.svg?logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.x-646CFF.svg?logo=vite)](https://vitejs.dev/)
[![Tests](https://img.shields.io/badge/Tests-122%2F122%20PASS%20(100%25)-success.svg)](https://github.com/sambuddha001/sonicframe)
[![WebAudio](https://img.shields.io/badge/WebAudio-48kHz%2024--bit%20PCM-cyan.svg)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 1. Executive Summary & Vision

### 1.1 The Real Industry Problem
Indie animators, 3D motion designers (Blender, Unreal Engine, Cinema4D), and indie game developers waste up to **40% of their post-production time** manually synchronizing audio to visuals:
- Sifting through thousands of generic stock sound effect libraries.
- Manually slicing, time-stretching, and nudging WAV files frame-by-frame to align footsteps, blade clashes, and impact hits.
- Fighting static generative "prompt-to-audio" boxes that produce monolithic, un-editable audio files disconnected from visual keyframes, pacing, and dramatic pauses.

### 1.2 The "Motion2Stem" Solution
**Visual Motion Writes the Score.** Instead of forcing creators to articulate acoustic timing in vague text prompts, SonicFrame extracts millisecond-precise mathematical motion telemetry directly from video pixels in the browser:

```
[ Silent Animation Clip ] (MP4/WebM)
           │
           ▼
[ Layer E: Event Telemetry ]
   ├── OffscreenCanvas / WebCodecs Frame Extractor
   ├── Dense Pyramidal Lucas-Kanade Optical Flow (8x8 Grid)
   ├── CIELAB Color Space Conversion & ΔE*ab Chromatic Shift
   └── Savitzky-Golay 2nd-Derivative Transient Deceleration Filter (d²E/dt²)
           │
           ▼ (Structured Mathematical JSON Telemetry ~400 tokens)
[ Layer C: Cognitive Orchestrator ]
   ├── Local Deterministic Seed Composer (Zero-Latency Rule Engine)
   └── Provider-Agnostic LLM Conductor (Gemini / OpenAI / NVIDIA)
           │
           ▼ (Strictly Typed SonicFrameCueSheet JSON Contract)
[ Layer C: Command & Component DSP Engine ]
   ├── Hardware Lookahead Audio Scheduler (25ms timer / 120ms window on AudioContext.currentTime)
   ├── Modal Physical Modeling Synthesizer (Metal, Wood, Glass, Earth inharmonic resonance)
   ├── Granular Pink Noise Synthesizer (Velocity-automated bandpass for wind/whooshes)
   ├── 4-Voice Polyphonic Harmonic Drone Score Generator
   ├── 5-Channel Parametric Stem Mixer (3-Band EQ, Stereo Panner, Master Peak Limiter)
   └── 24-bit 48kHz Uncompressed RIFF Master WAV Exporter
```

---

## 2. Architecture & Design Pattern: ECC

SonicFrame strictly adheres to the **Event-Condition-Command (ECC)** architectural pattern (TetraByte Specification Section 8.2):

### 2.1 Layer E: Event / Telemetry Layer
- **Client-Side Edge Execution**: Video pixels **never leave the user's browser**. All frame extraction is handled via `OffscreenCanvas` / Web Workers.
- **Dense Optical Flow**: Pyramidal Lucas-Kanade calculates vector displacement $(\Delta x, \Delta y)$ across visual frames to compute instantaneous kinetic energy $E(t)$.
- **Vector Calculus Operators**:
  - **Divergence ($\text{Div}(t)$)**: Detects camera push-in / scale expansion (mapped to filter cutoff sweeps and crescendo).
  - **Curl ($\text{Curl}(t)$)**: Detects rotational vortex torque and turbulence (mapped to modulation depth and noise dispersion).
  - **Action Centroid ($C_x, C_y$)**: Normalizes the spatial center of motion to $[-1.0, +1.0]$ for automated stereo panning.
- **Savitzky-Golay Peak Detection**: 5-point quadratic filter evaluates inflection points ($\frac{d^2 E}{dt^2} < -\theta$) to isolate true physical impact frames.
- **CIELAB Color Temperature ($\Delta E^*_{ab}$)**: Identifies lighting transitions, flashes, and cutaways to trigger tonic chord modulations.

### 2.2 Layer C: Cognitive / Orchestration Layer
- **Deterministic Baseline First**: A zero-latency local state machine generates seed foley cues, ensuring immediate playback availability without waiting for network requests.
- **Multi-Provider LLM Enrichment**: Netlify serverless functions support Google Gemini, OpenAI, and NVIDIA NIM with zero API key sniffing.
- **Strict JSON Schema Enforcement**: The LLM output conforms to the `SonicFrameCueSheet` schema, containing:
  - `composition_profile`: Musical key root, scale mode (`dorian`, `aeolian`, `cinematic_dark`), base BPM, and intensity curve.
  - `foley_events`: Frame-locked cues with physical modal parameters (`fundamental_freq`, `decay_seconds`, `brightness`, `resonance_q`, `pan`).
  - `stem_automations`: Time-series curves for atmosphere cutoff and harmonic drone density.
- **Conversational Creative Co-Pilot**: Multi-turn natural language agent mutating synthesis parameters in real-time (e.g., *"Make the footsteps sound like wet cobblestones"*, *"Mute the atmosphere stem"*, *"Double the decay on metallic hits"*).

### 2.3 Layer C: Command / Procedural DSP Layer
- **Physical Modeling over Static Samples**: Replaces repetitive sample playback with physical vibration equations:
  $$y(t) = \sum_{k=1}^M A_k \cdot e^{-d_k t} \cdot \sin(2\pi f_k t + \phi_k)$$
  Simulates physical resonant modes for **Metal**, **Wood**, **Glass**, and **Earth**.
- **Zero-Jitter Dual-Timer Scheduler**: Uses a $25\text{ms}$ JavaScript interval to schedule upcoming events $120\text{ms}$ ahead directly onto the hardware `AudioContext.currentTime` clock, achieving $\pm 1\text{ms}$ synchronization precision.
- **5-Channel Parametric Stem Mixer**: Independent channels for Atmosphere, Motion Pulse, Foley Impact, and Texture Shimmer, each featuring 3-band EQ, gain faders, and stereo panning.
- **Master Lossless Exporter**: Offline rendering pipeline generating clean 24-bit 48,000 Hz stereo WAV files.

---

## 3. Mathematical Formulations

| Formulation | Mathematical Equation | SonicFrame Acoustic Mapping |
| :--- | :--- | :--- |
| **Kinetic Energy Integral** | $$E(t) = \frac{1}{W \cdot H} \sum_{x,y} \sqrt{u(x,y)^2 + v(x,y)^2}$$ | Global soundscape volume, motion pulse trigger amplitude. |
| **Vector Divergence** | $$\text{Div}(t) = \frac{1}{W \cdot H} \sum_{x,y} \left(\frac{\partial u}{\partial x} + \frac{\partial v}{\partial y}\right)$$ | Positive: low-pass cutoff sweep open.<br>Negative: reverb decay elongation. |
| **Vector Curl** | $$\text{Curl}(t) = \frac{1}{W \cdot H} \sum_{x,y} \left(\frac{\partial v}{\partial x} - \frac{\partial u}{\partial y}\right)$$ | Granular scatter rate, noise filter modulation depth. |
| **Transient Deceleration** | $$\mathcal{I}(t) = \frac{d^2 E(t)}{dt^2} \approx E(t+1) - 2E(t) + E(t-1)$$ | Trigger foley impact event when $\mathcal{I}(t) < -\theta$ and $E(t) > \mu_E + k\sigma_E$. |
| **CIELAB Chromatic Shift** | $$\Delta E^*_{ab}(t) = \sqrt{(\Delta L^*)^2 + (\Delta a^*)^2 + (\Delta b^*)^2}$$ | Color flares and hard scene cuts trigger drone chord progression. |
| **Action Centroid** | $$C_x(t) = \frac{\sum x \cdot \|V(x,y)\|}{\sum \|V(x,y)\|} \cdot \frac{2}{W} - 1.0$$ | Dynamic stereo panner automation $[-1.0, +1.0]$. |

---

## 4. Repository Structure

```
d:/SonicFrame New/
├── src/                               # Modular TypeScript Source Tree (ECC Pattern)
│   ├── app/
│   │   ├── main.ts                    # Application bootstrap & DOM bindings
│   │   ├── state/
│   │   │   ├── store.ts               # Reactive Pub-Sub State Store
│   │   │   └── actions.ts             # Synchronous mutations & asynchronous actions
│   │   └── workers/
│   │       ├── opticalFlow.worker.ts  # Dense Lucas-Kanade flow & CIELAB Web Worker
│   │       └── demuxer.worker.ts      # WebCodecs / MP4 frame demuxer client
│   ├── modules/
│   │   ├── audio/
│   │   │   ├── AudioEngine.ts         # Master WebAudio manager & lookahead scheduler
│   │   │   ├── StemMixer.ts           # 5-Channel parametric stem mixer with 3-band EQ
│   │   │   ├── Exporter.ts            # 24-bit 48kHz WAV binary encoder
│   │   │   └── synths/
│   │   │       ├── ModalImpactSynth.ts # Physical modeling impact synth (Metal/Wood/Glass/Earth)
│   │   │       ├── GranularNoise.ts   # Velocity-driven pink noise whoosh synth
│   │   │       └── HarmonicDrone.ts   # 4-voice ambient drone score generator
│   │   ├── orchestrator/
│   │   │   ├── CopilotAgent.ts        # Conversational sound designer mutation agent
│   │   │   ├── CueSheetParser.ts      # Deterministic rule composer & schema validator
│   │   │   └── OrchestratorClient.ts  # Netlify serverless client
│   │   ├── telemetry/
│   │   │   ├── PeakDetector.ts        # 5-point Savitzky-Golay 2nd derivative filter
│   │   │   ├── EnergyCurvePlotter.ts  # High-DPI Canvas kinetic energy plotter
│   │   │   └── VectorFieldCanvas.ts   # 8x8 optical flow vector field renderer
│   │   ├── timeline/
│   │   │   ├── TimelineCanvas.ts      # Multi-lane DAW canvas timeline
│   │   │   └── CueEditorModal.ts      # Per-cue parameter inspection & override modal
│   │   └── video/
│   │       ├── VideoPlayer.ts         # HTML5 Video element controller with scrub sync
│   │       ├── DropzoneComponent.ts   # Drag-and-drop video ingestion handler
│   │       └── VideoTelemetryBridge.ts # Coordinates playback timestamp with WebAudio clock
│   ├── styles/
│   │   └── sonicframe.css             # TetraByte design tokens (Graphite, Cyan, Glass)
│   └── types/
│       ├── api.ts                     # Netlify serverless request/response types
│       ├── cueSheet.ts                # Master SonicFrameCueSheet contract
│       ├── state.ts                   # SonicFrameState interface (Section 9.1)
│       └── telemetry.ts               # TelemetryVector & DetectedImpact interfaces
├── netlify/
│   └── functions/
│       ├── chat.js                    # Multi-provider conversational Co-Pilot endpoint
│       ├── orchestrate.js             # Telemetry-to-CueSheet cognitive orchestrator
│       └── login-attempts.js          # Netlify Blobs rate-limiter for authentication
├── test/
│   ├── test_ecc_architecture.js       # Architecture contract & state verification (6/6 PASS)
│   ├── test_optical_flow_telemetry.js # Optical flow math & worker protocol tests (11/11 PASS)
│   ├── test_sonicframe_dsp.js         # Physical modal synthesis & DSP tests (95/95 PASS)
│   └── orchestrator-test.js           # Cue-sheet schema & Co-Pilot mutation tests (10/10 PASS)
├── studio.html                        # Production 6-panel sound design workstation
├── chatbot.html                       # Dedicated full-screen AI Co-Pilot chat environment
├── index.html                         # SonicFrame landing page & module overview
├── motion.html                        # Module 01: Motion Intelligence documentation
├── foley.html                         # Module 02: Foley & Sound Design documentation
├── timeline.html                      # Module 03: Adaptive Timeline documentation
├── mixer.html                         # Module 04: Stem Mixer documentation
├── package.json                       # Scripts, dependencies, and typecheck configuration
├── tsconfig.json                      # Strict ES2022 TypeScript configuration
├── vite.config.ts                     # Multi-page build & serverless proxy configuration
├── server.js                          # Local development API & proxy server
├── .gitignore                         # Build outputs, credentials, and graphify-out
└── LICENSES.md                        # Third-party licensing documentation
```

---

## 5. Getting Started & Local Development

### 5.1 Prerequisites
- **Node.js**: v20.x or v22.x+ (tested on Node v24.22.1)
- **npm**: v10.x+
- A modern browser with WebAudio and OffscreenCanvas support (Chrome, Edge, Firefox, Brave)

### 5.2 Installation
Clone the repository and install dependencies:
```bash
git clone https://github.com/sambuddha001/sonicframe.git
cd sonicframe
npm install
```

### 5.3 Running the Application

You can start the full development environment with hot-module reloading and local API proxying:

```bash
# Terminal 1: Start local backend server (Port 8000)
npm run start

# Terminal 2: Start Vite development server (Port 3000)
npm run dev
```

Open your browser and navigate to:
- **Studio Workstation**: `http://localhost:3000/studio.html`
- **Dedicated Co-Pilot**: `http://localhost:3000/chatbot.html`
- **Product Overview**: `http://localhost:3000/index.html`

> **Note on Local Authentication**: For offline development and rapid evaluation, local guest access is enabled by default (`ALLOW_LOCAL_GUEST: true` in `firebase-config.js`). No external Firebase keys are required to run and test all studio features locally.

---

## 6. Automated Testing Suite (122 / 122 PASS)

SonicFrame includes a comprehensive test suite with 100% test coverage across optical flow math, procedural DSP synthesis, schema validation, and architecture contracts.

Run the entire test suite:
```bash
npm test
```

Or run individual test modules:
```bash
npm run test:flow          # Optical flow, CIELAB delta-E, vector calculus (11 tests)
npm run test:orchestrator  # Cue-sheet schema sanitizer & Co-Pilot mutations (10 tests)
npm run test:dsp           # Modal synthesis, lookahead timing, 24-bit WAV encoder (95 tests)
node test/test_ecc_architecture.js # State store & ECC contracts (6 tests)
```

Run TypeScript strict typecheck:
```bash
npm run typecheck
```

Build for production:
```bash
npm run build
```

---

## 7. Operational Workflow: How to Use SonicFrame

```
[ Step 1: Ingest ]
Drop any 15-second silent animation clip (.mp4, .webm) into Panel 01.
The player analyzes the container, extracts frame rate, and displays exact timecode.

[ Step 2: Configure ]
Set the motion Sensitivity slider (e.g., 80% for subtle footsteps, 50% for combat).
Select a musical mood ("Action / percussive", "Cinematic dark", "Sci-Fi ambient").

[ Step 3: Analyze ]
Click "ANALYZE CLIP".
The Web Worker extracts dense Lucas-Kanade optical flow and color drifts,
plotting the kinetic energy sparkline and populating the adaptive cue timeline.

[ Step 4: Preview & Tweak ]
Press Play (▶) or scrub the playhead.
Listen to procedural modal strikes, whooshes, and chord drones locked to keyframes.
Adjust individual channel gain faders and 3-band EQs in the Stem Mixer.

[ Step 5: Conversational Co-Pilot ]
Open the AI Co-Pilot drawer and enter natural language instructions:
- "Make the impact hits sound heavier and darker"
- "Add wet cobblestone footsteps on motion peaks"
- "Mute the texture sweep stem"
The Co-Pilot mutates the live synthesis graph instantly.

[ Step 6: Export ]
Click "EXPORT WAV" to generate and download the production-ready 24-bit 48kHz WAV audio master.
```

---

## 8. Environment Variables (Optional Serverless Cloud LLM)

When deploying to Vercel or Netlify, or when configuring cloud LLM enrichment, provide any of the following environment variables:

| Variable | Description | Default |
| :--- | :--- | :--- |
| `LLM_PROVIDER` | AI provider to use (`google`, `openai`, `nvidia`) | Auto-detected from key |
| `LLM_MODEL` | Explicit model identifier (e.g. `gemini-1.5-flash`, `gpt-4o-mini`) | Provider recommended default |
| `GEMINI_API_KEY` | Google Gemini API key | Optional (uses offline deterministic fallback) |
| `OPENAI_API_KEY` | OpenAI API key | Optional (uses offline deterministic fallback) |
| `NVIDIA_API_KEY` | NVIDIA NIM API key | Optional (uses offline deterministic fallback) |

---

## 9. Deploying to Vercel

SonicFrame is pre-configured for instant zero-configuration deployment to [Vercel](https://vercel.com) via `vercel.json` and universal serverless API handlers in `api/`:

### Option A: 1-Click Import via Vercel Dashboard
1. Go to [vercel.com/new](https://vercel.com/new).
2. Import the repository `https://github.com/sambuddha001/sonicframe`.
3. Configure the project settings:
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. *(Optional)* Add your cloud LLM keys under **Environment Variables** (`GEMINI_API_KEY`, `OPENAI_API_KEY`, or `NVIDIA_API_KEY`).
5. Click **Deploy**.

### Option B: Deploy via Vercel CLI
```bash
# Install Vercel CLI (if not already installed)
npm i -g vercel

# Authenticate & deploy preview
vercel

# Deploy directly to production
vercel --prod
```

### Architecture on Vercel
- **Multi-Page Static Output**: All 7 studio views (`index.html`, `studio.html`, `chatbot.html`, `motion.html`, `foley.html`, `timeline.html`, `mixer.html`) are bundled by Vite into `dist/` and served over Vercel's global Edge CDN with immutable hashed asset caching.
- **Universal Serverless Functions**: Located in `api/chat.js`, `api/orchestrate.js`, and `api/login-attempts.js`. They wrap Web Request/Response handlers with dual Node.js/Edge runtime compatibility.
- **Transparent Rewrites**: `vercel.json` routes `/.netlify/functions/:path*` to `/api/:path*`, ensuring all legacy and client-side endpoints work out of the box without changing frontend code.
- **Offline / Edge Autonomy**: If no cloud API keys are configured, SonicFrame operates 100% autonomously using its client-side DSP physical modeling and deterministic cue-sheet engine.

---

## 10. Hackathon Track Differentiators

### Track 1: Soundscapes & Composition
- **Transparent Multi-Stem Control**: Not a black-box audio generator. Creators inspect, scrub, and isolate 4 distinct procedural stems (Atmosphere, Motion Pulse, Foley Impact, Texture Shimmer).
- **Physical Modeling over Static Samples**: Sounds are procedurally synthesized from physical membrane equations, ensuring infinite variation with zero sample repetition or copyright issues.
- **Dynamic Musical Intelligence**: Automatically adapts scale mode, tonic root, and harmonic density to the visual kinetic energy curve.

### Track 2: Best Creative Artist Co-Pilot
- **Eliminates the #1 Animator Pain Point**: Replaces days of manual foley slicing and frame-nudging with instant mathematical alignment.
- **Bidirectional Collaboration**: Animators don't just receive audio—they converse with the Co-Pilot to reshape sound design parameters while watching the timeline update in real time.
- **Privacy & Edge Computing**: 100% browser-based. Zero video uploads to external cloud servers.

---

## 11. License & Acknowledgments

- **Codebase License**: MIT License ([LICENSE](LICENSE))
- **Audio Synthesizer Models & Algorithms**: CC0 1.0 Universal Public Domain ([LICENSES.md](LICENSES.md))
- **Typography**: SIL Open Font License (DM Mono, Manrope)
- **Built for**: Hackathon 2026 by **Team TetraByte**
