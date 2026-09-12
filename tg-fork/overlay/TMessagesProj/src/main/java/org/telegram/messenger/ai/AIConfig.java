package org.telegram.messenger.ai;

import android.content.Context;
import android.content.SharedPreferences;

import org.telegram.messenger.ApplicationLoader;

/**
 * Конфигурация ИИ-функций. Хранится per-account в отдельном SharedPreferences,
 * чтобы не смешивать с настройками Telegram и не светить ключ в основной базе.
 *
 * Ключи API лежат в приватном каталоге приложения (MODE_PRIVATE) и никогда
 * не отправляются ни на какой сервер, кроме выбранного провайдера.
 */
public class AIConfig {

    public static final int MODE_OFF = 0;
    public static final int MODE_IDLE = 1;
    public static final int MODE_ALWAYS = 2;

    public static final int STYLE_OPENAI = 0;
    public static final int STYLE_ANTHROPIC = 1;
    public static final int STYLE_GEMINI = 2;

    public static final int EDITOR_TONE_FORMAL = 0;
    public static final int EDITOR_TONE_FRIENDLY = 1;
    public static final int EDITOR_TONE_SHORT = 2;
    public static final int EDITOR_FIX_GRAMMAR = 3;

    /** Пресеты провайдеров: id, отображаемое имя, base url, стиль API, модель по умолчанию. */
    public static final String[][] PROVIDERS = {
        {"openai",     "OpenAI",            "https://api.openai.com/v1",                     "0", "gpt-4o-mini"},
        {"anthropic",  "Anthropic",         "https://api.anthropic.com/v1",                  "1", "claude-3-5-haiku-latest"},
        {"gemini",     "Google Gemini",     "https://generativelanguage.googleapis.com/v1beta", "2", "gemini-2.0-flash"},
        {"groq",       "Groq (быстро/бесплатно)", "https://api.groq.com/openai/v1",          "0", "llama-3.3-70b-versatile"},
        {"openrouter", "OpenRouter (free)", "https://openrouter.ai/api/v1",                  "0", "meta-llama/llama-3.1-8b-instruct:free"},
        {"mistral",    "Mistral",           "https://api.mistral.ai/v1",                     "0", "mistral-small-latest"},
        {"ollama",     "Ollama (локально)",  "http://localhost:11434/v1",                     "0", "llama3.2"},
        {"custom",     "Свой эндпоинт",     "",                                               "0", ""},
    };

    private static final android.util.SparseArray<AIConfig> INSTANCES = new android.util.SparseArray<>();

    private final SharedPreferences prefs;

    public static AIConfig getInstance(int account) {
        synchronized (INSTANCES) {
            AIConfig cfg = INSTANCES.get(account);
            if (cfg == null) {
                cfg = new AIConfig(account);
                INSTANCES.put(account, cfg);
            }
            return cfg;
        }
    }

    private AIConfig(int account) {
        Context ctx = ApplicationLoader.applicationContext;
        prefs = ctx.getSharedPreferences("ai_features_" + account, Context.MODE_PRIVATE);
    }

    private String key(String name) {
        return name;
    }

    private String get(String name, String def) {
        return prefs.getString(key(name), def);
    }

    private int get(String name, int def) {
        return prefs.getInt(key(name), def);
    }

    private boolean get(String name, boolean def) {
        return prefs.getBoolean(key(name), def);
    }

    private float get(String name, float def) {
        return prefs.getFloat(key(name), def);
    }

    private void put(String name, Object value) {
        SharedPreferences.Editor e = prefs.edit();
        if (value instanceof String) e.putString(name, (String) value);
        else if (value instanceof Integer) e.putInt(name, (Integer) value);
        else if (value instanceof Boolean) e.putBoolean(name, (Boolean) value);
        else if (value instanceof Float) e.putFloat(name, (Float) value);
        e.apply();
    }

    /* ---------------- провайдер ---------------- */

    public String getProviderId() {
        return get("provider", "openai");
    }

    public void setProviderId(String id) {
        put("provider", id);
        String[] preset = findPreset(id);
        if (preset != null) {
            if (get("model", "").isEmpty()) put("model", preset[4]);
            if (!"custom".equals(id)) put("base_url_override", "");
        }
    }

    public static String[] findPreset(String id) {
        for (String[] p : PROVIDERS) {
            if (p[0].equals(id)) return p;
        }
        return PROVIDERS[0];
    }

    public String providerTitle() {
        String[] p = findPreset(getProviderId());
        return p[1];
    }

    /** Базовый URL: кастомный важнее пресета. */
    public String baseUrl() {
        String custom = get("base_url_override", "");
        if (!custom.isEmpty()) return trimSlash(custom);
        return trimSlash(findPreset(getProviderId())[2]);
    }

    public void setBaseUrlOverride(String url) {
        put("base_url_override", url == null ? "" : url.trim());
    }

    public int apiStyle() {
        try {
            return Integer.parseInt(findPreset(getProviderId())[3]);
        } catch (Exception ignore) {
            return STYLE_OPENAI;
        }
    }

