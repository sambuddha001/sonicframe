import os
import cv2
import numpy as np
import onnxruntime as ort

CLASSES = [
    "FEMALE_GENITALIA_COVERED",   # 0
    "FACE_FEMALE",                # 1  (Preserved for Sonic)
    "BUTTOCKS_EXPOSED",           # 2  (Sensitive)
    "FEMALE_BREAST_EXPOSED",      # 3  (Sensitive)
    "FEMALE_GENITALIA_EXPOSED",   # 4  (Sensitive)
    "MALE_BREAST_EXPOSED",        # 5  (Configurable)
    "ANUS_EXPOSED",               # 6  (Sensitive)
    "FEET_EXPOSED",               # 7  (Safe)
    "BELLY_COVERED",              # 8  (Safe)
    "FEET_COVERED",               # 9  (Safe)
    "ARMPITS_COVERED",            # 10 (Safe)
    "ARMPITS_EXPOSED",            # 11 (Safe)
    "FACE_MALE",                  # 12 (Preserved for Sonic)
    "BELLY_EXPOSED",              # 13 (Safe)
    "MALE_GENITALIA_EXPOSED",     # 14 (Sensitive)
    "ANUS_COVERED",               # 15 (Safe)
    "FEMALE_BREAST_COVERED",      # 16 (Safe)
    "BUTTOCKS_COVERED",           # 17 (Safe)
]

# Classes that strictly require blurring / censorship
DEFAULT_SENSITIVE_CLASSES = {
    "FEMALE_BREAST_EXPOSED",
    "FEMALE_GENITALIA_EXPOSED",
    "MALE_GENITALIA_EXPOSED",
    "BUTTOCKS_EXPOSED",
    "ANUS_EXPOSED",
}

