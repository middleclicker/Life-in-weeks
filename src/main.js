import './style.css';
import { createIcons, ArrowRight, ArrowUpRight, Plus, X, Upload, Download, CalendarDays, Sparkles, BookOpen, ChevronDown, Check, ShieldCheck, HelpCircle, Settings2, Pencil, Trash2, Eye, EyeOff, RotateCcw, FileText, Heart, MousePointer2, LoaderCircle, ChevronRight, LockKeyhole } from 'lucide';
import { COLORS, DAY, WEEK, ageAt, dateValue, demoState, formatDate, iso, makeCalendar, phaseWeeks, todayISO, validateMilestone, validatePhase } from './calendar.js';
import { analyzeJournal, MAX_JOURNAL, curateMilestones, mergeMilestones, mergeSuggestions, MODEL_PRESETS, PROVIDERS, reasoningLevels, splitJournal, validateEndpoint } from './analysis.js';
import { ACCEPT, readJournal } from './import.js';
import { yearHTML, yearWeeks } from './year.js';
import { applyUpdate, planUpdate, validateHistory } from './updates.js';
import { prepareJournal } from './chronology.js';
import { mergeMoods, moodChartHTML, moodKey, moodLabel, validateMoodPoint } from './mood.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (name, cls = '') => `<i data-lucide="${name}" class="${cls}" aria-hidden="true"></i>`;
const iconSet = { ArrowRight, ArrowUpRight, Plus, X, Upload, Download, CalendarDays, Sparkles, BookOpen, ChevronDown, Check, ShieldCheck, HelpCircle, Settings2, Pencil, Trash2, Eye, EyeOff, RotateCcw, FileText, Heart, MousePointer2, LoaderCircle, ChevronRight, LockKeyhole };
const refreshIcons = () => createIcons({ icons: iconSet, attrs: { 'stroke-width': 1.65 } });
const STORAGE = 'little-by-little:v1';
const today = todayISO();
let state = demoState(today), remember = false, selected = null, view = 'all', calendar, activeAnalysis, journal = '', drafts = [], draftRejected = 0, readingFiles = false;
let analysisCheckpoint = null, modalGeneration = 0, journalEndingYear, journalPlan = null, draftManifest=[], draftFull=false, updatePlan=null, updatePreviewToken=0;
let showPencilNotes = true, selectedMilestone = null, draftMilestones = [], draftMoods = [];
let moodPeriod = 'week', selectedMood, moodPanelWidth, focusYear=Number(today.slice(0,4)), fullAnalysisPreference=false;
let connection = { provider: 'openai', base: PROVIDERS.openai.base, model: PROVIDERS.openai.model, effort:'high', key: '', keys:[], concurrency:'auto' };
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE));
  if (saved && Number.isFinite(dateValue(saved.birthday)) && saved.birthday >= '1900-01-01' && saved.birthday <= today) {
    const years = Number.isInteger(saved.years) && saved.years >= 60 && saved.years <= 130 ? saved.years : 90;
    state = { birthday: saved.birthday, years: Math.max(years, Math.ceil((ageAt(saved.birthday, today) + 1) / 10) * 10), demo: false, phases: (Array.isArray(saved.phases) ? saved.phases : []).map(p => validatePhase(p, saved.birthday, today)).filter(Boolean).slice(0, 2000) };
    state.milestones = (Array.isArray(saved.milestones) ? saved.milestones : []).map(m => validateMilestone(m, saved.birthday, today)).filter(Boolean).slice(0, 500);
    state.moods = (Array.isArray(saved.moods) ? saved.moods : []).slice(0,10000).map(p => validateMoodPoint(p,saved.birthday,today)).filter(Boolean);
    state.analysisHistory=validateHistory(saved.analysisHistory);
    remember = true;
  }
} catch { /* Private browsing or corrupt local data: start with the example. */ }

const sun = `<svg class="sun-doodle" viewBox="0 0 160 160" fill="none" aria-hidden="true"><path d="M49 82c-6-47 61-58 68-13 11 48-65 64-68 13Z" fill="#efcc78" stroke="currentColor" stroke-width="2"/><path d="M79 14l1 18m37-8-9 16m34 13-17 7m22 31-18-2m1 35-15-13m-31 18 1 17m-36-22-10 14m-9-44-19 4m22-39L18 43m34-5-7-16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="m68 73 1 1m27-3 1 1M71 89q13 15 25-4" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`;
const sprout = `<svg viewBox="0 0 130 130" fill="none" aria-hidden="true"><path d="M66 112c1-20-4-45 1-74m-3 37C40 76 27 62 30 44c20 0 33 11 34 31Zm3-20c22 1 34-13 33-29C80 27 69 36 67 55Z" fill="#c4cfb2"/><path d="M66 112c1-20-4-45 1-74m-3 37C40 76 27 62 30 44c20 0 33 11 34 31Zm3-20c22 1 34-13 33-29C80 27 69 36 67 55ZM64 75 44 58m24-4 20-16M41 113q24-7 46 0" stroke="#65765b" stroke-width="2" stroke-linecap="round"/></svg>`;

$('#app').innerHTML = `
  <header class="site-header">
    <a class="brand" href="./" aria-label="Little by little home"><span class="brand-mark" aria-hidden="true"><span></span><span></span><span></span><span></span></span><span>little by little<span class="brand-sub">YOUR LIFE, IN WEEKS</span></span></a>
    <nav aria-label="Main navigation"><button class="button small outline reset-button" data-action="clear-data" aria-label="Reset map"><span>↺</span><span>Reset</span></button><button class="text-button" data-action="how" aria-label="How it works">${icon('help-circle')}<span>How it works</span></button><button class="text-button privacy-nav" data-action="privacy">${icon('shield-check')}<span>A private little space</span></button><button class="button small outline" data-action="export">${icon('download')}<span>Save my map</span></button></nav>
  </header>
  <main>
    <section class="intro" aria-labelledby="page-title">
      <div class="intro-copy"><p class="eyebrow">THE BIG PICTURE. THE LITTLE MOMENTS.</p><h1 id="page-title">A whole life.<br><span class="underline">One week at a time.</span></h1><p>A little perspective on where you’ve been.<br>A little wonder for all that’s still to come.</p></div>
      <div class="intro-art">${sun}<span class="art-caption">Ordinary weeks.<br>Extraordinary life.</span><svg class="curly-arrow" viewBox="0 0 180 65" aria-hidden="true"><path d="M7 9c30 56 72 36 65 13-7-19-28 6-7 23 21 16 65 5 98-24m-19 3 20-5-6 20"/></svg></div>
      <div class="intro-note"><span class="tape"></span><span class="note-star">✧</span><p>You don’t have to<br>have it all figured out.<br><strong>Just keep becoming.</strong></p></div>
    </section>
    <div class="workbench">
      <aside class="setup-column" aria-label="Your map settings">
        <section class="paper setup-card"><span class="section-number">01</span><h2>Start with you</h2><p>Every story starts somewhere.</p>
          <form id="birthday-form"><label for="birthday">Your birthday</label><div class="date-field"><input type="date" id="birthday" required max="${today}" min="1900-01-01" value="${state.birthday}" aria-describedby="birthday-help">${icon('calendar-days')}</div><p id="birthday-help" class="field-note">The day your little adventure began.</p><button class="button primary full" type="submit" id="birthday-submit">Make it my map ${icon('arrow-right')}</button></form>
          <div class="horizon-field"><label for="years">A little perspective</label><select id="years">${[60,70,80,90,100,110,120].map(y => `<option value="${y}" ${state.years === y ? 'selected' : ''}>${y} years</option>`).join('')}</select><p class="field-note">A canvas, never a countdown.<br>You can change this anytime.</p></div>
        </section>
        <section class="journal-card"><span class="section-number">02</span><div class="journal-sketch">${icon('book-open')}</div><h2>Fill in the story</h2><p>Your journals hold the chapters.<br>Let’s find them together.</p><button class="button outline full" data-action="journal">${icon('upload')} Add your journals</button><div class="file-formats">.md · .txt · .docx · .pdf & more</div><button class="link-button manual-link" data-action="add">or add a chapter by hand ${icon('arrow-up-right')}</button><div class="journal-footnote">${icon('lock-keyhole')} Your words. Your API key. Your choice.</div></section>
        <div class="margin-note">${sprout}<p>There’s more growing<br>to do. And that’s a<br>lovely thing.</p></div>
      </aside>
      <section class="map-column" aria-labelledby="map-title">
        <div class="map-heading"><div><h2 id="map-title">The weeks that make a life<span class="hand-star">✳</span></h2><p id="map-subtitle"></p></div><button class="icon-button" data-action="map-settings" aria-label="Map settings">${icon('settings-2')}</button></div>
        <div class="stats-strip" id="stats"></div>
        <div class="map-paper paper"><div class="map-toolbar"><div class="segmented" aria-label="Calendar view"><button class="active" data-view="all" aria-pressed="true">Whole life</button><button data-view="lived" aria-pressed="false">So far</button><button data-view="year" aria-pressed="false">A year</button></div><span class="example-tag" id="example-tag">AN EXAMPLE LIFE</span><button class="notes-toggle" data-action="toggle-notes" aria-pressed="true" title="Show or hide pencil notes">${icon('pencil')}<span>Pencil notes</span></button><span class="square-hint"><span class="sample-square"></span> = one week</span></div>
          <div id="date-recheck" class="date-recheck" hidden><strong>Previous AI dates need a check.</strong><span>The old analysis did not verify quotes against entry dates. It is preserved, but hidden from the calendar until you re-analyze or edit it.</span><button class="link-button" data-action="journal">Re-analyze my journal ${icon('arrow-right')}</button></div><div id="filter-notice" class="filter-notice" hidden></div>
          <div id="year-controls" class="year-controls" hidden><button class="icon-button" data-year-step="-1" aria-label="Previous year">←</button><label for="focus-year">A closer look</label><select id="focus-year"></select><button class="icon-button" data-year-step="1" aria-label="Next year">→</button></div><div id="year-map" hidden></div><div class="calendar-scroll"><div class="calendar-inner"><div class="week-axis"><span>AGE</span><span>1</span><span>13</span><span>26</span><span>39</span><span>52</span></div><div id="weeks-grid" role="grid" aria-label="Life calendar. Arrow keys move between weeks; Enter opens a week."></div><svg id="pencil-notes" class="pencil-notes" aria-hidden="true"></svg></div></div>
          <div class="calendar-legend"><span><i class="legend-square lived"></i> Weeks lived</span><span><i class="legend-square current"></i> This week</span><span><i class="legend-square future"></i> Still unwritten</span></div>
          <p class="calendar-caption">Scroll across the calendar to see every week. Every square is seven days. Rows group weeks by age at their start.<br>Some years have 53 week starts. Overlapping chapters share a square.</p>
        </div>
        <div class="map-bottom"><span>Less counting. More noticing.</span><span>${icon('mouse-pointer-2')} Pick a week. Find its story.</span></div>
      </section>
      <section id="mood-panel" class="mood-panel paper" aria-label="Estimated journal mood"></section>
      <aside class="chapters-column" aria-labelledby="chapters-heading"><div class="chapters-heading"><h2 id="chapters-heading">Life’s chapters</h2><button class="icon-button" data-action="add" aria-label="Add a chapter">${icon('plus')}</button></div><p class="chapter-intro">The seasons that shaped you.<br> Click one to find it on your map.</p><div id="chapters"></div><button class="add-chapter" data-action="add">${icon('plus')} There’s more to the story</button><section id="landmarks" class="landmarks" aria-label="Life milestones"></section><div class="small-reflection"><span>“</span><p>Some weeks change you.<br>Some weeks just hold you.<br>They all belong here.</p><svg viewBox="0 0 75 25" aria-hidden="true"><path d="M3 15c18-13 37 10 68-8M12 22c15-9 29 5 47-2"/></svg></div></aside>
    </div>
    <footer><span class="footer-brand">little by little</span><p>A life is more than its squares. This is just a way to see it.</p><button class="text-button" data-action="privacy">${icon('shield-check')} Privacy & your data</button></footer>
  </main>
  <div id="week-tooltip" class="week-tooltip" role="tooltip" hidden></div>
  <dialog id="modal" aria-labelledby="modal-title"><div id="modal-content"></div></dialog>
  <input id="backup-input" type="file" accept=".json" hidden>
`;

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $('#toast').classList.remove('visible'), 5000);
}

