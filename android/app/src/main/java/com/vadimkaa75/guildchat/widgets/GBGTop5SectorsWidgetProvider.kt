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

class GBGTop5SectorsWidgetProvider : AppWidgetProvider() {

  override fun onEnabled(context: Context) {
    super.onEnabled(context)
    GbgWidgetRefreshScheduler.ensureScheduled(context)
    GbgWidgetRefreshScheduler.enqueueImmediate(context)
  }

  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    GbgWidgetRefreshScheduler.ensureScheduled(context)
    GbgWidgetRefreshScheduler.enqueueImmediate(context)
    for (appWidgetId in appWidgetIds) {
      val views = RemoteViews(context.packageName, R.layout.widget_gbg_top5_sectors)
      render(context, views)
      appWidgetManager.updateAppWidget(appWidgetId, views)
    }
  }

  override fun onDisabled(context: Context) {
    super.onDisabled(context)
    GbgWidgetRefreshScheduler.cancelIfNoWidgets(context)
  }

  companion object {

    fun render(context: Context, views: RemoteViews) {
      views.setTextViewText(R.id.widgetTitle, "ПБГ • ТОП-5 секторів")

      val json = GbgWidgetPrefs.getNext5(context)
      val list = try { JSONArray(json) } catch (_: Throwable) { JSONArray() }

      for (i in 0 until 5) {
        val iconId = when (i) {
          0 -> R.id.widgetArmyIcon1
          1 -> R.id.widgetArmyIcon2
          2 -> R.id.widgetArmyIcon3
          3 -> R.id.widgetArmyIcon4
          4 -> R.id.widgetArmyIcon5
          else -> R.id.widgetArmyIcon1
        }

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

          // 1) Немає "1)" — тільки сектор + розділювач
          views.setTextViewText(prefixId, "$sectorId • ")

          // 2) Тільки бонус (без atk/def текстом)
          val bonusPart = if (bonusValue != 100) " • $bonusValue%" else ""
          views.setTextViewText(suffixId, bonusPart)

          // 3) Кольоровий квадрат замість текстового atk/def
          val armyKey = army.lowercase()
          when (armyKey) {
            "attack", "atk" -> {
              views.setViewVisibility(iconId, View.VISIBLE)
              views.setImageViewResource(iconId, R.drawable.widget_army_atk_square)
            }
            "defense", "def" -> {
              views.setViewVisibility(iconId, View.VISIBLE)
              views.setImageViewResource(iconId, R.drawable.widget_army_def_square)
            }
            else -> {
              // якщо тип армії невідомий — ховаємо квадрат
              views.setViewVisibility(iconId, View.GONE)
            }
          }

          // 4) Таймер: якщо < 1 години — показуємо "0:MM:SS"
          if (openTimeSec > 0L) {
            val openTimeMs = openTimeSec * 1000L
            val remainingMs = openTimeMs - System.currentTimeMillis()

            if (remainingMs > 0L) {
              val base = SystemClock.elapsedRealtime() + remainingMs
              val format = if (remainingMs < 3600_000L) "0:%s" else "%s"
              views.setChronometer(chronoId, base, format, true)
            } else {
              views.setChronometer(chronoId, SystemClock.elapsedRealtime(), null, false)
              views.setTextViewText(chronoId, "0:00:00")
            }
          } else {
            views.setChronometer(chronoId, SystemClock.elapsedRealtime(), null, false)
            views.setTextViewText(chronoId, "--:--")
          }

        } else {
          // Порожні рядки
          views.setViewVisibility(iconId, View.GONE)
          views.setTextViewText(prefixId, "...")
          views.setTextViewText(suffixId, "")
          views.setChronometer(chronoId, SystemClock.elapsedRealtime(), null, false)
          views.setTextViewText(chronoId, "--:--")
        }
      }
    }
  }
}
