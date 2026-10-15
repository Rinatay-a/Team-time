import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CalendarCheck, CheckCircle2, Lock, Save, ShieldCheck, Sparkles } from 'lucide-react';
import { api } from '../services/api';
import type { PublicMeetingData } from '../types';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { CalendarPager } from '../components/calendar/CalendarPager';
import { BestIntervals } from '../components/BestIntervals';
import { findBestIntervals, humanDuration, makeIcs } from '../lib/time';

type Step = 'name' | 'calendar' | 'saved';
type Draft = { name: string; slots: string[]; savedAt: number };
const DRAFT_TTL = 7 * 24 * 60 * 60 * 1000;

export function ParticipantPage() {
  const { id = '' } = useParams();
  const tokenKey = `team-time-token:${id}`;
  const draftKey = `team-time-draft:${id}`;
  const pendingTokenKey = `team-time-pending-token:${id}`;
  const initialized = useRef(false);
  const [data, setData] = useState<PublicMeetingData>();
  const [name, setName] = useState('');
  const [selected, setSelected] = useState(new Set<string>());
  const [serverUpdatedAt, setServerUpdatedAt] = useState<string>();
  const [step, setStep] = useState<Step>('name');
  const [tab, setTab] = useState<'mine' | 'results'>('mine');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async (initial = false) => {
    const response = await api.publicMeeting(id, localStorage.getItem(tokenKey) || undefined);
    setData(response);
    if (initial && !initialized.current) {
      initialized.current = true;
      const storedDraft = readDraft(draftKey);
      if (response.myResponse) {
        setName(storedDraft?.name || response.myResponse.display_name);
        setSelected(new Set(storedDraft?.slots || response.myResponse.slots));
        setServerUpdatedAt(response.myResponse.updated_at);
        setDirty(Boolean(storedDraft));
        setStep('calendar');
      } else if (storedDraft) {
        setName(storedDraft.name);
        setSelected(new Set(storedDraft.slots));
        setDirty(true);
      }
    }
  }, [draftKey, id, tokenKey]);

  useEffect(() => {
    refresh(true).catch((caught) => setError((caught as Error).message));
    const timer = window.setInterval(() => {
      refresh(false).catch(() => undefined); // Не трогаем локальный черновик при фоновом сбое.
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!dirty) return;
    const draft: Draft = { name, slots: [...selected], savedAt: Date.now() };
    localStorage.setItem(draftKey, JSON.stringify(draft));
  }, [dirty, draftKey, name, selected]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const best = useMemo(
    () => data?.participants && data.meeting.poll_type === 'meeting'
      ? findBestIntervals(data.meeting, data.participants)
      : [],
    [data],
  );

  const editSelection = (next: Set<string>) => {
    setSelected(next);
    setDirty(true);
    setError('');
  };

  async function save() {
    if (!name.trim()) return setError('Укажите имя и фамилию.');
    setBusy(true);
    setError('');
    try {
      const savedToken = localStorage.getItem(tokenKey);
      let tokenForRequest = savedToken || localStorage.getItem(pendingTokenKey);
      if (!tokenForRequest) {
        tokenForRequest = secureBrowserToken();
        localStorage.setItem(pendingTokenKey, tokenForRequest);
      }
      const result = await api.saveAvailability(
        id,
        name.trim(),
        [...selected],
        tokenForRequest,
        serverUpdatedAt,
        !savedToken,
      );
      localStorage.setItem(tokenKey, result.editToken);
      localStorage.removeItem(pendingTokenKey);
      localStorage.removeItem(draftKey);
      setServerUpdatedAt(result.participant.updated_at);
      setDirty(false);
      setStep('saved');
      await refresh(false);
    } catch (caught) {
      const failure = caught as Error & { code?: string };
      setError(failure.code === 'conflict'
        ? 'Ответ был изменён в другой вкладке. Обновите страницу, чтобы сравнить изменения, или обратитесь к организатору.'
        : `Не удалось сохранить: ${failure.message}. Ваш выбор остался на устройстве — попробуйте ещё раз.`);
    } finally {
      setBusy(false);
    }
  }

  if (!data && error) return <Message title="Не удалось открыть опрос" text={error} />;
  if (!data) return <div className="p-16 text-center" role="status">Загрузка опроса…</div>;
  const meeting = data.meeting;

  if (meeting.status === 'finalized' && meeting.finalized_start) {
    return <FinalMeeting data={meeting} />;
  }
  if (meeting.status !== 'collecting' && !data.myResponse) {
    return <Message icon={<Lock className="text-slate-500" size={38} />} title="Сбор ответов закрыт" text="Организатор больше не принимает новые ответы." />;
  }
  if (step === 'name') {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-2xl items-center px-4 py-10">
        <Card className="w-full p-7 md:p-10">
          <div className="text-sm font-bold text-brand-700">{meeting.poll_type === 'availability' ? 'Сбор свободного времени' : 'Планирование встречи'}</div>
          <h1 className="mt-2 text-3xl font-black md:text-4xl">Привет! Как тебя зовут?</h1>
          <p className="mt-3 text-lg text-slate-600">Укажи имя и фамилию — так организатор поймёт, чей это ответ.</p>
          <div className="mt-7 rounded-2xl bg-slate-50 p-5">
            <h2 className="font-bold">{meeting.title}</h2>
            <p className="mt-1 text-sm text-slate-500">{meeting.description}</p>
          </div>
          <form className="mt-7" onSubmit={(event) => { event.preventDefault(); if (name.trim()) setStep('calendar'); else setError('Укажите имя и фамилию.'); }}>
            <label className="text-sm font-bold">Имя и фамилия<input autoFocus maxLength={100} value={name} onChange={(event) => { setName(event.target.value); setDirty(true); }} placeholder="Например, Анна Соколова" className="input mt-2 text-lg" /></label>
            {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}
            <Button className="mt-5 w-full">Продолжить →</Button>
          </form>
          <p className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-500"><ShieldCheck size={16} />Без регистрации. Имя и расписание видит организатор.</p>
        </Card>
      </div>
    );
  }
  if (step === 'saved') {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-xl items-center px-4 py-10">
        <Card className="w-full p-8 text-center">
          <CheckCircle2 className="mx-auto text-brand-600" size={48} />
          <h1 className="mt-5 text-3xl font-black">Ответ сохранён</h1>
          <p className="mt-3 text-slate-600">Данные записаны на сервер. Пока опрос открыт, вы можете изменить свой выбор на этом устройстве.</p>
          <Button className="mt-7" onClick={() => setStep('calendar')}>Изменить ответ</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6">
        <div className="text-sm font-bold text-brand-700">{meeting.poll_type === 'availability' ? 'Сбор свободного времени' : 'Планирование встречи'} · {meeting.organizer_name || 'Время команды'}</div>
        <h1 className="mt-1 text-3xl font-black">{meeting.title}</h1>
        <p className="mt-2 max-w-3xl text-slate-600">{meeting.description}</p>
      </header>

      {data.canViewResults && (
        <div className="mb-5 inline-flex rounded-xl bg-slate-200 p-1">
          <button onClick={() => setTab('mine')} className={`rounded-lg px-4 py-2 font-semibold ${tab === 'mine' ? 'bg-white shadow-sm' : ''}`}>Моё время</button>
          <button onClick={() => setTab('results')} className={`rounded-lg px-4 py-2 font-semibold ${tab === 'results' ? 'bg-white shadow-sm' : ''}`}>Общие результаты</button>
        </div>
      )}

      {tab === 'mine' ? (
        <div className="space-y-5">
          <Card className="border-brand-100 bg-brand-50 p-5">
            <div className="flex gap-3"><Sparkles className="shrink-0 text-brand-600" /><div><h2 className="font-bold">{meeting.poll_type === 'availability' ? 'Отметьте все интервалы, когда вы свободны' : 'Отметьте интервалы, когда сможете участвовать во встрече'}</h2><p className="mt-1 text-sm text-slate-600">{meeting.poll_type === 'availability' ? 'Это не обещание прийти на конкретное мероприятие — организатор увидит общую картину доступности.' : 'Можно выбрать несколько отдельных промежутков.'}</p></div></div>
          </Card>
          <div className="flex flex-wrap items-center justify-between gap-2"><button className="focus-ring rounded-lg px-2 py-1 text-sm font-semibold text-slate-600" onClick={() => setStep('name')}>Ответ: {name} · изменить имя</button><Button variant="ghost" onClick={() => { if (selected.size < 20 || confirm('Очистить весь выбранный календарь?')) editSelection(new Set()); }}>Очистить всё</Button></div>
          <CalendarPager meeting={meeting} selected={selected} onChange={editSelection} />
          {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}
          <div className="sticky bottom-3 z-30 flex justify-end"><Button disabled={busy || meeting.status !== 'collecting'} onClick={save} className="shadow-lg"><Save size={18} />{busy ? 'Сохраняем…' : dirty ? 'Сохранить доступность' : 'Сохранено'}</Button></div>
        </div>
      ) : (
        <div className="space-y-5">
          <Card className="p-5"><b>Ответили: {data.participants?.length || 0} человек</b><p className="mt-1 text-sm text-slate-500">Обновлено: {data.updatedAt ? new Date(data.updatedAt).toLocaleTimeString('ru-RU') : 'нет данных'}</p></Card>
          <CalendarPager meeting={meeting} participants={data.participants} results />
          {meeting.poll_type === 'meeting' && <BestIntervals meeting={meeting} items={best} />}
        </div>
      )}
    </div>
  );
}

