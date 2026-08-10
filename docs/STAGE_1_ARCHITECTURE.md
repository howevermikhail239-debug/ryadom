# ЭТАП 1. Data & Architecture

## 1. Архитектурные решения

- Next.js App Router выступает как BFF: браузер не получает ключи геокодера, SMS, Telegram Bot API и ЮKassa.
- PostgreSQL хранит деньги целым числом копеек (`priceKopecks`, `amountKopecks`), поэтому округление с плавающей точкой исключено.
- Координаты сохраняются одновременно как `Decimal latitude/longitude` и PostGIS `geography(Point, 4326)`. Первые удобно валидировать и отдавать через Prisma, второе используется для `ST_DWithin`, `ST_Distance` и GIST-индексов.
- Поле PostGIS объявлено nullable только из-за ограничения Prisma для `Unsupported`-типов. Триггер БД всегда рассчитывает его при вставке или изменении координат.
- Мгновенный матч создаётся в транзакции с идемпотентным ключом. Частичный уникальный индекс запрещает две активные сделки по одной задаче.
- Последняя позиция исполнителя вынесена в `user_locations`, имеет согласие и срок жизни. Историю перемещений приложение не хранит.
- Платёжные webhook-и обрабатываются идемпотентно по `externalId`; состояние платежа дополнительно сверяется запросом к API ЮKassa.
- Удаление пользователя мягкое (`deletedAt`), финансовые операции, матчи и отзывы физически не удаляются.

## 2. Целевая структура Next.js

```text
.
├── prisma/
│   ├── migrations/                    # Версионируемые SQL-миграции
│   ├── migration-prelude.sql          # CREATE EXTENSION до создания таблиц
│   ├── migration-extras.sql           # Триггеры, CHECK/partial/GIST indexes
│   └── schema.prisma
├── public/
│   ├── icons/                         # PWA icons 192/512, maskable
│   └── manifest.webmanifest
├── src/
│   ├── app/
│   │   ├── (auth)/login/page.tsx
│   │   ├── (main)/feed/page.tsx
│   │   ├── (main)/tasks/new/page.tsx
│   │   ├── (main)/tasks/[taskId]/page.tsx
│   │   ├── api/auth/phone/request/route.ts
│   │   ├── api/auth/phone/verify/route.ts
│   │   ├── api/auth/telegram/callback/route.ts
│   │   ├── api/tasks/nearby/route.ts
│   │   ├── api/tasks/route.ts
│   │   ├── api/tasks/[taskId]/accept/route.ts
│   │   ├── api/payments/yookassa/webhook/[token]/route.ts
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── ui/                         # shadcn/ui
│   │   ├── map/yandex-map.tsx
│   │   └── tasks/
│   ├── config/
│   │   ├── public-env.ts
│   │   └── server-env.ts
│   ├── generated/prisma/               # prisma generate; не редактировать
│   ├── lib/
│   │   ├── auth/                        # JWT/session, OTP, Telegram verification
│   │   ├── db/prisma.ts
│   │   ├── geo/                         # PostGIS queries and distance policy
│   │   ├── realtime/                    # Socket.io + Redis adapter
│   │   └── validation/                  # zod DTO schemas
│   ├── server/
│   │   ├── repositories/                # Только доступ к данным
│   │   ├── services/                    # Транзакции и бизнес-инварианты
│   │   ├── integrations/
│   │   │   ├── maps/yandex-geocoder.ts
│   │   │   ├── payments/yookassa.ts
│   │   │   ├── sms/sms-ru.ts
│   │   │   └── telegram/bot.ts
│   │   └── jobs/                        # expiry, notification retries
│   └── types/
├── prisma.config.ts
├── next.config.ts
└── .env.local.example
```

Зависимости направлены внутрь: route handler → service → repository/integration. Компоненты React не импортируют `src/server` и Prisma. Внешние API закрыты интерфейсами, поэтому SMS-провайдера или платёжный шлюз можно заменить без изменения доменной логики.

## 3. Модель данных и инварианты

