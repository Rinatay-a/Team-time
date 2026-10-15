import { describe, expect, it } from 'vitest';
import { datesInRange, findBestIntervals, fromUtcKey, slotKeys, toUtc, weekGroups } from '../src/lib/time';
import type { Meeting, Participant } from '../src/types';

const meeting: Meeting = {
  id: 'm', poll_type: 'meeting', title: 'Тест', description: '', timezone: 'Europe/Moscow',
  start_hour: '15:00', end_hour: '19:00', slot_duration: 30, meeting_duration: 90,
  results_visibility: 'organizer', status: 'collecting', dates: ['2026-10-21'],
};
const person = (id: string, slots: string[]): Participant => ({
  id, display_name: id, slots: slots.map((time) => `2026-10-21T${time}`),
});

describe('поиск непрерывного времени', () => {
  it('считает одного участника на все слоты', () => expect(findBestIntervals(meeting, [person('Анна', ['15:00', '15:30', '16:00'])])[0].available).toBe(1));
  it('учитывает частичное пересечение', () => {
    const result = findBestIntervals({ ...meeting, meeting_duration: 60 }, [person('А', ['15:00', '15:30', '16:00']), person('Б', ['15:30', '16:00', '16:30'])]);
    expect(result[0]).toMatchObject({ start: '15:30', available: 2 });
  });
  it('не считает 30 минут как доступность на 90 минут', () => expect(findBestIntervals(meeting, [person('А', ['15:00', '15:30', '16:00']), person('Б', ['15:00'])])[0].available).toBe(1));
  it('поддерживает анализ availability без постоянной длительности', () => {
    const poll = { ...meeting, poll_type: 'availability' as const, meeting_duration: null };
    expect(findBestIntervals(poll, [person('А', ['15:00', '15:30'])], 5, 60)[0].available).toBe(1);
    expect(findBestIntervals(poll, [], 5)).toEqual([]);
  });
  it('не рекомендует блок за границей дня', () => expect(findBestIntervals(meeting, [person('А', ['18:00', '18:30'])]).some((item) => item.end > '19:00')).toBe(false));
});

describe('даты и периоды', () => {
  it('строит диапазон 42 дня', () => expect(datesInRange('2026-10-19', '2026-11-29')).toHaveLength(42));
  it('исключает выходные', () => {
    const dates = datesInRange('2026-10-19', '2026-10-25', new Set([1, 2, 3, 4, 5]));
    expect(dates).toHaveLength(5);
  });
  it('разбивает период по неделям с понедельника', () => expect(weekGroups(datesInRange('2026-10-19', '2026-11-01'))).toHaveLength(2));
  it('поддерживает более 1000 слотов', () => {
    const poll = { ...meeting, poll_type: 'availability' as const, meeting_duration: null, dates: datesInRange('2026-10-19', '2026-11-29'), start_hour: '09:00', end_hour: '23:00', slot_duration: 15 };
    expect(slotKeys(poll)).toHaveLength(2352);
  });
  it('сохраняет московское время', () => {
    const iso = toUtc('2026-10-21T17:00', 'Europe/Moscow');
    expect(iso).toContain('14:00:00.000Z');
    expect(fromUtcKey(iso, 'Europe/Moscow')).toBe('2026-10-21T17:00');
  });
});