    private static String trimSlash(String s) {
        if (s == null) return "";
        String r = s.trim();
        while (r.endsWith("/")) r = r.substring(0, r.length() - 1);
        return r;
    }

    public String getModel() {
        String m = get("model", "");
        return m.isEmpty() ? findPreset(getProviderId())[4] : m;
    }

    public void setModel(String m) {
        put("model", m == null ? "" : m.trim());
    }

    public String getApiKey() {
        return get("api_key", "");
    }

    public void setApiKey(String k) {
        put("api_key", k == null ? "" : k.trim());
    }

    public boolean hasKey() {
        String k = getApiKey();
        // Для локальной Ollama ключ не нужен.
        return !k.isEmpty() || "ollama".equals(getProviderId());
    }

    public float getTemperature() {
        return get("temperature", 0.7f);
    }

    public void setTemperature(float t) {
        put("temperature", Math.max(0f, Math.min(2f, t)));
    }

    public int getMaxTokens() {
        return get("max_tokens", 400);
    }

    public void setMaxTokens(int v) {
        put("max_tokens", Math.max(32, Math.min(4096, v)));
    }

    /** Разрешить http (только для localhost-эндпоинтов: Ollama, LM Studio). */
    public boolean isAllowLocalHttp() {
        return get("allow_local_http", true);
    }

    public void setAllowLocalHttp(boolean v) {
        put("allow_local_http", v);
    }

    /* ---------------- автоответчик ---------------- */

    public int getAutoReplyMode() {
        return get("autoreply_mode", MODE_OFF);
    }

    public void setAutoReplyMode(int mode) {
        put("autoreply_mode", Math.max(MODE_OFF, Math.min(MODE_ALWAYS, mode)));
    }

    /** Сколько минут меня нет в сети, до которого молчим (для MODE_IDLE). */
    public int getIdleMinutes() {
        return Math.max(1, get("idle_minutes", 10));
    }

    public void setIdleMinutes(int v) {
        put("idle_minutes", Math.max(1, v));
    }

    public boolean isReplyInGroups() {
        return get("reply_groups", false);
    }

    public void setReplyInGroups(boolean v) {
        put("reply_groups", v);
    }

    public int getMaxRepliesPerHour() {
        return Math.max(1, get("max_per_hour", 12));
    }

    public void setMaxRepliesPerHour(int v) {
        put("max_per_hour", Math.max(1, v));
    }

    /** Пауза между ответами в один чат, чтобы не устроить спам-цикл. */
    public int getMinDelaySeconds() {
        return Math.max(10, get("min_delay", 120));
    }

    public void setMinDelaySeconds(int v) {
        put("min_delay", Math.max(10, v));
    }

    public String getSystemPrompt() {
        return get("system_prompt",
            "Ты отвечаешь в Telegram от имени владельца аккаунта, пока он не в сети. " +
            "Отвечай коротко (1-3 предложения), в его тоне, на языке собеседника. " +
            "Не выдумывай факты о планах, деньгах и датах — вместо этого скажи, что уточнишь позже. " +
            "Не сообщай, что это автоматический ответ, если об этом прямо не спросили.");
    }

    public void setSystemPrompt(String p) {
        put("system_prompt", p == null ? "" : p);
    }

    public String getSignature() {
        return get("signature", "");
    }

    public void setSignature(String s) {
        put("signature", s == null ? "" : s);
    }

    /* ---------------- перевод и редактор ---------------- */

    public String getTranslateLang() {
        return get("translate_lang", "English");
    }

    public void setTranslateLang(String l) {
        put("translate_lang", l == null ? "English" : l.trim());
    }

    public int getEditorMode() {
        return get("editor_mode", EDITOR_TONE_FRIENDLY);
    }

    public void setEditorMode(int m) {
        put("editor_mode", m);
    }

    public String editorInstruction(int mode) {
        switch (mode) {
            case EDITOR_TONE_FORMAL:
                return "Перепиши сообщение вежливо и формально, сохранив смысл. Верни только готовый текст.";
            case EDITOR_TONE_SHORT:
                return "Сократи сообщение до самой сути, убери воду. Верни только готовый текст.";
            case EDITOR_FIX_GRAMMAR:
                return "Исправь орфографию, пунктуацию и грамматику. Не меняй стиль и смысл. Верни только готовый текст.";
            case EDITOR_TONE_FRIENDLY:
            default:
                return "Сделай сообщение дружелюбнее и естественнее, сохранив смысл и длину. Верни только готовый текст.";
        }
    }

    /* ---------------- прокси ---------------- */

    /**
    /** URL текстового списка вида `tg://proxy?server=..&port=..&secret=..` (по строке на прокси).
     *  Мы не храним и не распространяем прокси-серверы: список задаёт сам пользователь. */
    public String getProxyListUrl() {
        return get("proxy_list_url", "");
    }

    public void setProxyListUrl(String u) {
        put("proxy_list_url", u == null ? "" : u.trim());
    }

    public void clearAll() {
        prefs.edit().clear().apply();
    }
}
