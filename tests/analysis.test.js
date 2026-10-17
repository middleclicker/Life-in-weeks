import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analysisKeys, analyzeJournal, MAX_JOURNAL, mergeMilestones, mergeSuggestions, parseResponse, reasoningLevels, sectionContexts, splitJournal, validatedMilestones, validatedSuggestions, validateEndpoint } from '../src/analysis.js';
import { prepareJournal } from '../src/chronology.js';

const text = '# 2025-01-12\nI said yes to coffee today, even though I was nervous.\n# 2025-03-24\nStill practicing starting conversations.';
const phase = { title:'Practicing connection',start:'2025-01-12',end:'2025-03-24',color:'rose',evidence:[{ date:'2025-01-12', quote:'I said yes to coffee today, even though I was nervous.',source:'pasted journal' },{date:'2025-03-24',quote:'Still practicing starting conversations.',source:'pasted journal'}] };
const options = { text, birthday:'2000-01-01',today:'2026-10-17',provider:'openai',key:'test-only-key',base:'https://api.openai.com/v1',model:'test-model',concurrency:1 };
const response = data => ({ ok:true, json:async()=>({ choices:[{ finish_reason:'stop',message:{ content:JSON.stringify(data) } }] }) });

test('long journals are completely included with bounded sections and oversized input is rejected', () => {
  const input = Array.from({length:3000},(_,i)=>`Entry ${i}: something that happened.\n`).join('');
  const chunks = splitJournal(input);
  assert.equal(chunks.join(''),input.trim());
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every(c => c.length <= 20000));
  assert.throws(()=>splitJournal('x'.repeat(MAX_JOURNAL+1)),/5 million/);
});

test('endpoint validation accepts HTTPS or local models, and rejects credentials and unsafe schemes', () => {
  assert.equal(validateEndpoint('https://example.com/v1/'),'https://example.com/v1');
  assert.equal(validateEndpoint('http://127.0.0.1:8787'),'http://127.0.0.1:8787');
  assert.equal(validateEndpoint('https://example.com/v1/chat/completions'),'https://example.com/v1');
  for (const url of ['http://example.com','javascript:alert(1)','https://user:pass@example.com','https://example.com?key=foo','file:///tmp/foo']) assert.throws(()=>validateEndpoint(url));
});

test('invented quotes are rejected and unsupported model dates are replaced by source dates', () => {
  const data = {phases:[phase,{...phase,title:'Invented',evidence:[{date:'2025-01-12',quote:'This quotation was invented.'}]},{...phase,title:'Future',end:'2030-01-01'}]};
  const valid = validatedSuggestions(data,text,'2000-01-01','2026-10-17');
  assert.equal(valid.phases.length,2);
  assert.equal(valid.rejected,1);
  assert.equal(valid.phases[1].end,'2025-03-24');
  assert.equal(valid.phases[0].source,'ai');
});

test('API request uses direct credential-free fetch, JSON output and disabled OpenAI response storage', async () => {
  let request;
  const result = await analyzeJournal({...options, fetchImpl:async(url,init)=>{request={url,init};return response({phases:[phase]});}});
  assert.equal(request.url,'https://api.openai.com/v1/chat/completions');
  assert.equal(request.init.headers.Authorization,'Bearer test-only-key');
  assert.equal(request.init.credentials,'omit');
  const body = JSON.parse(request.init.body);
  assert.equal(body.store,false);
  assert.equal(body.response_format.type,'json_object');
  assert.ok(body.messages[1].content.includes('date=2025-01-12'));
  assert.ok(body.messages[1].content.includes('Still practicing starting conversations.'));
  assert.equal(result.phases.length,1);
});

test('DeepSeek request has its provider-specific options and no OpenAI store field', async () => {
  await analyzeJournal({...options,provider:'deepseek',base:'https://api.deepseek.com',fetchImpl:async(url,init)=>{
    assert.equal(url,'https://api.deepseek.com/chat/completions');
    const body=JSON.parse(init.body);
    assert.equal(body.store,undefined);
    assert.deepEqual(body.thinking,{type:'enabled'});
    assert.equal(body.reasoning_effort,'high');
    return response({phases:[]});
  }});
});

test('reasoning requests respect model capabilities, including disabling DeepSeek thinking', async () => {
  assert.ok(!reasoningLevels('openai','gpt-6.1-sol').includes('none'));
  assert.ok(!reasoningLevels('openai','gpt-5.5').includes('max'));
  assert.deepEqual(reasoningLevels('openai','gpt-4.1-mini'),[]);
  for (const [provider,model,effort,expected] of [
    ['openai','gpt-6.1-sol','none','low'],
    ['openai','gpt-5.5','max','high'],
    ['openai','gpt-4.1-mini','high',undefined],
    ['deepseek','deepseek-v4-pro','none',undefined],
  ]) {
    await analyzeJournal({...options,provider,model,effort,fetchImpl:async(url,init)=>{
      const body=JSON.parse(init.body);
      assert.equal(body.reasoning_effort,expected);
      if (provider === 'deepseek') assert.deepEqual(body.thinking,{type:'disabled'});
      return response({phases:[]});
    }});
  }
});

