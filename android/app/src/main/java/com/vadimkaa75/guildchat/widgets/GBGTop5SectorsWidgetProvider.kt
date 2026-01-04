package com.vadimkaa75.guildchat.widgets

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.os.SystemClock
import android.widget.RemoteViews
import com.vadimkaa75.guildchat.R
import org.json.JSONArray
import org.json.JSONObject

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

      for (i in 0 until 5) {
        val prefixId = when (i) {
          0 -> R.id.widgetPrefix1
          1 -> R.id.widgetPrefix2
          2 -> R.id.widgetPrefix3
          3 -> R.id.widgetPrefix4
          4 -> R.id.widgetPrefix5
          else -> R.id.widgetPrefix1
        }

        val chronoId = when (i) {
          0 -> R.id.widgetChrono1
          1 -> R.id.widgetChrono2
          2 -> R.id.widgetChrono3
          3 -> R.id.widgetChrono4
          4 -> R.id.widgetChrono5
          else -> R.id.widgetChrono1
        }

        val suffixId = when (i) {
          0 -> R.id.widgetSuffix1
          1 -> R.id.widgetSuffix2
          2 -> R.id.widgetSuffix3
          3 -> R.id.widgetSuffix4
          4 -> R.id.widgetSuffix5
          else -> R.id.widgetSuffix1
        }

        if (i < list.length()) {
          val obj = list.optJSONObject(i) ?: JSONObject()
          val sectorId = obj.optString("sectorId", "?")
          val openTimeSec = obj.optLong("openTime", 0L) // epoch seconds
          val army = obj.optString("army", "")
          val bonusValue = obj.optInt("bonusValue", 100)

          val prefix = "${i + 1}) $sectorId • "

          val armyShort = when (army.lowercase()) {
            "attack" -> "atk"
            "defense" -> "def"
            else -> ""
          }

          val armyPart = if (armyShort.isNotEmpty()) " • $armyShort" else ""
          val bonusPart = if (bonusValue != 100) " • $bonusValue%" else ""
          val suffix = "$armyPart$bonusPart"

          views.setTextViewText(prefixId, prefix)
          views.setTextViewText(suffixId, suffix)

          if (openTimeSec > 0L) {
            val openTimeMs = openTimeSec * 1000L
            val remainingMs = openTimeMs - System.currentTimeMillis()

            if (remainingMs > 0L) {
              // Chronometer у RemoteViews очікує base в шкалі elapsedRealtime()
              val base = SystemClock.elapsedRealtime() + remainingMs
              views.setChronometer(chronoId, base, null, true)
            } else {
              // Вже відкрито або час минув
              views.setChronometer(chronoId, SystemClock.elapsedRealtime(), null, false)
              views.setTextViewText(chronoId, "00:00")
            }
          } else {
            views.setChronometer(chronoId, SystemClock.elapsedRealtime(), null, false)
            views.setTextViewText(chronoId, "--:--")
          }
        } else {
          views.setTextViewText(prefixId, "${i + 1}) ...")
          views.setTextViewText(suffixId, "")
          views.setChronometer(chronoId, SystemClock.elapsedRealtime(), null, false)
          views.setTextViewText(chronoId, "--:--")
        }
      }
    }
  }
}
