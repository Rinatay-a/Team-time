import { beforeEach, describe, expect, it } from 'vitest';
import { api } from '../src/services/api';

describe('демо-сценарии сохранения', () => {
  beforeEach(() => localStorage.clear());

  it('пользователь редактирует свой ответ с тем же токеном', async () => {
    const first = await api.saveAvailability('demo', 'Анна', ['2026-10-21T15:00']);
    const second = await api.saveAvailability('demo', 'Анна', ['2026-10-21T16:00'], first.editToken);
    expect(second.editToken).toBe(first.editToken);
    expect(second.participant.slots).toEqual(['2026-10-21T16:00']);
  });

  it('повторный визит получает сохранённый ответ', async () => {
    const saved = await api.saveAvailability('demo', 'Анна', ['2026-10-21T15:00']);
    const data = await api.publicMeeting('demo', saved.editToken);
    expect(data.myResponse?.display_name).toBe('Анна');
    expect(data.myResponse?.slots).toContain('2026-10-21T15:00');
  });

  it('два независимых новых сохранения получают разные токены', async () => {
    const [first, second] = await Promise.all([
      api.saveAvailability('demo', 'А', ['2026-10-21T15:00']),
      api.saveAvailability('demo', 'Б', ['2026-10-21T16:00']),
    ]);
    expect(first.editToken).not.toBe(second.editToken);
  });

  it('сохраняет ответ длиннее 1000 слотов без обрезки', async () => {
    const slots = Array.from({ length: 1200 }, (_, index) => `slot-${index}`);
    const result = await api.saveAvailability('demo', 'Большой ответ', slots);
    expect(result.participant.slots).toHaveLength(1200);
  });
});
