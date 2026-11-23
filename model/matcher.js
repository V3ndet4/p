import { rankFlowers } from './rank-flowers.js';
import { env, InferenceSession, Tensor } from './ort.wasm.min.mjs';

env.wasm.numThreads = 1;
env.wasm.wasmPaths = new URL('.', import.meta.url).href;
let resources;

async function loadVectors(filename) {
  const response = await fetch(new URL(filename, import.meta.url));
  if (!response.ok) throw new Error('Could not load plant identification data.');
  return response.json();
}

async function load() {
  const [labels, references, session] = await Promise.all([
    loadVectors('labels.json?v=2'), loadVectors('flower-references.json'),
    InferenceSession.create(new URL('vision.onnx', import.meta.url).href, { executionProviders: ['wasm'] })
  ]);
  return { session, labels, references };
}

async function match(rgba) {
  resources ??= load().catch(error => {
    resources = undefined;
    throw error;
  });
  const { session, labels, references } = await resources;
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
  const normalized = Float32Array.from(features, x => x / norm);
  input.dispose();
  embedding.dispose();
  return rankFlowers(normalized, labels, references);
}

let queue = Promise.resolve();
self.onmessage = ({ data }) => {
  queue = queue.then(async () => {
    try {
      self.postMessage({ id: data.id, matches: await match(data.rgba) });
    } catch {
      self.postMessage({ id: data.id, error: 'Photo matching is unavailable. Try another photo later.' });
    }
  });
};
