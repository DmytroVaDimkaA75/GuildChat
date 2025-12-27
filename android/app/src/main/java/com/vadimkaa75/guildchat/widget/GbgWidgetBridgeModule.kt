package com.vadimkaa75.guildchat.widget

import android.content.Context
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class GbgWidgetBridgeModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "GbgWidgetBridge"

  @ReactMethod
  fun setCache(key: String, value: String, promise: Promise) {
    try {
      val ctx: Context = reactContext.applicationContext
      WidgetPrefs.putString(ctx, key, value)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("WIDGET_CACHE_SET_FAILED", e)
    }
  }

  @ReactMethod
  fun updateAllWidgets(promise: Promise) {
    try {
      val ctx: Context = reactContext.applicationContext
      GBGTop5SectorsWidgetProvider.updateAll(ctx)
      GBGMapWidgetProvider.updateAll(ctx)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("WIDGET_UPDATE_FAILED", e)
    }
  }
}
