import {guides, day, nextCheck, latestWater} from "./guides.js";
import {plants, change} from "./storage.js";
import {heartBar, healthFields, observation} from "./health.js";

const $ = sel => document.querySelector(sel);
const main = $("#main"), dialog = $("#dialog"), body = $("#dialog-body"), notice = $("#toast");
const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[ch]);
const id = () => crypto.randomUUID();
const date = at => new Date(at).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"});
const time = at => new Date(at).toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"});
const localMinute = at => new Date(at-new Date(at).getTimezoneOffset()*60000).toISOString().slice(0,16);
const dayStart = at => new Date(at).setHours(0,0,0,0);
const dueToday = p => dayStart(nextCheck(p)) <= dayStart(Date.now());
const relative = at => Date.now() - at < 60000 ? "just now" : dayStart(at) === dayStart(Date.now()) ? "today at " + time(at) : date(at);
const button = (action,label,attrs="",cls="") => `<button type="button" class="${cls}" data-action="${action}" ${attrs}>${label}</button>`;
const plantAttr = p => `data-pot="${esc(p.id)}"`;
const view = () => ["guides","activity"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "plants";
let pots = [], openPot = null, photo = "", photoJob = 0, timer;
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
  if (p.events[0]?.type === "ready") return "Ready to water · confirmed by you";
  return dueToday(p) ? "Potting mix check due" : "Next check · " + date(nextCheck(p));
}
function card(p) {
  const water = latestWater(p), attr = plantAttr(p);
  return `<article class="card pot-card"><div class="plant-top"><div><h3>${esc(p.name)}</h3><p class="sub">${esc(guides[p.species].name)} · ${esc(p.location)}</p></div></div>
  ${icon(p)}<div class="card-health">${heartBar(p.health)}${button("check-health","Check",attr+` aria-label="Check visible health for ${esc(p.name)}"`,"check-shortcut")}</div>
  <p class="status"><strong>${esc(status(p))}</strong></p><p class="sub">${water ? "Last watered " + relative(water.at) + (water.ml != null ? " · " + water.ml + " mL" : "") : "No watering logged yet"}</p>
  <div class="actions">${button("water","Watered",attr,"primary")}${button("detail","View pot",attr)}</div></article>`;
}
function guideText(g) {
  const source = g.source?.includes("umn.edu") ? "University of Minnesota Extension" : "NC State Extension";
  return `${g.about ? `<p class="plant-fact">${esc(g.about)}</p>` : ""}<p class="guideline"><strong>When to water</strong><br>${esc(g.test)}</p><p class="guideline"><strong>How to water</strong><br>${esc(g.water)}</p><p class="light"><strong>Light</strong><br>${esc(g.light)}</p>${g.source ? `<a class="quiet" href="${esc(g.source)}" target="_blank" rel="noopener">${source} plant guide</a>` : ""}`;
}
function profile(key, tentative=false) {
  const g=guides[key];
  if(!g)return "";
  if(!g.source)return `<p class="callout">Species unconfirmed. You can keep a photo and journal while you identify this plant.</p>`;
  return `<section class="plant-profile" style="--accent:${g.color}"><p class="over">${tentative ? "Possible photo match" : "Plant profile"}</p><h3>${esc(g.name)}</h3><p class="sub"><i>${esc(g.scientific)}</i></p>${guideText(g)}</section>`;
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
  const type = {water:"Watered",damp:"Checked · still damp",ready:"Checked · ready to water"}[e.type];
  return `<div class="event"><div><strong>${esc(editable ? type : p.name)}</strong><small>${editable ? "" : esc(type)+" · "}${date(e.at)} at ${time(e.at)}${e.ml != null ? " · "+e.ml+" mL" : ""}</small></div>
  ${e.type === "water" ? button("event","Edit",plantAttr(p)+` data-event="${esc(e.id)}" aria-label="Edit watering entry"`,"textbtn") : ""}</div>`;
}

