package com.vadimkaa75.guildchat.widgets

import android.content.Context

object GbgWidgetPrefs {
    private const val PREFS = "gbg_widget_prefs"
    private const val KEY_NEXT5 = "next5_json"
    private const val KEY_MAP_META = "map_meta_json"
    private const val KEY_UPDATED_AT = "updated_at"

    fun setNext5(context: Context, json: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_NEXT5, json)
            .putLong(KEY_UPDATED_AT, System.currentTimeMillis())
            .apply()
    }

    fun setMapMeta(context: Context, json: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_MAP_META, json)
            .putLong(KEY_UPDATED_AT, System.currentTimeMillis())
            .apply()
    }

    fun getNext5(context: Context): String = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .getString(KEY_NEXT5, "[]") ?: "[]"

    fun getMapMeta(context: Context): String = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .getString(KEY_MAP_META, "{}") ?: "{}"

    fun getUpdatedAt(context: Context): Long = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .getLong(KEY_UPDATED_AT, 0L)
}
