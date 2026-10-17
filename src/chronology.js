import { dateValue, todayISO } from './calendar.js';

const MONTHS = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
const MONTH = '(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)';
const pad = value => String(value).padStart(2, '0');
const suffixOK = tail => !tail.trim() || /^(?:note\b|notes\b|entry\b|journal\b|[(:：\-–—]|(?:mon|tue|wed|thu|fri|sat|sun)\w*\b|周|星期)/i.test(tail.trim());

export function parseDateHeading(line) {
  const value = line.trim().replace(/^#{1,6}\s*/, '').replace(/^\*\*|\*\*$/g, '').replace(/^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+/i, '').trim();
  if (value.length > 140) return null;
  let match = value.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?(.*)$/);
  let result;
  if (match && suffixOK(match[4])) result = { year:Number(match[1]), month:Number(match[2]), day:Number(match[3]) };
  if (!result) {
    match = value.match(new RegExp(`^${MONTH}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(20\\d{2}))?(.*)$`, 'i'));
    if (match && suffixOK(match[4])) result = { year:match[3] ? Number(match[3]) : null, month:MONTHS[match[1].slice(0,3).toLowerCase()], day:Number(match[2]) };
  }
  if (!result) {
    match = value.match(new RegExp(`^(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH}\\.?(?:,?\\s+(20\\d{2}))?(.*)$`, 'i'));
    if (match && suffixOK(match[4])) result = { year:match[3] ? Number(match[3]) : null, month:MONTHS[match[2].slice(0,3).toLowerCase()], day:Number(match[1]) };
  }
  if (!result) {
    match = value.match(/^(\d{1,2})[./月-](\d{1,2})日?(?:[./-](20\d{2}))?(.*)$/);
    if (match && suffixOK(match[4])) result = { year:match[3] ? Number(match[3]) : null, month:Number(match[1]), day:Number(match[2]) };
  }
  return result && result.month >= 1 && result.month <= 12 && result.day >= 1 && result.day <= 31 ? result : null;
}

export function resolveChronology(text, { today = todayISO(), endingYear } = {}) {
  const lines = text.match(/[^\n]*\n|[^\n]+$/g) || [];
  const nodes = [];
  let offset = 0, source = 'pasted journal', yearContext = null;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index], trimmed = line.trim();
    const sourceMatch = trimmed.match(/^--- Source: (.+) ---$/);
    if (sourceMatch) { source = sourceMatch[1]; yearContext = null; }
    const yearMatch = trimmed.match(/^(?:#{1,6}\s*)?(20\d{2})\s*年?$/);
    if (yearMatch) yearContext = Number(yearMatch[1]);
    const date = parseDateHeading(line);
    if (date) {
      nodes.push({ ...date, year:date.year || yearContext, originalHeading:trimmed, source, offset, line:index + 1 });
      yearContext = null;
    }
    offset += line.length;
  }
  const errors = [], warnings = [];
  if (!nodes.length) return { entries:[], errors:['No entry dates were found. Add a date heading such as “Sept. 13”, “2.9”, or “2025-09-13”.'], warnings, inferred:0, endingYear:null, rollovers:0 };
  let rollovers = 0;
  for (let i = 0; i < nodes.length; i++) {
    if (i) {
      const previous = nodes[i-1], current = nodes[i];
      if (current.month < previous.month) rollovers++;
      else if (current.month === previous.month && current.day < previous.day) errors.push(`Dates go backward around line ${current.line} (${current.originalHeading}). Check the chronological order.`);
    }
    nodes[i].rollover = rollovers;
  }
  const anchors = nodes.filter(n => n.year).map(n => n.year - n.rollover);
  if (new Set(anchors).size > 1) errors.push('The written years conflict with the chronological entry order. Check the date headings before analysis.');
  const last = nodes.at(-1), todayMonthDay = Number(today.slice(5,7))*100 + Number(today.slice(8,10));
  const defaultLastYear = Number(today.slice(0,4)) - (last.month*100 + last.day > todayMonthDay ? 1 : 0);
  const finalYear = anchors.length ? anchors[0] + rollovers : Number(endingYear) || defaultLastYear;
  const firstYear = finalYear - rollovers;
  const entries = nodes.map((node, index) => {
    const year = node.year || firstYear + node.rollover;
    const date = `${year}-${pad(node.month)}-${pad(node.day)}`;
    if (!Number.isFinite(dateValue(date))) errors.push(`“${node.originalHeading}” does not make a valid date in ${year}. Check the ending year.`);
    if (date > today) errors.push(`The inferred date ${date} is in the future. Check the journal’s ending year.`);
    return { id:`E${String(index + 1).padStart(5,'0')}`, date, inferred:!node.year, source:node.source, originalHeading:node.originalHeading, line:node.line, text:text.slice(node.offset,nodes[index+1]?.offset ?? text.length) };
  });
  if (nodes[0].offset && text.slice(0,nodes[0].offset).replace(/--- Source: .+ ---/g,'').trim()) warnings.push('Text before the first dated entry is not assigned a date and will not be turned into events.');
  const inferred = entries.filter(e => e.inferred).length;
  if (inferred) warnings.push(anchors.length ? 'Missing years are inferred from written years and the chronological date sequence.' : `Years are inferred backward from the last entry in ${finalYear}. Change the ending year if this journal is older.`);
  return { entries, errors:[...new Set(errors)], warnings, inferred, endingYear:finalYear, anchored:anchors.length > 0, rollovers, firstDate:entries[0].date, lastDate:entries.at(-1).date };
}

// Every section is self-contained. An entry split across two requests retains its ID and resolved date.
export function prepareJournal(text, options = {}, size = 20000) {
  const chronology = resolveChronology(text, options);
  const sections = [];
  let current = { text:'', entries:[] };
  const flush = () => { if (current.entries.length) sections.push(current); current = { text:'', entries:[] }; };
  for (const entry of chronology.entries) {
    let rest = entry.text;
    const prefix = `[[ENTRY ${entry.id} | date=${entry.date} | year=${entry.inferred ? 'chronologically inferred' : 'written'} | source=${entry.source.replace(/[\n\r\]]/g,' ').slice(0,150)}]]\n`;
    const suffix = '\n[[/ENTRY]]\n';
    const limit = Math.max(200,size-prefix.length-suffix.length);
    while (rest.length) {
      let end = Math.min(limit,rest.length);
      if (end < rest.length) {
        const newline = rest.lastIndexOf('\n',end);
        if (newline > limit/2) end = newline+1;
        const last = rest.charCodeAt(end-1); if (last >= 0xd800 && last <= 0xdbff) end--;
      }
      const part = rest.slice(0,end); rest = rest.slice(end);
      const wrapped = prefix + part + suffix;
      if (current.text.length + wrapped.length > size) flush();
      current.text += wrapped;
      current.entries.push({ ...entry,text:part });
    }
  }
  flush();
  return { ...chronology, sections };
}

export function groundedEvidence(evidence, entries) {
  if (!Array.isArray(evidence)) return [];
  const normal = value => String(value || '').replace(/\s+/g,' ').trim().toLowerCase();
  return evidence.slice(0,8).map(item => {
    if (!item || normal(item.quote).length < 8) return null;
    let candidates = entries.filter(entry => normal(entry.text).includes(normal(item.quote)));
    if (item.entryId) candidates = candidates.filter(entry => entry.id === item.entryId);
    else if (candidates.length > 1) candidates = candidates.filter(entry => entry.date === item.date);
    const dates = [...new Set(candidates.map(e => e.date))];
    if (dates.length !== 1) return null;
    const entry = candidates[0];
    return { date:entry.date,quote:String(item.quote).trim().slice(0,500),source:entry.source,entryId:entry.id,inferredYear:entry.inferred };
  }).filter(Boolean).filter((item,index,list) => list.findIndex(e => e.date === item.date && e.quote === item.quote) === index);
}
