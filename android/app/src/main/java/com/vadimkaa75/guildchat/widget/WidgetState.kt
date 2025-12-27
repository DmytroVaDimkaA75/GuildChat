package com.vadimkaa75.guildchat.widget

import android.content.Context
import android.content.Intent
import org.json.JSONArray
import org.json.JSONObject

object WidgetState {
  const val PREFS_NAME = "gbg_widget_cache"

  const val KEY_UPDATED_AT = "updatedAt"
  const val KEY_NEXT5 = "widget_gbg_next5"
  const val KEY_MAP_STATE = "widget_gbg_map_state"
  const val KEY_MAP_XML = "widget_gbg_map_xml"

  const val ACTION_REFRESH = "com.vadimkaa75.guildchat.GBG_WIDGET_REFRESH"

  fun prefs(context: Context) =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  fun setNext5Json(context: Context, json: String?) {
    val p = prefs(context)
    p.edit()
      .putString(KEY_NEXT5, json ?: "[]")
      .putLong(KEY_UPDATED_AT, System.currentTimeMillis())
      .apply()
  }

  fun setMapStateJson(context: Context, json: String?) {
    val p = prefs(context)
    p.edit()
      .putString(KEY_MAP_STATE, json ?: "{}")
      .putLong(KEY_UPDATED_AT, System.currentTimeMillis())
      .apply()
  }

  fun setMapXml(context: Context, xml: String?) {
    val p = prefs(context)
    p.edit()
      .putString(KEY_MAP_XML, xml ?: "")
      .putLong(KEY_UPDATED_AT, System.currentTimeMillis())
      .apply()
  }

  fun getUpdatedAt(context: Context): Long {
    return prefs(context).getLong(KEY_UPDATED_AT, 0L)
  }

  fun getNext5Json(context: Context): String {
    return prefs(context).getString(KEY_NEXT5, "[]") ?: "[]"
  }

  fun getMapStateJson(context: Context): String {
    return prefs(context).getString(KEY_MAP_STATE, "{}") ?: "{}"
  }

  fun getMapXml(context: Context): String {
    return prefs(context).getString(KEY_MAP_XML, "") ?: ""
  }

  data class Next5Item(
    val sectorId: String,
    val openTime: Long,
    val army: String,
    val bonusValue: Int,
    val bonusReadyAt: Long
  )

  fun parseNext5(context: Context): List<Next5Item> {
    return try {
      val arr = JSONArray(getNext5Json(context))
      val out = ArrayList<Next5Item>()
      for (i in 0 until arr.length()) {
        val o = arr.optJSONObject(i) ?: continue
        out.add(
          Next5Item(
            sectorId = o.optString("sectorId", ""),
            openTime = o.optLong("openTime", 0L),
            army = o.optString("army", ""),
            bonusValue = o.optInt("bonusValue", 100),
            bonusReadyAt = o.optLong("bonusReadyAt", 0L),
          )
        )
      }
      out
    } catch (e: Exception) {
      emptyList()
    }
  }

  fun broadcastRefresh(context: Context) {
    // ✅ Обмежуємо broadcast нашим пакетом
    val intent = Intent(ACTION_REFRESH).setPackage(context.packageName)
    context.sendBroadcast(intent)
  }

  fun getCacheDump(context: Context): Map<String, Any?> {
    val updatedAt = getUpdatedAt(context)
    val next5 = try { JSONArray(getNext5Json(context)).toString(2) } catch (e: Exception) { "null" }
    val mapState = try { JSONObject(getMapStateJson(context)).toString(2) } catch (e: Exception) { "null" }
    val mapXml = getMapXml(context)

    val head = if (mapXml.isNotEmpty()) mapXml.take(200) else ""
    return mapOf(
      "updatedAt" to updatedAt,
      "next5" to next5,
      "mapState" to mapState,
      "mapXml" to mapOf(
        "length" to mapXml.length,
        "head" to head
      )
    )
  }
}
