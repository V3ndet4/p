export function observation(total, healthy) {
  if (total === "" || healthy === "") return null;
  const n = Number(total), h = Number(healthy);
  return Number.isInteger(n) && Number.isInteger(h) && n > 0 && n <= 100 && h >= 0 && h <= n
    ? { total: n, healthy: h } : null;
}

export function heartBar(check) {
  const sample = check && observation(check.total, check.healthy);
  const ratio = sample ? sample.healthy / sample.total : 0;
  const caption = sample ? `${sample.healthy} of ${sample.total} checked look healthy` : "Not assessed yet";
  const hearts = Array.from({length: 5}, (_, index) => {
    const fill = Math.max(0, Math.min(1, ratio * 5 - index)) * 100;
    return `<span class="heart" style="--fill:${fill}%">♥︎</span>`;
  }).join("");
  const stamp = sample && check.at ? `<small>Checked ${new Date(check.at).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"})}</small>` : "";
  return `<div class="love-bar${sample ? "" : " unrated"}"><div class="love-heading"><strong>Visible health</strong><span aria-hidden="true" class="hearts">${hearts}</span></div><span>${caption}</span>${stamp}</div>`;
}

export function healthFields() {
  return `<fieldset class="health-input"><legend>Visible health check</legend>
    <p>Look at leaves or stem segments from different sides. Count those with their usual color and shape, without unusual wilting, spots, or damage. Natural markings and spent flowers don’t count as damage.</p>
    <p class="quick-label">If you checked five, tap how many look healthy.</p>
    <div class="quick-counts" role="group" aria-label="Healthy parts out of five">${[0,1,2,3,4,5].map(n=>`<button type="button" data-action="rate-five" data-count="${n}" aria-label="${n} of 5 look healthy">${n}</button>`).join("")}</div>
    <div class="counts"><label>Parts checked<input id="inspected" type="number" min="1" max="100" step="1" inputmode="numeric" placeholder="e.g. 5"></label>
    <label>Look healthy<input id="healthy" type="number" min="0" max="100" step="1" inputmode="numeric" placeholder="e.g. 4"></label></div>
    <p class="quiet">Each heart represents one fifth of your sample. A full bar means every part you checked looked healthy. Root condition is outside this check.</p></fieldset>`;
}
