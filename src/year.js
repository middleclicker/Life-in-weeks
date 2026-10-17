import { dateValue,formatDate } from './calendar.js';
const escape=value=>String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const YEAR_COLUMNS=14;

export function yearWeeks(calendar,year) {
  const start=dateValue(year+'-01-01'),end=dateValue((year+1)+'-01-01');
  return calendar.weeks.filter(w=>w.start<end && w.end>start);
}

// Every theme gets its own lane. Runs are clipped to each row, without losing overlaps or gaps.
export function yearThreads(calendar,year) {
  const weeks=yearWeeks(calendar,year);
  const themes=[...new Map(weeks.flatMap(w=>w.phases).map(p=>[p.id,p])).values()].sort((a,b)=>a.start.localeCompare(b.start)||a.title.localeCompare(b.title)||a.id.localeCompare(b.id));
  const rows=[];
  for(let offset=0;offset<weeks.length;offset+=YEAR_COLUMNS) {
    const rowWeeks=weeks.slice(offset,offset+YEAR_COLUMNS);
    const lanes=themes.map(theme=>{
      const runs=[];
      for(let col=0;col<rowWeeks.length;col++) {
        if(!rowWeeks[col].phases.some(p=>p.id===theme.id)) continue;
        const start=col;
        while(col+1<rowWeeks.length && rowWeeks[col+1].phases.some(p=>p.id===theme.id)) col++;
        runs.push({start,end:col,continuesBefore:dateValue(theme.start)<rowWeeks[start].start,continuesAfter:dateValue(theme.end)>=rowWeeks[col].end});
      }
      return {theme,runs};
    }).filter(lane=>lane.runs.length);
    rows.push({weeks:rowWeeks,lanes,offset});
  }
  return {weeks,themes,rows};
}

export function yearHTML(calendar,year,{milestones=[],colors,selected}={}) {
  const {weeks,themes,rows}=yearThreads(calendar,year);
  const events=milestones.filter(m=>(m.source!=='ai'||m.dateVerified) && weeks.some(w=>dateValue(m.date)>=w.start && dateValue(m.date)<w.end));
  const range=w=>formatDate(w,{month:'short',day:'numeric',year:undefined});
  return '<div class="year-thread-intro"><p>One box, one week. The lines beneath are themes that ran alongside each other.</p><button class="link-button" data-action="add">+ Add a theme</button></div>'+
    (selected?'<button class="link-button thread-clear" data-action="clear-filter">Show every theme equally ↗</button>':'')+
    '<div class="year-thread-scroll"><div class="year-grid" role="grid" aria-label="'+year+' in weeks and overlapping themes">'+
    rows.map((row,rowIndex)=>{
      const first=row.weeks[0],last=row.weeks.at(-1);
      const boxHTML=row.weeks.map((w,col)=>{
        const moments=events.filter(m=>dateValue(m.date)>=w.start&&dateValue(m.date)<w.end);
        const dim=selected&&!w.phases.some(p=>p.id===selected);
        const label='Week '+(w.index+1)+', '+formatDate(w.start)+(w.phases.length?', themes: '+w.phases.map(p=>p.title).join('; '):'')+(moments.length?', '+moments.map(m=>m.title).join('; '):'');
        return '<button class="thread-week '+(w.lived?'lived':'future')+(w.current?' current':'')+(dim?' dim':'')+'" data-week="'+w.index+'" role="gridcell" tabindex="'+(rowIndex===0&&col===0||w.current?0:-1)+'" aria-label="'+escape(label)+'" '+(w.current?'aria-current="date"':'')+' style="--wobble:'+((w.index%5-2)*.45)+'deg"><span class="sr-only">'+escape(label)+'</span>'+(moments.length?'<span class="thread-moment" aria-hidden="true"></span>':'')+'</button>';
      }).join('');
      const lanes=row.lanes.map(({theme,runs})=>{
        const color=colors[theme.color] || colors.sage,dim=selected&&theme.id!==selected;
        return '<div class="thread-lane '+(dim?'dim':'')+'" data-theme-lane="'+escape(theme.id)+'" style="--thread-color:'+color.ink+'"><button class="thread-name" data-edit="'+escape(theme.id)+'" title="'+escape(theme.title)+' · '+theme.start+' — '+theme.end+'"><i style="background:'+color.fill+'"></i><span>'+escape(theme.title)+'</span></button><div class="thread-track">'+runs.map(run=>{
          const from=run.start+1,to=run.end+2;
          return '<button class="thread-run" data-edit="'+escape(theme.id)+'" aria-label="'+escape(theme.title)+', '+escape(formatDate(row.weeks[run.start].start))+' — '+escape(formatDate(row.weeks[run.end].end-86400000))+'" style="grid-column:'+from+' / '+to+'" data-run-start="'+run.start+'" data-run-end="'+run.end+'"><svg viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true"><path d="M1 15 Q25 12 50 15 T99 14" class="thread-stroke"/><path d="M1 17 Q40 15 70 17 T99 16" class="thread-echo"/></svg><span class="thread-end before '+(run.continuesBefore?'continues':'')+'"></span><span class="thread-end after '+(run.continuesAfter?'continues':'')+'"></span></button>';
        }).join('')+'</div></div>';
      }).join('');
      return '<section class="thread-row"><div class="thread-row-heading"><span>'+escape(range(first.start))+' — '+escape(range(last.end-86400000))+'</span><span>'+String(rowIndex*YEAR_COLUMNS+1).padStart(2,'0')+' — '+String(rowIndex*YEAR_COLUMNS+row.weeks.length).padStart(2,'0')+'</span></div><div class="thread-boxes-wrap"><span class="thread-row-note">'+(rowIndex===0?'weeks of '+year:'the story continues')+'</span><div class="thread-weeks" role="row" aria-label="'+escape(range(first.start))+' to '+escape(range(last.end-86400000))+'">'+boxHTML+'</div></div><div class="thread-lanes">'+(lanes||'<p class="thread-no-themes">No themes marked here yet.</p>')+'</div></section>';
    }).join('')+'</div></div>'+
    '<div class="year-thread-footer"><span>↔ A line continuing at the edge picks up in the next row.</span><span>Click a box for its week, or a line for its theme.</span></div>'+
    (events.length?'<div class="thread-landmarks"><span>A few pencil marks</span>'+events.map(m=>'<button data-note="'+escape(m.id)+'"><small>'+escape(formatDate(m.date))+'</small><strong>↗ '+escape(m.title)+'</strong></button>').join('')+'</div>':'')+
    '<p class="year-caption">Each square is the same seven-day week as your life map. Boundary weeks can touch two years. Several themes can share any week; their lines stay separate.</p>';
}
