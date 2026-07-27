package com.vadimkaa75.guildchat.widgets

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.widget.RemoteViews
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.google.android.gms.tasks.Tasks
import com.google.firebase.FirebaseApp
import com.google.firebase.database.FirebaseDatabase
import com.vadimkaa75.guildchat.R
import org.json.JSONArray
import org.json.JSONObject
import java.nio.charset.StandardCharsets
import java.util.concurrent.ExecutionException
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException

class GbgWidgetRefreshWorker(appContext: Context, params: WorkerParameters) : Worker(appContext, params) {
  override fun doWork(): Result {
    if (!GbgWidgetRefreshScheduler.hasWidgets(applicationContext)) {
      GbgWidgetRefreshScheduler.cancelIfNoWidgets(applicationContext)
      return Result.success()
    }

    val guildId = GbgWidgetPrefs.getGuildId(applicationContext)?.trim().orEmpty()
    if (!isValidFirebaseKey(guildId)) {
      updateTop5AndMapTimestamp()
      return Result.failure()
    }

    return when (val fetchResult = fetchSnapshot(guildId)) {
      is SnapshotFetchResult.Success -> {
        val snapshotUpdatedAt = getValidSnapshotUpdatedAt(fetchResult.snapshot, guildId)
        if (snapshotUpdatedAt == null) {
          updateTop5AndMapTimestamp()
          return Result.failure()
        }

        if (
          GbgWidgetPrefs.isCurrentSnapshot(
            applicationContext,
            guildId,
            snapshotUpdatedAt
          )
        ) {
          GbgWidgetPrefs.markCheckedIfGuildMatches(
            applicationContext,
            guildId,
            snapshotUpdatedAt,
            System.currentTimeMillis()
          )
          updateTop5AndMapTimestamp()
          return Result.success()
        }

        when (storeSnapshot(fetchResult.snapshot, guildId, snapshotUpdatedAt)) {
          SnapshotStoreResult.STORED -> {
            updateAllWidgets()
            Result.success()
          }
          SnapshotStoreResult.IGNORED -> {
            updateTop5AndMapTimestamp()
            Result.success()
          }
          SnapshotStoreResult.INVALID -> {
            updateTop5AndMapTimestamp()
            Result.failure()
          }
        }
      }
      SnapshotFetchResult.NoSnapshot -> {
        updateTop5AndMapTimestamp()
        Result.success()
      }
      SnapshotFetchResult.PermanentFailure -> {
        updateTop5AndMapTimestamp()
        Result.failure()
      }
      SnapshotFetchResult.TransientFailure -> {
        updateTop5AndMapTimestamp()
        Result.retry()
      }
    }
  }

  private fun fetchSnapshot(guildId: String): SnapshotFetchResult {
    val firebaseApp = try {
      FirebaseApp.getApps(applicationContext).firstOrNull()
        ?: FirebaseApp.initializeApp(applicationContext)
    } catch (_: Throwable) {
      null
    } ?: return SnapshotFetchResult.PermanentFailure

    val database = try {
      FirebaseDatabase.getInstance(firebaseApp)
    } catch (_: Throwable) {
      return SnapshotFetchResult.PermanentFailure
    }

    val reference = database.reference
      .child("guilds")
      .child(guildId)
      .child("GBG")
      .child("widgetSnapshot")

    return try {
      // get() is server-first and only falls back to the SDK's local cache if
      // the server cannot be reached. The Worker thread blocks until the Task
      // actually completes, so WorkManager never reports a premature success.
      val snapshot = Tasks.await(
        reference.get(),
        FIREBASE_READ_TIMEOUT_SECONDS,
        TimeUnit.SECONDS
      )
      if (!snapshot.exists()) {
        SnapshotFetchResult.NoSnapshot
      } else {
        val rawValue = snapshot.value
        if (rawValue is Map<*, *>) {
          try {
            @Suppress("UNCHECKED_CAST")
            SnapshotFetchResult.Success(
              JSONObject(rawValue as Map<String, Any?>)
            )
          } catch (_: Throwable) {
            SnapshotFetchResult.TransientFailure
          }
        } else {
          SnapshotFetchResult.TransientFailure
        }
      }
    } catch (_: TimeoutException) {
      SnapshotFetchResult.TransientFailure
    } catch (error: ExecutionException) {
      if (isPermanentFirebaseError(error.cause)) {
        SnapshotFetchResult.PermanentFailure
      } else {
        SnapshotFetchResult.TransientFailure
      }
    } catch (_: InterruptedException) {
      Thread.currentThread().interrupt()
      SnapshotFetchResult.TransientFailure
    } catch (_: Throwable) {
      SnapshotFetchResult.TransientFailure
    }
  }

