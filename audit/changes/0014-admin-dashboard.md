# 0014 — Admin dashboard skeleton

## До
- Не было отдельного фронтенда для администратора; отсутствовала авторизация на основе Render ENV.
- Backend имел только временный `/api/admin/test-login`, неподходящий для production и не интегрированный с dashboard.

## После
- Создан отдельный Vite-проект `admin/` с авторизацией через форму, сторами на Zustand и вкладками (Команды, Матчи, Статистика, Управление игроками, Новости) с заглушками.
- Бэкенд расширен эндпоинтом `/api/admin/login`, который использует `LOGIN_ADMIN` / `PASSWORD_ADMIN` и возвращает JWT.
- Обновлены документация (`docs/project.md`, `docs/roadmap.md`, `docs/state.md`, `docs/dev-setup.md`, `docs/style.md`) и audit summary.

## Влияние на метрики
- Retention: 🔵 — админы получают единое место управления, снижает friction.
- Engagement: 🔵 — ускоряет выпуск контента/матчей, повышая интерактивность.
- Revenue: ⚪ — на данный момент прямое влияние отсутствует.
- Tech Stability: 🔵 — централизованный доступ с проверкой по ENV уменьшает риск временных костылей.

## Проверки
- `cd backend && npm install && npm run build` (валидирует новый эндпоинт и зависимости)
- `cd admin && npm install && npm run build`
- Smoke: запустить backend на 3000 и admin dev на 5183, проверить вход с ENV.
