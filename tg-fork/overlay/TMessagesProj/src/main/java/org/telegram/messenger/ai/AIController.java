package org.telegram.messenger.ai;

import android.os.SystemClock;
import android.text.TextUtils;

import org.telegram.messenger.MessagesController;
import org.telegram.messenger.NotificationCenter;
import org.telegram.messenger.SendMessagesHelper;
import org.telegram.messenger.UserConfig;
import org.telegram.tgnet.TLRPC;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedList;
import java.util.Map;

/**
 * Автоответчик: слушает входящие сообщения и, если владельцу нельзя ответить,
 * проксирует диалог в выбранную ИИ-модель.
 *
 * Правила безопасности зашиты в код, а не в конфиг, потому что цена ошибки —
 * спам от имени живого аккаунта:
 *   1) отвечаем только туда, где диалог приватный (dialogId > 0), если явно не включены группы;
 *   2) никогда не отвечаем на исходящие, сервисные и медиа-сообщения;
 *   3) не более N ответов в час и не чаще, чем раз в M секунд в один чат;
 *   4) если на автоответ никто не ответил владельцу — режим «я не в сети» сбрасывается,
 *      чтобы не разговаривать с ботами и рассылками;
 *   5) при первом же исходящем сообщении человека (владельца) все цепочки обрываются.
 */
public class AIController implements NotificationCenter.NotificationCenterDelegate {

    public interface SimpleCallback {
        void onResult(String text, String error);
    }

    private static final HashMap<Integer, AIController> INSTANCES = new HashMap<>();

    public static AIController getInstance(int account) {
        synchronized (INSTANCES) {
            AIController c = INSTANCES.get(account);
            if (c == null) {
                c = new AIController(account);
                INSTANCES.put(account, c);
            }
            return c;
        }
    }

    public static AIController getCurrent() {
        return getInstance(UserConfig.selectedAccount);
    }

    private final int currentAccount;
    private boolean registered;

    /** Когда владелец в последний раз сам что-то отправил (эл. время). */
    private long lastOutgoingElapsed = SystemClock.elapsedRealtime();
    /** dialogId -> время последнего автоответа. */
    private final HashMap<Long, Long> lastAutoReplyAt = new HashMap<>();
    /** dialogId -> короткая история для контекста модели. */
    private final HashMap<Long, LinkedList<AILlm.Turn>> history = new HashMap<>();
    /** Скользящее окно ответов в час. */
    private final LinkedList<Long> recentReplies = new LinkedList<>();
    /** dialogId -> сколько подряд автоответов отправлено без участия владельца. */
    private final HashMap<Long, Integer> consecutiveAutoReplies = new HashMap<>();

    private final ArrayList<String> log = new ArrayList<>();
    private static final int MAX_LOG = 60;
    private static final int MAX_HISTORY_TURNS = 6;
    private static final int MAX_CONSECUTIVE = 3;

    private AIController(int account) {
        this.currentAccount = account;
    }

    /* ---------------- регистрация ---------------- */

    public void onBecomeActive() {
        if (registered) return;
        registered = true;
        NotificationCenter.getInstance(currentAccount).addObserver(this, NotificationCenter.didReceiveNewMessages);
        appendLog("контроллер активен");
    }

    public void onBecomeInactive() {
        if (!registered) return;
        registered = false;
        NotificationCenter.getInstance(currentAccount).removeObserver(this, NotificationCenter.didReceiveNewMessages);
    }

