// Older journals stored the latest photo and health check directly on the pot.
// Keep those observations when the first new timeline entry is written.
export function milestones(p) {
  if (Array.isArray(p.milestones)) return p.milestones;
  const entries = [{at:p.created, title:"Tracking started"}];
  if (p.photo) entries.push({at:null, title:"Earlier photo on file", photo:p.photo});
  if (p.health) entries.push({at:p.health.at, title:"Visible health check", health:p.health});
  return entries;
}

export function timeline(p) {
  return [...milestones(p), ...p.events].sort((a,b)=>(b.at ?? 0)-(a.at ?? 0));
}
