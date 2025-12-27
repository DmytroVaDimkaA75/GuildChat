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
<<<<<<< HEAD
import kotlin.math.max

class GBGTop5SectorsWidgetProvider : AppWidgetProvider() {

  private fun formatRemaining(seconds: Long): String {
    val s = max(0L, seconds)
    val h = s / 3600
    val m = (s % 3600) / 60
    val sec = s % 60
    return if (h > 0) {
      String.format("%02d:%02d:%02d", h, m, sec)
    } else {
      String.format("%02d:%02d", m, sec)
    }
  }

  private fun updateOne(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int) {
    val views = RemoteViews(context.packageName, R.layout.widget_gbg_top5_sectors)

    // ✅ клік по віджету відкриває додаток
    val intent = Intent(context, MainActivity::class.java)
    val pi = PendingIntent.getActivity(
      context,
      0,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    views.setOnClickPendingIntent(R.id.w_root, pi)

    val nowSec = System.currentTimeMillis() / 1000L
    val items = WidgetState.parseNext5(context).take(5)

    val ids = listOf(R.id.w_line1, R.id.w_line2, R.id.w_line3, R.id.w_line4, R.id.w_line5)

    if (items.isEmpty()) {
      ids.forEachIndexed { idx, tvId ->
        val text = if (idx == 0) "Немає даних" else ""
        views.setTextViewText(tvId, text)
      }
    } else {
      ids.forEachIndexed { idx, tvId ->
        val item = items.getOrNull(idx)
        if (item == null) {
          views.setTextViewText(tvId, "")
          return@forEachIndexed
        }

        val left = if (item.openTime > 0) (item.openTime - nowSec) else 0L
        val line = "${idx + 1}) Sector ${item.sectorId} • ${formatRemaining(left)}"
        views.setTextViewText(tvId, line)
      }
    }

    appWidgetManager.updateAppWidget(appWidgetId, views)
  }

  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    for (id in appWidgetIds) updateOne(context, appWidgetManager, id)
  }

  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)

    if (intent.action == WidgetState.ACTION_REFRESH) {
      val mgr = AppWidgetManager.getInstance(context)
      val ids = mgr.getAppWidgetIds(ComponentName(context, GBGTop5SectorsWidgetProvider::class.java))
      onUpdate(context, mgr, ids)
=======
import org.json.JSONArray

class GBGTop5SectorsWidgetProvider : AppWidgetProvider() {

  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    for (widgetId in appWidgetIds) {
      appWidgetManager.updateAppWidget(widgetId, buildViews(context))
    }
  }

  private fun buildViews(context: Context): RemoteViews {
    val rv = RemoteViews(context.packageName, R.layout.widget_gbg_top5_sectors)

    val raw = WidgetPrefs.getString(context, "widget_gbg_next5")
    val lines = parseTop5(raw)

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
>>>>>>> 2061334eafe525d52ec7165b4ec9e665d549c2c8
    }
  }
}