test('provider failures and invalid or truncated output return useful errors', async () => {
  await assert.rejects(analyzeJournal({...options,fetchImpl:async()=>({ok:false,status:401})}),/key was not accepted/);
  await assert.rejects(analyzeJournal({...options,fetchImpl:async()=>({ok:false,status:429})}),/rate or spending limit/);
  await assert.rejects(analyzeJournal({...options,fetchImpl:async()=>{throw new TypeError('network');}}),/CORS/);
  await assert.rejects(analyzeJournal({...options,fetchImpl:async()=>({ok:true,json:async()=>({choices:[{finish_reason:'length'}]})})}),/cut short/);
  assert.throws(()=>parseResponse('{bad'),/invalid JSON/);
  assert.throws(()=>parseResponse('{"unrelated":[]}'),/list of chapters/);
  assert.equal(parseResponse('```json\n{"phases":[]}\n```').phases.length,0);
});

test('cancellation prevents a request from starting', async () => {
  const controller = new AbortController();controller.abort();
  await assert.rejects(analyzeJournal({...options,signal:controller.signal,fetchImpl:()=>{assert.fail('No request should be sent');}}),{name:'AbortError'});
});

test('merging joins only matching overlapping chapters, while preserving distinct or separated seasons', () => {
  const a={...phase,id:'a',confidence:'clear'};
  const merged=mergeSuggestions([a,{...a,id:'b',start:'2025-03-20',end:'2025-04-01',confidence:'tentative'},{...a,id:'c',start:'2025-10-01',end:'2025-10-03'},{...a,id:'d',title:'A different season'}]);
  assert.equal(merged.length,3);
  assert.equal(merged.find(p=>p.id==='a').end,'2025-04-01');
  assert.equal(merged.find(p=>p.id==='a').confidence,'tentative');
});

test('a 100,000-word journal is fully read and resumes after a failure without repeating completed requests', async () => {
  const largeText = Array.from({length:100000},(_,i)=>i % 100 === 0 ? `\n2025-01-12\nmoment${i}` : `moment${i}`).join(' ');
  assert.equal(largeText.trim().split(/\s+/).length,101000);
  const plan = prepareJournal(largeText,{today:'2026-10-17'});
  const chunks = plan.sections.map(section=>section.text);
  assert.equal(plan.sections.flatMap(section=>section.entries).map(entry=>entry.text).join(''),largeText.trimStart());
  assert.ok(chunks.length > 30);
  let checkpoint, calls = 0;
  const read = [];
  const mock = async (url,init) => {
    calls++;
    if (calls === 4) return {ok:false,status:429};
    const message=JSON.parse(init.body).messages[1].content;
    read.push(message.split('<journal-data>\n')[1].split('\n</journal-data>')[0]);
    return response({phases:[]});
  };
  await assert.rejects(analyzeJournal({...options,text:largeText,onCheckpoint:cp=>{checkpoint=cp;},fetchImpl:mock}),/rate or spending limit/);
  assert.equal(checkpoint.completed,3);
  assert.equal(read.length,3);
  const progress=[];
  await analyzeJournal({...options,text:largeText,checkpoint,onCheckpoint:cp=>{checkpoint=cp;},onProgress:(n,total,state)=>progress.push(state.completed),fetchImpl:mock});
  assert.equal(read.length,chunks.length);
  assert.ok(read.every((section,i)=>section===chunks[i]));
  assert.equal(checkpoint.completed,chunks.length);
  assert.equal(calls,chunks.length+1);
  assert.equal(progress[0],3);
  assert.equal(progress.at(-1),chunks.length);
  assert.ok(!JSON.stringify(checkpoint).includes('test-only-key'));
});

test('changing a journal or model invalidates a checkpoint and reads the new input', async () => {
  let checkpoint;
  await analyzeJournal({...options,onCheckpoint:cp=>{checkpoint=cp;},fetchImpl:async()=>response({phases:[]})});
  let calls=0;
  await analyzeJournal({...options,text:text+'\nNew entry.',checkpoint,fetchImpl:async()=>{calls++;return response({phases:[]});}});
  await analyzeJournal({...options,model:'different-model',checkpoint,fetchImpl:async()=>{calls++;return response({phases:[]});}});
  assert.equal(calls,2);
});

