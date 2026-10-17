import { DAY, WEEK, dateValue, formatDate, iso } from './calendar.js';
import { groundedEvidence } from './chronology.js';

export const moodLabel = score => score < 1.8 ? 'Very heavy' : score < 2.6 ? 'Heavy' : score < 3.4 ? 'Mixed / steady' : score < 4.2 ? 'Lighter' : 'Very light';
export const moodKey = point => point.entryKey || [point.date,point.source,point.entryId].join('|');

export function validateMoodPoint(value,birthday,today) {
  if (!value || typeof value.score !== 'number' || !Number.isFinite(value.score) || value.score < 1 || value.score > 5 || !Number.isFinite(dateValue(value.date)) || value.date < birthday || value.date > today) return null;
  const evidence = (Array.isArray(value.evidence) ? value.evidence : []).filter(e=>e && e.date === value.date && typeof e.quote === 'string' && e.quote.trim().length >= 8).slice(0,3).map(e=>({date:value.date,quote:e.quote.slice(0,500),source:String(e.source || '').slice(0,200),entryId:String(e.entryId || '').slice(0,100),entryKey:String(e.entryKey || '').slice(0,500),inferredYear:e.inferredYear === true}));
  if (!evidence.length) return null;
  return {date:value.date,score:value.score,entryId:evidence[0].entryId,entryKey:evidence[0].entryKey,corrected:value.corrected === true,source:evidence[0].source,summary:String(value.summary || '').slice(0,400),confidence:value.confidence === 'clear' ? 'clear' : 'tentative',evidence};
}

export function validatedMoods(data,entries,birthday,today) {
  const moods=[];
  for (const item of (Array.isArray(data.moods) ? data.moods : []).slice(0,entries.length)) {
    if (!item?.entryId) continue;
    const evidence=groundedEvidence([{entryId:item.entryId,quote:item.quote}],entries);
    if (!evidence.length) continue;
    const point=validateMoodPoint({...item,date:evidence[0].date,evidence},birthday,today);
    if(point) moods.push(point);
  }
  return moods;
}

// A split entry can be scored in multiple requests. It still counts as one entry.
export function mergeMoods(points) {
  const groups=new Map();
  for(const point of points) {
    const key=moodKey(point);
    if(!groups.has(key)) groups.set(key,new Map());
    const quoteKey=point.evidence.map(e=>e.quote).join('|');
    if(!groups.get(key).get(quoteKey)?.corrected || point.corrected) groups.get(key).set(quoteKey,point);
  }
  return [...groups.values()].map(group=>{
    const values=[...group.values()], first=values[0];
    const corrected=values.findLast(p=>p.corrected); if(corrected) return corrected;
    return {...first,score:values.reduce((sum,p)=>sum+p.score,0)/values.length,confidence:values.every(p=>p.confidence === 'clear') ? 'clear' : 'tentative',evidence:values.flatMap(p=>p.evidence).filter((e,i,all)=>all.findIndex(x=>x.quote === e.quote)===i).slice(0,3)};
  }).sort((a,b)=>a.date.localeCompare(b.date) || a.entryId.localeCompare(b.entryId));
}

export function moodBuckets(points,birthday,period='week') {
  const groups=new Map();
  for(const point of mergeMoods(points)) {
    const start=period === 'month' ? point.date.slice(0,7)+'-01' : iso(dateValue(birthday)+Math.floor((dateValue(point.date)-dateValue(birthday))/WEEK)*WEEK);
    if(!groups.has(start)) groups.set(start,[]);
    groups.get(start).push(point);
  }
  return [...groups].sort(([a],[b])=>a.localeCompare(b)).map(([start,entries])=>({start,entries,score:entries.reduce((sum,p)=>sum+p.score,0)/entries.length}));
}

