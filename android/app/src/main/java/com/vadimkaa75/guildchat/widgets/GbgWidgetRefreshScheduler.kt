package com.vadimkaa75.guildchat.widgets

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

object GbgWidgetRefreshScheduler {
  private const val UNIQUE_PERIODIC_WORK_NAME = "GbgWidgetRefreshWork"
  private const val UNIQUE_IMMEDIATE_WORK_NAME = "GbgWidgetRefreshWork_now"

  fun hasWidgets(context: Context): Boolean {
    val manager = AppWidgetManager.getInstance(context)
    val top5Ids = manager.getAppWidgetIds(
      ComponentName(context, GBGTop5SectorsWidgetProvider::class.java)
    )
    val mapIds = manager.getAppWidgetIds(
      ComponentName(context, GBGMapWidgetProvider::class.java)
    )
    return top5Ids.isNotEmpty() || mapIds.isNotEmpty()
  }

  fun ensureScheduled(context: Context) {
    val appContext = context.applicationContext
    if (
      !hasWidgets(appContext) ||
      GbgWidgetPrefs.getGuildId(appContext).isNullOrBlank()
    ) {
      cancel(appContext)
      return
    }

    val constraints = Constraints.Builder()
      .setRequiredNetworkType(NetworkType.CONNECTED)
      .build()

    val request = PeriodicWorkRequestBuilder<GbgWidgetRefreshWorker>(
      15,
      TimeUnit.MINUTES,
      5,
      TimeUnit.MINUTES
    )
      .setConstraints(constraints)
      .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
      .build()

    WorkManager.getInstance(appContext)
      .enqueueUniquePeriodicWork(
        UNIQUE_PERIODIC_WORK_NAME,
        ExistingPeriodicWorkPolicy.UPDATE,
        request
      )
  }

  fun enqueueImmediate(context: Context) {
    val appContext = context.applicationContext
    if (
      !hasWidgets(appContext) ||
      GbgWidgetPrefs.getGuildId(appContext).isNullOrBlank()
    ) return

    val constraints = Constraints.Builder()
      .setRequiredNetworkType(NetworkType.CONNECTED)
      .build()

    val request = OneTimeWorkRequestBuilder<GbgWidgetRefreshWorker>()
      .setConstraints(constraints)
      .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
      .build()

    WorkManager.getInstance(appContext)
      .enqueueUniqueWork(
        UNIQUE_IMMEDIATE_WORK_NAME,
        ExistingWorkPolicy.REPLACE,
        request
      )
  }

  fun cancelIfNoWidgets(context: Context) {
    if (!hasWidgets(context.applicationContext)) cancel(context.applicationContext)
  }

  fun cancelAll(context: Context) {
    cancel(context.applicationContext)
  }

  private fun cancel(context: Context) {
    WorkManager.getInstance(context).apply {
      cancelUniqueWork(UNIQUE_PERIODIC_WORK_NAME)
      cancelUniqueWork(UNIQUE_IMMEDIATE_WORK_NAME)
    }
  }
}
