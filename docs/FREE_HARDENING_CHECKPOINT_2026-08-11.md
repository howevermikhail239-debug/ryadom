# Бесплатный hardening checkpoint — 2026-08-11

## Итог

P0 UX-баги исправлены без изменения P1/P2 workflow. Реализованы Block User, минимальная очередь жалоб для администратора, локальная проверка S3/MinIO и fallback, безопасная очистка orphan media, устойчивый worker, structured logs, heartbeat, реальный backup/restore и конкурентные тесты. Локальное production-окружение пересобрано и доступно через текущий HTTPS tunnel.

Подключено платных сервисов: **0**.

## UX bugs

### 1. Неточный адрес

- Root cause: reverse geocoder запрашивал один результат и без ранжирования выбирал первый feature, которым мог быть административный район.
- Исправление: запрашиваются до 10 результатов; house/street и точная precision получают больший приоритет; человекочитаемый адрес собирается из `formatted`, `name`, `description`, `kind`, `precision` и address components. Несуществующий дом не добавляется.
- Фактический результат для `55.707686, 37.594695`: `Москва, улица Орджоникидзе, д. 11с1А`, `kind=house`, `precision=exact`.
- Для точки `55.711237, 37.597092` Яндекс действительно вернул только Донской район, поэтому приложение корректно не выдумывает улицу или дом.
- Privacy сохранена: полные координаты и адрес получают заказчик и назначенный исполнитель; публичный feed и посторонний пользователь используют privacy-safe данные. Это покрыто policy-тестом.

### 2. Кнопка сохранения под bottom navigation

- Root cause: content не резервировал высоту fixed bottom navigation с учётом safe area.
- Исправление: единая CSS-переменная высоты навигации и padding у `app-content`; modal/edit actions остаются над панелью без случайного большого margin.
- Playwright: на edit task выполнено реальное изменение, сохранение, проверка detail и обратное восстановление значения. Кнопка полностью видима при ширине 320, 375, 390, 393, 430 и 1280 px.
- Дополнительно проверены Create Task, Task Detail, My Tasks, Notifications, Favorites, Profile, Blocked Users и Admin Reports; горизонтального overflow нет.

### 3. Домашний адрес

- Существующая `FavoritePlace` переиспользована, новая сущность не создавалась.
- Create/Edit Task предлагают `Текущее место`, `Дом` и остальные сохранённые места; выбор подставляет координаты и адрес и перемещает карту.
- В профиле теперь явно указано: «Дом» используется для быстрого создания задач по домашнему адресу.

### 4. Избранные исполнители

- Понятная кнопка с текстом доступна в публичном профиле исполнителя и после завершения задачи.
- Повторный клик удаляет связь, self-favorite запрещён API и DB constraint, уникальность пары сохранена.
- Empty state объясняет, что исполнитель добавляется после выполненной задачи или из профиля.

## Тёмная тема

- Вместо почти чёрного фона используются мягкие нейтрально-зелёные поверхности с отдельными уровнями background/surface/muted.
- Добавлены контрастные dark-состояния для карточек, границ, полей, placeholder, цветных статусов, dialog close и активной bottom navigation.
- В профиле переключатель имеет понятную текстовую цель `Тёмная`/`Светлая`.
- Кнопки доступности заменены с горизонтального скролла на стабильную мобильную сетку 2×2.
- Проверены mobile 390×844 и desktop 1280×900: нет белых вспышек, горизонтального overflow и console errors.

## Исправление доступности исполнителя

- Root cause прежней ошибки: при выключении обновление `expiresAt` конфликтовало с DB constraint временной геопозиции.
- Исправление: при `minutes=0` временная `UserLocation` удаляется, `lastLocation` очищается, `availableUntil` сбрасывается в одной транзакции.
- Integration-тест и реальный Playwright-сценарий `30 мин → Выключить` прошли; сообщение «Не удалось изменить доступность» больше не возникает.

## Block User

