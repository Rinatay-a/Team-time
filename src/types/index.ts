export type MeetingStatus = 'collecting' | 'finalized' | 'closed' | 'archived';
export type ResultsVisibility = 'organizer' | 'everyone';
export type PollType = 'availability' | 'meeting';

export interface Meeting {
  id: string;
  poll_type: PollType;
  title: string;
  description: string;
  organizer_name?: string;
  timezone: string;
  start_hour: string;
  end_hour: string;
  slot_duration: number;
  meeting_duration: number | null;
  results_visibility: ResultsVisibility;
  status: MeetingStatus;
  dates: string[];
  finalized_start?: string | null;
  finalized_end?: string | null;
  responses_count?: number;
  invitees_count?: number;
  created_at?: string;
}

export interface Participant {
  id: string;
  display_name: string;
  slots: string[];
  updated_at?: string;
}

export interface PublicMeetingData {
  meeting: Meeting;
  myResponse?: Participant;
  canViewResults: boolean;
  participants?: Participant[];
  updatedAt?: string;
}

export interface BestInterval {
  date: string;
  start: string;
  end: string;
  available: number;
  total: number;
  percent: number;
  availableNames: string[];
  unavailableNames: string[];
}

export interface CreateMeetingInput {
  poll_type: PollType;
  title: string;
  description: string;
  dates: string[];
  start_hour: string;
  end_hour: string;
  slot_duration: number;
  meeting_duration: number | null;
  timezone: string;
  results_visibility: ResultsVisibility;
  organizer_name?: string;
  invitees?: string[];
}
