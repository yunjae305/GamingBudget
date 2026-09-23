package net.nn33.ledger;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.nio.charset.StandardCharsets;
import java.text.NumberFormat;
import java.util.Calendar;
import java.util.Locale;

/**
 * 하루 예산 알림. 아침엔 "오늘 쓸 수 있는 돈", 저녁엔 "오늘 남은 돈"을 알림으로 띄운다.
 *
 * 숫자는 화면이 저장할 때마다 files/mirror.json 에 두는 전체 기록 복사본에서 읽는다 — 화면(WebView)의
 * localStorage 는 네이티브가 못 읽고, 알림은 앱이 꺼져 있을 때 울려야 하기 때문이다. 계산은 화면의
 * dailyBudget() 과 같다: (월 예산 − 오늘 전까지 지출) ÷ 오늘 포함 남은 날.
 *
 * 알람은 AlarmManager.setAndAllowWhileIdle 로 다음 한 번만 걸고, 울릴 때 다음 날 것을 다시 건다.
 * 정확한 시각 권한(SCHEDULE_EXACT_ALARM)이 필요 없는 대신 절전 중엔 몇 분 늦을 수 있다.
 */
final class Reminders {
    static final String PREF = "reminders";
    static final String CHANNEL = "daily_budget";
    static final String ACT_MORNING = "net.nn33.ledger.REMIND_MORNING";
    static final String ACT_EVENING = "net.nn33.ledger.REMIND_EVENING";
    private static final int REQ_MORNING = 11, REQ_EVENING = 12, NOTIF_ID = 7;

    private Reminders() {}

    private static SharedPreferences pref(Context c) {
        return c.getSharedPreferences(PREF, Context.MODE_PRIVATE);
    }

    static boolean isOn(Context c) { return pref(c).getBoolean("on", false); }
    static String morning(Context c) { return pref(c).getString("morning", "08:00"); }
    static String evening(Context c) { return pref(c).getString("evening", "21:00"); }

    /** 화면 설정용 상태 */
    static String stateJson(Context c) {
        try {
            JSONObject o = new JSONObject();
            o.put("on", isOn(c));
            o.put("morning", morning(c));
            o.put("evening", evening(c));
            o.put("granted", NotificationManagerCompat.from(c).areNotificationsEnabled());
            o.put("needsPermission", Build.VERSION.SDK_INT >= 33);
            return o.toString();
        } catch (Exception e) {
            return "{}";
        }
    }

    static void set(Context c, boolean on, String morning, String evening) {
        pref(c).edit().putBoolean("on", on)
                .putString("morning", valid(morning) ? morning : "08:00")
                .putString("evening", valid(evening) ? evening : "21:00").apply();
        schedule(c);
    }

    private static boolean valid(String hhmm) {
        return hhmm != null && hhmm.matches("^([01]\\d|2[0-3]):[0-5]\\d$");
    }

