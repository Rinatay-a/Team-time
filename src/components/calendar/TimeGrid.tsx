import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import type { Meeting, Participant } from '../../types';
import { hhmm, minutes, shortDate } from '../../lib/time';

type Props = {
  meeting: Meeting;
  dates?: string[];
  selected?: Set<string>;
  onChange?: (slots: Set<string>) => void;
  participants?: Participant[];
  results?: boolean;
  allowTouchSelection?: boolean;
  onSlotInspect?: (key: string) => void;
};

type DragState = {
  pointerId: number;
  add: boolean;
  processed: Set<string>;
  working: Set<string>;
  lastRow: number;
  lastColumn: number;
};

/**
 * Pointer capture on an individual V1 cell retargeted subsequent events to that
 * button, so neighbouring buttons did not reliably receive pointerenter. V2
 * captures on the grid and resolves the cell under pointer coordinates itself.
 */
export const TimeGrid = memo(function TimeGrid({
  meeting,
  dates = meeting.dates,
  selected = new Set<string>(),
  onChange,
  participants = [],
  results = false,
  allowTouchSelection = true,
  onSlotInspect,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [dragging, setDragging] = useState(false);

  const rows = useMemo(() => {
    const values: string[] = [];
    for (
      let value = minutes(meeting.start_hour);
      value < minutes(meeting.end_hour);
      value += meeting.slot_duration
    ) values.push(hhmm(value));
    return values;
  }, [meeting.start_hour, meeting.end_hour, meeting.slot_duration]);

  const applyCell = useCallback((row: number, column: number) => {
    const state = dragRef.current;
    const date = dates[column];
    const time = rows[row];
    if (!state || !date || !time) return;
    const key = `${date}T${time}`;
    if (state.processed.has(key)) return;
    state.processed.add(key);
    if (state.add) state.working.add(key);
    else state.working.delete(key);
    onChange?.(new Set(state.working));
  }, [dates, onChange, rows]);

  const applyLine = useCallback((toRow: number, toColumn: number) => {
    const state = dragRef.current;
    if (!state) return;
    const rowDistance = toRow - state.lastRow;
    const columnDistance = toColumn - state.lastColumn;
    const steps = Math.max(Math.abs(rowDistance), Math.abs(columnDistance), 1);
    for (let step = 1; step <= steps; step += 1) {
      applyCell(
        Math.round(state.lastRow + (rowDistance * step) / steps),
        Math.round(state.lastColumn + (columnDistance * step) / steps),
      );
    }
    state.lastRow = toRow;
    state.lastColumn = toColumn;
  }, [applyCell]);

  const cellAtPoint = (x: number, y: number) => {
    const element = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-slot-cell]');
    if (!element || !rootRef.current?.contains(element)) return null;
    return { row: Number(element.dataset.row), column: Number(element.dataset.column) };
  };

  const finishDrag = useCallback((pointerId?: number) => {
    const state = dragRef.current;
    if (!state || (pointerId !== undefined && state.pointerId !== pointerId)) return;
    if (rootRef.current?.hasPointerCapture(state.pointerId)) {
      rootRef.current.releasePointerCapture(state.pointerId);
    }
    dragRef.current = null;
    setDragging(false);
  }, []);

  useEffect(() => {
    const finish = (event: PointerEvent) => finishDrag(event.pointerId);
    const finishOnBlur = () => finishDrag();
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    window.addEventListener('blur', finishOnBlur);
    return () => {
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      window.removeEventListener('blur', finishOnBlur);
      finishDrag();
    };
  }, [finishDrag]);

  const begin = (event: React.PointerEvent, key: string, row: number, column: number) => {
    if (results || !onChange || (event.pointerType === 'touch' && !allowTouchSelection)) return;
    event.preventDefault();
    const working = new Set(selected);
    const state: DragState = {
      pointerId: event.pointerId,
      add: !working.has(key),
      processed: new Set(),
      working,
      lastRow: row,
      lastColumn: column,
    };
    dragRef.current = state;
    rootRef.current?.setPointerCapture(event.pointerId);
    setDragging(true);
    applyCell(row, column);
  };

  const move = (event: React.PointerEvent) => {
    const state = dragRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    event.preventDefault();
    const edge = 90;
    if (event.clientY < edge) document.documentElement.scrollTop -= 14;
    else if (event.clientY > window.innerHeight - edge) document.documentElement.scrollTop += 14;
    const cell = cellAtPoint(event.clientX, event.clientY);
    if (cell) applyLine(cell.row, cell.column);
  };

  return (
    <div
      ref={rootRef}
      data-time-grid
      className={`overflow-auto rounded-xl border border-slate-200 bg-white ${dragging ? 'cursor-crosshair' : ''}`}
      onPointerMove={move}
      onPointerCancel={(event) => finishDrag(event.pointerId)}
      style={{ overscrollBehavior: 'contain' }}
    >
      <div
        className="grid min-w-[620px] select-none"
        style={{ gridTemplateColumns: `76px repeat(${dates.length}, minmax(128px, 1fr))` }}
      >
        <div className="sticky left-0 top-0 z-30 border-b border-r bg-slate-50 p-3 text-xs font-semibold text-slate-500">
          Время
        </div>
        {dates.map((date) => (
          <div key={date} className="sticky top-0 z-20 border-b border-r bg-slate-50 p-3 text-center text-sm font-bold capitalize text-slate-800">
            {shortDate(date)}
          </div>
        ))}
        {rows.map((time, row) => (
          <div className="contents" key={time}>
            <div className="sticky left-0 z-10 border-b border-r bg-white px-3 py-3 text-sm font-medium text-slate-500" style={{ touchAction: 'pan-y' }}>
              {time}
            </div>
            {dates.map((date, column) => {
              const key = `${date}T${time}`;
              const availablePeople = participants.filter((person) => person.slots.includes(key));
              const count = availablePeople.length;
              const ratio = participants.length ? count / participants.length : 0;
              const isSelected = selected.has(key);
              const unavailable = participants.filter((person) => !person.slots.includes(key));
              const title = results
                ? `${shortDate(date)}, ${time}. Свободны ${count} из ${participants.length}. ${availablePeople.map((p) => p.display_name).join(', ') || 'Никто'}${unavailable.length ? `. Не свободны: ${unavailable.map((p) => p.display_name).join(', ')}` : ''}`
                : undefined;
              return (
                <button
                  key={key}
                  type="button"
                  data-slot-cell
                  data-slot={key}
                  data-row={row}
                  data-column={column}
                  aria-label={`${shortDate(date)}, ${time}${results ? `, свободны ${count} из ${participants.length}` : isSelected ? ', выбрано' : ''}`}
                  aria-pressed={results ? undefined : isSelected}
                  title={title}
                  onPointerDown={(event) => begin(event, key, row, column)}
                  onClick={() => results && onSlotInspect?.(key)}
                  onKeyDown={(event) => {
                    if (!results && (event.key === ' ' || event.key === 'Enter')) {
                      event.preventDefault();
                      const next = new Set(selected);
                      if (isSelected) next.delete(key);
                      else next.add(key);
                      onChange?.(next);
                    }
                  }}
                  className={`focus-ring relative min-h-12 border-b border-r transition ${
                    results
                      ? 'cursor-pointer'
                      : isSelected
                        ? 'bg-brand-500 text-white hover:bg-brand-600'
                        : 'bg-white hover:bg-brand-50'
                  }`}
                  style={{
                    touchAction: results || !allowTouchSelection ? 'pan-y' : 'none',
                    ...(results && count
                      ? {
                          backgroundColor: `color-mix(in srgb, #16a34a ${Math.round(15 + ratio * 75)}%, white)`,
                          color: ratio > 0.6 ? 'white' : '#14532d',
                        }
                      : {}),
                  }}
                >
                  {results ? <span className="font-bold">{count || '—'}</span> : isSelected ? <Check className="mx-auto" size={18} /> : <span className="sr-only">Не выбрано</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
});
