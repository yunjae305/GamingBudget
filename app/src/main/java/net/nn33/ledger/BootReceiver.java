package net.nn33.ledger;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** 재부팅하면 알람이 전부 사라진다 — 켜져 있던 하루 예산 알림을 다시 건다. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent != null && Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) Reminders.schedule(context);
    }
}
