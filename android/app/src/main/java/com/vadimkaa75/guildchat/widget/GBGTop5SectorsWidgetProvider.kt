package com.vadimkaa75.guildchat.widgets

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews
import com.vadimkaa75.guildchat.R

class GBGTop5SectorsWidgetProvider : AppWidgetProvider() {

  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray
  ) {
    for (appWidgetId in appWidgetIds) {
      val views = RemoteViews(context.packageName, R.layout.widget_gbg_top5_sectors)
      views.setTextViewText(R.id.widgetTitle, "ПБГ • ТОП-5 секторів")
      views.setTextViewText(R.id.widgetLine1, "1) Sector A1 • 02:15")
      views.setTextViewText(R.id.widgetLine2, "2) Sector B3 • 05:40")
      views.setTextViewText(R.id.widgetLine3, "3) Sector C2 • 09:10")
      appWidgetManager.updateAppWidget(appWidgetId, views)
    }
  }
}
