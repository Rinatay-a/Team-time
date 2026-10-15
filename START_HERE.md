# Что осталось сделать владельцу

Проект подготовлен в ветке `codex/production-pages-supabase`. Дизайн и структура приложения сохранены. Публикация и подключение к облаку ещё не выполнены.

GitHub разрешил чтение репозитория, но отклонил создание удалённой ветки: `403 Resource not accessible by integration`. Поэтому Pull Request не создан. Ниже способ перенести готовую ветку без ручного копирования файлов.

## 1. Загрузить подготовленную ветку

1. Скачайте из ответа файл **Team-time-production.bundle**. Это Git-пакет с исходниками и готовым коммитом, без `node_modules`, сборки и секретов.
2. Установите **Git for Windows** и **GitHub Desktop**. В GitHub Desktop войдите в аккаунт `Rinatay-a` через браузер.
3. В папке, куда скачан bundle, откройте PowerShell и выполните:

```powershell
git clone --branch codex/production-pages-supabase .\Team-time-production.bundle Team-time-launch
Set-Location Team-time-launch
git remote set-url origin https://github.com/Rinatay-a/Team-time.git
```

4. GitHub Desktop → **File → Add local repository** → выберите папку `Team-time-launch`. Проверьте, что Current branch — `codex/production-pages-supabase`.
5. Нажмите **Publish branch** (или **Push origin**). Если Desktop сначала предлагает **Fetch origin**, нажмите её, затем **Publish branch**. Если интерфейс предлагает **Publish repository**, отмените: новый репозиторий создавать не нужно; проверьте URL origin из команды выше.
6. Нажмите **Create Pull Request**. В браузере выберите base **main**, compare **codex/production-pages-supabase** и создайте PR. Готовый текст описания находится в `PR_DESCRIPTION.md`.
7. Дождитесь зелёной проверки и нажмите **Merge pull request → Confirm merge**.

Если Git уже настроен для вашего GitHub, вместо шагов Desktop можно выполнить:

```powershell
git push -u origin codex/production-pages-supabase
```

И открыть https://github.com/Rinatay-a/Team-time/compare/main...codex/production-pages-supabase.
Пароли и токены не отправляйте в чат: вход выполняйте через GitHub Desktop/браузер.

## 2. Подключить сервисы

Далее откройте **[DEPLOYMENT.md](DEPLOYMENT.md)** и выполните шаги 2–7:

1. Создайте Supabase-проект и учётную запись организатора, отключите свободную регистрацию.
2. Примените миграции и опубликуйте функцию через готовый ручной workflow либо SQL Editor + CLI.
3. Добавьте в GitHub Variables Project URL и публичный ключ. Для автоматического backend-развёртывания отдельные секреты вводятся только в GitHub Secrets.
4. Включите **Settings → Pages → Source → GitHub Actions**, запустите **Публикация сайта**.
5. Проверьте сохранение и результаты с компьютера и телефона.

Будущий адрес: **https://rinatay-a.github.io/Team-time/**.

Вариант для просмотра исходников без Git: архив **Team-time-production-source.zip**. Для переноса готового коммита используйте bundle.
