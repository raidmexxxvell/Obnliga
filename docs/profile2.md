

## Что должно получиться

- Клиент (Telegram WebApp) забирает `initData` из `window.Telegram.WebApp` и отправляет на бэкенд.
- Бэкенд валидирует подпись `initData` по спецификации Telegram (HMAC) с использованием `BOT_TOKEN`.
- При успехе бэкенд извлекает `user.id`, `first_name`, `username`, `photo_url` и делает upsert в таблицу `users`, где хранит `telegramId` и `photoUrl` (в той же таблице).
- Эндпоинт `/api/user` возвращает профиль: `{ id, displayName, username, photoUrl, ... }`.
- Фронтенд кладёт результат в единый store и показывает имя + аватар.


## 1) Бэкенд: валидация Telegram initData

Спецификация (Telegram WebApp):
- Собираем `data_check_string` из пар `key=value` (все параметры, кроме `hash`), отсортированных по ключу.
- Вычисляем секретный ключ: `secret_key = HMAC_SHA256(key = "WebAppData", data = BOT_TOKEN)`
- Считаем подпись: `calculated_hash = HMAC_SHA256(key = secret_key, data = data_check_string)` (hex)
- Сравниваем `calculated_hash` с пришедшим `hash` тайминг-безопасно.
- Проверяем `auth_date` — не старше `max_age_seconds` (например, 24 часа).

Подготовьте `BOT_TOKEN` в окружении (например, `.env`):

```env
BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
```

### Утилита проверки (TypeScript)

```ts
// src/telegram/verifyInitData.ts
import crypto from 'node:crypto';
import { URLSearchParams } from 'node:url';

export type TelegramUser = {
  id: number | bigint;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  is_premium?: boolean;
  language_code?: string;
  // ... другие поля по необходимости
};

export type VerifiedInitData = {
  user: TelegramUser | null;
  auth_date: number;
  raw: Record<string, string[]>; // разобранные параметры initData
};

function timingSafeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function verifyTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = 24 * 60 * 60
): VerifiedInitData | null {
  if (!initData || !botToken) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;

  // Сформировать словарь всех параметров, кроме hash
  const map: Record<string, string> = {};
  for (const [k, v] of params.entries()) {
    if (k === 'hash') continue;
    map[k] = v;
  }

  // data_check_string: ключи отсортированы по алфавиту
  const dataCheckString = Object.keys(map)
    .sort()
    .map((k) => `${k}=${map[k]}`)
    .join('\n');

  // secret_key = HMAC_SHA256("WebAppData", botToken)
  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  const calcHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  if (!timingSafeEqualHex(calcHash, hash)) return null;

  const authDate = Number(params.get('auth_date') || 0);
  if (authDate) {
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > maxAgeSeconds) return null;
  }

  // user — это JSON в поле user
  let user: TelegramUser | null = null;
  const userRaw = params.get('user');
  if (userRaw) {
    try {
      user = JSON.parse(userRaw);
      // Приведение типа id к bigint при желании
      if (user && typeof user.id === 'number') {
        user.id = BigInt(user.id);
      }
    } catch {
      return null;
    }
  }

  // Соберём raw для отладки
  const raw: Record<string, string[]> = {};
  for (const [k, v] of params.entries()) {
    if (!raw[k]) raw[k] = [];
    raw[k].push(v);
  }
  return { user, auth_date: authDate, raw };
}
```

---

## 2) Fastify: эндпоинт `/api/user`

- Принимает `initData` (Form-Data / x-www-form-urlencoded / JSON / заголовок `X-Telegram-Init-Data`).
- Валидирует, делает upsert в `users` (photoUrl в самой таблице), возвращает профиль.

```ts
// src/server.ts
import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import { PrismaClient } from '@prisma/client';
import { verifyTelegramInitData } from './telegram/verifyInitData';

const app = Fastify({ logger: true });
const prisma = new PrismaClient();

app.register(fastifyCors, { origin: true, credentials: true });

function getInitDataFromRequest(req: any): string {
  const header = req.headers['x-telegram-init-data'];
  if (typeof header === 'string' && header) return header;
  const ct = req.headers['content-type'] || '';
  if (ct.includes('application/json')) {
    return (req.body?.initData || req.body?.init_data || '') as string;
  }
  // form-urlencoded / multipart
  return (req.body?.initData || req.body?.init_data || req.query?.initData || req.query?.init_data || '') as string;
}

app.post('/api/user', async (req, reply) => {
  const BOT_TOKEN = process.env.BOT_TOKEN || '';
  const initData = getInitDataFromRequest(req);
  const verified = verifyTelegramInitData(initData, BOT_TOKEN, 24 * 60 * 60);
  if (!verified || !verified.user) {
    return reply.code(401).send({ error: 'Invalid authentication' });
  }

  const u = verified.user;
  const telegramId = BigInt(u.id as any);
  const displayName = u.first_name || 'User';
  const username = u.username || null;
  const photoUrl = u.photo_url || null; // Храним прямо в users.photoUrl

  // Upsert в users
  const user = await prisma.user.upsert({
    where: { telegramId },
    create: {
      telegramId,
      displayName,
      username,
      photoUrl,
      // Доп. поля по желанию: credits/xp/level/consecutiveDays
    },
    update: {
      displayName,
      username,
      photoUrl,
      updatedAt: new Date(),
    },
  });

  // Возвращаем профиль
  return reply.send({
    id: user.id,
    telegramId: user.telegramId.toString(),
    displayName: user.displayName,
    username: user.username,
    photoUrl: user.photoUrl,
    credits: user.credits,
    xp: user.xp,
    level: user.level,
    consecutiveDays: user.consecutiveDays,
    updatedAt: user.updatedAt,
  });
});

// Запуск
export async function start() {
  const port = Number(process.env.PORT || 3000);
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`Server on http://localhost:${port}`);
}

