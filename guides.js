export const guides = {
  peace: {name:"Peace lily", scientific:"Spathiphyllum", color:"#aabd96", days:3,
    test:"Feel the top layer of potting mix. Is it starting to dry while the mix beneath still feels lightly moist?",
    water:"Moisten the potting mix evenly and let excess water drain. Empty the saucer.",
    light:"Keep in indirect light, away from direct sun.", source:"https://plants.ces.ncsu.edu/plants/spathiphyllum/"},
  orchid: {name:"Moth orchid", scientific:"Phalaenopsis", color:"#cfa3bd", days:4,
    test:"Check inside the pot. Has the bark or moss partly dried since the last watering?",
    water:"Run room-temperature water through the growing medium. Keep water out of the crown and let the pot drain.",
    light:"An east-facing window or filtered light works well.", source:"https://plants.ces.ncsu.edu/plants/phalaenopsis/"},
  violet: {name:"African violet", scientific:"Streptocarpus ionanthus", color:"#ad9ec6", days:2,
    test:"Touch the mix near the edge. Is the surface beginning to dry while the root zone still holds a little moisture?",
    water:"Use room-temperature water on the mix, keeping the fuzzy leaves dry. Let excess water drain.",
    light:"Give bright, indirect light and keep leaves clear of hot window glass.", source:"https://extension.umn.edu/garden-and-home/yard-and-garden/gardening-in-minnesota/african-violets"},
  kalanchoe: {name:"Florist’s kalanchoe", scientific:"Kalanchoe blossfeldiana", color:"#e0a382", days:5,
    test:"Feel below the surface or lift the pot. Has the mix dried through and the pot become light?",
    water:"Once the mix has dried, water deeply and let it drain. Empty the saucer.",
    light:"Give this succulent bright light in a well-drained pot.", source:"https://plants.ces.ncsu.edu/plants/kalanchoe-blossfeldiana/"},
  christmas: {name:"Holiday cactus", scientific:"Schlumbergera", color:"#c38e9d", days:4,
    test:"Check the mix beneath the surface. Has it dried since the last watering?",
    water:"Water the mix thoroughly and let the pot drain freely. Check again sooner while the plant is in bloom.",
    light:"Give bright, filtered light and shelter from hot afternoon sun.", source:"https://extension.umn.edu/garden-and-home/yard-and-garden/gardening-in-minnesota/holiday-cacti"},
  poinsettia: {name:"Poinsettia", scientific:"Euphorbia pulcherrima", color:"#ca8f81", days:2,
    test:"Touch the potting mix. Has the surface just begun to feel dry?",
    water:"Slip off the decorative foil, water the mix thoroughly, and let the pot drain before replacing the cover.",
    light:"Place in bright light, away from cold drafts.", source:"https://extension.umn.edu/garden-and-home/yard-and-garden/gardening-in-minnesota/poinsettia"},
  other: {name:"Other or unknown plant", scientific:"", color:"#aabd96", days:3,
    test:"Does the potting mix meet the watering condition on your plant’s care label?",
    water:"Follow the watering directions on the plant’s label. You can keep a watering history while you confirm the species.",
    light:"Check your plant label for its preferred light.", source:null}
};

export const day = 86400000;
export const latestWater = p => p.events.find(e => e.type === "water");
export const ordered = p => [...p.events].sort((a,b) => b.at - a.at);
export function nextCheck(p) {
  const events = ordered(p);
  if (!events.length) return p.created;
  const last = events[0];
  if (last.type === "ready") return last.at;
  if (last.type === "damp") return last.at + day;
  const samples = [];
  let water;
  for (const e of [...events].reverse()) {
    if (e.type === "water") water = e;
    if (e.type === "ready" && water) {
      const interval = (e.at - water.at) / day;
      if (interval >= 1 && interval <= 30) samples.push(interval);
      water = null;
    }
  }
  const recent = samples.slice(-3).sort((a,b) => a-b);
  const days = recent.length >= 2 ? recent[Math.floor(recent.length / 2)] : guides[p.species].days;
  return last.at + Math.round(days) * day;
}
