package com.vadimkaa75.guildchat.widgets

import android.content.Context
import com.reactnativecommunity.asyncstorage.ReactDatabaseSupplier
import org.json.JSONArray
import org.json.JSONObject

private const val ASYNC_STORAGE_TABLE = "catalystLocalStorage"
private const val ASYNC_STORAGE_KEY_COLUMN = "key"
private const val ASYNC_STORAGE_VALUE_COLUMN = "value"

private const val KEY_NEXT5 = "widget_gbg_next5"
private const val KEY_MAP_STATE = "widget_gbg_map_state"
private const val KEY_UPDATED_AT = "widget_gbg_updated_at"

data class Next5Item(
  val sectorId: String,
  val openTime: Long,
  val army: String,
  val bonusValue: Int,
  val bonusReadyAt: Long,
) {
  val remainingSeconds: Long
    get() = openTime - (System.currentTimeMillis() / 1000)
}

data class Next5State(
  val items: List<Next5Item>,
  val updatedAt: Long?,
)

data class MapState(
  val mapKey: String?,
  val shortGuildId: String?,
  val sectorOwners: Map<String, String?>,
  val sectorStaff: Set<String>,
  val updatedAt: Long?,
) {
  val ownCount: Int
    get() = sectorOwners.entries.count { (_, owner) -> owner != null && owner == shortGuildId }

  val neutralCount: Int
    get() = sectorOwners.entries.count { (_, owner) -> owner == null || owner == "0" }

  val enemyCount: Int
    get() = sectorOwners.size - ownCount - neutralCount

  val staffCount: Int
    get() = sectorStaff.size
}

object GbgWidgetData {
  private fun readRawValue(context: Context, key: String): String? {
    return try {
      val db = ReactDatabaseSupplier.getInstance(context).get()
      db.query(
        ASYNC_STORAGE_TABLE,
        arrayOf(ASYNC_STORAGE_VALUE_COLUMN),
        "$ASYNC_STORAGE_KEY_COLUMN=?",
        arrayOf(key),
        null,
        null,
        null
      ).use { cursor ->
        if (cursor.moveToFirst()) cursor.getString(0) else null
      }
    } catch (_: Exception) {
      null
    }
  }

  private fun parseUpdatedAt(context: Context): Long? {
    val raw = readRawValue(context, KEY_UPDATED_AT) ?: return null
    return raw.toLongOrNull()
  }

  fun readNext5(context: Context): Next5State {
    val updatedAt = parseUpdatedAt(context)
    val raw = readRawValue(context, KEY_NEXT5)
    if (raw.isNullOrEmpty()) return Next5State(emptyList(), updatedAt)

    val list = mutableListOf<Next5Item>()
    try {
      val json = JSONArray(raw)
      for (i in 0 until json.length()) {
        val obj = json.optJSONObject(i) ?: continue
        val rawId = obj.optString("sectorId", obj.optString("name", ""))
        if (rawId.isBlank()) continue
        val sectorId = rawId.trim()
        val openTime = obj.optLong("openTime", 0)
        val army = obj.optString("army", "")
        val bonusValue = obj.optInt("bonusValue", 100)
        val bonusReadyAt = obj.optLong("bonusReadyAt", 0)
        list.add(Next5Item(sectorId, openTime, army, bonusValue, bonusReadyAt))
      }
    } catch (_: Exception) {
    }

    return Next5State(list, updatedAt)
  }

  fun readMapState(context: Context): MapState {
    val updatedAt = parseUpdatedAt(context)
    val raw = readRawValue(context, KEY_MAP_STATE)
    if (raw.isNullOrEmpty()) {
      return MapState(null, null, emptyMap(), emptySet(), updatedAt)
    }

    return try {
      val obj = JSONObject(raw)
      val mapKey = obj.optString("mapKey", null)
      val shortGuildId = obj.optString("shortGuildId", null)

      val ownersObj = obj.optJSONObject("sectorOwners")
      val owners = mutableMapOf<String, String?>()
      ownersObj?.keys()?.forEach { key ->
        val value = ownersObj.opt(key)
        owners[key] = when (value) {
          JSONObject.NULL -> null
          null -> null
          else -> value.toString()
        }
      }

      val staffObj = obj.optJSONObject("sectorStaff")
      val staff = mutableSetOf<String>()
      staffObj?.keys()?.forEach { key ->
        val value = staffObj.opt(key)
        if (value is Boolean && value) staff.add(key)
        else if (value != JSONObject.NULL && value != null && value.toString().equals("true", true)) staff.add(key)
      }

      MapState(mapKey, shortGuildId, owners, staff, updatedAt)
    } catch (_: Exception) {
      MapState(null, null, emptyMap(), emptySet(), updatedAt)
    }
  }
}
