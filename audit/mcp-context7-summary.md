# MCP Context7 — Summary Audit

Дата обновления: 04-10-2025

Назначение файла: зафиксировать наличие/отсутствие артефактов из предыдущего проекта и определить стратегию их переноса на текущий стек (Node.js + Fastify + Prisma + Vite + React). На момент обновления локальных файлов из `audit/context7/*` **не обнаружено** — требуется спланированная до-загрузка. Ниже приведён консолидированный список паттернов и модулей, на которые мы опираемся при разработке.

---

## 1. Состояние контекстов и следующий шаг

- `audit/context7/` — директория отсутствует. Необходимо запросить и выгрузить артефакты через mcp context7 перед началом активной разработки новых подсистем.
- Для ближайшей задачи (админ-дэшборд и мультилиговая статистика) критичны референсы по следующим темам: admin-logger, RBAC flow, UI-шаблоны панелей, patch-based WS интеграция.
- Дополнительно требуются контексты по карьерной статистике и структуре турнирных туров/стадий (ожидаемые файлы: `backend/stats/player-career.ts`, `backend/schedule/rounds.ts`).
- План: после получения доступа запросить набор файлов (пример):
  1. `frontend/admin/dashboard-layout.tsx` — шаблон раскладки и неокубистская стилистика.
  2. `frontend/admin/hooks/useAdminAuth.ts` — пример фасада для админской аутентификации.
  3. `backend/admin/logger.ts` — концепция audit log и RBAC middleware.
  4. `frontend/common/styles/neon-theme.css` — палитра и UI-токены.
  5. `backend/stats/player-career.ts` — пример агрегации карьерной статистики на уровне клуба.
  6. `backend/schedule/rounds.ts` — справочник по структуре туров и стадий плей-офф.

До поступления этих артефактов новые реализации помечаются как **temporary stub** и сопровождаются планом последующей синхронизации.

---

## 2. Классификация ключевых паттернов

| Модуль / Паттерн | Текущий источник | Стратегия | Необходимый фасад/адаптер | Тесты (состояние) | Заметки / Риски |
|------------------|------------------|-----------|----------------------------|-------------------|-----------------|
| Multilevel Cache | `backend/src/cache/multilevelCache.ts` | **Refactor** — привести API к контрактам из прошлой версии (TTL, tryAcquire, invalidate) | `backend/src/cache/index.ts` (уже выступает фасадом) | Unit tests отсутствуют → план добавить Jest | Риск расхождения с прежним поведением Redis pub/sub; требуется сверка с контекстом `redis-cache.md` после получения |
| ETag + SWR | `backend/src/plugins/etag.ts`, планируемый `frontend/src/api/etag.ts` | **Reuse** — портировать старый fetch-wrapper на TS | `frontend/src/api/etag.ts` (создать) | Нет тестов → запланировать msw | Требуется сверка с `etag-swr.md` |
| Patch-based WS | `backend/src/realtime/index.ts`, `frontend/src/wsClient.ts` | **Refactor** — добавить поддержку topics, retry, patch-apply | WS client фасад (уже есть, доработать) | Нет e2e → план Playwright | Нужен reference `patch-ws.md` |
| Admin Logger / RBAC | пока отсутствует (только модель `AdminActionLog` в Prisma) | **Rewrite** (нет текущего кода) | Планируемые файлы: `backend/src/routes/adminRoutes.ts`, `backend/src/utils/adminLogger.ts` | Нет | До появления исходных артефактов разрабатываем минимальный прототип |
| Store Façade (Zustand) | `frontend/src` (store ещё не создан) | **Reuse/Rewrite** — создать фасад по контракту `docs/state.md` | `frontend/src/store/facade.ts` | Нет | Нужно получить `store-patterns.md` |
| Admin UI Theme | пока отсутствует | **Rewrite** (стилизованный неокубизм) | Общие стили: `frontend/src/app.css` + будущий `admin/src/theme.css` | Визуальные тесты не настроены | Нужен reference по UI токенам |
| Player Career Aggregation | draft в `backend/src/services/matchAggregation.ts` | **Refactor** — перенести сумматоры из context7 для career stats | Новый модуль `backend/src/services/playerCareer.ts` (после синхронизации) | Нет | Временная реализация помечается как stub, требуется сверка с исходным контрактом |
| Season Rounds/Stages | временно отсутствует | **Rewrite** — добавить справочник туров и стадий плей-офф | `backend/src/services/seasonAutomation.ts` + общий adapter | Нет | Ожидаем контекст `schedule-rounds.md`, текущее решение временное |

---

## 3. Отсутствующие артефакты и действия

| Тема | Что нужно | Статус | Действие |
|------|-----------|--------|----------|
| admin-logger | mcp key `admin/logger` или аналог | ❌ | Запросить через mcp context7, до получения использовать stub логирование через Fastify logger |
| admin UI layout | `admin/dashboard` шаблон | ❌ | Запросить макет/компоненты; временно создать skeleton с неоновыми панелями |
| auth guard | `admin/auth` фасад | ❌ | Создать временный Basic Auth по env и отметить необходимость синхронизации |
| player-career stats | `stats/player-career.ts` | ❌ | Подтвердить, что агрегирование строится на матчевых событиях + lineups; до получения — временная реализация на Prisma groupBy |
| schedule rounds | `schedule/rounds.ts` | ❌ | Сверить шаблоны формирования туров, чтобы не расходиться с прошлой моделью |
| lineup portal | `frontend/lineup-portal.tsx`, `backend/lineup/auth.ts` | ❌ | Создан temporary stub `/lineup`; требуется загрузка исходного UX и протокола подтверждения составов |

---

## 4. Риски и mitigation

1. **Отсутствие context7 артефактов.**  
  *Mitigation:* фиксируем в этом отчёте, отмечаем каждую временную реализацию как подлежащую доработке после получения материалов. В audit/changes для соответствующих задач обязательно указывать пометку "temporary implementation".

2. **Несоответствие кэша и WS протокола прежним версиям.**  
  *Mitigation:* при первой возможности свериться с `redis-cache.md` и `patch-ws.md`, добавить интеграционные тесты.

3. **Admin UI без подтверждённого дизайна.**  
  *Mitigation:* используем tokens из `frontend/src/app.css`, поддерживаем неокубистскую стилистику, делаем компоненты переиспользуемыми.

---

## 5. Чеклист готовности перед изменениями

- [x] Зафиксировано отсутствие артефактов и подготовлен план по их получению.
- [ ] Получены и сохранены context7 файлы (`audit/context7/*`).
- [ ] Подготовлены фасады на основе оригинальных контрактов.
- [ ] Написаны unit/integration тесты на ключевые адаптеры.

Данный отчёт должен обновляться по мере появления контекстов и прогресса по фасадам.