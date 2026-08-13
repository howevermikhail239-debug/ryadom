# MAP UX STATUS

Дата проверки: 12 августа 2026.

Статус этапа: **DONE**.

## Architecture — DONE

Состояния разделены явно:

- `Camera State`: текущие `center` и `zoom` карты; частые обновления остаются внутри карты и ref, в React передаётся только завершённое действие.
- `Search State`: подтверждённая точка поиска, радиус `500 / 1000 / 3000` и режим `near_me / map_area`.
- `Task Data State`: задачи, выбор, initial/background loading, ошибка, AbortController, request sequence и отдельный cache.
- `Executor Presence State`: обезличенные точки, background refresh, отдельный AbortController, cache и видимость слоя.

Изменение камеры не изменяет Search State и не запускает discovery.

## Root Cause — DONE

В прежнем коде `YMap onUpdate` обновлял search center, после чего debounce-effect вызывал `/api/tasks/nearby`. Кроме того, lifecycle effect карты зависел от datasets, callbacks, center и других props, поэтому обычное обновление могло вызвать `destroy()` и повторное создание YMap. Это объясняло лишние запросы, camera reset и flicker.

## YMap Lifecycle — DONE

- YMap создаётся один раз на mount компонента.
- `destroy()` вызывается на unmount либо при явном retry после ошибки инициализации.
- Task dataset заменяет только task cluster layer.
- Executor dataset заменяет только executor cluster layer.
- User marker, выбранная точка и radius polygon обновляются независимо.
- Изменение radius, выбранной задачи, polling или background refresh не пересоздаёт YMap.

## Search UX — DONE

- `near_me`: anchor равен разрешённой геопозиции пользователя.
- Свободный pan/zoom только меняет Camera State.
- После значимого сдвига `> max(50 м, radius × 10%)` появляется «Искать здесь».
- «Искать здесь» фиксирует camera center как новый anchor и включает `map_area`.
- «Вернуться ко мне» возвращает anchor к известной позиции пользователя и сохраняет radius.
- Radius — расстояние от committed anchor. Его изменение обновляет polygon и плавно fit-ит bounds, не выбирая случайную задачу.
- Старый CSS-круг фиксированного размера удалён; радиус — географический polygon.

## Task Cache — DONE

- Реализация: маленький in-memory bounded cache с LRU-подобным вытеснением.
- Максимум: 15 Search States.
- TTL задач: 20 секунд.
- Cache key: округлённый committed anchor + radius; camera center в key не входит.
- Fresh hit показывается без запроса.
- Stale hit показывается сразу и обновляется в фоне без очистки markers/list.
- Явная кнопка «Обновить» выполняет forced revalidation.
- AbortController и sequence guard обеспечивают latest-request-wins.

## Executor Presence — DONE

- Координаты выдаются server-side с точностью 3 десятичных знака без ID, имени и профиля.
- Freshness: `lastSeenAt` не старше 30 минут.
- Availability: требуется `availableUntil > NOW()`.
- Исключаются текущий пользователь, cooldown и блокировки в обе стороны.
- TTL cache: 45 секунд.
- Есть отдельная кластеризация.
- OFF/ON слоя не запускает network request; cached points возвращаются сразу.
- Это snapshot presence, не live tracking; WebSocket/GPS stream не добавлялись.

## Markers — DONE

- Current User: синяя геопозиция.
- Task: цена в рублях.
- Urgent Task: отдельное оранжевое состояние.
- Selected Task: явное selected-состояние.
- Task Cluster: количество, click выполняет fit bounds и не открывает случайную задачу.
- Executor: небольшая анимированная обезличенная точка с 32 px click target.
- Executor Cluster: отдельный зелёный cluster marker.

## Map/List — DONE

- Marker открывает компактный preview без точного адреса.
- «На карте» в TaskCard выбирает и центрирует соответствующий marker.
- Карта и список используют один `filteredTasks`.
- «Показать все» fit-ит bounds текущего набора.
- Search/camera/radius/filter/layers/selection/scroll сохраняются в session state.
- Back-проверка восстановила scroll `490 px → 500 px`.
- Marker preview и layer/radius changes не вызывают scroll/focus TaskCard.

## Request Count — DONE

Фактический Playwright network trace:

