// These are care-profile matches, not claims that a photo identifies a cultivar.
// Unknown taxa intentionally remain independent of the curated catalog.
const speciesCare = new Map(Object.entries({
  "streptocarpus ionanthus": "violet",
  "saintpaulia ionantha": "violet",
  "kalanchoe blossfeldiana": "kalanchoe",
  "crassula ovata": "jade",
  "schlumbergera": "christmas",
  "schlumbergera truncata": "christmas",
  "schlumbergera buckleyi": "christmas",
  "euphorbia pulcherrima": "poinsettia",
  "anthurium andraeanum": "anthurium",
  "cyclamen persicum": "cyclamen",
  "clivia miniata": "clivia",
  "euphorbia milii": "crownofthorns",
  "hibiscus rosa-sinensis": "hibiscus",
  "gardenia jasminoides": "gardenia",
  "gerbera jamesonii": "gerbera",
  "gerbera hybrida": "gerbera",
  "sinningia speciosa": "gloxinia",
  "gloxinia speciosa": "gloxinia",
  "begonia semperflorens-cultorum": "waxbegonia",
  "begonia semperflorens": "waxbegonia",
  "jasminum polyanthum": "pinkjasmine",
  "pelargonium hortorum": "zonalgeranium",
  "pelargonium hybridum": "zonalgeranium",
  "helianthus annuus": "sunflower",
  "zinnia elegans": "zinnia",
  "tagetes": "marigold",
  "tagetes erecta": "marigold",
  "tagetes patula": "marigold",
  "tagetes tenuifolia": "marigold",
  "petunia hybrida": "petunia",
  "petunia atkinsiana": "petunia",
  "viola wittrockiana": "pansy",
  "antirrhinum majus": "snapdragon",
  "fuchsia hybrida": "fuchsia",
  "hydrangea macrophylla": "bigleafhydrangea"
}));

// Only these guides explicitly cover the genus broadly.
const genusCare = new Map(Object.entries({
  spathiphyllum: "peace", phalaenopsis: "orchid", hippeastrum: "amaryllis",
  rosa: "rose", lavandula: "lavender", dahlia: "dahlia", narcissus: "daffodil"
}));

function taxonKey(scientific) {
  if (typeof scientific !== "string") return "";
  const name = scientific.trim().toLowerCase().replace(/\s+/g, " ");
  // Reject uncertain names and hybrid formulas. A named hybrid such as
  // "Viola × wittrockiana" is unambiguous and uses its named epithet.
  if (!name || /(?:\?|\/|\b(?:aff|cf)\.|\bor\b)/.test(name)) return "";
  const words = name.replace(/×/g, " x ").trim().split(/\s+/);
  if (words.includes("x", 2) || words[0] === "x") return "";
  const genus = words[0], epithet = words[1] === "x" ? words[2] : words[1];
  if (!/^[a-z]+$/.test(genus)) return "";
  if (!epithet || /^(?:sp|spp)\.?$/.test(epithet)) return genus;
  if (!/^[a-z][a-z-]*$/.test(epithet)) return "";
  return genus + " " + epithet;
}

export function careKey(scientific) {
  const taxon = taxonKey(scientific);
  return speciesCare.get(taxon) || genusCare.get(taxon.split(" ")[0]) || "other";
}

const goldenSedum = {
  name: "Golden sedum", scientific: "Sedum adolphi", color: "#cdb376", days: 6,
  about: "Golden sedum has glossy, fleshy leaves that take on gold or copper tones in brighter light. Labels may spell its name Sedum adolphii or use the synonym Sedum nussbaumerianum.",
  test: "Has the mix dried through to the root zone, and does the pot feel light?",
  water: "Wet the mix thoroughly once dry, let it drain, and empty the saucer. Use a gritty succulent mix in a pot with a drainage hole.",
  light: "Give it a sunny windowsill. Move a tender outdoor pot inside before frost.",
  source: "https://mountaincrestgardens.com/sedum-adolphii-golden-sedum/"
};

const blueJellyBean = {
  name: "Blue jelly bean succulent", scientific: "Sedum pachyphyllum", color: "#96ae9a", days: 6,
  about: "The short, plump leaves are blue-green and finger-shaped. The tips can blush pink in bright light. Other stonecrops also carry the name jelly bean.",
  test: "Has the mix dried through before the next deep watering?",
  water: "Water the dry mix through to the drainage holes. Empty the saucer and allow the root zone to dry again.",
  light: "Give the plant bright sunlight or a sunny window. Protect container plants from freezing temperatures.",
  source: "https://mountaincrestgardens.com/sedum-pachyphyllum-blue-jelly-bean/"
};

// Kew accepts S. adolphi and places S. nussbaumerianum in synonymy.
// S. × rubrotinctum is a different taxon also sold as “jelly bean”.
const sedumCare = new Map([
  ["sedum adolphi", goldenSedum],
  ["sedum adolphii", goldenSedum],
  ["sedum nussbaumerianum", goldenSedum],
  ["sedum pachyphyllum", blueJellyBean]
]);

export function extraCare(scientific) {
  return sedumCare.get(taxonKey(scientific)) || null;
}
