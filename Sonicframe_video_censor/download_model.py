import os
import sys
import urllib.request

MODEL_URL = "https://huggingface.co/zhangsongbo365/nudenet_onnx/resolve/main/640m.onnx"
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "models")
OUTPUT_PATH = os.path.join(OUTPUT_DIR, "640m.onnx")

def progress_bar(blocks_transferred, block_size, total_size):
    if total_size > 0:
        percent = (blocks_transferred * block_size / total_size) * 100
        downloaded_mb = (blocks_transferred * block_size) / (1024 * 1024)
        total_mb = total_size / (1024 * 1024)
        sys.stdout.write(f"\rDownloading: {downloaded_mb:.1f} MB / {total_mb:.1f} MB [{percent:.1f}%]")
        sys.stdout.flush()

def download_model():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    if os.path.exists(OUTPUT_PATH):
        print(f"Model already exists at: {OUTPUT_PATH}")
        return OUTPUT_PATH
    
    print(f"Fetching SOTA high-accuracy censorship model from:\n{MODEL_URL}")
    print(f"Saving to: {OUTPUT_PATH}\n")
    urllib.request.urlretrieve(MODEL_URL, OUTPUT_PATH, reporthook=progress_bar)
    print("\nDownload complete successfully!")
    return OUTPUT_PATH

if __name__ == "__main__":
    download_model()
