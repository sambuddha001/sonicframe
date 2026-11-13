# Video Censor Guard (for SonicFrame)

A high-accuracy, pre-processing safety and censorship module designed to inspect and sanitize video content before it enters audio-alignment or portrait-animation pipelines like **Sonic / SonicFrame**.

---

## Features
- **SOTA 18-Class Anatomical Detection:** Powered by `640m.onnx` (high-accuracy 640x640 resolution detector).
- **SonicFrame-Aware (Face Preservation):** Specifically detects and protects human faces (`FACE_MALE`, `FACE_FEMALE`) so SonicFrame's facial landmark tracking and lip-syncing remain intact, while strictly blurring explicit/vulgar anatomical regions.
- **Dual Operating Modes:**
  1. **Sanitize / Auto-Censor Mode:** Automatically blurs sensitive regions frame-by-frame and exports a sanitized video.
  2. **Strict Guardrail Mode:** Rejects the video immediately if any frame contains vulgar/sensitive content.
- **Zero Heavy Setup:** Runs natively via `onnxruntime` and `opencv-python` on both CPU and NVIDIA GPU (CUDA).

---

## Directory Structure
```
video_censor_guard/
├── models/
│   └── 640m.onnx             # High-accuracy censorship model (98 MB)
├── censor_guard.py           # Core detection & video censoring engine
├── download_model.py         # Automated downloader for model weights
├── test_censor.py            # Self-verification test script
└── requirements.txt          # Minimal runtime dependencies
```

---

## Quick Usage

### 1. Auto-Censor Video (Sanitize for SonicFrame)
```python
from censor_guard import CensorGuard

guard = CensorGuard()

# Blurs all sensitive regions and outputs a sanitized video ready for audio alignment
guard.process_video(
    input_video_path="input_raw.mp4",
    output_video_path="sanitized_for_sonic.mp4"
)
```

### 2. Strict Rejection Mode (Block Video Uploads)
```python
from censor_guard import CensorGuard

guard = CensorGuard()

# Scans frames and raises a ValueError if explicit content is found
try:
    guard.process_video(
        input_video_path="input_raw.mp4",
        output_video_path="output.mp4",
        reject_if_sensitive=True
    )
except ValueError as e:
    print(f"Upload blocked by safety gate: {e}")
```
