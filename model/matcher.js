import { env, InferenceSession, Tensor } from './ort.wasm.min.mjs';

env.wasm.numThreads = 1;
env.wasm.wasmPaths = new URL('.', import.meta.url).href;
let resources;

async function load() {
  const labelsResponse = await fetch(new URL('labels.json', import.meta.url));
  if (!labelsResponse.ok) throw new Error('Could not load flower labels.');
  const labels = await labelsResponse.json();
  const session = await InferenceSession.create(new URL('vision.onnx', import.meta.url).href,
    { executionProviders: ['wasm'] });
  return { session, labels };
}

async function match(rgba) {
  resources ??= load().catch(error => {
    resources = undefined;
    throw error;
  });
  const { session, labels } = await resources;
  const plane = 224 * 224;
  const mean = [0.48145466, 0.4578275, 0.40821073];
  const std = [0.26862954, 0.26130258, 0.27577711];
  const pixels = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    for (let channel = 0; channel < 3; channel++) {
      pixels[channel * plane + i] = (rgba[4 * i + channel] / 255 - mean[channel]) / std[channel];
    }
  }
  const input = new Tensor('float32', pixels, [1, 3, 224, 224]);
  const { image_embeds: embedding } = await session.run({ pixel_values: input });
  const features = embedding.data;
  const norm = Math.hypot(...features) || 1;
  const ranked = Object.entries(labels).map(([id, vector]) => ({
    id, score: vector.reduce((total, weight, index) => total + weight * features[index], 0) / norm
  })).sort((a, b) => b.score - a.score);
  input.dispose();
  embedding.dispose();
  const best = ranked[0];
  // Underscored labels represent untracked flowers, other plants, and nonplant scenes.
  // A weak overall similarity or an out-of-catalog winner should leave the choice open.
  const other = ranked.find(({ id }) => id.startsWith('_'));
  if (best.id.startsWith('_') || best.score < 0.39 || best.score - other.score < 0.01) return [];
  return ranked.filter(({ id, score }) => !id.startsWith('_') &&
    score >= 0.39 && score >= best.score - 0.025).slice(0, 3).map(({ id }) => id);
}

let queue = Promise.resolve();
self.onmessage = ({ data }) => {
  queue = queue.then(async () => {
    try {
      self.postMessage({ id: data.id, matches: await match(data.rgba) });
    } catch {
      self.postMessage({ id: data.id, error: 'Photo matching is unavailable. Choose the plant manually.' });
    }
  });
};
