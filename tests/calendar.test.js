import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ageAt, anniversary, dateValue, DAY, demoState, makeCalendar, validatePhase, WEEK } from '../src/calendar.js';

test('calendar dates reject impossible dates, timestamps and non-strings', () => {
  for (const date of ['2025-02-29', '2024-02-30', '2024-13-01', '2024-01-01T00:00:00Z', '', null, 123]) assert.ok(Number.isNaN(dateValue(date)));
  assert.ok(Number.isFinite(dateValue('2024-02-29')));
});

test('every interval is exactly seven days and no weeks are lost or repeated across birthdays', () => {
  const cal = makeCalendar('2000-02-29', 90, '2026-10-17');
  assert.equal(cal.rows.length, 90);
  assert.equal(cal.rows.flatMap(r => r.weeks).length, cal.weeks.length);
  assert.equal(cal.weeks[0].start, dateValue('2000-02-29'));
  for (let i = 0; i < cal.weeks.length; i++) {
    const week = cal.weeks[i];
    assert.equal(week.end - week.start, WEEK);
    assert.equal(week.age, ageAt('2000-02-29', new Date(week.start).toISOString().slice(0, 10)));
    if (i) assert.equal(week.start, cal.weeks[i - 1].end);
  }
  assert.ok(cal.rows.every(r => r.weeks.length === 52 || r.weeks.length === 53));
  assert.ok(cal.weeks.at(-1).start < anniversary('2000-02-29', 90));
  assert.ok(cal.weeks.at(-1).end >= anniversary('2000-02-29', 90));
});

test('birthday, week boundary and leap-day ages have a single current week', () => {
  for (const [birthday, today, completed] of [['2026-10-17','2026-10-17',0], ['2026-10-10','2026-10-17',1], ['2026-10-11','2026-10-17',0]]) {
    const cal = makeCalendar(birthday, 90, today);
    assert.equal(cal.completed, completed);
    assert.equal(cal.weeks.filter(w => w.current).length, 1);
    assert.equal(cal.weeks.filter(w => w.lived).length, completed + 1);
  }
  assert.equal(ageAt('2000-02-29','2025-02-27'),24);
  assert.equal(ageAt('2000-02-29','2025-02-28'),25);
  assert.equal(anniversary('2000-02-29',25),dateValue('2025-02-28'));
});

test('chapters match inclusive date intersections, including overlapping chapters and a single-day chapter', () => {
  const phases = [{ id:'a', start:'2026-01-07',end:'2026-01-08' }, { id:'b',start:'2026-01-08',end:'2026-01-08' }];
  const cal = makeCalendar('2000-01-01', 90, '2026-10-17', phases);
  for (const week of cal.weeks) {
    const expected = phases.filter(p => dateValue(p.start) < week.end && dateValue(p.end) + DAY > week.start);
    assert.deepEqual(week.phases,expected);
  }
  assert.ok(cal.weeks.some(w => w.phases.length === 2));
  assert.ok(cal.weeks.filter(w => w.phases.some(p => p.id === 'b')).length === 1);
});

test('invalid phase dates are rejected and untrusted colors and fields are normalized', () => {
  const p = { title:'A chapter',start:'2025-01-01',end:'2025-06-01',color:'url(evil)' };
  assert.equal(validatePhase(p,'2000-01-01','2026-10-17').color,'sage');
  for (const patch of [{ title:'' },{ start:'1999-01-01' },{ start:'2025-07-01' },{ end:'2027-01-01' },{ end:'invalid' }]) assert.equal(validatePhase({...p,...patch},'2000-01-01','2026-10-17'),null);
});

test('example story stays in the past and valid for today', () => {
  const state = demoState('2026-10-17');
  assert.equal(state.demo,true);
  assert.ok(state.phases.every(p => validatePhase(p,state.birthday,'2026-10-17')));
  assert.throws(() => makeCalendar('2027-01-01',90,'2026-10-17'));
});