  private fun storeSnapshot(
    snapshot: JSONObject,
    expectedGuildId: String,
    snapshotUpdatedAt: Long
  ): SnapshotStoreResult {
    val mapKey = normalizeMapKey(snapshot.optString("mapKey", DEFAULT_MAP_KEY))
    val next5 = sanitizeNext5(snapshot.optJSONArray("next5"))
    val sectorColors = snapshot.optJSONObject("sectorColors") ?: JSONObject()
    val sectorStaff = snapshot.optJSONObject("sectorStaff") ?: JSONObject()

    val template = loadMapTemplate(mapKey) ?: return SnapshotStoreResult.INVALID
    var mapSvg = template

    val sectorIds = linkedSetOf<String>()
    val colorKeys = sectorColors.keys()
    while (colorKeys.hasNext()) {
      normalizeSectorId(colorKeys.next())?.let(sectorIds::add)
    }
    val staffKeys = sectorStaff.keys()
    while (staffKeys.hasNext()) {
      normalizeSectorId(staffKeys.next())?.let(sectorIds::add)
    }

    sectorIds.forEach { sectorId ->
      val color = sectorColors.optString(sectorId, "").takeIf(HEX_COLOR_REGEX::matches)
      val isStaff = sectorStaff.optBoolean(sectorId, false)
      mapSvg = patchSectorGroup(
        mapSvg,
        sectorId,
        color,
        isStaff
      )
    }

    val fetchedAt = System.currentTimeMillis()
    val mapMeta = JSONObject()
      .put("mapKey", mapKey)
      .put("guildId", expectedGuildId)
      .put("snapshotUpdatedAt", snapshotUpdatedAt)
      .put("fetchedAt", fetchedAt)
      .put("sectorsCount", sectorColors.length())
      .put("staffCount", countTrueValues(sectorStaff))

    return when (GbgWidgetPrefs.setSnapshotIfGuildMatches(
      applicationContext,
      expectedGuildId,
      snapshotUpdatedAt,
      next5.toString(),
      mapMeta.toString(),
      mapSvg,
      fetchedAt
    )) {
      GbgWidgetPrefs.SnapshotWriteResult.STORED -> SnapshotStoreResult.STORED
      GbgWidgetPrefs.SnapshotWriteResult.GUILD_CHANGED,
      GbgWidgetPrefs.SnapshotWriteResult.STALE -> SnapshotStoreResult.IGNORED
      GbgWidgetPrefs.SnapshotWriteResult.WRITE_FAILED -> SnapshotStoreResult.INVALID
    }
  }

  private fun loadMapTemplate(mapKey: String): String? {
    val resourceName = when (mapKey) {
      WATERFALL_MAP_KEY -> "gbg_map_waterfall"
      else -> "gbg_map_volcanic"
    }
    val resourceId = applicationContext.resources.getIdentifier(
      resourceName,
      "raw",
      applicationContext.packageName
    )
    if (resourceId == 0) return null

    return try {
      applicationContext.resources.openRawResource(resourceId)
        .bufferedReader(StandardCharsets.UTF_8)
        .use { it.readText() }
    } catch (_: Throwable) {
      null
    }
  }

