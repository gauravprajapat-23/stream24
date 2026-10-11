const WEEKDAY = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };

export function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone || 'UTC', weekday:'short', hour:'2-digit', minute:'2-digit', hourCycle:'h23'
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return { weekday: WEEKDAY[map.weekday], minutes: Number(map.hour) * 60 + Number(map.minute) };
}

export function parseClock(value) {
  const m = String(value || '').match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function shouldRunSchedule(schedule, date = new Date()) {
  if (!schedule?.enabled) return false;
  const start = parseClock(schedule.startTime), stop = parseClock(schedule.stopTime);
  if (start === null || stop === null || start === stop) return false;
  const days = Array.isArray(schedule.days) && schedule.days.length ? schedule.days.map(Number) : [0,1,2,3,4,5,6];
  const { weekday, minutes } = zonedParts(date, schedule.timezone || 'UTC');
  if (start < stop) return days.includes(weekday) && minutes >= start && minutes < stop;
  const prev = (weekday + 6) % 7;
  return (days.includes(weekday) && minutes >= start) || (days.includes(prev) && minutes < stop);
}

export function normalizeSchedule(input = {}) {
  const enabled = Boolean(input.enabled);
  const timezone = String(input.timezone || 'Asia/Kolkata').trim();
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date()); }
  catch { throw new Error(`Invalid timezone: ${timezone}`); }
  const startTime = String(input.startTime || '09:00');
  const stopTime = String(input.stopTime || '18:00');
  if (parseClock(startTime) === null || parseClock(stopTime) === null || startTime === stopTime) throw new Error('Schedule start/stop times must be valid and different.');
  const days = (Array.isArray(input.days) ? input.days : [0,1,2,3,4,5,6]).map(Number).filter(d => d >= 0 && d <= 6);
  return { enabled, timezone, startTime, stopTime, days:[...new Set(days)], runtime:{ lastShouldRun:null, lastEvaluatedAt:null } };
}
