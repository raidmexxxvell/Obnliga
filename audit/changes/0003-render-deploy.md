Дата: 2025-09-28
PR: ci/infra — initial Render deployment manifest and docs

Что сделано:
- Добавлен `render.yaml` с сервисами: backend (web_service), frontend (static_site), worker (node) и job `run-migrations`.
- Добавлен `docs/render-deploy.md` с подробной инструкцией по деплою и переменным окружения.

Почему безопасно:
- Это конфигурация и документация — не влияет на рантайм пока не применена в Render.

Следующие шаги:
- Настроить Render service: подключить репозиторий, создать/проверить секреты (DATABASE_URL, REDIS_URL, TELEGRAM_BOT_TOKEN).
- Проверить job `run-migrations` на staging.
