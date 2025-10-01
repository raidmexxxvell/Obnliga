# Профиль пользователя — анализ получения Telegram ID и фото

Документация по тому, как в проекте получается идентификатор пользователя из Telegram (Telegram user id) и фото пользователя (photo_url), какие функции и таблицы задействованы, и как данные сохраняются/используются.

## Краткое описание потока данных

1. Клиент (Telegram Web App) получает `initData` от Telegram JS API (window.Telegram.WebApp.initData / initDataUnsafe).
2. Клиент отправляет `initData` на бэкенд: как поле формы `initData` (или `init_data`), в JSON ({ initData }), или в заголовке `X-Telegram-Init-Data`.
3. На сервере `initData` проверяется функцией валидации подписи (HMAC) — сервер вычисляет секретный ключ и сравнивает хеш.
4. После успешной валидации из `initData` извлекается объект `user` (JSON) с полями вроде `id`, `first_name`, `username`, `photo_url`, `auth_date` и др.
5. `user.id` используется как идентификатор (Telegram ID). 

## Ключевые места в коде (файлы и функции)

- Валидация HMAC и парсинг initData
  - `utils/security.py` — класс `TelegramSecurity.verify_init_data`.
    - Формула: secret_key = HMAC_SHA256(key="WebAppData", data=BOT_TOKEN)
    - calculated_hash = HMAC_SHA256(secret_key, data_check_string)
    - Также проверяется `auth_date` на возраст (max_age_seconds).
  - `core/__init__.py` содержит более простой/стабовый `parse_and_verify_telegram_init_data` (используется в некоторых местах как вспомогательная реализация).
  - `app.py` — основная реализация `parse_and_verify_telegram_init_data` (строки около 9029 и далее). Именно она фактически парсит `initData`, проверяет подпись и возвращает словарь со 'user', 'auth_date', 'raw'.

- Декоратор и получение данных из запроса
  - `utils/decorators.py` — функция `require_telegram_auth`:
    - Извлекает `initData` из: form (POST), JSON, query args, заголовка `X-Telegram-Init-Data`, или из тела запроса.
    - Вызывает `telegram_security.verify_init_data` (глобальный экземпляр `telegram_security` из `utils/security.py`).
    - При успехе кладёт `g.user = auth_data.get('user')` и `g.auth_data = auth_data` для последующего использования в обработчиках.

- Место формирования профиля и сохранения
  - `app.py` — маршрут `/api/user` (функция `get_user`):
    - Берёт `user_data` из `flask.g.auth_data['user']` если декоратор установил, или сам вызывает `parse_and_verify_telegram_init_data(initData)`.
    - Использует `user_data['id']` как идентификатор и пытается получить/создать запись в таблице `users` (модель `User` определена в `app.py`, `users.user_id` — PK).
    - При первом создании создаёт `Referral` код и т.д.
    - Затем зеркалирует `photo_url` (если есть) — в `UserPhoto` (модель `UserPhoto` в `app.py`):
      - Если уже есть строка `UserPhoto(user_id)`, обновляет `photo_url` и `updated_at`.
      - Иначе добавляет новую запись `UserPhoto(user_id=..., photo_url=...)`.
    - В ответе возвращает сериализованный профиль `serialize_user(db_user)`.

- Клиентский код
  - `static/js/profile-user.js` — если доступен `tg.initDataUnsafe.user.photo_url`, устанавливает `elements.userAvatarImg.src = tg.initDataUnsafe.user.photo_url`.
  - `static/js/admin-enhanced.js` и другие скрипты добавляют `initData` в форму/запросы: `fd.append('initData', window.Telegram?.WebApp?.initData || '');`

- Модели (БД)
  - `app.py`:
    - `class User(Base)` (таблица `users`) — поле `user_id` (Integer, PK). В коде приложение использует `user_id = int(user_data['id'])`.
    - `class UserPhoto(Base)` (таблица `user_photos`) — поля: `user_id`, `photo_url`, `updated_at`.
  - `database/database_models.py`:
    - `class Player(Base)` (таблица `players`) — поле `telegram_id = Column(BigInteger, unique=True)`.
    - Эти `players` используются для другой доменной сущности (игроки команд), не обязательно совпадают с `users`.