    /** 켜져 있으면 아침·저녁 다음 회차를 건다. 꺼져 있으면 둘 다 취소. 부팅·앱 시작 때도 불러 재정비한다. */
    static void schedule(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        PendingIntent m = alarmIntent(c, ACT_MORNING, REQ_MORNING);
        PendingIntent e = alarmIntent(c, ACT_EVENING, REQ_EVENING);
        am.cancel(m);
        am.cancel(e);
        if (!isOn(c)) return;
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next(morning(c)), m);
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next(evening(c)), e);
    }

    private static PendingIntent alarmIntent(Context c, String action, int req) {
        Intent i = new Intent(c, ReminderReceiver.class).setAction(action);
        return PendingIntent.getBroadcast(c, req, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** 오늘 그 시각이 아직 안 지났으면 오늘, 지났으면 내일 */
    private static long next(String hhmm) {
        Calendar cal = Calendar.getInstance();
        int h = 8, mi = 0;
        try {
            h = Integer.parseInt(hhmm.substring(0, 2));
            mi = Integer.parseInt(hhmm.substring(3, 5));
        } catch (Exception ignored) {
        }
        cal.set(Calendar.HOUR_OF_DAY, h);
        cal.set(Calendar.MINUTE, mi);
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        if (cal.getTimeInMillis() <= System.currentTimeMillis() + 1000) cal.add(Calendar.DAY_OF_YEAR, 1);
        return cal.getTimeInMillis();
    }

    /** 알람이 울렸다: 알림을 띄우고 다음 회차를 다시 건다 */
    static void fire(Context c, String action) {
        if (!isOn(c)) return;
        boolean evening = ACT_EVENING.equals(action);
        String[] msg = message(c, evening);
        if (msg != null) post(c, msg[0], msg[1]);
        schedule(c);
    }

    /** 설정 화면의 "지금 보내 보기" */
    static void postNow(Context c, String title, String text) {
        post(c, title, text);
    }

    private static void post(Context c, String title, String text) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "하루 예산 알림", NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription("아침엔 오늘 쓸 수 있는 돈, 저녁엔 남은 돈");
            nm.createNotificationChannel(ch);
        }
        Intent open = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent tap = PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification n = new NotificationCompat.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_notif)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
                .setContentIntent(tap)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .build();
        try {
            nm.notify(NOTIF_ID, n);
        } catch (SecurityException ignored) {
            // 알림 권한(POST_NOTIFICATIONS)이 없으면 조용히 넘어간다
        }
    }

    /** {제목, 본문}. 예산이 없거나 기록을 못 읽으면 null — 그날은 알림을 띄우지 않는다. */
    static String[] message(Context c, boolean evening) {
        Daily d = compute(c);
        if (d == null) return null;
        NumberFormat nf = NumberFormat.getInstance(Locale.KOREA);
        if (!evening) {
            return new String[]{
                "오늘 쓸 수 있는 돈 " + nf.format(Math.max(0, d.rest)) + "원",
                "이달 남은 예산 " + nf.format(Math.max(0, d.monthRest)) + "원 · " + d.left + "일 남음"
            };
        }
        if (d.rest >= 0) {
            return new String[]{
                "오늘 " + nf.format(d.rest) + "원 남았어요",
                "하루 기준 " + nf.format(d.allow) + "원 중 " + nf.format(d.spent) + "원 썼어요. 남은 돈은 내일로 넘어가요."
            };
        }
        return new String[]{
            "오늘 " + nf.format(-d.rest) + "원 넘게 썼어요",
            "하루 기준 " + nf.format(d.allow) + "원, 오늘 " + nf.format(d.spent) + "원. 내일 쓸 수 있는 돈이 조금 줄어요."
        };
    }

    static final class Daily {
        long allow, spent, rest, monthRest;
        int left;
    }

    /** mirror.json → 오늘 예산. 화면의 dailyBudget() 과 같은 규칙. */
    static Daily compute(Context c) {
        try {
            File f = new File(c.getFilesDir(), "mirror.json");
            if (!f.exists()) return null;
            byte[] buf = new byte[(int) f.length()];
            try (FileInputStream in = new FileInputStream(f)) {
                int off = 0, n;
                while (off < buf.length && (n = in.read(buf, off, buf.length - off)) > 0) off += n;
            }
            JSONObject data = new JSONObject(new String(buf, StandardCharsets.UTF_8)).getJSONObject("data");
            String cfgS = data.optString("gb:config/main", "");
            if (cfgS.isEmpty()) return null;
            JSONObject budget = new JSONObject(cfgS).optJSONObject("budget");
            long total = budget == null ? 0 : budget.optLong("total", 0);
            if (total <= 0) return null;

            Calendar cal = Calendar.getInstance();
            int y = cal.get(Calendar.YEAR), mo = cal.get(Calendar.MONTH) + 1, day = cal.get(Calendar.DAY_OF_MONTH);
            int days = cal.getActualMaximum(Calendar.DAY_OF_MONTH);
            String ym = String.format(Locale.US, "%04d-%02d", y, mo);
            String today = String.format(Locale.US, "%s-%02d", ym, day);

            long before = 0, spent = 0;
            String monthS = data.optString("gb:months/" + ym, "");
            if (!monthS.isEmpty()) {
                JSONArray txs = new JSONObject(monthS).optJSONArray("txs");
                if (txs != null) {
                    for (int i = 0; i < txs.length(); i++) {
                        JSONObject t = txs.optJSONObject(i);
                        if (t == null || !"expense".equals(t.optString("type"))) continue;
                        String d = t.optString("d", "");
                        long a = t.optLong("amount", 0);
                        if (d.compareTo(today) < 0) before += a;
                        else if (d.equals(today)) spent += a;
                    }
                }
            }
            Daily r = new Daily();
            r.left = days - day + 1;
            r.allow = (long) Math.floor((double) (total - before) / r.left);
            r.spent = spent;
            r.rest = r.allow - spent;
            r.monthRest = total - before - spent;
            return r;
        } catch (Exception e) {
            return null;
        }
    }
}
