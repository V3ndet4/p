import {plantNames} from "./model/plant-names.js?v=2";
import {guides} from "./guides.js?v=2";
import {careKey,extraCare} from "./plant-profile.js";
import {renderMatches} from "./match-preview.js?v=2";

export function memberGuide(m){
  return extraCare(m.scientific) || (m.key && guides[m.key]?.source ? guides[m.key] : null);
}
export function potLabel(p){return p.members?.map(m=>m.name).join(" + ")||guides[p.species].name;}
export function potGuidance(p){
  if(!p.members?.length)return guides[p.species];
  if(p.members.length===1)return memberGuide(p.members[0])||guides.other;
  return {...guides.other,test:"Check the mix by each plant. Do all the plants’ guides indicate they are ready for water?",water:"Compare each plant’s needs below before watering this shared pot."};
}
function make(name,scientific,source,key){
  return {name:name||scientific,scientific,source,key:key||careKey(scientific)||"other"};
}
function localMatch(id){
  const [name,scientific]=plantNames[id];
  return {...make(name,scientific,"On device",guides[id]?.source ? id : undefined),taxonId:id,rank:plantNames[id][2]};
}
export function memberTaxon(m){
  if(m.source!=="On device")return null;
  if(Object.hasOwn(plantNames,m.taxonId))return plantNames[m.taxonId];
  // Older records stored the scientific label without the model ID.
  if(m.scientific==="Petunia × hybrida")return plantNames.petunia;
  return Object.values(plantNames).find(([,scientific])=>scientific===m.scientific) || null;
}
function display(rows,selected){return renderMatches(rows.map(m=>({...m,guide:memberGuide(m)})),selected);}
export function savedMembers(form){
  const state=form.previewState;
  return state ? state.rows.filter((m,i)=>state.selected.includes(i)) : [];
}
// Field characters from NC State Extension's Plant Toolbox entries for each pair.
const lookalikes = [
  {ids:["_foxglove","snapdragon"], sources:["digitalis-purpurea","antirrhinum-majus"],
    clue:"Common foxglove has hanging, open bells, often spotted inside. A typical snapdragon flower has two lips that meet at the opening.",
    photo:"Photograph one bloom from the side with its opening visible."},
  {ids:["_daylily","_lily"], sources:["hemerocallis","lilium"],
    clue:"Daylily leaves form fans from the base. True lilies carry leaves along the flowering stem.",
    photo:"Photograph the flowering stem down to the base, including where the leaves attach."}
];
function showComparison(root,ids){
  const panel=root.querySelector(".match-comparison"), label=root.querySelector(".close-label");
  const pair=lookalikes.find(({ids:pairIds})=>pairIds.every(id=>ids.includes(id)));
  label.textContent=pair ? "Add the requested view of this plant" : "Add a close-up";
  panel.innerHTML=pair ? `<div class="callout"><strong>Compare ${plantNames[pair.ids[0]][0]} and ${plantNames[pair.ids[1]][0]}</strong><p>${pair.clue}</p><p>${pair.photo}</p><small>Plant Toolbox · ${pair.sources.map((slug,i)=>`<a href="https://plants.ces.ncsu.edu/plants/${slug}/" target="_blank" rel="noopener noreferrer">${plantNames[pair.ids[i]][0]}</a>`).join(" · ")}</small></div>` : "";
}
export function mountPreview(form,picture,localKeys,resize){
  const root=form.querySelector("#add-profile");
  const rows=localKeys.filter(k=>plantNames[k]).map(localMatch);
  const state={rows,selected:form.id==="add-form" ? [] : rows.length===1?[0]:[]};form.previewState=state;
  root.innerHTML=`<div class="match-results"></div><div class="match-comparison"></div><label class="field"><span class="close-label">Add a close-up</span><input type="file" accept="image/*" class="close-up"></label><div class="close-preview" role="status"></div><details class="check-fold"><summary>Optional specialist lookup</summary><p>Send this photo to Pl@ntNet for additional possible matches. Enter your own Pl@ntNet API key for this lookup. The journal does not store it.</p><label class="field">Pl@ntNet API key<input type="password" class="special-key" autocomplete="off" spellcheck="false"></label><button type="button" class="send-photo">Send photo to Pl@ntNet</button><p class="lookup-status" role="status"></p></details><details class="check-fold"><summary>Add a known plant by scientific name</summary><label class="field">Scientific name<input class="known-name" maxlength="100" placeholder="e.g. Sedum adolphii"></label><button type="button" class="add-known">Add to this pot</button></details>`;
  function draw(){root.querySelector(".match-results").innerHTML=display(state.rows,state.selected);form.dataset.species=savedMembers(form)[0]?.key||"other";}
  function append(m){
    const idx=state.rows.findIndex(row=>row.scientific.toLowerCase()===m.scientific.toLowerCase());
    if(idx>=0)return idx;
    return state.rows.push(m)-1;
  }
  showComparison(root,localKeys);
  let imageJob=0;
  root.onchange=async e=>{
    if(e.target.matches(".close-up")){
      const file=e.target.files[0];if(!file)return;
      const job=++imageJob,info=root.querySelector(".close-preview");
      info.textContent="Checking the additional photo…";
      try{
        const data=await resize(file);
        const {identify}=await import("./identify.js?v=3");
        const ids=await identify(data);
        if(job!==imageJob||!root.isConnected||form.previewState!==state)return;
        picture=data;
        showComparison(root,ids);
        for(const k of ids)if(plantNames[k])append(localMatch(k));
        info.innerHTML=`<img class="preview" src="${data}" alt="Additional close-up"><p>${ids.length?`This view suggests: ${ids.map(id=>plantNames[id][0]).join(", ")}.`:"No clear local match."} Specialist lookup will use this close-up.</p>`;
        draw();
      }catch{if(job===imageJob && root.isConnected)info.textContent="Could not check this close-up.";}
      return;
    }
    const item=e.target.closest("[data-candidate]");if(!item)return;
    const idx=Number(item.dataset.candidate);
    state.selected=state.selected.filter(i=>i!==idx);
    if(item.checked)state.selected.push(idx);
    draw();
  };
  root.onclick=async e=>{
    if(e.target.closest(".add-known")){
      const input=root.querySelector(".known-name"),scientific=input.value.trim();if(!scientific){input.focus();return;}
      const key=careKey(scientific),guide=extraCare(scientific)||guides[key];
      const idx=append(make(guide?.source?guide.name:scientific,scientific,"Entered by you",key));if(!state.selected.includes(idx))state.selected.push(idx);
      input.value="";draw();return;
    }
    const send=e.target.closest(".send-photo");if(!send)return;
    const field=root.querySelector(".special-key"),key=field.value.trim(),status=root.querySelector(".lookup-status");
    if(!key){status.textContent="Enter a Pl@ntNet API key to use this lookup.";field.focus();return;}
    send.disabled=true;field.value="";status.textContent="Checking with Pl@ntNet…";
    try{
      const {specialistMatches}=await import("./specialist.js");
      const inputPhoto=picture;const items=await specialistMatches(inputPhoto,key);
      if(!root.isConnected||form.previewState!==state || inputPhoto!==picture)return;
      for(const m of items)append(make(m.name,m.scientific,"Pl@ntNet"));
      status.textContent=items.length?"Select the matches you recognize in this pot.":"No specialist match found.";
      draw();
    } catch(err){if(root.isConnected && form.previewState===state)status.textContent=err.message||"Lookup failed.";}
    finally{send.disabled=false;}
  };
  draw();
}
export function examplePreview(root){
  const rows=[make("Golden sedum","Sedum adolphii","Example"),make("Jelly bean succulent","Sedum pachyphyllum","Example")];
  let selected=[0,1];root.innerHTML=display(rows,selected);
  root.onchange=e=>{if(!e.target.matches("[data-candidate]"))return;const i=Number(e.target.dataset.candidate);selected=selected.filter(n=>n!==i);if(e.target.checked)selected.push(i);root.innerHTML=display(rows,selected);};
}
