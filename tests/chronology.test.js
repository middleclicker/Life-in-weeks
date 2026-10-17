import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groundedEvidence, parseDateHeading, prepareJournal, resolveChronology } from '../src/chronology.js';
import { analysisFingerprint, validatedSuggestions, validatedMilestones, curateMilestones } from '../src/analysis.js';

test('recognizes dotted English month headings, Note suffixes, numeric and explicit dates', () => {
  for (const heading of ['Sept. 13 Note','Sep. 13','September 13','13 September','9.13','9/13','9月13日']) assert.deepEqual(parseDateHeading(heading),{year:null,month:9,day:13});
  for (const heading of ['# 2025-09-13','2025年9月13日','September 13, 2025','9/13/2025']) assert.deepEqual(parseDateHeading(heading),{year:2025,month:9,day:13});
  assert.equal(parseDateHeading('I remembered September 13 while walking.'),null);
  assert.equal(parseDateHeading('April 12 is a date I remember.'),null);
});

test('infers a yearless journal chronologically across December and January, without treating prose years as anchors', () => {
  const journal='Sept. 13 Note\nA new semester.\nDec. 28\nA winter entry.\nJan. 7\nA new year.\nApr. 14\nI mentioned a future date in 2027.\nOct. 15\nA recent entry.';
  const result=resolveChronology(journal,{today:'2026-10-17'});
  assert.deepEqual(result.entries.map(e=>e.date),['2025-09-13','2025-12-28','2026-01-07','2026-04-14','2026-10-15']);
  assert.equal(result.rollovers,1); assert.equal(result.errors.length,0); assert.equal(result.inferred,5);
});

test('uses a later explicit date to infer years of earlier entries', () => {
  const result=resolveChronology('Sept. 13\nFirst.\nDec. 28\nSecond.\n2024-01-07\nThird.',{today:'2026-10-17'});
  assert.deepEqual(result.entries.map(e=>e.date),['2023-09-13','2023-12-28','2024-01-07']);
  assert.equal(result.anchored,true);
});

test('an editable ending year handles journals that are not current', () => {
  const result=resolveChronology('Sept. 13\nFirst.\nJan. 7\nLast.',{today:'2026-10-17',endingYear:2022});
  assert.deepEqual(result.entries.map(e=>e.date),['2021-09-13','2022-01-07']);
});

test('automatically anchors a December final entry to the preceding year when today is January', () => {
  const result=resolveChronology('Nov. 7\nFirst.\nDec. 28\nLast.',{today:'2026-01-10'});
  assert.equal(result.lastDate,'2025-12-28');
});

test('flags impossible dates, conflicting explicit years and entry order errors', () => {
  assert.ok(resolveChronology('Feb. 30\nImpossible.',{today:'2026-10-17'}).errors.length);
  assert.ok(resolveChronology('2024-01-01\nOne.\n2023-02-01\nTwo.',{today:'2026-10-17'}).errors.length);
  assert.ok(resolveChronology('Mar. 20\nOne.\nMar. 10\nTwo.',{today:'2026-10-17'}).errors.length);
  assert.ok(resolveChronology('2027-01-01\nFuture.',{today:'2026-10-17'}).errors.length);
});

test('split entries retain their IDs and date, and every source character is retained', () => {
  const source='Sept. 13 Note\n'+'A paragraph about a remembered day.\n'.repeat(2000)+'Oct. 15\nA final entry.';
  const result=prepareJournal(source,{today:'2026-10-17'});
  assert.ok(result.sections.length>2);
  assert.equal(result.sections.flatMap(s=>s.entries).map(e=>e.text).join(''),source);
  assert.ok(result.sections.every(s=>s.text.length<=20000));
  assert.ok(result.sections.filter(s=>s.entries.some(e=>e.id==='E00001')).every(s=>s.text.includes('date=2026-09-13')));
});

test('quoted evidence is bound to its actual entry, never the model-assigned date', () => {
  const entries=resolveChronology('Apr. 14\nI brought a dessert to share that afternoon.\nOct. 15\nWe had already separated some time ago.',{today:'2026-10-17'}).entries;
  const evidence=groundedEvidence([{entryId:'E00001',date:'2026-10-17',quote:'I brought a dessert to share that afternoon.'}],entries);
  assert.equal(evidence[0].date,'2026-04-14');
  assert.equal(groundedEvidence([{entryId:'E00002',quote:'I brought a dessert to share that afternoon.'}],entries).length,0);
});

test('a past partner anecdote cannot become a current-week chapter', () => {
  const source='Apr. 12\nI made a dessert for my partner.\nApr. 14\nWe shared the dessert that evening.\nOct. 15\nWe had separated long before this entry.';
  const proposed={title:'Dessert for my girlfriend',start:'2026-10-13',end:'2026-10-17',evidence:[{entryId:'E00001',quote:'I made a dessert for my partner.'},{entryId:'E00002',quote:'We shared the dessert that evening.'}]};
  const result=validatedSuggestions({phases:[proposed]},source,'2000-01-01','2026-10-17');
  assert.equal(result.phases.length,0); // A two-day anecdote is not a sustained chapter.
});

test('sustained historical chapters end at the last supporting entry instead of extending to today', () => {
  const source='Jan. 7\nWe were planning things together each week.\nFeb. 20\nWe were still spending a lot of time together.\nApr. 14\nThe relationship ended today.\nOct. 15\nA different season of life.';
  const proposed={title:'Time together',start:'2026-01-07',end:'2026-10-17',evidence:[{entryId:'E00001',quote:'We were planning things together each week.'},{entryId:'E00002',quote:'We were still spending a lot of time together.'}]};
  const result=validatedSuggestions({phases:[proposed]},source,'2000-01-01','2026-10-17');
  assert.equal(result.phases[0].end,'2026-02-20'); assert.equal(result.phases[0].dateVerified,true);
});

test('ordinary events are excluded and major milestone curation prevents dense yearly lists', () => {
  const source='Apr. 14\nI brought a dessert to share that afternoon.';
  assert.equal(validatedMilestones({milestones:[{title:'Dessert',date:'2026-04-14',kind:'other',importance:2,evidence:[{entryId:'E00001',quote:'I brought a dessert to share that afternoon.'}]}]},source,'2000-01-01','2026-10-17').milestones.length,0);
  const curated=curateMilestones(Array.from({length:12},(_,i)=>({id:String(i),title:`A turning point ${i}`,date:`2025-${String(i+1).padStart(2,'0')}-01`,importance:4})));
  assert.ok(curated.length<=2);
});

test('chronology settings and reasoning depth invalidate old analysis checkpoints', async () => {
  const config={text:'Jan. 1\nOne entry.',provider:'deepseek',model:'deepseek-v4-pro',base:'https://api.deepseek.com',birthday:'2000-01-01',today:'2026-10-17'};
  assert.notEqual(await analysisFingerprint({...config,endingYear:2025}),await analysisFingerprint({...config,endingYear:2026}));
  assert.notEqual(await analysisFingerprint({...config,effort:'low'}),await analysisFingerprint({...config,effort:'high'}));
});
