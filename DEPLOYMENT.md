# Запуск «Времени команды» 2.0

Сайт после публикации: **https://rinatay-a.github.io/Team-time/**.
Ссылка участника: `https://rinatay-a.github.io/Team-time/#/meet/UUID`.
Символ `#` обязателен: HashRouter обеспечивает прямой вход и обновление страницы на GitHub Pages.

## 1. Принять подготовленные изменения

Если ветка ещё не загружена из-за ограничений подключения GitHub, сначала выполните **[START_HERE.md](START_HERE.md)**. Затем откройте Pull Request с веткой `codex/production-pages-supabase`. Дождитесь зелёной проверки **Проверки**, нажмите **Merge pull request → Confirm merge**.
В PR выполняются тесты, но сайт не публикуется. Первая публикация после слияния может остановиться на отсутствии настроек Supabase: заполните их ниже и запустите workflow повторно.

## 2. Создать или выбрать Supabase-проект

1. Откройте https://supabase.com/dashboard и войдите в свой аккаунт.
2. Для нового проекта: **New project**, организация, название `Team-time`, регион, надёжный пароль базы. Сохраните пароль в менеджере паролей. Дождитесь готовности проекта. Если проект уже есть, используйте его.
3. **Project Settings → General → Reference ID / Project ID** — идентификатор проекта, далее `PROJECT_REF`. Он также виден в адресе Dashboard: `/project/PROJECT_REF`.
4. В **Connect** либо **Project Settings → API / Data API** скопируйте **Project URL**: `https://PROJECT_REF.supabase.co`.
5. **Project Settings → API Keys → Publishable key**: скопируйте ключ `sb_publishable_…`. Допустим и старый `anon` key из вкладки **Legacy API Keys**.

URL и publishable/anon key публичны. **Secret key (`sb_secret_…`), `service_role`, пароль базы и access token не должны попадать в VITE-переменные, исходники или чат.** Supabase сама передаёт серверной функции её `SUPABASE_SERVICE_ROLE_KEY`.

## 3. Настроить вход организатора

1. **Authentication → Sign In / Providers → Email**: включите вход по email и паролю.
2. **Authentication → Users → Add user → Create new user**: создайте пользователя с вашим email и надёжным паролем. Включите **Auto Confirm User**, если переключатель показан. Пароль храните у себя.
3. В настройках Auth отключите **Allow new users to sign up**. Учётные записи организаторов создавайте вручную через Dashboard. Отключите **Allow anonymous sign-ins**.
4. **Authentication → URL Configuration → Site URL**: `https://rinatay-a.github.io/Team-time/`. В Redirect URLs можно добавить этот же адрес. Текущий вход использует пароль и не требует email-ссылки.

Участникам **не нужны аккаунты или анонимные сессии Supabase Auth**: они работают через публичные методы Edge Function. Административные методы проверяют JWT и владельца опроса. Другой организатор не получает доступ к вашим опросам.

## 4. Развернуть базу и функцию

Выберите вариант A для автоматизации через GitHub. Вариант B не требует хранить токен и пароль базы в GitHub.

### Вариант A: готовый GitHub Actions workflow

1. Репозиторий → **Settings → Secrets and variables → Actions → Variables → New repository variable**: создайте `SUPABASE_PROJECT_REF`, значение — Reference ID из шага 2.
2. В https://supabase.com/dashboard/account/tokens создайте **Personal access token**. Сохраните его только в GitHub → **Secrets → New repository secret** с именем `SUPABASE_ACCESS_TOKEN`. Не отправляйте токен в чат.
3. Там же создайте Secret `SUPABASE_DB_PASSWORD` с паролем **базы**, а не паролем входа организатора. Он нужен только для миграций.
4. **Actions → Развёртывание Supabase → Run workflow**, ветка **main**.
5. Для **нового пустого проекта** выберите `migrations-and-function` → **Run workflow**. Workflow применит `001`, `002`, `003` и опубликует `team-time-api`.
6. Для **существующей базы** сначала прочитайте подраздел ниже. Если SQL применён вручную, выбирайте `function-only`.
7. Дождитесь зелёного результата. В Supabase → **Edge Functions** должна появиться `team-time-api`.

Workflow запускается только вручную из `main`. Secrets не используются сборкой сайта и не попадают в JavaScript. Не давайте посторонним доступ к изменению workflows. Если дальнейшие обновления будете выполнять через CLI, после запуска можно удалить эти Secrets.

### Если база уже содержит таблицы и ответы

