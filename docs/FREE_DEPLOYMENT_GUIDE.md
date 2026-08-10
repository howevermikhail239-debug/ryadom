# Бесплатный деплой «Рядом» и запуск Telegram Mini App

Актуальность инструкции: 8 августа 2026 года.

## 1. Что действительно можно получить за 0 ₽

Полностью бесплатный публичный стенд реален, но ни один из перечисленных Free Tier не гарантирует коммерческий SLA и постоянную вычислительную мощность.

| Схема | Для чего подходит | Ограничение |
| --- | --- | --- |
| Neon Free + Vercel Hobby | Лучший быстрый публичный MVP и Mini App | Vercel Hobby предназначен для личного некоммерческого использования; действуют квоты |
| Neon Free + Render Free | Docker-стенд с автоматическими миграциями | Render останавливает сервис после 15 минут без входящего трафика; первый запуск занимает около минуты |
| Локальный Docker + Cloudflare Quick Tunnel | Демонстрация со смартфона без облачного хостинга | Случайный URL меняется при перезапуске, SLA отсутствует |
| Локальный Next.js + ngrok Free | Короткий ручной тест | Лимиты трафика и промежуточная страница ngrok могут мешать Telegram WebView |

Neon Free не требует банковскую карту, поддерживает PostGIS и автоматически переводит неактивный compute в idle. Актуальные лимиты нужно проверять на [странице тарифов Neon](https://neon.com/pricing). Render Free предоставляет 750 instance-hours в месяц, но [засыпает после 15 минут простоя](https://render.com/docs/free). Vercel Hobby стоит $0, однако его [условия допускают только личное некоммерческое использование](https://vercel.com/docs/plans/hobby).

> Для публичного теста без платежей рекомендуется Neon Free + Vercel Hobby. Для проверки именно Docker-образа — Neon Free + Render Free. Формулировка «24/7» означает доступность постоянного URL в пределах квот, а не отсутствие cold start и не гарантированный SLA.

## 2. Важное ограничение для рынка РФ

Neon, Supabase, Vercel и Render — зарубежная инфраструктура. Используйте бесплатный стек только с тестовыми пользователями и синтетическими данными. С 1 июля 2025 года при сборе персональных данных граждан РФ запись, систематизация, накопление, хранение, уточнение и извлечение должны выполняться с использованием баз данных на территории РФ; актуальный текст и исключения приведены в [152-ФЗ и разъяснении об изменениях](https://www.consultant.ru/document/cons_doc_LAW_511584/).

Для реального запуска с телефонами, Telegram ID, координатами и платежами перенесите PostgreSQL и приложение в российский ЦОД, оформите документы оператора персональных данных и проверьте трансграничную передачу с профильным юристом. Эта инструкция не является юридической консультацией.

## 3. Что подготовить

1. Репозиторий проекта в GitHub или GitLab.
2. Аккаунты Neon и Vercel либо Render.
3. Telegram-бот, созданный через `@BotFather`, и его токен.
4. Два ключа Яндекс: JS API v3 для браузера и HTTP Геокодер для сервера.
5. Node.js 22, npm и Git для запуска миграций с компьютера.
6. Файл окружения:

   ```bash
   cp .env.production.example .env.production
   ```

Никогда не коммитьте `.env.production`. Для двух секретов сгенерируйте независимые значения:

```bash
openssl rand -base64 48
openssl rand -base64 48
```

Первое значение задайте как `AUTH_SECRET`, второе — как `OTP_PEPPER`.

## 4. Вариант А1: Neon Free + Vercel Hobby

### 4.1. Создать PostgreSQL/PostGIS в Neon

1. Зарегистрируйтесь в [Neon](https://console.neon.tech/) и создайте проект на тарифе Free. Выберите ближайший доступный регион.
2. В SQL Editor выполните:

   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   SELECT PostGIS_Full_Version();
   ```

3. В разделе Connect скопируйте две строки подключения:
   - pooled URL с хостом вида `...-pooler....neon.tech` — в `DATABASE_URL`;
   - direct URL без `-pooler` — в `DIRECT_DATABASE_URL`.
4. Сохраните обязательный `sslmode=require`. Пример:

   ```dotenv
   DATABASE_URL=postgresql://user:password@ep-name-pooler.region.aws.neon.tech/neondb?sslmode=require
   DIRECT_DATABASE_URL=postgresql://user:password@ep-name.region.aws.neon.tech/neondb?sslmode=require
   ```

Pooled-подключение предназначено для большого числа коротких запросов приложения, а direct — для Prisma Migrate и DDL. Подробнее: [connection pooling Neon](https://neon.com/docs/connect/connection-pooling) и [PostGIS в Neon](https://neon.com/docs/extensions/postgis).

### 4.2. Один раз применить схему и seed

Vercel не запускает Docker entrypoint. До первого деплоя выполните из корня проекта:

```bash
npm ci
npx prisma migrate deploy
npx tsx scripts/apply-sql.ts
npm run db:seed
```

Команды читают `DIRECT_DATABASE_URL` из `.env.production`. `apply-sql.ts` защищён advisory lock и таблицей `_app_sql_migrations`, поэтому PostGIS-триггеры применяются ровно один раз. Seed категорий идемпотентен.

Проверка:

```sql
SELECT PostGIS_Version();
SELECT name FROM "Category" ORDER BY name;
SELECT name, "appliedAt" FROM "_app_sql_migrations";
```

### 4.3. Развернуть Next.js на Vercel

1. Откройте [Vercel New Project](https://vercel.com/new), импортируйте репозиторий и оставьте Framework Preset `Next.js`.
2. Build Command: `npm run build`. Install Command: `npm ci`. Output Directory не задавайте.
3. В Settings → Environment Variables добавьте для Production и Preview:

   ```text
   NODE_ENV=production
   APP_URL=https://ИМЯ-ПРОЕКТА.vercel.app
   NEXT_PUBLIC_APP_URL=https://ИМЯ-ПРОЕКТА.vercel.app
   DATABASE_URL=<pooled Neon URL>
   DIRECT_DATABASE_URL=<direct Neon URL>
   AUTH_SECRET=<случайное значение 32+ символа>
   OTP_PEPPER=<другое случайное значение 32+ символа>
   ACCESS_TOKEN_TTL_SECONDS=900
   REFRESH_TOKEN_TTL_SECONDS=2592000
   OTP_TTL_SECONDS=300
   SMS_PROVIDER=disabled
   NEXT_PUBLIC_YANDEX_MAPS_API_KEY=<JS API v3 key>
   YANDEX_GEOCODER_API_KEY=<HTTP Geocoder key>
   NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=<имя без @>
   TELEGRAM_BOT_TOKEN=<токен BotFather>
   ```

4. Если точный домен ещё неизвестен, сделайте первый Deploy, скопируйте `https://....vercel.app`, исправьте `APP_URL` и `NEXT_PUBLIC_APP_URL`, затем нажмите Redeploy. Переменные `NEXT_PUBLIC_*` встраиваются во время сборки, поэтому одного Restart недостаточно.
5. Откройте `https://ИМЯ-ПРОЕКТА.vercel.app/api/health`. Нормальный ответ: `200`.

Не запускайте `prisma migrate deploy` в каждом Vercel Build: параллельные Preview-сборки не должны менять production-базу. Новые миграции применяйте вручную или отдельным защищённым CI job перед выпуском.

## 5. Вариант А2: Neon Free + Render Free (Docker)

В репозитории уже есть `render.yaml`. Он использует production Dockerfile, проверяет `/api/health`, а container entrypoint последовательно запускает:

1. `prisma migrate deploy`;
2. PostGIS extras через `scripts/apply-sql.ts`;
3. идемпотентный `prisma/seed.ts`;
4. standalone Next.js server.

### 5.1. Развернуть Blueprint

1. Запушьте репозиторий.
2. В Render выберите New → Blueprint, подключите репозиторий и подтвердите `render.yaml`.
3. Для всех переменных с пометкой `sync: false` введите значения из раздела 4.3. Для БД используйте Neon, а не Render Free Postgres: [бесплатная Render PostgreSQL удаляется через 30 дней](https://render.com/docs/free).
4. После первого создания сервиса скопируйте адрес `https://ИМЯ.onrender.com`, укажите его в `APP_URL` и `NEXT_PUBLIC_APP_URL`, сохраните и выполните Manual Deploy → Deploy latest commit.
5. Проверьте Events/Logs: должны появиться сообщения `Applying Prisma migrations`, `Applying PostGIS triggers`, `Seeding reference categories`, `Starting Next.js`.
6. Откройте `/api/health`.

Render передаёт `PORT` автоматически; приложение слушает `0.0.0.0`. Публичные build-переменные объявлены в Dockerfile как `ARG`. Официальная справка: [Docker on Render](https://render.com/docs/docker) и [переменные окружения](https://render.com/docs/configure-environment-variables).

### 5.2. Что увидит первый пользователь после паузы

Free Web Service засыпает через 15 минут без входящих запросов. Первый запрос может ждать около минуты. Для Telegram Mini App это выглядит как долгий белый экран, поэтому Render Free годится для тестов, но не для обещания «здесь и сейчас». Не используйте внешние uptime-пинги для обхода правил тарифа.

## 6. Supabase Free вместо Neon

Supabase Free предоставляет два проекта и до 500 MB базы на проект, но неактивный проект может быть приостановлен. Актуальные условия: [Supabase Pricing](https://supabase.com/pricing) и [pausing free projects](https://supabase.com/docs/guides/platform/free-project-pausing).

1. Создайте проект в Supabase.
2. Database → Extensions → найдите PostGIS и включите расширение в схеме `extensions`, либо выполните рекомендуемую Dashboard-команду согласно [документации PostGIS Supabase](https://supabase.com/docs/guides/database/extensions/postgis).
3. В Connect скопируйте pooled URL в `DATABASE_URL` и direct/session connection в `DIRECT_DATABASE_URL`. Если IPv6 с локального компьютера недоступен, используйте Session Pooler для миграций. Transaction Pooler не используйте для DDL/Prisma Migrate.
4. Примените четыре команды из раздела 4.2.
5. Подключите URL к Vercel или Render.

## 7. Локальная production-сборка Docker Compose

На Windows основной способ запуска из корня проекта:

```powershell
npm start
```

Команда сама запускает Docker Desktop, выполняет `docker compose up --build -d`, повторяет временно упавшие сетевые загрузки и ждёт `/api/health`. Для остановки используйте `npm run stop`, для статуса — `npm run status`. Обычный `docker compose start` запускает только уже созданные контейнеры и не пересобирает изменившееся приложение.

### 7.1. Настроить окружение

Для встроенного PostGIS оставьте хост БД `db`:

```dotenv
APP_DOMAIN=http://localhost
APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
POSTGRES_DB=microgigs
POSTGRES_USER=microgigs
POSTGRES_PASSWORD=<длинный URL-safe пароль>
DATABASE_URL=postgresql://microgigs:<пароль>@db:5432/microgigs?schema=public
DIRECT_DATABASE_URL=postgresql://microgigs:<пароль>@db:5432/microgigs?schema=public
```

Затем:

```bash
docker compose --env-file .env.production up --build -d
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs -f app
```

Доступны:

- Next.js напрямую: `http://localhost:3000`;
- через Caddy: `http://localhost`;
- health check: `http://localhost:3000/api/health`.

Остановка без удаления данных:

```bash
docker compose --env-file .env.production down
```

Команда `down -v` удаляет базу и сертификаты; не запускайте её, если данные нужны.

### 7.2. Docker Compose на VPS с доменом

1. Создайте DNS `A`/`AAAA`, указывающий на VPS.
2. Откройте TCP 80/443 и UDP 443.
3. Задайте `APP_DOMAIN=app.example.ru`, `APP_URL=https://app.example.ru` и `NEXT_PUBLIC_APP_URL=https://app.example.ru`.
4. Запустите Compose. Caddy автоматически запросит и обновит TLS-сертификат.
5. Порт 3000 привязан только к `127.0.0.1`; снаружи приложение доступно через Caddy.

Caddy не сможет выпустить обычный публичный сертификат для частного адреса или домена без корректного DNS.

## 8. Вариант Б1: бесплатный Cloudflare Quick Tunnel

Это предпочтительный способ открыть локальное приложение смартфону на несколько часов.

1. Запустите Docker Compose или `npm run dev` на порту 3000.
2. Установите `cloudflared` по [официальной инструкции](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/).
3. Выполните:

   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```

4. Скопируйте выданный URL вида `https://random-words.trycloudflare.com`.
5. Укажите URL в `APP_URL` и `NEXT_PUBLIC_APP_URL`. При Docker измените env и пересоберите приложение:

   ```bash
   docker compose --env-file .env.production up --build -d app
   ```

6. Добавьте домен в ограничения ключа Яндекс и настройте BotFather по разделу 10.
7. Не закрывайте терминал с `cloudflared`.

[Quick Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/) не требует аккаунта, выдаёт случайный домен, не имеет SLA и предназначен только для тестирования. После перезапуска URL обычно меняется — его придётся обновить в env, Яндексе и BotFather.

Для стабильного Cloudflare Tunnel нужны аккаунт, собственный домен в Cloudflare и именованный tunnel. Сам tunnel бесплатен, но регистрация домена обычно платная.

## 9. Вариант Б2: ngrok Free

1. Зарегистрируйтесь в ngrok и установите агент.
2. Добавьте auth token командой из панели ngrok.
3. Запустите приложение на 3000 и выполните:

   ```bash
   ngrok http 3000
   ```

4. Используйте HTTPS Forwarding URL для `APP_URL`, `NEXT_PUBLIC_APP_URL`, BotFather и списка разрешённых доменов Яндекс.

Free Plan выдаёт один development domain и имеет лимиты запросов/трафика; [актуальные лимиты опубликованы ngrok](https://ngrok.com/docs/pricing-limits/free-plan-limits/). На бесплатном плане может показываться browser interstitial. Если он появляется внутри Telegram WebView, используйте Cloudflare Quick Tunnel или облачный вариант.

## 10. Подключить HTTPS URL к Telegram Mini App

Сначала откройте диалог с ботом и нажмите Start: бот не может сам начать переписку с пользователем, а уведомления будут отправляться только пользователям с доступным Telegram chat ID.

### 10.1. Main Mini App

1. Откройте `@BotFather` и отправьте `/mybots`.
2. Выберите бота → Bot Settings → Configure Mini App → Enable Mini App.
3. Укажите production HTTPS URL без локального адреса, например `https://name.vercel.app`.
4. При необходимости используйте `/newapp`: выберите бота, задайте название, описание, фото/GIF и HTTPS URL.

После настройки Main Mini App Telegram создаёт прямую ссылку:

```text
https://t.me/ИМЯ_БОТА?startapp
```

### 10.2. Кнопка меню

1. В BotFather отправьте `/setmenubutton`.
2. Выберите бота.
3. Текст кнопки: `Открыть Рядом`.
4. URL: тот же HTTPS адрес.

Официальные возможности и способы запуска описаны в [Telegram Mini Apps](https://core.telegram.org/bots/webapps) и [Telegram Bot Features](https://core.telegram.org/bots/features).

### 10.3. Telegram Login Widget вне WebApp

Для входа из обычного браузера откройте Bot Settings → Web Login, добавьте разрешённый origin и callback URL вашего домена. Для legacy Widget BotFather также предлагает `/setdomain`. Значения должны точно совпадать по протоколу и домену; `http://localhost` используйте только локально, публичный URL обязан быть HTTPS.

После каждой смены tunnel-домена обновляйте одновременно:

1. `APP_URL` и `NEXT_PUBLIC_APP_URL`;
2. BotFather Main Mini App/Menu Button/Web Login Allowed URLs;
3. ограничения ключа Яндекс JS API;
4. deployment/rebuild, потому что `NEXT_PUBLIC_*` встраиваются в клиентский bundle.

## 11. Яндекс Карты API v3 и Геокодер

1. В кабинете разработчика создайте отдельный browser key для JavaScript API v3 и server key для HTTP Геокодера.
2. Для JS key разрешите production-домены Vercel/Render/ваш домен. Учитывайте, что некоторые WebView передают необычный Referer — проверяйте карту именно внутри Telegram на Android и iOS.
3. Серверный geocoder key не называйте `NEXT_PUBLIC_*` и не отправляйте клиенту. Если у хостинга есть статический egress IP, ограничьте ключ по IP.
4. Не скрывайте логотип/копирайт карты и сохраняйте кнопку «Открыть в Яндекс Картах».
5. На бесплатных условиях не сохраняйте в своей БД адрес, полученный от Геокодера. Текущая форма показывает результат только временно, а API сохраняет координаты и `addressLabel=null`.

Перед публичным запуском проверьте [условия бесплатного использования API Яндекс Карт](https://yandex.ru/dev/commercial/doc/ru/concepts/free-usage/) и [настройку ограничений ключа](https://yandex.com/maps-api/docs/js-api/limit.html). Бесплатный режим требует общедоступного приложения и соблюдения правил отображения данных.

## 12. ЮKassa в тестовом режиме

ЮKassa не нужна для входа и карты. Для тестов платежей создайте тестовый магазин, затем добавьте:

```dotenv
YOOKASSA_SHOP_ID=<test shopId>
YOOKASSA_SECRET_KEY=<test secret key>
YOOKASSA_WEBHOOK_TOKEN=<отдельный случайный секрет 32+ символа>
```

`YOOKASSA_SECRET_KEY` никогда не должен иметь префикс `NEXT_PUBLIC_`. Тестовый магазин не списывает реальные деньги; инструкции и тестовые карты находятся в [документации ЮKassa](https://yookassa.ru/developers/payment-acceptance/testing-and-going-live/testing). Для реальной безопасной сделки, выплат физлицам/самозанятым и чеков потребуется отдельное договорное и юридическое проектирование — тестовый token не превращает MVP в платёжного агента.

## 13. Финальная проверка

Проверьте по порядку:

1. `GET /api/health` отвечает `200`.
2. Карта открывается без ошибки ключа и показывает атрибуцию Яндекс.
3. Геолокация разрешена внутри Telegram; Mini App открыт по HTTPS.
4. Telegram WebApp login создаёт сессию, повторный вход не дублирует User.
5. Создание задачи записывает цену в копейках и географическую точку PostGIS.
6. Задача находится фильтрами 500 м / 1 км / 3 км.
7. Два параллельных нажатия «Взять» создают только один успешный match.
8. Бот отправляет уведомления заказчику и исполнителю, ранее нажавшим Start.
9. В browser DevTools отсутствуют `TELEGRAM_BOT_TOKEN`, `AUTH_SECRET`, `DIRECT_DATABASE_URL`, `YANDEX_GEOCODER_API_KEY` и ключ ЮKassa.
10. После redeploy миграции не падают, seed не создаёт дубликаты.

Полезные команды:

```bash
docker compose --env-file .env.production config
docker compose --env-file .env.production logs --tail=200 app
curl -i https://ВАШ-ДОМЕН/api/health
npm run typecheck
npm run lint
npm run build
```

## 14. Типовые ошибки

**`P1001` / database unreachable.** Проверьте, что runtime использует pooled URL, миграции — direct/session URL, сохранён `sslmode=require`, а пароль URL-encoded.

**`type geometry does not exist`.** Включите PostGIS и снова выполните `npx prisma migrate deploy`. Baseline migration тоже содержит `CREATE EXTENSION IF NOT EXISTS postgis`, но пользователь БД должен иметь право на расширение.

**`INVALID_ORIGIN` или цикл входа.** `APP_URL` должен полностью совпадать с публичным origin. После изменения пересоберите клиент.

**Telegram сообщает `auth data is outdated` или `hash is invalid`.** Проверьте токен именно этого бота, системное время сервера и то, что init data не изменяется до серверной проверки.

**Яндекс Карты не загружаются в Telegram, но работают в браузере.** Проверьте разрешённые домены ключа и Referer из WebView; на время диагностики создайте отдельный строго ограниченный тестовый ключ, затем верните ограничения.

**Render долго открывается.** Это ожидаемый cold start Free Web Service после 15 минут простоя.

**Cloudflare/ngrok URL перестал работать.** Туннель живёт только пока запущен локальный процесс; Quick Tunnel получает новый URL при новом запуске.

## 15. Нулевой бюджет

Для тестового запуска не требуются банковская карта, VPS или домен:

- Neon Free: 0 ₽;
- Vercel Hobby либо Render Free: 0 ₽ в пределах условий;
- `*.vercel.app`, `*.onrender.com` или `*.trycloudflare.com`: 0 ₽;
- Telegram Bot/Mini App: 0 ₽;
- ЮKassa test shop: без реальных списаний;
- Яндекс API: 0 ₽ только при соответствии актуальным бесплатным условиям и лимитам.

При появлении реальных пользователей бюджет должен включать российский хостинг, резервные копии, мониторинг, SMS (если включается), тариф карт сверх бесплатных условий, юридическое сопровождение и комиссии платёжной инфраструктуры.
