# Next Genium — локальный прототип сайта

Подготовка редакторской панели Storyblok: см. `STORYBLOK_SETUP.md`. Без аккаунта и токенов сайт продолжает собираться из локальных данных.

Сайт на Astro в новом визуальном стиле. Главная, разделы меню, страницы игр, новости и юридические документы собраны в двух языковых версиях. Изображения и тексты взяты из локального архива Next Genium (`../snapshot/`, `../content/pages.json` и `../site`).

## Открыть

- Готовая английская страница: `dist/index.html`
- Готовая русская страница: `dist/ru/index.html`
- Исходник главной: `src/components/Home.astro`

Все 60 страниц работают как локальные HTML-файлы. Внутренние ссылки ведут на страницы нового сайта. Перед запуском и сборкой `scripts/sync-archive-assets.mjs` копирует архивные изображения из соседней папки `../site/assets` в `public/assets/archive`; готовая папка `dist` после сборки содержит необходимые изображения.

## Разработка

```powershell
npm install
npm run dev
npm run build
```

Для локального просмотра собранного прототипа запустите `npm run preview` и откройте `http://localhost:4321/ru/`. Исправления по ТЗ и оставшиеся редакционные вопросы перечислены в `TZ_ASTRO_ADAPTATION.md`.

### Замена изображений в локальном прототипе

После `npm run build` запустите `npm run editor` и откройте `http://localhost:4321/ru/`. Клавиши `Alt+0` включают и выключают режим редактирования. Наведите указатель на изображение: рамка покажет его текущий размер на экране. Нажмите `Browse` или перетащите файл в рамку, передвиньте кадр мышью, настройте масштаб и нажмите «Сохранить». Поддерживаются PNG, JPG, WebP, AVIF и GIF; результат сохраняется как статический WebP в `public/assets/editor`, а соответствие страниц и картинок — в `public/assets/editor/manifest.json`. Сервер сразу обновляет также `dist`, поэтому результат виден после перезагрузки и сохраняется при следующей сборке. Анимированный GIF превращается в неподвижный кадр.

Редактор работает только на локальном адресе `localhost` и не требует пароля. На опубликованных страницах замены изображений показываются, но режим редактирования недоступен. Перед публикацией изменений нужно собрать сайт и загрузить новый `dist` на сервер.

Astro выдаёт статические файлы в `dist/`. Для внутренних страниц используется `src/components/InnerPage.astro` и подготовленный архив контента `src/data/pages.json`. Чтобы пересобрать данные из `../content/pages.json`, запустите `python scripts/prepare-content.py` (нужен Beautiful Soup). В прототипе есть адаптивная навигация, переключение языков и 60 страниц: главные, все разделы исходного меню, страницы шести игр, десяти новостей и юридические документы на EN/RU.

## Арт первого экрана

`art/overmind-hero-redraw.png` — перерисовка через встроенный imagegen по референсу `../snapshot/assets/wp-content/uploads/2025/06/var1.png`, изображению Overmind с исходной главной. Для страницы подготовлена сжатая версия `public/assets/overmind-hero-redraw.webp`. Она используется и в первом экране, и в карточке Overmind. Исходный игровой кадр сохранён отдельным файлом `public/assets/overmind-world.webp`.

Промпт: «Preserve the original tall, needle-tipped black metallic Overmind monolith, widest at the middle and tapering below, with a vertical crimson energy seam and vivid red backlight. Reimagine it as a polished in-game cinematic environment with atmospheric scale, drifting debris and worn dark-metal surfaces. Deep blood-red and near-black palette. Wide hero frame, important content centered. Remove all typography and logos; no people, creatures, spaceships, planets or circular portal.»

## Логотип и цвет

Главный Overmind арт разделён на фон и прозрачный объект. Исходные слои `public/assets/overmind-hero-background.png` и `public/assets/overmind-monolith-cutout.png` получены встроенным imagegen из `art/overmind-hero-redraw.png`; их промпты сохранены в `art/overmind-layer-prompts.txt`. Текущий фон главного экрана — `public/assets/overmind-background-volumetric.png` (1086×1448): красное объёмное освещение проходит через крупные облачные массы. Передний план — прозрачный `public/assets/overmind-monolith-cinematic.png` (1086×1448), сохраняющий форму исходного объекта с более объёмной металлической архитектурой. `Home.astro` накладывает слои друг на друга; `style.css` анимирует лёгкое парение и пульсацию шва. Красный горизонтальный блик находится внутри анимируемого слоя объекта, выровнен по его широкому ободу и движется с ним синхронно. При выборе другой игры он скрывается; при `prefers-reduced-motion` движение и пульсация отключаются. Это повышение детализации первого экрана, а не 4K-рендер каждого исходного изображения сайта.

В шапке и подвале используется `public/assets/L1.svg` — точная копия векторного логотипа `../L1.svg`, предоставленного пользователем. Предыдущие эксперименты с трассировкой и реконструкцией остались в `art/` для сравнения. Акцентный красный интерфейса: `#ef3038`, взят из визуальной гаммы нового арта Overmind.

## Шрифт

Days One Regular взят из предоставленного архива `C:\Users\a\Downloads\DaysOne-Regular.zip`. Лицензия OFL находится в `public/fonts/OFL.txt`. В `public/fonts/` лежат WOFF2, WOFF и TTF; `npm run build` автоматически создаёт `public/font-face.css` со встроенными копиями этих форматов. Поэтому шрифт загружается даже при прямом открытии `dist/index.html` как локального файла, где браузеры могут блокировать отдельные файлы шрифтов из-за CORS. Правила применения находятся в `public/typography.css`: заголовки, меню, переключатель языков, кнопки и подписи используют Days One; абзацы остаются в нейтральном текстовом шрифте. Стрелки отображаются системным шрифтом, потому что их нет в Days One.

## Превью на VDS

Адрес ранее опубликованного превью: https://nextgenium-preview.46.21.250.147.sslip.io/ (русская версия: `/ru/`). Локальные изменения по ТЗ пока доступны через `http://localhost:4321/ru/` и не загружены на VDS. Домен `sslip.io` указывает на IP VDS и не требует отдельной DNS-записи. Публичное превью закрыто от индексации заголовком `X-Robots-Tag`.

На VDS используется отдельный каталог `/var/www/nextgenium-preview/current` и отдельный vhost Nginx. Локальная копия конфигурации: `deploy/nextgenium-preview.conf`. Для нового пакета достаточно результата `dist/`: архивные изображения входят в сборку. Перед обновлением превью нужно выполнить `npm run build`.
