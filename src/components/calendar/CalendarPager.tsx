import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, MousePointer2, MoveVertical, Smartphone } from 'lucide-react';
import type { Meeting, Participant } from '../../types';
import { humanDuration, prettyDate, slotKeys, weekGroups } from '../../lib/time';
import { Button } from '../ui/Button';
import { TimeGrid } from './TimeGrid';

export function CalendarPager({
  meeting,
  selected,
  onChange,
  participants,
  results = false,
  onSlotInspect,
}: {
  meeting: Meeting;
  selected?: Set<string>;
  onChange?: (value: Set<string>) => void;
  participants?: Participant[];
  results?: boolean;
  onSlotInspect?: (key: string) => void;
}) {
  const weeks = useMemo(() => weekGroups(meeting.dates), [meeting.dates]);
  const [weekIndex, setWeekIndex] = useState(0);
  const [dayIndex, setDayIndex] = useState(0);
  const [mobile, setMobile] = useState(false);
  const [touchDraw, setTouchDraw] = useState(true);

  useEffect(() => {
    const query = matchMedia('(max-width: 639px)');
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  const week = weeks[Math.min(weekIndex, weeks.length - 1)] || { start: '', days: [] };
  const visibleDates = mobile ? week.days.slice(dayIndex, dayIndex + 1) : week.days;
  const chosenMinutes = (selected?.size || 0) * meeting.slot_duration;

  const changeWeek = (next: number) => {
    setWeekIndex(Math.max(0, Math.min(weeks.length - 1, next)));
    setDayIndex(0);
  };

  const updateDay = (select: boolean) => {
    if (!onChange || !visibleDates[0]) return;
    const next = new Set(selected);
    for (const key of slotKeys(meeting, [visibleDates[0]])) {
      if (select) next.add(key);
      else next.delete(key);
    }
    onChange(next);
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3">
        <Button variant="ghost" disabled={weekIndex === 0} onClick={() => changeWeek(weekIndex - 1)}>
          <ChevronLeft size={18} /> Предыдущая
        </Button>
        <div className="text-center">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Неделя {weekIndex + 1} из {weeks.length}</div>
          <div className="font-bold capitalize">{week.days.length ? `${prettyDate(week.days[0])} — ${prettyDate(week.days.at(-1)!)}` : ''}</div>
        </div>
        <Button variant="ghost" disabled={weekIndex >= weeks.length - 1} onClick={() => changeWeek(weekIndex + 1)}>
          Следующая <ChevronRight size={18} />
        </Button>
      </div>

      {mobile && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {week.days.map((date, index) => (
            <button
              key={date}
              onClick={() => setDayIndex(index)}
              className={`focus-ring min-w-28 rounded-xl border px-3 py-2 text-sm font-semibold capitalize ${index === dayIndex ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white'}`}
            >
              {prettyDate(date)} {selected && [...selected].some((key) => key.startsWith(date)) ? '•' : ''}
            </button>
          ))}
        </div>
      )}

      {!results && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => updateDay(true)}>Выбрать весь день</Button>
          <Button variant="ghost" onClick={() => updateDay(false)}>Очистить день</Button>
          <button
            type="button"
            className="focus-ring ml-auto inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-100 px-3 text-sm font-semibold sm:hidden"
            onClick={() => setTouchDraw((value) => !value)}
          >
            {touchDraw ? <MoveVertical size={17} /> : <Smartphone size={17} />}
            {touchDraw ? 'Рисовать пальцем' : 'Прокручивать'}
          </button>
          <span className="text-sm font-semibold text-brand-700">Выбрано: {humanDuration(chosenMinutes)}</span>
        </div>
      )}

      {!results && (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <MousePointer2 size={16} /> Проведите мышью или пальцем, чтобы выбрать сразу несколько часов.
        </p>
      )}
      <TimeGrid
        meeting={meeting}
        dates={visibleDates}
        selected={selected}
        onChange={onChange}
        participants={participants}
        results={results}
        allowTouchSelection={touchDraw}
        onSlotInspect={onSlotInspect}
      />
    </section>
  );
}
