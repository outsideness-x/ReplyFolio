# Подключение ReplyFolio

Проверено по документации поставщиков 12 октября 2026 года. Облачные проекты пока не созданы. Команды ниже выполняются владельцем при подключении; локальное демо уже работает без них.

## 1. Локальный запуск

Нужен Node.js 24+ и npm. В каталоге проекта:

```sh
npm ci
npm run dev
```

Откройте http://localhost:5173. Без переменных Supabase включается изолированная демосреда в localStorage браузера. Используйте «Симулятор» для теста. Демоматериалы ведут на example.com; замените их перед реальным запуском. Удаление данных браузера удаляет демоданные.

Проверки:

```sh
npm test
npm run build
npm run check:edge
npx playwright install chromium
npm run test:e2e
```

## 2. Supabase

1. Создайте Free-проект, сохраните пароль базы в менеджере паролей.
2. Установите [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) по официальной инструкции, войдите и свяжите проект:

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Это применит миграции из supabase/migrations. Альтернатива: выполнить каждый SQL-файл по порядку в SQL Editor. Не применяйте миграции повторно вручную.

3. В Supabase Auth включите Google. В Google Cloud создайте OAuth Web Client, задайте consent screen и callback из настроек провайдера Supabase: https://YOUR_PROJECT.supabase.co/auth/v1/callback. Client ID/Secret внесите в Auth → Providers → Google. Укажите URL опубликованного кабинета в Auth → URL Configuration → Site URL и Redirect URLs. Preview-домены добавляйте явно только при необходимости.
4. Для одного бизнеса отключите публичную регистрацию после создания первого владельца. Команду приглашайте через Supabase Auth и membership ниже. Не давайте произвольным посетителям права создавать аккаунты.

