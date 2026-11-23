// Each request transfers only its cropped pixels to a same-origin worker.
// Photos and embeddings stay on the device.
let worker;
const pending = new Map();
let requestId = 0;

function resetWorker(error) {
  worker?.terminate();
  worker = undefined;
  for (const request of pending.values()) {
    clearTimeout(request.timer);
    request.reject(error);
  }
  pending.clear();
}

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./model/matcher.js?v=2', import.meta.url), { type: 'module' });
  worker.onerror = () => resetWorker(new Error('Photo matching could not start.'));
  worker.onmessage = ({ data }) => {
    const request = pending.get(data.id);
    if (!request) return;
    clearTimeout(request.timer);
    pending.delete(data.id);
    if (data.error) request.reject(new Error(data.error));
    else request.resolve(data.matches);
  };
  return worker;
}

export async function identify(photoDataUrl) {
  const image = new Image();
  image.src = photoDataUrl;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 224;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const size = Math.min(image.naturalWidth, image.naturalHeight);
  context.fillStyle = 'white';
  context.fillRect(0, 0, 224, 224);
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, (image.naturalWidth - size) / 2, (image.naturalHeight - size) / 2,
    size, size, 0, 0, 224, 224);
  const rgba = context.getImageData(0, 0, 224, 224).data;
  const matcher = getWorker();
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    const timer = setTimeout(() => resetWorker(new Error('Photo matching timed out.')), 90000);
    pending.set(id, { resolve, reject, timer });
    matcher.postMessage({ id, rgba }, [rgba.buffer]);
  });
}
