package com.vadimkaa75.guildchat.widgets

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context

object GbgWidgetUpdater {
  fun refreshAll(context: Context) {
    val appWidgetManager = AppWidgetManager.getInstance(context)

    val top5Ids = appWidgetManager.getAppWidgetIds(
      ComponentName(context, GBGTop5SectorsWidgetProvider::class.java)
    )
    GBGTop5SectorsWidgetProvider.updateWidgets(context, appWidgetManager, top5Ids)

    val mapIds = appWidgetManager.getAppWidgetIds(
      ComponentName(context, GBGMapWidgetProvider::class.java)
    )
    GBGMapWidgetProvider.updateWidgets(context, appWidgetManager, mapIds)
  }
}
