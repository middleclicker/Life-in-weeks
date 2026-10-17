import { dateValue } from './calendar.js';
import { packEntries } from './chronology.js';

export const HISTORY_VERSION=1;
export function validateHistory(value) {
  if(value?.version!==HISTORY_VERSION || !Array.isArray(value.entries) || value.entries.length>20000) return {version:HISTORY_VERSION,entries:[]};
  return {version:HISTORY_VERSION,entries:value.entries.filter(e=>typeof e.key==='string' && e.key.length<500 && /^[a-f0-9]{64}$/.test(e.hash) && Number.isFinite(dateValue(e.date))).map(e=>({key:e.key,hash:e.hash,date:e.date}))};
}
export async function planUpdate(journal,history,{full=false}={}) {
  const known=new Map(validateHistory(history).entries.map(e=>[e.key,e.hash]));
  const manifest=await Promise.all(journal.entries.map(async entry=>{
    // Whitespace around entries and source wrappers do not turn a re-import into new content.
    const content=entry.text.replace(/^--- Source: .+ ---$/gm,'').trim().replace(/\s+/g,' ');
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(entry.date+'|'+content));
    return {key:entry.entryKey,date:entry.date,hash:[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('')};
  }));
  const changed=manifest.filter(e=>full || known.get(e.key)!==e.hash);
  const keys=new Set(changed.map(e=>e.key));
  return {manifest,changed,unchanged:manifest.length-changed.length,sections:packEntries(journal.entries.filter(e=>keys.has(e.entryKey)))};
}
export function mergeHistory(previous,entries) {
  const map=new Map(validateHistory(previous).entries.map(e=>[e.key,e]));
  for(const entry of entries) map.set(entry.key,entry);
  return validateHistory({version:HISTORY_VERSION,entries:[...map.values()]});
}
export function affectedAI(item,keys,dates) {
  return item.source==='ai' && item.evidence?.some(e=>keys.has(e.entryKey) || (!e.entryKey && dates?.has(e.date)));
}
export function applyUpdate(state,{phases=[],milestones=[],moods=[],manifest=[]},{full=false}={}) {
  const keys=new Set(manifest.map(e=>e.key));
  const dates=new Set(manifest.map(e=>e.date));
  const keep=item=>item.source==='manual' || !affectedAI(item,keys,dates);
  const oldPhases=state.phases.filter(keep),oldNotes=state.milestones.filter(keep);
  // A corrected chapter keeps the original AI title and evidence so it cannot quietly reappear.
  const protectedPhase=p=>oldPhases.some(m=>m.source==='manual' && ((m.originalTitle || m.title).toLowerCase()===p.title.toLowerCase() || m.evidence?.some(e=>e.entryKey && p.evidence?.some(n=>n.entryKey===e.entryKey))));
  const protectedNote=p=>oldNotes.some(m=>m.source==='manual' && ((m.originalTitle || m.title).toLowerCase()===p.title.toLowerCase() || (m.date===p.date && m.evidence?.some(e=>e.entryKey && p.evidence?.some(n=>n.entryKey===e.entryKey)))));
  const oldMoods=(state.moods || []).filter(p=>p.corrected || !(keys.has(p.entryKey) || (!p.entryKey && dates.has(p.date))));
  return {...state,phases:[...oldPhases,...phases.filter(p=>!protectedPhase(p))],milestones:[...oldNotes,...milestones.filter(p=>!protectedNote(p))],moods:[...oldMoods,...moods.filter(p=>!oldMoods.some(m=>m.corrected && (m.entryKey ? m.entryKey===p.entryKey : m.date===p.date && m.source===p.source)))],analysisHistory:mergeHistory(state.analysisHistory,manifest)};
}
