package org.telegram.ui;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.text.InputType;
import android.view.ContextThemeWrapper;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

import org.telegram.messenger.AndroidUtilities;
import org.telegram.messenger.FileLog;

import org.telegram.messenger.ai.AIConfig;
import org.telegram.messenger.ai.AIController;
import org.telegram.messenger.ai.AILlm;
import org.telegram.ui.ActionBar.BaseFragment;
import org.telegram.ui.ActionBar.Theme;
import org.telegram.ui.Components.LayoutHelper;

/**
 * Экран «ИИ-функции». UI собран программно на стандартных виджетах:
 * он не зависит отRecyclerListView/SettingCell-эволюции, а значит переживёт
 * обновление апстрима с минимальным числом конфликтов.
 */
public class AISettingsActivity extends BaseFragment {

    private AIConfig cfg;
    private LinearLayout content;
    private TextView logView;
    /** Context из createView: нужен для перестройки рядов после изменения настроек. */
    private Context uiContext;

    @Override
    public View createView(Context context) {
        actionBar.setBackButtonImage(org.telegram.messenger.R.drawable.ic_ab_back);
        actionBar.setAllowOverlayTitle(true);
        actionBar.setTitle("ИИ-функции");
        actionBar.setActionBarMenuOnItemClick(id -> {
            if (id == -1) finishFragment();
        });

        uiContext = context;
        cfg = AIConfig.getInstance(currentAccount);

        ScrollView scroll = new ScrollView(context);
        scroll.setBackgroundColor(Theme.getColor(Theme.key_windowBackgroundGray));
        scroll.setFillViewport(false);

        content = new LinearLayout(context);
        content.setOrientation(LinearLayout.VERTICAL);
        int pad = AndroidUtilities.dp(14);
        content.setPadding(pad, pad, pad, pad);
        scroll.addView(content, new ScrollView.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        buildProviderSection(context);
        buildAutoReplySection(context);
        buildToolsSection(context);
        buildProxySection(context);
        buildLogSection(context);

        return scroll;
    }

    /* ---------------- секции ---------------- */

    private void buildProviderSection(Context context) {
        sectionTitle("Провайдер и ключ");
        cardRow(context, "Провайдер", cfg.providerTitle(), v -> chooseProvider());
        cardRow(context, "API-ключ", maskKey(cfg.getApiKey()), v -> editApiKey());
        cardRow(context, "Модель", cfg.getModel(), v -> editModel());
        cardRow(context, "Свой base URL", shortOr(cfg.baseUrl(), "из пресета"), v -> editBaseUrl());
        switchRow(context, "Разрешить http для localhost", cfg.isAllowLocalHttp(),
            (v, on) -> { cfg.setAllowLocalHttp(on); toast(on ? "Ollama/LM Studio будут доступны по http" : "Только https"); },
            "Нужно для локальных моделей (Ollama, LM Studio). Для внешних провайдеров всегда используется https.");
        actionRow(context, "Проверить ключ", v -> testKey());
    }

    private void buildAutoReplySection(Context context) {
        sectionTitle("Автоответчик");
        String[] modes = {"Выключен", "Только когда я не отвечаю", "Всегда"};
        cardRow(context, "Режим", modes[Math.max(0, Math.min(2, cfg.getAutoReplyMode()))], v -> chooseMode(modes));
        intRow(context, "Считать меня «не в сети» после", cfg.getIdleMinutes(), "мин молчания",
            cfg::setIdleMinutes, v -> v >= 1);
        switchRow(context, "Отвечать и в группах", cfg.isReplyInGroups(),
            (v, on) -> { cfg.setReplyInGroups(on); toast(on ? "Осторожно: риск жалоб на спам выше" : "Группы пропущены"); },
            "По умолчанию включены только личные чаты.");
        intRow(context, "Лимит ответов в час", cfg.getMaxRepliesPerHour(), "шт", cfg::setMaxRepliesPerHour, v -> v >= 1);
        intRow(context, "Минимальная пауза в один чат", cfg.getMinDelaySeconds(), "сек", cfg::setMinDelaySeconds, v -> v >= 10);
        cardRow(context, "Системный промпт", preview(cfg.getSystemPrompt()), v -> editSystemPrompt());
        cardRow(context, "Подпись", shortOr(cfg.getSignature(), "нет"), v -> editSignature());
    }

    private void buildToolsSection(Context context) {
        sectionTitle("Переводчик и редактор");
        cardRow(context, "Язык перевода", cfg.getTranslateLang(), v -> editTranslateLang());
        String[] tones = {"Дружелюбнее", "Формальнее", "Короче", "Только исправить ошибки"};
        cardRow(context, "Режим редактора", tones[clamp(cfg.getEditorMode(), 0, 3)], v -> {
            new AlertDialog.Builder(getParentActivity())
                .setTitle("Режим редактора")
                .setItems(tones, (d, which) -> {
                    cfg.setEditorMode(which);
                    rebuild();
                })
                .show();
        });
        actionRow(context, "Продемонстрировать: перевести «Привет, я занят»", v -> demoTranslate());
    }

    private void buildProxySection(Context context) {
        sectionTitle("Соединение и прокси");
        TextView note = bodyText("Обход блокировки не «вшивается» в сборку: используется штатный MTProto-прокси Telegram "
            + "(Настройки → Данные и память → Прокси). Здесь можно открыть его и подключить свой список, "
            + "чтобы не искать нужное приложение вслепую.");
        content.addView(note);
        actionRow(context, "Открыть настройки прокси Telegram", v -> presentFragment(new ProxySettingsActivity()));
        cardRow(context, "URL списка прокси (tg://proxy…)", shortOr(cfg.getProxyListUrl(), "не задан"), v -> editProxyList());
        actionRow(context, "Загрузить список и показать ссылки", v -> loadProxyList());
    }

    private void buildLogSection(Context context) {
        sectionTitle("Журнал");
        logView = new TextView(getParentActivity());
        logView.setTypeface(android.graphics.Typeface.MONOSPACE);
        logView.setTextSize(11);
        logView.setTextColor(Theme.getColor(Theme.key_windowBackgroundWhiteBlackText));
        logView.setLineSpacing(AndroidUtilities.dp(2), 1f);
        logView.setText(AIController.getInstance(currentAccount).dumpLog());
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = AndroidUtilities.dp(6);
        logView.setPadding(AndroidUtilities.dp(10), AndroidUtilities.dp(10), AndroidUtilities.dp(10), AndroidUtilities.dp(10));
        logView.setBackgroundColor(Theme.getColor(Theme.key_windowBackgroundWhite));
        content.addView(logView, lp);
    }

    /* ---------------- конструкторы рядов ---------------- */

    private void sectionTitle(String title) {
        TextView tv = new TextView(getParentActivity());
        tv.setText(title.toUpperCase());
        tv.setTextSize(12);
        tv.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        tv.setTextColor(Theme.getColor(Theme.key_windowBackgroundWhiteGrayText));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = AndroidUtilities.dp(18);
        lp.leftMargin = AndroidUtilities.dp(4);
        lp.bottomMargin = AndroidUtilities.dp(6);
        content.addView(tv, lp);
    }

    private LinearLayout newCard() {
        LinearLayout card = new LinearLayout(getParentActivity());
        card.setOrientation(LinearLayout.VERTICAL);
        card.setBackgroundColor(Theme.getColor(Theme.key_windowBackgroundWhite));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.bottomMargin = AndroidUtilities.dp(1);
        card.setLayoutParams(lp);
        return card;
    }

    private void cardRow(Context context, String title, String value, View.OnClickListener onClick) {
        LinearLayout row = new LinearLayout(context);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setPadding(AndroidUtilities.dp(16), AndroidUtilities.dp(13), AndroidUtilities.dp(16), AndroidUtilities.dp(13));
        row.setClickable(true);

        TextView t = new TextView(context);
        t.setText(title);
        t.setTextSize(16);
        t.setTextColor(Theme.getColor(Theme.key_windowBackgroundWhiteBlackText));
        t.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        TextView v = new TextView(context);
        v.setText(value == null ? "" : value);
        v.setTextSize(14);
        v.setMaxWidth(AndroidUtilities.dp(180));
        v.setSingleLine(true);
        v.setEllipsize(android.text.TextUtils.TruncateAt.MIDDLE);
        v.setTextColor(Theme.getColor(Theme.key_windowBackgroundWhiteGrayText));
        v.setLayoutParams(new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        row.addView(t);
        row.addView(v);
        row.setOnClickListener(onClick);
        content.addView(row, cardParams());
    }

    private LinearLayout.LayoutParams cardParams() {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.bottomMargin = AndroidUtilities.dp(1);
        return lp;
    }

    private void switchRow(Context context, String title, boolean checked, OnToggle toggle, String hint) {
        LinearLayout row = new LinearLayout(context);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(android.view.Gravity.CENTER_VERTICAL);
        row.setPadding(AndroidUtilities.dp(16), AndroidUtilities.dp(10), AndroidUtilities.dp(16), AndroidUtilities.dp(10));

        LinearLayout texts = new LinearLayout(context);
        texts.setOrientation(LinearLayout.VERTICAL);
        texts.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        TextView t = new TextView(context);
        t.setText(title);
        t.setTextSize(16);
        t.setTextColor(Theme.getColor(Theme.key_windowBackgroundWhiteBlackText));
        texts.addView(t);

        if (hint != null) {
            TextView h = new TextView(context);
            h.setText(hint);
            h.setTextSize(12);
            h.setTextColor(Theme.getColor(Theme.key_windowBackgroundWhiteGrayText));
            LinearLayout.LayoutParams hlp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            hlp.topMargin = AndroidUtilities.dp(2);
            hlp.rightMargin = AndroidUtilities.dp(10);
            texts.addView(h, hlp);
        }

        Switch sw = new Switch(context);
        sw.setChecked(checked);
        sw.setOnCheckedChangeListener((v, on) -> toggle.onToggle(v, on));

        row.addView(texts);
        row.addView(sw);
        content.addView(row, cardParams());
    }

    private interface OnToggle {
        void onToggle(View v, boolean on);
    }

    private void actionRow(Context context, String title, View.OnClickListener onClick) {
        Button b = new Button(context);
        b.setText(title);
        b.setAllCaps(false);
        b.setTextColor(Color.parseColor("#2AABEE"));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = AndroidUtilities.dp(6);
        b.setOnClickListener(onClick);
        content.addView(b, lp);
    }

    private void intRow(Context context, String title, int value, String unit, java.util.function.IntConsumer setter, java.util.function.IntPredicate valid) {
        cardRow(context, title + " (" + unit + ")", String.valueOf(value), v -> {
            EditText input = new EditText(getParentActivity());
            input.setInputType(InputType.TYPE_CLASS_NUMBER);
            input.setText(String.valueOf(value));
            new AlertDialog.Builder(getParentActivity())
                .setTitle(title)
                .setView(input)
                .setPositiveButton(android.R.string.ok, (d, w) -> {
                    try {
                        int parsed = Integer.parseInt(input.getText().toString().trim());
                        if (!valid.test(parsed)) {
                            toast("Слишком маленькое значение");
                            return;
                        }
                        setter.accept(parsed);
                        rebuild();
                    } catch (NumberFormatException e) {
                        toast("Нужно число");
                    }
                })
                .setNegativeButton(android.R.string.cancel, null)
                .show();
        });
    }

    private TextView bodyText(String text) {
        TextView tv = new TextView(getParentActivity());
        tv.setText(text);
        tv.setTextSize(13);
        tv.setTextColor(Theme.getColor(Theme.key_windowBackgroundWhiteGrayText));
        tv.setLineSpacing(AndroidUtilities.dp(3), 1f);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = AndroidUtilities.dp(4);
        lp.bottomMargin = AndroidUtilities.dp(8);
        lp.leftMargin = AndroidUtilities.dp(4);
        lp.rightMargin = AndroidUtilities.dp(4);
        tv.setLayoutParams(lp);
        return tv;
    }

    /* ---------------- действия ---------------- */

    private void rebuild() {
        content.removeAllViews();
        Context context = uiContext != null ? uiContext : getParentActivity();
        buildProviderSection(context);
        buildAutoReplySection(context);
        buildToolsSection(context);
        buildProxySection(context);
        buildLogSection(context);
    }

    private void chooseProvider() {
        String[] names = new String[AIConfig.PROVIDERS.length];
        for (int i = 0; i < names.length; i++) names[i] = AIConfig.PROVIDERS[i][1];
        new AlertDialog.Builder(getParentActivity())
            .setTitle("Провайдер")
            .setItems(names, (d, which) -> {
                cfg.setProviderId(AIConfig.PROVIDERS[which][0]);
                rebuild();
                toast("Провайдер: " + names[which] + " · модель " + cfg.getModel());
            })
            .show();
    }

    private void chooseMode(String[] modes) {
        new AlertDialog.Builder(getParentActivity())
            .setTitle("Режим автоответчика")
            .setItems(modes, (d, which) -> {
                cfg.setAutoReplyMode(which);
                if (which != AIConfig.MODE_OFF) {
                    AIController.getInstance(currentAccount).onBecomeActive();
                }
                rebuild();
            })
            .show();
    }

    private void editApiKey() {
        promptText("API-ключ", "sk-… / ключ провайдера", cfg.getApiKey(), true, value -> {
            cfg.setApiKey(value);
            if (cfg.getAutoReplyMode() != AIConfig.MODE_OFF) {
                AIController.getInstance(currentAccount).onBecomeActive();
            }
            rebuild();
            toast(value.isEmpty() ? "Ключ очищен" : "Ключ сохранён в приватном хранилище");
        });
    }

    private void editModel() {
        promptText("Модель", "например gpt-4o-mini", cfg.getModel(), false, value -> {
            cfg.setModel(value);
            rebuild();
        });
    }

    private void editBaseUrl() {
        promptText("Base URL", "https://…/v1 (пусто = из пресета)", "", false, value -> {
            cfg.setBaseUrlOverride(value);
            rebuild();
        });
    }

    private void editSystemPrompt() {
        promptText("Системный промпт", "как вести себя автоответчику", cfg.getSystemPrompt(), false, value -> {
            cfg.setSystemPrompt(value);
            rebuild();
        });
    }

    private void editSignature() {
        promptText("Подпись", "например «(автоответ, пока я не в сети)»", cfg.getSignature(), false, value -> {
            cfg.setSignature(value);
            rebuild();
        });
    }

    private void editTranslateLang() {
        promptText("Язык перевода", "English / Deutsch / Türkçe…", cfg.getTranslateLang(), false, value -> {
            cfg.setTranslateLang(value);
            rebuild();
        });
    }

    private void editProxyList() {
        promptText("URL списка прокси", "текст, где каждая строка — tg://proxy?…", cfg.getProxyListUrl(), false, value -> {
            cfg.setProxyListUrl(value);
            rebuild();
        });
    }

    private void testKey() {
        toast("Отправляю тестовый запрос…");
        AILlm.complete("Ответь ровно одной фразой: ключ работает.", null, "ping", (text, error) -> {
            if (getView() == null) return;
            if (error != null) {
                new AlertDialog.Builder(getParentActivity())
                    .setTitle("Провайдер ответил ошибкой")
                    .setMessage(error)
                    .setPositiveButton(android.R.string.ok, null)
                    .show();
            } else {
                toast("✓ " + (text == null ? "" : text));
            }
            refreshLog();
        });
    }

    private void demoTranslate() {
        AIController.getInstance(currentAccount).translate("Привет, я сейчас занят, напишу вечером",
            cfg.getTranslateLang(), (text, error) -> {
                if (error != null) toast(error);
                else toast("→ " + text);
                refreshLog();
            });
    }

    private void loadProxyList() {
        String url = cfg.getProxyListUrl();
        if (url.isEmpty()) {
            toast("Сначала укажи URL списка");
            return;
        }
        new Thread(() -> {
            String body;
            try {
                java.util.HashMap<String, String> h = new java.util.HashMap<>();
                body = org.telegram.messenger.ai.AIHttp.get(url, h).body;
            } catch (Exception e) {
                final String err = e.getLocalizedMessage();
                AndroidUtilities.runOnUIThread(() -> toast("Не удалось загрузить: " + err));
                return;
            }
            final String result = body;
            AndroidUtilities.runOnUIThread(() -> {
                String[] lines = result.split("\\r?\\n");
                StringBuilder sb = new StringBuilder();
                int shown = 0;
                for (String line : lines) {
                    String l = line.trim();
                    if (l.startsWith("tg://proxy") || l.startsWith("https://t.me/proxy")) {
                        if (shown++ < 6) sb.append(l).append('\n');
                    }
                }
                if (shown == 0) {
                    toast("В списке нет tg://proxy-ссылок");
                    return;
                }
                new AlertDialog.Builder(getParentActivity())
                    .setTitle("Доступные прокси (" + shown + ")")
                    .setMessage(sb.toString())
                    .setPositiveButton("Добавить первый", (d, w) -> {
                        String first = sb.toString().split("\n")[0].trim();
                        // Отдаём ссылку самому Telegram: он умеет импортировать прокси по tg://-ссылке.
                        try {
                            android.content.Intent intent = new android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(first));
                            intent.setPackage(getParentActivity().getPackageName());
                            startActivity(intent);
                        } catch (Exception e) {
                            FileLog.e(e);
                            toast("Не получилось открыть ссылку");
                        }
                    })
                    .setNegativeButton(android.R.string.cancel, null)
                    .show();
            });
        }, "ai-proxy-list").start();
    }

    private void refreshLog() {
        if (logView != null) {
            logView.setText(AIController.getInstance(currentAccount).dumpLog());
        }
    }

    private void promptText(String title, String hint, String current, boolean password, java.util.function.Consumer<String> done) {
        EditText input = new EditText(getParentActivity());
        input.setHint(hint);
        input.setText(current);
        input.setSelection(current == null ? 0 : current.length());
        input.setInputType(password
            ? (InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD)
            : (InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE));
        input.setSingleLine(password);

        android.widget.FrameLayout wrapper = new android.widget.FrameLayout(getParentActivity());
        int p = AndroidUtilities.dp(20);
        android.widget.FrameLayout.LayoutParams lp = new android.widget.FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.leftMargin = lp.rightMargin = p;
        wrapper.addView(input, lp);

        new AlertDialog.Builder(getParentActivity())
            .setTitle(title)
            .setView(wrapper)
            .setPositiveButton(android.R.string.ok, (d, w) -> done.accept(input.getText().toString().trim()))
            .setNegativeButton(android.R.string.cancel, null)
            .show();
    }

    /* ---------------- утилиты ---------------- */

    private static String maskKey(String key) {
        if (key == null || key.isEmpty()) return "не задан";
        if (key.length() <= 8) {
            StringBuilder dots = new StringBuilder();
            for (int i = 0; i < key.length(); i++) dots.append('•');
            return dots.toString();
        }
        return key.substring(0, 4) + "…" + key.substring(key.length() - 3);
    }

    private static String shortOr(String value, String fallback) {
        if (value == null || value.isEmpty()) return fallback;
        return value.length() > 34 ? value.substring(0, 16) + "…" + value.substring(value.length() - 12) : value;
    }

    private static String preview(String value) {
        if (value == null || value.isEmpty()) return "стандартный";
        String t = value.replaceAll("\\s+", " ").trim();
        return t.length() > 24 ? t.substring(0, 24) + "…" : t;
    }

    private static int clamp(int v, int min, int max) {
        return Math.max(min, Math.min(max, v));
    }

    private void toast(String text) {
        Activity a = getParentActivity();
        if (a != null) Toast.makeText(a, text, Toast.LENGTH_SHORT).show();
    }

    @Override
    public boolean onFragmentCreate() {
        boolean res = super.onFragmentCreate();
        AIController.getInstance(currentAccount).onBecomeActive();
        return res;
    }
}
