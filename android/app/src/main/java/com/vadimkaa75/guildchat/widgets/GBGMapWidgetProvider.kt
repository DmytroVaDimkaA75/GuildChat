package com.vadimkaa75.guildchat.widgets

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews
import com.vadimkaa75.guildchat.R
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class GBGMapWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (appWidgetId in appWidgetIds) {
            val views = RemoteViews(context.packageName, R.layout.widget_gbg_map)
            render(context, views)
            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }

    companion object {
        fun render(context: Context, views: RemoteViews) {
            views.setTextViewText(R.id.widgetTitle, "ПБГ • Мапа")

            val metaRaw = GbgWidgetPrefs.getMapMeta(context)
            val meta = try { JSONObject(metaRaw) } catch (_: Throwable) { JSONObject() }

            val mapKey = meta.optString("mapKey", "—")
            val sectorsCount = meta.optInt("sectorsCount", 0)
            val staffCount = meta.optInt("staffCount", 0)
            val updatedAt = GbgWidgetPrefs.getUpdatedAt(context)

            val timeStr = if (updatedAt > 0) {
                SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date(updatedAt))
            } else "—"

            views.setTextViewText(R.id.widgetLine1, "Карта: $mapKey")
            views.setTextViewText(R.id.widgetLine2, "Сектори: $sectorsCount • staff: $staffCount")
            views.setTextViewText(R.id.widgetLine3, "Оновлено: $timeStr")
        }
    }
}