function secureBrowserToken() {
  return [...crypto.getRandomValues(new Uint8Array(32))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function readDraft(key: string): Draft | null {
  try {
    const draft = JSON.parse(localStorage.getItem(key) || 'null') as Draft | null;
    if (!draft || Date.now() - draft.savedAt > DRAFT_TTL) { localStorage.removeItem(key); return null; }
    return draft;
  } catch { return null; }
}

function Message({ title, text, icon }: { title: string; text: string; icon?: React.ReactNode }) {
  return <div className="mx-auto max-w-xl px-4 py-16"><Card className="p-8 text-center">{icon}<h1 className="mt-3 text-2xl font-bold">{title}</h1><p className="mt-2 text-slate-600">{text}</p></Card></div>;
}

function FinalMeeting({ data }: { data: PublicMeetingData['meeting'] }) {
  return <div className="mx-auto max-w-2xl px-4 py-16"><Card className="p-7 text-center"><CalendarCheck className="mx-auto text-brand-600" size={40} /><h1 className="mt-4 text-3xl font-black">Время встречи определено!</h1><p className="mt-5 text-xl font-bold">{new Date(data.finalized_start!).toLocaleString('ru-RU', { timeZone: data.timezone, dateStyle: 'long', timeStyle: 'short' })}</p><p className="mt-2 text-slate-500">Продолжительность — {humanDuration(data.meeting_duration || 0)}</p><p className="mt-6">{data.description}</p><Button className="mt-7" onClick={() => { const anchor = document.createElement('a'); anchor.href = URL.createObjectURL(new Blob([makeIcs(data)], { type: 'text/calendar;charset=utf-8' })); anchor.download = 'vstrecha.ics'; anchor.click(); }}>Добавить в календарь</Button></Card></div>;
}