- Добавлена `UserBlock` с composite primary key, self-block CHECK, FK cascade и индексом обратного поиска.
- Есть block, unblock, список `/blocked-users` и понятная кнопка в публичном профиле.
- Блокировка проверяется server-side в Feed, Fast Match, Wave Matching, «Позвать снова», Favorites, Chat и создании Telegram/in-app notifications.
- При блокировке существующие favorites между парой удаляются в обе стороны.
- PostgreSQL integration-тест подтверждает запрет Fast Match и очистку favorites.

## Reports и security

- Добавлена admin-only страница `/admin/reports` со статусами Open/Reviewed/Closed.
- Существующий API сохраняет строгую схему причины/деталей, запрещает self-report, проверяет target и дедуплицирует жалобы также DB-индексом.
- Internal jobs больше не используют `AUTH_SECRET` как fallback: настроен отдельный `INTERNAL_JOB_SECRET`; отсутствующий/неверный token возвращает 401.
- Test auth остаётся доступен только уже авторизованному ADMIN и только для `isTest` пользователей.
- Telegram HMAC/initData freshness, safe redirect, same-origin для state-changing API, coordinate privacy, MIME/magic-byte/size upload validation и React escaping проверены. `dangerouslySetInnerHTML`, `eval` и `javascript:` в приложении отсутствуют.

## Media

- Локальный Data URL fallback проверен: маленькое изображение читается, payload больше 600 KB отклоняется.
- S3 adapter проверен бесплатно через MinIO: upload, signed read/download, list и delete прошли.
- Object keys генерируются сервером; bucket private; SVG и подмена MIME запрещены; лимит основного upload — 5 MB.
- Orphan scanner запускается не чаще раза в час, удаляет только S3-объекты старше 24 часов и сохраняет heartbeat. В fallback режиме безопасно возвращает `skipped=local-storage`.

## Worker, observability и concurrency

- Worker выполняет циклы последовательно, не запускает overlapping interval, использует timeout, structured JSON logs и ждёт активный run при SIGTERM/SIGINT.
- Проверен реальный restart: в логах есть `stopping/SIGTERM`, новый `started` и успешный run.
- `/api/health` показывает DB и worker heartbeat/last success/error; app health не падает во время стартового окна worker.
- Четыре параллельных вызова internal jobs вернули 200; `SKIP LOCKED`, outbox dedupe и idempotency сохраняются.
- PostgreSQL-тест повторно проверил два Fast Match, одинаковый idempotency key, параллельные wave workers и гонку `Fast Match ↔ Wave Worker`; deadlock не вернулся.
- Product analytics остаётся бесплатными structured JSON events без имени, телефона, адреса или текста чата.

## Backup / restore

- Создан финальный custom-format dump: `backups/microgigs-20260811-final.dump`, 91 955 bytes.
- Dump восстановлен в отдельную DB `microgigs_restore_20260811_final`; рабочая DB не изменялась.
- Сверка source/restore: users `4/4`, tasks `8/8`, migrations `12/12`, worker heartbeats `1/1` — идентично.

## Validation

- Prisma migrations на production и integration DB: 12/12, up to date.
- Unit/PostgreSQL/PostGIS: 23 passed, 0 failed; MinIO test выполнялся отдельно и passed.
- TypeScript: passed.
- ESLint: passed.
- Next.js 16.3 standalone production build: passed; npm audit во время `npm ci`: 0 vulnerabilities.
- Docker: app/db healthy, worker running and healthy.
- Internal jobs: valid token 200, missing/wrong token 401.
- Public HTTPS health: 200.
- Playwright mobile/desktop: no horizontal overflow and 0 console errors на основных экранах.

## Обязательный ручной бесплатный шаг: Telegram Bot Token

Токен ранее попадал в переписку, поэтому перед публичным тестом:

1. Выполнить revoke/regenerate через `@BotFather`.
2. Заменить `TELEGRAM_BOT_TOKEN` в `.env.production`.
3. Перезапустить app и worker.
4. Повторно настроить/проверить webhook.
5. Отправить тестовое Telegram-уведомление.

Секреты в этот документ не включены.