Перед миграцией проверьте резервную копию в **Database → Backups**. Если на тарифе её нет, используйте CLI из варианта B и сохраните оба файла вне репозитория:

```powershell
npx supabase@2.121.0 db dump --linked --file backup-schema.sql
npx supabase@2.121.0 db dump --linked --data-only --file backup-data.sql
```

Первый файл содержит схему, второй — данные. Для дампа CLI может потребоваться Docker Desktop. Храните файлы в защищённом месте, не загружайте в GitHub.

В **SQL Editor → New query** выполните целиком нужные файлы:

- Есть таблицы 1.0, но в `meetings` нет `poll_type`: сначала `supabase/migrations/002_poll_types_and_atomic_availability.sql`, затем `003_production_safety.sql`.
- Миграция 002 уже полностью применена: только `003_production_safety.sql`.
- `001_initial.sql` на существующей базе **не запускайте повторно**.

Миграция 003 исправляет ошибку реального сохранения, проверяет статус опроса внутри транзакции и уточняет защиту от конкурентного редактирования. UUID, токены и прежние ответы сохраняются.

Если прежние миграции выполнялись через SQL Editor, их может не быть в истории CLI. Пока история не согласована, используйте SQL Editor и `function-only`. Для перехода на `db push` проверьте `supabase migration list` и отметьте **только реально применённые** версии командой `supabase migration repair 001 002 003 --status applied`. Она меняет историю, а не выполняет SQL.

### Вариант B: SQL Editor + CLI на компьютере

Установите Node.js 22 LTS и Git. В PowerShell:

```powershell
git clone https://github.com/Rinatay-a/Team-time.git
Set-Location Team-time
npm ci
npx supabase@2.121.0 login
npx supabase@2.121.0 link --project-ref ВАШ_PROJECT_REF
```

Авторизуйтесь в открытом браузере. Если CLI просит пароль базы, вводите его только в локальном терминале.

Для нового проекта выполните в **SQL Editor** три файла полностью, по одному и по порядку:

1. `supabase/migrations/001_initial.sql`;
2. `supabase/migrations/002_poll_types_and_atomic_availability.sql`;
3. `supabase/migrations/003_production_safety.sql`.

Для существующей базы используйте правила выше. Альтернатива для новой базы с чистой историей: `npx supabase@2.121.0 db push` после `link`.

Опубликуйте функцию из корня репозитория:

```powershell
npx supabase@2.121.0 functions deploy team-time-api --project-ref ВАШ_PROJECT_REF --no-verify-jwt --use-api
```

В **Edge Functions → team-time-api → Details / Settings** убедитесь, что **Verify JWT with legacy secret** выключено. Это позволяет участвовать без регистрации и использовать новые publishable keys. Административные методы защищены внутри функции через `auth.getUser()` и `organizer_id`. Настройка также записана в `supabase/config.toml`.

## 5. Передать сайту публичные настройки

Откройте https://github.com/Rinatay-a/Team-time/settings/variables/actions → **New repository variable**:

