package com.foechat.mobile.widgets

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

class GbgWidgetRefreshService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    return HeadlessJsTaskConfig(
      "GbgWidgetRefreshTask",
      Arguments.createMap(),
      60_000,
      true
    )
  }
}
