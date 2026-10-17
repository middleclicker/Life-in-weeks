import { WEEK,dateValue,formatDate } from './calendar.js';
import { moodBuckets,moodLabel } from './mood.js';
const escape=value=>String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function yearWeeks(calendar,year) {
  const start=dateValue(`${year}-01-01`),end=dateValue(`${year+1}-01-01`);
  return calendar.weeks.filter(w=>w.start<end && w.end>start);
}
export function yearHTML(calendar,year,{milestones=[],moods=[],birthday,colors}={}) {
  const weeks=yearWeeks(calendar,year),buckets=moodBuckets(moods,birthday);
  return `<div class="year-grid" role="grid" aria-label="${year} in weeks">${weeks.map((w,i)=>{
    const events=milestones.filter(m=>dateValue(m.date)>=w.start && dateValue(m.date)<w.end && (m.source!=='ai'||m.dateVerified));
    const mood=buckets.find(b=>dateValue(b.start)===w.start);
    const fills=w.phases.map(p=>colors[p.color].fill);
    const background=fills.length?`linear-gradient(135deg,${fills.map((fill,i)=>`${fill} ${i*100/fills.length}% ${(i+1)*100/fills.length}%`).join(',')})`:w.lived?'#bcc5af':'#f8f7f0';
    return `<button class="year-week ${w.current?'current':''}" data-week="${w.index}" role="gridcell" tabindex="${i===0||w.current?0:-1}" aria-label="Week ${w.index+1}, ${escape(formatDate(w.start))}${events.length?', '+escape(events.map(e=>e.title).join(', ')):''}"><span class="year-week-head"><i style="background:${background}"></i><span>${escape(formatDate(w.start,{year:undefined}))}</span>${w.current?'<small>now</small>':''}</span><span class="year-week-theme">${escape(w.phases.map(p=>p.title).slice(0,2).join(' / ') || (w.lived?'A little life':'Still unwritten'))}</span>${events.map(e=>`<span class="year-week-note">↗ ${escape(e.title)}</span>`).join('')}${mood?`<span class="year-week-mood">${mood.score.toFixed(1)}/5 · ${moodLabel(mood.score)}</span>`:''}</button>`;
  }).join('')}</div><p class="year-caption">Each card is the same seven-day week as the life map. Boundary weeks can touch two calendar years. Select a card to read or edit its story.</p>`;
}
