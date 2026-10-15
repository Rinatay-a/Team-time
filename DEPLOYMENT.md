# Обновление и публикация «Времени команды» 2.0

Инструкция обновляет существующий проект. Удалять Supabase-проект, пользователей или старые таблицы **не нужно**.

## 1. Резервная копия

Перед миграцией откройте Supabase → **Project Settings → Database → Backups**. На платном тарифе создайте/проверьте backup. На бесплатном тарифе сделайте дамп через Supabase CLI/PostgreSQL:

```powershell
supabase login
supabase link --project-ref ВАШ_PROJECT_REF
supabase db dump -f backup-before-2.0.sql
```

Сохраните файл вне публичного GitHub-репозитория. Он может содержать персональные данные.

## 2. Получение проекта и локальная проверка Windows

Установите Node.js 20.19+ и Git. В PowerShell:

```powershell
Expand-Archive .\team-time-2.0-source.zip .\team-time-2.0
Set-Location .\team-time-2.0\team-time
npm ci
Copy-Item .env.example .env.local
notepad .env.local
```

Заполните только публичные значения из Supabase → **Project Settings → API**:

```env
VITE_SUPABASE_URL=https://PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=PUBLIC_OR_ANON_KEY
VITE_API_FUNCTION=team-time-api
VITE_BASE_PATH=/ИМЯ_РЕПОЗИТОРИЯ/
VITE_DEMO_MODE=false
```

Никогда не помещайте `service_role` в `.env.local`, GitHub Secrets с префиксом `VITE_` или frontend.

## 3. Применение миграции

### Через SQL Editor
1. Supabase → **SQL Editor → New query**.
2. Откройте локальный файл `supabase/migrations/002_poll_types_and_atomic_availability.sql`.
3. Скопируйте весь SQL и нажмите **Run** один раз.
4. В **Table Editor → meetings** проверьте колонку `poll_type`: у старых строк должно быть `meeting`.
5. У старых строк `meeting_duration` остаётся прежним; старые UUID не меняются.

`001_initial.sql` повторно не запускайте и не редактируйте. Для нового пустого проекта примените сначала 001, затем 002.

### Через CLI

```powershell
supabase db push
```

Перед `db push` проверьте, что CLI связан именно с production-проектом.

## 4. Обновление Edge Function

```powershell
supabase functions deploy team-time-api --no-verify-jwt
```

`--no-verify-jwt` позволяет открыть публичное сохранение без регистрации. Административные методы сами проверяют JWT и владельца. Стандартные `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` Supabase передаёт функции автоматически; не копируйте service role в репозиторий.

## 5. Проверки локально

```powershell
npm run lint
npm test
npm run build
npm audit --json
npm audit --omit=dev --json
npm run dev
```

Откройте адрес Vite. Проверьте:
1. Старую ссылку `/#/meet/UUID` и прежний ответ.
2. Новый опрос свободного времени на 42 дня без длительности.
3. Сохранение ответа в приватном окне.
4. Старую встречу с поиском 90 минут и финализацией.

Для E2E один раз установите браузер:

```powershell
npx playwright install chromium
npm run test:e2e
```

## 6. GitHub Pages

1. Сделайте commit только после локальных проверок:

```powershell
git add .
git status
git commit -m "Время команды 2.0"
git push origin main
```

2. GitHub → репозиторий → **Settings → Secrets and variables → Actions**.
3. Проверьте `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY`. Не добавляйте service role.
4. **Settings → Pages → Source → GitHub Actions**.
5. **Actions → Публикация сайта**: дождитесь зелёного результата.
6. Workflow сам задаёт `VITE_BASE_PATH=/${repository.name}/`.

## 7. Проверка опубликованной версии

На ПК и телефоне:
- откройте главную и создайте оба типа опроса;
- отправьте ссылку второму браузеру/приватному окну;
- проведите мышью по 10 ячейкам и пальцем по нескольким часам;
- переключите неделю, вернитесь и убедитесь, что выбор сохранился;
- сохраните, обновите страницу и проверьте восстановление;
- проверьте, что закрытый опрос не принимает ответ;
- при видимости «только организатор» убедитесь, что участник не видит чужие ФИО;
- проверьте старую ссылку и назначение старой встречи.

## 8. Откат

Если миграция прошла, но frontend ещё не опубликован, версия 1.0 продолжит читать старые поля: существующие встречи остаются `meeting`, длительность сохранена. При серьёзной ошибке сначала верните предыдущий frontend/Edge Function, затем восстановите БД из backup. Не удаляйте вручную `poll_type` или SQL-функции на рабочей базе без согласованного rollback-скрипта.

## 9. Эксплуатация

- Регулярно архивируйте/удаляйте завершённые опросы согласно принятому сроку хранения.
- Повторяйте `npm audit` перед выпуском.
- Просматривайте Supabase Functions Logs на ошибки и всплески запросов.
- Для широкого публичного доступа добавьте WAF/rate limiting; встроенный лимит рассчитан на небольшую команду.
- Отдельно проверьте требования к обработке ФИО и региону хранения Supabase с ответственным за персональные данные.
