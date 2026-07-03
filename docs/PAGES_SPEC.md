# TVMUSICSTORE — Спецификация страниц (design-first)

> Дополнение к `docs/TVMUSICSTORE_MASTER_PLAN.md` (V2). Порядок: весь фронт на мок-данных → потом логика.

## 0. Правила разработки (читать первым)

1. **Мок-слой обязателен.** Данные — через `src/mocks/` с типами в `src/types/`. Компоненты НЕ содержат захардкоженных данных. Доступ — только через хуки (`useTracks()`, `useCurrentUser()`, `useSubscription()`), внутри — моки, потом API. Замена мока на API не меняет компоненты.
2. **Дизайн:** тёмный минимализм, один жёлтый accent-токен (не синий), без лишних рамок. Кинотеатры — только на главной. Реф UX: tunetank.com (pricing, кабинет), каталог — текущий `/catalog` (не ломать).
3. Каждая страница — все состояния: loading (skeleton), empty, error + состояния по плану (guest / free / pro / max).
4. Публичные страницы — пре-рендер для SEO; кабинеты — SPA за auth-guard.
5. Админка и кабинет композитора — **модульные**: раздел = отдельный роут + папка-модуль.

---

## 1. Публичные страницы

### 1.1 `/` Главная
- Hero-кинотеатры (есть). К релизу: клик по экрану → 15-сек AI-ролик, ротация; автоплей только muted. CTA: **«Start free — 3 downloads / month»**.
- How it works: Listen free → Download (free account) → Upgrade. 3 шага, по строке.
- Trust: Content ID protected / Claims removed in 24h / 3 real composers, no AI music / License instantly.
- Featured playlists (4–6 карточек), планы кратко (3 карточки → /pricing), блок 3 авторов → /artist/:slug.

### 1.2 `/catalog` (есть — только дельта)
- Добавить: фильтр по автору; бейдж плана на кнопке Download (Free-лимит / Pro / Max для WAV+stems); счётчик «2 of 3 downloads left» для Free-юзера.
- Download гостем → модалка Sign up free → после регистрации скачивание продолжается.
- WAV/Stems на Pro → модалка апгрейда на Max.
- Колонки строк, фильтры, waveform, версии — не трогать.

### 1.3 `/pricing` (реф tunetank.com/pricing)
- Monthly/Annual toggle, **Annual по умолчанию** + «Save 40%+».
- Карточки: Free $0 (3 dl/mo) / **Pro** $7 год · $12 мес (Most popular; unlimited MP3, whitelist 3) / Max $15 год · $29 мес (commercial, WAV+stems, whitelist 10, priority).
- Полная сравнительная таблица + блок «Need a license for one track only? → /sync» + FAQ-аккордеон.

### 1.4 `/sync`
- 2 карточки: Sync Standard $199 / Sync Broadcast $399 (стемсы вкл.) + что покрывает.
- Флоу: трек в каталоге → «Sync license» → checkout → файлы + license PDF.
- Форма нестандартных запросов (name, email, project type, track, usage).

### 1.5 `/custom`
- Adaptation (от $149) и Custom (от $499). Процесс: Brief → Demo → Revisions → Final.
- Мини-портфолио по 2–3 плеера на автора. Бриф-форма: name, email, type, budget (select), deadline, references, description.

### 1.6 `/artist/:slug` (×3)
- Фото, имя, био, стили, кол-во треков; каталог-виджет с фильтром по автору (переиспользовать /catalog-компоненты); CTA → /pricing и /custom.

### 1.7 `/track/:slug` (есть — дельта)
- Кнопки по плану (Download / Sync license), similar — есть. SEO-мета из данных трека.

### 1.8 Остальное
`/playlists`, `/playlist/:slug`, `/blog`, `/blog/:slug`, `/licensing` (FAQ + таблица «что можно на каком плане»), `/terms`, `/privacy`, `/license-agreement`.

---

## 2. Кабинет клиента `/account`

Сайдбар слева (мобайл — табы):

| Раздел | Контент |
|---|---|
| Overview | План, счётчик скачиваний (Free), последние скачивания, быстрые ссылки |
| Downloads | Таблица: трек, дата, формат, план на момент, re-download. Пагинация |
| License | Текущий план человеческим языком, Upgrade/Manage, sync-лицензии с PDF |
| Whitelist | Каналы со статусами, Add channel. Free: апсейл; Pro: 3 слота; Max: 10 |
| Claims | Форма (ссылка на видео) + заявки со статусами (new/in progress/done ≤24h) |
| Billing | Stripe portal; при отмене — 1 вопрос «почему» |
| Support | Тикет + история |

Мокать состояния: guest redirect, free 0/1/2/3 использовано, pro, max, отменённая (grace period).

---

## 3. Кабинет композитора `/composer` (модули)

| Модуль | Контент |
|---|---|
| Dashboard | Скачивания моих треков (график), прогноз заработка месяца, топ-5 |
| My Tracks | Статусы draft/pending/approved/rejected, скачивания по треку |
| Upload | WAV drag&drop multi + метаданные → Submit for review |
| Earnings | По месяцам: баллы, доля, сумма, статус, statement PDF |
| Requests | Whitelist/claim по моим трекам (Mark done), custom-брифы |
| Profile | Публичный профиль + payout details |

---

## 4. Админка `/admin` (модули)

| Модуль | Контент |
|---|---|
| Dashboard | MRR, подписки по планам, free-аккаунты, конверсия, выручка по потокам |
| Tracks | Каталог + модерация загрузок (approve/reject), bulk-теги, отложенная публикация |
| Playlists | Подборки, featured, порядок |
| Plans & Licensing | Цены/лимиты/фичи планов и тексты лицензий — без деплоя |
| Customers | Юзеры: план, LTV, скачивания; фильтры; CSV |
| Finance | Расчёт месяца: net → 50/50 → строки по авторам → statements → mark paid. Настройки процентов |
| Composers | Авторы: добавить/отключить, параметры |
| Analytics | Воронка visit→play→signup→download→paid; топ-треки; поиск (отдельно 0 результатов); отток |
| Marketing | Промокоды; рассылки (сегмент+шаблон); статусы автосерий |
| Requests & Support | Все whitelist/claim (сводно), брифы (назначить автора), тикеты |
| Blog | CRUD статей (markdown) |

---

## 5. Порядок разработки

1. `src/types/` + `src/mocks/` — все сущности из схемы D1 + генератор фейков (~50 треков, 3 автора, юзеры всех планов, скачивания, выплаты за 3 мес).
2. Дизайн-итерации: публичные → кабинет клиента → композитор → админка. Страница = отдельный коммит.
3. Логика: auth → Stripe Billing/Tax → entitlements + R2 → лимиты → whitelist/claims → финансы → Resend. Меняются только хуки данных.
4. Заливка реальных каталогов трёх авторов.
