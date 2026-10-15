import { addDays, format, parseISO, startOfWeek } from 'date-fns';
import { ru } from 'date-fns/locale';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import type { BestInterval, Meeting, Participant } from '../types';

export const minutes = (time: string) => {
  const [hours, mins] = time.slice(0, 5).split(':').map(Number);
  return hours * 60 + mins;
};

export const hhmm = (value: number) =>
  `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;

export const slotKeys = (meeting: Meeting, dates = meeting.dates) =>
  dates.flatMap((date) => {
    const keys: string[] = [];
    for (
      let value = minutes(meeting.start_hour);
      value < minutes(meeting.end_hour);
      value += meeting.slot_duration
    ) {
      keys.push(`${date}T${hhmm(value)}`);
    }
    return keys;
  });

export const toUtc = (key: string, timezone: string) =>
  fromZonedTime(`${key}:00`, timezone).toISOString();

export const fromUtcKey = (iso: string, timezone: string) =>
  format(toZonedTime(parseISO(iso), timezone), "yyyy-MM-dd'T'HH:mm");

export const prettyDate = (date: string) =>
  format(parseISO(`${date}T12:00:00`), 'EEEE, d MMMM', { locale: ru });

export const shortDate = (date: string) =>
  format(parseISO(`${date}T12:00:00`), 'EEE, d MMM', { locale: ru });

export function datesInRange(start: string, end: string, weekdays = new Set([1, 2, 3, 4, 5, 6, 0])) {
  const result: string[] = [];
  let current = parseISO(`${start}T12:00:00`);
  const last = parseISO(`${end}T12:00:00`);
  while (current <= last && result.length < 56) {
    if (weekdays.has(current.getDay())) result.push(format(current, 'yyyy-MM-dd'));
    current = addDays(current, 1);
  }
  return result;
}

export function weekGroups(dates: string[]) {
  const groups = new Map<string, string[]>();
  for (const date of [...dates].sort()) {
    const monday = format(startOfWeek(parseISO(`${date}T12:00:00`), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    groups.set(monday, [...(groups.get(monday) || []), date]);
  }
  return [...groups.entries()].map(([start, days]) => ({ start, days }));
}

export function findBestIntervals(
  meeting: Meeting,
  participants: Participant[],
  limit = 5,
  analysisDuration?: number,
): BestInterval[] {
  const duration = analysisDuration ?? meeting.meeting_duration;
  if (!duration || duration <= 0 || duration % meeting.slot_duration !== 0 || participants.length === 0) return [];
  const neededSlots = duration / meeting.slot_duration;
  const candidates = meeting.dates.flatMap((date) => {
    const day: BestInterval[] = [];
    const first = minutes(meeting.start_hour);
    const last = minutes(meeting.end_hour);
    for (let value = first; value + duration <= last; value += meeting.slot_duration) {
      const keys = Array.from(
        { length: neededSlots },
        (_, index) => `${date}T${hhmm(value + index * meeting.slot_duration)}`,
      );
      const availablePeople = participants.filter((person) => keys.every((key) => person.slots.includes(key)));
      day.push({
        date,
        start: hhmm(value),
        end: hhmm(value + duration),
        available: availablePeople.length,
        total: participants.length,
        percent: participants.length ? (availablePeople.length / participants.length) * 100 : 0,
        availableNames: availablePeople.map((person) => person.display_name),
        unavailableNames: participants
          .filter((person) => !availablePeople.includes(person))
          .map((person) => person.display_name),
      });
    }
    return day;
  });

  candidates.sort(
    (a, b) =>
      b.available - a.available || a.date.localeCompare(b.date) || a.start.localeCompare(b.start),
  );

  const result: BestInterval[] = [];
  for (const candidate of candidates) {
    const tooSimilar = result.some(
      (chosen) =>
        chosen.date === candidate.date &&
        Math.abs(minutes(chosen.start) - minutes(candidate.start)) < duration,
    );
    if (!tooSimilar) result.push(candidate);
    if (result.length === limit) break;
  }
  return result;
}

export const humanDuration = (value: number) =>
  value % 60 === 0
    ? `${value / 60} ч`
    : value > 60
      ? `${Math.floor(value / 60)} ч ${value % 60} мин`
      : `${value} мин`;

const escapeIcs = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');

export const makeIcs = (meeting: Meeting) => {
  if (!meeting.finalized_start || !meeting.finalized_end) return '';
  const stamp = (value: string) => value.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Team Time//RU',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${meeting.id}@team-time`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(meeting.finalized_start)}`,
    `DTEND:${stamp(meeting.finalized_end)}`,
    `SUMMARY:${escapeIcs(meeting.title)}`,
    `DESCRIPTION:${escapeIcs(meeting.description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
};
