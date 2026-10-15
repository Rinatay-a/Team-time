import { createClient } from '@supabase/supabase-js';
import type { CreateMeetingInput, Meeting, PublicMeetingData } from '../types';
import { demoRequested, hasSupabaseConfig } from '../lib/config';
import { demoMeeting, demoParticipants } from '../lib/demo';

const url = import.meta.env.VITE_SUPABASE_URL || 'https://configuration-required.invalid';
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || 'configuration-required';
export const supabase = createClient(url, key);
const functionName = import.meta.env.VITE_API_FUNCTION || 'team-time-api';

async function call<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  if (!hasSupabaseConfig) throw new Error('Подключение к Supabase не настроено.');
  const { data, error } = await supabase.functions.invoke(functionName, { body: { action, ...body } });
  if (error) throw new Error(error.message);
  if (data?.error) {
    const typed = new Error(data.error) as Error & { code?: string; current?: unknown };
    typed.code = data.code;
    typed.current = data.current;
    throw typed;
  }
  return data as T;
}

export const api = {
  async publicMeeting(id: string, editToken?: string): Promise<PublicMeetingData> {
    if (demoRequested && id === 'demo') {
      const own = editToken ? JSON.parse(localStorage.getItem('demo-response') || 'null') : undefined;
      return {
        meeting: demoMeeting,
        myResponse: own || undefined,
        canViewResults: true,
        participants: demoParticipants,
        updatedAt: new Date().toISOString(),
      };
    }
    return call('public_meeting', { meetingId: id, editToken });
  },

  async saveAvailability(
    meetingId: string,
    displayName: string,
    slots: string[],
    editToken?: string,
    expectedUpdatedAt?: string,
    createIfMissing = false,
  ) {
    if (demoRequested && meetingId === 'demo') {
      const savedToken = editToken || crypto.randomUUID();
      const participant = {
        id: 'mine', display_name: displayName, slots, updated_at: new Date().toISOString(),
      };
      localStorage.setItem('demo-response', JSON.stringify(participant));
      return { participant, editToken: savedToken };
    }
    return call<{
      participant: { id: string; display_name: string; slots: string[]; updated_at: string };
      editToken: string;
    }>('save_availability', { meetingId, displayName, slots, editToken, expectedUpdatedAt, createIfMissing });
  },

  async myMeetings(): Promise<Meeting[]> {
    if (demoRequested) return [{ ...demoMeeting, responses_count: 12 }];
    return call('admin_list');
  },

  async createMeeting(input: CreateMeetingInput) {
    if (demoRequested) return { meeting: { ...demoMeeting, ...input, id: crypto.randomUUID() } };
    return call<{ meeting: Meeting }>('admin_create', { input });
  },

  async adminMeeting(id: string) {
    if (demoRequested) return { meeting: demoMeeting, participants: demoParticipants };
    return call<{ meeting: Meeting; participants: any[] }>('admin_detail', { meetingId: id });
  },

  async adminAction(action: string, meetingId: string, payload: Record<string, unknown> = {}) {
    if (demoRequested) return { ok: true };
    return call(action, { meetingId, ...payload });
  },
};
