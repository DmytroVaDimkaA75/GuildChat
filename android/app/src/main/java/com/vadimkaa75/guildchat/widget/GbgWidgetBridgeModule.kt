package com.vadimkaa75.guildchat.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.util.Log
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class GbgWidgetBridgeModule(private val reactCtx: ReactApplicationContext) : ReactContextBaseJavaModule(reactCtx) {

  override fun getName(): String = "GbgWidgetBridge"

  private val tag = "GbgWidgetBridge"

  private val top5ProviderCandidates = listOf(
    "com.vadimkaa75.guildchat.widget.GBGTop5SectorsWidgetProvider",
    "com.vadimkaa75.guildchat.GBGTop5SectorsWidgetProvider",
    "com.vadimkaa75.guildchat.widget.GbgTop5SectorsWidgetProvider",
    "com.vadimkaa75.guildchat.GbgTop5SectorsWidgetProvider"
  )

  private val mapProviderCandidates = listOf(
    "com.vadimkaa75.guildchat.widget.GBGMapWidgetProvider",
    "com.vadimkaa75.guildchat.GBGMapWidgetProvider",
    "com.vadimkaa75.guildchat.widget.GbgMapWidgetProvider",
    "com.vadimkaa75.guildchat.GbgMapWidgetProvider"
  )

  @ReactMethod
  fun refreshWidgets() {
    refreshTop5Widget()
    refreshMapWidget()
  }

  @ReactMethod
  fun refreshTop5Widget() {
    val context: Context = reactCtx.applicationContext
    refreshByCandidates(context, top5ProviderCandidates)
  }

  @ReactMethod
  fun refreshMapWidget() {
    val context: Context = reactCtx.applicationContext
    refreshByCandidates(context, mapProviderCandidates)
  }

  private fun refreshByCandidates(context: Context, candidates: List<String>) {
    for (className in candidates) {
      val ok = trySendUpdateBroadcast(context, className)
      if (ok) return
    }
    Log.w(tag, "No widget provider class found for candidates: $candidates")
  }

  private fun trySendUpdateBroadcast(context: Context, providerClassName: String): Boolean {
    val providerClass: Class<*> = try {
      Class.forName(providerClassName)
    } catch (e: Throwable) {
      return false
    }

    return try {
      val appWidgetManager = AppWidgetManager.getInstance(context)
      val component = ComponentName(context, providerClass)
      val ids = appWidgetManager.getAppWidgetIds(component) // IntArray

      // ✅ ФІКС: для IntArray є isEmpty(), а не isNullOrEmpty()
      if (ids.isEmpty()) {
        Log.d(tag, "No widget instances for $providerClassName")
        true
      } else {
        val intent = Intent(context, providerClass).apply {
          action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
          putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
        }
        context.sendBroadcast(intent)
        Log.d(tag, "Widget update broadcast sent to $providerClassName (count=${ids.size})")
        true
      }
    } catch (e: Throwable) {
      Log.e(tag, "Failed to broadcast update to $providerClassName", e)
      false
    }
  }
}
