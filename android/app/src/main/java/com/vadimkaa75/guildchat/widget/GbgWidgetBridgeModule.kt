package com.vadimkaa75.guildchat.widgets

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = GbgWidgetBridgeModule.NAME)
class GbgWidgetBridgeModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

  companion object {
    const val NAME = "GbgWidgetBridge"
  }

  override fun getName(): String = NAME

  @ReactMethod
  fun requestUpdate(promise: Promise) = refreshInternal(promise)

  @ReactMethod
  fun refresh(promise: Promise) = refreshInternal(promise)

  @ReactMethod
  fun update(promise: Promise) = refreshInternal(promise)

  @ReactMethod
  fun refreshAll(promise: Promise) = refreshInternal(promise)

  private fun refreshInternal(promise: Promise) {
    try {
      val context = currentActivity?.applicationContext ?: reactApplicationContext.applicationContext
      GbgWidgetUpdater.refreshAll(context)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("GBG_WIDGET_UPDATE_ERROR", e)
    }
  }
}
