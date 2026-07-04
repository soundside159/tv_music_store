# SETUP_BACKEND — шаги владельца (шаг 3, фаза 3.1)

> Код бэкенда уже в репо: `migrations/0001_init.sql` + `functions/api/*`.
> Чтобы он ожил, нужно один раз создать базу и привязать её к Cloudflare Pages.
> Всё делается с твоей машины / из дашборда Cloudflare. Секреты в чат не вставлять!

## 1. Создать базу D1 (один раз)

В папке репо:

```bash
npx wrangler login          # откроет браузер, войди в Cloudflare
npx wrangler d1 create tvmusicstore-db
npx wrangler d1 execute tvmusicstore-db --remote --file=./migrations/0001_init.sql
```

Проверка: `npx wrangler d1 execute tvmusicstore-db --remote --command "SELECT id, name FROM plan_config"` — должны вернуться free/pro/max.

## 2. Привязать базу к Pages

Cloudflare Dashboard → Workers & Pages → твой проект (tv_music_store) →
**Settings → Bindings → Add → D1 database**:

- Variable name: `DB`
- D1 database: `tvmusicstore-db`

Сохранить → **Redeploy** (Deployments → последний → Retry deployment), биндинги применяются только к новым деплоям.

## 3. Проверить, что API живо

После деплоя открой `https://tvmusicstore.com/api/health` — должно показать
`"ok": true, "db": "ok (3 plans)"` и статусы ключей (пока missing — это нормально).

## 4. Тест логина (работает уже сейчас, без Resend)

1. POST `https://tvmusicstore.com/api/auth/request-code` с `{"email":"твой@email"}` (или через будущую форму логина).
2. Пока Resend не подключён, код НЕ придёт на почту — он пишется в лог функции: Dashboard → Workers & Pages → проект → **Logs** (Real-time logs) → строка `[auth dev-fallback] login code for ...`.
3. POST `/api/auth/verify` с `{"email":"...","code":"123456"}` → сессионная кука, `/api/me` покажет юзера с планом free.

## 5. Секреты — добавлять по мере регистрации (Settings → Environment variables, тип Secret)

| Переменная | Откуда | Что включает |
|---|---|---|
| `RESEND_API_KEY` | resend.com → API Keys (домен tvmusicstore.com подтвердить в Domains: 2 DNS-записи, они у тебя в том же Cloudflare) | реальные письма с кодом входа |
| `EMAIL_FROM` | напр. `TV Music Store <login@tvmusicstore.com>` | адрес отправителя |
| `STRIPE_SECRET_KEY` | stripe.com → Developers → API keys (начни с test mode `sk_test_...`) | оплаты (фаза 3.2) |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Webhooks → endpoint `https://tvmusicstore.com/api/stripe/webhook` | подтверждение платежей (фаза 3.2) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | console.cloud.google.com → APIs & Services → Credentials → OAuth client ID (Web), redirect URI `https://tvmusicstore.com/api/auth/google/callback` | кнопка «Continue with Google» (фаза 3.2) |

После добавления каждого секрета — Redeploy.

## Что уже есть в коде (фаза 3.1)

- `GET /api/health` — самодиагностика (база, ключи)
- `GET /api/tracks` — каталог из D1 (треки + версии)
- `POST /api/auth/request-code` → `POST /api/auth/verify` → кука-сессия → `GET /api/me`
- `POST /api/auth/logout`
- Новый юзер автоматически получает подписку `free` (3 скачивания/мес считаются по `download_log`)

## Дальше (фаза 3.2, после ключей)

Login-форма на фронте + переключение хуков с моков на API → Stripe Checkout/Billing + webhook → R2 приватные файлы + `/api/download` с проверкой лимитов → Resend-письма → Google OAuth. Порядок в `docs/TVMUSICSTORE_MASTER_PLAN.md`, раздел 8.
