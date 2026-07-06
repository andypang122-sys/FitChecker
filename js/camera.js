'use strict';
/* ============================================================
   Camera — live camera capture (getUserMedia) + file upload,
   with client-side compression so photos fit in localStorage.
   Public API:
     Camera.pickImage({ onImage(dataUrl) })  → opens a chooser
       modal: "Take photo" (if camera available) or "Upload".
     Camera.uploadOnly({ onImage })          → file picker only.
   ============================================================ */

const Camera = (() => {
  const MAX_DIM = 900;      // longest edge after compression
  const JPEG_QUALITY = 0.72;

  /* ---------- compression ---------- */

  function compress(source, cb) {
    // source: HTMLImageElement or HTMLVideoElement
    const w = source.videoWidth || source.naturalWidth;
    const h = source.videoHeight || source.naturalHeight;
    if (!w || !h) { cb(null); return; }

    const scale = Math.min(1, MAX_DIM / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
    cb(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
  }

  function fileToDataUrl(file, cb) {
    if (!file || !file.type.startsWith('image/')) {
      cb(null, 'Please choose an image file.');
      return;
    }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      compress(img, dataUrl => {
        URL.revokeObjectURL(url);
        cb(dataUrl, dataUrl ? null : 'Could not read this image.');
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      cb(null, 'Could not read this image.');
    };
    img.src = url;
  }

  /* ---------- file upload ---------- */

  function uploadOnly({ onImage, onError }) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files && input.files[0];
      fileToDataUrl(file, (dataUrl, err) => {
        if (err) { if (onError) onError(err); return; }
        onImage(dataUrl);
      });
    };
    input.click();
  }

  /* ---------- live camera modal ---------- */

  function openCamera({ onImage, onError }) {
    const root = document.getElementById('modal-root');
    let stream = null;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal camera-modal" role="dialog" aria-label="Camera">
        <video autoplay playsinline muted></video>
        <div class="cam-error hidden"></div>
        <div class="cam-controls">
          <button class="btn btn-secondary" data-cam="cancel">Cancel</button>
          <button class="btn btn-primary btn-lg" data-cam="shoot">Take photo</button>
          <button class="btn btn-secondary" data-cam="flip" title="Switch camera">Flip</button>
        </div>
      </div>`;
    root.appendChild(overlay);

    const video = overlay.querySelector('video');
    const errBox = overlay.querySelector('.cam-error');
    let facing = 'user';

    function stop() {
      if (stream) stream.getTracks().forEach(t => t.stop());
      stream = null;
    }

    function close() {
      stop();
      overlay.remove();
    }

    function start() {
      stop();
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showErr('Camera is not available in this browser. Use "Upload" instead.');
        return;
      }
      navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false })
        .then(s => {
          stream = s;
          video.srcObject = s;
          errBox.classList.add('hidden');
        })
        .catch(() => {
          showErr('Camera access was denied or is unavailable. You can still upload a photo instead.');
        });
    }

    function showErr(msg) {
      errBox.textContent = msg;
      errBox.classList.remove('hidden');
    }

    overlay.addEventListener('click', e => {
      if (e.target === overlay) { close(); return; }
      const btn = e.target.closest('[data-cam]');
      if (!btn) return;
      const action = btn.getAttribute('data-cam');
      if (action === 'cancel') close();
      if (action === 'flip') {
        facing = facing === 'user' ? 'environment' : 'user';
        start();
      }
      if (action === 'shoot') {
        if (!stream) { showErr('No camera stream. Try again or upload instead.'); return; }
        compress(video, dataUrl => {
          close();
          if (dataUrl) onImage(dataUrl);
          else if (onError) onError('Could not capture the photo.');
        });
      }
    });

    start();
  }

  /* ---------- chooser: camera or upload ---------- */

  function pickImage({ onImage, onError }) {
    const canCamera = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    if (!canCamera) { uploadOnly({ onImage, onError }); return; }

    const root = document.getElementById('modal-root');
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-label="Add a photo">
        <h3 class="card-title">Add a photo</h3>
        <div class="btn-row" style="flex-direction:column">
          <button class="btn btn-primary btn-block btn-lg" data-pick="camera">Take a photo</button>
          <button class="btn btn-secondary btn-block btn-lg" data-pick="upload">Upload from device</button>
          <button class="btn btn-ghost btn-block" data-pick="cancel">Cancel</button>
        </div>
      </div>`;
    root.appendChild(overlay);

    overlay.addEventListener('click', e => {
      if (e.target === overlay) { overlay.remove(); return; }
      const btn = e.target.closest('[data-pick]');
      if (!btn) return;
      overlay.remove();
      const action = btn.getAttribute('data-pick');
      if (action === 'camera') openCamera({ onImage, onError });
      if (action === 'upload') uploadOnly({ onImage, onError });
    });
  }

  return { pickImage, uploadOnly };
})();