function persist() {
  try {
    if (remember && !state.demo) localStorage.setItem(STORAGE, JSON.stringify({ version: 1, birthday: state.birthday, years: state.years, phases: state.phases, milestones: state.milestones, moods:state.moods || [],analysisHistory:state.analysisHistory }));
    else localStorage.removeItem(STORAGE);
  } catch { toast('Browser storage is unavailable. Download your map to keep a copy.'); }
}

function render() {
  calendar = makeCalendar(state.birthday, state.years, today, state.phases.filter(p => p.source !== 'ai' || p.dateVerified));
  const legacy = state.phases.some(p => p.source === 'ai' && !p.dateVerified) || state.milestones.some(m => m.source === 'ai' && !m.dateVerified);
  $('#date-recheck').hidden = !legacy;
  const current = calendar.weeks.find(w => w.current);
  $('#map-subtitle').innerHTML = state.demo ? `A sample story. <button class="inline-link" data-action="start">Make room for yours ${icon('arrow-up-right')}</button>` : `Your story began ${formatDate(state.birthday)}. Still being written.`;
  $('#example-tag').hidden = !state.demo;
  $('#birthday-submit').innerHTML = `${state.demo ? 'Make it my map' : 'Update my map'} ${icon('arrow-right')}`;
  $('#stats').innerHTML = `<div><strong>${calendar.completed.toLocaleString()}</strong><span>weeks lived <i class="tiny-spark">✧</i></span></div><div><strong>${calendar.age}<small> years</small></strong><span>of being you</span></div><div><strong>${state.phases.length}<small> chapters</small></strong><span>and still becoming</span></div>`;
  $('[data-action="toggle-notes"]').hidden=view==='year'; $('.calendar-caption').hidden=view==='year';
  $('#year-controls').hidden=view!=='year'; $('#year-map').hidden=view!=='year';
  $('.calendar-scroll').hidden=view==='year';
  const firstYear=Number(state.birthday.slice(0,4)),lastYear=new Date(calendar.weeks.at(-1).start).getUTCFullYear();
  focusYear=Math.max(firstYear,Math.min(lastYear,focusYear));
  $('#focus-year').innerHTML=Array.from({length:lastYear-firstYear+1},(_,i)=>'<option value="'+(firstYear+i)+'" '+(firstYear+i===focusYear?'selected':'')+'>'+(firstYear+i)+'</option>').join('');
  $('#focus-year').onchange=event=>{focusYear=Number(event.target.value);selectedMood=undefined;render();};
  $('#year-map').innerHTML=view==='year'?yearHTML(calendar,focusYear,{milestones:state.milestones,moods:state.moods || [],birthday:state.birthday,colors:COLORS}):'';
  const rows = view === 'lived' ? calendar.rows.filter(r => r.weeks.some(w => w.lived)) : calendar.rows;
  $('#weeks-grid').innerHTML = rows.map(row => `<div class="week-row ${row.age % 10 === 0 ? 'decade-row' : ''}" role="row" aria-label="Age ${row.age}"><span class="age-label" aria-hidden="true">${row.age % 5 === 0 || row.age === calendar.age ? row.age : ''}</span><div class="row-squares">${row.weeks.map((week, col) => {
    const fills = week.phases.map(p => COLORS[p.color].fill);
    const bg = fills.length > 1 ? `linear-gradient(135deg, ${fills.map((fill, i) => `${fill} ${i * 100 / fills.length}% ${(i + 1) * 100 / fills.length}%`).join(',')})` : fills[0];
    const dim = selected && !week.phases.some(p => p.id === selected);
    return `<button role="gridcell" class="week ${week.lived ? 'lived' : 'future'} ${week.current ? 'current' : ''} ${dim ? 'dim' : ''} ${week.phases.length ? 'has-phase' : ''}" data-week="${week.index}" data-col="${col}" tabindex="${week.current ? 0 : -1}" aria-label="Week ${week.index + 1}, ${formatDate(week.start)}${week.current ? ', this week' : ''}${week.phases.length ? ', ' + escape(week.phases.map(p => p.title).join(', ')) : ''}" ${week.current ? 'aria-current="date"' : ''} style="${bg ? `--week-color:${bg};` : ''}--wobble:${((week.index * 7) % 5 - 2) * 0.55}deg"></button>`;
  }).join('')}</div></div>`).join('');
  $('#weeks-grid').setAttribute('aria-rowcount', rows.length);
  $('#weeks-grid').setAttribute('aria-colcount', 53);
  if (!current) $('.week', $('#weeks-grid'))?.setAttribute('tabindex', '0');
  const active = state.phases.find(p => p.id === selected);
  $('#filter-notice').hidden = !active;
  if (active) $('#filter-notice').innerHTML = `<span>Looking at: <strong>${escape(active.title)}</strong></span><button class="icon-button" data-action="clear-filter" aria-label="Show all chapters">${icon('x')}</button>`;
  $('#chapters').innerHTML = state.phases.length ? [...state.phases].sort((a,b) => b.start.localeCompare(a.start)).map(phase => `<article class="chapter-card ${selected === phase.id ? 'selected' : ''}" style="--chapter-color:${COLORS[phase.color].fill};--chapter-ink:${COLORS[phase.color].ink}"><div class="chapter-card-top"><span class="color-scribble"></span><button class="icon-button chapter-edit" data-edit="${escape(phase.id)}" aria-label="Edit ${escape(phase.title)}">${icon('pencil')}</button></div><button class="chapter-select" data-select="${escape(phase.id)}" aria-pressed="${selected === phase.id}"><span class="chapter-dates">${formatDate(phase.start, { day: undefined, month: 'short', year: 'numeric' })} — ${phase.end === today ? 'now' : formatDate(phase.end, { day: undefined, month: 'short', year: 'numeric' })}</span><h3>${escape(phase.title)}</h3><p>${escape(phase.summary)}</p><span class="chapter-duration">${phase.source === 'ai' && !phase.dateVerified ? 'Dates need re-analysis · ' : ''}${phaseWeeks(phase, calendar)} weeks of your story ${icon('arrow-up-right')}</span></button></article>`).join('') : `<div class="empty-chapters">${icon('book-open')}<h3>A story only you can tell.</h3><p>Add a chapter yourself, or let your journals help you find one.</p></div>`;
  $('#landmarks').innerHTML = `<div class="landmarks-heading"><h3>Little landmarks</h3><button class="icon-button" data-action="add-note" aria-label="Add a pencil note">${icon('plus')}</button></div><p>The moments you’d circle in pencil.</p>${state.milestones.map(m => `<button class="landmark-item" data-note="${escape(m.id)}">${icon('pencil')}<span><strong>${escape(m.title)}</strong><small>${formatDate(m.date)}</small></span>${icon('arrow-up-right')}</button>`).join('')}${!state.milestones.length ? `<button class="link-button" data-action="add-note">${icon('plus')} Scribble your first little note</button>` : ''}`;
  renderMood();
  refreshIcons();
  requestAnimationFrame(renderPencilNotes);
}

function renderMood() {
  moodPanelWidth=$('#mood-panel').clientWidth;
  $('#mood-panel').innerHTML = (state.demo ? '<p class="example-tag">ILLUSTRATIVE EXAMPLE</p>' : '') + moodChartHTML((state.moods || []).filter(p=>view!=='year'||Number(p.date.slice(0,4))===focusYear),state.birthday,{milestones:state.milestones.filter(m=>view!=='year'||Number(m.date.slice(0,4))===focusYear),period:moodPeriod,selected:selectedMood,chartWidth:Math.max(300,moodPanelWidth-(window.innerWidth<=760?38:64))});
  if ($('#mood-point')) $('#mood-point').onchange = event => { selectedMood=event.target.value; renderMood(); };
}

