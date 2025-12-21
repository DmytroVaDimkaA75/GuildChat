package com.vadimkaa75.guildchat.widgets

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews
import com.vadimkaa75.guildchat.R

class GBGRatingWidgetProvider : AppWidgetProvider() {

  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray
  ) {
    // Тестове наповнення: головне, щоб віджет з'явився і відображався
    for (appWidgetId in appWidgetIds) {
      val views = RemoteViews(context.packageName, R.layout.widget_gbg_rating)

      views.setTextViewText(R.id.widgetTitle, "ПБГ • Рейтинг")
      views.setTextViewText(R.id.widgetLine1, "Ліга: Diamond")
      views.setTextViewText(R.id.widgetLine2, "Місце: 12")
      views.setTextViewText(R.id.widgetLine3, "Очки: 3 456 789")

      appWidgetManager.updateAppWidget(appWidgetId, views)
    }
  }
}
