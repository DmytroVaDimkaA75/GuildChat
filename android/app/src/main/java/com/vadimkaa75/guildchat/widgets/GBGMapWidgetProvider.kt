package com.vadimkaa75.guildchat.widgets

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.widget.RemoteViews
import android.view.View
import android.app.PendingIntent
import com.vadimkaa75.guildchat.R
import com.caverock.androidsvg.SVG
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.max

class GBGMapWidgetProvider : AppWidgetProvider() {

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)

        if (intent.action == ACTION_REFRESH) {
            // ✅ ЄДИНА логіка — міняємо текст
            val appWidgetManager = AppWidgetManager.getInstance(context)
            val views = RemoteViews(context.packageName, R.layout.widget_gbg_map)

            views.setTextViewText(
                R.id.widgetUpdatedAt,
                "Для отримання більш актуальних даних відвідайте додаток"
            )

            val widgetIds = appWidgetManager.getAppWidgetIds(
                intent.component
            )
            appWidgetManager.updateAppWidget(widgetIds, views)
        }
    }

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (appWidgetId in appWidgetIds) {
            val views = RemoteViews(context.packageName, R.layout.widget_gbg_map)
            render(context, views)
            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }

    companion object {
        const val ACTION_REFRESH =
            "com.vadimkaa75.guildchat.widgets.ACTION_REFRESH"

        fun render(context: Context, views: RemoteViews) {
            views.setTextViewText(R.id.widgetTitle, "ПБГ • Мапа")
            views.setOnClickPendingIntent(
                R.id.widgetRefreshButton,
                buildRefreshPendingIntent(context)
            )

            val updatedAt = GbgWidgetPrefs.getUpdatedAt(context)
            val timeStr = if (updatedAt > 0) {
                SimpleDateFormat("HH:mm:ss", Locale.getDefault())
                    .format(Date(updatedAt))
            } else "—"

            views.setTextViewText(R.id.widgetUpdatedAt, "Оновлено: $timeStr")

            val svgRaw = GbgWidgetPrefs.getMapSvg(context)
            val bitmap = renderSvgToBitmap(svgRaw)

            if (bitmap != null) {
                views.setImageViewBitmap(R.id.widgetMapImage, bitmap)
                views.setViewVisibility(R.id.widgetMapImage, View.VISIBLE)
                views.setViewVisibility(R.id.widgetMapEmpty, View.GONE)
            } else {
                views.setViewVisibility(R.id.widgetMapImage, View.GONE)
                views.setViewVisibility(R.id.widgetMapEmpty, View.VISIBLE)
                views.setTextViewText(
                    R.id.widgetMapEmpty,
                    "Немає даних мапи"
                )
            }
        }

        private fun renderSvgToBitmap(svgRaw: String): Bitmap? {
            if (svgRaw.isBlank()) return null
            return try {
                val svg = SVG.getFromString(svgRaw)
                val scale = 2f
                val bitmap = Bitmap.createBitmap(
                    (svg.documentWidth * scale).toInt(),
                    (svg.documentHeight * scale).toInt(),
                    Bitmap.Config.ARGB_8888
                )
                val canvas = Canvas(bitmap)
                canvas.scale(scale, scale)
                svg.renderToCanvas(canvas)
                bitmap
            } catch (_: Throwable) {
                null
            }
        }

        private fun buildRefreshPendingIntent(context: Context): PendingIntent {
            val intent = Intent(context, GBGMapWidgetProvider::class.java).apply {
                action = ACTION_REFRESH
            }
            return PendingIntent.getBroadcast(
                context,
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }
    }
}