function render() {
  const page=view();
  document.title = "Petal Journal · "+({plants:"My plants",guides:"Care guides",activity:"Activity"}[page]);
  for (const link of document.querySelectorAll("nav a")) {
    if (link.hash === "#"+page) link.setAttribute("aria-current","page"); else link.removeAttribute("aria-current");
  }
  if (page === "plants") {
    const due = pots.filter(dueToday).length;
    main.innerHTML = `<section class="hero"><div class="hero-copy"><p class="over">${esc(new Date().toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"}))}</p><h1>My plant journal</h1><p>${pots.length ? (due ? `${due} ${due===1?"pot is":"pots are"} due for a moisture check today.` : "Your pots are up to date. See each plant’s next check below.") : "Photograph a flower, learn its care, and keep track of every watering."}</p>${button("add","＋ Add a plant","","primary")}</div><div class="hero-photo"><img src="./hero.jpg" alt="Magenta moth orchid with a white and gold center"></div></section>
    <div class="sectionhead"><h2>My collection</h2><span class="badge">${pots.length} ${pots.length===1?"plant":"plants"}</span></div>
    ${pots.length ? `<section class="grid">${[...pots].sort((a,b)=>nextCheck(a)-nextCheck(b)).map(card).join("")}</section>` : `<div class="empty"><div class="icon" aria-hidden="true">✿</div><div><h3>Add your first pot</h3><p class="muted">Each pot gets its own care guide and watering history.</p></div></div>`}`;
  } else if (page === "guides") {
    main.innerHTML=`<h1 class="page-title">Care guides</h1><p class="section-intro">Light and watering guidance for indoor plants.</p><section class="grid">${Object.entries(guides).filter(([key])=>key!=="other").map(([,g])=>`<article class="card guide-card" style="--blush:${g.color}"><h3>${esc(g.name)}</h3><p class="quiet"><i>${esc(g.scientific)}</i></p>${guideText(g)}</article>`).join("")}</section>`;
  } else {
    const entries=pots.flatMap(p=>p.events.map(e=>({p,e}))).sort((a,b)=>b.e.at-a.e.at);
    main.innerHTML=`<h1 class="page-title">Activity</h1><p class="section-intro">Watering and moisture checks across your pots.</p><section class="panel">${entries.length ? entries.map(({p,e})=>activityRow(p,e)).join("") : "<h3>No entries yet</h3><p>Tap Watered on a pot to start its history.</p>"}</section>`;
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
function showAdd() {
  openPot=null; photo=""; photoJob++;
  modal("Add a plant",`<form id="add-form"><p>Photograph one plant in good light. Include its leaves and any flowers.</p>${photoControls()}
  <div id="photo-preview"></div><div id="check-preview">${heartBar(null)}</div><details class="check-fold"><summary>Rate visible health (optional)</summary>${healthFields()}</details>
  <div id="matches" class="sub" aria-live="polite">A photo can suggest a match. You can also choose the plant below.</div>
  <label class="field">Confirm plant type<select id="species" required><option value="">Choose a plant</option>${Object.entries(guides).map(([key,g])=>'<option value="'+key+'">'+esc(g.name)+'</option>').join("")}</select></label>
  <div id="add-profile"></div>
  <label class="field">Pot name <span class="quiet">(optional)</span><input id="nickname" maxlength="70" placeholder="e.g. Kitchen orchid"></label>
  <label class="field">Growing location<select id="place"><option>Indoors</option><option>Outdoors in a pot</option></select></label>
  <div class="sheet-actions"><button class="primary" type="submit">Save plant</button></div></form>`);
}

async function resize(file) {
  const url=URL.createObjectURL(file);
  try {
    const image=new Image(); image.src=url; await image.decode();
    const scale=Math.min(1,720/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas=document.createElement("canvas"); canvas.width=Math.max(1,Math.round(image.naturalWidth*scale)); canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    const ctx=canvas.getContext("2d");ctx.fillStyle="white";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
    return canvas.toDataURL("image/jpeg",.82);
  } finally {URL.revokeObjectURL(url);}
}
body.addEventListener("input",e=>{
  if(["inspected","healthy"].includes(e.target.id))$("#check-preview").innerHTML=heartBar(sampleFromInputs());
});
function selectSpecies(key) {
  $("#species").value=key;
  $("#add-profile").innerHTML=profile(key);
  if(key)$("#matches").textContent="Selected "+guides[key].name+".";
}
body.addEventListener("change",async e=>{
  if(e.target.id==="species"){ selectSpecies(e.target.value); return; }
  if(!["file","camera"].includes(e.target.id) || !e.target.files.length) return;
  const job=++photoJob, file=e.target.files[0], matches=$("#matches"), preview=$("#photo-preview"), submit=e.target.form.querySelector('[type="submit"]');
  const adding=!!$("#add-form");
  e.target.value="";
  if(adding){selectSpecies("");photo="";preview.replaceChildren();}
  $("#inspected").value="";$("#healthy").value="";$("#check-preview").innerHTML=heartBar(null);
  submit.disabled=true;matches.textContent="Preparing photo…";
  let scaled;
  try { scaled=await resize(file); }
  catch { if(job===photoJob){submit.disabled=false;matches.textContent="Couldn’t read this photo. Try a JPEG.";}return; }
  if(job!==photoJob)return;
  photo=scaled; preview.innerHTML=`<img class="preview" src="${scaled}" alt="Your plant">`; submit.disabled=false;
  if(!adding){ submit.form.dataset.photoChanged="yes"; matches.textContent="Photo ready for this check."; return; }
  matches.textContent="Checking the photo on this device. You can choose a plant below at any time.";
  try {
    const {identify}=await import("./identify.js");const names=await identify(scaled);
    if(job!==photoJob || $("#species").value)return;
    if(names.length)$("#add-profile").innerHTML=profile(names[0],true);
    matches.innerHTML=names.length ? `<p>Possible matches · tap one to confirm</p><div class="suggestions">${names.filter(k=>guides[k]).map(k=>button("match",esc(guides[k].name),`data-species="${k}"`)).join("")}</div>` : "No clear photo match. Choose a plant or select Other.";
  } catch {if(job===photoJob && !$("#species").value)matches.textContent="Photo ready. Identification is unavailable. Choose the plant below.";}
});
function checkPlant(p) {
  openPot=p.id;photo=p.photo||"";photoJob++;
  modal("Check visible health",`<form id="health-form" data-pot="${p.id}"><p><strong>${esc(p.name)}</strong> · ${esc(guides[p.species].name)}</p><div id="photo-preview">${icon(p)}</div><div id="check-preview">${heartBar(null)}</div>${healthFields()}<details class="check-fold"><summary>Update plant photo</summary>${photoControls()}</details><p id="matches" class="sub" aria-live="polite"></p><div class="sheet-actions"><button type="submit" class="primary">Save health check</button>${button("detail","Back to pot",plantAttr(p))}</div></form>`);
}
function detail(p) {
  openPot=p.id;const g=guides[p.species],attr=plantAttr(p);
  const recent=p.events.filter(e=>e.type==="water" && Date.now()-e.at<=30*day);
  const measured=recent.filter(e=>e.ml!=null), unknown=recent.length-measured.length;
  const total=measured.reduce((sum,e)=>sum+e.ml,0);
  const summary=[measured.length ? total.toLocaleString(undefined,{maximumFractionDigits:2})+" mL recorded" : "",unknown ? unknown+" watering"+(unknown===1?"":"s")+" without an amount" : ""].filter(Boolean).join(" · ");
  modal(p.name,`<p class="sub">${esc(g.name)} · ${esc(p.location)} ${button("edit-pot","Edit pot",attr,"textbtn")}</p>${icon(p)}${heartBar(p.health)}${button("check-health",p.health?"Update health check":"Check visible health",attr)}<div class="callout"><strong>${esc(status(p))}</strong><p>${esc(g.test)}</p><div class="actions">${button("ready","Yes, ready",attr)}${button("damp","Still damp",attr)}</div></div>
  <div class="actions">${button("water","Watered",attr,"primary")}${button("calendar","Calendar reminder",attr)}</div>
  <h3>Care guide</h3>${guideText(g)}<h3>Pot history</h3>${summary ? '<p class="quiet">Past 30 days · '+esc(summary)+'</p>' : ""}${p.events.length?p.events.map(e=>activityRow(p,e,true)).join(""):"<p class='sub'>No entries yet.</p>"}`);
}
function editPot(p) {
  modal("Edit pot",`<form id="edit-pot-form" data-pot="${p.id}"><label class="field">Pot name<input id="rename" maxlength="70" required value="${esc(p.name)}"></label><label class="field">Plant type<select id="reclassify">${Object.entries(guides).map(([key,g])=>`<option value="${key}" ${key===p.species?"selected":""}>${esc(g.name)}</option>`).join("")}</select></label><label class="field">Growing location<select id="relocate">${["Indoors","Outdoors in a pot"].map(place=>`<option ${place===p.location?"selected":""}>${place}</option>`).join("")}</select></label><button class="primary">Save changes</button></form>`);
}
function editEvent(p,e) {
  modal("Watering entry",`<p>${esc(p.name)}</p><form id="amount-form" data-pot="${p.id}" data-event="${e.id}"><label class="field">Watered on<input required type="datetime-local" id="water-time" max="${localMinute(Date.now())}" value="${localMinute(e.at)}"></label><label class="field">Amount in mL (optional)<input type="number" min="0.01" max="1000000" step="0.01" id="amount" value="${e.ml??""}" placeholder="e.g. 250"></label><div class="actions"><button class="primary">Save entry</button>${button("undo","Undo this watering",plantAttr(p)+` data-event="${e.id}"`,"textbtn")}</div></form>`);
}
function calendar(p) {
  const target=new Date(nextCheck(p)); if(dayStart(target)<dayStart(Date.now()))target.setTime(Date.now());
  target.setHours(10,0,0,0); if(target.getTime()<Date.now())target.setTime(Date.now()+3600000);
  const stamp=d=>d.toISOString().replace(/[-:]/g,"").replace(/\.\d{3}/,"");
  const escapeICS=s=>s.replace(/\\/g,"\\\\").replace(/[,;]/g,m=>"\\"+m).replace(/\r?\n/g,"\\n");
  const content=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Petal Journal//EN","BEGIN:VEVENT","UID:"+p.id+"-"+dayStart(target)+"@petal-journal","DTSTAMP:"+stamp(new Date()),"DTSTART:"+stamp(target),"DURATION:PT10M","SUMMARY:"+escapeICS("Check "+p.name),"DESCRIPTION:"+escapeICS(guides[p.species].test),"BEGIN:VALARM","TRIGGER:-PT5M","ACTION:DISPLAY","DESCRIPTION:Check your plant","END:VALARM","END:VEVENT","END:VCALENDAR",""].join("\r\n");
  const url=URL.createObjectURL(new Blob([content],{type:"text/calendar;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download="plant-check.ics";a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function current(p) {return pots.find(x=>x.id===p);}
function closeOrDetail() {const p=current(openPot);if(p)detail(p);else dialog.close();}
document.addEventListener("click",async ev=>{
  const b=ev.target.closest("[data-action]");if(!b||b.disabled)return;
  const a=b.dataset.action,p=current(b.dataset.pot);
  if(a==="close"){dialog.close();return;}
  if(a==="add"){showAdd();return;}
  if(a==="rate-five"){
    $("#inspected").value="5";$("#healthy").value=b.dataset.count;
    $("#check-preview").innerHTML=heartBar(sampleFromInputs());
    return;
  }
  if(a==="match"){selectSpecies(b.dataset.species);return;}
  if(!p)return;
  if(a==="detail"){photoJob++;detail(p);return;}
  if(a==="check-health"){checkPlant(p);return;}
  if(a==="edit-pot"){editPot(p);return;}
  if(a==="calendar"){calendar(p);return;}
  if(a==="event"){const e=p.events.find(x=>x.id===b.dataset.event);if(e)editEvent(p,e);return;}
  b.disabled=true;
  try {
    if(a==="undo"){
      await commit(p.id,x=>({...x,events:x.events.filter(e=>e.id!==b.dataset.event)}));
      if(dialog.open)closeOrDetail(); flash("Watering entry removed.");return;
    }
    if(!["water","ready","damp"].includes(a))return;
    const entry={id:id(),type:a,at:Date.now(),ml:null};let added=false;
    await commit(p.id,x=>{
      if(x.events[0]?.type===a && Math.abs(entry.at-x.events[0].at)<2500)return;
      added=true;return {...x,events:[entry,...x.events].sort((l,r)=>r.at-l.at)};
    });
    if(dialog.open)detail(current(p.id));
    if(!added)return;
    if(a==="water"){
      const attrs=plantAttr(p)+` data-event="${entry.id}"`;
      if(dialog.open)body.insertAdjacentHTML("afterbegin",`<div class="callout" role="status">Watering logged. ${button("event","Add amount",attrs,"textbtn")}${button("undo","Undo",attrs,"textbtn")}</div>`);
      else flash("Watering logged.",button("event","Add amount",attrs)+button("undo","Undo",attrs));
    } else {
      const msg=a==="damp"?"Still damp. Wait and check again tomorrow.":guides[p.species].water;
      body.insertAdjacentHTML("afterbegin",`<div class="callout" role="status">${esc(msg)}</div>`);
    }
  } catch(err){fail(err);}finally{b.disabled=false;}
});
body.addEventListener("submit",async ev=>{
  ev.preventDefault();const form=ev.target,b=form.querySelector('button[type="submit"]')||form.querySelector('button:not([type="button"])');if(!b||b.disabled)return;b.disabled=true;
  try{
    if(form.id==="add-form"){
      const species=$("#species").value;if(!guides[species])return;
      const health=readCheck();if(health===false)return;
      const p={id:id(),name:$("#nickname").value.trim()||guides[species].name,species,location:$("#place").value,photo,health,created:Date.now(),events:[]};
      await commit(p.id,()=>p);dialog.close();location.hash="plants";flash(p.name+" added.");
    } else if(form.id==="health-form"){
      const health=readCheck(true);if(!health)return;
      const updatedPhoto=photo;
      await commit(form.dataset.pot,p=>({...p,health,...(form.dataset.photoChanged ? {photo:updatedPhoto} : {})}));
      closeOrDetail();flash("Health check saved.");
    } else if(form.id==="edit-pot-form"){
      const name=$("#rename").value.trim(),species=$("#reclassify").value,location=$("#relocate").value;
      await commit(form.dataset.pot,p=>({...p,name:name||guides[species].name,species,location}));
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