test('completed analysis can be reviewed without making another API request', async () => {
  let checkpoint;
  await analyzeJournal({...options,onCheckpoint:cp=>{checkpoint=cp;},fetchImpl:async()=>response({phases:[phase]})});
  const result=await analyzeJournal({...options,checkpoint,fetchImpl:async()=>assert.fail('Completed sections must not be requested again')});
  assert.equal(result.phases.length,1);
});

test('date and file context survives a section boundary and resets for a new file', () => {
  const contexts=sectionContexts(['--- Source: 2025.md ---\n# 2025-01-12\nFirst entry.','Continuation of first entry.','--- Source: undated.txt ---\nA new journal.','More undated text.']);
  assert.equal(contexts[0],'');
  assert.ok(contexts[1].includes('2025-01-12'));
  assert.ok(contexts[2].includes('2025.md'));
  assert.equal(contexts[3],'--- Source: undated.txt ---');
});

test('sections never split an emoji surrogate pair', () => {
  const chunks=splitJournal('123456789😀abcdef',10);
  assert.equal(chunks.join(''),'123456789😀abcdef');
  assert.equal(chunks[0],'123456789');
  assert.equal(chunks[1].startsWith('😀'),true);
});

test('major-event pencil notes require a valid date and a verifiable quote', () => {
  const journal='# 2024-08-26\nToday was my first day at college.';
  const milestone={title:'off to college!',date:'2024-08-26',kind:'education',importance:5,evidence:[{date:'2024-08-26',quote:'Today was my first day at college.'}]};
  const result=validatedMilestones({milestones:[milestone,{...milestone,date:'2028-01-01'},{...milestone,date:'bad-date'},{...milestone,evidence:[{date:'2024-08-26',quote:'An invented milestone quotation.'}]}]},journal,'2000-01-01','2026-10-17');
  assert.equal(result.milestones.length,1);
  assert.ok(result.milestones.every(m=>m.date==='2024-08-26'));
  assert.equal(result.rejected,3);
  assert.equal(mergeMilestones([...result.milestones,...result.milestones]).length,1);
});

test('milestones survive API parsing, checkpoints and completed-analysis review', async () => {
  const journal='# 2024-08-26\nToday was my first day at college.';
  const milestone={title:'off to college!',date:'2024-08-26',kind:'education',importance:5,evidence:[{date:'2024-08-26',quote:'Today was my first day at college.'}]};
  let checkpoint;
  const result=await analyzeJournal({...options,text:journal,onCheckpoint:cp=>checkpoint=cp,fetchImpl:async()=>response({phases:[],milestones:[milestone]})});
  assert.equal(result.milestones.length,1);
  assert.equal(checkpoint.milestones.length,1);
  const resumed=await analyzeJournal({...options,text:journal,checkpoint,fetchImpl:async()=>assert.fail('Must use the completed analysis')});
  assert.equal(resumed.milestones[0].date,'2024-08-26');
});

const concurrentJournal = Array.from({length:8},(_,i)=>`# 2025-01-${String(i+1).padStart(2,'0')}\n${'A journal sentence. '.repeat(940)}\n`).join('');
const sectionNumber = init => Number(JSON.parse(init.body).messages[1].content.match(/Analyze section (\d+)/)[1]);

test('default pool processes four sections at once, never exceeds four, and saves every section once', async () => {
  let active=0, peak=0, checkpoint;
  const seen=[], progress=[];
  await analyzeJournal({...options,text:concurrentJournal,concurrency:undefined,
    onCheckpoint:cp=>checkpoint=cp,onProgress:(n,total,state)=>progress.push(state),
    fetchImpl:async(url,init)=>{
      active++; peak=Math.max(peak,active); seen.push(sectionNumber(init));
      await new Promise(resolve=>setImmediate(resolve));
      active--; return response({phases:[]});
    }});
  assert.equal(peak,4);
  assert.equal(active,0);
  assert.equal(new Set(seen).size,checkpoint.total);
  assert.equal(seen.length,checkpoint.total);
  assert.deepEqual(checkpoint.completedSections,Array.from({length:checkpoint.total},(_,i)=>i));
  assert.ok(progress.every(p=>p.active<=4));
  assert.ok(progress.every((p,i)=>i===0 || p.completed>=progress[i-1].completed));
  assert.equal(progress.at(-1).active,0);
});

