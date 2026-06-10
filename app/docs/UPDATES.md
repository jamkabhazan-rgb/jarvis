# Обновления для пользователей — как выпускать новые версии

Два уровня. Уровень 1 уже работает (ничего настраивать не надо).
Уровень 2 — автообновление внутри приложения — включается за ~15 минут,
шаги ниже.

---

## Уровень 1 — релизы на GitHub (уже готово)

Workflow `.github/workflows/release.yml` собирает приложение под
**macOS (Apple Silicon + Intel)** и **Windows** и публикует черновик релиза
с установщиками (`.dmg`, `.exe`, `.msi`).

### Как выпустить версию

```bash
# 1. Подними версию в ДВУХ файлах (должны совпадать):
#    app/src-tauri/tauri.conf.json  →  "version": "0.2.0"
#    app/package.json               →  "version": "0.2.0"

# 2. Закоммить и запушь
git add app/src-tauri/tauri.conf.json app/package.json
git commit -m "v0.2.0"
git push

# 3. Поставь тег — он и запускает сборку
git tag v0.2.0
git push origin v0.2.0
```

Через ~20–30 минут на странице **Releases** появится **черновик** релиза со
всеми установщиками. Проверь его и нажми **Publish release** — после этого
пользователи скачивают новую версию по ссылке:
`https://github.com/jamkabhazan-rgb/jarvis/releases/latest`

> Черновик (draft) сделан специально: автообновление и ссылка `latest`
> видят релиз только после ручной публикации — у тебя всегда есть
> последняя проверка перед выкаткой.

---

## Уровень 2 — автообновление в приложении

Приложение само проверяет GitHub Releases, скачивает подписанное
обновление, проверяет подпись и переустанавливает себя. Делается через
официальный плагин `tauri-plugin-updater`.

### Шаг 1. Сгенерируй ключи подписи (один раз, локально)

```bash
cd app
npm run tauri signer generate -- -w ~/.tauri/jarvis.key
```

Команда выведет **публичный ключ** (строка base64) и сохранит **приватный**
в `~/.tauri/jarvis.key`.

⚠️ **Приватный ключ — никогда не коммитить и не терять.** Если потеряешь,
уже установленные приложения не примут ни одно будущее обновление
(пользователям придётся переустанавливать вручную).

### Шаг 2. Добавь секреты в GitHub

Репозиторий → **Settings → Secrets and variables → Actions → New secret**:

| Секрет | Значение |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | содержимое файла `~/.tauri/jarvis.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | пароль, который вводил при генерации (если без пароля — пустая строка) |

Workflow релиза уже передаёт эти секреты в сборку — после этого
`latest.json` и `.sig`-подписи будут прикладываться к каждому релизу
автоматически.

### Шаг 3. Подключи плагины в коде

**`app/src-tauri/Cargo.toml`** — в `[dependencies]` добавить:

```toml
tauri-plugin-updater = "2"
tauri-plugin-process = "2"
```

**`app/src-tauri/src/lib.rs`** — в `pub fn run()` после
`tauri::Builder::default()` добавить:

```rust
.plugin(tauri_plugin_updater::Builder::new().build())
.plugin(tauri_plugin_process::init())
```

**`app/src-tauri/tauri.conf.json`** — два изменения:

```jsonc
// 1) в "bundle" добавить:
"createUpdaterArtifacts": true,

// 2) на верхний уровень (рядом с "bundle") добавить:
"plugins": {
  "updater": {
    "pubkey": "<ПУБЛИЧНЫЙ КЛЮЧ ИЗ ШАГА 1>",
    "endpoints": [
      "https://github.com/jamkabhazan-rgb/jarvis/releases/latest/download/latest.json"
    ]
  }
}
```

**`app/src-tauri/capabilities/default.json`** — в `"permissions"` добавить:

```json
"updater:default",
"process:default"
```

### Шаг 4. Проверка обновлений во фронтенде

Благодаря `withGlobalTauri` плагин доступен как `window.__TAURI__.updater`.
Добавить в `app/src/app.js` (вызвать один раз после загрузки):

```js
async function checkUpdates(){
  try{
    if(!window.__TAURI__?.updater) return;
    const update = await window.__TAURI__.updater.check();
    if(!update) return;
    // здесь можно показать красивый тост вместо confirm()
    if(confirm(`Доступна версия ${update.version}. Обновить сейчас?`)){
      await update.downloadAndInstall();
      await window.__TAURI__.process.relaunch();
    }
  }catch(e){ console.warn('update check failed', e); }
}
setTimeout(checkUpdates, 5000); // не мешаем загрузке
```

### Итоговый цикл после настройки

1. Дорабатываешь фичи → поднимаешь версию → `git tag v0.x.0` → `git push origin v0.x.0`.
2. CI собирает, подписывает и кладёт в черновик релиза.
3. Жмёшь **Publish release**.
4. Все установленные приложения при следующем запуске видят обновление и
   ставят его сами. Всё.

---

## Важно знать (подпись кода ОС — отдельная тема)

Подпись обновлений Tauri (шаги выше) ≠ подпись кода операционной системой:

- **macOS:** без сертификата Apple Developer ID ($99/год) Gatekeeper будет
  предупреждать при первой установке («приложение от неустановленного
  разработчика» → открывать через ПКМ → Open). Автообновление при этом
  работает. С сертификатом + нотаризацией предупреждений нет.
- **Windows:** без сертификата подписи кода SmartScreen покажет «неизвестный
  издатель» при первой установке. Дальше всё работает.

Когда дойдёт до публичной дистрибуции — см. раздел про сертификаты в
[`API-KEYS.md`](API-KEYS.md).
