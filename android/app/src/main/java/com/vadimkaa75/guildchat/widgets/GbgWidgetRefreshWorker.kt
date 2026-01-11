package com.vadimkaa75.guildchat.widgets

import android.content.Context
import android.content.Intent
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.facebook.react.HeadlessJsTaskService

class GbgWidgetRefreshWorker(appContext: Context, params: WorkerParameters) : Worker(appContext, params) {
  override fun doWork(): Result {
    val intent = Intent(applicationContext, GbgWidgetRefreshService::class.java)
    applicationContext.startService(intent)
    HeadlessJsTaskService.acquireWakeLockNow(applicationContext)
    return Result.success()
  }
}
