# Dev setup — skeleton

1) Backend (Fastify TS)

  - cd backend
  - npm ci
  - npm run dev

Server listens on http://localhost:3000 and has a /health endpoint.

2) Frontend (Vite + React)

  - cd frontend
  - npm ci
  - npm run dev

Open http://localhost:5173 (Vite default) to view the app.

  3) Admin dashboard (отдельный Vite-проект)

    - cd admin
    - npm install
    - npm run dev

  Админская панель работает на http://localhost:5183. Для локального входа задайте `LOGIN_ADMIN` и `PASSWORD_ADMIN` в `.env` backend и убедитесь, что backend запущен.

Notes:
 - This is a skeleton. Phase 1 will add Prisma, DB, migrations and shared typing sync.
