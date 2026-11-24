const identifyEndpoint = 'https://my-api.plantnet.org/v2/identify/all';

function photoBlob(dataUrl) {
  const header = /^data:(image\/(?:jpeg|png));base64,/i.exec(dataUrl);
  if (!header) throw new Error('Choose a JPEG or PNG photo for Pl@ntNet.');
  let bytes;
  try {
    bytes = Uint8Array.from(atob(dataUrl.slice(header[0].length)), char => char.charCodeAt(0));
  } catch {
    throw new Error('This photo could not be read. Try another photo.');
  }
  if (!bytes.length) throw new Error('Choose a photo before searching.');
  if (bytes.length > 50_000_000) throw new Error('Choose a photo smaller than 50 MB.');
  return new Blob([bytes], { type: header[1].toLowerCase() });
}

// Pl@ntNet returns species in descending score order and uses HTTP 404 for no match.
// https://my.plantnet.org/doc/api/identify
export async function specialistMatches(photoDataUrl, key) {
  if (typeof key !== 'string' || !key.trim()) throw new Error('Enter a Pl@ntNet API key.');
  const photo = photoBlob(photoDataUrl);
  const url = new URL(identifyEndpoint);
  url.searchParams.set('api-key', key.trim());
  url.searchParams.set('nb-results', '5');
  url.searchParams.set('lang', 'en');
  const body = new FormData();
  body.append('images', photo, photo.type === 'image/png' ? 'plant.png' : 'plant.jpg');
  body.append('organs', 'auto');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  let response, payload;
  try {
    response = await fetch(url, {
      method: 'POST', body, signal: controller.signal, credentials: 'omit',
      redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer'
    });
    if (response.ok) payload = await response.json();
  } catch {
    throw new Error(controller.signal.aborted
      ? 'Pl@ntNet timed out. Try again.'
      : 'Could not read a response from Pl@ntNet. Check your connection and try again.');
  } finally {
    clearTimeout(timeout);
  }
  if (response.status === 404) return [];
  if (response.status === 401 || response.status === 403) throw new Error('Pl@ntNet declined this API key. Check the key and try again.');
  if (response.status === 429) throw new Error('This Pl@ntNet key has reached its request limit. Try again later.');
  if (response.status === 400 || response.status === 413 || response.status === 415 || response.status === 422) {
    throw new Error('Pl@ntNet could not process this photo. Try a clear JPEG or PNG of one plant.');
  }
  if (!response.ok || !Array.isArray(payload?.results)) throw new Error('Pl@ntNet is unavailable. Try again later.');

  const matches = [];
  const seen = new Set();
  for (const result of payload.results) {
    const species = result?.species;
    const scientific = [species?.scientificNameWithoutAuthor, species?.scientificName]
      .find(value => typeof value === 'string' && value.trim())?.trim();
    if (!scientific || seen.has(scientific.toLowerCase())) continue;
    const common = Array.isArray(species.commonNames) && species.commonNames
      .find(name => typeof name === 'string' && name.trim());
    matches.push({ name: common ? common.trim() : scientific, scientific });
    seen.add(scientific.toLowerCase());
    if (matches.length === 5) break;
  }
  return matches;
}
