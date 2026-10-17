import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareJournal} from '../src/chronology.js';
import {planUpdate,mergeHistory,applyUpdate,validateHistory} from '../src/updates.js';
import {analyzeJournal} from '../src/analysis.js';
import {makeCalendar,COLORS,validatePhase} from '../src/calendar.js';
import {yearWeeks,yearHTML} from '../src/year.js';
import {moodChartHTML,validateMoodPoint,mergeMoods} from '../src/mood.js';
const birthday='2000-01-01',today='2026-10-17';
const text='# 2026-01-01\nI felt hopeful and enjoyed the day.\n# 2026-02-01\nI felt worried about starting over.';
const config={birthday,today,text,provider:'custom',model:'test',base:'http://127.0.0.1:8789'};
const response={ok:true,json:async()=>({choices:[{message:{content:'{"phases":[],"milestones":[],"moods":[]}'}}]})};

test('re-import skips unchanged entries and requests only new or changed text',async()=>{
  const first=await planUpdate(prepareJournal(text,{today}));
  const history=mergeHistory(null,first.manifest);
  assert.equal((await planUpdate(prepareJournal(text,{today}),history)).sections.length,0);
  const appended=text+'\n# 2026-03-01\nI felt calm about my next chapter.';
  const update=await planUpdate(prepareJournal(appended,{today}),history);
  assert.equal(update.changed.length,1);assert.equal(update.unchanged,2);
  assert.ok(!update.sections[0].text.includes('hopeful'));
  assert.equal((await planUpdate(prepareJournal(text.replace('worried','excited'),{today}),history)).changed.length,1);
  assert.equal((await planUpdate(prepareJournal(text,{today}),history,{full:true})).changed.length,2);
  assert.ok(!JSON.stringify(history).includes('hopeful'));
});

test('inserting an earlier entry does not invalidate unchanged later IDs; date changes do invalidate content',async()=>{
  const history=mergeHistory(null,(await planUpdate(prepareJournal(text,{today}))).manifest);
  const inserted='# 2025-12-01\nI felt ready.\n'+text;
  assert.equal((await planUpdate(prepareJournal(inserted,{today}),history)).changed.length,1);
  assert.equal((await planUpdate(prepareJournal(text.replace('2026-02-01','2026-02-02'),{today}),history)).changed.length,1);
});

test('incremental analysis avoids all API calls for identical input, including entries with no suggestions',async()=>{
  let calls=0;
  const first=await analyzeJournal({...config,fetchImpl:async()=>{calls++;return response;}});
  const history=mergeHistory(null,first.manifest);
  const same=await analyzeJournal({...config,history,fetchImpl:()=>assert.fail('No unchanged entries should be sent')});
  assert.equal(same.unchanged,2);
  await analyzeJournal({...config,history,text:text+'\n# 2026-03-01\nA new entry.',fetchImpl:async(url,init)=>{
    calls++;assert.ok(!JSON.parse(init.body).messages[1].content.includes('I felt hopeful'));return response;
  }});
  assert.equal(calls,2);
});

test('manual corrections survive changed-entry updates and full reanalysis without duplicate AI versions',()=>{
  const evidence=[{entryKey:'journal|2026-01-01|1',date:'2026-01-01',quote:'I felt hopeful and enjoyed the day.',entryId:'E00001',source:'journal'}];
  const phase=validatePhase({title:'My corrected chapter',originalTitle:'An AI chapter',start:'2026-01-01',end:'2026-02-01',source:'manual',evidence},birthday,today);
  const mood=validateMoodPoint({date:'2026-01-01',score:4,corrected:true,summary:'My explanation',evidence},birthday,today);
  const state={birthday,phases:[phase],milestones:[],moods:[mood]};
  const next=applyUpdate(state,{phases:[{...phase,source:'ai',title:'An AI chapter'}],moods:[{...mood,score:1,corrected:false}],manifest:[{key:evidence[0].entryKey,date:'2026-01-01',hash:'a'.repeat(64)}]},{full:true});
  assert.equal(next.phases.length,1);assert.equal(next.phases[0].title,'My corrected chapter');
  assert.equal(next.moods.length,1);assert.equal(next.moods[0].score,4);
  assert.equal(mergeMoods([mood,{...mood,corrected:false,score:1}])[0].score,4);
  assert.equal(validateMoodPoint(JSON.parse(JSON.stringify(mood)),birthday,today).corrected,true);
});

test('updates replace affected AI results and keep unrelated AI seasons',()=>{
  const phase=(key)=>({source:'ai',title:key,evidence:[{entryKey:key}]});
  const next=applyUpdate({phases:[phase('a'),phase('b')],milestones:[],moods:[]},{phases:[phase('a-new')],manifest:[{key:'a',date:'2026-01-01',hash:'a'.repeat(64)}]});
  assert.deepEqual(next.phases.map(p=>p.title),['b','a-new']);
  const full=applyUpdate({phases:[phase('a'),phase('another-journal')],milestones:[],moods:[]},{manifest:[{key:'a',date:'2026-01-01',hash:'a'.repeat(64)}]},{full:true});
  assert.deepEqual(full.phases.map(p=>p.title),['another-journal']);
});

test('partially read split entries are not marked processed until all pieces complete',async()=>{
  let calls=0,checkpoint;
  const long='# 2026-01-01\n'+'A very long entry. '.repeat(2500);
  await assert.rejects(analyzeJournal({...config,text:long,concurrency:1,onCheckpoint:cp=>checkpoint=cp,fetchImpl:async()=>++calls===2?{ok:false,status:429}:response}),/rate or spending limit/);
  assert.equal(checkpoint.completed,1);assert.equal(checkpoint.manifest.length,0);
});

test('year view includes each overlapping birthday week exactly once, including leap years and partial birth years',()=>{
  const calendar=makeCalendar(birthday,90,today);
  for(const year of [2000,2024,2026]) {
    const weeks=yearWeeks(calendar,year);
    assert.equal(new Set(weeks.map(w=>w.index)).size,weeks.length);
    assert.ok(weeks.length>=52 && weeks.length<=54);
    for(let i=1;i<weeks.length;i++) assert.equal(weeks[i].index,weeks[i-1].index+1);
  }
  assert.ok(yearWeeks(makeCalendar('2000-12-31',90,today),2000).length===1);
  const html=yearHTML(calendar,2026,{birthday,colors:COLORS,moods:[],milestones:[{date:'2026-01-02',title:'A major event',id:'event'}]});
  assert.ok(html.includes('A major event'));assert.ok(html.includes('role="gridcell"'));
});

test('milestones are shown on the mood graph with accessible event links; missing mood is not invented',()=>{
  const evidence=[{date:'2026-01-01',quote:'I felt hopeful and enjoyed the day.',source:'journal',entryId:'1'}];
  const point=validateMoodPoint({date:'2026-01-01',score:4,evidence},birthday,today);
  const html=moodChartHTML([point],birthday,{milestones:[{id:'college',date:'2026-01-02',title:'College offer',source:'manual'}]});
  assert.ok(html.includes('data-note="college"'));assert.ok(html.includes('Moments along the way'));
  assert.ok(html.includes('Correct this estimate'));assert.ok(!html.includes('NaN'));
  assert.equal(validateHistory({version:1,entries:[{key:'secret',date:'2026-01-01',hash:'raw journal text'}]}).entries.length,0);
});
