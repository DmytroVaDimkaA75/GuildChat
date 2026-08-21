package com.foechat.mobile.widgets

import android.content.Context

object GbgWidgetPrefs {
  private const val PREFS = "gbg_widget_prefs"

  private const val KEY_NEXT5 = "next5_json"
  private const val KEY_MAP_META = "map_meta_json"
  private const val KEY_MAP_SVG = "map_svg_xml"
  private const val KEY_UPDATED_AT = "updated_at"
  private const val KEY_GUILD_ID = "guild_id"
  private const val KEY_CACHE_GUILD_ID = "cache_guild_id"
  private const val KEY_SNAPSHOT_UPDATED_AT = "snapshot_updated_at"

  @Synchronized
  fun setNext5(context: Context, json: String, sourceGuildId: String): Boolean {
    val preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val guildId = preferences.getString(KEY_GUILD_ID, null)
    if (!sourceMatchesActiveGuild(sourceGuildId, guildId)) return false
    preferences.edit()
      .putString(KEY_NEXT5, json)
      .putString(KEY_CACHE_GUILD_ID, guildId)
      .putLong(KEY_UPDATED_AT, System.currentTimeMillis())
      .apply()
    return true
  }

  @Synchronized
  fun setMapMeta(context: Context, json: String, sourceGuildId: String): Boolean {
    val preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val guildId = preferences.getString(KEY_GUILD_ID, null)
    if (!sourceMatchesActiveGuild(sourceGuildId, guildId)) return false
    preferences.edit()
      .putString(KEY_MAP_META, json)
      .putString(KEY_CACHE_GUILD_ID, guildId)
      .putLong(KEY_UPDATED_AT, System.currentTimeMillis())
      .apply()
    return true
  }

  @Synchronized
  fun setMapSvg(context: Context, svg: String, sourceGuildId: String): Boolean {
    val preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val guildId = preferences.getString(KEY_GUILD_ID, null)
    if (!sourceMatchesActiveGuild(sourceGuildId, guildId)) return false
    preferences.edit()
      .putString(KEY_MAP_SVG, svg)
      .putString(KEY_CACHE_GUILD_ID, guildId)
      .putLong(KEY_UPDATED_AT, System.currentTimeMillis())
      .apply()
    return true
  }

  /**
   * Commits a complete server snapshot in one SharedPreferences transaction.
   *
   * A synchronous commit is deliberate here: WorkManager must only report
   * success after the widget process can read every part of the new snapshot.
   */
  @Synchronized
  fun setSnapshotIfGuildMatches(
    context: Context,
    expectedGuildId: String,
    snapshotUpdatedAt: Long,
    next5Json: String,
    mapMetaJson: String,
    mapSvg: String,
    updatedAt: Long
  ): SnapshotWriteResult {
    val preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    if (preferences.getString(KEY_GUILD_ID, null) != expectedGuildId) {
      return SnapshotWriteResult.GUILD_CHANGED
    }

    val cachedGuildId = preferences.getString(KEY_CACHE_GUILD_ID, null)
    val cachedSnapshotUpdatedAt = preferences.getLong(KEY_SNAPSHOT_UPDATED_AT, 0L)
    if (
      cachedGuildId == expectedGuildId &&
      snapshotUpdatedAt > 0L &&
      cachedSnapshotUpdatedAt > snapshotUpdatedAt
    ) {
      return SnapshotWriteResult.STALE
    }

    val committed = preferences.edit()
      .putString(KEY_NEXT5, next5Json)
      .putString(KEY_MAP_META, mapMetaJson)
      .putString(KEY_MAP_SVG, mapSvg)
      .putString(KEY_CACHE_GUILD_ID, expectedGuildId)
      .putLong(KEY_SNAPSHOT_UPDATED_AT, snapshotUpdatedAt)
      .putLong(KEY_UPDATED_AT, updatedAt)
      .commit()
    return if (committed) SnapshotWriteResult.STORED else SnapshotWriteResult.WRITE_FAILED
  }

  @Synchronized
  fun isCurrentSnapshot(
    context: Context,
    expectedGuildId: String,
    snapshotUpdatedAt: Long
  ): Boolean {
    if (snapshotUpdatedAt <= 0L) return false
    val preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    return preferences.getString(KEY_GUILD_ID, null) == expectedGuildId &&
      preferences.getString(KEY_CACHE_GUILD_ID, null) == expectedGuildId &&
      preferences.getLong(KEY_SNAPSHOT_UPDATED_AT, 0L) == snapshotUpdatedAt
  }

  @Synchronized
  fun markCheckedIfGuildMatches(
    context: Context,
    expectedGuildId: String,
    snapshotUpdatedAt: Long,
    checkedAt: Long
  ): Boolean {
    val preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    if (
      preferences.getString(KEY_GUILD_ID, null) != expectedGuildId ||
      preferences.getString(KEY_CACHE_GUILD_ID, null) != expectedGuildId ||
      preferences.getLong(KEY_SNAPSHOT_UPDATED_AT, 0L) != snapshotUpdatedAt
    ) {
      return false
    }
    return preferences.edit()
      .putLong(KEY_UPDATED_AT, checkedAt)
      .commit()
  }

  fun getNext5(context: Context): String =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).let { preferences ->
      if (hasActiveCache(preferences)) {
        preferences.getString(KEY_NEXT5, "[]") ?: "[]"
      } else {
        "[]"
      }
    }

  fun getMapMeta(context: Context): String =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).let { preferences ->
      if (hasActiveCache(preferences)) {
        preferences.getString(KEY_MAP_META, "{}") ?: "{}"
      } else {
        "{}"
      }
    }

  fun getMapSvg(context: Context): String =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).let { preferences ->
      if (hasActiveCache(preferences)) {
        preferences.getString(KEY_MAP_SVG, "") ?: ""
      } else {
        ""
      }
    }

  fun getUpdatedAt(context: Context): Long =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).let { preferences ->
      if (hasActiveCache(preferences)) preferences.getLong(KEY_UPDATED_AT, 0L) else 0L
    }

  @Synchronized
  fun setGuildId(context: Context, guildId: String): Boolean {
    val preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val normalizedGuildId = guildId.trim()
    if (preferences.getString(KEY_GUILD_ID, null) == normalizedGuildId) return false

    // Never display the previous world's sectors while the new snapshot loads.
    preferences.edit()
      .putString(KEY_GUILD_ID, normalizedGuildId)
      .remove(KEY_NEXT5)
      .remove(KEY_MAP_META)
      .remove(KEY_MAP_SVG)
      .remove(KEY_UPDATED_AT)
      .remove(KEY_CACHE_GUILD_ID)
      .remove(KEY_SNAPSHOT_UPDATED_AT)
      .commit()
    return true
  }

  fun getGuildId(context: Context): String? =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .getString(KEY_GUILD_ID, null)

  private fun hasActiveCache(preferences: android.content.SharedPreferences): Boolean {
    val guildId = preferences.getString(KEY_GUILD_ID, null)
    return !guildId.isNullOrBlank() &&
      guildId == preferences.getString(KEY_CACHE_GUILD_ID, null)
  }

  private fun sourceMatchesActiveGuild(sourceGuildId: String, activeGuildId: String?): Boolean {
    if (activeGuildId.isNullOrBlank()) return false
    val normalizedSourceGuildId = sourceGuildId.trim()
    return normalizedSourceGuildId.isEmpty() || normalizedSourceGuildId == activeGuildId
  }

  enum class SnapshotWriteResult {
    STORED,
    GUILD_CHANGED,
    STALE,
    WRITE_FAILED
  }
}