test('out-of-order success is retained on failure; siblings abort and resume skips the exact completed section', async () => {
  let checkpoint;
  const pending=new Map(), calls=[], aborted=[];
  let saved;
  const successSaved=new Promise(resolve=>saved=resolve);
  let poolReady;
  const ready=new Promise(resolve=>poolReady=resolve);
  const run=analyzeJournal({...options,text:concurrentJournal,concurrency:4,
    onCheckpoint:cp=>{checkpoint=cp;saved();},
    fetchImpl:(url,init)=>new Promise((resolve,reject)=>{
      const n=sectionNumber(init);calls.push(n);pending.set(n,resolve);
      init.signal.addEventListener('abort',()=>{aborted.push(n);reject(init.signal.reason);},{once:true});
      if(calls.length===4) poolReady();
    })});
  const failed=assert.rejects(run,/rate or spending limit/);
  await ready;
  pending.get(3)(response({phases:[]}));
  await successSaved;
  pending.get(2)({ok:false,status:429});
  await failed;
  assert.deepEqual(checkpoint.completedSections,[2]);
  assert.equal(checkpoint.completed,1);
  assert.ok(aborted.includes(1) && aborted.includes(4));
  assert.ok(calls.length<=5,'No new work after failure');
  const retried=[];
  await analyzeJournal({...options,text:concurrentJournal,concurrency:4,checkpoint,
    onCheckpoint:cp=>checkpoint=cp,fetchImpl:async(url,init)=>{retried.push(sectionNumber(init));return response({phases:[]});}});
  assert.ok(!retried.includes(3));
  assert.equal(new Set(retried).size,checkpoint.total-1);
  assert.equal(checkpoint.completed,checkpoint.total);
});

test('pausing cancels all active requests and keeps already completed out-of-order work', async () => {
  const controller=new AbortController(), pending=new Map();
  let checkpoint, ready, saved;
  const poolReady=new Promise(resolve=>ready=resolve), successSaved=new Promise(resolve=>saved=resolve);
  const run=analyzeJournal({...options,text:concurrentJournal,concurrency:4,signal:controller.signal,
    onCheckpoint:cp=>{checkpoint=cp;saved();},
    fetchImpl:(url,init)=>new Promise((resolve,reject)=>{
      pending.set(sectionNumber(init),resolve);
      init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true});
      if(pending.size===4) ready();
    })});
  const paused=assert.rejects(run,{name:'AbortError'});
  await poolReady;pending.get(4)(response({phases:[]}));await successSaved;
  controller.abort();await paused;
  assert.deepEqual(checkpoint.completedSections,[3]);
  assert.equal(checkpoint.completed,1);
});

test('concurrent analysis can resume an older prefix-only checkpoint', async () => {
  let checkpoint;
  await analyzeJournal({...options,onCheckpoint:cp=>checkpoint=cp,fetchImpl:async()=>response({phases:[phase]})});
  delete checkpoint.completedSections;
  const result=await analyzeJournal({...options,concurrency:4,checkpoint,fetchImpl:async()=>assert.fail('Completed prefix must not repeat')});
  assert.equal(result.phases.length,1);
});

test('DeepSeek keys are deduplicated and extra keys never reach another provider',()=>{
  assert.deepEqual(analysisKeys('deepseek',' first ',['first',' second ','',null]),['first','second']);
  assert.deepEqual(analysisKeys('openai','primary',['deepseek-only']),['primary']);
  assert.deepEqual(analysisKeys('custom','',['deepseek-only']),[]);
  assert.equal(analysisKeys('deepseek','a',['b','c','d','e']).length,4);
});

test('two DeepSeek keys run eight sections concurrently with four workers per key',async()=>{
  let active=0,peak=0,checkpoint;
  const perKey=new Map(),perKeyPeak=new Map();
  await analyzeJournal({...options,text:concurrentJournal,provider:'deepseek',key:'first-test-key',keys:['second-test-key','first-test-key'],concurrency:undefined,
    onCheckpoint:cp=>checkpoint=cp,fetchImpl:async(url,init)=>{
      const credential=init.headers.Authorization;
      active++;peak=Math.max(peak,active);
      perKey.set(credential,(perKey.get(credential)||0)+1);
      perKeyPeak.set(credential,Math.max(perKeyPeak.get(credential)||0,perKey.get(credential)));
      await new Promise(resolve=>setImmediate(resolve));
      active--;perKey.set(credential,perKey.get(credential)-1);
      return response({phases:[]});
    }});
  assert.equal(peak,8);
  assert.deepEqual([...perKeyPeak.values()],[4,4]);
  assert.equal(checkpoint.completed,checkpoint.total);
  assert.ok(!JSON.stringify(checkpoint).includes('test-key'));
});

test('DeepSeek concurrency is capped at twelve and a single key can also request twelve workers',async()=>{
  const text=concurrentJournal+concurrentJournal.replaceAll('2025-01-','2025-02-');
  for(const keys of [[],['second-test-key','third-test-key','fourth-test-key']]) {
    let active=0,peak=0;
    await analyzeJournal({...options,text,provider:'deepseek',key:'first-test-key',keys,concurrency:12,fetchImpl:async()=>{
      active++;peak=Math.max(peak,active);await new Promise(resolve=>setImmediate(resolve));active--;
      return response({phases:[]});
    }});
    assert.equal(peak,12);assert.equal(active,0);
  }
});
