/**
 * src/modules/audio/Exporter.ts
 * Lossless 24-Bit 48kHz Linear PCM WAV Exporter
 * Implements Section 7.1 & 12 of SONICFRAME Enterprise Architecture v4.0
 */
export class WavExporter {
    static encodeWav24Bit(audioBuffer) {
        const numChannels = audioBuffer.numberOfChannels;
        const sampleRate = audioBuffer.sampleRate;
        const numSamples = audioBuffer.length;
        const bytesPerSample = 3; // 24-bit = 3 bytes
        const blockAlign = numChannels * bytesPerSample;
        const byteRate = sampleRate * blockAlign;
        const dataSize = numSamples * blockAlign;
        const headerSize = 44;
        const totalSize = headerSize + dataSize;
        const buffer = new ArrayBuffer(totalSize);
        const view = new DataView(buffer);
        // RIFF Chunk Descriptor
        this.writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + dataSize, true); // ChunkSize
        this.writeString(view, 8, 'WAVE');
        // "fmt " Sub-chunk
        this.writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
        view.setUint16(20, 1, true); // AudioFormat (1 = uncompressed PCM)
        view.setUint16(22, numChannels, true); // NumChannels
        view.setUint32(24, sampleRate, true); // SampleRate
        view.setUint32(28, byteRate, true); // ByteRate
        view.setUint16(32, blockAlign, true); // BlockAlign
        view.setUint16(34, 24, true); // BitsPerSample
        // "data" Sub-chunk
        this.writeString(view, 36, 'data');
        view.setUint32(40, dataSize, true);
        // Interleave and write 24-bit samples
        const channels = [];
        for (let c = 0; c < numChannels; c++) {
            channels.push(audioBuffer.getChannelData(c));
        }
        let offset = 44;
        const MAX_24 = 8388607; // 2^23 - 1
        const MIN_24 = -8388608; // -2^23
        for (let i = 0; i < numSamples; i++) {
            for (let c = 0; c < numChannels; c++) {
                const sample = Math.max(-1.0, Math.min(1.0, channels[c][i]));
                const intSample = sample < 0
                    ? Math.floor(sample * 8388608)
                    : Math.floor(sample * MAX_24);
                const clamped = Math.max(MIN_24, Math.min(MAX_24, intSample));
                // Little-endian 3-byte write
                view.setUint8(offset, clamped & 0xff);
                view.setUint8(offset + 1, (clamped >> 8) & 0xff);
                view.setUint8(offset + 2, (clamped >> 16) & 0xff);
                offset += 3;
            }
        }
        return buffer;
    }
    static writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }
    static downloadBlob(buffer, filename = 'sonicframe-master-score.wav') {
        const blob = new Blob([buffer], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}
