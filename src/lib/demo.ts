import type { Meeting, Participant } from '../types';
import { datesInRange, slotKeys } from './time';

const dates = datesInRange('2026-10-19', '2026-11-15');
export const demoMeeting: Meeting = {
  id: 'demo',
  poll_type: 'availability',
  title: 'Свободное время команды на четыре недели',
  description: 'Отметьте часы, когда вы теоретически можете участвовать в мероприятиях команды.',
  organizer_name: 'Молодёжная палата',
  timezone: 'Europe/Moscow',
  start_hour: '09:00',
  end_hour: '23:00',
  slot_duration: 30,
  meeting_duration: null,
  results_visibility: 'everyone',
  status: 'collecting',
  dates,
};

const names = [
  'Анна Соколова', 'Михаил Петров', 'Дарья Кузнецова', 'Алексей Иванов',
  'Мария Орлова', 'Илья Смирнов', 'Софья Волкова', 'Никита Морозов',
  'Полина Фёдорова', 'Артём Лебедев', 'Елена Новикова', 'Денис Попов',
];
const allSlots = slotKeys(demoMeeting);
export const demoParticipants: Participant[] = names.map((display_name, index) => ({
  id: `p${index}`,
  display_name,
  slots: allSlots.filter((_, slotIndex) => ((slotIndex * 7 + index * 3) % 13) > 2),
}));
