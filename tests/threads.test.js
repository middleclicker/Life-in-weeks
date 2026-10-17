import {test} from 'node:test';
import assert from 'node:assert/strict';
import {COLORS,makeCalendar} from '../src/calendar.js';
import {YEAR_COLUMNS,yearHTML,yearThreads} from '../src/year.js';
import {validatedSuggestions,mergeSuggestions} from '../src/analysis.js';
import {applyUpdate} from '../src/updates.js';

const birthday='2000-01-01',today='2026-10-17';
const phases=[
  {id:'friends',title:'Talking after class',start:'2026-01-02',end:'2026-09-01',color:'rose'},
  {id:'college',title:'Finding a place here',start:'2026-03-01',end:'2026-10-01',color:'blue'},
  {id:'drawing',title:'Keeping a sketchbook',start:'2026-04-01',end:'2026-06-01',color:'ochre'},
];
const calendar=makeCalendar(birthday,90,today,phases);

test('three simultaneous themes have independent lanes beneath the same week boxes',()=>{
  const plan=yearThreads(calendar,2026);
  const overlap=plan.rows.find(row=>row.weeks.some(w=>w.phases.length===3));
  assert.equal(overlap.lanes.length,3);
  for(const week of overlap.weeks.filter(w=>w.phases.length===3)) {
    const col=overlap.weeks.indexOf(week);
    assert.ok(overlap.lanes.every(lane=>lane.runs.some(run=>run.start<=col && run.end>=col)));
  }
  const html=yearHTML(calendar,2026,{birthday,colors:COLORS});
  assert.equal((html.match(/role="gridcell"/g)||[]).length,plan.weeks.length);
  assert.ok(html.includes('data-theme-lane="drawing"'));
  assert.ok(!html.includes('year-week-theme'));
  assert.ok(!html.includes('year-week-mood'));
});

test('long-running threads continue across rows while real starts and ends remain separate',()=>{
  const plan=yearThreads(calendar,2026),runs=plan.rows.flatMap(row=>row.lanes.filter(l=>l.theme.id==='friends').flatMap(l=>l.runs));
  assert.ok(plan.rows.every(row=>row.weeks.length<=YEAR_COLUMNS));
  assert.equal(plan.rows.length,4);
  assert.ok(runs.slice(0,-1).every(r=>r.continuesAfter));
  assert.ok(runs.slice(1).every(r=>r.continuesBefore));
  assert.equal(runs[0].continuesBefore,false);
  assert.equal(runs.at(-1).continuesAfter,false);
});

test('theme ordering remains stable even if saved chapter order changes',()=>{
  const a=yearThreads(calendar,2026);
  const b=yearThreads(makeCalendar(birthday,90,today,[...phases].reverse()),2026);
  assert.deepEqual(a.themes.map(t=>t.id),b.themes.map(t=>t.id));
  assert.deepEqual(a.rows.map(r=>r.lanes.map(l=>l.theme.id)),b.rows.map(r=>r.lanes.map(l=>l.theme.id)));
});

test('selecting one theme dims other lanes without deleting them and source text is escaped',()=>{
  const malicious={...phases[0],id:'bad"id',title:'<script>bad()</script>'};
  const html=yearHTML(makeCalendar(birthday,90,today,[malicious,...phases.slice(1)]),2026,{birthday,colors:COLORS,selected:malicious.id});
  assert.ok(html.includes('thread-lane dim'));
  assert.ok(html.includes('data-theme-lane="drawing"'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('Show every theme equally'));
});

test('independent AI themes can share evidence without being merged or suppressed by a corrected theme',()=>{
  const text='# 2026-01-02\nI kept sketching and practicing conversations.\n# 2026-02-02\nI was still sketching and talking after class.';
  const evidence=[{date:'2026-01-02',quote:'I kept sketching and practicing conversations.'},{date:'2026-02-02',quote:'I was still sketching and talking after class.'}];
  const result=validatedSuggestions({phases:[{...phases[0],evidence},{...phases[2],evidence}]},text,birthday,today);
  assert.equal(mergeSuggestions(result.phases).length,2);
  const manual={...result.phases[0],source:'manual',originalTitle:result.phases[0].title,title:'My own words'};
  const next=applyUpdate({phases:[manual],milestones:[],moods:[]},{phases:result.phases});
  assert.equal(next.phases.length,2);
  assert.ok(next.phases.some(p=>p.title==='Keeping a sketchbook'));
  assert.ok(next.phases.some(p=>p.title==='My own words'));
});
