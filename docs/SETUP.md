# Подключение GrowthThread

Production: [growththread.pages.dev](https://growththread.pages.dev). На 13 октября 2026 года Supabase, Pages Functions, Turnstile, Resend и Cron настроены. Первый настоящий email/MFA-вход владельца проверен, пространство команды создано. Instagram ещё не подключён. Ниже — инструкция для воспроизведения конфигурации и последующего подключения Meta.

## 1. Локальный просмотр

Node.js 24+, `npm ci`, затем `npm run dev`. Стартовая страница: http://127.0.0.1:5173/. Демо: http://127.0.0.1:5173/?demo=1. Его изменения сохраняются только в этом браузере. Демоматериалы ведут на example.com.

Vite сам не запускает Pages Functions. Настоящий вход проверяйте на HTTPS-домене Cloudflare после настройки. В production оставьте `VITE_ENABLE_DEMO=false`.

## 2. Supabase и закрытая команда

Создайте Free-проект и сохраните пароль базы в менеджере паролей. Установите [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started), затем:

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Применяются все десять SQL-миграций. Альтернатива — выполнить их по порядку в SQL Editor, без повторного ручного применения.

В облачных настройках Auth отключите общую публичную регистрацию (`auth.enable_signup=false`), но оставьте включённым Email provider (`auth.email.enable_signup=true`): этот второй параметр включает сам способ входа по email. Включите подтверждение email, TOTP enrollment и verification. Установите email OTP: 8 цифр, срок 600 секунд; Site URL — точный HTTPS-адрес приложения. Локальный `supabase/config.toml` описывает эти настройки, но `db push` сам не переносит настройки облачного Auth.

Администраторский `generateLink` создаёт код для подтверждения email; письмо отправляет сервер через Resend. Создание Auth identity не означает доступ к приложению: его разрешает только приватное приглашение и MFA.

Вне репозитория подготовлен файл `../.replyfolio-private/team-bootstrap.sql` с двумя согласованными адресами и ролями. Выполните его в SQL Editor после миграций. Не копируйте его в проект, issue, публичные инструкции или build variables. Таблица `private.team_invites` по умолчанию пустая; разрешения по домену нет.

Первым входит владелец: email-код → настройка аутентификатора → TOTP-код. Он создаёт общее пространство. Затем второй участник проходит тот же вход и получает роль manager в этом пространстве. Посетители вне списка видят лист ожидания после подтверждения email, без создания пространства.

## 3. Turnstile и email

Создайте [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/get-started/) widget с точным доменом приложения. Публичный site key идёт в `VITE_TURNSTILE_SITE_KEY`; secret key — только в Supabase. Сервер проверяет token, hostname и action=login. Не используйте тестовые ключи в production.

В Resend добавьте свой домен отправителя и подтвердите его DNS-записи. Создайте API key с доступом к отправке для этого домена. `EMAIL_FROM` должен использовать подтверждённого отправителя. [Проверка домена Resend](https://resend.com/docs/dashboard/domains/introduction).

Текущий отправитель: `GrowthThread <login@auth.orot.study>`. Поддомен подтверждён отдельно; добавлены DKIM и два CNAME отправки, DMARC `_dmarc.auth.orot.study` использует `p=reject`. Основные DNS и MX-записи `orot.study` не менялись. Resend key ограничен отправкой с этого поддомена, отслеживание открытий/кликов не включено, TLS — Enforced.

Коды входа не публикуются и не записываются в журнал приложения. Первую настоящую доставку письма нужно проверить после настройки сервиса.

Для базы включено обязательное SSL на внешних SQL-соединениях. Для прямых клиентов используйте `sslmode=verify-full` с CA Supabase. HTTP API работают через HTTPS независимо от этой настройки. [SSL enforcement](https://supabase.com/docs/guides/platform/ssl-enforcement).

## 4. Серверные секреты Supabase

Скопируйте `supabase/.env.example` в исключённый из Git `supabase/.env.local`.

| Переменная                    | Значение                                                     |
| ----------------------------- | ------------------------------------------------------------ |
| APP_URL                       | Точный HTTPS-origin приложения, без preview-доменов          |
| GATEWAY_SECRET                | Независимый случайный hex-секрет; тот же секрет в Cloudflare |
| RATE_LIMIT_SECRET             | Другой случайный hex-секрет для HMAC ключей лимитов          |
| SESSION_ENCRYPTION_KEY        | Независимые 32 байта в base64, шифрование токенов входа      |
| TOKEN_ENCRYPTION_KEY          | Другие 32 байта в base64, шифрование Instagram токенов       |
| TURNSTILE_SECRET_KEY          | Secret key widget                                            |
| RESEND_API_KEY                | Серверный ключ отправки                                      |
| EMAIL_FROM                    | Подтверждённый отправитель                                   |
| WORKER_SECRET                 | Независимый hex-секрет очереди                               |
| META_APP_ID / META_APP_SECRET | Пара Instagram Login из продукта Instagram в Meta            |
| META_WEBHOOK_SECRET           | App Secret приложения, которое подписывает webhook           |
| META_VERIFY_TOKEN             | Независимая случайная строка проверки webhook                |
| META_GRAPH_VERSION            | v26.0; сверяйте версию при обновлении Meta                   |

Генерируйте каждое значение отдельно:

```sh
openssl rand -hex 32
openssl rand -base64 32
```

Не переиспользуйте ключи. SUPABASE_URL, SUPABASE_ANON_KEY и SUPABASE_SERVICE_ROLE_KEY предоставляет Edge runtime; в браузер эти ключи не передаются. Не записывайте секреты в tracked-файлы, логи, `VITE_*` или переписку.

```sh
supabase secrets set --env-file supabase/.env.local
supabase functions deploy auth --no-verify-jwt
supabase functions deploy workspace-api --no-verify-jwt
supabase functions deploy instagram-connect --no-verify-jwt
supabase functions deploy instagram-callback --no-verify-jwt
supabase functions deploy instagram-webhook --no-verify-jwt
supabase functions deploy automation-worker --no-verify-jwt
```

JWT-проверка стандартного gateway отключена осознанно: кабинет требует подписанный Pages запрос, серверную cookie-сессию, проверенную Auth identity и MFA; webhook — подпись Meta; worker — собственный секрет. Прямой запрос к защищённым Edge endpoints без подписи Pages не даёт доступа.

## 5. Cloudflare Pages + Functions

Приложению нужен и статический фронтенд, и папка `functions`. Настройте Git integration либо Wrangler. Dashboard drag-and-drop папки dist не компилирует Pages Functions; для этого проекта такой способ неполон. [Документация Cloudflare](https://developers.cloudflare.com/pages/get-started/direct-upload/#functions).

Для Git integration: корень GrowthThread, Vite, `npm run build`, каталог `dist`, Node 24+. Локальный Git пока без remote.

Публичные build variables:

```env
VITE_TURNSTILE_SITE_KEY=YOUR_PUBLIC_SITE_KEY
VITE_ENABLE_DEMO=false
```

Серверные bindings/secrets Pages:

- SUPABASE_URL = HTTPS-адрес проекта Supabase.
- GATEWAY_SECRET = тот же независимый секрет, что в Supabase Edge.

Задайте GATEWAY_SECRET как secret. Не помещайте service_role, Meta или encryption keys в Pages. Доступ к production секретам не выдавайте preview deployments. Preview без backend-секретов показывает стартовую страницу, но не допускает вход.

При использовании Wrangler выполняйте команды **из корня проекта**, чтобы он обнаружил `functions`:

```sh
npm run build
npx wrangler login
npx wrangler pages project create growththread
npx wrangler pages secret put GATEWAY_SECRET --project-name growththread
npx wrangler pages secret put SUPABASE_URL --project-name growththread
npx wrangler pages deploy dist --project-name growththread --branch main
```

Имя облачного проекта может отличаться; согласуйте его с `wrangler.toml`. После получения домена задайте APP_URL и Turnstile hostname, затем пересоберите с правильным site key. [Конфигурация Pages Functions](https://developers.cloudflare.com/pages/functions/wrangler-configuration/).

Notion подходит для справки и ссылки на кабинет. Он не размещает React и сервер. Cloudflare Pages/Functions имеют отдельные бесплатные лимиты; Vercel Hobby предназначен для личного некоммерческого использования. [Pages limits](https://developers.cloudflare.com/pages/platform/limits/), [Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/), [Vercel Hobby](https://vercel.com/docs/plans/hobby).

Проверьте в живом браузере: HTTPS, CSP/HSTS, HttpOnly Secure SameSite cookie, отсутствие токенов в localStorage и ответах API; email → MFA → workspace; посторонний email → согласие на waitlist; прямой URL кабинета без входа; logout; отзыв приглашения. Не ограничивайтесь визуальным переключением экранов.

## 6. Очередь и очистка

В Supabase включите Cron (pg_cron), pg_net и Vault. В Vault создайте:

- replyfolio_project_url = HTTPS-адрес Supabase.
- replyfolio_worker_secret = точное значение WORKER_SECRET.

Выполните `supabase/setup/schedule.sql` после миграций. Каждую минуту SQL очищает истёкшие коды, OAuth states, proxy nonces и старые записи безопасности, затем проверяет очередь. HTTP-вызова при отсутствии задач нет. Подключённый Instagram получает ежедневную проверку токенов. [Supabase scheduling](https://supabase.com/docs/guides/functions/schedule-functions).

```sql
select jobid, jobname, active from cron.job where jobname='replyfolio-worker';
select status, count(*) from private.jobs group by status;
select id, kind, status, attempts, error, created_at
from private.jobs where status='failed' order by created_at desc limit 20;
```

Не публикуйте payload: в нём могут быть сообщения. При зависшей очереди проверьте Cron history, Vault и совпадение WORKER_SECRET.

## 7. Meta и Instagram

Переведите Instagram в **Business или Creator**. Creator подходит. Business Verification приложения Meta — отдельная процедура. Используется Instagram Login; Facebook Page для этого пути не требуется.

Создайте Meta developer app с Instagram API и Instagram Login. Настройте:

- instagram_business_basic
- instagram_business_manage_messages
- instagram_business_manage_comments

Добавьте собственный профессиональный аккаунт в роли/тестеры и примите приглашение. Standard Access позволяет готовить тестирование в пределах ролей. Для рабочего webhook актуальная инструкция Meta требует Live-режим, Advanced Access и Business Verification. Не считайте локальный тест подтверждением App Review. [Meta webhook setup](https://developers.facebook.com/documentation/instagram-platform/webhooks/setup?locale=en_US).

**OAuth Redirect URI теперь находится на домене приложения:**

```text
https://YOUR_APP_DOMAIN/api/instagram-callback
```

Webhook остаётся прямым Supabase endpoint:

```text
https://YOUR_PROJECT.supabase.co/functions/v1/instagram-webhook
```

Verify token — META_VERIFY_TOKEN. Поля: messages, messaging_postbacks, messaging_referrals, messaging_seen, comments. Заполните и опубликуйте собственные HTTPS-страницы политики и удаления данных из шаблонов в docs; внесите их в Meta.

Владелец входит по email + MFA и открывает «Настройки → Подключить Instagram». При необходимости подтвердит MFA ещё раз, затем повторит действие. OAuth привязан к инициировавшей сессии, роли владельца и отдельной cookie браузера. В одном пространстве разрешено переподключение того же Instagram; подмена другим аккаунтом блокируется.

Источники: [Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/), [Messaging API](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/), [Private Replies](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/private-replies/).

## 8. Реальная проверка бота

Новое облачное пространство пустое: демоданные не переносятся.

1. Добавьте настоящие публичные материалы и прайс.
2. Создайте сценарий, замените тексты, задайте keywords и при необходимости ID публикаций; сохраните и включите.
3. С другого разрешённого тестового аккаунта отправьте DM; проверьте ответ, кнопки, контакт и заявку.
4. Оставьте комментарий: одно первое приватное сообщение, дальнейшие ответы только после DM пользователя.
5. Ответьте менеджером из кабинета и Instagram; проверьте паузу бота, «стоп» и «менеджер».
6. Проверьте задержку, очередь, отключение, переподключение и журнал. Сверьте сообщения в самом Instagram.

Обычные сообщения ограничены 24-часовым окном после входящего DM. Приватный ответ на комментарий — одно первое сообщение в пределах 7 дней; продолжение после ответа. HUMAN_AGENT, Live comments и отдельный рекламный 7-дневный режим не реализованы. PDF выдаётся ссылкой. Текст до 1000 байт UTF-8, quick replies до 13.

accepted означает принятие API, а не прочтение. uncertain («Не подтверждено») после сетевого сбоя требует проверки Direct до повторной отправки.

## 9. Обслуживание

Роли, отзыв сессий, MFA recovery и ротация ключей: [SECURITY.md](SECURITY.md). Бесплатные квоты проверяйте в [Supabase pricing](https://supabase.com/pricing); Free не даёт гарантий доступности платного production-плана.

Экспорт кабинета содержит последние 1000 сообщений и 100 событий. Полный бэкап включает базу, Auth identities/их UUID и отдельные Storage-файлы. Ключи шифрования храните отдельно; восстановление приглашения на новый user UUID автоматически запрещено.

Завершённые задачи, дедупликация и security audit очищаются через 30 дней; истёкшие серверные сессии — через день, rate buckets — через три дня. Контакты/переписка и waitlist автоматически не удаляются: определите срок и применяйте свою политику. Проверяйте старые PDF перед ручной очисткой Storage.
