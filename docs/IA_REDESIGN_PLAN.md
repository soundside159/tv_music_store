# IA / Navigation redesign — Tunetank-style маршруты

> Утверждённый владельцем план структуры разделов и связей. Реализуем поэтапно, дизайн-фаза (моки, без бэкенда).

## 1. Починка выравнивания трек-строки (первым делом)

Проблема: каждая строка — независимый grid, колонки `auto`/`minmax` резолвятся по содержимому строки → BPM из 3 цифр и разные теги сдвигают колонки (+2 не в линию).

Фикс в `.music-track-grid` (xl+):

- Все нефлексовые колонки — фиксированные: tags 19rem (overflow hidden), versions 2.25rem, duration 3.25rem, bpm 4.5rem, actions 7.5rem.
- Единственная flex-колонка — waveform (1fr): при одинаковой ширине контейнера резолвится одинаково во всех строках.
- Цифрам — `tabular-nums`, выравнивание вправо. «+2» — по центру своей колонки.

## 2. Смысл трёх тегов у трека (фиксировано)

Тег 1 = **Use Case**, тег 2 = **Genre**, тег 3 = **Mood** — всегда в этом порядке, первое значение поля (убрать текущий pickTag-рандом). Каждый тег кликабелен:

- Use Case «Travel» → `/catalog?usecase=Travel` (в каталоге активен только этот фильтр)
- Genre → `/catalog?genre=...`, Mood → `/catalog?mood=...`

## 3. Карта разделов и маршрутов

```
Главная (/)
 ├─ 3 карточки-раздела над Trending: Catalog · Collections · Playlists
 ├─ Trending tracks (TrackRowList, 8 шт)
 └─ клики по тегам треков → /catalog с активным фильтром

/catalog        — ВСЕ треки. Без полосы коллекций. Центрированный макет (max-w-7xl),
                  без кинотеатр-картинки; текст hero остаётся:
                  «Discover / Premium Music Library / Explore our entire library...»
                  Фильтры (Use Case / Genre / Mood) — панель слева, чуть ЛЕВЕЕ
                  центрированного макета (выступает как доп-меню).
                  Читает ?search=, ?category=, ?usecase=, ?genre=, ?mood=, ?collection=

/collections    — сетка карточек коллекций (текущие 7 из musicCollections)
/collection/:slug — hero коллекции (обложка, название, описание, N tracks, Play all)
                  + TrackRowList треков коллекции

/playlists      — сетка карточек плейлистов (кураторские, будущая админка;
                  сейчас мок-данные mockPlaylists)
/playlist/:slug — hero плейлиста + TrackRowList

/track/:slug    — как есть
```

Разница Collections vs Playlists: коллекции = стилевые/жанровые группы каталога (постоянные), плейлисты = кураторские подборки под use-case, создаются в админке (как у Tunetank Featured Playlists). UI страниц одинаковый, сущности разные.

## 4. Этапы реализации

1. **Строка:** фиксированные колонки, tabular-nums, порядок тегов UseCase/Genre/Mood, теги-ссылки.
2. **Каталог:** центрирование (max-w-7xl), убрать cinema-hero-картинку (текст оставить), убрать CollectionStrip, фильтры слева от центра, поддержка ?usecase=/?genre= (mood уже есть).
3. **Главная:** 3 карточки-раздела (Catalog / Collections / Playlists) над Trending, вместо текущего блока «Browse collections» (mood-чипы остаются, ведут в /catalog?mood=).
4. **Коллекции:** /collections (карточки) + /collection/:slug (hero + треки).
5. **Плейлисты:** mockPlaylists (4–6 штук: Movie Trailers, Corporate & Business, Documentary, Game Battles, Emotional Stories) + /playlists + /playlist/:slug. Позже управляются из админки.
6. Роуты в App.tsx, ссылки в хедере не меняются, AGENTS.md обновить.

## 5. Принципы

- Все страницы — центрированный макет как главная (max-w-7xl); фильтр-панель — единственное, что выступает левее.
- TrackRowList — единственный способ показать список треков где угодно.
- Каждый клик ведёт куда-то осмысленно: тег → отфильтрованный каталог, карточка → своя страница, «View all» → раздел.
