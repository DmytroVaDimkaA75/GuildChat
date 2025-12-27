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
import org.json.JSONObject

class GBGMapWidgetProvider : AppWidgetProvider() {

  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    for (widgetId in appWidgetIds) {
      appWidgetManager.updateAppWidget(widgetId, buildViews(context))
    }
  }

  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)

    if (intent.action == WidgetState.ACTION_REFRESH) {
      val mgr = AppWidgetManager.getInstance(context)
      val ids = mgr.getAppWidgetIds(ComponentName(context, GBGMapWidgetProvider::class.java))
      onUpdate(context, mgr, ids)
    }
  }

  private fun buildViews(context: Context): RemoteViews {
    val rv = RemoteViews(context.packageName, R.layout.widget_gbg_map)

    val intent = Intent(context, MainActivity::class.java)
    val pi = PendingIntent.getActivity(
      context,
      0,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    rv.setOnClickPendingIntent(R.id.w_root, pi)

    val rawState = WidgetPrefs.getString(context, WidgetState.KEY_MAP_STATE)
    val openedCount = countOpened(rawState)
    rv.setTextViewText(R.id.gbg_map_status, "Відкрито секторів: $openedCount")

    val rawXml = WidgetPrefs.getString(context, WidgetState.KEY_MAP_XML)
    rv.setTextViewText(
      R.id.gbg_map_xml_status,
      if (rawXml.isBlank()) "map_xml: порожньо" else "map_xml: ${rawXml.length} символів"
    )

    return rv
  }

  private fun countOpened(raw: String): Int {
    if (raw.isBlank()) return 0
    return try {
      val root = JSONObject(raw)
      val opened = root.optJSONObject("openedSectors") ?: return 0
      val keys = opened.keys()
      var count = 0
      while (keys.hasNext()) {
        val k = keys.next()
        if (opened.optBoolean(k, false)) count++
      }
      count
    } catch (_: Exception) {
      0
    }
  }

  companion object {
    fun updateAll(context: Context) {
      val mgr = AppWidgetManager.getInstance(context)
      val ids = mgr.getAppWidgetIds(ComponentName(context, GBGMapWidgetProvider::class.java))
      if (ids.isNotEmpty()) {
        val provider = GBGMapWidgetProvider()
        provider.onUpdate(context, mgr, ids)
      }
    }
  }
}
