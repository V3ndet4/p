import {mountPreview,examplePreview,savedMembers,potLabel,potGuidance,memberGuide,memberTaxon} from "./pot-matches.js?v=4";
import {guides, catalog, day, observedDryingDays, nextCheck, latestWater} from "./guides.js?v=4";
import {plants, change} from "./storage.js";
import {heartBar, healthFields, observation} from "./health.js";
import {milestones, timeline} from "./history.js";

const $ = sel => document.querySelector(sel);
const main = $("#main"), dialog = $("#dialog"), body = $("#dialog-body"), notice = $("#toast");
const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[ch]);
const id = () => crypto.randomUUID();
const date = at => new Date(at).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"});
const time = at => new Date(at).toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"});
const localMinute = at => new Date(at-new Date(at).getTimezoneOffset()*60000).toISOString().slice(0,16);
const dayStart = at => new Date(at).setHours(0,0,0,0);
const dueToday = p => !p.ended && dayStart(nextCheck(p)) <= dayStart(Date.now());
const relative = at => Date.now() - at < 60000 ? "just now" : dayStart(at) === dayStart(Date.now()) ? "today at " + time(at) : date(at);
const button = (action,label,attrs="",cls="") => `<button type="button" class="${cls}" data-action="${action}" ${attrs}>${label}</button>`;
const plantAttr = p => `data-pot="${esc(p.id)}"`;
const view = () => ["plants","scanner","intelligence","plant-lab","water-lab","guides","activity"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "overview";
let pots = [], openPot = null, photo = "", photoJob = 0, timer;
let guideQuery="", waterLabPlant="";
const broadcast = typeof BroadcastChannel === "function" ? new BroadcastChannel("petal-journal-change") : null;

function flash(message, action="") {
  clearTimeout(timer);
  notice.innerHTML = esc(message) + action;
  timer = setTimeout(() => { notice.replaceChildren(); },action ? 12000 : 5000);
}
function modal(title,html) {
  body.innerHTML = `<div class="dialoghead"><h2 id="dtitle">${esc(title)}</h2>${button("close","×",'aria-label="Close"',"close")}</div>` + html;
  dialog.setAttribute("aria-labelledby","dtitle");
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop=0;
}
dialog.addEventListener("close", () => {
  if(dialog.open)return;
  photoJob++; openPot=null; photo=""; body.replaceChildren();
});
function icon(p) {
  return p.photo ? `<img class="pot-portrait" src="${esc(p.photo)}" alt="Photo of ${esc(p.name)}">` : "";
}
function status(p) {
  if(p.ended)return "Tracking ended · "+date(p.ended);
  const last=p.events[0];
  const current=last && dayStart(last.at)===dayStart(Date.now());
  if(current && last.type==="ready")return "Ready for water · mix checked today";
  if(current && last.type==="damp")return "Wait to water · mix still damp";
  if(current && last.type==="water")return "Watered today";
  return dueToday(p) ? "Check the mix before watering" : "Next moisture check · "+date(nextCheck(p));
}
function card(p) {
  const water = latestWater(p), attr = plantAttr(p);
  const portrait = p.photo ? icon(p) : `<span class="garden-initial" aria-hidden="true">${esc(Array.from(p.name.trim())[0] || "✿")}</span>`;
  return `<article class="pot-card garden-card">
    <button type="button" class="garden-cover" data-action="detail" ${attr} aria-label="View pot: ${esc(p.name)}">${portrait}</button>
    <div class="garden-copy"><h3>${esc(p.name)}</h3><p class="garden-status">${esc(status(p))}</p>
    <details><summary>Care details</summary><p class="sub">${esc(potLabel(p))} · ${esc(p.location)}</p>
    ${heartBar(p.health)}<p class="sub">${water ? "Last watered "+relative(water.at)+(water.ml!=null?" · "+water.ml+" mL":"") : "No watering logged yet"}</p>
    <div class="actions">${p.ended?"":button("check-health","Check health",attr)+button("water","Watered",attr)}${button("detail","View pot",attr)}</div></details></div></article>`;
}
function overviewTask(p) {
  const attr = plantAttr(p), last = p.events[0], guide = potGuidance(p);
  const ready = last?.type === "ready" && dayStart(last.at) === dayStart(Date.now());
  const actions = ready ? button("water","Log watering",attr,"primary")
    : button("damp","Still damp",attr) + button("ready","Ready for water",attr);
  return `<article class="card"><h2>${esc(p.name)}</h2><strong>${esc(status(p))}</strong><p>${esc(ready ? guide.water : guide.test)}</p><div class="actions">${actions}</div></article>`;
}
function guideText(g) {
  const host=g.source ? new URL(g.source).hostname : "";
  const source=({
    "plants.ces.ncsu.edu":"NC State Extension",
    "extension.umn.edu":"University of Minnesota Extension",
    "yardandgarden.extension.iastate.edu":"Iowa State University Extension",
    "www.rhs.org.uk":"Royal Horticultural Society"
  })[host] || host;
  return `${g.about ? `<p class="plant-fact">${esc(g.about)}</p>` : ""}<p class="guideline"><strong>When to water</strong><br>${esc(g.test)}</p><p class="guideline"><strong>How to water</strong><br>${esc(g.water)}</p><p class="light"><strong>Light</strong><br>${esc(g.light)}</p>${g.source ? `<a class="quiet" href="${esc(g.source)}" target="_blank" rel="noopener">${source} plant guide</a>` : ""}`;
}
function renderGuideResults() {
  const normalize=s=>s.toLowerCase().normalize("NFD").replace(/\p{M}/gu,"").replace(/[’']/g,"").replace(/×/g,"x");
  const words=normalize(guideQuery.trim()).split(/\s+/).filter(Boolean);
  const matches=catalog.filter(([,g])=>{
    const names=normalize(g.name+" "+g.scientific);
    return words.every(word=>names.includes(word) ||
      (word.length>3 && word.endsWith("s") && names.includes(word.replace(/ies$/,"y").replace(/s$/,""))));
  });
  $("#guide-count").textContent=words.length ? `${matches.length} of ${catalog.length} guides` : `${catalog.length} guides`;
  $("#guide-results").innerHTML=matches.length ? matches.map(([,g])=>`<article class="card guide-card" style="--blush:${g.color}"><h3>${esc(g.name)}</h3><p class="quiet"><i>${esc(g.scientific)}</i></p>${guideText(g)}</article>`).join("") :
    `<p class="panel">No matching guide. Try a common or scientific name.</p>`;
}
main.addEventListener("input",event=>{
  if(event.target.id==="guide-query"){guideQuery=event.target.value;renderGuideResults();}
});
function savedCare(p){
  if(!p.members?.length)return guideText(guides[p.species]);
  return p.members.map(m=>{const g=memberGuide(m),taxon=memberTaxon(m);return `<section class="plant-profile"><h3>${esc(m.name)}</h3><p><i>${esc(taxon?.[1] || m.scientific)}</i></p>${taxon ? `<p>Likely ${esc(taxon[2])} match · <a href="https://www.gbif.org/species/${taxon[3]}" target="_blank" rel="noopener noreferrer">${taxon[2]==="group"?"Parent genus on GBIF":"Taxonomy on GBIF"}</a></p>` : ""}${g?guideText(g):"<p>No dedicated care guide yet. Follow the plant label until a guide is available.</p>"}</section>`;}).join("");
}
function photoControls() {
  return `<div class="photo-controls"><label class="button">Take photo<input id="camera" type="file" accept="image/*" capture="environment"></label><label class="button">Choose photo<input type="file" id="file" accept="image/*"></label></div>`;
}
function sampleFromInputs() {
  return observation($("#inspected").value,$("#healthy").value);
}
function readCheck(required=false) {
  const total=$("#inspected"),healthy=$("#healthy"),sample=sampleFromInputs();
  if(sample)return {...sample,at:Date.now()};
  if(!required && total.value==="" && healthy.value==="")return null;
  const input=total.value==="" || !total.validity.valid ? total : healthy;
  const fold=input.closest("details");if(fold)fold.open=true;
  input.setCustomValidity("Enter 1–100 checked parts and a healthy count from zero to the number checked.");
  input.reportValidity();input.setCustomValidity("");
  return false;
}
function activityRow(p,e,editable=false) {
  if (!e.type) {
    const when=e.at ? date(e.at)+" at "+time(e.at) : "Original date unknown";
    return `<div class="event"><div><strong>${esc(editable ? e.title : p.name)}</strong><small>${editable ? "" : esc(e.title)+" · "}${when}</small>${e.note ? `<p>${esc(e.note)}</p>` : ""}${e.health ? `<small>${e.health.healthy} of ${e.health.total} checked looked healthy</small>` : ""}${editable && e.photo ? `<img loading="lazy" class="history-photo" src="${esc(e.photo)}" alt="${esc(e.title)} for ${esc(p.name)}">` : ""}</div></div>`;
  }
  const type = {water:"Watered",damp:"Checked · still damp",ready:"Checked · ready to water"}[e.type];
  return `<div class="event"><div><strong>${esc(editable ? type : p.name)}</strong><small>${editable ? "" : esc(type)+" · "}${date(e.at)} at ${time(e.at)}${e.ml != null ? " · "+e.ml+" mL" : ""}</small></div>
  ${e.type === "water" ? button("event","Edit",plantAttr(p)+` data-event="${esc(e.id)}" aria-label="Edit watering entry"`,"textbtn") : ""}</div>`;
}

const symptoms = ["Yellowing leaves", "Drooping leaves", "Leaf spots", "Visible pests", "Other symptom"];
function nextHealthCheck(p, symptom) {
  const recent = p.events[0];
  if (symptom==="Yellowing leaves" && recent?.type==="damp" && Date.now()-recent.at < 2*day)
    return "The last soil check found damp mix. Check whether water is sitting in the saucer.";
  if (symptom==="Yellowing leaves" || symptom==="Drooping leaves") {
    if (recent?.type==="water" && Date.now()-recent.at < day)
      return "Watering was logged in the past day. Check whether excess water drained from the pot.";
    return potGuidance(p).test;
  }
  if (symptom==="Visible pests") return "Inspect the undersides of affected leaves for insects or webbing.";
  if (symptom==="Leaf spots") return "Compare an affected leaf with nearby leaves to see whether the spots are spreading.";
  return "Compare the affected part with healthy growth and note where the change begins.";
}
function reportProblem(p) {
  openPot=p.id;
  modal("Plant Lab",`<form id="problem-form" ${plantAttr(p)}><h3>${esc(p.name)}</h3>
    <label class="field">Symptom<select id="problem-symptom" required><option value="">Choose a symptom</option>${symptoms.map(s=>`<option>${s}</option>`).join("")}</select></label>
    <label class="field">Observation (optional)<textarea id="problem-note" maxlength="1200"></textarea></label>
    <label class="field">Photo (optional)<input type="file" accept="image/*" id="problem-photo"></label>
    <p id="problem-check" role="status"></p><button type="submit" class="primary">Save report</button></form>`);
}
body.addEventListener("change",event=>{
  if(event.target.id==="problem-symptom") {
    const p=current(event.target.form.dataset.pot);
    $("#problem-check").textContent=p && event.target.value ? nextHealthCheck(p,event.target.value) : "";
  }
});
const questions = {
  today:"Which plants need attention today?",
  water:"Should I water this plant?",
  symptom:"What should I check next about this symptom?"
};
let question="today", answerPlant="";
function wateringEvidence(p) {
  const check=p.events.find(e=>e.type==="ready" || e.type==="damp"), water=latestWater(p);
  return `<p>${check ? "Soil check · "+(check.type==="ready"?"Ready for water":"Still damp")+" · "+relative(check.at) : "No soil check logged yet."}</p>
    <p>${water ? "Last watered · "+relative(water.at) : "No watering logged yet."}</p>`;
}
function renderIntelligence() {
  const active=pots.filter(p=>!p.ended);
  const choices=Object.entries(questions).map(([key,label])=>button("ask",label,`data-question="${key}" aria-pressed="${key===question}"`,key===question?"primary":"")).join("");
  let answer;
  if (!active.length) answer=`<p>Add a plant to ask about its care.</p>${button("add","Add a plant")}`;
  else if(question==="today") {
    const due=active.filter(dueToday).sort((a,b)=>nextCheck(a)-nextCheck(b));
    answer=due.map(p=>`<article class="panel"><h2>${esc(p.name)}</h2><strong>${esc(status(p))}</strong>${wateringEvidence(p)}${button("water-lab","Open Water Lab",plantAttr(p))}</article>`).join("") || "<p>No soil checks due today.</p>";
  } else {
    const p=active.find(p=>p.id===answerPlant)||active[0];
    answerPlant=p.id;
    const options=active.map(item=>`<option value="${esc(item.id)}"${item.id===p.id?" selected":""}>${esc(item.name)}</option>`).join("");
    answer=`<label class="field">Plant<select id="answer-plant">${options}</select></label>`;
    if(question==="water") answer+=`<section class="panel"><h2>${esc(status(p))}</h2>${wateringEvidence(p)}${button("water-lab","Check soil",plantAttr(p))}</section>`;
    else {
      const report=timeline(p).find(e=>e.title?.startsWith("Plant problem · "));
      answer+=report ? `<section class="panel"><h2>Latest Plant Lab report</h2>${activityRow(p,report,true)}</section>` : `<p>No Plant Lab report for this plant yet.</p>${button("problem","Report a problem",plantAttr(p))}`;
    }
  }
  main.innerHTML=`<h1 class="page-title">Intelligence</h1><div class="actions">${choices}</div>${answer}`;
}
function renderWaterLab() {
  const active = pots.filter(p=>!p.ended);
  const plant = active.find(p=>p.id===waterLabPlant) || active[0];
  if (!plant) {
    main.innerHTML = `<h1 class="page-title">Water Lab</h1><p>Add a plant to start checking its soil.</p>${button("add","Add a plant","","primary")}`;
    return;
  }
  waterLabPlant = plant.id;
  const water = latestWater(plant);
  const check = plant.events.find(e=>e.type==="ready" || e.type==="damp");
  const options = active.map(p=>`<option value="${esc(p.id)}"${p.id===plant.id?" selected":""}>${esc(p.name)}</option>`).join("");
  main.innerHTML = `<h1 class="page-title">Water Lab</h1><label class="field">Plant<select id="lab-plant">${options}</select></label>
    ${overviewTask(plant)}<section class="panel"><h2>Recent care</h2>
    <p>Last watered · ${water ? relative(water.at) : "No watering logged yet"}</p>
    <p>Latest soil check · ${check ? (check.type==="ready"?"Ready for water":"Still damp")+" · "+relative(check.at) : "No soil check logged yet"}</p></section>`;
}
main.addEventListener("change",event=>{
  if(event.target.id==="answer-plant"){answerPlant=event.target.value;renderIntelligence();}
  if(event.target.id==="lab-plant"){waterLabPlant=event.target.value;renderWaterLab();}
});
function render() {
  const page=view();
  document.title = "Petal Journal · "+({overview:"Overview",plants:"My Garden",scanner:"Plant Scanner","water-lab":"Water Lab","plant-lab":"Plant Lab",intelligence:"Intelligence",guides:"Care guides",activity:"Activity"}[page]);
  for (const link of document.querySelectorAll("nav a, .journal-links a")) {
    if (link.hash === "#"+page) link.setAttribute("aria-current","page"); else link.removeAttribute("aria-current");
  }
  if (page === "overview") {
    const tasks = pots.filter(dueToday).sort((a,b)=>nextCheck(a)-nextCheck(b));
    main.innerHTML = `<h1 class="page-title">Overview</h1><div class="sectionhead"><h2>Today’s care</h2>${button("scan","Scan a plant","","primary")}</div>
      ${tasks.length ? `<section class="grid">${tasks.map(overviewTask).join("")}</section>` : `<p class="empty">${pots.length ? "No care tasks due today." : "Add your first plant to see its care tasks here."}</p>`}`;
  } else if (page === "scanner") {
    main.innerHTML=`<section class="scanner-panel"><div><h1>Plant Scanner</h1><p>Photograph one plant in even light. Include its leaves and any flowers.</p>
      <div class="actions">${button("scan-camera","Take photo","","primary")}${button("scan-file","Choose photo")}</div></div>
      <img src="./botanical-hero.jpg" alt="White orchid flowers and green leaves"></section>`;
  } else if (page === "intelligence") {
    renderIntelligence();
  } else if (page === "plant-lab") {
    const active=pots.filter(p=>!p.ended);
    main.innerHTML=`<h1 class="page-title">Plant Lab</h1>${active.length ? active.map(p=>`<section class="panel"><h2>${esc(p.name)}</h2>${button("problem","Report a problem",plantAttr(p))}</section>`).join("") : `<p>Add a plant to report a problem.</p>${button("add","Add a plant","","primary")}`}`;
  } else if (page === "water-lab") {
    renderWaterLab();
  } else if (page === "plants") {
    const due = pots.filter(dueToday).length;
    main.innerHTML = `<div class="garden-heading"><div><h1>My Garden</h1><p>${pots.length} ${pots.length===1?"plant":"plants"}${due ? " · "+due+" due for a soil check" : ""}</p></div>${button("add","Add a plant","","primary")}</div>
    ${pots.length ? `<section class="garden-grid" aria-label="Plant collection">${[...pots].sort((a,b)=>nextCheck(a)-nextCheck(b)).map(card).join("")}</section>` : `<div class="empty"><div class="icon" aria-hidden="true">✿</div><div><h3>Add your first pot</h3><p class="muted">Each pot gets its own care guide and watering history.</p></div></div>`}`;
  } else if (page === "guides") {
    main.innerHTML=`<h1 class="page-title">Care guides</h1><p class="section-intro">Light and watering guidance for houseplants and garden flowers.</p><div class="guide-tools"><label for="guide-query">Find a plant<input id="guide-query" type="search" placeholder="Common or scientific name" value="${esc(guideQuery)}" aria-controls="guide-results"></label><span id="guide-count" class="quiet" role="status"></span></div><section id="guide-results" class="grid"></section>`;
    renderGuideResults();
  } else {
    const entries=pots.flatMap(p=>timeline(p).map(e=>({p,e}))).sort((a,b)=>b.e.at-a.e.at);
    main.innerHTML=`<h1 class="page-title">Activity</h1><p class="section-intro">Recent care and growth across your plants.</p><section class="panel">${entries.length ? entries.slice(0,50).map(({p,e})=>activityRow(p,e)).join("") : "<h3>No entries yet</h3><p>Add a plant to start its timeline.</p>"}</section>`;
  }
}
async function load() { pots=await plants(); render(); }
async function commit(key,fn) { await change(key,fn); await load(); broadcast?.postMessage("updated"); }
window.addEventListener("hashchange",render);
document.addEventListener("visibilitychange",()=>{ if (!document.hidden) load().catch(fail); });
if (broadcast) broadcast.onmessage=()=>load().catch(fail);
function fail(err) {
  console.error(err);
  const msg="The journal couldn’t save or load your data. Check this browser’s storage and try again.";
  if (dialog.open) { let el=$("#form-error"); if(!el){el=document.createElement("p");el.id="form-error";el.className="err";el.setAttribute("role","alert");body.prepend(el);} el.textContent=msg; }
  else flash(msg);
}
function showAdd(scanning=false) {
  openPot=null; photo=""; photoJob++;
  modal(scanning ? "Plant Scanner" : "Add a plant",`<form id="add-form" data-species="other"><p>Photograph one plant in good light. Include its leaves and any flowers for automatic identification.</p>${photoControls()}
  <details class="check-fold" id="example-fold"><summary>Preview a two-plant pot</summary><p>Interactive example with two sedums. No photo has been analyzed for this example.</p><div id="example-content"></div></details><div id="photo-preview"></div><div id="check-preview">${heartBar(null)}</div>
  <div id="matches" class="sub" role="status">Photo identification runs on this device.</div><div id="add-profile"></div>
  <details class="check-fold"><summary>Rate visible health (optional)</summary>${healthFields()}</details>
  <label class="field">Pot name <span class="quiet">(optional)</span><input id="nickname" maxlength="70" placeholder="e.g. Kitchen orchid"></label>
  <label class="field">Growing location<select id="place"><option>Indoors</option><option>Outdoors in a pot</option></select></label>
  <div class="sheet-actions"><button class="primary" type="submit">Save plant</button></div></form>`);
  $("#example-fold").addEventListener("toggle",e=>{if(e.target.open && !$("#example-content").children.length)examplePreview($("#example-content"));});
}

function photoQualityHint(image) {
  // Compare focus at a common scale so camera resolution does not set the threshold.
  const sample=document.createElement("canvas");
  sample.width=sample.height=192;
  const ctx=sample.getContext("2d"), side=Math.min(image.width,image.height);
  ctx.drawImage(image,(image.width-side)/2,(image.height-side)/2,side,side,0,0,192,192);
  const rgba=ctx.getImageData(0,0,192,192).data, gray=new Uint8Array(192*192);
  let dark=0, edgeEnergy=0;
  for(let i=0;i<gray.length;i++){
    gray[i]=.2126*rgba[4*i]+.7152*rgba[4*i+1]+.0722*rgba[4*i+2];
    if(gray[i]<45)dark++;
  }
  if(dark>gray.length*.85)return "This photo looks very dark. Move the plant into brighter, even light.";
  for(let y=1;y<191;y++)for(let x=1;x<191;x++){
    const i=y*192+x;
    const edge=4*gray[i]-gray[i-1]-gray[i+1]-gray[i-192]-gray[i+192];
    edgeEnergy+=edge*edge;
  }
  return edgeEnergy/(190*190)<12 ? "The plant may be out of focus. Hold steady and tap a leaf to focus." : "";
}
async function resize(file, assess) {
  const url=URL.createObjectURL(file);
  try {
    const image=new Image(); image.src=url; await image.decode();
    const scale=Math.min(1,1280/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas=document.createElement("canvas"); canvas.width=Math.max(1,Math.round(image.naturalWidth*scale)); canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    const ctx=canvas.getContext("2d");ctx.fillStyle="white";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
    if(assess)assess(canvas);
    return canvas.toDataURL("image/jpeg",.82);
  } finally {URL.revokeObjectURL(url);}
}
body.addEventListener("input",e=>{
  if(["inspected","healthy"].includes(e.target.id))$("#check-preview").innerHTML=heartBar(sampleFromInputs());
});
async function matchPhoto(form,photoUrl,job) {
  const message=form.querySelector("#matches");
  let keys=[];
  message.textContent="Identifying your plant on this device…";
  try {
    const {identify}=await import("./identify.js?v=3");
    const names=await identify(photoUrl);keys=names;
    if(job!==photoJob || !form.isConnected)return;
    message.textContent=names.length ? "Select the matches you recognize. For a closer identification, add a clear view of a flower or where a leaf meets the stem." : "No clear local match. Try a close-up of a flower or leaf attachment, or use the optional specialist lookup below.";

  } catch {
    if(job===photoJob && form.isConnected)message.textContent="Identification is unavailable. You can save this photo and try again later.";
  }
  if(job===photoJob && form.isConnected)mountPreview(form,photoUrl,keys,resize);
}
function addPlantPicker(form,preview,original) {
  preview.insertAdjacentHTML("beforeend",`<details class="plant-picker"><summary>Choose plant</summary>
    <p>Tap the plant to center the frame, or use the arrow keys. Adjust the frame to include its leaves or flowers.</p>
    <div class="crop-stage" tabindex="0" role="group" aria-label="Plant photo, use arrow keys to move the frame">
      <img src="${original}" alt="Full photo"><span class="crop-frame"></span></div>
    <label class="field">Frame size<input type="range" min="15" max="100" value="65"></label>
    <button type="button" class="primary crop-scan">Scan this area</button></details>`);
  const picker=preview.querySelector(".plant-picker"), stage=picker.querySelector(".crop-stage");
  const image=stage.querySelector("img"), frame=stage.querySelector("span"), size=picker.querySelector("input");
  let cx=.5,cy=.5;
  const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
  function bounds(){
    const w=image.naturalWidth,h=image.naturalHeight,side=Math.min(w,h)*Number(size.value)/100;
    return {x:clamp(cx*w-side/2,0,w-side),y:clamp(cy*h-side/2,0,h-side),side,w,h};
  }
  function draw(){
    if(!image.naturalWidth)return;
    const {x,y,side,w,h}=bounds();
    Object.assign(frame.style,{left:100*x/w+"%",top:100*y/h+"%",width:100*side/w+"%",height:100*side/h+"%"});
  }
  image.onload=draw;picker.ontoggle=draw;size.oninput=draw;
  stage.onclick=e=>{
    const rect=stage.getBoundingClientRect();
    cx=(e.clientX-rect.left)/rect.width;cy=(e.clientY-rect.top)/rect.height;draw();
  };
  stage.onkeydown=e=>{
    const delta={ArrowLeft:[-.05,0],ArrowRight:[.05,0],ArrowUp:[0,-.05],ArrowDown:[0,.05]}[e.key];
    if(delta){e.preventDefault();cx=clamp(cx+delta[0],0,1);cy=clamp(cy+delta[1],0,1);draw();}
  };
  picker.querySelector(".crop-scan").onclick=()=>{
    if(!image.naturalWidth)return;
    const {x,y,side}=bounds(),canvas=document.createElement("canvas");
    canvas.width=canvas.height=Math.max(1,Math.round(side));
    canvas.getContext("2d").drawImage(image,x,y,side,side,0,0,canvas.width,canvas.height);
    photo=canvas.toDataURL("image/jpeg",.9);preview.querySelector(".preview").src=photo;
    const job=++photoJob,submit=form.querySelector('[type="submit"]');
    submit.disabled=true;picker.open=false;delete form.previewState;form.dataset.species="other";
    form.querySelector("#add-profile").replaceChildren();
    matchPhoto(form,photo,job).finally(()=>{if(job===photoJob && form.isConnected)submit.disabled=false;});
  };
}
body.addEventListener("change",async e=>{
  if(!["file","camera"].includes(e.target.id) || !e.target.files.length) return;
  const form=e.target.form,job=++photoJob,file=e.target.files[0],matches=$("#matches"),preview=$("#photo-preview"),submit=form.querySelector('[type="submit"]');
  const adding=form.id==="add-form", plant=current(form.dataset.pot);
  e.target.value="";
  form.dataset.species="other";delete form.dataset.photoChanged;delete form.previewState;
  photo="";preview.replaceChildren();
  if($("#add-profile"))$("#add-profile").replaceChildren();
  if($("#inspected")){$("#inspected").value="";$("#healthy").value="";$("#check-preview").innerHTML=heartBar(null);}
  submit.disabled=true;matches.textContent="Preparing photo…";
  let scaled, hint="";
  try { scaled=await resize(file,adding ? canvas=>{hint=photoQualityHint(canvas);} : undefined); }
  catch { if(job===photoJob){submit.disabled=false;matches.textContent="Couldn’t read this photo. Try a JPEG.";}return; }
  if(job!==photoJob || !form.isConnected)return;
  photo=scaled; preview.innerHTML=`<img class="preview" src="${scaled}" alt="Your plant">`;
  form.dataset.photoChanged="yes";
  if(adding)addPlantPicker(form,preview,scaled);
  if(hint){
    matches.innerHTML=`<p>${esc(hint)}</p>${button("retake","Retake photo")} ${button("use-photo","Use this photo")}`;
    matches.querySelector('[data-action="retake"]').onclick=()=>form.querySelector("#camera").click();
    matches.querySelector('[data-action="use-photo"]').onclick=async ()=>{
      await matchPhoto(form,scaled,job);
      if(job===photoJob && form.isConnected)submit.disabled=false;
    };
    return;
  }
  if(adding || (plant?.species==="other" && !plant?.members?.length) || form.id==="update-form" && form.dataset.reidentify)await matchPhoto(form,scaled,job);
  else matches.textContent="Photo ready for the timeline.";
  if(job===photoJob && form.isConnected)submit.disabled=false;
});
function journalUpdate(p, retry=false) {
  openPot=p.id;photo="";const job=++photoJob;
  modal("Add a journal update",`<form id="update-form" data-pot="${p.id}" data-species="other"><p>${esc(p.name)}</p>${photoControls()}<div id="photo-preview"></div><div id="matches" role="status"></div><div id="add-profile"></div>
  <label class="field">Milestone<select id="milestone"><option>Growth update</option><option>New bloom</option><option>Repotted</option><option>Pruned</option><option>End of life</option></select></label>
  <label class="field">Note <span class="quiet">(optional)</span><textarea id="update-note" rows="3" maxlength="2000" placeholder="What changed since the last check?"></textarea></label>
  <div class="sheet-actions"><button class="primary" type="submit">Save update</button>${button("detail","Back to pot",plantAttr(p))}</div></form>`);
  if(retry && p.photo){
    const form=$("#update-form");form.dataset.reidentify="yes";const save=form.querySelector('[type="submit"]');
    $("#photo-preview").innerHTML=icon(p);save.disabled=true;
    matchPhoto(form,p.photo,job).finally(()=>{if(job===photoJob && form.isConnected)save.disabled=false;});
  }
}
function checkPlant(p) {
  openPot=p.id;photo=p.photo||"";photoJob++;
  modal("Check visible health",`<form id="health-form" data-pot="${p.id}"><p><strong>${esc(p.name)}</strong> · ${esc(potLabel(p))}</p><div id="photo-preview">${icon(p)}</div><div id="check-preview">${heartBar(null)}</div>${healthFields()}<details class="check-fold"><summary>Update plant photo</summary>${photoControls()}</details><p id="matches" class="sub" aria-live="polite"></p><div id="add-profile"></div><div class="sheet-actions"><button type="submit" class="primary">Save health check</button>${button("detail","Back to pot",plantAttr(p))}</div></form>`);
}
function historyPage(p,offset=0) {
  const rows=timeline(p);
  return rows.slice(offset,offset+10).map(e=>activityRow(p,e,true)).join("")+
    (rows.length>offset+10 ? button("more-history","Show earlier entries",plantAttr(p)+` data-offset="${offset+10}"`) : "");
}
function downloadJournal(p) {
  const rows=timeline(p).map(e=>activityRow(p,e,true)).join("");
  const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(p.name)} · Petal Journal</title><style>body{font:16px/1.5 system-ui;max-width:45em;margin:auto;padding:20px;color:#213d30}small{display:block}img{display:block;max-width:100%;max-height:20em;margin-top:8px}.event{padding:12px 0;border-bottom:1px solid #ccc}button{display:none}p{white-space:pre-wrap}</style><h1>${esc(p.name)}</h1><p>${esc(potLabel(p))} · ${esc(p.location)}</p><h2>Care guide</h2>${savedCare(p)}<h2>Plant timeline</h2>${rows}</html>`;
  const url=URL.createObjectURL(new Blob([html],{type:"text/html;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download="petal-journal-"+p.id+".html";a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function twinRecord(p) {
  const dryingDays=observedDryingDays(p);
  const latestGrowth=timeline(p).find(e=>["Growth update","New bloom","Repotted","Pruned"].includes(e.title));
  const pattern=dryingDays!==null ? "About "+dryingDays+" days from watering to a ready check" : "Learning from watering and ready checks";
  const cells=[["Environment",[p.location,p.exposure].filter(Boolean).join(" · ")],["Watering pattern",pattern],["Latest growth",latestGrowth ? latestGrowth.title+" · "+date(latestGrowth.at) : "No growth observation yet"]];
  return `<section class="twin"><div class="twin-heading"><h3>Plant record</h3><small>Since ${date(p.created)}</small></div><dl>${cells.map(([label,value])=>`<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join("")}</dl></section>`;
}
function detail(p) {
  openPot=p.id;const attr=plantAttr(p);
  const recent=p.events.filter(e=>e.type==="water" && Date.now()-e.at<=30*day);
  const measured=recent.filter(e=>e.ml!=null), unknown=recent.length-measured.length;
  const total=measured.reduce((sum,e)=>sum+e.ml,0);
  const summary=[measured.length ? total.toLocaleString(undefined,{maximumFractionDigits:2})+" mL recorded" : "",unknown ? unknown+" watering"+(unknown===1?"":"s")+" without an amount" : ""].filter(Boolean).join(" · ");
  const care=p.ended ? `<div class="callout"><strong>${esc(status(p))}</strong><div>${button("resume","Resume tracking",attr)}</div></div>` :
    `${button("check-health",p.health?"Update health check":"Check visible health",attr)}<div class="callout"><strong>${esc(status(p))}</strong><div class="actions">${button("water-lab","Check soil",attr)}${button("problem","Report a problem",attr)}</div></div>
     <div class="actions">${button("water","Watered",attr,"primary")}${button("calendar","Calendar reminder",attr)}</div>`;
  modal(p.name,`<p class="sub">${esc(potLabel(p))} · ${esc(p.location)} ${button("edit-pot","Edit pot",attr,"textbtn")}</p>${icon(p)}${heartBar(p.health)}${care}${twinRecord(p)}
  <div class="actions">${button("update","Add photo or note",attr)}${p.species==="other" && p.photo ? button("retry-id","Identify this photo",attr) : ""}</div>
  <h3>Care guide</h3>${savedCare(p)}<h3>Plant timeline</h3>${summary ? '<p class="quiet">Past 30 days · '+esc(summary)+'</p>' : ""}<div id="timeline">${historyPage(p)}</div>${button("export","Download timeline",attr,"textbtn")}`);
}
function editPot(p) {
  modal("Edit pot",`<form id="edit-pot-form" data-pot="${p.id}"><label class="field">Pot name<input id="rename" maxlength="70" required value="${esc(p.name)}"></label><label class="field">${p.members?.length ? "Replace pot identification (optional)" : "Plant type"}<select id="reclassify">${[...catalog,["other",guides.other]].map(([key,g])=>`<option value="${key}" ${key===p.species?"selected":""}>${esc(g.name)}</option>`).join("")}</select></label><label class="field">Growing location<select id="relocate">${["Indoors","Outdoors in a pot"].map(place=>`<option ${place===p.location?"selected":""}>${place}</option>`).join("")}</select></label><label class="field">Observed light<select id="exposure">${["","Direct sun","Bright indirect light","Partial shade","Low light"].map(v=>`<option value="${v}" ${v===p.exposure?"selected":""}>${v||"Not recorded"}</option>`).join("")}</select></label><button class="primary">Save changes</button></form>`);
}
function editEvent(p,e) {
  modal("Watering entry",`<p>${esc(p.name)}</p><form id="amount-form" data-pot="${p.id}" data-event="${e.id}"><label class="field">Watered on<input required type="datetime-local" id="water-time" max="${localMinute(Date.now())}" value="${localMinute(e.at)}"></label><label class="field">Amount in mL (optional)<input type="number" min="0.01" max="1000000" step="0.01" id="amount" value="${e.ml??""}" placeholder="e.g. 250"></label><div class="actions"><button class="primary">Save entry</button>${button("undo","Undo this watering",plantAttr(p)+` data-event="${e.id}"`,"textbtn")}</div></form>`);
}
function calendar(p) {
  const target=new Date(nextCheck(p)); if(dayStart(target)<dayStart(Date.now()))target.setTime(Date.now());
  target.setHours(10,0,0,0); if(target.getTime()<Date.now())target.setTime(Date.now()+3600000);
  const stamp=d=>d.toISOString().replace(/[-:]/g,"").replace(/\.\d{3}/,"");
  const escapeICS=s=>s.replace(/\\/g,"\\\\").replace(/[,;]/g,m=>"\\"+m).replace(/\r?\n/g,"\\n");
  const content=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Petal Journal//EN","BEGIN:VEVENT","UID:"+p.id+"-"+dayStart(target)+"@petal-journal","DTSTAMP:"+stamp(new Date()),"DTSTART:"+stamp(target),"DURATION:PT10M","SUMMARY:"+escapeICS("Check "+p.name),"DESCRIPTION:"+escapeICS(potGuidance(p).test),"BEGIN:VALARM","TRIGGER:-PT5M","ACTION:DISPLAY","DESCRIPTION:Check your plant","END:VALARM","END:VEVENT","END:VCALENDAR",""].join("\r\n");
  const url=URL.createObjectURL(new Blob([content],{type:"text/calendar;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download="plant-check.ics";a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function current(p) {return pots.find(x=>x.id===p);}
function closeOrDetail() {const p=current(openPot);if(p)detail(p);else dialog.close();}
function appendUpdate(p,entry,species,members=[]) {
  if(members.length && p.species==="other"){const label=members.map(m=>m.name).join(" + ");entry={...entry,note:[entry.note,label].filter(Boolean).join(" · ")};p={...p,members,name:p.name===guides.other.name?label:p.name};}
  const list=[...milestones(p)];
  const matched=p.species==="other" && species && species!=="other" && guides[species]?.source;
  if(matched){
    list.push({at:entry.at,title:"Identified from photo",note:guides[species].name});
    const defaultName=[guides.other.name,"Other or unknown plant"].includes(p.name);
    p={...p,species,name:defaultName ? guides[species].name : p.name};
  }
  list.push(entry);
  return {...p,milestones:list,...(entry.photo ? {photo:entry.photo} : {}),...(entry.health ? {health:entry.health} : {})};
}
document.addEventListener("click",async ev=>{
  const b=ev.target.closest("[data-action]");if(!b||b.disabled)return;
  const a=b.dataset.action,p=current(b.dataset.pot);
  if(a==="close"){dialog.close();return;}
  if(a==="scan-camera" || a==="scan-file"){showAdd(true);$(a==="scan-camera"?"#camera":"#file").click();return;}
  if(a==="add" || a==="scan"){showAdd(a==="scan");return;}
  if(a==="rate-five"){
    $("#inspected").value="5";$("#healthy").value=b.dataset.count;
    $("#check-preview").innerHTML=heartBar(sampleFromInputs());
    return;
  }
  if(a==="ask"){question=b.dataset.question;renderIntelligence();return;}
  if(!p)return;
  if(a==="water-lab"){waterLabPlant=p.id;dialog.close();location.hash="water-lab";render();return;}
  if(a==="problem"){reportProblem(p);return;}
  if(a==="detail"){photoJob++;detail(p);return;}
  if(a==="check-health"){checkPlant(p);return;}
  if(a==="update" || a==="retry-id"){journalUpdate(p,a==="retry-id");return;}
  if(a==="export"){downloadJournal(p);return;}
  if(a==="more-history"){b.insertAdjacentHTML("beforebegin",historyPage(p,Number(b.dataset.offset)));b.remove();return;}
  if(a==="edit-pot"){editPot(p);return;}
  if(a==="calendar"){calendar(p);return;}
  if(a==="event"){const e=p.events.find(x=>x.id===b.dataset.event);if(e)editEvent(p,e);return;}
  b.disabled=true;
  try {
    if(a==="resume"){
      await commit(p.id,x=>x.ended?{...appendUpdate(x,{at:Date.now(),title:"Tracking resumed"}),ended:null}:x);detail(current(p.id));return;
    }
    if(a==="undo"){
      await commit(p.id,x=>({...x,events:x.events.filter(e=>e.id!==b.dataset.event)}));
      if(dialog.open)closeOrDetail(); flash("Watering entry removed.");return;
    }
    if(!["water","ready","damp"].includes(a) || p.ended)return;
    const entry={id:id(),type:a,at:Date.now(),ml:null};let added=false;
    await commit(p.id,x=>{
      if(x.ended || (x.events[0]?.type===a && Math.abs(entry.at-x.events[0].at)<2500))return;
      added=true;return {...x,events:[entry,...x.events].sort((l,r)=>r.at-l.at)};
    });
    if(dialog.open)detail(current(p.id));
    if(!added)return;
    if(a==="water"){
      const attrs=plantAttr(p)+` data-event="${entry.id}"`;
      if(dialog.open)body.insertAdjacentHTML("afterbegin",`<div class="callout" role="status">Watering logged. ${button("event","Add amount",attrs,"textbtn")}${button("undo","Undo",attrs,"textbtn")}</div>`);
      else flash("Watering logged.",button("event","Add amount",attrs)+button("undo","Undo",attrs));
    } else {
      const msg=a==="damp"?"Still damp. Wait and check again tomorrow.":potGuidance(p).water;
      if(dialog.open)body.insertAdjacentHTML("afterbegin",`<div class="callout" role="status">${esc(msg)}</div>`);
      else flash(msg);
    }
  } catch(err){fail(err);}finally{b.disabled=false;}
});
body.addEventListener("submit",async ev=>{
  ev.preventDefault();const form=ev.target,b=form.querySelector('button[type="submit"]')||form.querySelector('button:not([type="button"])');if(!b||b.disabled)return;b.disabled=true;
  try{
    if(form.id==="problem-form"){
      const symptom=$("#problem-symptom").value, note=$("#problem-note").value.trim(), file=$("#problem-photo").files[0];
      let picture;
      if(file){
        try{picture=await resize(file);}catch{if(form.isConnected)$("#problem-check").textContent="Couldn’t read this photo. Choose another image or remove it.";return;}
      }
      if(!form.isConnected || !dialog.open)return;
      await commit(form.dataset.pot,p=>{
        if(!p || p.ended)throw new Error("Plant tracking has ended");
        const followUp=nextHealthCheck(p,symptom);
        const entry={at:Date.now(),title:"Plant problem · "+symptom,note:[note,"Next check: "+followUp].filter(Boolean).join(" "),...(picture ? {photo:picture} : {})};
        return {...p,milestones:[...milestones(p),entry]};
      });
      if(form.isConnected && dialog.open)detail(current(form.dataset.pot));
      flash("Problem report saved.");
    } else if(form.id==="add-form"){
      const members=savedMembers(form),species=form.dataset.species || "other",nickname=$("#nickname").value.trim();
      if(!photo && !nickname){const field=$("#nickname");field.setCustomValidity("Add a photo or give the plant a name.");field.reportValidity();field.setCustomValidity("");return;}
      const health=readCheck();if(health===false)return;
      const created=Date.now();
      const start={at:created,title:"Tracking started",photo,health,note:members.map(m=>m.name+" ("+m.source+")").join(", ")};
      const p={id:id(),name:nickname||members.map(m=>m.name).join(" + ")||guides[species].name,members,species,location:$("#place").value,photo,health,created,events:[],milestones:[start]};
      await commit(p.id,()=>p);dialog.close();location.hash="overview";flash(p.name+" added.");
    } else if(form.id==="health-form"){
      const health=readCheck(true);if(!health)return;
      const entry={at:health.at,title:"Visible health check",health,...(form.dataset.photoChanged ? {photo} : {})};
      await commit(form.dataset.pot,p=>appendUpdate(p,entry,form.dataset.species,savedMembers(form)));
      closeOrDetail();flash("Health check saved.");
    } else if(form.id==="update-form"){
      const title=$("#milestone").value,note=$("#update-note").value.trim(),species=form.dataset.species;
      const entry={at:Date.now(),title,note,...(form.dataset.photoChanged ? {photo} : {})};
      if(title==="Growth update" && !note && !entry.photo && (!species||species==="other") && !savedMembers(form).length){
        const field=$("#update-note");field.setCustomValidity("Add a note, a new photo, or select a milestone.");field.reportValidity();field.setCustomValidity("");return;
      }
      await commit(form.dataset.pot,p=>{
        const next=appendUpdate(p,entry,species,savedMembers(form));
        if(title==="End of life")next.ended=entry.at;
        return next;
      });
      closeOrDetail();flash("Timeline updated.");
    } else if(form.id==="edit-pot-form"){
      const name=$("#rename").value.trim(),species=$("#reclassify").value,location=$("#relocate").value,exposure=$("#exposure").value;
      await commit(form.dataset.pot,p=>{
        const list=[...milestones(p)];
        if(p.species!==species)list.push({at:Date.now(),title:"Identification corrected",note:guides[species].name});
        if((p.exposure||"")!==exposure)list.push({at:Date.now(),title:"Light exposure changed",note:exposure||"Not recorded"});
        if(p.location!==location)list.push({at:Date.now(),title:"Growing location changed",note:location});
        return {...p,...(p.species!==species?{members:[]}:{}),milestones:list,name:name||guides[species].name,species,location,exposure};
      });
      closeOrDetail();
    } else if(form.id==="amount-form"){
      const raw=$("#amount").value,ml=raw===""?null:Number(raw);
      if(ml!==null&&(!Number.isFinite(ml)||ml<=0||ml>1000000))return;
      const selected=$("#water-time").value;
      await commit(form.dataset.pot,p=>({...p,events:p.events.map(e=>e.id===form.dataset.event?{...e,ml,at:localMinute(e.at)===selected?e.at:new Date(selected).getTime()}:e).sort((a,b)=>b.at-a.at)}));
      closeOrDetail();flash("Watering entry saved.");
    }
  }catch(err){fail(err);}finally{b.disabled=false;}
});
load().catch(err=>{render();fail(err);});

