import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
const clean = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max);
const sha256 = async (value: string) => Array.from(new Uint8Array(
  await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)))
  .map((byte) => byte.toString(16).padStart(2, '0')).join('');
const timeMinutes = (value: string) => {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return NaN;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : NaN;
};
const validDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(+date) && date.toISOString().slice(0, 10) === value;
};
const localParts = (date: Date, timezone: string) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  return Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
};
const formatLocalKey = (date: Date, timezone: string) => {
  const parts = localParts(date, timezone);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
};
function localToUtc(key: string, timezone: string) {
  const [date, time] = key.split('T');
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  const wanted = Date.UTC(year, month - 1, day, hours, minutes);
  let guess = wanted;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const parts = localParts(new Date(guess), timezone);
    const shown = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
    guess += wanted - shown;
  }
  const result = new Date(guess);
  if (formatLocalKey(result, timezone) !== key) throw new Error(`Несуществующее местное время: ${key}`);
  return result;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Метод не поддерживается' }, 405);
  if (Number(request.headers.get('content-length') || 0) > 2_000_000) return json({ error: 'Слишком большой запрос' }, 413);

  try {
    const body = await request.json();
    const action = clean(body.action, 40);
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const db = createClient(url, serviceKey, { auth: { persistSession: false } });

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    const rateKey = await sha256(ip);
    const { data: rate } = await db.from('api_rate_limits').select('*').eq('key_hash', rateKey).maybeSingle();
    const freshWindow = !rate || Date.now() - Date.parse(rate.window_start) >= 60_000;
    if (!freshWindow && rate.request_count > 90) return json({ error: 'Слишком много запросов. Повторите через минуту.' }, 429);
    await db.from('api_rate_limits').upsert({
      key_hash: rateKey,
      window_start: freshWindow ? new Date().toISOString() : rate.window_start,
      request_count: freshWindow ? 1 : rate.request_count + 1,
    });

    const meetingId = clean(body.meetingId, 36);
    async function authenticatedUser() {
      const authorization = request.headers.get('Authorization');
      if (!authorization) throw new Error('Требуется вход организатора');
      const client = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
      const { data: { user } } = await client.auth.getUser();
      if (!user) throw new Error('Сессия истекла');
      return user;
    }
    async function getMeeting(id = meetingId) {
      const { data, error } = await db.from('meetings')
        .select('*,meeting_dates(date),meeting_invitees(count)').eq('id', id).single();
      if (error) throw new Error('Опрос не найден');
      return {
        ...data,
        poll_type: data.poll_type || 'meeting',
        dates: data.meeting_dates.map((item: { date: string }) => item.date).sort(),
        invitees_count: data.meeting_invitees?.[0]?.count ?? 0,
        meeting_dates: undefined,
        meeting_invitees: undefined,
      };
    }
    async function ownedMeeting() {
      const user = await authenticatedUser();
      const meeting = await getMeeting();
      if (meeting.organizer_id !== user.id) throw new Error('Нет доступа к этому опросу');
      return meeting;
    }
    async function participantsSnapshot(id: string) {
      const { data, error } = await db.rpc('get_meeting_participants_snapshot', { p_meeting_id: id });
      if (error) throw error;
      return data || [];
    }
    async function participantSnapshot(id: string, tokenHash: string) {
      const { data, error } = await db.rpc('get_participant_snapshot', {
        p_meeting_id: id,
        p_token_hash: tokenHash,
      });
      if (error) throw error;
      return data || null;
    }

    if (action === 'public_meeting') {
      const meeting = await getMeeting();
      let myResponse = null;
      const editToken = clean(body.editToken, 128);
      if (editToken) myResponse = await participantSnapshot(meeting.id, await sha256(editToken));
      let participants;
      const canViewResults = meeting.results_visibility === 'everyone';
      if (canViewResults) participants = await participantsSnapshot(meeting.id);
      delete meeting.organizer_id;
      return json({ meeting, myResponse, canViewResults, participants, updatedAt: new Date().toISOString() });
    }

    if (action === 'save_availability') {
      const meeting = await getMeeting();
      if (meeting.status !== 'collecting') throw new Error('Сбор ответов закрыт');
      const displayName = clean(body.displayName, 100);
      if (!displayName) throw new Error('Укажите имя и фамилию');
      if (!Array.isArray(body.slots)) throw new Error('Некорректный список времени');

      const start = timeMinutes(String(meeting.start_hour).slice(0, 5));
      const end = timeMinutes(String(meeting.end_hour).slice(0, 5));
      const slotsPerDay = Math.floor((end - start) / meeting.slot_duration);
      const maxSlots = meeting.dates.length * slotsPerDay;
      if (body.slots.length > maxSlots || body.slots.length > 5_500) throw new Error('Слишком много интервалов для этого опроса');
      const uniqueKeys = [...new Set(body.slots.map((value: unknown) => clean(value, 16)))];
      if (uniqueKeys.length !== body.slots.length) throw new Error('Ответ содержит повторяющиеся интервалы');
      const allowedDates = new Set(meeting.dates);
      const rows = uniqueKeys.map((key) => {
        const [date, time] = key.split('T');
        const value = timeMinutes(time);
        if (!validDate(date) || !allowedDates.has(date) || !Number.isFinite(value)) throw new Error(`Недопустимый интервал: ${key}`);
        if (value < start || value >= end || (value - start) % meeting.slot_duration !== 0) throw new Error(`Интервал не соответствует сетке: ${key}`);
        const startsAt = localToUtc(key, meeting.timezone);
        return {
          slot_key: key,
          starts_at: startsAt.toISOString(),
          ends_at: new Date(startsAt.getTime() + meeting.slot_duration * 60_000).toISOString(),
        };
      });

      let editToken = clean(body.editToken, 128);
      if (editToken) {
        const { data: existing } = await db.from('participants').select('id')
          .eq('meeting_id', meeting.id).eq('edit_token_hash', await sha256(editToken)).maybeSingle();
        if (!existing && body.createIfMissing !== true) throw new Error('Токен редактирования недействителен. Старый ответ нельзя изменить по совпавшему имени.');
        if (!existing && !/^[a-f0-9]{64}$/.test(editToken)) throw new Error('Некорректный токен нового ответа');
      } else editToken = randomToken();

      const tokenHash = await sha256(editToken);
      const expected = clean(body.expectedUpdatedAt, 40) || null;
      const { data: saved, error } = await db.rpc('save_participant_availability_atomic', {
        p_meeting_id: meeting.id,
        p_display_name: displayName,
        p_token_hash: tokenHash,
        p_expected_updated_at: expected,
        p_slots: rows,
      });
      if (error) {
        if (error.message.includes('availability_conflict')) return json({ error: 'Ответ уже изменён в другой вкладке', code: 'conflict' }, 409);
        throw error;
      }
      const savedRow = saved[0];
      return json({
        participant: { id: savedRow.participant_id, display_name: displayName, slots: uniqueKeys, updated_at: savedRow.participant_updated_at },
        editToken,
      });
    }

    if (action === 'admin_list') {
      const user = await authenticatedUser();
      const { data, error } = await db.from('meetings')
        .select('*,meeting_dates(date),participants(count),meeting_invitees(count)')
        .eq('organizer_id', user.id).order('created_at', { ascending: false });
      if (error) throw error;
      return json((data || []).map((meeting: any) => ({
        ...meeting,
        poll_type: meeting.poll_type || 'meeting',
        dates: meeting.meeting_dates.map((item: { date: string }) => item.date).sort(),
        responses_count: meeting.participants[0]?.count || 0,
        invitees_count: meeting.meeting_invitees[0]?.count || 0,
        meeting_dates: undefined, participants: undefined, meeting_invitees: undefined,
      })));
    }

    if (action === 'admin_create') {
      const user = await authenticatedUser();
      const input = body.input || {};
      const pollType = input.poll_type === 'availability' ? 'availability' : 'meeting';
      const dates = Array.isArray(input.dates)
        ? [...new Set(input.dates.map((date: unknown) => clean(date, 10)))].sort()
        : [];
      if (!dates.length || dates.length > 56 || dates.some((date) => !validDate(date))) throw new Error('Укажите от 1 до 56 корректных дат');
      const start = timeMinutes(clean(input.start_hour, 5));
      const end = timeMinutes(clean(input.end_hour, 5));
      const step = Number(input.slot_duration);
      const duration = pollType === 'meeting' ? Number(input.meeting_duration) : null;
      if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || ![15, 30].includes(step)) throw new Error('Некорректная сетка времени');
      if (pollType === 'meeting' && (!duration || duration % step !== 0 || duration > end - start)) throw new Error('Некорректная продолжительность встречи');
      const row = {
        organizer_id: user.id,
        poll_type: pollType,
        title: clean(input.title, 120),
        description: clean(input.description, 2000),
        organizer_name: clean(input.organizer_name, 120) || null,
        timezone: clean(input.timezone, 64) || 'Europe/Moscow',
        start_hour: input.start_hour,
        end_hour: input.end_hour,
        slot_duration: step,
        meeting_duration: duration,
        results_visibility: input.results_visibility === 'everyone' ? 'everyone' : 'organizer',
      };
      if (!row.title) throw new Error('Укажите название');
      try { new Intl.DateTimeFormat('ru-RU', { timeZone: row.timezone }).format(); }
      catch { throw new Error('Неизвестный часовой пояс'); }
      const { data: created, error } = await db.from('meetings').insert(row).select('*').single();
      if (error) throw error;
      const { error: datesError } = await db.from('meeting_dates').insert(dates.map((date) => ({ meeting_id: created.id, date })));
      if (datesError) { await db.from('meetings').delete().eq('id', created.id); throw datesError; }
      return json({ meeting: { ...created, dates } });
    }

    if (action === 'admin_detail') {
      const meeting = await ownedMeeting();
      return json({ meeting, participants: await participantsSnapshot(meeting.id) });
    }

    const meeting = await ownedMeeting();
    if (action === 'admin_finalize') {
      if (meeting.poll_type !== 'meeting' || !meeting.meeting_duration) throw new Error('В опросе свободного времени нельзя назначить одну встречу');
      if (!['collecting', 'closed'].includes(meeting.status)) throw new Error('В этом статусе назначить встречу нельзя');
      const startsAt = new Date(body.startsAt);
      const endsAt = new Date(body.endsAt);
      if (!Number.isFinite(+startsAt) || !Number.isFinite(+endsAt) || startsAt >= endsAt) throw new Error('Некорректное итоговое время');
      if ((+endsAt - +startsAt) / 60_000 !== meeting.meeting_duration) throw new Error('Интервал не соответствует длительности встречи');
      const startKey = formatLocalKey(startsAt, meeting.timezone);
      const endKey = formatLocalKey(endsAt, meeting.timezone);
      const startDate = startKey.slice(0, 10);
      const startValue = timeMinutes(startKey.slice(11));
      const endValue = timeMinutes(endKey.slice(11));
      const gridStart = timeMinutes(String(meeting.start_hour).slice(0, 5));
      const gridEnd = timeMinutes(String(meeting.end_hour).slice(0, 5));
      if (!meeting.dates.includes(startDate) || endKey.slice(0, 10) !== startDate || startValue < gridStart || endValue > gridEnd || (startValue - gridStart) % meeting.slot_duration !== 0) throw new Error('Выбранное время не входит в варианты опроса');
      await db.from('meetings').update({ status: 'finalized', finalized_start: startsAt.toISOString(), finalized_end: endsAt.toISOString() }).eq('id', meeting.id);
      return json({ ok: true });
    }
    if (action === 'admin_archive') {
      await db.from('meetings').update({ status: 'archived' }).eq('id', meeting.id);
      return json({ ok: true });
    }
    if (action === 'admin_delete_meeting') {
      await db.from('meetings').delete().eq('id', meeting.id);
      return json({ ok: true });
    }
    if (action === 'admin_close' || action === 'admin_reopen') {
      if (meeting.status === 'archived' || meeting.status === 'finalized') throw new Error('Этот статус нельзя изменить');
      await db.from('meetings').update({ status: action === 'admin_close' ? 'closed' : 'collecting' }).eq('id', meeting.id);
      return json({ ok: true });
    }
    if (action === 'admin_delete_participant') {
      await db.from('participants').delete().eq('id', clean(body.participantId, 36)).eq('meeting_id', meeting.id);
      return json({ ok: true });
    }
    return json({ error: 'Неизвестная операция' }, 400);
  } catch (caught) {
    console.error(caught);
    return json({ error: caught instanceof Error ? caught.message : 'Ошибка сервера' }, 400);
  }
});
