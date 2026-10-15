import { publicConfigError } from './config-validation';

export const appConfig = {
  name: 'Время команды',
  tagline: 'Находим время, удобное для всех',
  subtitle: 'Сервис планирования Молодёжной палаты Чертанова Центрального',
};

export const demoRequested = import.meta.env.VITE_DEMO_MODE === 'true';
export const hasSupabaseConfig = !publicConfigError(import.meta.env);

export function assertRuntimeConfig() {
  if (!hasSupabaseConfig && !demoRequested) {
    throw new Error(
      'Приложение не настроено: добавьте VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY или явно включите VITE_DEMO_MODE=true.',
    );
  }
}
