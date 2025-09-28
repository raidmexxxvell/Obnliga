# MCP Context7 — Summary Audit

Дата: 28-09-2025

Все артефакты, шаблоны и ссылки, которые агент извлёк с помощью mcp context7, чтобы последующие изменения опирались на согласованный, локальный контекст.

---

## 1. Сбор артефактов через mcp context7

| Артефакт / Тема | mcp-context7 ключ / путь | Локальный файл | Summary / Комментарии |
|------------------|----------------------------|------------------|------------------------|
| Prisma (версия) | `prisma@<version>` | `audit/context7/prisma-<version>.md` | краткий обзор / основные API / миграции |
| Fastify | `fastify@<version>` | `audit/context7/fastify-<version>.md` | плагины, схема маршрутов, validation |
| BullMQ | `bullmq@<version>` | `audit/context7/bullmq-<version>.md` | очередь задач, worker patterns |
| Redis / cache patterns | `redis/cache` | `audit/context7/redis-cache.md` | TTL, invalidation, pub/sub |
| ETag / SWR fetch | `etag-swr` | `audit/context7/etag-swr.md` | fetch wrappers, If-None-Match |
| Patch-WS / real-time | `patch-ws` | `audit/context7/patch-ws.md` | protocol patterns, versioning |
| Store patterns | `zustand` / `nanostores` | `audit/context7/store-patterns.md` | selectors, middleware, persistence |
| Render deployment | `render/nodejs` | `audit/context7/render-deploy.md` | env, build/start config |

> **Убедитесь**, что для каждого артефакта агент сохранил файл, содержащий:
> - описательный заголовок и ключ mcp context7  
> - краткое summary  
> - полезные код-сниппеты  
> - ограничения / версии  
> - ссылки на локальные исходные модули или пакеты, где это применимо

Также агент должен сформировать `audit/context7/index.json`:

json
{
  "prisma": "prisma-<version>.md",
  "fastify": "fastify-<version>.md",
  "bullmq": "bullmq-<version>.md",
  "redis-cache": "redis-cache.md",
  "etag-swr": "etag-swr.md",
  "patch-ws": "patch-ws.md",
  "store-patterns": "store-patterns.md",
  "render-deploy": "render-deploy.md"
}


## 2. Классификация и решение по артефактам 

Для каждого артефакта/паттерна:
1. Путь / модуль — где он используется в существующем проекте или где будет использоваться в новом.
2. Стратегия: reuse, refactor, rewrite
3. Адаптер / фасад нужен? — указать имя файла фасада и интерфейс.
4. Покрытие тестами (unit, integration).
5. Риски и mitigations.

# Пример сегмента:
Модуль: etag-fetch (frontend)  
Ключ mcp: etag-swr  
Локальный файл: audit/context7/etag-swr.md  
Стратегия: reuse (port to TS)  
Фасад: frontend/src/api/etag.ts  
Тесты: unit + mock HTTP server  
Риски: нестабильные ETag → лишние fetches; mitigation: строгий JSON-сериализатор, тесты.


## 3. Расхождения и контроль

Если mcp context7 содержит сведения, противоречащие проекту или паттернам — фиксировать:

- В файл audit/context7/discrepancies.md:
описание расхождения
источник (mcp файл)
предложение решения / выбор стратегии
- В PR body при изменении — ссылка на discrepancy файл и justification


## 4. Чеклист готовности перед кодом

 1) Все ключевые файлы audit/context7/*.md созданы и частично заполнены
 2) audit/context7/index.json сформирован
 3) mcp-context7-summary.md (этот файл) закоммичен
 4) Проверена полнота по темам: cache, ws, etag, queue, store
 5) Скeлет фасадов / адаптеров (stubs) подготовлен и покрыт заглушечными тестами


## 5. Пошаговая миграция (инкрементная)

1) Сбор контекста (этот файл + context7 файлы)
2) Создание скелетов фасадов / адаптеров на основе context7 → без изменения legacy кода
3) Переключение одного use-case (например: /api/matches) на адаптер
4) Проверки, тесты, исправления
5) Последовательный перенос других модулей
6) Полный cutover, удаление legacy-shims


## 6. Примеры имён файлов

audit/context7/prisma-4.12.1.md
audit/context7/fastify-4.3.0.md
audit/context7/bullmq-2.0.0.md
audit/context7/etag-swr.md
audit/context7/patch-ws.md
audit/context7/store-patterns.md
audit/context7/render-deploy.md
audit/context7/index.json
audit/mcp-context7-summary.md