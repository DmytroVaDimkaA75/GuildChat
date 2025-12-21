package com.vadimkaa75.guildchat.widgets

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews
import com.vadimkaa75.guildchat.R

class GBGGroupsWidgetProvider : AppWidgetProvider() {

  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray
  ) {
    for (appWidgetId in appWidgetIds) {
      val views = RemoteViews(context.packageName, R.layout.widget_gbg_groups)

      views.setTextViewText(R.id.widgetTitle, "ПБГ • Групи")
      views.setTextViewText(R.id.widgetLine1, "Група A: 7 гільдій")
      views.setTextViewText(R.id.widgetLine2, "Група B: 6 гільдій")
      views.setTextViewText(R.id.widgetLine3, "Група C: 5 гільдій")

      appWidgetManager.updateAppWidget(appWidgetId, views)
    }
  }
}
