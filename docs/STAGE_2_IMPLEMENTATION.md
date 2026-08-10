# ЭТАП 2. Реализация

## Локальный запуск

1. Скопировать `.env.local.example` в `.env.local` и заполнить ключи PostgreSQL/PostGIS, Яндекс Карт и Telegram.
2. Применить подготовленную на ЭТАПЕ 1 Prisma-миграцию.
3. Заполнить категории командой `npm run db:seed`.
4. Запустить приложение командой `npm run dev`.

Для Telegram Widget production-домен связывается с ботом через BotFather. Вход с localhost удобнее проверять через Telegram Mini App/WebApp или HTTPS-туннель домена, зарегистрированного у бота.

## Реализованные маршруты

| Метод | Маршрут | Назначение |
|---|---|---|
| `POST` | `/api/auth/telegram` | Проверка Widget/WebApp HMAC, upsert пользователя, HttpOnly-сессия |
| `POST` | `/api/auth/logout` | Отзыв текущей сессии |
| `GET` | `/api/tasks/nearby` | PostGIS-поиск задач в 500/1000/3000 м |
| `POST` | `/api/tasks` | Создание и публикация задачи, рубли → копейки |
| `POST` | `/api/tasks/:id/accept` | Serializable fast match с `FOR UPDATE` и идемпотентностью |
| `PUT` | `/api/me/location` | Краткоживущая позиция исполнителя для nearby-уведомлений |
| `GET` | `/api/geo/reverse` | Серверный reverse geocoding через Яндекс |

## Гарантии

- Telegram payload старше пяти минут или с неверной подписью отклоняется.
- Сессия передаётся только в `HttpOnly; SameSite=Lax; Secure` cookie в production; в БД хранится SHA-256-хеш.
- Клиент никогда не передаёт копейки: API принимает строку рублей и конвертирует её без float-округления.
- Конкурирующие fast-match запросы сериализуются блокировкой строки задачи. Частичный индекс из ЭТАПА 1 дополнительно запрещает два активных матча.
- Ошибка доставки Telegram не откатывает уже созданную задачу или матч; доставка сохраняется в outbox `notifications` для повторной обработки.
- API Яндекс Геокодера и Telegram Bot Token доступны только серверному коду.
