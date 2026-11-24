const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escape = value => String(value ?? "").replace(/[&<>"']/g, mark => entities[mark]);

function sourceLink(url, label) {
  if (!url) return "";
  try {
    const absolute = new URL(url);
    if (absolute.protocol !== "https:" && absolute.protocol !== "http:") return "";
    return `<a href="${escape(absolute.href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  } catch {
    return "";
  }
}

function careTile(title, lines) {
  return `<div class="mp-tile"><dt>${title}</dt><dd>${lines.filter(Boolean).map(line => `<p>${escape(line)}</p>`).join("")}</dd></div>`;
}

function carePreview(candidate) {
  const { guide, source } = candidate;
  const watering = guide?.test || guide?.water
    ? [guide.test, guide.water]
    : ["Water needs are unknown. Check the plant label before watering."];
  const lighting = guide?.light || "Light needs are unknown. Check the plant label for a suitable spot.";
  const health = guide?.about
    ? [guide.about, "Check several leaves or stems for new spots, wilting, or damage."]
    : ["Visible health is unassessed. Look at several leaves or stems for new spots, wilting, or damage."];
  const drainage = guide
    ? "For a pot, check that excess water can leave through the base and empty any standing water from its saucer."
    : "Drainage needs are unknown. Check the care label before changing the container or growing medium.";
  const careLink = sourceLink(guide?.source, "Care source");
  const matchLink = source && (!careLink || source !== guide?.source) ? sourceLink(source, "Identification source") : "";
  return `<section class="mp-care"><h3>${escape(candidate.name || candidate.scientific || "Selected plant")}</h3>
    <dl class="mp-tiles">${careTile("Watering", watering)}${careTile("Sunlight", [lighting])}${careTile("Visible health check", health)}${careTile("Drainage", [drainage])}</dl>
    ${careLink || matchLink ? `<div class="mp-sources">${careLink}${matchLink}</div>` : ""}</section>`;
}

export function renderMatches(candidates, selected = []) {
  if (!Array.isArray(candidates) || !candidates.length) return "";
  const chosen = new Set(selected);
  const choices = candidates.map(({ name, scientific, rank }, index) => {
    const checked = chosen.has(index);
    return `<label class="mp-option${checked ? " mp-selected" : ""}">
      <input type="checkbox" data-candidate="${index}"${checked ? " checked" : ""}>
      <span><strong>${escape(name || scientific || "Possible match")}</strong>${rank ? `<small>Likely ${escape(rank)} match</small>` : ""}${scientific && scientific !== name ? `<i>${escape(scientific)}</i>` : ""}</span></label>`;
  }).join("");
  return `<div class="match-preview"><fieldset class="mp-picks"><legend>Which plant do you see?</legend>
    <p>These are possible matches for the photo. Choose more than one only if you see separate plants.</p>
    <div class="mp-options">${choices}</div></fieldset>
    ${candidates.filter((_, index) => chosen.has(index)).map(carePreview).join("")}</div>`;
}