  private fun sanitizeNext5(source: JSONArray?): JSONArray {
    val sanitized = JSONArray()
    if (source == null) return sanitized

    for (index in 0 until minOf(source.length(), MAX_NEXT_SECTORS)) {
      val item = source.optJSONObject(index) ?: continue
      val sectorId = normalizeSectorId(item.optString("sectorId", "")) ?: continue
      val army = item.optString("army", "").lowercase().let {
        if (it == "attack" || it == "defense") it else ""
      }

      sanitized.put(
        JSONObject()
          .put("sectorId", sectorId)
          .put("openTime", item.optLong("openTime", 0L).coerceAtLeast(0L))
          .put("army", army)
          .put("bonusValue", item.optInt("bonusValue", 100).coerceIn(0, 100))
          .put("bonusReadyAt", item.optLong("bonusReadyAt", 0L).coerceAtLeast(0L))
      )
    }
    return sanitized
  }

  private fun normalizeMapKey(value: String): String =
    if (value == WATERFALL_MAP_KEY) WATERFALL_MAP_KEY else DEFAULT_MAP_KEY

  private fun normalizeSectorId(value: String): String? {
    val normalized = value.trim().uppercase()
    return normalized.takeIf { SECTOR_ID_REGEX.matches(it) }
  }

  private fun normalizeTimestamp(value: Long): Long {
    if (value <= 0L) return 0L
    return if (value < SECONDS_TO_MILLIS_THRESHOLD) value * 1000L else value
  }

  private fun getValidSnapshotUpdatedAt(
    snapshot: JSONObject,
    expectedGuildId: String
  ): Long? {
    val schemaVersion = snapshot.optInt("schemaVersion", snapshot.optInt("version", 0))
    if (schemaVersion != SUPPORTED_SCHEMA_VERSION) return null

    val snapshotGuildId = snapshot.optString("guildId", "").trim()
    if (snapshotGuildId.isNotEmpty() && snapshotGuildId != expectedGuildId) return null

    return normalizeTimestamp(snapshot.optLong("updatedAt", 0L))
  }

  private fun isPermanentFirebaseError(error: Throwable?): Boolean {
    val message = error?.message?.lowercase().orEmpty()
    return message.contains("permission_denied") ||
      message.contains("permission denied") ||
      message.contains("expired token") ||
      message.contains("invalid token")
  }

  private fun isValidFirebaseKey(value: String): Boolean =
    value.isNotEmpty() &&
      value.toByteArray(StandardCharsets.UTF_8).size <= MAX_FIREBASE_KEY_BYTES &&
      value.none { it == '.' || it == '#' || it == '$' || it == '[' || it == ']' || it == '/' }

  private fun countTrueValues(values: JSONObject): Int {
    var count = 0
    val keys = values.keys()
    while (keys.hasNext()) {
      if (values.optBoolean(keys.next(), false)) count += 1
    }
    return count
  }

  private fun patchSectorGroup(
    svg: String,
    sectorId: String,
    color: String?,
    isStaff: Boolean
  ): String {
    val escapedId = Regex.escape(sectorId)
    val groupRegex = Regex(
      """<g\b[^>]*\bid="$escapedId"[^>]*>[\s\S]*?</g>""",
      RegexOption.IGNORE_CASE
    )
    val groupMatch = groupRegex.find(svg) ?: return svg
    var group = groupMatch.value
    val pathMatches = PATH_TAG_REGEX.findAll(group).toList()

    val replacements = mutableListOf<Pair<IntRange, String>>()
    pathMatches.getOrNull(0)?.let { match ->
      if (color != null) {
        replacements += match.range to replaceTagStyleProperty(match.value, "fill", color)
      }
    }
    pathMatches.getOrNull(1)?.let { match ->
      replacements += match.range to replaceTagStyleProperty(
        match.value,
        "display",
        if (isStaff) "none" else "inline"
      )
    }
    pathMatches.getOrNull(2)?.let { match ->
      replacements += match.range to replaceTagStyleProperty(
        match.value,
        "display",
        if (isStaff) "inline" else "none"
      )
    }

    replacements.sortedByDescending { it.first.first }.forEach { (range, replacement) ->
      group = group.replaceRange(range, replacement)
    }
    return svg.replaceRange(groupMatch.range, group)
  }

