package org.telegram.messenger.ai;

import android.os.Handler;
import android.os.Looper;

import org.json.JSONArray;
import org.json.JSONObject;
import org.telegram.messenger.AndroidUtilities;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.ExecutorService;

/**
 * Единая обёртка над API провайдеров: OpenAI-совместимый, Anthropic, Gemini.
 * Ответ всегда приходит в UI-поток через Callback.
 */
public class AILlm {

    public interface Callback {
        /** text == null при ошибке; error == null при успехе. */
        void onResult(String text, String error);
    }

    public static class Turn {
        public final boolean fromMe;
        public final String text;

        public Turn(boolean fromMe, String text) {
            this.fromMe = fromMe;
            this.text = text;
        }
    }

    private static final ExecutorService POOL = Executors.newFixedThreadPool(2, new ThreadFactory() {
        @Override
        public Thread newThread(Runnable r) {
            Thread t = new Thread(r, "ai-llm");
            t.setDaemon(true);
            t.setPriority(Thread.NORM_PRIORITY - 1);
            return t;
        }
    });

    /**
     * @param system   системный промпт
     * @param history  последние реплики диалога (may be empty)
     * @param prompt   текущий запрос
     */
    public static void complete(String system, ArrayList<Turn> history, String prompt, Callback callback) {
        final AIConfig cfg = AIConfig.getInstance(currentAccount());
        if (cfg.getApiKey().isEmpty() && !cfg.hasKey()) {
            postError(callback, "Не задан API-ключ. Открой Настройки → ИИ-функции.");
            return;
        }
        POOL.execute(() -> {
            try {
                String result = blockingComplete(cfg, system, history, prompt);
                AndroidUtilities.runOnUIThread(() -> callback.onResult(result, null));
            } catch (final Throwable error) {
                final String message = describe(error);
                AndroidUtilities.runOnUIThread(() -> callback.onResult(null, message));
            }
        });
    }

    /** Синхронный вызов — для «проверить ключ» из настроек, вне UI-потока. */
    public static String blockingComplete(AIConfig cfg, String system, ArrayList<Turn> history, String prompt) throws Exception {
        String base = cfg.baseUrl();
        if (base.isEmpty()) throw new Exception("Не задан base URL провайдера");

        AIHttp.Response response;
        switch (cfg.apiStyle()) {
            case AIConfig.STYLE_ANTHROPIC:
                response = anthropic(cfg, base, system, history, prompt);
                break;
            case AIConfig.STYLE_GEMINI:
                response = gemini(cfg, base, system, history, prompt);
                break;
            case AIConfig.STYLE_OPENAI:
            default:
                response = openaiCompatible(cfg, base, system, history, prompt);
                break;
        }

        if (!response.isOk()) {
            throw new Exception("HTTP " + response.code + ": " + summarizeError(response.body));
        }
        String text = extractText(cfg.apiStyle(), response.body);
        if (text == null) throw new Exception("Не удалось разобрать ответ: " + abbreviate(response.body, 240));
        return text.trim();
    }

    /* ---------------- провайдеры ---------------- */

    private static AIHttp.Response openaiCompatible(AIConfig cfg, String base, String system, ArrayList<Turn> history, String prompt) throws Exception {
        JSONObject payload = new JSONObject();
        payload.put("model", cfg.getModel());
        payload.put("temperature", cfg.getTemperature());
        payload.put("max_tokens", cfg.getMaxTokens());
        payload.put("stream", false);

        JSONArray messages = new JSONArray();
        if (!system.isEmpty()) messages.put(new JSONObject().put("role", "system").put("content", system));
        if (history != null) {
            for (Turn t : history) {
                messages.put(new JSONObject()
                    .put("role", t.fromMe ? "assistant" : "user")
                    .put("content", t.text));
            }
        }
        messages.put(new JSONObject().put("role", "user").put("content", prompt));
        payload.put("messages", messages);

        Map<String, String> headers = new HashMap<>();
        headers.put("Authorization", "Bearer " + cfg.getApiKey());
        return AIHttp.postJson(base + "/chat/completions", headers, payload.toString());
    }

    private static AIHttp.Response anthropic(AIConfig cfg, String base, String system, ArrayList<Turn> history, String prompt) throws Exception {
        JSONObject payload = new JSONObject();
        payload.put("model", cfg.getModel());
        payload.put("max_tokens", cfg.getMaxTokens());
        payload.put("temperature", cfg.getTemperature());
        if (!system.isEmpty()) payload.put("system", system);

        JSONArray messages = new JSONArray();
        if (history != null) {
            for (Turn t : history) {
                messages.put(new JSONObject()
                    .put("role", t.fromMe ? "assistant" : "user")
                    .put("content", t.text));
            }
        }
        messages.put(new JSONObject().put("role", "user").put("content", prompt));
        payload.put("messages", messages);

        Map<String, String> headers = new HashMap<>();
        headers.put("x-api-key", cfg.getApiKey());
        headers.put("anthropic-version", "2023-06-01");
        // Без этого заголовка Anthropic режет CORS/клиентов по UA; полезна и для локальных прокси.
        headers.put("User-Agent", "Telegram-AI-Features/1.0");
        return AIHttp.postJson(base + "/messages", headers, payload.toString());
    }