| Модель | Назначение |
|---|---|
| `User` | Профиль, роли, телефон/Telegram, агрегированный рейтинг |
| `AuthSession`, `OtpChallenge` | Хешированные refresh-сессии и одноразовые SMS-коды |
| `UserLocation` | Свежая геопозиция исполнителя для nearby-уведомлений |
| `Category` | Управляемый справочник категорий без релиза приложения |
| `Task` | Заказ, WGS84-точка, цена в копейках, окно актуальности и optimistic-lock `version` |
| `Bid` | Отклик; одна запись исполнителя на задачу |
| `TaskMatch` | Фактическое назначение исполнителя и жизненный цикл выполнения |
| `Review` | Один отзыв автора на завершённый матч |
| `Payment` | Депозит безопасной сделки, выплата или возврат |
| `Notification` | Надёжная outbox-очередь для Telegram/Web Push/in-app |

Проверки, зависящие от нескольких таблиц, выполняются внутри serializable-транзакции сервиса: исполнитель не равен заказчику, bid принадлежит тому же task/performer, review оставляет участник завершённого match, а сумма выплаты не превышает успешный депозит.

## 4. PostGIS и первая миграция

Для первого запуска создайте миграцию, но не применяйте её сразу:

```bash
npx prisma migrate dev --name init --create-only
```

В начало созданного `migration.sql` добавляется содержимое `prisma/migration-prelude.sql`: расширение должно включиться **до** первого `CREATE TABLE` с типом `geography`. Содержимое `prisma/migration-extras.sql` добавляется в конец этой же миграции, после создания таблиц. После этого:

```bash
npx prisma migrate dev
npx prisma generate
```

В production используется только `npx prisma migrate deploy`. Образ PostgreSQL должен содержать PostGIS (например, официальный образ `postgis/postgis`); пользователь БД для первой миграции должен иметь право `CREATE EXTENSION`.

## 5. Гео и Яндекс Карты

- `NEXT_PUBLIC_YANDEX_MAPS_API_KEY` — отдельный ключ JavaScript API v3, разрешённые Referer: production-домен и localhost для dev.
- `YANDEX_GEOCODER_API_KEY` — серверный ключ HTTP Geocoder. Route handler принимает координаты/строку, валидирует диапазон, ограничивает частоту через Redis и вызывает Яндекс от имени сервера.
- Геолокацию устройства получает `navigator.geolocation` только после явного действия пользователя. Reverse geocoding преобразует координаты в подпись адреса, но исходные координаты остаются источником истины.
- Nearby-запрос выполняется параметризованным `$queryRaw` через `ST_DWithin(location, point, radius)`; радиус на сервере ограничивается допустимым диапазоном.

## 6. Авторизация для РФ

### Телефон

Телефон нормализуется в E.164 (`+79991234567`). В БД сохраняется только HMAC-хеш OTP с отдельным `OTP_PEPPER`, число попыток и TTL. Запрос/проверка кода имеют rate limit по телефону и хешу IP. `SMS_PROVIDER=mock` разрешён только вне production; production использует адаптер SMS.ru или другой российский провайдер с тем же интерфейсом.

### Telegram

Предпочтительный web-flow — Telegram OIDC Authorization Code + PKCE. Сервер проверяет подпись ID token через Telegram JWKS, а также `iss`, `aud`, `exp`, `state` и одноразовый `nonce`. Для legacy Login Widget сервер пересчитывает HMAC и проверяет свежесть `auth_date`. Домен предварительно связывается с ботом через BotFather. `TELEGRAM_BOT_TOKEN` никогда не используется в client component.

Access token живёт 15 минут и передаётся в `HttpOnly; Secure; SameSite=Lax` cookie. Refresh token — случайный, в БД хранится только его SHA-256-хеш; при обновлении он ротируется, при повторном использовании семейство сессий отзывается.

## 7. Ключи и эксплуатация

- `.env.local` не коммитится; production-секреты задаются secret storage облака/CI.
- Ключи Яндекс разделяются по продукту и среде. Browser-key ограничивается Referer, server-key — IP сервера, если тариф это поддерживает.
- ЮKassa использует HTTP Basic Auth (`shopId:secretKey`) только на сервере и уникальный `Idempotence-Key` для каждой операции.
- `YOOKASSA_WEBHOOK_TOKEN` — собственный непредсказуемый сегмент callback URL, не подпись ЮKassa. Каждое уведомление всё равно подтверждается чтением объекта через API ЮKassa.
- `AUTH_SECRET`, `OTP_PEPPER` и webhook token должны быть независимыми случайными значениями минимум 32 байта.
