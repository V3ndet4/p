import {plantNames} from "./plant-names.js";

function dot(vector, features) {
  let sum = 0;
  for (let i = 0; i < features.length; i++) sum += vector[i] * features[i];
  return sum;
}

export function rankFlowers(features, labels, references) {
  // The visual reference score uses the closest appearance cluster for each
  // class. A linear classifier adds evidence from all labeled reference photos.
  const visual = new Map();
  for (const [id, ref] of Object.entries(references)) {
    visual.set(id, Math.max(...ref.centers.map(center => dot(center, features))));
  }
  const scores = [...visual.values()].sort((a,b) => a-b);
  const mid = Math.floor(scores.length / 2);
  const neutral = scores.length % 2 ? scores[mid] : (scores[mid-1] + scores[mid]) / 2;
  const ranked = Object.entries(labels).map(([id, label]) => {
    const ref = references[id];
    const text = dot(label, features);
    const image = visual.get(id) ?? neutral;
    const linear = ref ? dot(ref.weights, features) + ref.bias : 0;
    return {id, text, image, linear, score: text + 0.45 * image + 0.32 * linear};
  }).sort((a,b) => b.score-a.score);
  const [best, second] = ranked;
  if (!plantNames[best.id]) return [];

  // Background and lookalike classes can veto an identification even when
  // a flower narrowly wins the combined score.
  const generic = ['_foliage','_garden','_nonplant','_blank'];
  const scene = Math.max(...ranked.filter(row => generic.includes(row.id)).map(row => row.text));
  if (scene >= best.text - 0.016 && best.linear < 0.18) return [];
  const margin = best.score - second.score;
  const textRival = Math.max(...ranked.slice(1).map(row => row.text));
  if (best.text >= 0.43 && best.text - textRival >= 0.045 && best.linear > 0 && margin > 0.01) return [best.id];
  const background = Math.max(...ranked.filter(row => !plantNames[row.id]).map(row => row.text));
  if (best.text < 0.34 || background >= best.text + 0.025) return [];
  if ((best.image < 0.74 && best.text < 0.435) || (best.linear < 0.07 && best.text < 0.44)) return [];
  return ranked.slice(0,3).filter(row => plantNames[row.id] && best.score-row.score < 0.035 && row.text >= 0.34 && (row.image >= 0.74 || row.text >= 0.435)).map(row=>row.id);
}
