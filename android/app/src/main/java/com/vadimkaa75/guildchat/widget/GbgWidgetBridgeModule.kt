package com.vadimkaa75.guildchat.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class GbgWidgetBridgeModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "GbgWidgetBridge"

  // Залишаю кілька назв методів, щоб не зламати JS-виклики, якщо ти вже щось підʼєднав
  @ReactMethod
  fun updateAll(promise: Promise) = runUpdateAll(promise)

  @ReactMethod
  fun updateAllWidgets(promise: Promise) = runUpdateAll(promise)

  @ReactMethod
  fun refreshAll(promise: Promise) = runUpdateAll(promise)

  private fun runUpdateAll(promise: Promise) {
    try {
      val ctx = reactContext.applicationContext

      // Оновлюємо обидва віджети
      triggerWidgetUpdate(ctx, GBGTop5SectorsWidgetProvider::class.java)
      triggerWidgetUpdate(ctx, GBGMapWidgetProvider::class.java)

      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("WIDGET_UPDATE_FAILED", e)
    }
  }

  private fun triggerWidgetUpdate(context: Context, providerClass: Class<*>) {
    val manager = AppWidgetManager.getInstance(context)
    val component = ComponentName(context, providerClass)
    val ids = manager.getAppWidgetIds(component)

    // ✅ IntArray НЕ має isNullOrEmpty()
    if (ids.isEmpty()) return

    // Тригеримо стандартний цикл оновлення провайдера
    val intent = Intent(context, providerClass).apply {
      action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
      putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
    }
    context.sendBroadcast(intent)
  }
}

