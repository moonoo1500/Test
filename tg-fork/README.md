# Telegram AI — форк Telegram-Android

Патч-сет поверх **официальных исходников** [DrKLO/Telegram](https://github.com/DrKLO/Telegram)
(GPL-2.0). Сам Telegram в репозиторий не копируется: здесь только наши файлы и точечные
правки 3 файлов апстрима, поэтому форк переживает обновление апстрима.

```
tg-fork/
├── apply.py          налагает форк на клон апстрима (падает, если якоря уехали)
└── overlay/          новые файлы, копируются поверх дерева Telegram
    ├── TMessagesProj/src/main/java/org/telegram/messenger/ai/
    │   ├── AIConfig.java        конфиг + ключ провайдеров (per-account, SharedPreferences)
    │   ├── AILlm.java           OpenAI-совместимый / Anthropic / Gemini, ответ в UI-поток
    │   ├── AIHttp.java          HTTP на HttpURLConnection, https-only (http лишь localhost)
    │   └── AIController.java    слушает входящие и включает автоответчик
    ├── TMessagesProj/src/main/java/org/telegram/ui/AISettingsActivity.java   экран «ИИ-функции»
    ├── TMessagesProj/src/main/res/drawable/settings_ai.xml                   иконка строки настроек
    ├── TMessagesProj/src/main/res/mipmap-*/icon_foreground_sa.png            adaptive-иконка (5 плотностей)
    ├── TMessagesProj/src/main/res/drawable/icon_background_sa.xml            фон иконки: индиго → циан
    └── TMessagesProj_AppStandalone/src/main/res/mipmap-*/ic_launcher_sa.png  legacy-иконка (API 21-25)
```

Что правится в апстриме (три точки, все с проверкой якоря):

| Файл | Правка |
| --- | --- |
| `ui/SettingsActivity.java` | строка «ИИ-функции» в список (`SettingCell.Factory.of(70, …)`) + `case 70: presentSettingFragment(new AISettingsActivity())` |
| `ui/LaunchActivity.java` | `AIController…onBecomeActive()` в `onResume()` — без этого автоответчик спал бы до открытия настроек |
| `TMessagesProj_AppStandalone/*` | имя приложения, сужение ABI до `arm64-v8a` |

Сборка живёт в [`../.github/workflows/build-apk.yml`](../.github/workflows/build-apk.yml):
GitHub Actions клонирует апстрим на тег, налагает `apply.py`, собирает
`:TMessagesProj_AppStandalone:assembleAfatRelease` и выкладывает APK артефактом —
его можно скачать с телефона, компьютер не нужен.

## Возможности

- **ИИ-функции в настройках**: провайдер (OpenAI, Anthropic, Gemini, Groq, OpenRouter,
  Mistral, Ollama, свой эндпоинт), API-ключ, модель, температура, «проверить ключ».
- **Автоответчик**: 3 режима — выключен / только когда я молчу N минут / всегда.
  Контекст диалога (последние 6 реплик) подаётся модели, ответ уходит штатным
  `SendMessagesHelper`, то есть попадает в обычную очередь Telegram с ретраями.
- **Переводчик и редактор**: язык перевода + 4 режима переписывания
  (дружелюбнее / формальнее / короче / только исправить ошибки).
- **Прокси**: используется штатный MTProto-прокси Telegram (мы его не переписываем).
  В нашем экране — быстрый переход к нему и загрузка списка `tg://proxy`-ссылок
  по URL, который указываешь сам.

## Что честно НЕ работает или работает иначе

1. **Push на убитом приложении.** Standalone-сборка использует `google-services.json` из
   апстрима — это dummy-конфиг, вашего Firebase-проекта там нет, поэтому FCM не доставляет.
   Сообщения приходят, пока процесс жив. На HyperOS: выключить оптимизацию батареи для
   приложения и закрепить его в недавних. Чтобы получить push, нужен свой Firebase-проект
   и свой `google-services.json` (шаг не автоматизирован — он ручной и требует аккаунт Google).
2. **Подпись = публичный тестовый ключ апстрима** (`RELEASE_STORE_PASSWORD=android`).
   Для личной сборки нормально, но не выкладывайте такой APK в публичный доступ:
   подпись смогут воспроизвести. Для серьёзного использования сгенерируйте свой keystore.
3. **Обновления.** Из Play Market это не обновляется; только пересборка и переустановка.
4. **Автоответ = риск для аккаунта.** Массовые однотипные ответы похожи на спам; лимиты
   (≤12 ответов/час, пауза ≥120 с на чат, стоп после 3 ответов подряд без тебя) зашиты в код,
   но решение о включении режима «всегда» — только твоё.
5. **Ключ хранится в приватном SharedPreferences** без шифрования. На root-устройстве его
   можно вытащить. Для платных ключей это осознанный компромисс.
6. **Юридический нюанс РФ.** Мы не распространяем серверы обхода и не включаем готовый
   список прокси — только UI поверх штатной функции Telegram. Список по URL добавляешь сам.

## Сборка вручную (если появится компьютер)

```bash
git clone --depth 1 --branch release-11.4.2-5469 https://github.com/DrKLO/Telegram.git tg
python3 tg-fork/apply.py tg --app-name "Telegram AI" --abi arm64-v8a
cd tg && echo "sdk.dir=$ANDROID_HOME" > local.properties
./gradlew :TMessagesProj_AppStandalone:assembleAfatRelease
# → TMessagesProj_AppStandalone/build/outputs/apk/afat/release/app.apk
```

Нужно: JDK 21, Android SDK platform 36, build-tools 36.0.0, NDK 27.2.12479018.

## Установка на Redmi Note 15

1. Открыть артефакт сборки на GitHub → скачать `Telegram-AI-….zip` → внутри `app.apk`.
2. Настроить время/часовой пояс (иначе HyperOS отвергает подпись), разрешить установку
   из неизвестных источников для браузера/файлового менеджера.
3. Установить. Пакет `org.telegram.messenger.web` ≠ официальный `org.telegram.messenger`,
   поэтому рядом с обычным Telegram встаёт без конфликтов; вход — по номеру телефона,
   как обычно (сессии у форка отдельные).
