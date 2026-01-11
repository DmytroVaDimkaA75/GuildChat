package com.vadimkaa75.guildchat.widgets

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

object GbgWidgetRefreshScheduler {
  private const val UNIQUE_WORK_NAME = "GbgWidgetRefreshWork"

  fun ensureScheduled(context: Context) {
    val constraints = Constraints.Builder()
      .setRequiredNetworkType(NetworkType.CONNECTED)
      .build()

    val request = PeriodicWorkRequestBuilder<GbgWidgetRefreshWorker>(15, TimeUnit.MINUTES)
      .setConstraints(constraints)
      .build()

    WorkManager.getInstance(context)
      .enqueueUniquePeriodicWork(UNIQUE_WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, request)
  }

  fun enqueueImmediate(context: Context) {
    val constraints = Constraints.Builder()
      .setRequiredNetworkType(NetworkType.CONNECTED)
      .build()

    val request = OneTimeWorkRequestBuilder<GbgWidgetRefreshWorker>()
      .setConstraints(constraints)
      .build()

    WorkManager.getInstance(context)
      .enqueueUniqueWork("${UNIQUE_WORK_NAME}_now", ExistingWorkPolicy.REPLACE, request)
  }
}