function renderPencilNotes() {
  const layer = $('#pencil-notes');
  if (!layer) return;
  layer.innerHTML = '';
  layer.hidden = !showPencilNotes;
  const toggle = $('[data-action="toggle-notes"]');
  toggle?.setAttribute('aria-pressed', String(showPencilNotes));
  if (!showPencilNotes || view==='year' || !state.milestones.length) return;
  const inner = $('.calendar-inner'), bounds = inner.getBoundingClientRect();
  const width = inner.clientWidth, height = inner.clientHeight;
  layer.setAttribute('viewBox', `0 0 ${width} ${height}`);
  layer.setAttribute('width', width); layer.setAttribute('height', height);
  const all = state.milestones.filter(m => m.source !== 'ai' || m.dateVerified).sort((a,b) => (b.id === selectedMilestone ? 1 : 0)-(a.id === selectedMilestone ? 1 : 0) || (b.importance || 4)-(a.importance || 4) || a.date.localeCompare(b.date));
  const featured = [];
  for (const item of all) {
    const itemWeek = calendar.weeks[Math.floor((dateValue(item.date)-dateValue(state.birthday))/WEEK)];
    if (!itemWeek || featured.some(m => Math.abs(dateValue(m.date)-dateValue(item.date)) < 2*365*DAY)) continue;
    featured.push(item); if (featured.length === 3) break;
  }
  const boxes = [];
  const parts = [];
  for (const milestone of all) {
    const index = Math.floor((dateValue(milestone.date) - dateValue(state.birthday)) / WEEK);
    const square = $(`[data-week="${index}"]`);
    if (!square) continue;
    const rect = square.getBoundingClientRect();
    const x = rect.left - bounds.left + rect.width / 2, y = rect.top - bounds.top + rect.height / 2;
    const radius = Math.max(4, rect.width * .8);
    parts.push(`<ellipse cx="${x}" cy="${y}" rx="${radius}" ry="${radius * .85}" fill="none" stroke="#737567" stroke-width="1.2" transform="rotate(-13 ${x} ${y})"/>`);
    
    if (!featured.includes(milestone)) continue;
    const fontSize = width < 650 ? 21 : 25;
    const limit = width < 650 ? 30 : 43;
    const caption = milestone.title.length > limit ? milestone.title.slice(0, limit - 1).trimEnd() + '…' : milestone.title;
    const textWidth = Math.min(width - 55, caption.length * fontSize * .43 + 14), textHeight = fontSize + 8;
    const candidates = [[x + 34,y - 38],[x - textWidth - 35,y - 35],[x + 25,y + 20],[x - textWidth - 20,y + 24],[x - textWidth / 2,y - 63],[x - textWidth / 2,y + 47]];
    let box;
    for (const [cx,cy] of candidates) {
      const candidate = { x: Math.max(24,Math.min(cx,width - textWidth - 4)), y: Math.max(25,Math.min(cy,height - textHeight - 3)), w: textWidth, h: textHeight };
      if (!boxes.some(b => candidate.x < b.x + b.w + 8 && candidate.x + candidate.w + 8 > b.x && candidate.y < b.y + b.h + 8 && candidate.y + candidate.h + 8 > b.y)) { box = candidate; break; }
    }
    if (!box) continue;
    boxes.push(box);
    const sx = x < box.x ? box.x + 6 : x > box.x + box.w ? box.x + box.w - 6 : box.x + box.w / 2;
    const sy = y > box.y + box.h ? box.y + box.h - 3 : box.y + 4;
    const ex = x + (sx - x) / Math.max(Math.hypot(sx-x,sy-y),1) * (radius + 2), ey = y + (sy-y) / Math.max(Math.hypot(sx-x,sy-y),1) * (radius + 2);
    const controlX = (sx + ex) / 2 + 12, controlY = (sy + ey) / 2 - 11;
    const angle = Math.atan2(ey - controlY, ex - controlX), size = 5;
    const ax = ex - size * Math.cos(angle - .6), ay = ey - size * Math.sin(angle - .6), bx = ex - size * Math.cos(angle + .6), by = ey - size * Math.sin(angle + .6);
    parts.push(`<path d="M${sx} ${sy}Q${controlX} ${controlY} ${ex} ${ey}M${ax} ${ay}L${ex} ${ey} ${bx} ${by}" fill="none" stroke="#74786a" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/><g transform="rotate(-3 ${box.x+box.w/2} ${box.y+box.h/2})"><rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="4" fill="#fcfbf6" fill-opacity=".91"/><text x="${box.x+5}" y="${box.y+fontSize}" font-family="Caveat, cursive" font-size="${fontSize}" fill="#6c7161">${escape(caption)}</text><path d="M${box.x+5} ${box.y+textHeight-3}q${box.w/3} 2 ${box.w-13} -2" fill="none" stroke="#b0b49b" stroke-width=".7"/></g>`);
  }
  layer.innerHTML = parts.join('');
}

const modal = $('#modal');
let modalReturnFocus;
function openModal(title, subtitle, body, cls = '') {
  modalGeneration++;
  $('#week-tooltip').hidden = true;
  modalReturnFocus = document.activeElement;
  modal.className = cls;
  $('#modal-content').innerHTML = `<div class="modal-header"><div><span class="eyebrow">LITTLE BY LITTLE</span><h2 id="modal-title">${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ''}</div><button class="icon-button close-modal" data-action="close" aria-label="Close dialog">${icon('x')}</button></div>${body}`;
  if (!modal.open) modal.showModal();
  refreshIcons();
}
function closeModal() { if (activeAnalysis) activeAnalysis.abort(); modal.close(); modalReturnFocus?.focus(); }
modal.addEventListener('close', () => { if (activeAnalysis) activeAnalysis.abort(); });
modal.addEventListener('click', event => { if (event.target === modal) { const r = modal.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeModal(); } });

function beginPersonal() {
  analysisCheckpoint = null;
  if (state.demo) { state = { ...state, phases: [], milestones: [], moods:[], demo: false }; selected = null; }
  render(); persist();
}

function showStart(onReady) {
  openModal('Every story starts somewhere.', 'Let’s start with your birthday.', `<form id="start-form" class="modal-body"><label for="start-birthday">Your birthday</label><input type="date" id="start-birthday" required min="1900-01-01" max="${today}" value="${state.demo ? '' : state.birthday}" autofocus><p class="field-note">The example chapters will be replaced with a blank canvas for your own story.</p><button class="button primary full" type="submit">Make my map ${icon('arrow-right')}</button></form>`);
  $('#start-form').onsubmit = event => { event.preventDefault(); const date = $('#start-birthday').value; if (!validBirthday(date)) return; state.birthday = date; $('#birthday').value = date; ensureHorizon(); beginPersonal(); closeModal(); toast('A fresh page. A story all your own.'); onReady?.(); };
}

function validBirthday(value) {
  if (!Number.isFinite(dateValue(value)) || value < '1900-01-01' || value > today) { toast('Choose a birthday between 1900 and today.'); return false; }
  return true;
}
function ensureHorizon() {
  if (ageAt(state.birthday, today) >= state.years) state.years = Math.ceil((ageAt(state.birthday, today) + 1) / 10) * 10;
  if (!$$('#years option').some(o => Number(o.value) === state.years)) $('#years').add(new Option(`${state.years} years`, state.years));
  $('#years').value = state.years;
}

$('#birthday-form').onsubmit = event => {
  event.preventDefault();
  const date = $('#birthday').value;
  if (!validBirthday(date)) return;
  if (!state.demo && date !== state.birthday && [...state.phases.map(p=>p.start),...state.milestones.map(m=>m.date),...(state.moods || []).map(p=>p.date)].some(start=>start<date)) { toast('That birthday comes after an existing chapter, note, or mood entry. Choose a birthday before your story starts.'); return; }
  state.birthday = date; ensureHorizon(); beginPersonal(); toast('Your map is ready. Every week belongs to you.');
};
$('#years').onchange = event => {
  if (Number(event.target.value) <= ageAt(state.birthday, today)) { toast('Choose a canvas longer than your current age.'); event.target.value = state.years; return; }
  state.years = Number(event.target.value); render(); persist();
};

function showMoodCorrection(key) {
  const point=(state.moods || []).find(p=>moodKey(p)===key);
  if(!point) return;
  openModal('How did it feel to you?',formatDate(point.date)+' · your judgment comes first',`<form class="modal-body" id="mood-correction-form"><label for="mood-score">Your mood rating</label><select id="mood-score">${[1,2,3,4,5].map(n=>'<option value="'+n+'" '+(Math.round(point.score)===n?'selected':'')+'>'+n+' · '+moodLabel(n)+'</option>').join('')}</select><label for="mood-explanation">Your explanation</label><textarea id="mood-explanation" maxlength="400" rows="3">${escape(point.summary)}</textarea><details class="evidence"><summary>Original journal evidence</summary>${evidenceHTML(point)}</details><p class="field-note">This correction is kept when your journal is analyzed again. Save your map to keep it between visits.</p><button class="button primary full" type="submit">Save my correction</button></form>`);
  $('#mood-correction-form').onsubmit=event=>{
    event.preventDefault();
    const valid=validateMoodPoint({...point,score:Number($('#mood-score').value),summary:$('#mood-explanation').value,corrected:true,confidence:'clear'},state.birthday,today);
    if(!valid) return;
    state.moods=state.moods.map(p=>moodKey(p)===key?valid:p);render();persist();closeModal();toast('Your mood correction is saved on the map.');
  };
}

function showChapter(id, range) {
  if (state.demo) { showStart(() => showChapter()); return; }
  const phase = state.phases.find(p => p.id === id);
  const original = phase || { title: '', start: range?.start || today, end: range?.end || today, summary: '', color: 'sage' };
  openModal(phase ? 'A chapter of your life' : 'Name this little season.', 'Your story, in your own words.', `<form id="chapter-form" class="modal-body"><label for="chapter-title">Chapter title</label><input id="chapter-title" maxlength="90" value="${escape(original.title)}" placeholder="Learning to show up" required autofocus><div class="two-fields"><div><label for="chapter-start">From</label><input id="chapter-start" type="date" min="${state.birthday}" max="${today}" value="${original.start}" required></div><div><label for="chapter-end">To</label><input id="chapter-end" type="date" min="${state.birthday}" max="${today}" value="${original.end}" required></div></div><label for="chapter-summary">A few words about this time</label><textarea id="chapter-summary" rows="3" maxlength="1200" placeholder="What was this season like?">${escape(original.summary)}</textarea><fieldset class="color-picker"><legend>A color for this chapter</legend>${Object.entries(COLORS).map(([key,c]) => `<label title="${c.label}" style="--swatch:${c.fill}"><input type="radio" name="chapter-color" value="${key}" ${key === original.color ? 'checked' : ''}><span>${icon('check')}</span><span class="sr-only">${c.label}</span></label>`).join('')}</fieldset>${phase?.evidence?.length ? `<details class="evidence"><summary>From your journal · ${phase.confidence === 'tentative' ? 'tentative interpretation' : 'supporting excerpts'}</summary>${evidenceHTML(phase)}</details>` : ''}<p id="chapter-error" class="form-error" role="alert"></p><div class="modal-actions">${phase ? `<button type="button" class="button danger-quiet" data-delete="${escape(id)}">${icon('trash-2')} Remove chapter</button>` : '<span></span>'}<button class="button primary" type="submit">${phase ? 'Save chapter' : 'Add to my map'} ${icon('check')}</button></div></form>`);
  $('#chapter-form').onsubmit = event => {
    event.preventDefault();
    const value = { ...original, id: id || crypto.randomUUID(), title: $('#chapter-title').value, start: $('#chapter-start').value, end: $('#chapter-end').value, summary: $('#chapter-summary').value, color: $('input[name="chapter-color"]:checked').value };
    const valid = validatePhase({...value,originalTitle:original.originalTitle || (phase?.source==='ai' ? phase.title : ''),dateVerified:true,source:'manual'}, state.birthday, today);
    if (!valid) { $('#chapter-error').textContent = 'Use a title and valid dates between your birthday and today, with the end on or after the start.'; return; }
    if (phase) state.phases[state.phases.findIndex(p => p.id === id)] = valid; else state.phases.push(valid);
    render(); persist(); closeModal(); toast('A chapter added to your story.');
  };
}
function evidenceHTML(phase) { return phase.evidence.map(e => `<blockquote><p>“${escape(e.quote)}”</p><cite>${escape(e.date)}${e.source ? ` · ${escape(e.source)}` : ''}</cite></blockquote>`).join(''); }