class CensorGuard:
    def __init__(self, model_path=None, conf_threshold=0.35, iou_threshold=0.45, sensitive_classes=None):
        if model_path is None:
            model_path = os.path.join(os.path.dirname(__file__), "models", "640m.onnx")
        
        if not os.path.exists(model_path):
            print(f"[CensorGuard] Model not found locally. Auto-downloading...")
            from download_model import download_model
            download_model()
        
        self.conf_threshold = conf_threshold
        self.iou_threshold = iou_threshold
        self.sensitive_classes = sensitive_classes or DEFAULT_SENSITIVE_CLASSES

        # Select execution providers (CUDA GPU if available, else CPU)
        available_providers = ort.get_available_providers()
        providers = []
        if "CUDAExecutionProvider" in available_providers:
            providers.append("CUDAExecutionProvider")
        providers.append("CPUExecutionProvider")
        
        self.session = ort.InferenceSession(model_path, providers=providers)
        self.input_name = self.session.get_inputs()[0].name
        print(f"[CensorGuard] Model loaded successfully. Provider: {self.session.get_providers()[0]}")

    def _letterbox(self, img, new_shape=(640, 640), color=(114, 114, 114)):
        """Resize image to new_shape with padding to maintain aspect ratio."""
        shape = img.shape[:2]  # [height, width]
        r = min(new_shape[0] / shape[0], new_shape[1] / shape[1])
        new_unpad = (int(round(shape[1] * r)), int(round(shape[0] * r)))
        dw = (new_shape[1] - new_unpad[0]) / 2
        dh = (new_shape[0] - new_unpad[1]) / 2

        if shape[::-1] != new_unpad:
            img = cv2.resize(img, new_unpad, interpolation=cv2.INTER_LINEAR)

        top, bottom = int(round(dh - 0.1)), int(round(dh + 0.1))
        left, right = int(round(dw - 0.1)), int(round(dw + 0.1))
        img = cv2.copyMakeBorder(img, top, bottom, left, right, cv2.BORDER_CONSTANT, value=color)
        return img, r, dw, dh

    def detect(self, frame):
        """
        Runs object detection on a single frame.
        Returns a list of dicts: [{'class': name, 'score': float, 'box': [x1, y1, x2, y2]}]
        """
        orig_h, orig_w = frame.shape[:2]
        padded_img, ratio, pad_w, pad_h = self._letterbox(frame, (640, 640))
        
        # Convert BGR -> RGB, normalize to [0, 1], transpose to (1, 3, 640, 640)
        blob = cv2.cvtColor(padded_img, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        blob = np.transpose(blob, (2, 0, 1))
        blob = np.expand_dims(blob, axis=0)

        outputs = self.session.run(None, {self.input_name: blob})[0]
        # output0 shape: (1, 22, 8400) -> transpose to (8400, 22)
        predictions = np.transpose(outputs[0], (1, 0))

        boxes = []
        confidences = []
        class_ids = []

        for pred in predictions:
            cx, cy, w, h = pred[:4]
            scores = pred[4:]
            class_id = int(np.argmax(scores))
            conf = float(scores[class_id])

            if conf >= self.conf_threshold:
                # Convert center-xywh to corner-xyxy on the padded 640x640 canvas
                x1 = cx - w / 2.0
                y1 = cy - h / 2.0
                
                # Transform back to original image coordinates
                orig_x1 = max(0, int((x1 - pad_w) / ratio))
                orig_y1 = max(0, int((y1 - pad_h) / ratio))
                orig_x2 = min(orig_w, int(((x1 + w) - pad_w) / ratio))
                orig_y2 = min(orig_h, int(((y1 + h) - pad_h) / ratio))

                boxes.append([orig_x1, orig_y1, orig_x2 - orig_x1, orig_y2 - orig_y1])
                confidences.append(conf)
                class_ids.append(class_id)

        # Apply Non-Maximum Suppression (NMS) to eliminate duplicate overlapping boxes
        indices = cv2.dnn.NMSBoxes(boxes, confidences, self.conf_threshold, self.iou_threshold)
        detections = []
        if len(indices) > 0:
            for i in indices.flatten():
                bx, by, bw, bh = boxes[i]
                cls_name = CLASSES[class_ids[i]]
                detections.append({
                    "class": cls_name,
                    "score": round(confidences[i], 3),
                    "box": [bx, by, bx + bw, by + bh]
                })

        return detections

    def censor_frame(self, frame, blur_radius=51):
        """
        Detects sensitive content in the frame and applies heavy Gaussian blur only
        to vulgar/sensitive regions. Faces and non-sensitive parts are strictly preserved.
        """
        detections = self.detect(frame)
        censored_frame = frame.copy()
        found_sensitive = False

        for det in detections:
            cls_name = det["class"]
            if cls_name in self.sensitive_classes:
                found_sensitive = True
                x1, y1, x2, y2 = det["box"]
                roi = censored_frame[y1:y2, x1:x2]
                if roi.size > 0:
                    # Apply heavy Gaussian blur to the sensitive area
                    ksize = (blur_radius, blur_radius) if blur_radius % 2 == 1 else (blur_radius + 1, blur_radius + 1)
                    blurred = cv2.GaussianBlur(roi, ksize, 30)
                    censored_frame[y1:y2, x1:x2] = blurred

        return censored_frame, detections, found_sensitive

    def process_video(self, input_video_path, output_video_path, reject_if_sensitive=False):
        """
        Processes a full video:
        - If reject_if_sensitive=True, scans the video and raises an error if sensitive content is present.
        - Otherwise, censors (blurs) all sensitive regions frame-by-frame and saves the sanitized video.
        """
        cap = cv2.VideoCapture(input_video_path)
        if not cap.isOpened():
            raise IOError(f"Could not open video file: {input_video_path}")

        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        print(f"[CensorGuard] Processing video: {input_video_path} ({width}x{height} @ {fps:.1f} FPS, {total_frames} frames)")

        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(output_video_path, fourcc, fps, (width, height))

        frame_count = 0
        sensitive_frames_count = 0

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            censored, detections, has_sensitive = self.censor_frame(frame)
            if has_sensitive:
                sensitive_frames_count += 1
                if reject_if_sensitive:
                    cap.release()
                    out.release()
                    if os.path.exists(output_video_path):
                        os.remove(output_video_path)
                    raise ValueError(f"[CensorGuard Security Alert] Video rejected: Sensitive/vulgar content detected at frame {frame_count}!")

            out.write(censored)
            frame_count += 1

        cap.release()
        out.release()
        print(f"[CensorGuard] Completed! Processed {frame_count} frames. Sensitive frames censored: {sensitive_frames_count}.")
        print(f"[CensorGuard] Output video ready for SonicFrame: {output_video_path}")
        return output_video_path
