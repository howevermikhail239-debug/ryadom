# P2 checkpoint — 2026-08-11

## Итог

### DONE

- Исправлена самопроизвольная прокрутка: polling чата больше не вызывает `scrollIntoView()` документа. Автопрокрутка ограничена контейнером чата, выполняется только при нахождении пользователя у нижней границы, одинаковые polling-ответы не меняют React state.
- Favorite Performers: add/remove, уникальная пара заказчик–исполнитель, запрет self-favorite в API и БД, список `/favorites`, рейтинг, количество выполненных задач и Telegram Verified.
- Repeat Task + «Позвать снова»: новая Task с `repeatOfTaskId`, 4 минуты early access прежнему исполнителю, отдельное уведомление, затем автоматический nearby matching. Исходная задача не меняется.
- Notification Preferences: категории, радиус 500/1000/3000/5000 м, включение nearby-уведомлений и тихие часы по Europe/Moscow. Публичная карта не скрывается настройками.
- Wave Matching: 500 м → 1 км → 3 км; срочные волны идут быстрее. Worker использует `FOR UPDATE SKIP LOCKED`, outbox dedupe и прекращает волны для принятой/истёкшей задачи.
- Explainable Ranking: 50-метровая дистанционная группа, затем urgent, freshness, preferred category, точная дистанция и стабильный `task.id`. Рейтинг заказчика не участвует и не вытесняет близкие задачи.
- Media Storage: интерфейс storage adapter, S3-compatible backend для Yandex Object Storage/Selectel/MinIO, private signed GET URL, серверный случайный object key. JPEG/PNG/WebP проверяются по MIME и magic bytes, SVG запрещён, лимит 5 МБ, пользователь не задаёт storage path. Старые data URL продолжают читаться; локальный fallback сохраняет совместимость и ограничен 600 КБ, чтобы не раздувать PostgreSQL.
- Trust & Safety light: жалоба на задачу или пользователя, пять причин, один report на target от одного reporter, только ручная модерация.
- Product analytics foundation: JSON structured logs без PII для создания/просмотра/принятия/конфликта/repeat/favorite/message/completion/notification sent/opened.
- Локальный и публичный Origin корректно работают за Docker/ngrok; foreign Origin отклоняется.
- Исправлена дополнительная privacy-регрессия: гость без матча больше не считается исполнителем из-за `undefined === undefined`; точные координаты и адрес отсутствуют в HTML/RSC.
- Исправлен prefetch-дефект уведомлений: GET больше не меняет `readAt`; отметка открытия выполняется явным POST по клику.

### PARTIAL

- S3 adapter полностью реализован и собирается, но фактическая загрузка в конкретный облачный bucket не проверялась: в локальном окружении S3 credentials не заданы. До production нужно создать private bucket, задать переменные и выполнить smoke upload/download.
- `notification_opened` фиксируется для клика из внутреннего центра уведомлений. Telegram-кнопка оставлена прямой, чтобы не ломать открытие Mini App до появления web-session; отдельный Telegram click-redirect можно добавить позже.

### NOT IMPLEMENTED

- Block User намеренно не добавлен: корректный block должен влиять на feed, wave SQL, Fast Match, chat и notification recipients. Частичная кнопка создала бы ложное чувство безопасности и усложнила бы matching существенно сильнее лёгкого Report.
- Direct assignment избранному исполнителю отсутствует по требованиям P2.

## Миграции

- `20260811130000_p2_marketplace`: favorite performers, notification preferences/categories, repeat/early-access/wave fields, reports и индексы.
- `20260811133000_p2_constraints`: запрет self-favorite/self-preferred и диапазон matching wave.

Обе миграции применены к локальной production БД и отдельной integration БД.

## Конкурентность и целостность

- Fast Match, release early-access и wave worker сериализуются блокировкой Task.
- Единый порядок блокировок `task → user` устранил реально воспроизведённый PostgreSQL deadlock `40P01`.
- Два worker-а не обрабатывают одну Task благодаря `SKIP LOCKED`; уведомление одному пользователю защищено уникальным dedupe key.
- Idempotent Fast Match с одинаковым key возвращает тот же match; два разных исполнителя создают ровно один активный match.
- Expiry и outbox остаются атомарными; accepted/expired задачи исключены из последующих волн.

## Проверки

- `npm.cmd run typecheck` — passed.
- `npm.cmd run lint` — passed.
- `npm.cmd run build` — passed, Next.js 16.3 standalone.
- `npm.cmd test` с `TEST_DATABASE_URL` — 17/17 passed, включая PostgreSQL/PostGIS concurrency.
- OTP race — 8 параллельных неверных запросов: challenge остановился ровно на `attempts=5`, последующие ответы 429.
- Privacy smoke — nearby выдаёт `55.751/37.618`, exact coordinates/address отсутствуют в detail HTML/RSC для гостя.
- Playwright desktop 1280×720 и mobile 390×844: `/`, `/my-tasks`, task detail с polling чата, `/notifications`, `/profile`; во всех циклах `scrollY` остался 0, ошибок страницы/console нет.
- Notification prefetch regression: unread count до и после 4 секунд на `/notifications` остался 2.
- Favorite API: add 200, remove 200, self-favorite 400.
- Docker: app/db healthy, worker up; публичный ngrok URL отвечает 200.

## Остаточный технический долг

1. Выполнить smoke-test выбранного S3-провайдера и настроить lifecycle/orphan cleanup.
2. Для строгой гарантии analytics delivery заменить stdout structured logs на небольшую append-only event table или log collector.
3. Добавить полноценную block policy только как сквозную функцию с тестами feed/matching/chat/notifications.
4. Рассмотреть timezone пользователя вместо фиксированного Europe/Moscow при выходе за рынок РФ.