| Имя | Значение |
|---|---|
| `VITE_SUPABASE_URL` | Project URL: `https://ВАШ_PROJECT_REF.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Publishable key `sb_publishable_…` либо legacy `anon` key |

Можно использовать одноимённые GitHub Secrets вместо Variables. Если заданы оба, приоритет у Variables. Эти две настройки публичны и будут доступны в опубликованном приложении.

`VITE_BASE_PATH=/Team-time/`, `VITE_API_FUNCTION=team-time-api` и `VITE_DEMO_MODE=false` workflow устанавливает сам. Сборка остановится без корректных публичных значений или при попытке использовать `service_role` / `sb_secret_…`.

## 6. Включить GitHub Pages

1. Откройте https://github.com/Rinatay-a/Team-time/settings/pages.
2. **Build and deployment → Source → GitHub Actions**.
3. Если Actions отключены: **Settings → Actions → General** → разрешите GitHub Actions, включая actions из workflows проекта.
4. **Actions → Публикация сайта → Run workflow**, ветка **main** → **Run workflow**. После изменения Variables запускайте новый workflow.
5. Дождитесь зелёных заданий **Проверки**, **Production-сборка**, **GitHub Pages**.
6. Откройте **https://rinatay-a.github.io/Team-time/**. Последующие изменения в `main` публикуются автоматически после проверок.

Если Pages запрашивает проверку environment, откройте запуск и нажмите **Review deployments**. При ошибке публикации проверьте Source = GitHub Actions и допуск ветки `main` в environment **github-pages**.

## 7. Проверить подключение и работу на двух устройствах

Необязательная автоматическая проверка без записи данных на компьютере из варианта B:

```powershell
Copy-Item .env.example .env.local
notepad .env.local
# Укажите только Project URL и publishable/anon key, сохраните файл.
npm run check:backend
```

Она проверяет запрет прямого доступа к таблицам, доступность публичной функции и запрет административного доступа без входа. Не создаёт и не изменяет ответы.

Проверка опубликованного сайта:

1. На компьютере войдите как организатор. Создайте **Сбор свободного времени**, оставьте видимость **Только организатор**. Скопируйте ссылку участника.
2. На телефоне или в приватном окне откройте ссылку. Введите имя, отметьте интервалы, нажмите **Сохранить доступность**. Должно появиться **Ответ сохранён**.
3. Обновите страницу в том же браузере, измените выбор, сохраните снова. В результатах остаётся один ответ участника с обновлёнными интервалами.
4. На другом устройстве/в другом браузере откройте ту же ссылку, введите другое имя и сохраните. В панели организатора появятся оба ответа; фоновое обновление занимает до 20 секунд.
5. Проверьте тепловую карту, состав свободных по ячейке и поиск свободного блока. Создайте **Планирование встречи**, соберите ответы, проверьте рекомендации, назначение времени и `.ics`.
6. Закройте сбор и убедитесь, что новые ответы и изменения не принимаются. При видимости **Только организатор** участник не видит чужие имена и расписания.
7. Откройте ссылку напрямую в новой вкладке и обновите страницу. Адрес должен содержать `/Team-time/#/meet/…`.

**Редактирование без регистрации:** секретный 256-битный токен хранится в браузере участника, в базе — его SHA-256. Имя не является паролем. Свой ответ редактируется в том же браузере, пока сохранены данные сайта. Другое устройство создаёт независимый ответ и не может менять прежний по совпавшему имени. При потере данных браузера организатор может удалить старый ответ, после чего участник заполнит новый. Приватное окно теряет токен после закрытия.

## 8. Проверки перед следующими обновлениями

```powershell
npm ci
npm run lint
npm test
npx playwright install chromium
npm run test:e2e
npm run test:pages
npm audit --json
npm audit --omit=dev --json
```

`npm run test:pages` собирает приложение без демо с **фиктивной публичной конфигурацией** и проверяет его в браузере с подменой HTTP API. Не публикуйте эту тестовую сборку вручную. Workflow отдельно пересобирает сайт с реальными Variables. Для обычной production-сборки с заполненным `.env.local`: `npm run build`.

`npm test` выполняет миграции в PostgreSQL (PGlite), проверяет RLS, откат, конфликты и большие ответы, а также HTTP-обработчик функции с подменой сетевого клиента. Работу вашего облачного проекта подтверждает отдельно шаг 7.

## 9. Если что-то не работает

| Симптом | Что проверить |
|---|---|
| Красная Production-сборка | Variables URL/key без пробелов и шаблонных значений; затем новый Run workflow |
| Сайт 404 | Source = GitHub Actions, зелёное задание GitHub Pages, точный регистр `/Team-time/` |
| Опрос не открывается | Символ `#` в ссылке; функция `team-time-api`; тот же Supabase-проект в frontend и CLI |
| 401 / Invalid JWT у участников | Verify JWT выключено для функции; public/anon key верен |
| Ошибка сохранения / ambiguous participant_id | Применена миграция 003; опубликована последняя функция |
| Организатор не может войти | Пользователь создан и подтверждён в Auth → Users; Email provider включён |
| Другой организатор не видит опросы | Каждый организатор видит свои опросы — штатная защита |
| table/type already exists при миграциях | База уже создана вручную: согласуйте историю либо выполните нужный SQL и используйте function-only |

Логи: **Supabase → Edge Functions → team-time-api → Logs** и **GitHub → Actions → нужный запуск**. Не публикуйте секреты и данные участников при пересылке логов.

## 10. Эксплуатация и откат

Удаляйте завершённые опросы согласно сроку хранения; архивирование оставляет ответы в базе. Следите за Backups и Logs. Встроенный лимит запросов рассчитан на небольшую команду.

При ошибке обновления верните предыдущий frontend и функцию. Миграция 003 не удаляет данные. Базу восстанавливайте из backup только при необходимости; не удаляйте вручную таблицы, UUID, `poll_type` и токены.

Запуск завершён после успешной публикации Pages, развёрнутой функции и проверки сохранения в вашем облачном Supabase по шагу 7.
