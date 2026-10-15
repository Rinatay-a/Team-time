import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Archive, Copy, Download, Lock, RotateCcw, Trash2, Users } from 'lucide-react';
import { api } from '../services/api';
import type { BestInterval, Meeting, Participant } from '../types';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { CalendarPager } from '../components/calendar/CalendarPager';
import { BestIntervals } from '../components/BestIntervals';
import { findBestIntervals, slotKeys, toUtc } from '../lib/time';

export function ResultsPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [meeting, setMeeting] = useState<Meeting>();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [analysisDuration, setAnalysisDuration] = useState(90);
  const [inspectedSlot, setInspectedSlot] = useState<string>();
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await api.adminMeeting(id);
      setMeeting(response.meeting);
      setParticipants(response.participants);
    } catch (caught) {
      setError((caught as Error).message);
    }
  }, [id]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 20_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const best = useMemo(
    () => meeting ? findBestIntervals(
      meeting,
      participants,
      5,
      meeting.poll_type === 'availability' ? analysisDuration : undefined,
    ) : [],
    [meeting, participants, analysisDuration],
  );

  async function finalize(interval: BestInterval) {
    if (!meeting || meeting.poll_type !== 'meeting') return;
    if (!confirm(`Назначить встречу ${interval.date} с ${interval.start} до ${interval.end}?`)) return;
    try {
      await api.adminAction('admin_finalize', id, {
        startsAt: toUtc(`${interval.date}T${interval.start}`, meeting.timezone),
        endsAt: toUtc(`${interval.date}T${interval.end}`, meeting.timezone),
      });
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  function exportCsv() {
    if (!meeting) return;
    const keys = slotKeys(meeting);
    const rows = [
      ['Участник', ...keys],
      ...participants.map((person) => [
        person.display_name,
        ...keys.map((key) => person.slots.includes(key) ? 'Да' : 'Нет'),
      ]),
    ];
    const content = '\ufeff' + rows
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(';'))
      .join('\r\n');
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    anchor.download = `dostupnost-${meeting.id}.csv`;
    anchor.click();
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${location.origin}${location.pathname}#/meet/${id}`);
      setNotice('Ссылка скопирована');
    } catch {
      setError('Не удалось скопировать ссылку. Скопируйте адрес из строки браузера.');
    }
  }

  if (error && !meeting) return <div className="p-10 text-center text-red-600">{error}</div>;
  if (!meeting) return <div className="p-16 text-center">Загрузка результатов…</div>;

  const available = inspectedSlot ? participants.filter((person) => person.slots.includes(inspectedSlot)) : [];
  const unavailable = inspectedSlot ? participants.filter((person) => !person.slots.includes(inspectedSlot)) : [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="text-sm font-bold text-brand-700">{meeting.poll_type === 'availability' ? 'Свободное время' : 'Планирование встречи'} · Панель организатора</span>
          <h1 className="text-3xl font-black">{meeting.title}</h1>
          <p className="mt-2 text-slate-500">Ответили: {participants.length}{meeting.invitees_count ? ` из ${meeting.invitees_count}` : ''}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={copyLink}><Copy size={17} />Ссылка</Button>
          <Button variant="secondary" onClick={exportCsv}><Download size={17} />CSV</Button>
          <Button variant="secondary" onClick={async () => {
            if (!confirm(meeting.status === 'closed' ? 'Возобновить сбор ответов?' : 'Закрыть сбор ответов?')) return;
            try { await api.adminAction(meeting.status === 'closed' ? 'admin_reopen' : 'admin_close', id); await load(); }
            catch (caught) { setError((caught as Error).message); }
          }}>{meeting.status === 'closed' ? <RotateCcw size={17} /> : <Lock size={17} />}{meeting.status === 'closed' ? 'Возобновить' : 'Закрыть сбор'}</Button>
          <Button variant="ghost" onClick={async () => {
            if (!confirm('Переместить опрос в архив? Ответы сохранятся.')) return;
            try { await api.adminAction('admin_archive', id); await load(); }
            catch (caught) { setError((caught as Error).message); }
          }}><Archive size={17} />В архив</Button>
          <Button variant="ghost" onClick={async () => {
            if (prompt(`Для удаления введите название опроса:\n${meeting.title}`) !== meeting.title) return;
            try { await api.adminAction('admin_delete_meeting', id); navigate('/admin'); }
            catch (caught) { setError((caught as Error).message); }
          }}><Trash2 size={17} />Удалить опрос</Button>
        </div>
      </div>

      {(notice || error) && <div role="status" className={`mt-4 rounded-xl p-3 ${error ? 'bg-red-50 text-red-700' : 'bg-brand-50 text-brand-700'}`}>{error || notice}</div>}

      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Card className="p-5"><div className="flex items-center gap-2"><Users className="text-brand-600" /><h2 className="text-xl font-bold">Тепловая карта</h2></div><p className="mt-1 text-sm text-slate-500">Число в ячейке — сколько ответивших свободны. Нажмите на ячейку для состава.</p></Card>
          <CalendarPager meeting={meeting} participants={participants} results onSlotInspect={setInspectedSlot} />
          {inspectedSlot && <Card className="p-5"><h3 className="font-bold">{inspectedSlot.replace('T', ', ')}</h3><p className="mt-2 text-sm"><b>Свободны ({available.length}):</b> {available.map((person) => person.display_name).join(', ') || 'никто'}</p><p className="mt-1 text-sm"><b>Не свободны ({unavailable.length}):</b> {unavailable.map((person) => person.display_name).join(', ') || 'никто'}</p></Card>}
        </div>

        <div className="space-y-5">
          {meeting.poll_type === 'availability' && <Card className="p-5"><h2 className="font-bold">Найти свободный блок</h2><p className="mt-1 text-sm text-slate-500">Аналитика за период, а не назначение одной встречи.</p><select className="input" value={analysisDuration} onChange={(event) => setAnalysisDuration(Number(event.target.value))}>{[30, 60, 90, 120, 180].filter((value) => value % meeting.slot_duration === 0).map((value) => <option key={value} value={value}>{value} минут</option>)}</select></Card>}
          <BestIntervals meeting={meeting} items={best} onFinalize={meeting.poll_type === 'meeting' ? finalize : undefined} />
        </div>
      </div>

      <Card className="mt-6 p-5">
        <h2 className="text-xl font-bold">Участники</h2>
        {!participants.length ? <p className="mt-3 text-slate-500">Ответов пока нет.</p> : <div className="mt-4 divide-y divide-slate-100">{participants.map((person) => <div key={person.id} className="flex items-center justify-between gap-3 py-3"><div><b>{person.display_name}</b><div className="text-sm text-slate-500">Выбрано интервалов: {person.slots.length}</div></div><Button variant="ghost" aria-label={`Удалить ответ ${person.display_name}`} onClick={async () => { if (confirm('Удалить этот ответ? Участнику потребуется создать новый.')) { await api.adminAction('admin_delete_participant', id, { participantId: person.id }); await load(); } }}><Trash2 size={17} /></Button></div>)}</div>}
      </Card>
      <p className="mt-5 text-xs text-slate-500">ФИО и расписание являются персональными данными. Удаляйте завершённые опросы в соответствии с правилами вашей организации.</p>
    </div>
  );
}
