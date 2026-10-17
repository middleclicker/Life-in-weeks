import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateMoodPoint,validatedMoods,mergeMoods,moodBuckets,moodChartHTML} from '../src/mood.js';
import {resolveChronology} from '../src/chronology.js';
import {analyzeJournal} from '../src/analysis.js';

const birthday='2000-01-01',today='2026-10-17';
const journal='Apr. 14\nI felt worried and overwhelmed that day.\nOct. 15\nI felt hopeful and enjoyed seeing my friends.';
const entries=resolveChronology(journal,{today}).entries;
const mood={entryId:'E00001',date:today,score:2,confidence:'clear',summary:'The entry expresses worry.',quote:'I felt worried and overwhelmed that day.'};
const point=(date,score=3,id='entry')=>({date,score,entryId:id,source:'journal.md',confidence:'clear',summary:'Estimated from the entry.',evidence:[{date,entryId:id,source:'journal.md',quote:'I am describing my own feelings today.'}]});

test('mood evidence is bound to its source date, never a model-proposed current date',()=>{
  const valid=validatedMoods({moods:[mood,{...mood,entryId:'E00002'},{...mood,quote:'An invented feeling quotation.'}]},entries,birthday,today);
  assert.equal(valid.length,1);
  assert.equal(valid[0].date,'2026-04-14');
  assert.equal(valid[0].evidence[0].inferredYear,true);
});

test('mood estimates require finite scores from 1 to 5, a valid date and supporting evidence',()=>{
  for(const score of [NaN,Infinity,0,6,'3',null]) assert.equal(validateMoodPoint(point('2026-01-01',score),birthday,today),null);
  for(const date of ['2026-02-30','2030-01-01','1999-01-01']) assert.equal(validateMoodPoint(point(date),birthday,today),null);
  assert.equal(validateMoodPoint({...point('2026-01-01'),evidence:[]},birthday,today),null);
  assert.equal(validatedMoods({moods:[{...mood,entryId:undefined}]},entries,birthday,today).length,0);
});

test('split-entry estimates merge into one entry; duplicate responses do not add votes',()=>{
  const a=point('2026-01-01',1),b={...point('2026-01-01',5),evidence:[{...a.evidence[0],quote:'Another part of the same journal entry.'}]};
  const merged=mergeMoods([a,b,a]);
  assert.equal(merged.length,1);assert.equal(merged[0].score,3);
  assert.equal(merged[0].evidence.length,2);
});

test('weekly points match birthday-based calendar weeks and give each entry equal weight',()=>{
  const buckets=moodBuckets([point('2026-01-01',1,'a'),point('2026-01-02',5,'b'),point('2026-01-15',4,'c')],birthday);
  assert.equal(buckets[0].start,'2025-12-27');
  assert.equal(buckets[0].score,3);
  assert.equal(buckets.length,2);
  assert.equal(moodBuckets([point('2026-01-01'),point('2026-01-15')],birthday,'month').length,1);
});

test('graph leaves gaps instead of inventing mood and safely renders evidence',()=>{
  const html=moodChartHTML([point('2026-01-01'),{...point('2026-03-01'),summary:'<script>alert(1)</script>'}],birthday);
  assert.equal((html.match(/class="mood-line"/g)||[]).length,0);
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('Explore the entries behind a point'));
  assert.ok(moodChartHTML([],birthday).includes('Analyze my journal'));
  assert.ok(moodChartHTML([point('2026-01-01')],birthday).includes('data-mood-bucket'));
});

test('mood-only analysis survives checkpoint review without additional API calls',async()=>{
  let checkpoint;
  const config={text:journal,birthday,today,provider:'custom',key:'',model:'test',base:'http://127.0.0.1:8788'};
  const result=await analyzeJournal({...config,onCheckpoint:cp=>checkpoint=cp,fetchImpl:async(url,init)=>{
    assert.ok(JSON.parse(init.body).messages[0].content.includes('"moods"'));
    return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({phases:[],milestones:[],moods:[mood]})}}]})};
  }});
  assert.equal(result.moods.length,1);assert.equal(checkpoint.moods.length,1);
  const resumed=await analyzeJournal({...config,checkpoint,fetchImpl:()=>assert.fail('Completed mood estimates must be reused')});
  assert.deepEqual(resumed.moods,result.moods);
  const restored=JSON.parse(JSON.stringify(result.moods));
  assert.ok(restored.every(p=>validateMoodPoint(p,birthday,today)));
});
