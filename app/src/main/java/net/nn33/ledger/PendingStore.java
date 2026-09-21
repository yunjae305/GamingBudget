package net.nn33.ledger;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

/** 감지한 결제 알림 원문을 앱이 열릴 때까지 보관한다. */
final class PendingStore {
    private static final String PREF = "pay_pending";
    private static final String KEY = "items";
    private static final int MAX = 200;

    private PendingStore() {}

    static synchronized void add(Context c, String pkg, String text, long time) {
        SharedPreferences sp = c.getSharedPreferences(PREF, Context.MODE_PRIVATE);
        try {
            JSONArray arr = new JSONArray(sp.getString(KEY, "[]"));
            // 같은 알림이 갱신되며 다시 올라오는 경우만 거른다 (1분 안의 완전히 같은 문구)
            for (int i = Math.max(0, arr.length() - 10); i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                if (o.optString("text").equals(text) && Math.abs(o.optLong("time") - time) < 60_000) return;
            }
            JSONObject o = new JSONObject();
            o.put("pkg", pkg);
            o.put("text", text);
            o.put("time", time);
            arr.put(o);
            while (arr.length() > MAX) arr.remove(0);
            sp.edit().putString(KEY, arr.toString()).apply();
        } catch (Exception ignored) {
        }
    }

    /** 쌓인 알림을 모두 꺼내고 비운다. */
    static synchronized String takeAll(Context c) {
        SharedPreferences sp = c.getSharedPreferences(PREF, Context.MODE_PRIVATE);
        String v = sp.getString(KEY, "[]");
        sp.edit().putString(KEY, "[]").apply();
        return v;
    }
}
