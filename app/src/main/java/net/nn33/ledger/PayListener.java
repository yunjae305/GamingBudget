package net.nn33.ledger;

import android.app.Notification;
import android.content.ComponentName;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import java.util.regex.Pattern;

/**
 * 카드사·은행·페이 앱 푸시와 결제 문자 알림을 감지해 대기열에 넣는다.
 * 여기서는 원문만 모으고, 금액·가맹점·카테고리 해석은 앱 화면(index.html)의 파서가 한다.
 * 결제로 보이지 않는 알림은 저장하지 않고 바로 버린다 — 알림 내용은 이 기기 밖으로 나가지 않는다.
 */
public class PayListener extends NotificationListenerService {

    private static final Pattern AMOUNT = Pattern.compile("[0-9][0-9,]{2,}\\s*원");
    private static final Pattern PAYWORD = Pattern.compile("승인|결제|사용|출금|입금|이체|체크카드|신용카드");
    /** 광고·청구서·예정 안내처럼 실제 결제가 아닌 것 */
    private static final Pattern NOISE = Pattern.compile(
        "\\(광고\\)|광고\\)|수신거부|이벤트|쿠폰|결제 ?예정|출금 ?예정|납부 ?예정|청구 ?금액|명세서|이용대금|이용금액");

    private static volatile boolean connected = false;

    static boolean isConnected() {
        return connected;
    }

    @Override
    public void onListenerConnected() {
        connected = true;
    }

    /** 삼성 절전 등으로 끊기면 다시 붙여 달라고 한다 */
    @Override
    public void onListenerDisconnected() {
        connected = false;
        try {
            requestRebind(new ComponentName(this, PayListener.class));
        } catch (Exception ignored) {
        }
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            if (sbn == null || getPackageName().equals(sbn.getPackageName())) return;
            Notification n = sbn.getNotification();
            if (n == null) return;
            if ((n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;

            Bundle ex = n.extras;
            if (ex == null) return;
            CharSequence title = ex.getCharSequence(Notification.EXTRA_TITLE);
            CharSequence big = ex.getCharSequence(Notification.EXTRA_BIG_TEXT);
            CharSequence text = ex.getCharSequence(Notification.EXTRA_TEXT);

            String body = big != null ? big.toString() : (text != null ? text.toString() : "");
            String all = (title != null ? title + "\n" : "") + body;
            if (all.length() > 600) all = all.substring(0, 600);

            if (!AMOUNT.matcher(all).find()) return;
            if (!PAYWORD.matcher(all).find()) return;
            if (NOISE.matcher(all).find()) return;

            PendingStore.add(this, sbn.getPackageName(), all, sbn.getPostTime());
        } catch (Exception ignored) {
        }
    }
}
