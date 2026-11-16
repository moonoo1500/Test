# Сборка и публикация Android APK — КОНТУР СЛОМА / FRACTURE LINE

## 1. Стек и целевые параметры
- **Движок**: Godot `4.7.2-stable` (официальные бинарники и Android export templates `4.7.2.stable`)
- **Язык / рендер**: GDScript 2.0 + `WorkerThreadPool`, Mobile Vulkan renderer (`fallback_to_opengl3 = true`)
- **Идентификатор пакета**: `com.fractureline.demolition`
- **Архитектура**: `arm64-v8a` (64-битный основной ABI для современных Android-смартфонов)
- **Версии Android SDK**:
  - `compileSdkVersion = 36`, `targetSdkVersion = 36`
  - `minSdkVersion = 24` (базовое значение официального prebuilt-шаблона Godot 4.7; полностью совместимо с Android 8/9+ устройствами, поддерживающими Vulkan / OpenGL ES 3)
- **Разрешения**: только автономный офлайн-режим (без интернета, рекламы, аналитики и лишних разрешений; опционально виброотклик при включении в настройках).

---

## 2. Необходимое окружение для локальной сборки
1. **JDK 17** (`JAVA_HOME` указывает на Temurin / OpenJDK 17).
2. **Android SDK** (`ANDROID_HOME`):
   - `platform-tools`
   - `build-tools;35.0.0` (или новее, с `aapt2` и `apksigner`)
   - `platforms;android-36`
3. **Godot `4.7.2-stable` + Export Templates `4.7.2.stable`**:
   - Шаблоны распакованы в `~/.local/share/godot/export_templates/4.7.2.stable/`
   - В `~/.config/godot/editor_settings-4.7.tres` прописаны пути:
     ```ini
     export/android/android_sdk_path = "/path/to/android-sdk"
     export/android/java_sdk_path = "/path/to/jdk-17"
     export/android/debug_keystore = "/path/to/debug.keystore"
     export/android/debug_keystore_user = "androiddebugkey"
     export/android/debug_keystore_pass = "android"
     ```
4. **Python 3.11** (опционально для автопроверок и генерации ассетов): `gdtoolkit==4.5.0`, `pillow`, `fonttools`.

---

## 3. Команды локальной проверки и сборки

```bash
# 1. Проверка локализации и наличия всех кириллических глифов в шрифте Mozilla Fira
python tools/check_localization.py

# 2. Линтер GDScript
gdlint scripts tests

# 3. Импорт ресурсов Godot и запуск всех 69 автотестов
godot --headless --path . --import
godot --headless --path . --script res://tests/test_runner.gd

# 4. Запуск воспроизводимого 4-фазного бенчмарка
godot --headless --path . --script res://scripts/benchmark/benchmark_runner.gd

# 5. Экспорт debug-APK (arm64-v8a)
mkdir -p build
godot --headless --path . --export-debug "Android" build/fracture-line-v0.1.0-alpha-debug-arm64.apk

# 6. Проверка ABI, манифеста, подписи и SHA-256
unzip -l build/fracture-line-v0.1.0-alpha-debug-arm64.apk | grep "lib/.*\.so"
"$ANDROID_HOME/build-tools/35.0.0/aapt2" dump badging build/fracture-line-v0.1.0-alpha-debug-arm64.apk | head -n 20
"$ANDROID_HOME/build-tools/35.0.0/apksigner" verify --verbose --print-certs build/fracture-line-v0.1.0-alpha-debug-arm64.apk
sha256sum build/fracture-line-v0.1.0-alpha-debug-arm64.apk > build/fracture-line-v0.1.0-alpha-debug-arm64.apk.sha256
```

---

## 4. Debug vs Release подпись в GitHub Actions (`.github/workflows/ci-android.yml`)
- **Безопасность**: ключи, пароли и `.keystore` файлы **никогда не хранятся в репозитории**.
- Если в секретах GitHub Actions заданы все 4 секрета владельца:
  - `ANDROID_KEYSTORE_BASE64`
  - `ANDROID_KEYSTORE_PASSWORD`
  - `ANDROID_KEY_ALIAS`
  - `ANDROID_KEY_PASSWORD`
  то CI автоматически декодирует keystore во временный файл раннера и собирает **production `--export-release` APK**.
- Если секреты отсутствуют (как в текущем публичном/тестовом контуре), CI генерирует эфемерный debug-keystore в `$RUNNER_TEMP`, собирает `--export-debug` APK с подписью APK Signature Scheme v2 + v3 и публикует релиз как **prerelease** (`v0.1.0-alpha`), честно помечая статус подписи.

---

## 5. Установка на Android-устройство для ручного теста
```bash
# Проверка контрольной суммы
sha256sum -c fracture-line-v0.1.0-alpha-debug-arm64.apk.sha256

# Установка через adb (требуется включённая отладка по USB)
adb install -r fracture-line-v0.1.0-alpha-debug-arm64.apk
```
Или скопируйте `.apk` на телефон (`arm64-v8a`, Android 8.0+) и установите через стандартный установщик пакетов (разрешив установку из доверенного источника).
