# Next Genium — локальный прототип сайта

Репозиторий: https://github.com/kabuto-lab/NGV2. Для сборки из свежего клона достаточно `npm ci` и `npm run build`: необходимые архивные ассеты уже включены в `public/assets/archive`. Если рядом есть исходный каталог `../site/assets`, скрипт синхронизации обновит их оттуда.

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

### Редактирование текста и изображений

После `npm run build` запустите `npm run editor` и откройте `http://localhost:4321/ru/`. Клавиши `Alt+0` включают и выключают единый режим редактирования. Наведите указатель на текст и щёлкните по подсвеченному фрагменту, чтобы изменить его. Изменения записываются в HTML страницы и видны после перезагрузки. Для замены изображения наведите на него указатель: рамка покажет текущий размер на экране. Нажмите `Browse` или перетащите файл в рамку, передвиньте кадр мышью, настройте масштаб и нажмите «Сохранить». Поддерживаются PNG, JPG, WebP, AVIF и GIF; результат сохраняется как статический WebP. Анимированный GIF превращается в неподвижный кадр.

Локальный редактор работает без пароля только на `localhost`. На опубликованном предпросмотре API редактора запускается отдельно: `EDITOR_MODE=remote`, `EDITOR_PASSWORD_HASH`, `EDITOR_ALLOWED_ORIGINS`, `EDITOR_SITE_ROOTS` и `EDITOR_DATA_DIR`. Для входа после `Alt+0` нужен пароль редактора. Сервер хранит картинки и манифест текстовых правок отдельно от релиза, а затем обновляет HTML и изображения в каталогах, перечисленных в `EDITOR_SITE_ROOTS`. При следующей сборке задайте `EDITOR_TEXT_MANIFEST_PATH` с путём к сохранённому `text.json`, затем перенесите сохранённые картинки и `manifest.json` в новый `dist`. Не публикуйте пароль или хеш в репозитории.

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

Адрес опубликованного превью: https://nextgenium-preview.46.21.250.147.sslip.io/ (русская версия: `/ru/`). На нём доступен редактор текста и изображений по `Alt+0` с отдельным паролем; пароль хранится вне репозитория. Домен `sslip.io` указывает на IP VDS и не требует отдельной DNS-записи. Публичное превью закрыто от индексации заголовком `X-Robots-Tag`. Основной домен пока обслуживает WordPress.

На VDS используется отдельный каталог `/var/www/nextgenium-preview/current` и отдельный vhost Nginx. Локальная копия конфигурации: `deploy/nextgenium-preview.conf`. Node API работает как служба `nextgenium-editor.service`, слушает только `127.0.0.1:4341` и получает запросы через Nginx. Постоянные правки находятся в `/var/lib/nextgenium-editor`; инструкции по выпуску нового релиза — в `deploy/EDITOR_DEPLOY.md`.
