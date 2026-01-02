package com.vadimkaa75.guildchat.widgets

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.graphics.Color
import android.widget.RemoteViews
import com.vadimkaa75.guildchat.R
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.max

class GBGTop5SectorsWidgetProvider : AppWidgetProvider() {

  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray
  ) {
    updateWidgets(context, appWidgetManager, appWidgetIds)
  }

  companion object {
    private fun formatRemaining(totalSeconds: Long): String {
      val clamped = max(0, totalSeconds)
      val h = clamped / 3600
      val m = (clamped % 3600) / 60
      val s = clamped % 60
      return String.format(Locale.getDefault(), "%02d:%02d:%02d", h, m, s)
    }

    private fun formatUpdatedAt(ts: Long?): String {
      if (ts == null || ts <= 0) return "Оновлено: --:--"
      val sdf = SimpleDateFormat("HH:mm:ss", Locale.getDefault())
      return "Оновлено: ${sdf.format(Date(ts))}"
    }

    private fun armyColor(army: String): Int {
      return when (army.lowercase(Locale.getDefault())) {
        "attack" -> Color.parseColor("#e74c3c")
        "defense" -> Color.parseColor("#3498db")
        else -> Color.WHITE
      }
    }

    private fun bindLine(views: RemoteViews, viewId: Int, index: Int, item: Next5Item?) {
      if (item == null) {
        views.setTextViewText(viewId, "")
        views.setTextColor(viewId, Color.WHITE)
        return
      }

      val line = "${index + 1}) ${item.sectorId} • ${formatRemaining(item.remainingSeconds)} • Бонус: ${item.bonusValue}"
      views.setTextViewText(viewId, line)
      views.setTextColor(viewId, armyColor(item.army))
    }

    fun updateWidgets(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray? = null) {
      val ids = appWidgetIds ?: appWidgetManager.getAppWidgetIds(
        ComponentName(context, GBGTop5SectorsWidgetProvider::class.java)
      )
      if (ids.isEmpty()) return

      val state = GbgWidgetData.readNext5(context)

      ids.forEach { id ->
        val views = RemoteViews(context.packageName, R.layout.widget_gbg_top5_sectors)
        views.setTextViewText(R.id.widgetTitle, "ПБГ • ТОП-5 секторів")

        val items = state.items.take(5)
        val padded = (items + List(5 - items.size) { null }).take(5)

        bindLine(views, R.id.widgetLine1, 0, padded[0])
        bindLine(views, R.id.widgetLine2, 1, padded[1])
        bindLine(views, R.id.widgetLine3, 2, padded[2])
        bindLine(views, R.id.widgetLine4, 3, padded[3])
        bindLine(views, R.id.widgetLine5, 4, padded[4])

        if (items.isEmpty()) {
          views.setTextViewText(R.id.widgetLine1, "Найближчим часом немає секторів")
          views.setTextColor(R.id.widgetLine1, Color.LTGRAY)
        }

        views.setTextViewText(R.id.widgetUpdatedAt, formatUpdatedAt(state.updatedAt))
        appWidgetManager.updateAppWidget(id, views)
      }
    }
  }
}
