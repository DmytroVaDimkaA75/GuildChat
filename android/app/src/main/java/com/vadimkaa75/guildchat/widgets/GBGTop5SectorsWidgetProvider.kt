package com.vadimkaa75.guildchat.widgets

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.os.SystemClock
import android.view.View
import android.widget.RemoteViews
import com.vadimkaa75.guildchat.R
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.max

class GBGTop5SectorsWidgetProvider : AppWidgetProvider() {

  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    for (appWidgetId in appWidgetIds) {
      val views = RemoteViews(context.packageName, R.layout.widget_gbg_top5_sectors)
      render(context, views)
      appWidgetManager.updateAppWidget(appWidgetId, views)
    }
  }

  companion object {
    private const val COLOR_ATTACK = 0xFFE74C3C.toInt()
    private const val COLOR_DEFENSE = 0xFF3498DB.toInt()
    private const val COLOR_NEUTRAL = 0x66FFFFFF

    private data class RowViews(
      val indicatorId: Int,
      val sectorId: Int,
      val timerId: Int,
      val bonusId: Int
    )

    fun render(context: Context, views: RemoteViews) {
      views.setTextViewText(R.id.widgetTitle, "ПБГ • ТОП-5 секторів")

      val json = GbgWidgetPrefs.getNext5(context)
      val list = try { JSONArray(json) } catch (_: Throwable) { JSONArray() }

      val nowSec = System.currentTimeMillis() / 1000L
      val rows = listOf(
        RowViews(R.id.widgetIndicator1, R.id.widgetSector1, R.id.widgetTimer1, R.id.widgetBonus1),
        RowViews(R.id.widgetIndicator2, R.id.widgetSector2, R.id.widgetTimer2, R.id.widgetBonus2),
        RowViews(R.id.widgetIndicator3, R.id.widgetSector3, R.id.widgetTimer3, R.id.widgetBonus3),
        RowViews(R.id.widgetIndicator4, R.id.widgetSector4, R.id.widgetTimer4, R.id.widgetBonus4),
        RowViews(R.id.widgetIndicator5, R.id.widgetSector5, R.id.widgetTimer5, R.id.widgetBonus5)
      )

      for (i in rows.indices) {
        val obj = if (i < list.length()) list.optJSONObject(i) else JSONObject()
        val sectorId = obj?.optString("sectorId", "")?.ifBlank { "..." } ?: "..."
        val openTime = obj?.optLong("openTime", 0L) ?: 0L
        val army = obj?.optString("army", "") ?: ""
        val bonusValue = obj?.optInt("bonusValue", 100) ?: 100

        val armyColor = when (army.lowercase()) {
          "attack" -> COLOR_ATTACK
          "defense" -> COLOR_DEFENSE
          else -> COLOR_NEUTRAL
        }

        val diff = if (openTime > 0) max(0L, openTime - nowSec) else null
        val row = rows[i]

        views.setInt(row.indicatorId, "setBackgroundColor", armyColor)
        views.setTextViewText(row.sectorId, sectorId)
        views.setBoolean(row.timerId, "setCountDown", true)

        if (diff != null) {
          val base = SystemClock.elapsedRealtime() + diff * 1000
          views.setChronometer(row.timerId, base, "%s", true)
        } else {
          views.setChronometer(row.timerId, SystemClock.elapsedRealtime(), "%s", false)
          views.setTextViewText(row.timerId, "—:—:—")
        }

        if (bonusValue != 100) {
          views.setViewVisibility(row.bonusId, View.VISIBLE)
          views.setTextViewText(row.bonusId, "• ${bonusValue}%")
        } else {
          views.setViewVisibility(row.bonusId, View.INVISIBLE)
          views.setTextViewText(row.bonusId, "")
        }
      }
    }
  }
}
