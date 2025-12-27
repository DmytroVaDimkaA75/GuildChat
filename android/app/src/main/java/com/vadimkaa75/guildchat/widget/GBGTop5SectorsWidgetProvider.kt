package com.vadimkaa75.guildchat.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import com.vadimkaa75.guildchat.MainActivity
import com.vadimkaa75.guildchat.R
import org.json.JSONArray

class GBGTop5SectorsWidgetProvider : AppWidgetProvider() {

  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    for (widgetId in appWidgetIds) {
      appWidgetManager.updateAppWidget(widgetId, buildViews(context))
    }
  }

  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)

    if (intent.action == WidgetState.ACTION_REFRESH) {
      val mgr = AppWidgetManager.getInstance(context)
      val ids = mgr.getAppWidgetIds(ComponentName(context, GBGTop5SectorsWidgetProvider::class.java))
      onUpdate(context, mgr, ids)
    }
  }

  private fun buildViews(context: Context): RemoteViews {
    val rv = RemoteViews(context.packageName, R.layout.widget_gbg_top5_sectors)

    val intent = Intent(context, MainActivity::class.java)
    val pi = PendingIntent.getActivity(
      context,
      0,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    rv.setOnClickPendingIntent(R.id.w_root, pi)

    val raw = WidgetPrefs.getString(context, WidgetState.KEY_NEXT5)
    val lines = parseTop5(raw)

    rv.setTextViewText(R.id.gbg_title, "ПБГ · топ-5 секторів")
    rv.setTextViewText(R.id.gbg_line_1, lines.getOrNull(0) ?: "")
    rv.setTextViewText(R.id.gbg_line_2, lines.getOrNull(1) ?: "")
    rv.setTextViewText(R.id.gbg_line_3, lines.getOrNull(2) ?: "")
    rv.setTextViewText(R.id.gbg_line_4, lines.getOrNull(3) ?: "")
    rv.setTextViewText(R.id.gbg_line_5, lines.getOrNull(4) ?: "")

    return rv
  }

  private fun parseTop5(raw: String): List<String> {
    if (raw.isBlank()) return emptyList()

    return try {
      val nowSec = System.currentTimeMillis() / 1000
      val arr = JSONArray(raw)
      val out = ArrayList<String>(5)

      val count = minOf(arr.length(), 5)
      for (i in 0 until count) {
        val obj = arr.getJSONObject(i)
        val sectorId = obj.optString("sectorId", "?")
        val openTime = obj.optLong("openTime", 0L)
        val delta = (openTime - nowSec).coerceAtLeast(0L)

        val formatted = formatDelta(delta)
        out.add("${i + 1}) Sector $sectorId • $formatted")
      }

      out
    } catch (_: Exception) {
      emptyList()
    }
  }

  private fun formatDelta(deltaSec: Long): String {
    val h = deltaSec / 3600
    val m = (deltaSec % 3600) / 60
    val s = deltaSec % 60

    return if (h > 0) {
      String.format("%02d:%02d", h, m)
    } else {
      String.format("%02d:%02d", m, s)
    }
  }

  companion object {
    fun updateAll(context: Context) {
      val mgr = AppWidgetManager.getInstance(context)
      val ids = mgr.getAppWidgetIds(ComponentName(context, GBGTop5SectorsWidgetProvider::class.java))
      if (ids.isNotEmpty()) {
        val provider = GBGTop5SectorsWidgetProvider()
        provider.onUpdate(context, mgr, ids)
      }
    }
  }
}
