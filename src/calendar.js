export const DAY = 86_400_000;
export const WEEK = 7 * DAY;
export const COLORS = {
  sage: { fill: '#a6b89b', ink: '#52644b', label: 'Sage' },
  ochre: { fill: '#edcc7e', ink: '#8b692a', label: 'Sunflower' },
  blue: { fill: '#a9bdc9', ink: '#4b697e', label: 'Sky' },
  rose: { fill: '#d7a39c', ink: '#975e57', label: 'Clay rose' },
  lavender: { fill: '#bbb0d0', ink: '#78638e', label: 'Lilac' },
  peach: { fill: '#e4b08b', ink: '#9c6843', label: 'Apricot' },
};

export function dateValue(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value ? ms : NaN;
}

export function todayISO(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function iso(value) { return new Date(value).toISOString().slice(0, 10); }

export function anniversary(birthday, age) {
  const date = new Date(dateValue(birthday));
  const month = date.getUTCMonth();
  date.setUTCFullYear(date.getUTCFullYear() + age);
  // Feb 29 birthdays are observed on Feb 28 in non-leap years.
  if (date.getUTCMonth() !== month) date.setUTCDate(0);
  return date.getTime();
}

export function ageAt(birthday, at = todayISO()) {
  const birth = dateValue(birthday), now = dateValue(at);
  if (!Number.isFinite(birth) || !Number.isFinite(now) || birth > now) return 0;
  let age = new Date(now).getUTCFullYear() - new Date(birth).getUTCFullYear();
  if (anniversary(birthday, age) > now) age--;
  return age;
}

export function makeCalendar(birthday, years = 90, today = todayISO(), phases = []) {
  const birth = dateValue(birthday), now = dateValue(today);
  if (!Number.isFinite(birth) || !Number.isFinite(now) || birth > now) throw new Error('Choose a birthday on or before today.');
  const end = anniversary(birthday, years);
  const rows = Array.from({ length: years }, (_, age) => ({ age, weeks: [] }));
  const weeks = [];
  const ranges = phases.map(phase => ({ phase, start: dateValue(phase.start), end: dateValue(phase.end) + DAY }));
  let age = 0;
  for (let start = birth, index = 0; start < end; start += WEEK, index++) {
    while (age + 1 < years && start >= anniversary(birthday, age + 1)) age++;
    const finish = start + WEEK;
    const matches = start <= now ? ranges.filter(p => p.start < finish && p.end > start).map(p => p.phase) : [];
    const week = { index, start, end: finish, age, lived: start <= now, current: start <= now && finish > now, phases: matches };
    rows[age].weeks.push(week);
    weeks.push(week);
  }
  return { rows, weeks, completed: Math.floor((now - birth) / WEEK), days: Math.floor((now - birth) / DAY), age: ageAt(birthday, today) };
}

export function formatDate(value, options = {}) {
  const date = typeof value === 'string' ? dateValue(value) : value;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC', ...options }).format(date);
}

export function validatePhase(value, birthday, today = todayISO()) {
  if (!value || typeof value !== 'object') return null;
  const start = dateValue(value.start), end = dateValue(value.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start < dateValue(birthday) || end > dateValue(today)) return null;
  if (typeof value.title !== 'string' || !value.title.trim()) return null;
  return {
    id: typeof value.id === 'string' ? value.id.slice(0, 100) : globalThis.crypto.randomUUID(),
    title: value.title.trim().slice(0, 90), start: value.start, end: value.end,
    summary: typeof value.summary === 'string' ? value.summary.slice(0, 1200) : '',
    color: Object.hasOwn(COLORS, value.color) ? value.color : 'sage',
    confidence: value.confidence === 'tentative' ? 'tentative' : 'clear',
    source: value.source === 'ai' ? 'ai' : 'manual',
    dateVerified:value.dateVerified === true, analysisVersion:Number(value.analysisVersion) || 0,
    evidence: Array.isArray(value.evidence) ? value.evidence.filter(e => e && typeof e.quote === 'string' && typeof e.date === 'string').slice(0, 5).map(e => ({ quote: e.quote.slice(0, 500), date: e.date.slice(0, 50), source: String(e.source || '').slice(0, 200),entryId:String(e.entryId || ''),inferredYear:e.inferredYear === true })) : [],
  };
}

export function phaseWeeks(phase, calendar) {
  return calendar.weeks.filter(w => w.phases.some(p => p.id === phase.id)).length;
}

export function validateMilestone(value, birthday, today = todayISO()) {
  if (!value || typeof value !== 'object' || !Number.isFinite(dateValue(value.date)) || value.date < birthday || value.date > today || typeof value.title !== 'string' || !value.title.trim()) return null;
  return {
    id: typeof value.id === 'string' ? value.id.slice(0, 100) : globalThis.crypto.randomUUID(),
    date: value.date, title: value.title.trim().slice(0, 70),
    summary: typeof value.summary === 'string' ? value.summary.slice(0, 600) : '',
    source: value.source === 'ai' ? 'ai' : 'manual',
    dateVerified:value.dateVerified === true,analysisVersion:Number(value.analysisVersion) || 0,
    importance:Number(value.importance) || 4,kind:String(value.kind || 'other'),
    evidence: Array.isArray(value.evidence) ? value.evidence.filter(e => e && typeof e.quote === 'string' && typeof e.date === 'string').slice(0, 3).map(e => ({ quote: e.quote.slice(0, 500), date: e.date.slice(0, 50), source: String(e.source || '').slice(0, 200),entryId:String(e.entryId || ''),inferredYear:e.inferredYear === true })) : [],
  };
}

export function demoState(today = todayISO()) {
  const year = Number(today.slice(0, 4));
  const p = (id, title, start, end, color, summary) => ({ id, title, start, end, color, summary, source: 'manual', confidence: 'clear', evidence: [] });
  return {
    birthday: `${year - 28}-04-12`, years: 90, demo: true,
    moods: [3.6,3.9,3.1,2.2,2.6,2.1,3.2,3.6,3.1,3.8,4.2,3.5,3.9,4.4,3.7,4.1].map((score,i)=>{
      const date=iso(dateValue(today)-(15-i)*WEEK);
      const quote=score < 3 ? 'Today felt heavy, and I needed some quiet time to myself.' : 'I felt a little lighter today, and enjoyed a slow afternoon with friends.';
      return {date,score,entryId:`demo-mood-${i}`,source:'Example journal (illustrative)',summary:'An illustrative mood estimate for the sample story.',confidence:'tentative',evidence:[{date,quote,source:'Example journal (illustrative)',entryId:`demo-mood-${i}`} ]};
    }),
    milestones: [
      { id: 'demo-note-1', title: 'off to college!', date: `${year - 10}-09-05`, summary: 'A new campus, a suitcase, and a whole lot of possibility.', source: 'manual', evidence: [] },
      { id: 'demo-note-2', title: 'a city to call my own', date: `${year - 7}-07-10`, summary: 'The keys to a first apartment in a new city.', source: 'manual', evidence: [] },
      { id: 'demo-note-3', title: 'picked up a sketchbook', date: `${year - 2}-02-18`, summary: 'Making a little space for creativity again.', source: 'manual', evidence: [] },
    ],
    phases: [
      p('demo-1', 'Finding my people', `${year - 10}-09-01`, `${year - 7}-06-30`, 'ochre', 'New places, late-night conversations, and the friendships that felt like home.'),
      p('demo-2', 'A leap into the unknown', `${year - 7}-07-01`, `${year - 5}-03-31`, 'blue', 'Moving to a new city and learning to make a life of my own.'),
      p('demo-3', 'Learning to show up', `${year - 4}-01-01`, `${year - 3}-10-31`, 'rose', 'Working through social anxiety, one small conversation at a time. Progress was rarely a straight line.'),
      p('demo-4', 'Growing into myself', `${year - 2}-02-01`, today, 'sage', 'Finding steadier routines, making room for creativity, and feeling a little more at home in myself.'),
    ],
  };
}
