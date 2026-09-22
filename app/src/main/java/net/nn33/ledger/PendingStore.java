package net.nn33.ledger;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

/** 감지한 결제 알림 원문을 앱이 열릴 때까지 보관한다. */
final class PendingStore {
    private static final String PREF = "pay_pending";
    private static final String KEY = "items";
    /** 이미 처리한 알림 표식. 대기열을 비워도 남아서 재스캔 때 같은 알림이 두 번 들어가지 않게 한다. */
    private static final String SEEN = "seen";
    /** 진단용 최근 기록 — 어디서 걸렸는지 폰에서 눈으로 보려고 남긴다 */
    private static final String LOG = "log";
    private static final String SAW_AT = "sawAt";
    private static final String SAW_N = "sawN";

    private static final int MAX = 200;
    private static final int MAX_SEEN = 300;
    private static final int MAX_LOG = 40;
    private static final long SEEN_KEEP = 3 * 24 * 60 * 60 * 1000L;

    private PendingStore() {}

    private static SharedPreferences pref(Context c) {
        return c.getSharedPreferences(PREF, Context.MODE_PRIVATE);
    }

    /** 결제든 아니든 알림을 하나 들여다봤다는 표시. 감지 서비스가 살아 있는지 보는 용도. */
    static synchronized void touch(Context c) {
        SharedPreferences sp = pref(c);
        sp.edit().putLong(SAW_AT, System.currentTimeMillis())
                 .putInt(SAW_N, sp.getInt(SAW_N, 0) + 1).apply();
    }

    static synchronized void add(Context c, String pkg, String text, long time, String how) {
        SharedPreferences sp = pref(c);
        try {
            if (alreadySeen(sp, pkg, text, time)) return;
            JSONArray arr = new JSONArray(sp.getString(KEY, "[]"));
            JSONObject o = new JSONObject();
            o.put("pkg", pkg);
            o.put("text", text);
            o.put("time", time);
            arr.put(o);
            while (arr.length() > MAX) arr.remove(0);
            sp.edit().putString(KEY, arr.toString()).apply();
            markSeen(sp, pkg, text, time);
            log(c, pkg, text, time, how == null ? "대기열" : how);
        } catch (Exception ignored) {
        }
    }

    /** 대기열에 넣지 않고 진단에만 남긴다 (걸러진 알림) */
    static synchronized void note(Context c, String pkg, String text, long time, String why) {
        SharedPreferences sp = pref(c);
        try {
            if (alreadySeen(sp, pkg, text, time)) return;
            markSeen(sp, pkg, text, time);
            log(c, pkg, text, time, why);
        } catch (Exception ignored) {
        }
    }

    /**
     * 같은 알림을 이미 처리했는지 본다.
     * ① 완전히 같은 알림(앱·게시시각·문구) ② 1분 안에 올라온 똑같은 문구(알림 갱신 재게시).
     * 금액이 같은 별개의 결제는 게시 시각이 다르므로 그대로 통과한다.
     */
    private static boolean alreadySeen(SharedPreferences sp, String pkg, String text, long time) {
        try {
            JSONArray seen = new JSONArray(sp.getString(SEEN, "[]"));
            int h = text.hashCode();
            String k = pkg + "|" + time + "|" + h;
            for (int i = 0; i < seen.length(); i++) {
                JSONObject o = seen.getJSONObject(i);
                if (k.equals(o.optString("k"))) return true;
                if (o.optInt("h") == h && Math.abs(o.optLong("t") - time) < 60_000) return true;
            }
        } catch (Exception ignored) {
        }
        return false;
    }

    private static void markSeen(SharedPreferences sp, String pkg, String text, long time) {
        try {
            JSONArray seen = new JSONArray(sp.getString(SEEN, "[]"));
            JSONArray keep = new JSONArray();
            long cut = System.currentTimeMillis() - SEEN_KEEP;
            for (int i = 0; i < seen.length(); i++) {
                JSONObject o = seen.getJSONObject(i);
                if (o.optLong("t") >= cut) keep.put(o);
            }
            JSONObject o = new JSONObject();
            o.put("k", pkg + "|" + time + "|" + text.hashCode());
            o.put("h", text.hashCode());
            o.put("t", time);
            keep.put(o);
            while (keep.length() > MAX_SEEN) keep.remove(0);
            sp.edit().putString(SEEN, keep.toString()).apply();
        } catch (Exception ignored) {
        }
    }

    /** 진단 기록 한 줄. 이 폰 안에만 남고 밖으로 나가지 않는다. */
    static synchronized void log(Context c, String pkg, String text, long time, String res) {
        SharedPreferences sp = pref(c);
        try {
            JSONArray arr = new JSONArray(sp.getString(LOG, "[]"));
            JSONObject o = new JSONObject();
            o.put("pkg", pkg == null ? "" : pkg);
            o.put("text", text == null ? "" : (text.length() > 200 ? text.substring(0, 200) : text));
            o.put("time", time);
            o.put("res", res);
            arr.put(o);
            while (arr.length() > MAX_LOG) arr.remove(0);
            sp.edit().putString(LOG, arr.toString()).apply();
        } catch (Exception ignored) {
        }
    }

    static synchronized String logJson(Context c) {
        return pref(c).getString(LOG, "[]");
    }

    static synchronized void clearLog(Context c) {
        pref(c).edit().putString(LOG, "[]").apply();
    }

    /** 감지 서비스가 알림을 보고 있는지 요약 — {sawAt, sawN, queued} */
    static synchronized String statsJson(Context c) {
        SharedPreferences sp = pref(c);
        int queued = 0;
        try {
            queued = new JSONArray(sp.getString(KEY, "[]")).length();
        } catch (Exception ignored) {
        }
        try {
            JSONObject o = new JSONObject();
            o.put("sawAt", sp.getLong(SAW_AT, 0));
            o.put("sawN", sp.getInt(SAW_N, 0));
            o.put("queued", queued);
            return o.toString();
        } catch (Exception e) {
            return "{}";
        }
    }

    /** 쌓인 알림을 모두 꺼내고 비운다. */
    static synchronized String takeAll(Context c) {
        SharedPreferences sp = pref(c);
        String v = sp.getString(KEY, "[]");
        sp.edit().putString(KEY, "[]").apply();
        return v;
    }
}