- Во время продолжительного pan: Task requests `0`, Executor requests `0`.
- После pan без Search Here: Task requests `0`, Executor requests `0`.
- Executor layer OFF: `0`; последующий ON использует cache.
- Search Here: Task requests `1`, Executor requests `1`.
- Новый radius без cache: Task requests `1`, Executor requests `1`.
- Fresh cache hit: `0`.
- Stale cache hit: старый dataset появляется сразу; в наблюдавшемся сценарии Task background refresh `1`, Executor `0`, потому что executor cache ещё был fresh.

## Privacy — DONE

- Guest/unrelated user: nearby DTO содержит округлённые privacy-safe координаты и не содержит точного адреса.
- Owner/assigned performer: существующая detail policy точных данных не изменялась и не обходится map endpoint.
- Task marker строится из того же nearby DTO, что и feed.
- Executor Presence не содержит user ID, имени, avatar, Telegram ID или exact GPS.
- PostGIS integration test подтвердил task coordinate rounding, block exclusion, executor self/block/availability filtering.

## Performance — DONE

Синтетический Playwright dataset, время до появления списка и cluster layer:

| Task points | Ready | Видимые cluster markers |
| ---: | ---: | ---: |
| 50 | 727 ms | 5 |
| 100 | 1 161 ms | 5 |
| 250 | 1 598 ms | 10 |
| 500 | 1 946 ms | 15 |

Карта не упала; cluster layer не создал 500 отдельных видимых DOM-маркеров. Боевой endpoint намеренно ограничен `LIMIT 100`, поэтому 250/500 проверялись через синтетический API response.

## Playwright — DONE

Проверено:

- desktop pan, Search Here, radius, Return to Me, layer toggle и network count;
- task marker → корректный preview без адреса;
- cluster click не открывает случайную Task;
- executor marker показывает только подсказку о недавней активности;
- открытие/закрытие preview не меняет scroll;
- Back восстанавливает Search State и scroll;
- mobile viewport `320 / 375 / 390 / 430`: horizontal overflow `0`, bottom navigation видна, layer controls `44 px`;
- browser console: ошибок карты и React нет.

## Tests — DONE

- Unit/general: `31` tests discovered, `26 passed`, `5 skipped` по отсутствующим optional integration credentials/adapters, `0 failed`.
- Targeted PostGIS integration с локальной БД: `1 passed`, `0 failed`.
- TypeScript: passed.
- ESLint: passed без warnings.
- Production Next.js 16 build: passed.
- Spatial `EXPLAIN`: использован `tasks_location_gist_idx` для geography `ST_DWithin`.
- Docker: app и PostGIS healthy; worker running и `/api/health` сообщает `database=connected`, `worker=healthy`.

## Analytics — DONE

Добавлены только meaningful events: `map_opened`, `map_search_here`, `map_return_to_me`, `map_radius_changed`, `map_task_marker_opened`, `map_task_opened`, `map_cluster_opened`, `map_executor_layer_toggled`, `map_executor_marker_opened`. Camera movement по кадрам не логируется.

## External code

Официальная документация Yandex Maps JS API v3 использована для проверки `YMapListener`, `YMapFeature` и `YMapClusterer` contracts.

**Внешний код непосредственно не копировался.**

## Cost

**Новых платных сервисов подключено: 0.**

## Remaining issues

- Browser geolocation permission и реальное GPS-качество зависят от устройства/Telegram WebView и требуют ручного device smoke test; fallback и разрешения приложения сохранены.
- Боевой nearby endpoint возвращает максимум 100 Task, поэтому нагрузочные 250/500 — сознательно синтетические.
- Executor Presence обновляется с TTL 45 секунд и намеренно не является live tracking.

## Completion audit — 13 августа 2026

Во время повторной сверки с acceptance criteria устранены два оставшихся lifecycle edge case:

- выбор Task больше не пересоздаёт весь task cluster layer: selected-состояние применяется к существующему marker через отдельный effect;
- `onActionEnd` возвращает новый immutable camera snapshot, поэтому React корректно видит второй и последующие pan/zoom действия.

Добавлены отдельные unit tests для переходов `near_me ↔ map_area` и TTL Task/Executor cache. Browser regression подтвердил: после первого Search Here кнопка исчезает, после второго независимого pan появляется снова, а YMap остаётся в единственном экземпляре.
