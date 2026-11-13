/**
 * src/modules/timeline/CueEditorModal.ts
 * Per-Cue Foley Parameter Override Modal & Real-Time Audition Inspector
 * Implements Section 8.2 of SONICFRAME Enterprise Architecture v4.0
 */
export class CueEditorModal {
    container = null;
    currentCue = null;
    audioEngine;
    onUpdate;
    constructor(audioEngine, onUpdate) {
        this.audioEngine = audioEngine;
        this.onUpdate = onUpdate;
    }
    open(cue) {
        this.currentCue = JSON.parse(JSON.stringify(cue));
        this.render();
    }
    close() {
        if (this.container) {
            this.container.remove();
            this.container = null;
        }
    }
    render() {
        if (!this.currentCue)
            return;
        this.close();
        const cue = this.currentCue;
        const modal = document.createElement('div');
        modal.className = 'cue-editor-backdrop';
        modal.style.cssText = `
      position: fixed; inset: 0; background: rgba(5,7,11,0.85); backdrop-filter: blur(12px);
      z-index: 9999; display: flex; align-items: center; justify-content: center;
    `;
        modal.innerHTML = `
      <div class="panel" style="width: 440px; max-width: 92vw; padding: 22px; background: #111419; border: 1px solid #363d4a; border-radius: 14px; box-shadow: 0 20px 50px rgba(0,0,0,0.8);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 18px; border-bottom: 1px solid #263247; padding-bottom: 12px;">
          <h3 style="margin:0; font-size:15px; color:#f1f3f6;">⚙️ Foley Cue Inspector [Frame ${cue.frame_number}]</h3>
          <button id="closeModalBtn" style="background:transparent; color:#8491a7; font-size:18px;">✕</button>
        </div>

        <div style="display:grid; gap: 12px; font-size: 12.5px;">
          <div>
            <label style="display:block; color:#9299a4; margin-bottom:4px;">Material Category</label>
            <select id="modalCategory" style="width:100%; background:#0b121d; color:#eef3ff; border:1px solid #34445d; border-radius:8px; padding:8px;">
              <option value="impact_metallic" ${cue.category === 'impact_metallic' ? 'selected' : ''}>Metallic Clash (Sharp High-Q)</option>
              <option value="impact_heavy" ${cue.category === 'impact_heavy' ? 'selected' : ''}>Heavy Impact (Sub-Bass Drop)</option>
              <option value="footstep_wood" ${cue.category === 'footstep_wood' ? 'selected' : ''}>Hardwood Impact (Warm Fast)</option>
              <option value="whoosh_pass" ${cue.category === 'whoosh_pass' ? 'selected' : ''}>Aerodynamic Whoosh Sweep</option>
            </select>
          </div>

          <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div>
              <label style="display:block; color:#9299a4; margin-bottom:4px;">Fundamental (Hz): <b id="valFund">${cue.parameters.fundamental_freq}</b></label>
              <input id="inputFund" type="range" min="40" max="1200" step="10" value="${cue.parameters.fundamental_freq}" style="width:100%; accent-color:#5ce1e6;">
            </div>
            <div>
              <label style="display:block; color:#9299a4; margin-bottom:4px;">Decay (s): <b id="valDecay">${cue.parameters.decay_seconds}</b></label>
              <input id="inputDecay" type="range" min="0.05" max="2.5" step="0.05" value="${cue.parameters.decay_seconds}" style="width:100%; accent-color:#d7a77b;">
            </div>
          </div>

          <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div>
              <label style="display:block; color:#9299a4; margin-bottom:4px;">Velocity: <b id="valVel">${cue.velocity}</b></label>
              <input id="inputVel" type="range" min="0.1" max="1.0" step="0.05" value="${cue.velocity}" style="width:100%; accent-color:#5ce1e6;">
            </div>
            <div>
              <label style="display:block; color:#9299a4; margin-bottom:4px;">Stereo Pan: <b id="valPan">${cue.pan}</b></label>
              <input id="inputPan" type="range" min="-1.0" max="1.0" step="0.05" value="${cue.pan}" style="width:100%; accent-color:#a78bfa;">
            </div>
          </div>
        </div>

        <div style="display:flex; justify-content:space-between; margin-top: 20px; padding-top: 14px; border-top: 1px solid #263247;">
          <button id="previewCueBtn" class="ghost" style="padding: 8px 14px;">▶ Audition Hit</button>
          <button id="saveCueBtn" class="primary" style="padding: 8px 18px;">Apply Changes</button>
        </div>
      </div>
    `;
        document.body.appendChild(modal);
        this.container = modal;
        // Attach listeners
        const catSel = modal.querySelector('#modalCategory');
        const inFund = modal.querySelector('#inputFund');
        const inDecay = modal.querySelector('#inputDecay');
        const inVel = modal.querySelector('#inputVel');
        const inPan = modal.querySelector('#inputPan');
        inFund.oninput = () => { modal.querySelector('#valFund').textContent = inFund.value; };
        inDecay.oninput = () => { modal.querySelector('#valDecay').textContent = inDecay.value; };
        inVel.oninput = () => { modal.querySelector('#valVel').textContent = inVel.value; };
        inPan.oninput = () => { modal.querySelector('#valPan').textContent = inPan.value; };
        modal.querySelector('#closeModalBtn').onclick = () => this.close();
        modal.querySelector('#previewCueBtn').onclick = () => {
            this.audioEngine.init();
            if (this.audioEngine.modalSynth && this.audioEngine.mixer) {
                this.audioEngine.modalSynth.trigger(this.audioEngine.mixer.channels.foleyImpact.input, {
                    material: catSel.value.includes('metal') ? 'metal' : catSel.value.includes('wood') ? 'wood' : 'earth',
                    fundamental: Number(inFund.value),
                    damping: 1.5 / Number(inDecay.value),
                    velocity: Number(inVel.value),
                    pan: Number(inPan.value),
                });
            }
        };
        modal.querySelector('#saveCueBtn').onclick = () => {
            cue.category = catSel.value;
            cue.parameters.fundamental_freq = Number(inFund.value);
            cue.parameters.fundamental_hz = Number(inFund.value);
            cue.parameters.decay_seconds = Number(inDecay.value);
            cue.parameters.decay_s = Number(inDecay.value);
            cue.velocity = Number(inVel.value);
            cue.pan = Number(inPan.value);
            this.onUpdate(cue);
            this.close();
        };
    }
}
