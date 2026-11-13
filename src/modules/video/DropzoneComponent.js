/**
 * src/modules/video/DropzoneComponent.ts
 * Drag-and-Drop Ingestion & File Format Validator
 * Implements Section 8.2 of SONICFRAME Enterprise Architecture v4.0
 */
export class DropzoneComponent {
    element;
    onFileSelected;
    constructor(element, onFileSelected) {
        this.element = element;
        this.onFileSelected = onFileSelected;
        this.initEvents();
    }
    initEvents() {
        ['dragenter', 'dragover'].forEach((eventName) => {
            this.element.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.element.classList.add('drag');
            });
        });
        ['dragleave', 'drop'].forEach((eventName) => {
            this.element.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.element.classList.remove('drag');
            });
        });
        this.element.addEventListener('drop', (e) => {
            const files = e.dataTransfer?.files;
            if (files && files.length > 0) {
                const file = files[0];
                if (file.type.startsWith('video/') || file.name.endsWith('.mp4') || file.name.endsWith('.webm')) {
                    this.onFileSelected(file);
                }
                else {
                    alert('Please upload a valid MP4 or WebM animation clip.');
                }
            }
        });
    }
}