if (require.main === module) {
  start();
}
```

Опционально: вынесите проверку в плагин/декоратор Fastify, чтобы доступ к `req.user` был стандартным для защищённых роутов.

---

## 3) Frontend (Vite + React/Preact + TS + single-store)

- Достаём `initData` из `window.Telegram.WebApp` и отправляем на `/api/user`.
- Кладём ответ в единый store, используем в компоненте профиля.

```ts
// src/stores/userStore.ts (фасад single-store поверх Zustand/nano-stores)
import { atom } from 'nanostores';

export type UserProfile = {
  id: number;
  telegramId: string;
  displayName: string;
  username?: string | null;
  photoUrl?: string | null;
  credits: number;
  xp: number;
  level: number;
  consecutiveDays: number;
};

export const $user = atom<UserProfile | null>(null);
export const setUser = (u: UserProfile | null) => $user.set(u);
```

```ts
// src/api/user.ts
export async function fetchUserProfile(): Promise<void> {
  // @ts-expect-error: Telegram типизируем опционально
  const tg = (window as any).Telegram?.WebApp;
  const initData = tg?.initData || '';

  const res = await fetch('/api/user', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Можно дублировать в заголовок — сервер умеет извлекать
      'X-Telegram-Init-Data': initData,
    },
    body: JSON.stringify({ initData }),
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Auth failed');
  const data = await res.json();
  const { setUser } = await import('../stores/userStore');
  setUser(data);
}
```

```tsx
// src/components/Profile.tsx (подходит и для Preact)
import { useStore } from '@nanostores/react';
import { $user } from '../stores/userStore';
import { useEffect, useState } from 'react';
import { fetchUserProfile } from '../api/user';

export function Profile() {
  const user = useStore($user);
  const [loading, setLoading] = useState(!user);

  useEffect(() => {
    if (!user) {
      fetchUserProfile().finally(() => setLoading(false));
    }
  }, []);

  if (loading) return <div>Загрузка…</div>;
  if (!user) return <div>Не авторизован</div>;

  return (
    <div class="profile">
      <div class="profile-header">
        <div class="profile-avatar">
          {user.photoUrl ? (
            <img src={user.photoUrl} alt="avatar" width={96} height={96} />
          ) : (
            <div class="avatar-placeholder" />
          )}
        </div>
        <div class="profile-info">
          <h2>{user.displayName || 'Пользователь'}</h2>
          {user.username ? <div>@{user.username}</div> : null}
        </div>
      </div>
      {/* ... остальной профиль ... */}
    </div>
  );
}
```

Фолбэк на фронте: если сервер не вернул `photoUrl`, можно подхватить `tg?.initDataUnsafe?.user?.photo_url` для мгновенной отрисовки, но рекомендовано хранить/отдавать с бэкенда.

---

## 4) Redis/BullMQ (опционально)

- Можно ставить задачу в очередь для «локализации» аватара: скачать `photo_url` в свой CDN/объектное хранилище, обновить `users.photoUrl` на постоянную ссылку.
- Это повышает надёжность (ссылки Telegram могут истечь) и ускоряет доставку.

Набросок:

```ts
// src/queues/avatarQueue.ts
import { Queue } from 'bullmq';
export const avatarQueue = new Queue('avatar', { connection: { host: 'localhost', port: 6379 } });

// где-то после upsert:
if (photoUrl) {
  await avatarQueue.add('mirror', { telegramId: telegramId.toString(), photoUrl });
}
```

В воркере:
- скачать файл,
- положить в S3/MinIO/Cloud Storage,
- обновить `users.photoUrl`.

---

## 5) Безопасность и нюансы

- BOT_TOKEN обязателен в продакшене; не валидируйте без него.
- Строго соблюдайте порядок расчёта подписи и используйте тайминг-безопасное сравнение.
- Проверяйте `auth_date` и ограничивайте максимальный возраст `initData` (например, 24 часа).
- Разрешите CORS корректно (если фронт и бэк на разных доменах), но не ослабляйте безопасность лишний раз.
- Лимитируйте частоту запросов к `/api/user` (например, по IP или по Telegram ID).
- Храните Telegram ID в `BigInt` (в TS это `bigint`), сериализуйте строкой при отдаче в JSON, если нужно.