## Последовательность (пошагово)

1. Telegram Web App инициализирует WebApp и предоставляет `initData` в клиентском JS (встраиваемая переменная `window.Telegram.WebApp.initData`, а также небезопасный доступ `initDataUnsafe`).
2. Клиент отправляет `initData` к серверу (поле формы `initData`, JSON, или заголовок `X-Telegram-Init-Data`). Многие фронтенд-скрипты добавляют `initData` автоматически.
3. На сервере вызывается `parse_and_verify_telegram_init_data`
4. Сервер проверяет подпись (HMAC) с использованием `BOT_TOKEN` из окружения.
5. Если подпись валидна, возвращается parsed dict: { 'user': <dict or None>, 'auth_date': <int>, 'raw': <parsed> }.
6. `user` содержит `id` и (если Telegram дал) `photo_url`. Сервер использует `user['id']` как идентификатор пользователя:
   - Для веб-профиля — `users.user_id`
   - Для хранения фото — `photo_url` 

## Примечание о текущей реализации (обновлено)

В текущей версии проекта (Node.js + Fastify + Prisma) реализованы дополнительные детали, которые отличаются от старого Flask-примера:

- На фронтенде (`frontend/src/Profile.tsx`) при загрузке страницы выполняется ленивый авто-проверочный путь: компонент пытается загрузить профиль по сохранённому токену, а при его отсутствии (и когда приложение запущено внутри Telegram WebApp) автоматически отправляет `initData` на `/api/auth/telegram-init` в фоне и подгружает фото/имя пользователя без явного нажатия кнопки.
- Серверный маршрут `/api/auth/telegram-init` использует пакет `@telegram-apps/init-data-node`: сначала проверяет подпись initData по HMAC (секрет вычисляется через BOT_TOKEN), при неуспехе пытается `validate3rd` (Ed25519-подпись Telegram), а затем извлекает `user` (поддерживает как flattened params, так и JSON-поле `user`) и выполняет upsert в таблицу `users`.
- После успешного upsert сервер возвращает JWT (в поле `token`) и пытается установить httpOnly cookie `session`. Фронтенд сохраняет `token` в `localStorage` как fallback и затем вызывает `/api/auth/me` для получения профильных данных.
- Все даты хранятся в UTC в БД; фронтенд форматирует их в MSK (UTC+3) в формате `dd.MM.yyyy` для отображения.

Если требуется — можно расширить поддержку форматов передачи initData (заголовки, form-data) аналогично старому проекту, но текущая реализация покрывает наиболее частые случаи (JSON body и поле `user`).

## Где именно лежит Telegram ID и фото в БД

- Telegram ID пользователя (как PK пользователя в веб-приложении):
  - `users.user_id` (модель `User` в `app.py`) — сюда кладётся `int(user_data['id'])` при `get_user`.
- Telegram ID в контексте "игроков" (team/player model):
  - `players.telegram_id` (модель `Player` в `database/database_models.py`) — отдельное поле для сущности "игрок".
- Фото пользователя:
  - `user_photos` (модель `UserPhoto` в `app.py`) — `user_id` → `photo_url`.

## HTTP API (важные endpoints)

- POST /api/user
  - Описание: возвращает профиль текущего пользователя. Требует Telegram initData (декоратор `@require_telegram_auth()`), либо проверяет initData сам.
  - Действия: создаёт/обновляет запись в `users`, зеркалирует `photo_url`.

- GET /api/user/avatars?ids=1,2,3
  - Возвращает JSON { avatars: { user_id: { avatar_url: photo_url }, ... } } для указанных `user_id`.

## Важные замечания / нюансы и edge-cases

- В продакшене `BOT_TOKEN` обязателен. Подпись HMAC зависит от токена. Без правильного токена `initData` не валидируется.
- Валидация `auth_date`: если данные устарели (старше `max_age_seconds`, по умолчанию 24h), то авторизация отклоняется.