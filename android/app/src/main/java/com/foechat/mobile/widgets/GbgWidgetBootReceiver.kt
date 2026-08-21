package com.foechat.mobile.widgets

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class GbgWidgetBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    GbgWidgetRefreshScheduler.ensureScheduled(context)
    GbgWidgetRefreshScheduler.enqueueImmediate(context)
  }
}