    @Override
    public void didReceivedNotification(int id, int account, Object... args) {
        if (id != NotificationCenter.didReceiveNewMessages || account != currentAccount) return;
        if (args == null || args.length < 2) return;
        if (!(args[0] instanceof Long) || !(args[1] instanceof ArrayList)) return;

        long dialogId = (Long) args[0];
        ArrayList<TLRPC.Message> messages = castMessages(args[1]);
        if (messages == null || messages.isEmpty()) return;

        AIConfig cfg = AIConfig.getInstance(currentAccount);
        TLRPC.Message lastIncoming = null;
        for (int i = messages.size() - 1; i >= 0; i--) {
            TLRPC.Message m = messages.get(i);
            if (m == null) continue;
            if (m.out) {
                // Владелец ответил сам — сбрасываем автосессию.
                lastOutgoingElapsed = SystemClock.elapsedRealtime();
                consecutiveAutoReplies.remove(dialogId);
                return;
            }
            if (lastIncoming == null) lastIncoming = m;
        }
        if (lastIncoming == null) return;
        if (cfg.getAutoReplyMode() == AIConfig.MODE_OFF || !cfg.hasKey()) return;
        if (!isReplyable(lastIncoming, dialogId, cfg)) return;
        if (!idleEnough(cfg)) return;
        if (!throttled(dialogId, cfg)) return;

        final TLRPC.Message message = lastIncoming;
        final String text = message.message == null ? "" : message.message;
        remember(dialogId, new AILlm.Turn(false, text));

        String system = cfg.getSystemPrompt();
        ArrayList<AILlm.Turn> context = new ArrayList<>(history.get(dialogId));
        long senderId = message.from_id != null ? message.from_id.user_id : 0;
        String sender = resolveName(senderId);
        String prompt = (sender.isEmpty() ? "" : "Собеседник: " + sender + "\n") + "Сообщение: " + text;

        appendLog("→ " + dialogId + ": " + abbreviate(text, 48));
        AILlm.complete(system, context, prompt, (result, error) -> {
            if (result == null || TextUtils.isEmpty(result.trim())) {
                appendLog("✗ " + (error == null ? "пустой ответ" : error));
                return;
            }
            String reply = sanitize(result.trim());
            String signature = cfg.getSignature();
            if (!signature.isEmpty()) reply = reply + "\n\n" + signature;
            sendText(dialogId, reply);
            remember(dialogId, new AILlm.Turn(true, reply));
            lastAutoReplyAt.put(dialogId, SystemClock.elapsedRealtime());
            recentReplies.add(SystemClock.elapsedRealtime());
            int streak = (consecutiveAutoReplies.get(dialogId) == null ? 0 : consecutiveAutoReplies.get(dialogId)) + 1;
            consecutiveAutoReplies.put(dialogId, streak);
            if (streak >= MAX_CONSECUTIVE) {
                // Собеседник не переходит к живому разговору — прекращаем болтовню.
                lastAutoReplyAt.put(dialogId, SystemClock.elapsedRealtime() + 30 * 60_000L);
                appendLog("пауза 30 мин в чате " + dialogId + " (серия автоответов)");
            }
            appendLog("← " + dialogId + ": " + abbreviate(reply, 48));
        });
    }

    /* ---------------- перевод / редактор ---------------- */

    public void translate(String text, String targetLang, SimpleCallback callback) {
        String system = "Ты — переводчик. Переведи текст пользователя на " + targetLang
            + ". Сохрани эмодзи, переносы строк и регистр имён. Верни только перевод, без пояснений.";
        run(system, text, callback);
    }

    public void rewrite(String text, int mode, SimpleCallback callback) {
        AIConfig cfg = AIConfig.getInstance(currentAccount);
        run(cfg.editorInstruction(mode), text, callback);
    }

    public void freeform(String prompt, SimpleCallback callback) {
        run(AIConfig.getInstance(currentAccount).getSystemPrompt(), prompt, callback);
    }

    private void run(String system, String userText, final SimpleCallback callback) {
        AILlm.complete(system, null, userText, (result, error) -> {
            if (callback != null) callback.onResult(result, error);
        });
    }

    /** Отправить текст в чат штатным механизмом Telegram (очередь, ретраи, редактирование). */
    private void sendText(long dialogId, String text) {
        try {
            SendMessagesHelper.getInstance(currentAccount)
                .sendMessage(SendMessagesHelper.SendMessageParams.of(text, dialogId));
        } catch (Throwable t) {
            appendLog("ошибка отправки: " + t.getLocalizedMessage());
        }
    }

    /* ---------------- правила ---------------- */

