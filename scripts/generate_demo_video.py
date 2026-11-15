import cv2
import numpy as np
import subprocess
import os
import math
from pathlib import Path

# Specifications
WIDTH = 1280
HEIGHT = 720
FPS = 30
TOTAL_FRAMES = 450  # Exactly 15.00 seconds
OUTPUT_DIR = Path(r"D:\SonicFrame New")
RAW_AVI = OUTPUT_DIR / "temp_raw_demo.avi"
FINAL_MP4 = OUTPUT_DIR / "demo_animation.mp4"
PUBLIC_MP4 = OUTPUT_DIR / "public" / "demo_animation.mp4"

PUBLIC_MP4.parent.mkdir(parents=True, exist_ok=True)

print(f"Generating 15.0s SonicFrame Demo Animation ({TOTAL_FRAMES} frames @ {FPS}fps, {WIDTH}x{HEIGHT})...")

# Setup OpenCV VideoWriter for lossless uncompressed / raw intermediate frames
fourcc = cv2.VideoWriter_fourcc(*'MJPG')
writer = cv2.VideoWriter(str(RAW_AVI), fourcc, FPS, (WIDTH, HEIGHT))

# Particle system for impacts
class Particle:
    def __init__(self, x, y, color):
        self.x = float(x)
        self.y = float(y)
        angle = np.random.uniform(0, 2 * np.pi)
        speed = np.random.uniform(4, 18)
        self.vx = float(np.cos(angle) * speed)
        self.vy = float(np.sin(angle) * speed)
        self.life = 1.0
        self.decay = float(np.random.uniform(0.04, 0.08))
        self.color = color
        self.size = int(np.random.randint(2, 6))

particles = []

def draw_hud(frame, frame_idx, event_name, centroid=None):
    time_sec = frame_idx / FPS
    # Top bar background
    cv2.rectangle(frame, (0, 0), (WIDTH, 48), (15, 17, 23), -1)
    cv2.line(frame, (0, 48), (WIDTH, 48), (40, 45, 58), 1)
    
    # Title
    cv2.putText(frame, "SONICFRAME MOTION2STEM BENCHMARK CLIP", (24, 30),
                cv2.FONT_HERSHEY_DUPLEX, 0.65, (0, 243, 255), 1, cv2.LINE_AA)
    
    # Track indicator
    cv2.putText(frame, "TARGET: FOLEY & ADAPTIVE SCORE", (600, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (160, 170, 190), 1, cv2.LINE_AA)
    
    # Status Tag
    tag_color = (0, 255, 128) if "IMPACT" in event_name or "FLASH" in event_name else (220, 220, 220)
    cv2.putText(frame, f"EVENT: {event_name}", (980, 30),
                cv2.FONT_HERSHEY_DUPLEX, 0.5, tag_color, 1, cv2.LINE_AA)
    
    # Bottom bar background
    cv2.rectangle(frame, (0, HEIGHT - 52), (WIDTH, HEIGHT), (15, 17, 23), -1)
    cv2.line(frame, (0, HEIGHT - 52), (WIDTH, HEIGHT - 52), (40, 45, 58), 1)
    
    # Timecode
    timecode = f"TC: 00:{time_sec:06.3f}s / 00:15.000s | FRAME: {frame_idx:03d}/{TOTAL_FRAMES}"
    cv2.putText(frame, timecode, (24, HEIGHT - 20),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (240, 240, 250), 1, cv2.LINE_AA)
    
    # Telemetry coordinate
    if centroid:
        cx_norm = (centroid[0] / WIDTH) * 2.0 - 1.0
        cy_norm = (centroid[1] / HEIGHT) * 2.0 - 1.0
        cent_text = f"CENTROID: (X: {cx_norm:+.2f}, Y: {cy_norm:+.2f})"
        cv2.putText(frame, cent_text, (950, HEIGHT - 20),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 243, 255), 1, cv2.LINE_AA)
        # Draw centroid crosshair
        cv2.circle(frame, centroid, 14, (0, 243, 255), 1, cv2.LINE_AA)
        cv2.line(frame, (centroid[0] - 20, centroid[1]), (centroid[0] + 20, centroid[1]), (0, 243, 255), 1, cv2.LINE_AA)
        cv2.line(frame, (centroid[0], centroid[1] - 20), (centroid[0], centroid[1] + 20), (0, 243, 255), 1, cv2.LINE_AA)

