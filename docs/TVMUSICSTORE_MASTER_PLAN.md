# TVMUSICSTORE.COM — Master Plan V2 (подписочная модель, 3 композитора)

> Документ для AI-агентов и владельца. V2 заменяет V1 (поштучная модель одного композитора).
> Главное изменение: монетизация теперь подписка (по образцу tunetank.com) + разовые sync-лицензии, каталог общий на трёх авторов, добавлены роли «композитор» и система выплат.
> Детальная поэкранная спецификация: `docs/PAGES_SPEC.md`.

---

## Текущий статус реализации

- Стек: React 18 + TypeScript + Vite + Tailwind + shadcn/ui, Cloudflare Pages, деплой из `main`.
- `/catalog` и `/track/:slug` существуют на временных данных из `src/data/catalogTracks.ts` (2 реальных трека, 6 MP3-превью в `public/audio/previews/`).
- WAV-мастера и стемсы не коммитить; позже — приватно в Cloudflare R2.
- UI-курс: тёмный минимализм; **акцентный цвет всех интерактивных состояний (hover/active/progress) — фирменный жёлтый/золотой, единым токеном в Tailwind. Cyan/синий из ранних итераций заменяется на жёлтый (решение владельца, 2026-07-03).** База — графит/нейтральные.
- Структура каталога (колонки строк, фильтры, коллекции, click-to-seek waveform) — сохраняется как есть, детали в `AGENTS.md`.

---

## 1. Концепция

**Нишевый premium-лейбл из трёх композиторов, ~1000 треков:**

- Автор 1 (владелец платформы): ~250 cinematic/score треков (Modern Score, Thriller, Game OST, Production).
- Автор 2: ~250 premium sport/electronic.
- Автор 3: ~400 гитарных треков в cinematic-стилях.

Позиционирование: **«Кураторский кинематографический каталог — без AI-мусора и стокового однообразия»**. Конкурируем не объёмом, а качеством ниши. Дизайн — минимализм, жёлтый акцент, кинотеатры на главной как бренд-хук.

Все треки всех авторов зарегистрированы в Content ID (EpicElite), каждый автор снимает клеймы по своим трекам → **гарантия «claim removed within 24h» на весь каталог** — главный крючок доверия.

---

## 2. Монетизация

### 2.1 Подписки (ядро, структура как у Tunetank)

| План | Цена | Что входит |
|---|---|---|
| **Free** | $0, без карты | Прослушивание всего каталога. **3 скачивания/мес** (MP3), personal-лицензия, ручное снятие клейма |
| **Pro** | $7/мес годовой · $12 помесячно | Безлимит MP3. Personal & small-team (≤5 чел). Whitelist **3 канала** |
| **Max** | $15/мес годовой · $29 помесячно | + **коммерческая лицензия** (реклама, клиентские проекты, бренды) + **WAV + стемсы** + whitelist **10 каналов** + приоритетная поддержка |

Правила: скачанное и использованное при активной подписке остаётся лицензированным для тех проектов навсегда; новые проекты требуют активной подписки или разовой лицензии.

### 2.2 Разовые Sync-лицензии (страница /sync)

Подписка НЕ покрывает: ТВ-эфир, кино/стриминг, трейлеры, встраивание в игры/приложения.

| Лицензия | Цена | Покрытие |
|---|---|---|
| Sync Standard | $199 | Игры (инди), онлайн-фильмы, фестивали |
| Sync Broadcast | $399 | ТВ, стриминг, трейлеры, AAA. Стемсы включены |

### 2.3 Сервисы

- Track Adaptation — от $149; Custom Music — от $499. Заявки распределяются между авторами по стилю. Автор-исполнитель получает 50%, платформа 50%.

### 2.4 Лестница целиком

Free (3 dl/мес) → Pro $7 → Max $15 → Sync $199–399 → Adaptation $149+ → Custom $499+.

---

## 3. Экономика и выплаты

1. Вся выручка минус комиссии Stripe = net revenue.
2. **50% — платформа** (владелец: разработка, хостинг, маркетинг, помощник).
3. **50% — пул авторов**, пропорционально скачиваниям треков автора за месяц (1 скачивание = 1 балл; вес Max-скачиваний ×2 — настраиваемый параметр, на старте все равны). Sync/custom: авторские 50% идут напрямую автору трека/заказа.
4. Владелец получает два дохода: платформенные 50% + авторская доля по своим трекам.
5. Выплаты: ежемесячно до 15 числа, порог $50, вручную (Wise). В админке — авто-расчёт + PDF-statement каждому автору.
6. Все проценты/веса/пороги — редактируемые параметры в админке, не хардкод.
7. ⚠️ До запуска: бухгалтер (UK-структура, выплаты в Польшу), **Stripe Tax включить** (VAT на цифровые подписки для EU — обязательно).
8. С каждым автором — договор: лицензия платформе на дистрибуцию, право снятия каталога с уведомлением 30 дней, подтверждение авторства и Content ID-регистрации.

---

## 4. Три роли и три кабинета

### 4.1 Клиент (/account)

Маршрут: слушает всё свободно → жмёт Download → регистрация (email magic-link или Google) → Free 3 скачивания/мес со счётчиком → упёрся в лимит / нужен WAV / whitelist / коммерческая лицензия → /pricing → Stripe Billing.

Кабинет: Overview, Downloads (история + re-download), License (план + sync-лицензии PDF), Whitelist channels (Pro 3 / Max 10, статусы), Claims (заявка + статусы ≤24h), Billing (Stripe portal, при отмене — 1 вопрос «почему»), Support.

### 4.2 Композитор (/composer)