function showNote(id, initialDate) {
  if (state.demo) { showStart(() => showNote()); return; }
  const note = state.milestones.find(m => m.id === id);
  const original = note || { title: '', date: initialDate || today, summary: '', evidence: [] };
  openModal(note ? 'A moment worth circling.' : 'Leave a little note.', 'A date, a few words, a little pencil mark on your map.', `<form id="note-form" class="modal-body"><label for="note-title">What happened?</label><input id="note-title" maxlength="70" value="${escape(original.title)}" placeholder="off to college!" required autofocus><label for="note-date">Circle this date</label><input id="note-date" type="date" min="${state.birthday}" max="${today}" value="${original.date}" required><label for="note-summary">A little more of the story <span class="optional-label">optional</span></label><textarea id="note-summary" maxlength="600" rows="3" placeholder="The part you want to remember.">${escape(original.summary)}</textarea>${original.evidence.length ? `<details class="evidence"><summary>The journal entry behind this note</summary>${evidenceHTML(original)}</details>` : ''}<p id="note-error" class="form-error" role="alert"></p><div class="modal-actions">${note ? `<button type="button" class="button danger-quiet" data-delete-note="${escape(note.id)}">${icon('trash-2')} Erase this note</button>` : '<span></span>'}<button class="button primary" type="submit">Pencil it in ${icon('pencil')}</button></div></form>`);
  $('#note-form').onsubmit = event => {
    event.preventDefault();
    const next = validateMilestone({ ...original, originalTitle:original.originalTitle || (original.source==='ai'?original.title:''), id: id || crypto.randomUUID(), source:'manual', dateVerified:true, title: $('#note-title').value, date: $('#note-date').value, summary: $('#note-summary').value }, state.birthday, today);
    if (!next) { $('#note-error').textContent = 'Give this moment a title and a date between your birthday and today.'; return; }
    if (note) state.milestones[state.milestones.findIndex(m => m.id === id)] = next; else state.milestones.push(next);
    selectedMilestone = next.id; showPencilNotes = true; render(); persist(); closeModal(); toast('A little pencil mark. A moment remembered.');
  };
}

function weekMilestonesHTML(week) {
  return state.milestones.filter(m => dateValue(m.date) >= week.start && dateValue(m.date) < week.end).map(m => `<article class="week-milestone">${icon('pencil')}<div><h3>${escape(m.title)}</h3><small>${formatDate(m.date)}</small><p>${escape(m.summary)}</p><button class="link-button" data-note="${escape(m.id)}">Open this pencil note ${icon('arrow-right')}</button></div></article>`).join('');
}

function milestoneReviewHTML() {
  if (!draftMilestones.length) return '';
  return `<div class="review-milestone-heading">${icon('pencil')}<h3>A few moments to circle</h3><p>Little landmarks for the weeks where something changed.</p></div>${draftMilestones.map((m,i) => `<article class="review-card milestone-review"><label class="checkbox-label"><input type="checkbox" data-event-draft="${i}" checked><span><strong>Add this pencil note</strong><small>Check its date against the excerpt below.</small></span></label><label for="event-title-${i}" class="sr-only">Pencil note ${i+1}</label><input id="event-title-${i}" maxlength="70" value="${escape(m.title)}"><label for="event-date-${i}">Date to circle</label><input id="event-date-${i}" type="date" min="${state.birthday}" max="${today}" value="${m.date}"><label for="event-summary-${i}" class="sr-only">Note description ${i+1}</label><textarea id="event-summary-${i}" maxlength="600" rows="2">${escape(m.summary)}</textarea><details class="evidence"><summary>Read the journal entry behind this note</summary>${evidenceHTML(m)}</details></article>`).join('')}`;
}

function showWeek(index) {
  const week = calendar.weeks[index];
  if (!week) return;
  const end = week.end - DAY;
  openModal(week.current ? 'This little week is yours.' : week.lived ? 'One week of your story.' : 'A page still unwritten.', `${formatDate(week.start)} — ${formatDate(end)} · age ${week.age}`, `<div class="modal-body"><div class="week-detail-number"><span class="legend-square ${week.lived ? 'lived' : 'future'}"></span> WEEK ${(week.index + 1).toLocaleString()} ${week.current ? '<span class="example-tag">YOU ARE HERE</span>' : ''}</div>${weekMilestonesHTML(week)}${week.phases.length ? week.phases.map(p => `<article class="week-phase" style="--chapter-color:${COLORS[p.color].fill}"><span class="color-scribble"></span><h3>${escape(p.title)}</h3><p>${escape(p.summary)}</p><button class="link-button" data-edit="${escape(p.id)}">Open this chapter ${icon('arrow-right')}</button></article>`).join('') : `<p class="week-reflection">${week.lived ? 'There doesn’t need to be a grand story here. An ordinary week is a life being lived, too.' : 'There’s room here for people you haven’t met, places you haven’t been, and versions of you that are still becoming.'}</p>`}${week.lived ? `<button class="button outline full" data-week-add="${index}">${icon('plus')} Add a chapter around this week</button><button class="button pencil-button full" data-week-note="${index}">${icon('pencil')} Circle a moment in pencil</button>` : ''}</div>`);
}

function showConnection(returnToJournal = false) {
  const presetsHTML = provider => `${MODEL_PRESETS[provider].map(m => `<option value="${m.id}">${m.label}</option>`).join('')}<option value="custom">Custom model name…</option>`;
  openModal('A little help finding patterns.', 'Choose the model and reasoning depth for your journal.', `<form class="modal-body" id="connection-form"><label for="provider">AI provider</label><select id="provider">${Object.entries(PROVIDERS).map(([id,p]) => `<option value="${id}" ${id === connection.provider ? 'selected' : ''}>${p.name}</option>`).join('')}</select><div id="custom-base-field" ${connection.provider === 'custom' ? '' : 'hidden'}><label for="api-base">API base URL</label><input id="api-base" type="url" value="${escape(connection.base)}" placeholder="https://api.example.com/v1"><p class="field-note">Your journal and key go directly to this endpoint, which must allow browser requests.</p></div><label for="model-choice">Model</label><select id="model-choice">${presetsHTML(connection.provider)}</select><div id="custom-model-field"><label for="api-model">Custom model name</label><input id="api-model" required value="${escape(connection.model)}" placeholder="Model ID from your provider"></div><label for="reasoning-effort">Reasoning depth</label><select id="reasoning-effort"><option value="none">Off · faster</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High · more careful analysis</option><option value="max">Maximum · slower</option></select><p class="field-note" id="model-help">Deeper reasoning and larger models may cost more and take longer. Model access depends on your API account.</p><label for="api-key">API key <span class="optional-label">kept in memory only</span></label><div class="key-field"><input id="api-key" type="password" autocomplete="off" spellcheck="false" value="${escape(connection.key)}" placeholder="Paste your own API key"><button type="button" class="icon-button" id="toggle-key" aria-label="Show API key">${icon('eye')}</button></div><section id="deepseek-key-pool" class="deepseek-key-pool" hidden><label>Additional DeepSeek keys <span class="optional-label">optional · memory only</span></label><div id="extra-key-rows"></div><button type="button" class="link-button" id="add-deepseek-key">+ Add another key</button><label for="deepseek-concurrency">Sections at once</label><select id="deepseek-concurrency"><option value="auto">Auto · 4 per key, up to 12 total</option><option value="4">4 sections</option><option value="8">8 sections</option><option value="12">12 sections</option></select><p class="field-note">A single key can also run 8 or 12 sections. DeepSeek limits concurrency per account; additional keys from the same account do not increase that limit.</p><a class="provider-link" href="https://api-docs.deepseek.com/quick_start/rate_limit/" target="_blank" rel="noopener noreferrer">DeepSeek concurrency limits ↗</a></section><a id="key-link" class="provider-link" target="_blank" rel="noopener noreferrer" href="${PROVIDERS[connection.provider].keyUrl || '#'}" ${connection.provider === 'custom' ? 'hidden' : ''}>Get a key from ${PROVIDERS[connection.provider].name} ${icon('arrow-up-right')}</a><div class="privacy-note">${icon('shield-check')}<p>Your API key is never saved to disk or included in a map download. ChatGPT subscriptions and API billing are separate; use an OpenAI API key for OpenAI models.</p></div><p id="connection-error" class="form-error" role="alert"></p><button class="button primary full" type="submit">Use this connection ${icon('check')}</button></form>`);
  let extraKeys=[...(connection.keys || [])];
  const renderExtraKeys = () => {
    $('#deepseek-key-pool').hidden=$('#provider').value !== 'deepseek';
    $('#extra-key-rows').innerHTML=extraKeys.map((value,i)=>'<div class="extra-key-row"><input type="password" autocomplete="off" spellcheck="false" aria-label="Additional DeepSeek key '+(i+1)+'" data-extra-key="'+i+'" value="'+escape(value)+'" placeholder="Paste another DeepSeek key"><button type="button" class="icon-button" data-remove-key="'+i+'" aria-label="Remove additional key '+(i+1)+'">×</button></div>').join('');
    for(const input of $$('[data-extra-key]')) input.oninput=()=>{extraKeys[Number(input.dataset.extraKey)]=input.value;};
    for(const button of $$('[data-remove-key]')) button.onclick=()=>{extraKeys.splice(Number(button.dataset.removeKey),1);renderExtraKeys();};
    $('#add-deepseek-key').disabled=extraKeys.length>=3;
  };
  $('#deepseek-concurrency').value=String(connection.concurrency || 'auto');
  $('#add-deepseek-key').onclick=()=>{if(extraKeys.length<3){extraKeys.push('');renderExtraKeys();$('[data-extra-key="'+(extraKeys.length-1)+'"]').focus();}};
  renderExtraKeys();
  $('#model-choice').value = MODEL_PRESETS[connection.provider].some(m => m.id === connection.model) ? connection.model : 'custom';
  $('#reasoning-effort').value = connection.effort || 'high';
  const updateModel = () => {
    const custom = $('#model-choice').value === 'custom';
    $('#custom-model-field').hidden = !custom;
    if (!custom) $('#api-model').value = $('#model-choice').value;
    const legacy = /^(?:gpt-4|chatgpt-4)/.test($('#api-model').value);
    const effort = $('#reasoning-effort').value;
    const levels = reasoningLevels($('#provider').value,$('#api-model').value);
    $('#reasoning-effort').innerHTML = levels.length ? levels.map(level => `<option value="${level}">${({none:'Off · faster',low:'Low',medium:'Medium',high:'High · careful analysis',xhigh:'Very high · slower',max:'Maximum · slower'})[level]}</option>`).join('') : '<option value="high">Provider default</option>';
    $('#reasoning-effort').value = levels.includes(effort) ? effort : 'high';
    $('#reasoning-effort').disabled = !levels.length;
    if (legacy) $('#model-help').textContent = 'This model does not use a reasoning-depth setting. Choose a GPT-6 model for more careful analysis.';
    else $('#model-help').textContent = 'Deeper reasoning and larger models may cost more and take longer. Model access depends on your API account.';
  };
  updateModel();
  $('#model-choice').onchange = updateModel;
  $('#api-model').oninput = updateModel;
  $('#provider').onchange = event => {
    const p = PROVIDERS[event.target.value];
    $('#model-choice').innerHTML = presetsHTML(event.target.value);
    $('#model-choice').value = p.model || 'custom'; $('#api-model').value = p.model;
    extraKeys=[]; renderExtraKeys();
    $('#api-base').value = p.base; $('#api-key').value = ''; $('#reasoning-effort').value = 'high';
    $('#custom-base-field').hidden = event.target.value !== 'custom';
    $('#key-link').hidden = event.target.value === 'custom'; $('#key-link').href = p.keyUrl || '#';
    $('#key-link').innerHTML = `Get a key from ${p.name} ${icon('arrow-up-right')}`;
    updateModel(); refreshIcons();
  };
  $('#toggle-key').onclick = () => { const input = $('#api-key'); input.type = input.type === 'password' ? 'text' : 'password'; $('#toggle-key').setAttribute('aria-label', input.type === 'password' ? 'Show API key' : 'Hide API key'); $('#toggle-key').innerHTML = icon(input.type === 'password' ? 'eye' : 'eye-off'); refreshIcons(); };
  $('#connection-form').onsubmit = event => {
    event.preventDefault(); const provider = $('#provider').value;
    try {
      const base = validateEndpoint(provider === 'custom' ? $('#api-base').value : PROVIDERS[provider].base);
      const key = $('#api-key').value.trim(), model = $('#api-model').value.trim(), effort = $('#reasoning-effort').value;
      const keys=provider === 'deepseek' ? [...new Set(extraKeys.map(k=>k.trim()).filter(k=>k && k!==key))] : [];
      const concurrency=provider === 'deepseek' ? $('#deepseek-concurrency').value : 'auto';
      if (!key && !keys.length && provider !== 'custom') throw new Error('Paste an API key for your selected provider.');
      if (!model) throw new Error('Choose a model or enter its API model name.');
      if (provider !== connection.provider || base !== connection.base || model !== connection.model || effort !== connection.effort) analysisCheckpoint = null;
      connection = { provider,base,model,effort,key,keys,concurrency };
      if (returnToJournal) showJournal(); else closeModal();
      toast('Connection kept for this tab. It will be forgotten on reload.');
    } catch(error) { $('#connection-error').textContent = error.message; }
  };
}

