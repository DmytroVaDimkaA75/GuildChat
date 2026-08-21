package com.foechat.mobile.widgets

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.widget.RemoteViews
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.foechat.mobile.R

class GbgWidgetBridgeModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "GbgWidgetBridge"

  @ReactMethod
  fun setNext5(json: String, sourceGuildId: String) {
    GbgWidgetPrefs.setNext5(reactContext, json, sourceGuildId)
  }

  @ReactMethod
  fun setMapMeta(json: String, sourceGuildId: String) {
    GbgWidgetPrefs.setMapMeta(reactContext, json, sourceGuildId)
  }

  @ReactMethod
  fun setMapSvg(svg: String, sourceGuildId: String) {
    GbgWidgetPrefs.setMapSvg(reactContext, svg, sourceGuildId)
  }

  @ReactMethod
  fun setGuildId(guildId: String) {
    val changed = GbgWidgetPrefs.setGuildId(reactContext, guildId)
    if (changed) refreshAll()
    if (guildId.isBlank()) {
      GbgWidgetRefreshScheduler.cancelAll(reactContext)
      return
    }
    GbgWidgetRefreshScheduler.ensureScheduled(reactContext)
    GbgWidgetRefreshScheduler.enqueueImmediate(reactContext)
  }

  @ReactMethod
  fun getGuildId(promise: Promise) {
    promise.resolve(GbgWidgetPrefs.getGuildId(reactContext))
  }

  @ReactMethod
  fun hasWidgets(promise: Promise) {
    promise.resolve(GbgWidgetRefreshScheduler.hasWidgets(reactContext))
  }

  @ReactMethod
  fun refreshAll() {
    val context = reactContext.applicationContext
    val mgr = AppWidgetManager.getInstance(context)

    val top5 = ComponentName(context, GBGTop5SectorsWidgetProvider::class.java)
    val top5Ids = mgr.getAppWidgetIds(top5)
    top5Ids.forEach { widgetId ->
      val views = RemoteViews(context.packageName, R.layout.widget_gbg_top5_sectors)
      GBGTop5SectorsWidgetProvider.render(context, views)
      mgr.updateAppWidget(widgetId, views)
    }

    val map = ComponentName(context, GBGMapWidgetProvider::class.java)
    val mapIds = mgr.getAppWidgetIds(map)
    mapIds.forEach { widgetId ->
      val views = RemoteViews(context.packageName, R.layout.widget_gbg_map)
      GBGMapWidgetProvider.render(context, views)
      mgr.updateAppWidget(widgetId, views)
    }
  }

  @ReactMethod
  fun enqueueRefresh() {
    GbgWidgetRefreshScheduler.ensureScheduled(reactContext)
    GbgWidgetRefreshScheduler.enqueueImmediate(reactContext)
  }
}
