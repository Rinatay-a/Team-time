import { useEffect, useState } from 'react';
import { CalendarPlus, Copy, ExternalLink } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { api, supabase } from '../services/api';
import type { Meeting } from '../types';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { prettyDate } from '../lib/time';
import { demoRequested } from '../lib/config';

const status = { collecting: 'Сбор ответов', finalized: 'Встреча назначена', closed: 'Сбор закрыт', archived: 'В архиве' };

export function Dashboard() {
  const [items, setItems] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      if (!demoRequested) {
        const { data } = await supabase.auth.getSession();
        if (!data.session) return navigate('/login');
      }
      try { setItems(await api.myMeetings()); }
      catch (caught) { setError((caught as Error).message); }
      finally { setLoading(false); }
    })();
  }, [navigate]);

  const copy = async (id: string) => {
    try { await navigator.clipboard.writeText(`${location.origin}${location.pathname}#/meet/${id}`); }
    catch { setError('Не удалось скопировать ссылку.'); }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div><h1 className="text-3xl font-black">Мои опросы</h1><p className="mt-1 text-slate-500">Собирайте доступность или планируйте конкретную встречу.</p></div>
        <Link to="/admin/new"><Button><CalendarPlus size={18} />Создать опрос</Button></Link>
      </div>
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}
      {loading ? <p>Загрузка…</p> : !items.length ? <Card className="p-10 text-center"><h2 className="font-bold">Опросов пока нет</h2><p className="mt-2 text-slate-500">Создайте первый опрос и отправьте ссылку участникам.</p></Card> : <div className="grid gap-4 md:grid-cols-2">{items.map((meeting) => <Card className="p-5" key={meeting.id}><div className="flex items-start justify-between gap-3"><div><div className="mb-2 text-xs font-bold uppercase tracking-wide text-brand-700">{meeting.poll_type === 'availability' ? 'Свободное время' : 'Встреча'}</div><h2 className="text-lg font-bold">{meeting.title}</h2><p className="mt-1 text-sm text-slate-500">{meeting.dates.length ? `${prettyDate(meeting.dates[0])}${meeting.dates.length > 1 ? ` — ${prettyDate(meeting.dates.at(-1)!)}` : ''}` : 'Даты не заданы'}</p></div><span className="rounded-full bg-brand-100 px-2.5 py-1 text-xs font-bold text-brand-700">{status[meeting.status]}</span></div><p className="mt-5 font-medium">Ответили: {meeting.responses_count ?? 0}{meeting.invitees_count ? ` из ${meeting.invitees_count}` : ''}</p><div className="mt-5 flex flex-wrap gap-2"><Link to={`/admin/meet/${meeting.id}`}><Button variant="secondary"><ExternalLink size={16} />Результаты</Button></Link><Button variant="ghost" onClick={() => copy(meeting.id)}><Copy size={16} />Ссылка</Button></div></Card>)}</div>}
    </div>
  );
}