function showJournal() {
  const keyCount=new Set([connection.key,...(connection.keys || [])].filter(Boolean)).size;
  if (state.demo) { showStart(showJournal); return; }
  openModal('Your words hold a whole world.', 'Bring your journals. We’ll help you find the chapters.', `<div class="modal-body"><label for="import-mode">When importing files</label><select id="import-mode"><option value="replace">Replace the text below (re-import an updated journal)</option><option value="append">Append to the text below (add another journal)</option></select><div class="drop-zone" id="drop-zone"><input type="file" id="journal-files" accept="${ACCEPT}" multiple class="sr-only"><label for="journal-files">${icon('upload')}<strong>Drop your journals here</strong><span>or <u>choose files</u> from your device</span><small>Markdown, text, Word, PDF, ODT, HTML · up to 50 MB per file</small></label></div><p class="field-note">Google Docs: File → Download → Word (.docx). Scanned PDFs need OCR first. Keep dates in your entries or filenames. Long journals, including 100,000+ words, are read in manageable sections.</p><div class="journal-preview-header"><label for="journal-text">Or paste your journal below</label><button class="link-button" id="clear-journal">Clear text</button></div><textarea id="journal-text" rows="7" maxlength="${MAX_JOURNAL}" placeholder="# 2025-01-12\nI said yes to coffee today, even though I was nervous…\n\n# 2025-03-24\nStill practicing starting conversations. It’s getting a little easier.">${escape(journal)}</textarea><div class="journal-count" id="journal-count"></div><section class="chronology-preview"><div class="chronology-preview-heading"><h3>Check the timeline</h3><div><label for="journal-ending-year">Year of the last entry</label><input id="journal-ending-year" type="number" min="1900" max="${today.slice(0,4)}" value="${journalEndingYear || ''}" placeholder="Auto"></div></div><div id="chronology-summary"></div><details id="date-preview"><summary>Inspect the resolved entry dates</summary><div id="date-preview-rows"></div></details></section><label class="checkbox-label update-mode"><input id="full-analysis" type="checkbox"><span>Re-analyze every entry<small>Leave off to analyze only new or changed entries. Your corrections are preserved.</small></span></label><div id="update-preview" class="field-note" role="status"></div><div id="resume-status" class="resume-status" hidden></div><button class="connection-summary" data-action="connection">${icon('sparkles')}<span><strong>${PROVIDERS[connection.provider].name}</strong><small>${connection.key || connection.keys?.length || connection.provider === 'custom' ? escape(connection.model)+(connection.provider === 'deepseek' ? ' · '+keyCount+' key'+(keyCount===1?'':'s') : '') : 'Add your API key to get started'}</small></span>${icon('chevron-right')}</button><div class="send-disclosure"><label class="checkbox-label"><input id="send-consent" type="checkbox"><span>I’m ready to send this journal to <strong>${escape(new URL(connection.base || 'https://example.com').hostname)}</strong> for analysis.</span></label><p>You’ll review every suggested chapter before adding it. Journals and keys stay in this tab’s memory; closing this tab or reloading clears them. Your provider’s data policies and API charges apply.</p></div><p id="journal-error" class="form-error" role="alert"></p><div id="analysis-progress" class="analysis-progress" role="status" aria-live="polite" hidden></div><div class="modal-actions"><button class="button outline" id="cancel-analysis" hidden>Pause reading</button><span id="analysis-subnote">Your life is yours to interpret.</span><button class="button primary" id="analyze-button">${icon('sparkles')} Find my chapters</button></div></div>`, 'journal-modal');
  $('#full-analysis').checked=fullAnalysisPreference;
  const updateCount = () => {
    const nextText = $('#journal-text').value;
    if (nextText !== journal) analysisCheckpoint = null;
    journal = nextText;
    journalPlan = journal.trim() ? prepareJournal(journal,{today,endingYear:journalEndingYear}) : null;
    const requests = journalPlan?.sections.length || 0;
    renderDatePreview();
    const words = journal.trim() ? journal.trim().split(/\s+/u).length : 0;
    $('#journal-count').textContent = `${words.toLocaleString()} words · ${journal.length.toLocaleString()} / ${MAX_JOURNAL.toLocaleString()} characters · ${requests} section${requests === 1 ? '' : 's'}`;
    refreshUpdatePreview();
    updateAnalysisControls();
  };
  $('#full-analysis').onchange=()=>{fullAnalysisPreference=$('#full-analysis').checked;analysisCheckpoint=null;refreshUpdatePreview();};
  updateCount();
  $('#journal-text').oninput = updateCount;
  $('#journal-ending-year').onchange = () => { journalEndingYear = Number($('#journal-ending-year').value) || undefined; analysisCheckpoint = null; updateCount(); };
  $('#clear-journal').onclick = () => { $('#journal-text').value = ''; updateCount(); };
  $('#journal-files').onchange = event => addFiles([...event.target.files], updateCount);
  const drop = $('#drop-zone');
  for (const name of ['dragenter', 'dragover']) drop.addEventListener(name, event => { event.preventDefault(); drop.classList.add('dragover'); });
  for (const name of ['dragleave', 'drop']) drop.addEventListener(name, event => { event.preventDefault(); drop.classList.remove('dragover'); });
  drop.addEventListener('drop', event => addFiles([...event.dataTransfer.files], updateCount));
  $('#analyze-button').onclick = startAnalysis;
  $('#cancel-analysis').onclick = () => activeAnalysis?.abort();
}

async function refreshUpdatePreview() {
  const token=++updatePreviewToken;
  if(!journalPlan || journalPlan.errors.length) { updatePlan=null; $('#update-preview').textContent=''; return; }
  const plan=await planUpdate(journalPlan,state.analysisHistory,{full:$('#full-analysis').checked});
  if(token!==updatePreviewToken || !$('#update-preview')) return;
  updatePlan=plan;
  $('#update-preview').textContent=plan.changed.length+' new or changed entries · '+plan.unchanged+' unchanged entries skipped · '+plan.sections.length+' requests. Entry fingerprints stay with your saved map; full journal text stays in this tab.';
  updateAnalysisControls();
}

function renderDatePreview() {
  const summary = $('#chronology-summary'), rows = $('#date-preview-rows');
  if (!summary || !rows) return;
  if (!journalPlan) { summary.innerHTML = '<p>Import or paste a journal to see its date range before sending it.</p>'; rows.innerHTML = ''; return; }
  $('#journal-ending-year').placeholder = String(journalPlan.endingYear || 'Auto');
  $('#journal-ending-year').disabled = !!journalPlan.anchored;
  summary.innerHTML = journalPlan.errors.length ? `<p class="form-error">${escape(journalPlan.errors.join(' '))}</p>` : `<strong>${journalPlan.entries.length} dated entries · ${formatDate(journalPlan.firstDate)} — ${formatDate(journalPlan.lastDate)}</strong><p>${journalPlan.inferred ? `${journalPlan.inferred} entry years inferred in chronological order · ${journalPlan.rollovers} year rollover${journalPlan.rollovers === 1 ? '' : 's'}.` : 'The entry years are written in your journal.'} ${escape(journalPlan.warnings.join(' '))}</p>`;
  rows.innerHTML = `<table><thead><tr><th>Journal heading</th><th>Resolved date</th></tr></thead><tbody>${journalPlan.entries.map(e => `<tr><td>${escape(e.originalHeading)}</td><td>${e.date}${e.inferred ? ' *' : ''}</td></tr>`).join('')}</tbody></table><p>* Year inferred from the chronological sequence.</p>`;
}

function updateAnalysisControls() {
  if (!$('#analyze-button') || activeAnalysis) return;
  const cp = analysisCheckpoint;
  const complete = cp && cp.completed === cp.total;
  $('#analyze-button').innerHTML = `${icon(complete ? 'check' : 'sparkles')} ${complete ? 'Review my chapters' : cp?.completed ? 'Continue reading' : 'Find my chapters'}`;
  $('#resume-status').hidden = !cp?.completed;
  if (cp?.completed) {
    $('#resume-status').innerHTML = `<span>${icon('check')} ${cp.completed} of ${cp.total} sections read. ${complete ? 'Ready to review.' : 'You can continue without rereading completed sections.'}</span><small>Progress stays in this tab. Reloading clears it.</small><div><button class="link-button" id="review-partial">Review completed sections</button><button class="link-button" id="reset-analysis">Start over</button></div>`;
    $('#review-partial').onclick = () => {
      draftManifest=cp.manifest || []; const ready=new Set(draftManifest.map(e=>e.key));
      const supported=p=>p.evidence?.every(e=>!e.entryKey || ready.has(e.entryKey));
      drafts=mergeSuggestions(cp.phases.filter(supported)); draftMilestones=curateMilestones((cp.milestones || []).filter(supported)); draftMoods=mergeMoods((cp.moods || []).filter(p=>!p.entryKey||ready.has(p.entryKey)));
      draftRejected=cp.rejected; showReview();
    };
    $('#reset-analysis').onclick = () => { analysisCheckpoint = null; updateAnalysisControls(); toast('Analysis progress cleared. Your journal and map are still here.'); };
  }
  refreshIcons();
}