for i in range(TOTAL_FRAMES):
    t = i / FPS
    # Base background: deep cyberpunk slate
    bg_b, bg_g, bg_r = 18, 16, 24
    frame = np.full((HEIGHT, WIDTH, 3), (bg_b, bg_g, bg_r), dtype=np.uint8)
    
    centroid = None
    event_label = "IDLE / AMBIENCE"
    
    # -------------------------------------------------------------
    # Perspective 3D Grid Floor (provides strong optical flow vectors)
    # -------------------------------------------------------------
    vanish_x = WIDTH // 2
    vanish_y = 300
    grid_lines = 16
    for g in range(-grid_lines, grid_lines + 1):
        x_bottom = vanish_x + g * 90
        cv2.line(frame, (vanish_x, vanish_y), (x_bottom, HEIGHT - 52), (32, 36, 48), 1, cv2.LINE_AA)
    
    # Horizontal grid lines with speed
    grid_speed = 3.0
    if 2.0 <= t < 4.5:
        grid_speed = 12.0  # Camera push speedup
    elif 13.0 <= t <= 15.0:
        grid_speed = -2.0  # Camera pullout
        
    for h in range(1, 10):
        pos_y = int(vanish_y + (math.pow(h / 9.0, 1.8)) * (HEIGHT - 52 - vanish_y))
        cv2.line(frame, (0, pos_y), (WIDTH, pos_y), (35, 40, 54), 1, cv2.LINE_AA)

    # -------------------------------------------------------------
    # PHASE 1: [0.0s - 2.5s] Rhythmic Footsteps & Character Movement
    # -------------------------------------------------------------
    if 0.0 <= t < 2.5:
        # Walker ball moving across ground
        step_period = 1.0  # step every 1.0s (at t=1.00s and t=2.00s)
        step_phase = (t % step_period) / step_period
        
        # Two distinct footsteps
        if t < 1.0:
            foot_x = int(WIDTH * 0.35 + t * 40)
            foot_y = int(520 - math.sin(step_phase * math.pi) * 80)
            centroid = (foot_x, foot_y)
            event_label = "WALK APPROACH"
            # Impact at t=1.00s (frame 30)
            if i == 30:
                for _ in range(35):
                    particles.append(Particle(foot_x, 520, (180, 200, 240)))
        elif t < 2.0:
            foot_x = int(WIDTH * 0.45 + (t - 1.0) * 50)
            foot_y = int(520 - math.sin(step_phase * math.pi) * 80)
            centroid = (foot_x, foot_y)
            event_label = "FOOTSTEP 01 CONTACT" if i < 35 else "WALK RECOVERY"
            # Impact at t=2.00s (frame 60)
            if i == 60:
                for _ in range(35):
                    particles.append(Particle(foot_x, 520, (180, 200, 240)))
        else:
            foot_x = int(WIDTH * 0.55)
            foot_y = 520
            centroid = (foot_x, foot_y)
            event_label = "FOOTSTEP 02 CONTACT"
            
        cv2.circle(frame, (foot_x, foot_y), 24, (0, 210, 255), -1, cv2.LINE_AA)
        cv2.circle(frame, (foot_x, foot_y), 28, (255, 255, 255), 2, cv2.LINE_AA)

    # -------------------------------------------------------------
    # PHASE 2: [2.5s - 4.5s] Camera Push & Expanding Vectors (Divergence)
    # -------------------------------------------------------------
    elif 2.5 <= t < 4.5:
        event_label = "CAMERA PUSH (DIVERGENCE > 0)"
        scale_t = (t - 2.5) / 2.0
        ring_radius = int(40 + scale_t * 380)
        center_x, center_y = WIDTH // 2, HEIGHT // 2
        centroid = (center_x, center_y)
        
        # Expanding concentric rings generating radial optical flow divergence
        for r_offset in [0, 80, 160, 240]:
            r_curr = (ring_radius + r_offset) % 400
            alpha = max(0.1, 1.0 - (r_curr / 400.0))
            color_val = int(255 * alpha)
            cv2.circle(frame, (center_x, center_y), r_curr, (color_val, int(color_val*0.6), 0), 2, cv2.LINE_AA)
            
        # Central energy orb
        cv2.circle(frame, (center_x, center_y), int(30 + math.sin(t * 10) * 8), (0, 243, 255), -1, cv2.LINE_AA)

    # -------------------------------------------------------------
    # PHASE 3: [4.5s - 6.5s] Heavy Metallic Anvil Impact Frame (Shock Deceleration)
    # -------------------------------------------------------------
    elif 4.5 <= t < 6.5:
        impact_frame = 156  # exactly t = 5.20s
        anvil_x = WIDTH // 2
        anvil_y = 530
        
        if i < impact_frame:
            # Hammer falling with high acceleration
            drop_progress = (i - 135) / (impact_frame - 135)
            hammer_y = int(100 + (drop_progress ** 2.5) * (anvil_y - 100))
            centroid = (anvil_x, hammer_y)
            event_label = "HEAVY DESCENT"
            cv2.rectangle(frame, (anvil_x - 30, hammer_y - 60), (anvil_x + 30, hammer_y), (140, 160, 220), -1)
        elif i == impact_frame:
            # Exact impact frame (maximum negative deceleration d2E/dt2)
            centroid = (anvil_x, anvil_y)
            event_label = "✦ HEAVY METAL IMPACT SHOCK ✦"
            # Spawn shockwave and intense particles
            for _ in range(90):
                particles.append(Particle(anvil_x, anvil_y, (255, 230, 100)))
            # Flash ring
            cv2.circle(frame, (anvil_x, anvil_y), 90, (255, 255, 255), 6, cv2.LINE_AA)
            cv2.rectangle(frame, (anvil_x - 32, anvil_y - 60), (anvil_x + 32, anvil_y), (255, 255, 255), -1)
        else:
            # Impact recoil and shockwave expanding
            recoil = math.exp(-(t - 5.20) * 8.0) * math.sin((t - 5.20) * 30.0) * 20.0
            hammer_y = int(anvil_y + recoil)
            centroid = (anvil_x, hammer_y)
            event_label = "IMPACT RESONANCE / DAMPING"
            cv2.rectangle(frame, (anvil_x - 30, hammer_y - 60), (anvil_x + 30, hammer_y), (180, 200, 230), -1)
            
        # Draw anvil base
        cv2.rectangle(frame, (anvil_x - 60, anvil_y), (anvil_x + 60, anvil_y + 30), (80, 90, 110), -1)

    # -------------------------------------------------------------
    # PHASE 4: [6.5s - 8.5s] Rotational Vortex & Whoosh Sweep (Curl)
    # -------------------------------------------------------------
    elif 6.5 <= t < 8.5:
        event_label = "ROTATIONAL VORTEX (CURL > 0)"
        vortex_phase = (t - 6.5) / 2.0
        vortex_x = int(WIDTH * 0.2 + vortex_phase * (WIDTH * 0.6))
        vortex_y = 360
        centroid = (vortex_x, vortex_y)
        
        # Rotating spiral arms
        rot_angle = t * 14.0
        arms = 4
        for a in range(arms):
            arm_base = rot_angle + a * (2 * np.pi / arms)
            pts = []
            for r_step in range(10, 120, 6):
                theta = arm_base + (r_step / 35.0)
                px = int(vortex_x + math.cos(theta) * r_step)
                py = int(vortex_y + math.sin(theta) * r_step)
                pts.append([px, py])
            pts = np.array(pts, np.int32)
            cv2.polylines(frame, [pts], False, (0, 240, 255), 2, cv2.LINE_AA)
            
        cv2.circle(frame, (vortex_x, vortex_y), 16, (255, 255, 255), -1, cv2.LINE_AA)

    # -------------------------------------------------------------
    # PHASE 5: [8.5s - 10.5s] Chromatic Flash & Detonation (CIELAB Delta-E)
    # -------------------------------------------------------------
    elif 8.5 <= t < 10.5:
        flash_frame = 276  # exactly t = 9.20s
        centroid = (WIDTH // 2, HEIGHT // 2)
        
        if i < flash_frame:
            event_label = "CHARGE BUILD-UP"
            charge_rad = int(10 + ((i - 255) / 21.0) * 70)
            cv2.circle(frame, centroid, charge_rad, (0, 160, 255), 2, cv2.LINE_AA)
        elif i <= flash_frame + 3:
            # Massive color temperature shift to blinding cyan-white (Delta-E > 60)
            event_label = "⚡ CHROMATIC FLASH DETONATION ⚡"
            frame[:, :] = (240, 255, 255)
            cv2.circle(frame, centroid, 260, (0, 243, 255), -1, cv2.LINE_AA)
        else:
            # Cool down to warm amber sunset
            event_label = "TONAL AMBER TRANSITION"
            decay = max(0.0, 1.0 - (t - 9.30) / 1.2)
            # Add warm chromatic wash
            wash = np.full((HEIGHT, WIDTH, 3), (20, int(120 * decay), int(240 * decay)), dtype=np.uint8)
            frame = cv2.addWeighted(frame, 1.0, wash, 0.6, 0)
            cv2.circle(frame, centroid, int(120 * decay), (0, 240, 255), 2, cv2.LINE_AA)

    # -------------------------------------------------------------
    # PHASE 6: [10.5s - 13.0s] Secondary Staccato Shards (Glass/Wood)
    # -------------------------------------------------------------
    elif 10.5 <= t < 13.0:
        event_label = "STACCATO SHARD IMPACTS"
        # Two shards dropping at 11.20s and 12.40s
        shard1_x = int(WIDTH * 0.35)
        shard2_x = int(WIDTH * 0.68)
        
        if i == 336:  # 11.20s
            for _ in range(40):
                particles.append(Particle(shard1_x, 520, (120, 240, 255)))
        if i == 372:  # 12.40s
            for _ in range(40):
                particles.append(Particle(shard2_x, 520, (200, 220, 255)))
                
        # Draw bouncing shards
        if t < 11.20:
            s1_y = int(200 + ((t - 10.5) / 0.7) ** 2 * 320)
            centroid = (shard1_x, s1_y)
            cv2.drawMarker(frame, (shard1_x, s1_y), (100, 240, 255), cv2.MARKER_TILTED_CROSS, 22, 2)
        elif t < 12.40:
            s2_y = int(200 + ((t - 11.2) / 1.2) ** 2 * 320)
            centroid = (shard2_x, s2_y)
            cv2.drawMarker(frame, (shard2_x, s2_y), (255, 200, 120), cv2.MARKER_DIAMOND, 24, 2)
        else:
            centroid = (shard2_x, 520)

    # -------------------------------------------------------------
    # PHASE 7: [13.0s - 15.0s] Final Pullout & Hero Frame Freeze
    # -------------------------------------------------------------
    else:
        hero_frame = 426  # 14.20s
        centroid = (WIDTH // 2, HEIGHT // 2)
        if i < hero_frame:
            event_label = "PULLOUT (DIVERGENCE < 0)"
            cv2.circle(frame, centroid, 40, (0, 243, 255), 2, cv2.LINE_AA)
        elif i == hero_frame:
            event_label = "✦ FINAL HERO IMPACT SLAM ✦"
            for _ in range(80):
                particles.append(Particle(WIDTH // 2, HEIGHT // 2, (0, 243, 255)))
            cv2.circle(frame, centroid, 140, (255, 255, 255), 4, cv2.LINE_AA)
        else:
            event_label = "SUSTAINED TAIL / COMPLETE"
            cv2.circle(frame, centroid, 60, (0, 243, 255), -1, cv2.LINE_AA)

    # -------------------------------------------------------------
    # Update & Render Particle Physics
    # -------------------------------------------------------------
    for p in particles[:]:
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.5  # gravity
        p.life -= p.decay
        if p.life <= 0:
            particles.remove(p)
        else:
            alpha = max(0.0, p.life)
            col = tuple(int(c * alpha) for c in p.color)
            cv2.circle(frame, (int(p.x), int(p.y)), max(1, int(p.size * alpha)), col, -1)

    # Render Professional On-Screen HUD
    draw_hud(frame, i, event_label, centroid)
    
    # Write to uncompressed raw AVI
    writer.write(frame)

writer.release()
print("Raw video rendered to:", RAW_AVI)

# Re-encode to clean, browser-compatible H.264 MP4 with FFmpeg
print("Encoding to browser-native H.264 MP4 via FFmpeg...")
cmd = [
    "ffmpeg", "-y",
    "-i", str(RAW_AVI),
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "19",
    "-pix_fmt", "yuv420p",
    "-profile:v", "high",
    "-level", "4.0",
    "-r", "30",
    str(FINAL_MP4)
]
res = subprocess.run(cmd, capture_output=True, text=True)
if res.returncode != 0:
    print("FFmpeg error:", res.stderr)
else:
    print(f"H.264 MP4 successfully created: {FINAL_MP4} ({FINAL_MP4.stat().st_size} bytes)")
    # Copy to public/ for web server direct serving
    import shutil
    shutil.copy2(FINAL_MP4, PUBLIC_MP4)
    print(f"Copied to public web directory: {PUBLIC_MP4}")
    
# Remove raw intermediate AVI
if RAW_AVI.exists():
    RAW_AVI.unlink()
    print("Cleaned up intermediate AVI.")
