package net.nn33.ledger;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** 하루 예산 알람이 울리면 알림을 띄우고 다음 회차를 다시 건다. 앱 안에서만 부르는 리시버(exported=false). */
public class ReminderReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String a = intent.getAction();
        if (Reminders.ACT_MORNING.equals(a) || Reminders.ACT_EVENING.equals(a)) Reminders.fire(context, a);
    }
}