async function addFiles(files, updateCount) {
  if (readingFiles || activeAnalysis) return;
  readingFiles = true;
  const generation = modalGeneration;
  $('#journal-files').disabled = true;
  $('#analyze-button').disabled = true;
  $('.connection-summary').disabled = true;
  $('#clear-journal').disabled = true;
  $('#full-analysis').disabled=true;
  $('#journal-ending-year').disabled=true;
  $('#import-mode').disabled=true;
  $('#journal-error').textContent = '';
  const errors = [], parts = [];
  toast('Reading your journals on this device…');
  for (const file of files) {
    try { parts.push(await readJournal(file)); }
    catch (error) { errors.push(`${file.name}: ${error.message}`); }
  }
  // The user may have closed the dialog while a large document was being read.
  if ($('#journal-text') && generation === modalGeneration && modal.open) {
    const combined = [$('#import-mode').value==='append'?$('#journal-text').value:'', ...parts].filter(Boolean).join('\n\n');
    if (combined.length > MAX_JOURNAL) errors.push('These documents exceed 5 million characters together. No new text was added. Import a smaller selection.');
    else if(parts.length) { $('#journal-text').value = combined; updateCount(); }
    $('#journal-error').textContent = errors.join(' ');
    $('#journal-files').disabled = false; $('#journal-files').value = ''; $('#analyze-button').disabled = false; $('.connection-summary').disabled = false; $('#clear-journal').disabled = false; $('#full-analysis').disabled=false; $('#import-mode').disabled=false; $('#journal-ending-year').disabled=!!journalPlan?.anchored;
  }
  readingFiles = false;
  if (!errors.length && parts.length) toast(`${parts.length} journal${parts.length === 1 ? '' : 's'} added. Take a look before sending.`);
}

async function startAnalysis() {
  journal = $('#journal-text').value;
  $('#journal-error').textContent = '';
  if (!journal.trim()) { $('#journal-error').textContent = 'Add a journal or paste some entries first.'; return; }
  journalPlan = prepareJournal(journal,{today,endingYear:journalEndingYear});
  if (journalPlan.errors.length) { $('#journal-error').textContent = journalPlan.errors.join(' '); return; }
  const fullAnalysis=$('#full-analysis').checked;
  const pendingPlan=await planUpdate(journalPlan,state.analysisHistory,{full:fullAnalysis});
  if(!pendingPlan.changed.length){toast('Your map is up to date. No new or changed entries to analyze.'); return;}
  draftFull=fullAnalysis;
  if (!connection.key && !connection.keys?.length && connection.provider !== 'custom') { showConnection(true); return; }
  const hasCompleteAnalysis = analysisCheckpoint && analysisCheckpoint.completed === analysisCheckpoint.total;
  if (!hasCompleteAnalysis && !$('#send-consent').checked) { $('#journal-error').textContent = 'Check the box above when you’re ready to send this journal to your provider.'; return; }
  activeAnalysis = new AbortController();
  const controller = activeAnalysis;
  const generation = modalGeneration;
  $('#analyze-button').disabled = true;
  $('#journal-text').readOnly = true;
  $('#journal-files').disabled = true;
  $('#clear-journal').disabled = true;
  $('#full-analysis').disabled=true;
  $('#journal-ending-year').disabled=true;
  $('#import-mode').disabled=true;
  $('.connection-summary').disabled = true;
  $('#cancel-analysis').hidden = false; $('#analysis-subnote').hidden = true;
  $('#analysis-progress').hidden = false;
  $('#resume-status').hidden = true;
  try {
    const result = await analyzeJournal({ text: journal, ...connection, history:state.analysisHistory,fullAnalysis, birthday: state.birthday, today, endingYear:journalEndingYear, signal: controller.signal,
      checkpoint: analysisCheckpoint, onCheckpoint: cp => { if (!controller.signal.aborted) analysisCheckpoint = cp; },
      onProgress: (n, total, progress) => {
        if ($('#analysis-progress') && generation === modalGeneration && modal.open) {
          $('#analysis-progress').innerHTML = `<div>${icon('loader-circle', 'spin')} ${progress.active ? `Reading ${progress.active} section${progress.active === 1 ? '' : 's'} at once` : 'Finishing analysis'}<strong>${Math.round(progress.completed / total * 100)}%</strong></div><progress max="${total}" value="${progress.completed}" aria-label="Journal analysis progress"></progress><small>${progress.completed} of ${total} sections complete · progress kept in this tab.<br>Keep this tab open; you can pause and continue.</small>`;
          refreshIcons();
        }
      }
    });
    if (controller.signal.aborted || !modal.open) return;
    drafts = result.phases; draftMilestones = result.milestones; draftMoods = result.moods; draftManifest=result.manifest || []; draftRejected = result.rejected;
    activeAnalysis = null;
    showReview();
  } catch (error) {
    if ($('#journal-error') && generation === modalGeneration && modal.open) $('#journal-error').textContent = error.name === 'AbortError' ? 'Reading paused. Completed sections are kept in this tab. Continue when you’re ready; interrupted requests may still be billed by your provider.' : `${error.message} Completed sections are kept in this tab; continue to retry the remaining sections. No chapters were changed.`;
  } finally {
    if (activeAnalysis === controller) activeAnalysis = null;
    if ($('#analyze-button') && generation === modalGeneration) { $('#analyze-button').disabled = false; $('#journal-text').readOnly = false; $('#journal-files').disabled = false; $('#clear-journal').disabled = false; $('#full-analysis').disabled=false; $('#import-mode').disabled=false; $('#journal-ending-year').disabled=!!journalPlan?.anchored; $('.connection-summary').disabled = false; $('#cancel-analysis').hidden = true; $('#analysis-progress').hidden = true; $('#analysis-subnote').hidden = false; updateAnalysisControls(); }
  }
}

function moodReviewHTML() {
  if (!draftMoods.length) return '<p class="field-note">No mood estimates with supporting entry quotes were found. Unwritten or ambiguous periods stay blank.</p>';
  return '<section class="mood-review"><label class="checkbox-label"><input id="include-moods" type="checkbox" checked><span><strong>Include the mood graph</strong><small>'+draftMoods.length+' dated entry estimates · '+formatDate(draftMoods[0].date)+' — '+formatDate(draftMoods.at(-1).date)+'</small></span></label><p class="field-note">An estimate of the feelings expressed in your writing, on a 1–5 scale. Not a diagnosis or a record of unwritten days.</p><details><summary>Review mood estimates and supporting excerpts</summary><div class="mood-review-list">'+draftMoods.map((p,i)=>'<article><label class="checkbox-label"><input type="checkbox" data-mood-draft="'+i+'" checked><span>Include this entry</span></label><strong>'+formatDate(p.date)+' · '+moodLabel(p.score)+' · '+p.score.toFixed(1)+'/5</strong><p>'+escape(p.summary)+'</p>'+p.evidence.map(e=>'<blockquote>'+escape(e.quote)+'</blockquote>').join('')+'</article>').join('')+'</div></details></section>';
}

function showReview() {
  openModal('Does this feel like your story?', 'These are suggestions. You have the final word.', `<div class="modal-body"><div class="review-note">${icon('sparkles')}<p>${drafts.length || draftMilestones.length || draftMoods.length || draftManifest.length ? 'Choose the chapters, pencil notes, and mood estimates that resonate. Edit chapter titles and dates, review the supporting excerpts, then add your selections.' : 'No chapters with verifiable dated evidence were found. Try entries with clear dates and repeated themes, or write a chapter yourself.'}${draftRejected ? ` ${draftRejected} suggestion${draftRejected === 1 ? ' was' : 's were'} left out because the dates or quotations couldn’t be verified.` : ''}</p></div><p class="field-note">${draftManifest.length} entries processed. Only affected AI results will be refreshed; your manual corrections stay.</p><div class="review-list">${drafts.map((p, i) => `<article class="review-card" style="--chapter-color:${COLORS[p.color].fill}"><label class="checkbox-label"><input type="checkbox" data-draft="${i}" checked><span><strong>Include this chapter</strong><small>${p.confidence === 'tentative' ? 'Tentative · check the dates carefully' : 'Supported by journal excerpts'}</small></span></label><label class="sr-only" for="draft-title-${i}">Chapter title ${i + 1}</label><input id="draft-title-${i}" value="${escape(p.title)}" maxlength="90"><div class="two-fields"><div><label for="draft-start-${i}">From</label><input id="draft-start-${i}" type="date" min="${state.birthday}" max="${today}" value="${p.start}"></div><div><label for="draft-end-${i}">To</label><input id="draft-end-${i}" type="date" min="${state.birthday}" max="${today}" value="${p.end}"></div></div><label class="sr-only" for="draft-summary-${i}">Chapter description ${i + 1}</label><textarea id="draft-summary-${i}" rows="2">${escape(p.summary)}</textarea><details class="evidence"><summary>Read the supporting excerpts</summary>${evidenceHTML(p)}</details></article>`).join('')}</div>${milestoneReviewHTML()}${moodReviewHTML()}<p id="review-error" class="form-error" role="alert"></p><div class="modal-actions"><button class="button outline" data-action="journal">Back to journal</button>${drafts.length || draftMilestones.length || draftMoods.length || draftManifest.length ? `<button class="button primary" id="apply-drafts">Add selected to my map ${icon('check')}</button>` : `<button class="button primary" data-action="add">Write my own chapter ${icon('plus')}</button>`}</div><p class="field-note">AI interpretations may be incomplete. Verify dates against your journal. Nothing is a diagnosis.</p></div>`, 'journal-modal');
  if ($('#apply-drafts')) $('#apply-drafts').onclick = () => {
    const chosen = [];
    for (let i = 0; i < drafts.length; i++) {
      if (!$(`[data-draft="${i}"]`).checked) continue;
      const phase = validatePhase({ ...drafts[i], title: $(`#draft-title-${i}`).value, start: $(`#draft-start-${i}`).value, end: $(`#draft-end-${i}`).value, summary: $(`#draft-summary-${i}`).value }, state.birthday, today);
      if (!phase) { $('#review-error').textContent = `Check chapter ${i + 1}: use a title and dates between your birthday and today, with the end after the start.`; return; }
      if(phase.title!==drafts[i].title || phase.start!==drafts[i].start || phase.end!==drafts[i].end || phase.summary!==drafts[i].summary){phase.originalTitle=drafts[i].title;phase.source='manual';}
      chosen.push(phase);
    }
    const chosenMilestones = [];
    for (let i = 0; i < draftMilestones.length; i++) {
      if (!$(`[data-event-draft="${i}"]`).checked) continue;
      const event = validateMilestone({ ...draftMilestones[i], title: $(`#event-title-${i}`).value, date: $(`#event-date-${i}`).value, summary: $(`#event-summary-${i}`).value }, state.birthday, today);
      if (!event) { $('#review-error').textContent = `Check pencil note ${i + 1}: use a title and a date between your birthday and today.`; return; }
      if(event.title!==draftMilestones[i].title || event.date!==draftMilestones[i].date || event.summary!==draftMilestones[i].summary){event.originalTitle=draftMilestones[i].title;event.source='manual';}
      chosenMilestones.push(event);
    }
    const chosenMoods = $('#include-moods')?.checked ? draftMoods.filter((p,i)=>$('[data-mood-draft="'+i+'"]').checked) : [];
    if (!chosen.length && !chosenMilestones.length && !chosenMoods.length && !draftManifest.length) { $('#review-error').textContent = 'Choose a chapter, pencil note, or the mood estimates to add.'; return; }
    state=applyUpdate(state,{phases:chosen,milestones:chosenMilestones,moods:chosenMoods,manifest:draftManifest},{full:draftFull});
    state.phases=mergeSuggestions(state.phases); state.milestones=mergeMilestones(state.milestones); state.moods=mergeMoods(state.moods);
    analysisCheckpoint=null; selected=null; render(); persist(); closeModal();
    toast('Map updated. Your corrections were kept, and '+draftManifest.length+' entries are now remembered.');

  };
}

