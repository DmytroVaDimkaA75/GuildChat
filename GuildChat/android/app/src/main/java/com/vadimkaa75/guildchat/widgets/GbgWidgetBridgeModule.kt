package com.vadimkaa75.guildchat.widgets

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.vadimkaa75.guildchat.R

class GbgWidgetBridgeModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName(): String = "GbgWidgetBridge"

    @ReactMethod
    fun setNext5(json: String) {
        GbgWidgetPrefs.setNext5(reactContext, json)
    }

    @ReactMethod
    fun setMapMeta(json: String) {
        GbgWidgetPrefs.setMapMeta(reactContext, json)
    }

    @ReactMethod
    fun refreshAll() {
        val context = reactContext.applicationContext
        val mgr = AppWidgetManager.getInstance(context)

        val top5 = ComponentName(context, GBGTop5SectorsWidgetProvider::class.java)
        val top5Ids = mgr.getAppWidgetIds(top5)
        if (top5Ids.isNotEmpty()) {
            GBGTop5SectorsWidgetProvider().onUpdate(context, mgr, top5Ids)
        }

        val map = ComponentName(context, GBGMapWidgetProvider::class.java)
        val mapIds = mgr.getAppWidgetIds(map)
        if (mapIds.isNotEmpty()) {
            GBGMapWidgetProvider().onUpdate(context, mgr, mapIds)
        }
    }
}
