# Flarya Plugins

Blocklist, PingColor и Staff Tags для мобильного Discord

## Установка в Valenced

Добавьте в **Plugins → Repositories** прямую ссылку на каталог JSON:

```text
https://raw.githubusercontent.com/FloralFlarya/revenge/main/valenced/index.json
```

Если репозиторий уже включён, обновите его каталог, затем установите нужные плагины из списка

Удалите ошибочную запись `https://github.com/FloralFlarya/revenge` со скриншота: это HTML-страница GitHub, а Valenced ожидает документ JSON

Каталог содержит пакеты `flarya.blocklist`, `flarya.pingcolor` и `flarya.stafftag` с версиями, размерами и SHA-256 ZIP-файлов

Настройки Revenge автоматически не переносятся: заново задайте цвета, параметры тегов и список скрытых пользователей в Valenced

## Сборка и проверка

Нужны Python 3 и Node.js 24+, сторонних зависимостей нет

```sh
python3 scripts/build.py
node --test tests/valenced.test.mjs
```

Сборка создаёт `valenced/index.json` и три ZIP-пакета в `valenced/`

Blocklist и PingColor собираются из опубликованных рабочих `index.js`, Staff Tags — напрямую из `stafftag/source/src/index.ts` через встроенный компилятор TypeScript в Node.js

Общий адаптер находится в `valenced/runtime.js`, текущая версия пакетов — в `scripts/build.py`; при выпуске обновления повышайте её, затем пересобирайте пакеты

Старые ZIP-файлы и версии в каталоге сохраняются для уже установленных клиентов

Адаптер связывает старый API с Valenced: поиск модулей, порядок аргументов патчей, локальные команды, React-настройки, сохранение вложенных данных и освобождение ресурсов при остановке

Тесты проверяют адаптер и запуск пакетов с имитацией API Discord; проверка функций на телефоне требуется отдельно

Формат сверялся с [каталогом Valenced](https://github.com/Valenced/valenced/blob/main/core/src/commonMain/kotlin/app/valenced/plugins/repos/RepoIndex.kt) и [загрузчиком скриптов](https://github.com/Valenced/valenced/blob/main/bundle/lib/plugins/src/_internal/script.ts)

## Установка в Revenge

Старые пакеты остаются в папках `blocklist/`, `pingcolor/` и `stafftag/`

В **Revenge → Plugins** добавляйте адрес отдельного плагина, например:

```text
https://raw.githubusercontent.com/FloralFlarya/revenge/main/blocklist/
```
