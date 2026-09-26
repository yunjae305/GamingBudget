package net.nn33.ledger;

import android.app.Notification;
import android.content.ComponentName;
import android.os.Bundle;
import android.os.Parcelable;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import java.util.regex.Pattern;

/**
 * 카드사·은행·페이 앱 푸시와 결제 문자 알림을 감지해 대기열에 넣는다.
 * 여기서는 원문만 모으고, 금액·가맹점·카테고리 해석은 앱 화면(index.html)의 파서가 한다.
 * 결제로 보이지 않는 알림은 저장하지 않고 바로 버린다 — 알림 내용은 이 기기 밖으로 나가지 않는다.
 */
public class PayListener extends NotificationListenerService {

    /** "151,600원" 또는 "₩151,600"(삼성 월렛은 ₩ 앞머리를 쓴다 — 2026-09-26 실기기 확인) */
    private static final Pattern AMOUNT = Pattern.compile("[0-9][0-9,]{2,}\\s*원|₩\\s*[0-9][0-9,]{2,}");
    private static final Pattern PAYWORD = Pattern.compile("승인|결제|사용|출금|입금|이체|체크카드|신용카드");
    /** 광고·청구서·예정 안내처럼 실제 결제가 아닌 것 */
    private static final Pattern NOISE = Pattern.compile(
        "\\(광고\\)|광고\\)|수신거부|이벤트|쿠폰|결제 ?예정|출금 ?예정|납부 ?예정|청구 ?금액|명세서|이용대금|이용금액");

    private static volatile boolean connected = false;
    /** 상태 바에 떠 있는 알림을 다시 훑을 때 쓴다 (절전으로 끊겼던 동안 놓친 것 회수) */
    private static volatile PayListener instance = null;

    static boolean isConnected() {
        return connected;
    }

    @Override
    public void onListenerConnected() {
        connected = true;
        instance = this;
        // 붙는 순간 이미 떠 있는 알림부터 훑는다 — 끊겨 있던 동안 온 결제를 여기서 줍는다
        scanActive();
    }

    /** 삼성 절전 등으로 끊기면 다시 붙여 달라고 한다 */
    @Override
    public void onListenerDisconnected() {
        connected = false;
        instance = null;
        try {
            requestRebind(new ComponentName(this, PayListener.class));
        } catch (Exception ignored) {
        }
    }

    /**
     * 지금 상태 바에 떠 있는 알림을 모두 다시 검사한다.
     * 이미 처리한 알림은 PendingStore 가 키로 걸러 내므로 중복으로 들어가지 않는다.
     * 앱이 앞으로 올라올 때(MainActivity.onResume)와 서비스가 붙을 때 부른다.
     */
    static void rescan() {
        PayListener s = instance;
        if (s != null) s.scanActive();
    }

    private void scanActive() {
        try {
            StatusBarNotification[] all = getActiveNotifications();
            if (all == null) return;
            for (StatusBarNotification sbn : all) handle(sbn, false);
        } catch (Exception ignored) {
        }
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        handle(sbn, true);
    }

    private void handle(StatusBarNotification sbn, boolean live) {
        try {
            if (sbn == null || getPackageName().equals(sbn.getPackageName())) return;
            // 상주 알림(잔액 표시 같은 것)은 결제 알림이 아니고, 재스캔 때마다 다시 걸린다
            if (sbn.isOngoing()) return;
            Notification n = sbn.getNotification();
            if (n == null) return;
            if ((n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;

            String all = collectText(n);
            if (all.isEmpty()) return;
            if (all.length() > 600) all = all.substring(0, 600);
            // 실시간으로 올라온 알림만 센다 — 재스캔은 같은 알림을 다시 보는 것이라 빼야 한다
            if (live) PendingStore.touch(this);

            String drop = null;
            if (!AMOUNT.matcher(all).find()) drop = "금액 없음";
            else if (!PAYWORD.matcher(all).find()) drop = "결제 단어 없음";
            else if (NOISE.matcher(all).find()) drop = "광고·안내";

            if (drop != null) {
                // 금액이 있는데 걸린 것만 진단에 남긴다 — 관계없는 알림까지 쌓아 두지 않는다
                if (!"금액 없음".equals(drop)) {
                    PendingStore.note(this, sbn.getPackageName(), all, sbn.getPostTime(), drop);
                }
                return;
            }

            PendingStore.add(this, sbn.getPackageName(), all, sbn.getPostTime(),
                             live ? "대기열" : "대기열(재스캔)");
        } catch (Exception ignored) {
        }
    }

    /**
     * 알림에서 글자가 들어 있을 만한 곳을 모두 긁는다.
     * 큰 글씨(BigText)만 보면 문자 앱을 놓친다 — 삼성·구글 메시지는 MessagingStyle 이라
     * 본문이 EXTRA_MESSAGES 에 들어가고, 안 읽은 문자가 여러 건이면 EXTRA_TEXT 는
     * "새 메시지 2개" 같은 요약으로 바뀐다.
     */
    private static String collectText(Notification n) {
        Bundle ex = n.extras;
        StringBuilder sb = new StringBuilder();
        if (ex != null) {
            appendCs(sb, ex.getCharSequence(Notification.EXTRA_TITLE));
            appendCs(sb, ex.getCharSequence(Notification.EXTRA_TITLE_BIG));
            appendCs(sb, ex.getCharSequence(Notification.EXTRA_BIG_TEXT));
            appendCs(sb, ex.getCharSequence(Notification.EXTRA_TEXT));
            appendCs(sb, ex.getCharSequence(Notification.EXTRA_SUB_TEXT));
            appendCs(sb, ex.getCharSequence(Notification.EXTRA_INFO_TEXT));
            appendCs(sb, ex.getCharSequence(Notification.EXTRA_SUMMARY_TEXT));

            CharSequence[] lines = ex.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);
            if (lines != null) for (CharSequence l : lines) appendCs(sb, l);

            // MessagingStyle — 문자 앱 알림의 본문이 여기 들어 있다
            appendMessages(sb, ex.getParcelableArray(Notification.EXTRA_MESSAGES));
            appendMessages(sb, ex.getParcelableArray(Notification.EXTRA_HISTORIC_MESSAGES));
        }
        if (sb.length() == 0) appendCs(sb, n.tickerText);
        return sb.toString();
    }

    private static void appendMessages(StringBuilder sb, Parcelable[] msgs) {
        if (msgs == null) return;
        for (Parcelable p : msgs) {
            if (!(p instanceof Bundle)) continue;
            Bundle b = (Bundle) p;
            appendCs(sb, b.getCharSequence("text"));
        }
    }

    /** 같은 글이 여러 칸에 중복으로 들어 있는 경우가 흔해서, 이미 담은 말은 건너뛴다 */
    private static void appendCs(StringBuilder sb, CharSequence cs) {
        if (cs == null) return;
        String s = cs.toString().trim();
        if (s.isEmpty()) return;
        if (sb.indexOf(s) >= 0) return;
        if (sb.length() > 0) sb.append('\n');
        sb.append(s);
    }
}