    private static AIHttp.Response gemini(AIConfig cfg, String base, String system, ArrayList<Turn> history, String prompt) throws Exception {
        JSONObject payload = new JSONObject();
        if (!system.isEmpty()) {
            payload.put("systemInstruction", new JSONObject().put("parts",
                new JSONArray().put(new JSONObject().put("text", system))));
        }
        JSONArray contents = new JSONArray();
        if (history != null) {
            for (Turn t : history) {
                contents.put(new JSONObject()
                    .put("role", t.fromMe ? "model" : "user")
                    .put("parts", new JSONArray().put(new JSONObject().put("text", t.text))));
            }
        }
        contents.put(new JSONObject().put("role", "user")
            .put("parts", new JSONArray().put(new JSONObject().put("text", prompt))));
        payload.put("contents", contents);

        JSONObject generationConfig = new JSONObject();
        generationConfig.put("temperature", cfg.getTemperature());
        generationConfig.put("maxOutputTokens", cfg.getMaxTokens());
        payload.put("generationConfig", generationConfig);

        Map<String, String> headers = new HashMap<>();
        // У Gemini ключ ездит в query-параметре.
        String url = base + "/models/" + cfg.getModel() + ":generateContent?key=" + cfg.getApiKey();
        return AIHttp.postJson(url, headers, payload.toString());
    }

    /* ---------------- парсинг ---------------- */

    private static String extractText(int style, String body) {
        try {
            JSONObject root = new JSONObject(body);
            switch (style) {
                case AIConfig.STYLE_ANTHROPIC: {
                    JSONArray content = root.optJSONArray("content");
                    if (content == null) return null;
                    StringBuilder sb = new StringBuilder();
                    for (int i = 0; i < content.length(); i++) {
                        JSONObject part = content.optJSONObject(i);
                        if (part != null && "text".equals(part.optString("type"))) {
                            sb.append(part.optString("text"));
                        }
                    }
                    return sb.length() == 0 ? null : sb.toString();
                }
                case AIConfig.STYLE_GEMINI: {
                    JSONArray candidates = root.optJSONArray("candidates");
                    if (candidates == null || candidates.length() == 0) return null;
                    JSONObject first = candidates.optJSONObject(0);
                    if (first == null) return null;
                    JSONObject content = first.optJSONObject("content");
                    if (content == null) return null;
                    JSONArray parts = content.optJSONArray("parts");
                    if (parts == null) return null;
                    StringBuilder sb = new StringBuilder();
                    for (int i = 0; i < parts.length(); i++) {
                        JSONObject part = parts.optJSONObject(i);
                        if (part != null) sb.append(part.optString("text"));
                    }
                    return sb.length() == 0 ? null : sb.toString();
                }
                case AIConfig.STYLE_OPENAI:
                default: {
                    JSONArray choices = root.optJSONArray("choices");
                    if (choices == null || choices.length() == 0) return null;
                    JSONObject first = choices.optJSONObject(0);
                    if (first == null) return null;
                    JSONObject message = first.optJSONObject("message");
                    if (message != null) return message.optString("content", null);
                    // У части совместимых шлюзов есть устаревшее поле text.
                    return first.optString("text", null);
                }
            }
        } catch (Exception ignore) {
            return null;
        }
    }

    private static String summarizeError(String body) {
        try {
            JSONObject root = new JSONObject(body);
            JSONObject error = root.optJSONObject("error");
            if (error != null) {
                String m = error.optString("message", null);
                if (m != null) return abbreviate(m, 220);
            }
            String m = root.optString("message", null);
            if (m != null) return abbreviate(m, 220);
        } catch (Exception ignore) {
            // не JSON — вернём кусок текста
        }
        return abbreviate(body, 220);
    }

    private static String abbreviate(String s, int max) {
        if (s == null) return "";
        String t = s.replaceAll("\\s+", " ").trim();
        return t.length() <= max ? t : t.substring(0, max) + "…";
    }

    private static String describe(Throwable t) {
        String m = t.getMessage();
        if (m == null) m = t.getClass().getSimpleName();
        if (t instanceof java.net.SocketTimeoutException) return "Таймаут сети. Проверь соединение или прокси.";
        if (t instanceof java.net.UnknownHostException) return "Домен не резолвится: " + m;
        if (t instanceof javax.net.ssl.SSLException) return "Ошибка TLS: " + m;
        return abbreviate(t.getClass().getSimpleName() + ": " + m, 260);
    }

    private static void postError(Callback callback, String message) {
        AndroidUtilities.runOnUIThread(() -> callback.onResult(null, message));
    }

    private static int currentAccount() {
        return UserConfig.selectedAccount;
    }
}
