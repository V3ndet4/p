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
  const [labels, jadeReference, session] = await Promise.all([
    loadVectors('labels.json'), loadVectors('jade-reference.json'),
    InferenceSession.create(new URL('vision.onnx', import.meta.url).href, { executionProviders: ['wasm'] })
  ]);
  return { session, labels, jadeReference };
}

async function match(rgba) {
  resources ??= load().catch(error => {
    resources = undefined;
    throw error;
  });
  const { session, labels, jadeReference } = await resources;
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
  const similarity = vector => vector.reduce((total, weight, i) => total + weight * features[i], 0) / norm;
  const rank = vectors => Object.entries(vectors).map(([id, vector]) => ({ id, score: similarity(vector) }))
    .sort((a, b) => b.score - a.score);
  const ranked = rank(labels);
  const references = rank(jadeReference);
  input.dispose();
  embedding.dispose();
  const best = ranked[0];
  // Underscored labels represent untracked flowers, other plants, and nonplant scenes.
  // A weak overall similarity or an out-of-catalog winner should leave the choice open.
  const other = ranked.find(({ id }) => id.startsWith('_'));
  if (best.id.startsWith('_') || best.score < 0.39 || best.score - other.score < 0.01) {
    // For an ambiguous succulent, require agreement from both the text matcher
    // and independent photo references before offering jade as a candidate.
    const jade = ranked.find(({ id }) => id === 'jade');
    const plausible = ['jade', '_succulent', '_elephantbush', '_zz', '_foliage', '_aloe'];
    if (plausible.includes(best.id) && jade.score >= 0.39 && best.score - jade.score <= 0.04 &&
        references[0].id === 'jade' && references[0].score >= 0.86 &&
        references[0].score - references[1].score >= 0.025) return ['jade'];
    return [];
  }
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