    private boolean isReplyable(TLRPC.Message m, long dialogId, AIConfig cfg) {
        if (TextUtils.isEmpty(m.message)) return false;              // текст, а не медиа
        if (m.action != null) return false;                          // сервисные («X вступил…»)
        if (m.edit_date != 0) return false;                          // не реагируем на правки
        if (m.paid_message_stars != 0) return false;
        if (m.media != null) return false;   // медиа не комментируем
        if (dialogId <= 0 && !cfg.isReplyInGroups()) return false;   // приватные по умолчанию
        String body = m.message.trim();
        if (body.length() < 2) return false;
        // Не вступаем в переписку с ботами и рассылками.
        TLRPC.User user = peerOf(dialogId);
        if (user != null && user.bot) return false;   // с ботами не разговариваем
        return true;
    }

    /** «Не в сети» = владелец молчит дольше порога (или режим ALWAYS). */
    private boolean idleEnough(AIConfig cfg) {
        if (cfg.getAutoReplyMode() == AIConfig.MODE_ALWAYS) return true;
        long idleMs = SystemClock.elapsedRealtime() - lastOutgoingElapsed;
        return idleMs >= cfg.getIdleMinutes() * 60_000L;
    }

    private boolean throttled(long dialogId, AIConfig cfg) {
        long now = SystemClock.elapsedRealtime();
        Long last = lastAutoReplyAt.get(dialogId);
        if (last != null && now - last < cfg.getMinDelaySeconds() * 1000L) {
            appendLog("пропущено: слишком часто в чате " + dialogId);
            return false;
        }
        while (!recentReplies.isEmpty() && now - recentReplies.peekFirst() > 3_600_000L) {
            recentReplies.pollFirst();
        }
        if (recentReplies.size() >= cfg.getMaxRepliesPerHour()) {
            appendLog("пропущено: лимит " + cfg.getMaxRepliesPerHour() + " ответов/час");
            return false;
        }
        return true;
    }

    private void remember(long dialogId, AILlm.Turn turn) {
        LinkedList<AILlm.Turn> list = history.get(dialogId);
        if (list == null) {
            list = new LinkedList<>();
            history.put(dialogId, list);
        }
        list.add(turn);
        while (list.size() > MAX_HISTORY_TURNS) list.removeFirst();
    }

    private TLRPC.User peerOf(long dialogId) {
        try {
            if (dialogId > 0) {
                return MessagesController.getInstance(currentAccount).getUser(dialogId);
            }
        } catch (Throwable ignore) {
        }
        return null;
    }

    private String resolveName(long peerId) {
        if (peerId == 0) return "";
        try {
            TLRPC.User u = MessagesController.getInstance(currentAccount).getUser(peerId);
            if (u != null) {
                String first = u.first_name == null ? "" : u.first_name;
                String last = u.last_name == null ? "" : u.last_name;
                String name = (first + " " + last).trim();
                return name.isEmpty() && u.username != null ? u.username : name;
            }
        } catch (Throwable ignore) {
        }
        return "";
    }

    /** Убираем «маркерность» ИИ и лишние кавычки, в которые любят оборачивать ответ. */
    private String sanitize(String raw) {
        String s = raw.replace("\r\n", "\n");
        if (s.length() >= 2 && (s.charAt(0) == '"' || s.charAt(0) == '“') && (s.endsWith("\"") || s.endsWith("”"))) {
            s = s.substring(1, s.length() - 1).trim();
        }
        if (s.length() > 3500) s = s.substring(0, 3500);
        return s;
    }

    @SuppressWarnings("unchecked")
    private ArrayList<TLRPC.Message> castMessages(Object o) {
        try {
            return (ArrayList<TLRPC.Message>) o;
        } catch (Throwable t) {
            return null;
        }
    }

    /* ---------------- журнал для экрана настроек ---------------- */

    private void appendLog(String line) {
        synchronized (log) {
            log.add(0, java.text.DateFormat.getTimeInstance(java.text.DateFormat.SHORT).format(new java.util.Date()) + "  " + line);
            while (log.size() > MAX_LOG) log.remove(log.size() - 1);
        }
    }

    public String dumpLog() {
        synchronized (log) {
            return log.isEmpty() ? "Журнал пуст" : TextUtils.join("\n", log);
        }
    }

    private static String abbreviate(String s, int max) {
        if (s == null) return "";
        String t = s.replaceAll("\\s+", " ").trim();
        return t.length() <= max ? t : t.substring(0, max) + "…";
    }
}
