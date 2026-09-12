package org.telegram.messenger.ai;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.zip.GZIPInputStream;
import java.util.zip.InflaterInputStream;

import javax.net.ssl.HttpsURLConnection;

/**
 * Минимальный HTTP-клиент на HttpURLConnection.
 *
 * Сознательно без OkHttp/Retrofit: в проекте Telegram-Android они не подключены,
 * а лишняя зависимость = лишний шаг в сборке. Ответ режем по лимиту, чтобы
 * кривой эндпоинт не сожрал память.
 */
public class AIHttp {

    private static final int MAX_RESPONSE_BYTES = 512 * 1024;
    private static final int CONNECT_TIMEOUT_MS = 15_000;
    private static final int READ_TIMEOUT_MS = 60_000;

    public static class Response {
        public final int code;
        public final String body;

        Response(int code, String body) {
            this.code = code;
            this.body = body;
        }

        public boolean isOk() {
            return code >= 200 && code < 300;
        }
    }

    /**
     * POST JSON. Блокирующий — вызывать только из фонового потока.
     * @throws IOException на сетевых ошибках и при попытке уйти на http вне localhost
     */
    public static Response postJson(String url, Map<String, String> headers, String jsonBody) throws IOException {
        return exchange("POST", url, headers, jsonBody);
    }

    public static Response get(String url, Map<String, String> headers) throws IOException {
        return exchange("GET", url, headers, null);
    }

    private static Response exchange(String method, String urlStr, Map<String, String> headers, String body) throws IOException {
        URL url = new URL(urlStr);
        String protocol = url.getProtocol();
        if (!"https".equals(protocol)) {
            // http допускаем только для loopback: Ollama / LM Studio на устройстве.
            if (!"http".equals(protocol) || !isLoopback(url.getHost())) {
                throw new IOException("Разрешён только https (или http для localhost): " + urlStr);
            }
        }

        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        try {
            conn.setRequestMethod(method);
            conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
            conn.setReadTimeout(READ_TIMEOUT_MS);
            conn.setDoInput(true);
            conn.setRequestProperty("Accept", "application/json");
            conn.setRequestProperty("Accept-Encoding", "gzip");
            conn.setRequestProperty("User-Agent", "MarkNote-TGAi/1.0");
            if (headers != null) {
                for (Map.Entry<String, String> h : headers.entrySet()) {
                    conn.setRequestProperty(h.getKey(), h.getValue());
                }
            }
            if (body != null) {
                conn.setDoOutput(true);
                conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                byte[] payload = body.getBytes(StandardCharsets.UTF_8);
                conn.setFixedLengthStreamingMode(payload.length);
                try (OutputStream out = conn.getOutputStream()) {
                    out.write(payload);
                    out.flush();
                }
            }

            int code = conn.getResponseCode();
            InputStream stream = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
            if (stream == null) stream = conn.getInputStream();
            String encoding = conn.getContentEncoding();
            if ("gzip".equalsIgnoreCase(encoding)) {
                stream = new GZIPInputStream(stream);
            } else if ("deflate".equalsIgnoreCase(encoding)) {
                stream = new InflaterInputStream(stream);
            }
            String text = readLimited(stream);
            return new Response(code, text);
        } finally {
            conn.disconnect();
        }
    }

    private static String readLimited(InputStream in) throws IOException {
        if (in == null) return "";
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int total = 0;
        int read;
        try {
            while ((read = in.read(buf)) > 0) {
                total += read;
                if (total > MAX_RESPONSE_BYTES) {
                    throw new IOException("Слишком большой ответ от ИИ-эндпоинта (>512 КиБ)");
                }
                out.write(buf, 0, read);
            }
        } finally {
            try {
                in.close();
            } catch (Exception ignore) {
            }
        }
        return out.toString("UTF-8");
    }

    private static boolean isLoopback(String host) {
        if (host == null) return false;
        String h = host.toLowerCase();
        return h.equals("localhost") || h.equals("127.0.0.1") || h.equals("::1") || h.equals("[::1]")
            || h.startsWith("127.");
    }
}
