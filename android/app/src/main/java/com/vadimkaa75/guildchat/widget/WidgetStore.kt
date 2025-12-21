package com.vadimkaa75.guildchat.widgets

import android.content.Context

object WidgetStore {
  private const val PREFS = "guildchat_widgets"
  private const val KEY_RATING_TITLE = "rating_title"
  private const val KEY_RATING_1 = "rating_1"
  private const val KEY_RATING_2 = "rating_2"
  private const val KEY_RATING_3 = "rating_3"

  private const val KEY_GROUPS_TITLE = "groups_title"
  private const val KEY_GROUPS_1 = "groups_1"
  private const val KEY_GROUPS_2 = "groups_2"
  private const val KEY_GROUPS_3 = "groups_3"

  fun setRating(context: Context, title: String, l1: String, l2: String, l3: String) {
    val sp = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    sp.edit()
      .putString(KEY_RATING_TITLE, title)
      .putString(KEY_RATING_1, l1)
      .putString(KEY_RATING_2, l2)
      .putString(KEY_RATING_3, l3)
      .apply()
  }

  fun getRating(context: Context): Array<String> {
    val sp = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val title = sp.getString(KEY_RATING_TITLE, "ПБГ • Рейтинг") ?: "ПБГ • Рейтинг"
    val l1 = sp.getString(KEY_RATING_1, "Ліга: ...") ?: "Ліга: ..."
    val l2 = sp.getString(KEY_RATING_2, "Місце: ...") ?: "Місце: ..."
    val l3 = sp.getString(KEY_RATING_3, "Очки: ...") ?: "Очки: ..."
    return arrayOf(title, l1, l2, l3)
  }

  fun setGroups(context: Context, title: String, l1: String, l2: String, l3: String) {
    val sp = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    sp.edit()
      .putString(KEY_GROUPS_TITLE, title)
      .putString(KEY_GROUPS_1, l1)
      .putString(KEY_GROUPS_2, l2)
      .putString(KEY_GROUPS_3, l3)
      .apply()
  }

  fun getGroups(context: Context): Array<String> {
    val sp = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val title = sp.getString(KEY_GROUPS_TITLE, "ПБГ • Групи") ?: "ПБГ • Групи"
    val l1 = sp.getString(KEY_GROUPS_1, "Група A: ...") ?: "Група A: ..."
    val l2 = sp.getString(KEY_GROUPS_2, "Група B: ...") ?: "Група B: ..."
    val l3 = sp.getString(KEY_GROUPS_3, "Група C: ...") ?: "Група C: ..."
    return arrayOf(title, l1, l2, l3)
  }
}
