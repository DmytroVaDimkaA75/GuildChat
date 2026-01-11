package com.vadimkaa75.guildchat.widgets

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.widget.RemoteViews
import com.vadimkaa75.guildchat.R
import com.caverock.androidsvg.SVG
import android.view.View
import android.app.PendingIntent
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.max

class GBGMapWidgetProvider : AppWidgetProvider() {
  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    if (intent.action == ACTION_REFRESH) {
      val serviceIntent = Intent(context, GbgWidgetRefreshService::class.java)
      context.startService(serviceIntent)
    }
  }

  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    GbgWidgetRefreshScheduler.ensureScheduled(context)
    for (appWidgetId in appWidgetIds) {
      val views = RemoteViews(context.packageName, R.layout.widget_gbg_map)
      render(context, views)
      appWidgetManager.updateAppWidget(appWidgetId, views)
    }
  }

  companion object {
    private const val ACTION_REFRESH = "com.vadimkaa75.guildchat.widgets.ACTION_REFRESH"

    fun render(context: Context, views: RemoteViews) {
      views.setTextViewText(R.id.widgetTitle, "ПБГ • Мапа")
      views.setOnClickPendingIntent(R.id.widgetRefreshButton, buildRefreshPendingIntent(context))

      val updatedAt = GbgWidgetPrefs.getUpdatedAt(context)
      val timeStr = if (updatedAt > 0) {
        SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date(updatedAt))
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
        views.setTextViewText(R.id.widgetMapEmpty, "Немає даних мапи")
      }
    }

    private fun renderSvgToBitmap(svgRaw: String): Bitmap? {
      if (svgRaw.isBlank()) return null

      return try {
        val svg = SVG.getFromString(svgRaw)
        val scale = 2f
        val width = max(1, (svg.documentWidth * scale).toInt())
        val height = max(1, (svg.documentHeight * scale).toInt())
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
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
      val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      return PendingIntent.getBroadcast(context, 0, intent, flags)
    }
  }
}
