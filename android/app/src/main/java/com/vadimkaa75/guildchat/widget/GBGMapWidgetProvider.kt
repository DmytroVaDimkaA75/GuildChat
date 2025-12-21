package com.vadimkaa75.guildchat.widgets

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews
import com.vadimkaa75.guildchat.R

class GBGMapWidgetProvider : AppWidgetProvider() {

  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray
  ) {
    for (appWidgetId in appWidgetIds) {
      val views = RemoteViews(context.packageName, R.layout.widget_gbg_map)
      views.setTextViewText(R.id.widgetTitle, "ПБГ • Мапа")
      views.setTextViewText(R.id.widgetLine1, "Тест: тут буде міні-мапа")
      views.setTextViewText(R.id.widgetLine2, "та статус секторів")
      views.setTextViewText(R.id.widgetLine3, "...")
      appWidgetManager.updateAppWidget(appWidgetId, views)
    }
  }
}
