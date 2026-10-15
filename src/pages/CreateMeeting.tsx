import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarRange, CalendarSearch, Check, Plus, X } from 'lucide-react';
import { addDays, format } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { api, supabase } from '../services/api';
import { demoRequested } from '../lib/config';
import { datesInRange, minutes, prettyDate } from '../lib/time';
import type { PollType } from '../types';

const todayMoscow = formatInTimeZone(new Date(), 'Europe/Moscow', 'yyyy-MM-dd');
const weekdayOptions = [
  [1, 'Пн'], [2, 'Вт'], [3, 'Ср'], [4, 'Чт'], [5, 'Пт'], [6, 'Сб'], [0, 'Вс'],
] as const;

export function CreateMeeting() {
  const navigate = useNavigate();
  const [pollType, setPollType] = useState<PollType | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [meetingDates, setMeetingDates] = useState<string[]>([todayMoscow]);
  const [rangeStart, setRangeStart] = useState(todayMoscow);
  const [rangeEnd, setRangeEnd] = useState(format(addDays(new Date(`${todayMoscow}T12:00:00`), 27), 'yyyy-MM-dd'));
  const [weekdays, setWeekdays] = useState(new Set([1, 2, 3, 4, 5, 6, 0]));
  const [startHour, setStartHour] = useState('09:00');
  const [endHour, setEndHour] = useState('23:00');
  const [slotDuration, setSlotDuration] = useState(30);
  const [meetingDuration, setMeetingDuration] = useState(90);
  const [visibility, setVisibility] = useState<'organizer' | 'everyone'>('organizer');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!demoRequested) supabase.auth.getSession().then(({ data }) => {
      if (!data.session) navigate('/login');
    });
  }, [navigate]);

  const availabilityDates = useMemo(
    () => datesInRange(rangeStart, rangeEnd, weekdays),
    [rangeStart, rangeEnd, weekdays],
  );
  const dates = pollType === 'availability' ? availabilityDates : meetingDates;

  const setQuickRange = (days: number) => {
    setRangeEnd(format(addDays(new Date(`${rangeStart}T12:00:00`), days - 1), 'yyyy-MM-dd'));
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (!pollType) return setError('Сначала выберите тип опроса.');
    if (minutes(startHour) >= minutes(endHour)) return setError('Время окончания должно быть позже начала.');
    if (!dates.length) return setError('В выбранном периоде нет дат.');
    if (dates.length > 56) return setError('Период может содержать не более 56 выбранных дней.');
    if (pollType === 'meeting') {
      if (meetingDuration % slotDuration !== 0) return setError('Продолжительность должна быть кратна шагу сетки.');
      if (meetingDuration > minutes(endHour) - minutes(startHour)) return setError('Встреча не помещается в дневной диапазон.');
    }
    setBusy(true);
    try {
      const { meeting } = await api.createMeeting({
        poll_type: pollType,
        title,
        description,
        dates: [...dates].sort(),
        start_hour: startHour,
        end_hour: endHour,
        slot_duration: slotDuration,
        meeting_duration: pollType === 'meeting' ? meetingDuration : null,
        timezone: 'Europe/Moscow',
        results_visibility: visibility,
      });
      navigate(`/admin/meet/${meeting.id}`);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-black">Создать опрос</h1>
      <p className="mt-2 text-slate-500">Сначала выберите задачу — настройки подстроятся автоматически.</p>

      <div className="mt-7 grid gap-4 md:grid-cols-2">
        <TypeCard
          active={pollType === 'availability'}
          recommended
          icon={<CalendarRange />}
          title="Собрать свободное время"
          description="Узнайте, когда участники свободны в течение нескольких дней или недель"
          onClick={() => setPollType('availability')}
        />
        <TypeCard
          active={pollType === 'meeting'}
          icon={<CalendarSearch />}
          title="Подобрать время встречи"
          description="Выберите подходящее время для одного заседания или мероприятия"
          onClick={() => setPollType('meeting')}
        />
      </div>

      {pollType && (
        <form onSubmit={submit} className="mt-6">
          <Card className="space-y-7 p-5 md:p-7">
            <div className="grid gap-5">
              <label className="block font-semibold">
                Название
                <input required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={pollType === 'availability' ? 'Свободное время команды на ноябрь' : 'Заседание Молодёжной палаты'} className="focus-ring mt-2 w-full rounded-xl border border-slate-300 px-3 py-3" />
              </label>
              <label className="block font-semibold">
                Описание или инструкция
                <textarea maxLength={2000} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} className="focus-ring mt-2 w-full rounded-xl border border-slate-300 px-3 py-3" />
              </label>
            </div>

            {pollType === 'availability' ? (
              <fieldset>
                <legend className="text-lg font-bold">Период доступности</legend>
                <div className="mt-3 flex flex-wrap gap-2">
                  {[7, 14, 21, 28, 42].map((days) => <Button key={days} type="button" variant="secondary" onClick={() => setQuickRange(days)}>{days} дней</Button>)}
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="font-semibold">С даты<input type="date" required value={rangeStart} onChange={(event) => setRangeStart(event.target.value)} className="focus-ring mt-2 w-full rounded-xl border border-slate-300 px-3 py-3" /></label>
                  <label className="font-semibold">По дату<input type="date" required min={rangeStart} value={rangeEnd} onChange={(event) => setRangeEnd(event.target.value)} className="focus-ring mt-2 w-full rounded-xl border border-slate-300 px-3 py-3" /></label>
                </div>
                <div className="mt-4">
                  <div className="mb-2 text-sm font-semibold">Дни недели</div>
                  <div className="flex flex-wrap gap-2">
                    {weekdayOptions.map(([value, label]) => <button key={value} type="button" aria-pressed={weekdays.has(value)} onClick={() => setWeekdays((current) => { const next = new Set(current); if (next.has(value)) next.delete(value); else next.add(value); return next; })} className={`focus-ring min-h-11 rounded-xl border px-4 font-semibold ${weekdays.has(value) ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-500'}`}>{label}</button>)}
                  </div>
                </div>
                <div className="mt-4 rounded-xl bg-brand-50 p-4 text-sm text-brand-800">
                  Выбрано дат: <b>{availabilityDates.length}</b>{availabilityDates.length ? ` · ${prettyDate(availabilityDates[0])} — ${prettyDate(availabilityDates.at(-1)!)}` : ''}
                </div>
              </fieldset>
            ) : (
              <fieldset>
                <legend className="text-lg font-bold">Предлагаемые даты</legend>
                <div className="mt-3 space-y-2">
                  {meetingDates.map((date, index) => <div key={index} className="flex gap-2"><input required type="date" value={date} onChange={(event) => setMeetingDates((current) => current.map((value, dateIndex) => dateIndex === index ? event.target.value : value))} className="focus-ring min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-3" /><Button type="button" variant="ghost" aria-label="Удалить дату" onClick={() => setMeetingDates((current) => current.filter((_, dateIndex) => dateIndex !== index))}><X size={18} /></Button></div>)}
                </div>
                <Button type="button" variant="secondary" className="mt-2" onClick={() => setMeetingDates((current) => [...current, todayMoscow])}><Plus size={17} />Добавить дату</Button>
              </fieldset>
            )}

            <fieldset>
              <legend className="text-lg font-bold">Сетка времени</legend>
              <p className="mt-1 text-sm text-slate-500">Это видимые ежедневные границы календаря.</p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Начало"><input type="time" required value={startHour} onChange={(event) => setStartHour(event.target.value)} className="input" /></Field>
                <Field label="Окончание"><input type="time" required value={endHour} onChange={(event) => setEndHour(event.target.value)} className="input" /></Field>
                <Field label="Шаг"><select value={slotDuration} onChange={(event) => setSlotDuration(Number(event.target.value))} className="input"><option value={15}>15 минут</option><option value={30}>30 минут</option></select></Field>
                {pollType === 'meeting' && <Field label="Продолжительность встречи"><select value={meetingDuration} onChange={(event) => setMeetingDuration(Number(event.target.value))} className="input">{[30, 45, 60, 90, 120, 180].filter((value) => value % slotDuration === 0).map((value) => <option value={value} key={value}>{value} минут</option>)}</select></Field>}
              </div>
            </fieldset>

            <Field label="Кто видит общие результаты?"><select value={visibility} onChange={(event) => setVisibility(event.target.value as 'organizer' | 'everyone')} className="input"><option value="organizer">Только организатор</option><option value="everyone">Все участники</option></select></Field>
            <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600"><b>Часовой пояс:</b> Europe/Moscow</div>
            {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}
            <Button disabled={busy} className="w-full sm:w-auto">{busy ? 'Создаём…' : 'Создать опрос'}</Button>
          </Card>
        </form>
      )}
    </div>
  );
}

function TypeCard({ active, recommended, icon, title, description, onClick }: { active: boolean; recommended?: boolean; icon: React.ReactNode; title: string; description: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`focus-ring relative rounded-2xl border-2 bg-white p-6 text-left shadow-soft transition hover:-translate-y-0.5 ${active ? 'border-brand-600' : 'border-transparent'}`}>{recommended && <span className="absolute right-4 top-4 rounded-full bg-brand-100 px-2 py-1 text-xs font-bold text-brand-700">Рекомендуем</span>}<span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-100 text-brand-700">{active ? <Check /> : icon}</span><h2 className="mt-5 text-xl font-bold">{title}</h2><p className="mt-2 text-slate-500">{description}</p></button>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block font-semibold">{label}{children}</label>;
}