Dashboard (скачивания, прогноз заработка, топ-треки) · My Tracks (статусы модерации) · Upload (WAV + метаданные → на модерацию) · Earnings (баллы, суммы, statements) · Requests (whitelist/claim по своим трекам, custom-брифы) · Profile (публичный + payout details).

### 4.3 Админ (/admin) — модульная структура

Dashboard (MRR, подписки, конверсия) · Tracks (+модерация загрузок) · Playlists/Storefront · Plans & Licensing (цены/лимиты/тексты без деплоя) · Customers (mini-CRM) · Finance (расчёт выплат, statements, mark paid) · Composers · Analytics (воронка, топ-треки, поиск-без-результатов, причины отмен) · Marketing (промокоды, рассылки) · Requests & Support · Blog.

---

## 5. Структура сайта

`/` (кинотеатры + к релизу 15-сек AI-видео по клику, CTA «Start free — 3 downloads/month») · `/catalog` (есть; + фильтр по автору, бейджи планов, счётчик лимита) · `/pricing` (Free/Pro/Max, annual по умолчанию, сравнительная таблица, FAQ) · `/sync` · `/custom` · `/artist/:slug` ×3 · `/track/:slug` (есть) · `/playlists`, `/playlist/:slug` · `/blog` · `/licensing` · `/account` · `/composer` · `/admin` · `/terms`, `/privacy`, `/license-agreement`.

Полная поблочная спецификация каждой страницы — `docs/PAGES_SPEC.md`.

---

## 6. Техническая архитектура

Стек фиксирован: Vite + React 18 + TS + Tailwind + shadcn/ui, Cloudflare Pages + Functions/Workers, D1, R2, Resend. Без Next.js/Supabase/WordPress.

- **Stripe Billing** (подписки monthly/annual, prorate) + Stripe Checkout (sync/custom) + **Stripe Tax**. Webhooks: `customer.subscription.*`, `invoice.paid`, `checkout.session.completed`. Платежи реальны только после webhook-подтверждения.
- **Entitlements-слой в Worker:** каждый download-запрос проверяет план и лимит → подписанный R2-URL (MP3 всем, WAV/stems только Max).
- Auth: email magic-link + Google OAuth; роли customer/composer/admin в одной таблице users.

### Схема D1 (V2)

```
users(id, email, name, role[customer|composer|admin], google_id, created_at)
composers(id, user_id, slug, display_name, bio, payout_details, revenue_weight)
tracks(id, slug, title, composer_id, category, bpm, duration, description, has_stems,
       moderation_status[pending|approved|rejected], status[draft|scheduled|published], publish_at)
track_versions(id, track_id, type, duration, r2_key_wav, r2_key_mp3_preview)
tags / track_tags · playlists / playlist_tracks
subscriptions(id, user_id, stripe_sub_id, plan[free|pro|max], interval, status, current_period_end)
download_log(id, user_id, track_id, composer_id, plan_at_download, format, created_at)
whitelist_channels(id, user_id, channel_url, status[pending|active|rejected])
claim_requests(id, user_id, composer_id, track_id, video_url, status, created_at, resolved_at)
payout_periods(id, month, platform_revenue, author_pool, status[draft|final|paid])
payout_lines(id, period_id, composer_id, downloads_count, weighted_points, amount, statement_pdf_key)
sync_orders(id, user_id, track_id, tier, price, license_pdf_key)
briefs(id, name, email, type[adaptation|custom], assigned_composer_id, references, description, budget, deadline, status)
plan_config(id, plan, price_monthly, price_annual, download_limit, features_json)
promo_codes · email_log · search_log · support_tickets · contact_messages
```

Whitelist на старте — ручной процесс (заявка → автор добавляет канал в EpicElite → отмечает active). В UI обещаем «within 24 hours», не «instantly».

---

## 7. Метрики

- **MRR** — главная цифра. Вехи: $500 MRR к 6 мес, $2000 MRR к 12 мес.
- Free→Paid: 3–6% от зарегистрированных free-аккаунтов.
- Churn <7%/мес; годовые подписки — главный инструмент удержания.
- Посетитель → free-аккаунт: 5–8%. LTV ≥ 3× CAC.
- Баланс скачиваний по авторам — следить помесячно.

---

## 8. Роадмап

**Фаза 1 — Подписочный MVP:** типы + мок-слой (`src/types`, `src/mocks`) → фронт всех страниц на моках (design-first) → auth + Stripe Billing/Tax + entitlements + R2 + лимиты → кабинет клиента → заливка каталогов трёх авторов. Критерий: путь «услышал → free-аккаунт → лимит → оплатил Pro» работает без админа.

**Фаза 2 — Крючки и авторы:** whitelist, claim-очередь, кабинет композитора, админ-финансы с выплатами и statements, email-воронки (welcome, «лимит исчерпан», win-back), страницы авторов, /sync + /custom.

**Фаза 3 — Рост:** AI-видео на главной, blog/SEO, промокоды, опрос при отмене, партнёрства, приём внешних композиторов.

**Порядок разработки (строго):** 1) `src/types` + `src/mocks` с генератором фейков; 2) страницы на моках, дизайн итерируется; 3) логика подключается заменой мок-хуков на API — компоненты не переписываются; 4) реальный каталог.

---

## 9. Открытые вопросы

1. Эксклюзив каталогов авторов на платформе — да/нет.
2. Бухгалтер: UK-структура, Stripe Tax, выплаты в Польшу.
3. Вес Max-скачиваний ×2 — с первого дня или все равны (рекомендация: равны).
4. Названия планов: Pro/Max или свои (Creator/Studio).
