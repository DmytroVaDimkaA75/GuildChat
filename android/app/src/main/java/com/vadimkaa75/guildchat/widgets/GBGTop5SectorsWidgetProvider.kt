package com.vadimkaa75.guildchat.widgets

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
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
    fun render(context: Context, views: RemoteViews) {
      views.setTextViewText(R.id.widgetTitle, "ПБГ • ТОП-5 секторів")

      val json = GbgWidgetPrefs.getNext5(context)
      val list = try { JSONArray(json) } catch (_: Throwable) { JSONArray() }

      val lines = ArrayList<String>()
      val nowSec = System.currentTimeMillis() / 1000L

      for (i in 0 until minOf(5, list.length())) {
        val obj = list.optJSONObject(i) ?: JSONObject()
        val sectorId = obj.optString("sectorId", "?")
        val openTime = obj.optLong("openTime", 0L)
        val army = obj.optString("army", "")
        val bonusValue = obj.optInt("bonusValue", 100)

        val eta = if (openTime > 0) {
          val diff = max(0L, openTime - nowSec)
          val hh = diff / 3600
          val mm = (diff % 3600) / 60
          String.format("%02d:%02d", hh, mm)
        } else "--:--"

        val armyShort = when (army.lowercase()) {
          "attack" -> "atk"
          "defense" -> "def"
          else -> ""
        }

        val armyPart = if (armyShort.isNotEmpty()) " • $armyShort" else ""
        val bonusPart = if (bonusValue != 100) " • $bonusValue%" else ""

        lines.add("${i + 1}) $sectorId • $eta$armyPart$bonusPart")
      }

      while (lines.size < 5) lines.add("${lines.size + 1}) ...")

      views.setTextViewText(R.id.widgetLine1, lines[0])
      views.setTextViewText(R.id.widgetLine2, lines[1])
      views.setTextViewText(R.id.widgetLine3, lines[2])
      views.setTextViewText(R.id.widgetLine4, lines[3])
      views.setTextViewText(R.id.widgetLine5, lines[4])
    }
  }
}
