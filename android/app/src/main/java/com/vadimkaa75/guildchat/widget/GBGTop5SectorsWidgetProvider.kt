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
    }
  }
}