const escape=value=>String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function moodChartHTML(points,birthday,{period='week',selected,chartWidth=900,milestones=[]}={}) {
  const buckets=moodBuckets(points,birthday,period);
  const intro='<p class="mood-intro">A little weather report, drawn from your words. An AI estimate of the feelings expressed in each entry—not a measure of your mental health. Writing captures moments, not your whole week.</p>';
  if(!buckets.length) return `<div class="mood-heading"><div><span class="eyebrow">THE WEATHER WITHIN</span><h2>Mood, through the pages</h2></div><span class="mood-estimate">Journal-based estimate</span></div>${intro}<div class="mood-empty"><span>Some days are sunshine. Some are rain.</span><p>Analyze your journal to sketch the pattern. Older analyses need another pass to include mood estimates.</p><button class="button outline" data-action="journal">Analyze my journal</button></div>`;
  const chosen=buckets.find(b=>b.start===selected) || buckets.at(-1);
  const width=Math.max(300,chartWidth,Math.min(900,buckets.length*14+118)),height=325,left=92,right=26,top=24,bottom=80;
  const first=dateValue(buckets[0].start),last=Math.max(dateValue(buckets.at(-1).start),...milestones.filter(m=>(m.source!=='ai'||m.dateVerified) && dateValue(m.date)>=dateValue(buckets[0].start) && dateValue(m.date)<=dateValue(buckets.at(-1).start)+(period==='month'?31*DAY:WEEK)).map(m=>dateValue(m.date)));
  const x=date=>last===first ? (left+width-right)/2 : left+(dateValue(date)-first)/(last-first)*(width-left-right);
  const y=score=>top+(5-score)/4*(height-top-bottom);
  const gap=period === 'month' ? 32*DAY : WEEK;
  const segments=buckets.slice(1).map((b,i)=>dateValue(b.start)-dateValue(buckets[i].start)<=gap ? `<path d="M${x(buckets[i].start)} ${y(buckets[i].score)} L${x(b.start)} ${y(b.score)}" class="mood-line"/>` : '').join('');
  const events=milestones.filter(m=>(m.source!=='ai'||m.dateVerified) && dateValue(m.date)>=first && dateValue(m.date)<=last+(period==='month'?31*DAY:WEEK)).sort((a,b)=>a.date.localeCompare(b.date));
  const eventMarks=events.map(m=>'<a href="#landmarks" data-note="'+escape(m.id)+'" aria-label="'+escape(m.title+' · '+formatDate(m.date))+'"><line x1="'+x(m.date)+'" x2="'+x(m.date)+'" y1="'+top+'" y2="'+(height-bottom+25)+'" class="mood-event-line"/><circle cx="'+x(m.date)+'" cy="'+(height-bottom+18)+'" r="7" class="mood-event-dot"/><title>'+escape(m.title+' · '+formatDate(m.date))+'</title></a>').join('');
  const ticks=[...new Set([0,Math.floor((buckets.length-1)/2),buckets.length-1])];
  return `<div class="mood-heading"><div><span class="eyebrow">THE WEATHER WITHIN</span><h2>Mood, through the pages</h2></div><div class="segmented" aria-label="Mood grouping"><button data-mood-period="week" aria-pressed="${period==='week'}" class="${period==='week'?'active':''}">Weekly</button><button data-mood-period="month" aria-pressed="${period==='month'}" class="${period==='month'?'active':''}">Monthly</button></div></div>${intro}<div class="mood-chart-scroll"><svg class="mood-chart" style="width:${width}px" viewBox="0 0 ${width} ${height}" role="img" aria-label="Estimated mood over time, from 1 heavy to 5 light. Select a point below to read its evidence.">${[1,2,3,4,5].map(n=>`<line x1="${left}" x2="${width-right}" y1="${y(n)}" y2="${y(n)}" class="mood-rule"/><text x="${left-14}" y="${y(n)+5}" text-anchor="end">${n===5?'5 · Lighter':n===3?'3 · Mixed':n===1?'1 · Heavier':n}</text>`).join('')}${segments}${eventMarks}${buckets.map(b=>`<a href="#mood-detail" data-mood-bucket="${b.start}" aria-label="${escape(formatDate(b.start))}: ${b.score.toFixed(1)} out of 5, ${b.entries.length} entries"><circle cx="${x(b.start)}" cy="${y(b.score)}" r="${b.start===chosen.start?7:4.5}" class="mood-dot ${b.start===chosen.start?'selected':''}"/><title>${escape(formatDate(b.start))} · ${moodLabel(b.score)} · ${b.entries.length} entries</title></a>`).join('')}${ticks.map(i=>`<text x="${x(buckets[i].start)}" y="${height-13}" text-anchor="middle">${escape(formatDate(buckets[i].start,{day:undefined,month:'short',year:'numeric'}))}</text>`).join('')}</svg></div>${events.length?'<div class="mood-event-legend"><span>◇ Moments along the way</span>'+events.map(m=>'<button data-note="'+escape(m.id)+'"><strong>'+escape(m.title)+'</strong><small>'+escape(formatDate(m.date))+'</small></button>').join('')+'</div>':''}<div class="mood-chart-caption"><span>${mergeMoods(points).length} entries · ${buckets.length} ${period==='week'?'weeks':'months'} with evidence</span><span>Missing periods stay blank. Each entry counts equally.</span></div><label for="mood-point">Explore the entries behind a point</label><select id="mood-point">${buckets.map(b=>`<option value="${b.start}" ${b===chosen?'selected':''}>${period==='week'?'Week of ':''}${escape(formatDate(b.start))} · ${moodLabel(b.score)} · ${b.score.toFixed(1)}/5</option>`).join('')}</select><div id="mood-detail" class="mood-detail"><div><h3>${period==='week'?'Week of ':''}${escape(formatDate(chosen.start))}</h3><span>${moodLabel(chosen.score)} · ${chosen.score.toFixed(1)}/5 <small>estimated</small></span></div>${chosen.entries.map(p=>`<details><summary>${escape(formatDate(p.date))} · ${moodLabel(p.score)} ${p.corrected?'· corrected by you':p.confidence==='tentative'?'· tentative':''}</summary><p>${escape(p.summary)}</p><button class="link-button" data-mood-edit="${escape(encodeURIComponent(moodKey(p)))}">${p.corrected?'Edit your correction':'Correct this estimate'} ↗</button>${p.evidence.map(e=>`<blockquote>${escape(e.quote)}<cite>${escape(e.source)}${e.inferredYear?' · year inferred':''}</cite></blockquote>`).join('')}</details>`).join('')}<button class="link-button" data-mood-find="${chosen.entries[0].date}">Find this week on my map ↗</button></div>`;
}
