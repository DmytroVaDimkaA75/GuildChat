package com.vadimkaa75.guildchat.widget

import android.content.Context

object WidgetPrefs {
  private const val PREFS_NAME = "gbg_widget_cache"

  fun putString(context: Context, key: String, value: String) {
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .putString(key, value)
      .apply()
  }

  fun getString(context: Context, key: String): String {
    return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .getString(key, "") ?: ""
  }
}