function showPrivacy() {
  openModal('A private little space.', 'A few things worth knowing about your words.', `<div class="modal-body prose"><p><strong>Your map lives on your device.</strong> This is a static website. There’s no account, shared database, or analytics. Only entry fingerprints (not full text) are kept with your map to recognize journal updates. Journals are read locally and only sent to the AI endpoint you choose when you ask for an analysis.</p><p><strong>Your key stays in this tab’s memory.</strong> It is never saved to browser storage or exported. Refreshing clears it. This is a browser-based tool: only enter your own key on a copy of the site you trust.</p><p><strong>Your journal is temporary.</strong> Journal text is kept in memory while the tab is open. Supporting excerpts that you approve become part of a chapter or mood estimate, so they appear in downloaded maps and in browser storage if you turn saving on.</p><p><strong>Your provider handles analysis.</strong> Its privacy policy, retention rules, and API charges apply. OpenAI requests include <code>store: false</code>; that does not override the provider’s other retention policies.</p><label class="checkbox-label remember-control"><input type="checkbox" id="remember-map" ${remember ? 'checked' : ''}><span><strong>Remember my map on this browser</strong><small>Saves birthday, chapters, mood estimates, entry fingerprints, and approved excerpts in local storage. Anyone using this browser profile can access them.</small></span></label><div class="privacy-actions"><button class="button outline" data-action="import-backup">${icon('upload')} Restore a saved map</button><button class="button danger-quiet" data-action="clear-data">${icon('trash-2')} Clear my data</button></div><p class="field-note">Browser saving is optional. Download a map to keep a portable copy without saving it in this browser.</p></div>`);
  $('#remember-map').onchange = event => { remember = event.target.checked; persist(); toast(remember ? 'Your map will be remembered in this browser.' : 'Browser saving is off. The saved copy has been removed.'); };
}

function showHow() {
  openModal('A little perspective goes a long way.', 'A simple way to see the shape of your life.', `<div class="modal-body how-steps"><div><span>01</span><section><h3>Start with your birthday.</h3><p>Each square is a real seven-day week, starting on the day you were born. Your lived weeks are filled; this week gets a little outline.</p></section></div><div><span>02</span><section><h3>Find your chapters.</h3><p>Add them by hand, or import dated journals and connect your own OpenAI, DeepSeek, or compatible API key. You choose when your words are sent.</p></section></div><div><span>03</span><section><h3>Make the story yours.</h3><p>Review the AI’s suggestions, check the excerpts, and adjust the dates. A season can be hard and hopeful at once; overlapping chapters share their colors.</p></section></div><div><span>04</span><section><h3>Come back with a little kindness.</h3><p>The empty squares aren’t a deadline. The canvas length is just a perspective you can change. This map is for noticing your life, not measuring its worth.</p></section></div><button class="button primary full" data-action="close">Back to the little weeks ${icon('arrow-right')}</button></div>`);
}

