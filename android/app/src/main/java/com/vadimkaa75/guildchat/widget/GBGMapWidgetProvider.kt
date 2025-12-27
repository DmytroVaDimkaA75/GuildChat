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

class GBGMapWidgetProvider : AppWidgetProvider() {

  private fun updateOne(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int) {
    val views = RemoteViews(context.packageName, R.layout.widget_gbg_map)

    val intent = Intent(context, MainActivity::class.java)
    val pi = PendingIntent.getActivity(
      context,
      0,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    views.setOnClickPendingIntent(R.id.w_root, pi)

    val xml = WidgetState.getMapXml(context)
    if (xml.isBlank()) {
      views.setTextViewText(R.id.w_map_status, "Немає даних (mapXml=0)")
    } else {
      views.setTextViewText(R.id.w_map_status, "Оновлено ✓ (mapXml=${xml.length})")
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
      val ids = mgr.getAppWidgetIds(ComponentName(context, GBGMapWidgetProvider::class.java))
      onUpdate(context, mgr, ids)
    }
  }
}