Для локальной работы с настоящим Supabase создайте .env.local по .env.example. В production эти две переменные задаются в Cloudflare Pages:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_KEY
```

Используйте publishable key (sb_publishable_) или старый anon key. Никогда не вставляйте service_role/sb_secret_ в VITE_*.

## 3. Серверные секреты и функции

Скопируйте supabase/.env.example в supabase/.env.local (файл исключён из Git). Задайте:

- APP_URL — точный адрес кабинета, например https://replyfolio.pages.dev. Для локальной проверки http://localhost:5173; это единственный разрешённый browser origin.
- META_APP_ID и META_APP_SECRET — Instagram App ID и Instagram App Secret из настройки Instagram API with Instagram Login. При нескольких парах ID/Secret берите пару продукта Instagram, а не случайный ID другого продукта.
- META_WEBHOOK_SECRET — App Secret приложения Meta, подписывающего webhook (App Settings → Basic). При отдельной паре Instagram OAuth используйте секрет подписывающего приложения; он может отличаться от META_APP_SECRET.
- META_GRAPH_VERSION=v26.0 — версия API, на которой подготовлена интеграция; сверяйте при обновлении Meta.
- META_VERIFY_TOKEN — произвольная случайная строка для проверки webhook.
- WORKER_SECRET — независимый секрет запуска очереди.
- TOKEN_ENCRYPTION_KEY — 32 случайных байта в base64. Ключ шифрует токены Instagram; потеря ключа потребует повторного подключения аккаунта.

Генерация каждого секрета отдельно:

```sh
openssl rand -hex 32
openssl rand -base64 32
```

Не переиспользуйте значение одного секрета в другом поле. SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY выдаёт серверный runtime; в браузер они не передаются.

```sh
supabase secrets set --env-file supabase/.env.local
supabase functions deploy instagram-connect --no-verify-jwt
supabase functions deploy instagram-callback --no-verify-jwt
supabase functions deploy instagram-webhook --no-verify-jwt
supabase functions deploy automation-worker --no-verify-jwt
supabase functions deploy workspace-api --no-verify-jwt
```

Отключённая gateway JWT-проверка нужна публичным callback/webhook и современным ключам. Защита реализована внутри: getUser + членство для кабинета, подпись Meta для событий и WORKER_SECRET для очереди.

## 4. Очередь и расписание

В Supabase включите расширения Cron (pg_cron), pg_net и Vault. Через интерфейс Vault создайте:

- replyfolio_project_url = https://YOUR_PROJECT.supabase.co
- replyfolio_worker_secret = точное значение WORKER_SECRET

Затем выполните supabase/setup/schedule.sql в SQL Editor. Скрипт можно повторить: он заменяет собственную Cron-задачу. Каждую минуту SQL проверяет просроченную очередь; HTTP-вызова при отсутствии задач нет. С подключённым Instagram выполняется также ежедневная проверка токенов. Webhook будит worker сразу, расписание обеспечивает повторы, задержки и восстановление после сбоя.

Контроль:

```sql
select jobid, jobname, active from cron.job where jobname='replyfolio-worker';
select status, count(*) from private.jobs group by status;
select id, kind, status, attempts, error, created_at
from private.jobs where status='failed' order by created_at desc limit 20;
```

Не публикуйте payload очереди: в нём могут быть личные сообщения. Проверьте Cron execution history и Edge Function logs. Если cron работает, но задачи стоят, проверьте Vault, адрес проекта и совпадение WORKER_SECRET. Официальный механизм: [Supabase scheduling](https://supabase.com/docs/guides/functions/schedule-functions).

## 5. Cloudflare Pages

Для коммерческого проекта выбран бесплатный статический фронтенд Cloudflare Pages. Notion используйте для справки/лендинга и ссылки на кабинет: он не исполняет React и webhook. Vercel Hobby ограничен личным некоммерческим использованием; для бизнеса нужен подходящий платный план. [Vercel Hobby](https://vercel.com/docs/plans/hobby), [Pages limits](https://developers.cloudflare.com/pages/platform/limits/).

В Pages подключите собственный Git-репозиторий или используйте Direct Upload. Нынешний Git-репозиторий локальный, remote пока отсутствует.

- Framework preset: Vite.
- Build command: npm run build.
- Output directory: dist.
- Root directory: корень ReplyFolio.
- Environment variables: только VITE_SUPABASE_URL и VITE_SUPABASE_PUBLISHABLE_KEY.
- Node version: 24.

Для Direct Upload: npm run build, затем загрузите dist через Pages или официальный Wrangler CLI. SPA fallback и HTTP headers уже включены. Секреты Meta и worker остаются в Supabase. После публикации обновите APP_URL, Supabase Site URL/redirects. Пересоберите фронтенд при изменении VITE_*.

## 6. Приложение Meta

Переведите Instagram в Business или Creator: оба типа профессиональных аккаунтов подходят. Creator не нужно менять на Business. Business Verification приложения Meta — отдельная процедура и не означает требование типа Business для самого аккаунта. Интеграция использует Instagram Login; Facebook Page для этого пути не требуется. Создайте Meta developer app с Instagram API и настройкой Instagram Login.

Запросите/настройте разрешения:

- instagram_business_basic
- instagram_business_manage_messages
- instagram_business_manage_comments

Добавьте собственный профессиональный Instagram в роли/тестеры приложения и примите приглашение в Instagram. Standard Access позволяет подготовить тестирование собственных аккаунтов в пределах выданных ролей. Для рабочего запуска webhook актуальная инструкция Meta требует Live-режим, Advanced Access и Business Verification; отдельно Advanced Access требуется для comments. Поэтому не рассчитывайте обойти App Review только потому, что бот нужен своему бизнесу. Пройдите необходимые проверки и подтвердите доставку реальным тестом. [Требования Meta к webhook, обновлены 16 сентября 2026](https://developers.facebook.com/documentation/instagram-platform/webhooks/setup?locale=en_US).

В Valid OAuth Redirect URIs внесите точно:

```text
https://YOUR_PROJECT.supabase.co/functions/v1/instagram-callback
```

В webhook Instagram:

- Callback URL: https://YOUR_PROJECT.supabase.co/functions/v1/instagram-webhook
- Verify token: ваш META_VERIFY_TOKEN
- Fields: messages, messaging_postbacks, messaging_referrals, messaging_seen, comments
- Политика конфиденциальности и инструкция удаления данных: ваши публичные HTTPS-страницы. Заполните шаблоны docs/PRIVACY.template.md и docs/DATA-DELETION.template.md и опубликуйте их. Это тексты-заготовки, а не действующие страницы компании.

Настройте необходимые поля App Settings и режим приложения согласно текущему интерфейсу Meta. В ReplyFolio войдите через Google, создайте пространство, откройте «Настройки → Подключить Instagram» и авторизуйте свой аккаунт. Состояние «Подключён» выставляется только после успешной подписки на события. В одном пространстве разрешено переподключение того же Instagram; другой аккаунт требует нового пространства, чтобы не смешать recipient IDs.

Источники: [Instagram API with Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/), [Messaging API](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/), [Private Replies](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/private-replies/).

## 7. Сценарии и реальная проверка

В новом облачном пространстве список пустой: локальные примеры туда не переносятся автоматически.

1. Добавьте настоящие ссылки/PDF и актуальный прайс.
2. Создайте сценарий из шаблона, замените тексты, прикрепите материалы к блокам.
3. Укажите ключевые слова или ID выбранных публикаций. Пустой список ID означает все публикации. В первой версии ID задаются вручную; галереи публикаций нет.
4. Сохраните и включите сценарий. Если совпало несколько, выбирается сначала keyword-сценарий, затем сценарий любого сообщения. Внутри одного типа приоритет у созданного раньше; при равной дате — по ID.
5. С другого разрешённого тестового аккаунта отправьте Direct. Проверьте ответ, выбор кнопки, email, заявку.
6. Напишите комментарий: должно прийти одно первое приватное сообщение. До ответа пользователя последующих сообщений быть не должно. После ответа сценарий продолжится.
7. Ответьте менеджером из кабинета или Instagram: бот должен встать на паузу. Проверьте «стоп» и «менеджер».
8. Отключите Instagram в настройках: последующие отправки должны отменяться. Переподключите и проверьте журнал.

Обычные автоматические и ручные ответы в этой версии отправляются только в 24-часовом окне после входящего DM. Приватный ответ на комментарий разрешён в пределах 7 дней и состоит из одного первого сообщения; продолжение — после ответа пользователя. Live comments, HUMAN_AGENT и отдельный 7-дневный режим рекламных Click-to-Instagram сообщений не реализованы. PDF выдаётся ссылкой, не вложением. Текст ограничен 1000 байтами UTF-8, быстрые ответы — до 13 кнопок.

Статус «accepted» означает принятие API, не прочтение. При сетевом сбое после попытки отправки статус остаётся «Не подтверждено»: сначала проверьте Direct, не дублируйте отправку вслепую.

## 8. Команда и обслуживание

Первый авторизованный пользователь создаёт пространство и получает owner. Для менеджера сначала пригласите пользователя через Supabase Auth, затем выполните как администратор базы:

```sql
insert into public.workspace_members(workspace_id,user_id,role)
values('WORKSPACE_UUID','AUTH_USER_UUID','manager');
```

Кнопки управления подключением/названием доступны на сервере только owner. Для одного аккаунта это внутренний кабинет, а не публичный SaaS.

Free-проект Supabase имеет ограниченные базу, Storage, трафик и вызовы; актуальные квоты проверяйте в [pricing](https://supabase.com/pricing). На дату подготовки: база 500 МБ, Storage 1 ГБ, egress 5 ГБ, 500 000 Edge-вызовов. Бесплатный проект может приостанавливаться при неактивности; SLA и автоматических бэкапов уровня платного плана нет. Защищённая очередь не отменяет эти ограничения. Не рассчитывайте на Free как на гарантированно бесперебойный production.

Экспорт в кабинете содержит загруженные данные: последние 1000 сообщений и 100 событий, не всю базу. Списки остальных сущностей загружаются постранично. Полный бэкап делайте вне веб-интерфейса через Supabase CLI/database backup workflow; файлы Storage сохраняйте отдельно. Шифротокены без TOKEN_ENCRYPTION_KEY восстановить нельзя. Храните бэкап и ключ отдельно с ограниченным доступом.

Служебные завершённые задачи и ключи дедупликации очищаются через 30 дней. Деловые контакты и сообщения автоматически не удаляются: выберите срок хранения и удаляйте по своей политике. После удаления/замены PDF могут оставаться старые объекты Storage; проверяйте ссылки в materials перед ручной очисткой.