function showExport() {
  openModal('A little piece of your story.', 'Keep your map, or make something to pin to a wall.', `<div class="modal-body export-options"><button class="export-option" data-action="download-json">${icon('download')}<span><strong>Download my map</strong><small>A JSON backup you can restore here later. Includes chapters, mood estimates, entry fingerprints, and approved excerpts, never your key or full journal.</small></span>${icon('arrow-right')}</button><button class="export-option" data-action="download-svg">${icon('heart')}<span><strong>Download a little poster</strong><small>A crisp SVG of your life in weeks, with chapter colors and a legend. Print it or keep it close.</small></span>${icon('arrow-right')}</button><button class="link-button" data-action="import-backup">${icon('upload')} Restore a map you saved before</button></div>`);
}
function download(data, type, name) { const url = URL.createObjectURL(new Blob([data], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function exportSVG() {
  const posterPhases = state.phases.filter(p => p.source !== 'ai' || p.dateVerified);
  const posterMilestones = state.milestones.filter(m => m.source !== 'ai' || m.dateVerified);
  const featuredNotes = [];
  for (const item of [...posterMilestones].sort((a,b) => (b.importance || 4)-(a.importance || 4))) {
    if (featuredNotes.every(m => Math.abs(dateValue(m.date)-dateValue(item.date)) >= 2*365*DAY)) featuredNotes.push(item);
    if (featuredNotes.length === 3) break;
  }
  const width = 920, top = 160, cell = 11, gap = 3, left = 85, rowHeight = 14;
  const legendY = top + calendar.rows.length * rowHeight + 45;
  const height = legendY + 70 + posterPhases.length * 28 + (posterMilestones.length ? 40 + posterMilestones.length * 25 : 0);
  const posterNotes = posterMilestones.map((m, i) => {
    const index = Math.floor((dateValue(m.date) - dateValue(state.birthday)) / WEEK), week = calendar.weeks[index];
    if (!week) return '';
    const col = calendar.rows[week.age].weeks.findIndex(w => w.index === index);
    const x = left + col * (cell + gap) + cell / 2, y = top + week.age * rowHeight + cell / 2;
    if (!featuredNotes.includes(m)) return '<ellipse cx="'+x+'" cy="'+y+'" rx="8" ry="7" fill="none" stroke="#74796a" stroke-width="1.1"/>';
    const noteWidth = Math.min(330, m.title.length * 8 + 14), nx = Math.max(left + 5, Math.min(x + 30, width - noteWidth - 25)), ny = y - 28 - (i % 2) * 9;
    return `<ellipse cx="${x}" cy="${y}" rx="8" ry="7" fill="none" stroke="#74796a" stroke-width="1.1"/><path d="M${nx+10} ${ny+14}Q${x+20} ${y-18} ${x+5} ${y-6}m0 0 1-6m-1 6 6-2" fill="none" stroke="#74796a" stroke-width="1.1"/><rect x="${nx}" y="${ny-6}" width="${noteWidth}" height="23" rx="3" fill="#fcfbf6" fill-opacity=".93"/><text x="${nx+4}" y="${ny+10}" font-size="15" font-style="italic" fill="#6c7562">${escape(m.title)}</text>`;
  }).join('');
  const cells = calendar.rows.map(row => `<text x="55" y="${top + row.age * rowHeight + 9}" font-size="10" fill="#85877a">${row.age % 5 === 0 ? row.age : ''}</text>${row.weeks.map((w,c) => `<rect x="${left + c * (cell + gap)}" y="${top + row.age * rowHeight}" width="${cell}" height="${cell}" rx="1" fill="${w.phases.length ? COLORS[w.phases[0].color].fill : w.lived ? '#b8bdad' : '#f7f5ed'}" stroke="${w.current ? '#384638' : '#b5b6a9'}" stroke-width="${w.current ? 2 : .6}"/>${w.phases.length > 1 ? `<path d="M${left + c * (cell + gap)},${top + row.age * rowHeight + cell}l${cell},-${cell}v${cell}Z" fill="${COLORS[w.phases[1].color].fill}"/>` : ''}`).join('')}`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#f7f5ed"/><g font-family="Georgia,serif"><text x="65" y="65" font-size="35" fill="#384638">A whole life. One week at a time.</text><text x="65" y="95" font-size="14" fill="#6f7467">${state.demo ? 'AN EXAMPLE LIFE · ' : ''}${escape(formatDate(state.birthday))} · ${calendar.completed.toLocaleString()} weeks lived · as of ${escape(formatDate(today))}</text><text x="65" y="125" font-size="12" fill="#85877a">Each square is 7 days · rows group weeks by age · ${state.years}-year canvas</text>${cells}${posterNotes}<text x="65" y="${legendY}" font-size="15" fill="#384638">The chapters that shaped a life</text>${posterPhases.map((p,i) => `<rect x="65" y="${legendY + 20 + i * 28}" width="12" height="12" rx="2" fill="${COLORS[p.color].fill}"/><text x="90" y="${legendY + 31 + i * 28}" font-size="12" fill="#56604f">${escape(p.title)} · ${escape(p.start)} — ${escape(p.end)}</text>`).join('')}${posterMilestones.length ? `<text x="65" y="${legendY + 50 + posterPhases.length * 28}" font-size="15" fill="#707b63">Little landmarks</text>${posterMilestones.map((m,i) => `<text x="65" y="${legendY + 75 + posterPhases.length * 28 + i * 25}" font-size="12" fill="#7a856b">${escape(m.date)} · ${escape(m.title)}</text>`).join('')}` : ''}<text x="65" y="${height - 18}" font-size="11" fill="#85877a">little by little · A life is more than its squares.</text></g></svg>`;
  download(svg, 'image/svg+xml', 'my-life-in-weeks.svg'); toast('A little perspective, saved as a poster.');
}

$('#backup-input').onchange = async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 20_000_000) throw new Error('Choose a map backup smaller than 20 MB.');
    const data = JSON.parse(await file.text());
    if (data.version !== 1 || !Number.isFinite(dateValue(data.birthday)) || data.birthday < '1900-01-01' || data.birthday > today || !Array.isArray(data.phases) || data.phases.length > 2000) throw new Error('This is not a supported Little by Little map backup.');
    const phases = data.phases.map(p => validatePhase(p, data.birthday, today));
    if (data.milestones && (!Array.isArray(data.milestones) || data.milestones.length > 500)) throw new Error('This backup contains an invalid pencil-note list.');
    const milestones = (data.milestones || []).map(m => validateMilestone(m, data.birthday, today));
    if (milestones.some(m => !m)) throw new Error('This backup contains a pencil note with an invalid date or title.');
    if (phases.some(p => !p)) throw new Error('This backup contains an invalid chapter. Check its dates and title.');
    if (data.moods && (!Array.isArray(data.moods) || data.moods.length > 10000)) throw new Error('This backup contains an invalid mood list.');
    const moods=(data.moods || []).map(p=>validateMoodPoint(p,data.birthday,today));
    if (moods.some(p=>!p)) throw new Error('This backup contains an invalid mood estimate.');
    const years = Number(data.years);
    if (!Number.isInteger(years) || years < 60 || years > 130 || years <= ageAt(data.birthday, today)) throw new Error('The backup has an invalid canvas length.');
    openModal('Bring this story back?', `${phases.length} chapters · birthday ${formatDate(data.birthday)}`, `<div class="modal-body"><p>This replaces the map currently open in this tab. Download your current map first if you’d like to keep both.</p><div class="modal-actions"><button class="button outline" data-action="close">Keep current map</button><button class="button primary" id="restore-confirm">Restore this map ${icon('check')}</button></div></div>`);
    $('#restore-confirm').onclick = () => { state = { birthday: data.birthday, years, phases, milestones, moods,analysisHistory:validateHistory(data.analysisHistory), demo: false }; selected = null; $('#birthday').value = state.birthday; ensureHorizon(); render(); persist(); closeModal(); toast('Your story is back, just where you left it.'); };
  } catch (error) { toast(error.message || 'That backup could not be opened.'); }
  event.target.value = '';
};

document.addEventListener('click', event => {
  const yearStep=event.target.closest('[data-year-step]');
  if(yearStep){focusYear+=Number(yearStep.dataset.yearStep);selectedMood=undefined;render();}
  const moodEdit=event.target.closest('[data-mood-edit]');
  if(moodEdit) showMoodCorrection(decodeURIComponent(moodEdit.dataset.moodEdit));
  const moodPeriodButton=event.target.closest('[data-mood-period]');
  if(moodPeriodButton) { moodPeriod=moodPeriodButton.dataset.moodPeriod; selectedMood=undefined; renderMood(); }
  const moodBucket=event.target.closest('[data-mood-bucket]');
  if(moodBucket) { event.preventDefault(); selectedMood=moodBucket.dataset.moodBucket; renderMood(); $('#mood-point')?.focus(); }
  const moodFind=event.target.closest('[data-mood-find]');
  if(moodFind) { if(view==='year'){focusYear=Number(moodFind.dataset.moodFind.slice(0,4));render();} const index=Math.floor((dateValue(moodFind.dataset.moodFind)-dateValue(state.birthday))/WEEK); const square=$(view==='year'?'#year-map [data-week="'+index+'"]':'#weeks-grid [data-week="'+index+'"]'); square?.scrollIntoView({behavior:'smooth',block:'center'}); square?.focus(); }
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'close') closeModal();
  if (action === 'how') showHow();
  if (action === 'privacy' || action === 'map-settings') showPrivacy();
  if (action === 'export') showExport();
  if (action === 'journal') showJournal();
  if (action === 'connection') showConnection(true);
  if (action === 'add') showChapter();
  if (action === 'add-note') showNote();
  if (action === 'toggle-notes') { showPencilNotes = !showPencilNotes; renderPencilNotes(); }
  if (action === 'start') showStart();
  if (action === 'clear-filter') { selected = null; render(); }
  if (action === 'import-backup') $('#backup-input').click();
  if (action === 'download-json') { download(JSON.stringify({ version: 1, birthday: state.birthday, years: state.years, phases: state.phases, milestones: state.milestones, moods:state.moods || [],analysisHistory:state.analysisHistory }, null, 2), 'application/json', 'my-life-in-weeks.json'); toast('Your map is saved. Keep it somewhere private.'); }
  if (action === 'download-svg') exportSVG();
  if (action === 'clear-data') {
    openModal('Start with a fresh page?', 'Reset this map and return to the example.', `<div class="modal-body"><p>This clears your birthday, chapters, pencil notes, mood estimates, imported journal, analysis progress, and API keys from this tab and saved browser data. Downloaded backups stay on your device.</p><p class="field-note">Save your map first if you want to keep it.</p><div class="modal-actions"><button class="button outline" data-action="close">Keep my map</button><button class="button danger" id="clear-confirm">Reset everything</button></div></div>`);
    $('#clear-confirm').onclick = () => {
      activeAnalysis?.abort(); activeAnalysis = null; modalGeneration++;
      remember=false; journal=''; drafts=[]; draftMilestones=[]; draftMoods=[]; draftRejected=0;
      analysisCheckpoint=null; journalEndingYear=undefined; journalPlan=null; updatePlan=null; draftManifest=[]; updatePreviewToken++; fullAnalysisPreference=false; readingFiles=false;
      connection={provider:'openai',base:PROVIDERS.openai.base,model:PROVIDERS.openai.model,effort:'high',key:'',keys:[],concurrency:'auto'};
      selected=null; selectedMilestone=null; selectedMood=undefined; moodPeriod='week'; focusYear=Number(today.slice(0,4)); showPencilNotes=true; view='all';
      state=demoState(today);
      $('#birthday').value=state.birthday; $('#years').value=state.years; $('#backup-input').value='';
      $$('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);b.setAttribute('aria-pressed',b.dataset.view===view);});
      persist(); render(); closeModal(); window.scrollTo({top:0,behavior:'smooth'});
      toast('Reset complete. You’re looking at the example again.');
    };
  }

  const phaseId = event.target.closest('[data-select]')?.dataset.select;
  if (phaseId) { selected = selected === phaseId ? null : phaseId; render(); }
  const editId = event.target.closest('[data-edit]')?.dataset.edit;
  if (editId) {
    if (state.demo) {
      const p = state.phases.find(p => p.id === editId);
      openModal(escape(p.title), 'A chapter from the example life', `<div class="modal-body prose"><p>${escape(p.summary)}</p><p>${formatDate(p.start)} — ${formatDate(p.end)}</p><button class="button primary full" data-action="start">Start a story of my own ${icon('arrow-right')}</button></div>`);
    } else showChapter(editId);
  }
  const deleteId = event.target.closest('[data-delete]')?.dataset.delete;
  if (deleteId) { state.phases = state.phases.filter(p => p.id !== deleteId); if (selected === deleteId) selected = null; render(); persist(); closeModal(); toast('Chapter removed from the map.'); }
  const noteId = event.target.closest('[data-note]')?.dataset.note;
  if (noteId) { if(event.target.closest('a[data-note]'))event.preventDefault(); selectedMilestone = noteId; renderPencilNotes(); if (state.demo) { const m = state.milestones.find(n => n.id === noteId); openModal(escape(m.title), formatDate(m.date) + ' · an example pencil note', `<div class="modal-body prose"><p>${escape(m.summary)}</p><button class="button primary full" data-action="start">Start my own story ${icon('arrow-right')}</button></div>`); } else showNote(noteId); }
  const deleteNote = event.target.closest('[data-delete-note]')?.dataset.deleteNote;
  if (deleteNote) { state.milestones = state.milestones.filter(m => m.id !== deleteNote); render(); persist(); closeModal(); toast('Pencil note erased.'); }
  const noteWeek = event.target.closest('[data-week-note]');
  if (noteWeek) { const w = calendar.weeks[Number(noteWeek.dataset.weekNote)]; showNote(null, iso(Math.min(w.start, dateValue(today)))); }
  const week = event.target.closest('[data-week]'); if (week) showWeek(Number(week.dataset.week));
  const weekAdd = event.target.closest('[data-week-add]'); if (weekAdd) { const w = calendar.weeks[Number(weekAdd.dataset.weekAdd)]; showChapter(null, { start: iso(w.start), end: iso(Math.min(w.end - DAY, dateValue(today))) }); }
  const viewButton = event.target.closest('[data-view]');
  if (viewButton) { view = viewButton.dataset.view; $$('[data-view]').forEach(b => { b.classList.toggle('active', b.dataset.view === view); b.setAttribute('aria-pressed', b.dataset.view === view); }); render(); }
});

$('#year-map').addEventListener('keydown',event=>{
  const cell=event.target.closest('[data-week]');if(!cell)return;
  const cells=$$('[data-week]',$('#year-map')),i=cells.indexOf(cell);
  const cols=getComputedStyle($('.year-grid')).gridTemplateColumns.split(' ').length;
  const offset={ArrowRight:1,ArrowLeft:-1,ArrowDown:cols,ArrowUp:-cols}[event.key];
  const next=event.key==='Home'?cells[0]:event.key==='End'?cells.at(-1):cells[i+offset];
  if(next){event.preventDefault();cell.tabIndex=-1;next.tabIndex=0;next.focus();}
});
const tooltip = $('#week-tooltip');
$('#weeks-grid').addEventListener('pointerover', event => {
  const cell = event.target.closest('[data-week]'); if (!cell || event.pointerType === 'touch') return;
  const w = calendar.weeks[Number(cell.dataset.week)];
  tooltip.innerHTML = `<strong>${w.current ? 'You are here ♡' : `Week ${(w.index + 1).toLocaleString()}`}</strong><span>${formatDate(w.start)} — ${formatDate(w.end - DAY)}</span>${w.phases.length ? w.phases.map(p => `<span class="tip-phase"><i style="background:${COLORS[p.color].fill}"></i>${escape(p.title)}</span>`).join('') : `<small>${w.lived ? 'An ordinary week. A little bit of life.' : 'Still unwritten.'}</small>`}`;
  tooltip.hidden = false;
  const r = cell.getBoundingClientRect(), t = tooltip.getBoundingClientRect();
  tooltip.style.left = `${Math.max(8, Math.min(r.left - t.width / 2, innerWidth - t.width - 8))}px`;
  tooltip.style.top = `${r.top > t.height + 15 ? r.top - t.height - 10 : r.bottom + 10}px`;
});
$('#weeks-grid').addEventListener('pointerout', event => { if (event.target.closest('[data-week]')) tooltip.hidden = true; });
window.addEventListener('scroll', () => { tooltip.hidden = true; }, { passive: true });
$('#weeks-grid').addEventListener('keydown', event => {
  const cell = event.target.closest('[data-week]'); if (!cell) return;
  let index = Number(cell.dataset.week);
  const w = calendar.weeks[index], col = Number(cell.dataset.col);
  if (event.key === 'ArrowRight') index++;
  else if (event.key === 'ArrowLeft') index--;
  else if (event.key === 'Home') index = calendar.rows[w.age].weeks[0].index;
  else if (event.key === 'End') index = calendar.rows[w.age].weeks.at(-1).index;
  else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { const row = calendar.rows[w.age + (event.key === 'ArrowDown' ? 1 : -1)]; if (row) index = row.weeks[Math.min(col, row.weeks.length - 1)].index; }
  else return;
  event.preventDefault();
  const next = $(`[data-week="${index}"]`); if (next) { cell.tabIndex = -1; next.tabIndex = 0; next.focus(); }
});

ensureHorizon(); render();
new ResizeObserver(() => requestAnimationFrame(renderPencilNotes)).observe($('.calendar-inner'));
new ResizeObserver(() => { if ($('#mood-panel').clientWidth !== moodPanelWidth) requestAnimationFrame(renderMood); }).observe($('#mood-panel'));
document.fonts.ready.then(renderPencilNotes);
// Refresh the current-week marker when a tab stays open overnight.
setInterval(() => { if (todayISO() !== today && !modal.open && !journal && !connection.key && !connection.keys?.length) location.reload(); }, 60000);
