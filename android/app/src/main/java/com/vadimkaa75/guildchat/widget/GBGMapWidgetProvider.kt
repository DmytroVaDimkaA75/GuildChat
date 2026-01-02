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

class GBGMapWidgetProvider : AppWidgetProvider() {

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

    fun updateWidgets(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray? = null) {
      val ids = appWidgetIds ?: appWidgetManager.getAppWidgetIds(
        ComponentName(context, GBGMapWidgetProvider::class.java)
      )
      if (ids.isEmpty()) return

      val mapState = GbgWidgetData.readMapState(context)
      val nextState = GbgWidgetData.readNext5(context)
      val nearest = nextState.items.firstOrNull()
      val focus = mapState.sectorStaff.firstOrNull()

      val line1 = "Власні: ${mapState.ownCount} • Ворожі: ${mapState.enemyCount}"
      val line2 = "Нейтральні: ${mapState.neutralCount} • Штабів: ${mapState.staffCount}"
      val line3 = if (nearest != null) {
        "Найближчі: ${nearest.sectorId} • ${formatRemaining(nearest.remainingSeconds)}"
      } else {
        "Найближчі: —"
      }
      val line4 = "Фокус: ${focus ?: "—"}"

      ids.forEach { id ->
        val views = RemoteViews(context.packageName, R.layout.widget_gbg_map)
        views.setTextViewText(R.id.widgetTitle, "ПБГ • Мапа")
        views.setTextViewText(R.id.widgetLine1, line1)
        views.setTextViewText(R.id.widgetLine2, line2)
        views.setTextViewText(R.id.widgetLine3, line3)
        views.setTextViewText(R.id.widgetLine4, line4)
        views.setTextColor(R.id.widgetLine1, Color.WHITE)
        views.setTextColor(R.id.widgetLine2, Color.WHITE)
        views.setTextColor(R.id.widgetLine3, Color.WHITE)
        views.setTextColor(R.id.widgetLine4, Color.WHITE)
        views.setTextViewText(R.id.widgetUpdatedAt, formatUpdatedAt(mapState.updatedAt ?: nextState.updatedAt))
        appWidgetManager.updateAppWidget(id, views)
      }
    }
  }
}
