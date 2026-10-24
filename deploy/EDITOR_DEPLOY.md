# Редактор на VDS

Сейчас опубликованное Astro-превью находится в `/var/www/nextgenium-preview/current`; подготовленная версия будущего основного сайта — в `/var/www/nextgenium-production/current`. Действующий `next-genium.com` пока проксируется на WordPress через `nextgenium-production.conf` и не переключается этим редактором.

Сервис `/opt/nextgenium-editor/scripts/editor-server.mjs` работает от пользователя `ngeditor` и читает `/etc/nextgenium-editor.env`. Секрет в env — только хеш пароля. Пароль владельца хранится вне репозитория. `/var/lib/nextgenium-editor` содержит `text.json`, `manifest.json` и загруженные WebP. При сохранении API обновляет HTML и изображения в обоих каталогах `current`, поэтому будущая Astro-версия получает те же правки.

## Новый релиз без потери редакторских правок

1. Скопировать с VDS `/var/lib/nextgenium-editor/text.json`, `manifest.json` и WebP в локальную временную папку. Не коммитить их как исходный контент.
2. Собрать сайт с `EDITOR_TEXT_MANIFEST_PATH`, указывающим на эту копию `text.json`: `npm run build`. Сборка расставит стабильные метки и применит сохранённые тексты. Если структура страницы изменилась и ключ не найден, перенести эту правку вручную до публикации.
3. Скопировать `manifest.json` и WebP в `dist/assets/editor/`. Загрузить `dist` в **новые** каталоги релизов preview и production, проверить список файлов и права пользователя `ngeditor`.
4. Атомарно переключить оба `current` на новые релизы. Проверить `systemctl is-active nextgenium-editor`, `nginx -t`, `https://nextgenium-preview.46.21.250.147.sslip.io/ru/` и вход по `Alt+0`. Предыдущие релизы оставить для отката.

Конфигурации: `deploy/nextgenium-preview.conf`, `deploy/nextgenium-production-https.conf`, `deploy/nextgenium-editor.service`. Перед будущим переключением основного домена на Astro включить production HTTPS-конфигурацию и проверить формы кандидатов и `/api/editor/session` отдельно. Пока активен WordPress, его vhost остаётся без изменений.