  private fun replaceTagStyleProperty(
    tag: String,
    property: String,
    value: String
  ): String {
    val styleRegex = Regex("""\bstyle="([^"]*)"""", RegexOption.IGNORE_CASE)
    val styleMatch = styleRegex.find(tag) ?: return tag
    val currentStyle = styleMatch.groupValues[1]
    val propertyRegex = Regex(
      """(^|;)\s*${Regex.escape(property)}\s*:[^;]*""",
      RegexOption.IGNORE_CASE
    )
    val propertyMatch = propertyRegex.find(currentStyle)
    val newStyle = if (propertyMatch != null) {
      val separator = propertyMatch.groupValues[1]
      currentStyle.replaceRange(propertyMatch.range, "$separator$property:$value")
    } else {
      "${currentStyle.trimEnd(';')};$property:$value"
    }
    val newTag = tag.replaceRange(
      styleMatch.groups[1]!!.range,
      newStyle
    )
    return newTag
  }

  private fun updateAllWidgets() {
    val manager = AppWidgetManager.getInstance(applicationContext)

    val top5Ids = manager.getAppWidgetIds(
      ComponentName(applicationContext, GBGTop5SectorsWidgetProvider::class.java)
    )
    top5Ids.forEach { widgetId ->
      val views = RemoteViews(applicationContext.packageName, R.layout.widget_gbg_top5_sectors)
      GBGTop5SectorsWidgetProvider.render(applicationContext, views)
      manager.updateAppWidget(widgetId, views)
    }

    val mapIds = manager.getAppWidgetIds(
      ComponentName(applicationContext, GBGMapWidgetProvider::class.java)
    )
    mapIds.forEach { widgetId ->
      val views = RemoteViews(applicationContext.packageName, R.layout.widget_gbg_map)
      GBGMapWidgetProvider.render(applicationContext, views)
      manager.updateAppWidget(widgetId, views)
    }
  }

  private fun updateTop5AndMapTimestamp() {
    val manager = AppWidgetManager.getInstance(applicationContext)

    val top5Ids = manager.getAppWidgetIds(
      ComponentName(applicationContext, GBGTop5SectorsWidgetProvider::class.java)
    )
    top5Ids.forEach { widgetId ->
      val views = RemoteViews(applicationContext.packageName, R.layout.widget_gbg_top5_sectors)
      GBGTop5SectorsWidgetProvider.render(applicationContext, views)
      manager.updateAppWidget(widgetId, views)
    }

    val mapIds = manager.getAppWidgetIds(
      ComponentName(applicationContext, GBGMapWidgetProvider::class.java)
    )
    if (mapIds.isNotEmpty()) {
      val views = RemoteViews(applicationContext.packageName, R.layout.widget_gbg_map)
      GBGMapWidgetProvider.renderUpdatedAt(applicationContext, views)
      manager.partiallyUpdateAppWidget(mapIds, views)
    }
  }

  private sealed class SnapshotFetchResult {
    data class Success(val snapshot: JSONObject) : SnapshotFetchResult()
    data object NoSnapshot : SnapshotFetchResult()
    data object PermanentFailure : SnapshotFetchResult()
    data object TransientFailure : SnapshotFetchResult()
  }

  private enum class SnapshotStoreResult {
    STORED,
    IGNORED,
    INVALID
  }

  companion object {
    private const val SUPPORTED_SCHEMA_VERSION = 1
    private const val DEFAULT_MAP_KEY = "volcanic_archipelago"
    private const val WATERFALL_MAP_KEY = "waterfall_archipelago"
    private const val MAX_NEXT_SECTORS = 5
    private const val FIREBASE_READ_TIMEOUT_SECONDS = 20L
    private const val MAX_FIREBASE_KEY_BYTES = 768
    private const val SECONDS_TO_MILLIS_THRESHOLD = 1_000_000_000_000L
    private val SECTOR_ID_REGEX = Regex("^[A-Z0-9]{1,12}$")
    private val HEX_COLOR_REGEX = Regex("^#[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?$")
    private val PATH_TAG_REGEX = Regex("""<path\b[^>]*/?>""", RegexOption.IGNORE_CASE)
  }
}
