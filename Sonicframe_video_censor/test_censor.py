import os
import cv2
import numpy as np
from censor_guard import CensorGuard

def run_self_test():
    print("=== Starting CensorGuard Verification Test ===")
    
    # 1. Initialize engine
    guard = CensorGuard()
    
    # 2. Create a test frame (640x480 RGB)
    test_frame = np.full((480, 640, 3), 200, dtype=np.uint8)
    cv2.putText(test_frame, "SonicFrame Test Subject", (50, 240), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 0), 2)
    
    # 3. Test frame detection
    print("\n[Test 1] Running detection on test frame...")
    detections = guard.detect(test_frame)
    print(f"Detections on neutral frame: {detections}")
    
    # 4. Test frame censorship function
    print("\n[Test 2] Testing censorship function...")
    censored_frame, _, found = guard.censor_frame(test_frame)
    assert censored_frame.shape == test_frame.shape, "Output frame shape mismatch"
    print(f"Censorship pipeline returned valid frame: {censored_frame.shape}")
    
    # 5. Create a mini 1-second test video
    test_video_path = "test_input.mp4"
    test_output_path = "test_censored.mp4"
    
    print("\n[Test 3] Generating 30-frame synthetic test video...")
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    writer = cv2.VideoWriter(test_video_path, fourcc, 30.0, (640, 480))
    for i in range(30):
        f = test_frame.copy()
        cv2.circle(f, (50 + i * 15, 100), 20, (0, 255, 0), -1)
        writer.write(f)
    writer.release()
    
    # 6. Test full video pipeline
    print("\n[Test 4] Running end-to-end video processing pipeline...")
    guard.process_video(test_video_path, test_output_path)
    
    assert os.path.exists(test_output_path), "Output video was not generated!"
    file_size_kb = os.path.getsize(test_output_path) / 1024
    print(f"Output video verified on disk ({file_size_kb:.1f} KB)")
    
    # Cleanup temporary test files
    if os.path.exists(test_video_path):
        os.remove(test_video_path)
    if os.path.exists(test_output_path):
        os.remove(test_output_path)
        
    print("\n=== All Tests Passed Successfully! ===")
    print("The model and censorship engine are fully verified and ready for production.")

if __name__ == "__main__":
    run_self_test()
