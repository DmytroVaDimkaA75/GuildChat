package com.vadimkaa75.guildchat.widget

<<<<<<< HEAD
import com.facebook.react.bridge.Arguments
=======
import android.content.Context
>>>>>>> 2061334eafe525d52ec7165b4ec9e665d549c2c8
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class GbgWidgetBridgeModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "GbgWidgetBridge"

  @ReactMethod
<<<<<<< HEAD
  fun setCache(next5Json: String?, mapStateJson: String?, mapXml: String?, promise: Promise) {
    try {
      val ctx = reactContext.applicationContext

      // ✅ Часткове оновлення: що прийшло — те записали
      if (next5Json != null) WidgetState.setNext5Json(ctx, next5Json)
      if (mapStateJson != null) WidgetState.setMapStateJson(ctx, mapStateJson)
      if (mapXml != null) WidgetState.setMapXml(ctx, mapXml)

      // ✅ Тригеримо перемальовку віджетів
      WidgetState.broadcastRefresh(ctx)

      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("GBG_SET_CACHE_FAILED", e)
=======
  fun setCache(key: String, value: String, promise: Promise) {
    try {
      val ctx: Context = reactContext.applicationContext
      WidgetPrefs.putString(ctx, key, value)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("WIDGET_CACHE_SET_FAILED", e)
>>>>>>> 2061334eafe525d52ec7165b4ec9e665d549c2c8
    }
  }

  @ReactMethod
<<<<<<< HEAD
  fun refreshWidgets(promise: Promise) {
    try {
      val ctx = reactContext.applicationContext
      WidgetState.broadcastRefresh(ctx)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("GBG_REFRESH_FAILED", e)
    }
  }

  @ReactMethod
  fun getCacheDump(promise: Promise) {
    try {
      val ctx = reactContext.applicationContext
      val dump = WidgetState.getCacheDump(ctx)

      val out = Arguments.createMap()
      out.putDouble("updatedAt", (dump["updatedAt"] as? Long ?: 0L).toDouble())
      out.putString("next5", dump["next5"] as? String ?: "null")
      out.putString("mapState", dump["mapState"] as? String ?: "null")

      val mapXmlObj = dump["mapXml"] as? Map<*, *>
      val mx = Arguments.createMap()
      mx.putInt("length", (mapXmlObj?.get("length") as? Int) ?: 0)
      mx.putString("head", (mapXmlObj?.get("head") as? String) ?: "")
      out.putMap("mapXml", mx)

      promise.resolve(out)
    } catch (e: Exception) {
      promise.reject("GBG_DUMP_FAILED", e)
=======
  fun updateAllWidgets(promise: Promise) {
    try {
      val ctx: Context = reactContext.applicationContext
      GBGTop5SectorsWidgetProvider.updateAll(ctx)
      GBGMapWidgetProvider.updateAll(ctx)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("WIDGET_UPDATE_FAILED", e)
>>>>>>> 2061334eafe525d52ec7165b4ec9e665d549c2c8
    }
  }
}
