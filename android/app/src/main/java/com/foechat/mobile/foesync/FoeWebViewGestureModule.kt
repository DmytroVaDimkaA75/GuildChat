package com.foechat.mobile.foesync

import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.InputDevice
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.UIManagerHelper
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.max

/**
 * Replays real Android touch gestures directly on the Forge of Empires WebView.
 *
 * JavaScript-created TouchEvent/MouseEvent objects reach DOM listeners, but they
 * do not travel through Android WebView's native input pipeline. The game camera
 * relies on that pipeline, so the settlement diagnostic uses this narrow bridge
 * for both panning and tapping.
 */
class FoeWebViewGestureModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  companion object {
    private const val HOLD_BEFORE_MOVE_MS = 80L
    private const val MOVE_INTERVAL_MS = 16L
    private const val MOVE_STEPS = 20
    private const val RELEASE_DELAY_MS = 32L
    private const val BETWEEN_SEGMENTS_MS = 110L
    private const val VIEW_MARGIN_RATIO = 0.15f
    private const val MAX_SEGMENTS = 24
    private const val MAX_ABS_DELTA_RATIO = 16.0
    private const val JS_HANDSHAKE_TIMEOUT_MS = 1_000L
    private const val TAP_HOLD_MS = 90L
  }

  private val mainHandler = Handler(Looper.getMainLooper())
  private var gestureRunning = false

  override fun getName(): String = "FoeWebViewGesture"

  /**
   * @param reactTag native tag emitted by react-native-webview in event.nativeEvent.target
   * @param deltaXRatio recorded finger X displacement divided by the canvas width
   * @param deltaYRatio recorded finger Y displacement divided by the canvas height
   */
  @ReactMethod
  fun swipe(
    reactTag: Double,
    deltaXRatio: Double,
    deltaYRatio: Double,
    promise: Promise,
  ) {
    if (!reactTag.isFinite() || reactTag <= 0 || reactTag != reactTag.toInt().toDouble()) {
      promise.reject("E_INVALID_TAG", "WebView tag is invalid")
      return
    }
    if (
      !deltaXRatio.isFinite() ||
      !deltaYRatio.isFinite() ||
      abs(deltaXRatio) > MAX_ABS_DELTA_RATIO ||
      abs(deltaYRatio) > MAX_ABS_DELTA_RATIO
    ) {
      promise.reject("E_INVALID_DELTA", "Recorded pan displacement is invalid")
      return
    }

    mainHandler.post {
      if (gestureRunning) {
        promise.reject("E_GESTURE_BUSY", "Another WebView gesture is already running")
        return@post
      }

      val tag = reactTag.toInt()
      val wrapper = try {
        UIManagerHelper.getUIManagerForReactTag(reactContext, tag)?.resolveView(tag)
      } catch (_error: Exception) {
        null
      }
      val webView = findWebView(wrapper)

      if (webView == null || !webView.isAttachedToWindow) {
        promise.reject("E_WEBVIEW_NOT_FOUND", "Forge of Empires WebView is not mounted")
        return@post
      }
      if (!isForgeOfEmpiresUrl(webView.url)) {
        promise.reject("E_WRONG_WEBVIEW", "Resolved WebView is not Forge of Empires")
        return@post
      }
      if (webView.width <= 0 || webView.height <= 0) {
        promise.reject("E_WEBVIEW_SIZE", "Forge of Empires WebView has no visible size")
        return@post
      }

      val totalDeltaX = (deltaXRatio * webView.width).toFloat()
      val totalDeltaY = (deltaYRatio * webView.height).toFloat()
      if (abs(totalDeltaX) < 1f && abs(totalDeltaY) < 1f) {
        promise.resolve(false)
        return@post
      }

      val usableWidth = webView.width * (1f - 2f * VIEW_MARGIN_RATIO)
      val usableHeight = webView.height * (1f - 2f * VIEW_MARGIN_RATIO)
      val segmentCount = max(
        1,
        max(
          ceil(abs(totalDeltaX) / usableWidth).toInt(),
          ceil(abs(totalDeltaY) / usableHeight).toInt(),
        ),
      )
      if (segmentCount > MAX_SEGMENTS) {
        promise.reject("E_TOO_MANY_SEGMENTS", "Recorded pan is too long to replay safely")
        return@post
      }

      gestureRunning = true
      beginPanCaptureSuppression(
        webView = webView,
        onReady = {
          replaySegment(
            webView = webView,
            segmentIndex = 0,
            segmentCount = segmentCount,
            segmentDeltaX = totalDeltaX / segmentCount,
            segmentDeltaY = totalDeltaY / segmentCount,
            onComplete = {
              endPanCaptureSuppression(webView) {
                gestureRunning = false
                promise.resolve(true)
              }
            },
            onError = { code, message ->
              endPanCaptureSuppression(webView) {
                gestureRunning = false
                promise.reject(code, message)
              }
            },
          )
        },
        onError = { code, message ->
          gestureRunning = false
          promise.reject(code, message)
        },
      )
    }
  }

  /**
   * @param reactTag native tag emitted by react-native-webview in event.nativeEvent.target
   * @param xRatio tap X coordinate divided by the WebView width
   * @param yRatio tap Y coordinate divided by the WebView height
   * @param attemptId watcher token armed in the current WebView document
   */
  @ReactMethod
  fun tap(
    reactTag: Double,
    xRatio: Double,
    yRatio: Double,
    attemptId: String,
    promise: Promise,
  ) {
    if (!reactTag.isFinite() || reactTag <= 0 || reactTag != reactTag.toInt().toDouble()) {
      promise.reject("E_INVALID_TAG", "WebView tag is invalid")
      return
    }
    if (attemptId.isBlank() || attemptId.length > 128) {
      promise.reject("E_INVALID_ATTEMPT", "WebView tap attempt identifier is invalid")
      return
    }
    if (
      !xRatio.isFinite() ||
      !yRatio.isFinite() ||
      xRatio !in 0.0..1.0 ||
      yRatio !in 0.0..1.0
    ) {
      promise.reject("E_INVALID_COORDINATES", "WebView tap coordinates are invalid")
      return
    }

    mainHandler.post {
      if (gestureRunning) {
        promise.reject("E_GESTURE_BUSY", "Another WebView gesture is already running")
        return@post
      }

      val tag = reactTag.toInt()
      val wrapper = try {
        UIManagerHelper.getUIManagerForReactTag(reactContext, tag)?.resolveView(tag)
      } catch (_error: Exception) {
        null
      }
      val webView = findWebView(wrapper)

      if (webView == null || !webView.isAttachedToWindow) {
        promise.reject("E_WEBVIEW_NOT_FOUND", "Forge of Empires WebView is not mounted")
        return@post
      }
      if (!isForgeOfEmpiresUrl(webView.url)) {
        promise.reject("E_WRONG_WEBVIEW", "Resolved WebView is not Forge of Empires")
        return@post
      }
      if (webView.width <= 0 || webView.height <= 0) {
        promise.reject("E_WEBVIEW_SIZE", "Forge of Empires WebView has no visible size")
        return@post
      }

      val x = (xRatio * webView.width).toFloat().coerceIn(0f, webView.width - 1f)
      val y = (yRatio * webView.height).toFloat().coerceIn(0f, webView.height - 1f)
      gestureRunning = true

      try {
        webView.requestFocusFromTouch()
      } catch (_error: Exception) {
        gestureRunning = false
        promise.reject("E_WEBVIEW_FOCUS", "Forge of Empires WebView could not receive focus")
        return@post
      }

      if (!webView.isAttachedToWindow || webView.width <= 0 || webView.height <= 0) {
        gestureRunning = false
        promise.reject("E_WEBVIEW_DETACHED", "Forge of Empires WebView detached before the tap")
        return@post
      }

      val downTime = SystemClock.uptimeMillis()
      if (!dispatchTouch(webView, downTime, MotionEvent.ACTION_DOWN, x, y)) {
        gestureRunning = false
        promise.reject("E_TOUCH_NOT_HANDLED", "Forge of Empires WebView rejected the tap")
        return@post
      }

      mainHandler.postDelayed(
        tapRelease@{
          if (!webView.isAttachedToWindow || webView.width <= 0 || webView.height <= 0) {
            dispatchTouch(webView, downTime, MotionEvent.ACTION_CANCEL, x, y)
            gestureRunning = false
            promise.reject("E_WEBVIEW_DETACHED", "Forge of Empires WebView was detached during the tap")
            return@tapRelease
          }

          val handled = dispatchTouch(webView, downTime, MotionEvent.ACTION_UP, x, y)
          gestureRunning = false
          if (handled) {
            promise.resolve(true)
          } else {
            promise.reject("E_TOUCH_NOT_HANDLED", "Forge of Empires WebView rejected the tap")
          }
        },
        TAP_HOLD_MS,
      )
    }
  }

  private fun replaySegment(
    webView: WebView,
    segmentIndex: Int,
    segmentCount: Int,
    segmentDeltaX: Float,
    segmentDeltaY: Float,
    onComplete: () -> Unit,
    onError: (String, String) -> Unit,
  ) {
    if (segmentIndex >= segmentCount) {
      onComplete()
      return
    }
    if (!webView.isAttachedToWindow || webView.width <= 0 || webView.height <= 0) {
      onError("E_WEBVIEW_DETACHED", "Forge of Empires WebView was detached during the gesture")
      return
    }

    val startX = webView.width / 2f - segmentDeltaX / 2f
    val startY = webView.height / 2f - segmentDeltaY / 2f
    val endX = startX + segmentDeltaX
    val endY = startY + segmentDeltaY
    val downTime = SystemClock.uptimeMillis()

    if (!dispatchTouch(webView, downTime, MotionEvent.ACTION_DOWN, startX, startY)) {
      onError("E_TOUCH_NOT_HANDLED", "Forge of Empires WebView rejected the touch gesture")
      return
    }

    var step = 0
    val moveRunnable = object : Runnable {
      override fun run() {
        if (!webView.isAttachedToWindow) {
          onError("E_WEBVIEW_DETACHED", "Forge of Empires WebView was detached during the gesture")
          return
        }

        step += 1
        val progress = step.toFloat() / MOVE_STEPS
        val x = startX + (endX - startX) * progress
        val y = startY + (endY - startY) * progress
        dispatchTouch(webView, downTime, MotionEvent.ACTION_MOVE, x, y)

        if (step < MOVE_STEPS) {
          mainHandler.postDelayed(this, MOVE_INTERVAL_MS)
          return
        }

        mainHandler.postDelayed({
          if (!webView.isAttachedToWindow) {
            onError("E_WEBVIEW_DETACHED", "Forge of Empires WebView was detached during the gesture")
            return@postDelayed
          }
          dispatchTouch(webView, downTime, MotionEvent.ACTION_UP, endX, endY)
          mainHandler.postDelayed(
            {
              replaySegment(
                webView,
                segmentIndex + 1,
                segmentCount,
                segmentDeltaX,
                segmentDeltaY,
                onComplete,
                onError,
              )
            },
            BETWEEN_SEGMENTS_MS,
          )
        }, RELEASE_DELAY_MS)
      }
    }
    mainHandler.postDelayed(moveRunnable, HOLD_BEFORE_MOVE_MS)
  }

  private fun beginPanCaptureSuppression(
    webView: WebView,
    onReady: () -> Unit,
    onError: (String, String) -> Unit,
  ) {
    var settled = false
    val timeout = Runnable {
      if (!settled) {
        settled = true
        endPanCaptureSuppression(webView) {
          onError("E_JS_HANDSHAKE", "Forge of Empires did not prepare for the native gesture")
        }
      }
    }
    mainHandler.postDelayed(timeout, JS_HANDSHAKE_TIMEOUT_MS)

    try {
      webView.evaluateJavascript(
        "window.__foeNativePanActive = true; true;",
      ) {
        if (!settled) {
          settled = true
          mainHandler.removeCallbacks(timeout)
          onReady()
        }
      }
    } catch (_error: Exception) {
      mainHandler.removeCallbacks(timeout)
      if (!settled) {
        settled = true
        onError("E_JS_HANDSHAKE", "Forge of Empires could not prepare for the native gesture")
      }
    }
  }

  private fun endPanCaptureSuppression(webView: WebView, onComplete: () -> Unit) {
    var settled = false
    val completeOnce = {
      if (!settled) {
        settled = true
        onComplete()
      }
    }
    val timeout = Runnable { completeOnce() }
    mainHandler.postDelayed(timeout, JS_HANDSHAKE_TIMEOUT_MS)

    try {
      webView.evaluateJavascript(
        "window.__foeNativePanActive = false; true;",
      ) {
        mainHandler.removeCallbacks(timeout)
        completeOnce()
      }
    } catch (_error: Exception) {
      mainHandler.removeCallbacks(timeout)
      completeOnce()
    }
  }

  private fun dispatchTouch(
    webView: WebView,
    downTime: Long,
    action: Int,
    x: Float,
    y: Float,
  ): Boolean {
    val eventTime = SystemClock.uptimeMillis()
    val event = MotionEvent.obtain(downTime, eventTime, action, x, y, 0)
    event.source = InputDevice.SOURCE_TOUCHSCREEN
    return try {
      webView.dispatchTouchEvent(event)
    } catch (_error: Exception) {
      false
    } finally {
      event.recycle()
    }
  }

  private fun findWebView(view: View?): WebView? {
    if (view is WebView) return view
    if (view !is ViewGroup) return null
    for (index in 0 until view.childCount) {
      findWebView(view.getChildAt(index))?.let { return it }
    }
    return null
  }

  private fun isForgeOfEmpiresUrl(url: String?): Boolean {
    val host = try {
      Uri.parse(url.orEmpty()).host.orEmpty().lowercase()
    } catch (_error: Exception) {
      ""
    }
    return host == "forgeofempires.com" || host.endsWith(".forgeofempires.com")
  }
}
