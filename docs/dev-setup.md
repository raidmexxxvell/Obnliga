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

Notes:
 - This is a skeleton. Phase 1 will add Prisma, DB, migrations and shared typing sync.
