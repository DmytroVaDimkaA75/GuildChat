const { AndroidConfig, withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const writeFile = (filePath, contents) => {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, contents, 'utf8');
};

const upsertReceiver = (application, receiverConfig) => {
  application.receiver = application.receiver || [];
  const exists = application.receiver.some((item) => item.$['android:name'] === receiverConfig.$['android:name']);
  if (!exists) {
    application.receiver.push(receiverConfig);
  }
};

const withGbgWidgets = (config) => {
  config = withAndroidManifest(config, (config) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    const packageName = config.android?.package;

    if (packageName) {
      const mapProviderName = `${packageName}.widgets.GBGMapWidgetProvider`;
      const scheduleProviderName = `${packageName}.widgets.GBGScheduleWidgetProvider`;

      upsertReceiver(application, {
        $: {
          'android:name': mapProviderName,
          'android:exported': 'false',
        },
        'intent-filter': [
          {
            action: [
              { $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } },
            ],
          },
        ],
        'meta-data': [
          {
            $: {
              'android:name': 'android.appwidget.provider',
              'android:resource': '@xml/gbg_map_widget_info',
            },
          },
        ],
      });

      upsertReceiver(application, {
        $: {
          'android:name': scheduleProviderName,
          'android:exported': 'false',
        },
        'intent-filter': [
          {
            action: [
              { $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } },
            ],
          },
        ],
        'meta-data': [
          {
            $: {
              'android:name': 'android.appwidget.provider',
              'android:resource': '@xml/gbg_schedule_widget_info',
            },
          },
        ],
      });
    }

    return config;
  });

  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const packageName = config.android?.package || 'com.guildchat';
      const packagePath = packageName.replace(/\./g, '/');
      const androidMainPath = path.join(projectRoot, 'android', 'app', 'src', 'main');
      const javaPath = path.join(androidMainPath, 'java', packagePath, 'widgets');
      const resLayoutPath = path.join(androidMainPath, 'res', 'layout');
      const resDrawablePath = path.join(androidMainPath, 'res', 'drawable');
      const resXmlPath = path.join(androidMainPath, 'res', 'xml');

      writeFile(
        path.join(javaPath, 'GBGMapWidgetProvider.kt'),
        `package ${packageName}.widgets

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.graphics.BitmapFactory
import android.view.View
import android.widget.RemoteViews
import ${packageName}.R
import org.json.JSONObject
import java.io.File

class GBGMapWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        appWidgetIds.forEach { appWidgetId ->
            val views = RemoteViews(context.packageName, R.layout.gbg_map_widget)
            val dataFile = File(context.filesDir, "gbg_widgets/gbg_map_widget.json")
            val imageFile = File(context.filesDir, "gbg_widgets/gbg_map_widget.png")

            if (dataFile.exists()) {
                runCatching {
                    val json = JSONObject(dataFile.readText())
                    val mapTitle = json.optString("mapTitle", "")
                    val updatedLabel = json.optString("updatedLabel", "")
                    val subtitle = listOf(mapTitle, updatedLabel).filter { it.isNotBlank() }.joinToString(" • ")
                    if (subtitle.isNotBlank()) {
                        views.setTextViewText(R.id.gbg_map_widget_subtitle, subtitle)
                    }
                }
            }

            val bitmap = if (imageFile.exists()) BitmapFactory.decodeFile(imageFile.absolutePath) else null
            if (bitmap != null) {
                views.setImageViewBitmap(R.id.gbg_map_widget_image, bitmap)
                views.setViewVisibility(R.id.gbg_map_widget_image, View.VISIBLE)
                views.setViewVisibility(R.id.gbg_map_widget_empty, View.GONE)
            } else {
                views.setViewVisibility(R.id.gbg_map_widget_image, View.GONE)
                views.setViewVisibility(R.id.gbg_map_widget_empty, View.VISIBLE)
            }
            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
`
      );

      writeFile(
        path.join(javaPath, 'GBGScheduleWidgetProvider.kt'),
        `package ${packageName}.widgets

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.view.View
import android.widget.RemoteViews
import ${packageName}.R
import org.json.JSONObject
import java.io.File

class GBGScheduleWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        appWidgetIds.forEach { appWidgetId ->
            val views = RemoteViews(context.packageName, R.layout.gbg_schedule_widget)
            val dataFile = File(context.filesDir, "gbg_widgets/gbg_schedule_widget.json")
            val itemIds = listOf(
                R.id.gbg_schedule_item_1,
                R.id.gbg_schedule_item_2,
                R.id.gbg_schedule_item_3,
                R.id.gbg_schedule_item_4,
                R.id.gbg_schedule_item_5,
            )

            if (dataFile.exists()) {
                runCatching {
                    val json = JSONObject(dataFile.readText())
                    val updatedLabel = json.optString("updatedLabel", "")
                    if (updatedLabel.isNotBlank()) {
                        views.setTextViewText(R.id.gbg_schedule_widget_subtitle, "Оновлено $updatedLabel")
                    }
                    val lines = json.optJSONArray("lines")
                    itemIds.forEachIndexed { index, viewId ->
                        val text = lines?.optString(index)?.takeIf { it.isNotBlank() } ?: ""
                        views.setTextViewText(viewId, text)
                        views.setViewVisibility(viewId, if (text.isBlank()) View.GONE else View.VISIBLE)
                    }
                    val hasItems = (0 until (lines?.length() ?: 0)).any { lines?.optString(it)?.isNotBlank() == true }
                    views.setViewVisibility(R.id.gbg_schedule_widget_empty, if (hasItems) View.GONE else View.VISIBLE)
                }
            } else {
                itemIds.forEach { viewId -> views.setViewVisibility(viewId, View.GONE) }
                views.setViewVisibility(R.id.gbg_schedule_widget_empty, View.VISIBLE)
            }
            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
`
      );

      writeFile(
        path.join(resLayoutPath, 'gbg_map_widget.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:background="@drawable/gbg_widget_background"
    android:orientation="vertical"
    android:padding="12dp">

    <TextView
        android:id="@+id/gbg_map_widget_title"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:text="GBG: карта секторів"
        android:textColor="@android:color/white"
        android:textSize="16sp"
        android:textStyle="bold" />

    <TextView
        android:id="@+id/gbg_map_widget_subtitle"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="4dp"
        android:text="Оновлено --:--"
        android:textColor="#B0B0B0"
        android:textSize="12sp" />

    <ImageView
        android:id="@+id/gbg_map_widget_image"
        android:layout_width="match_parent"
        android:layout_height="0dp"
        android:layout_marginTop="8dp"
        android:layout_weight="1"
        android:adjustViewBounds="true"
        android:contentDescription="GBG карта секторів"
        android:scaleType="fitCenter" />

    <TextView
        android:id="@+id/gbg_map_widget_empty"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="8dp"
        android:text="Відкрийте застосунок, щоб оновити карту"
        android:textColor="#E0E0E0"
        android:textSize="12sp"
        android:visibility="gone" />
</LinearLayout>
`
      );

      writeFile(
        path.join(resLayoutPath, 'gbg_schedule_widget.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:background="@drawable/gbg_widget_background"
    android:orientation="vertical"
    android:padding="12dp">

    <TextView
        android:id="@+id/gbg_schedule_widget_title"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:text="GBG: найближчі сектори"
        android:textColor="@android:color/white"
        android:textSize="16sp"
        android:textStyle="bold" />

    <TextView
        android:id="@+id/gbg_schedule_widget_subtitle"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="4dp"
        android:text="Оновлено --:--"
        android:textColor="#B0B0B0"
        android:textSize="12sp" />

    <TextView
        android:id="@+id/gbg_schedule_item_1"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="8dp"
        android:ellipsize="end"
        android:maxLines="1"
        android:textColor="@android:color/white"
        android:textSize="13sp" />

    <TextView
        android:id="@+id/gbg_schedule_item_2"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="4dp"
        android:ellipsize="end"
        android:maxLines="1"
        android:textColor="@android:color/white"
        android:textSize="13sp" />

    <TextView
        android:id="@+id/gbg_schedule_item_3"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="4dp"
        android:ellipsize="end"
        android:maxLines="1"
        android:textColor="@android:color/white"
        android:textSize="13sp" />

    <TextView
        android:id="@+id/gbg_schedule_item_4"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="4dp"
        android:ellipsize="end"
        android:maxLines="1"
        android:textColor="@android:color/white"
        android:textSize="13sp" />

    <TextView
        android:id="@+id/gbg_schedule_item_5"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="4dp"
        android:ellipsize="end"
        android:maxLines="1"
        android:textColor="@android:color/white"
        android:textSize="13sp" />

    <TextView
        android:id="@+id/gbg_schedule_widget_empty"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="8dp"
        android:text="Немає даних про відкриття секторів"
        android:textColor="#E0E0E0"
        android:textSize="12sp"
        android:visibility="gone" />
</LinearLayout>
`
      );

      writeFile(
        path.join(resDrawablePath, 'gbg_widget_background.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android">
    <solid android:color="#1c1c1e" />
    <corners android:radius="24dp" />
</shape>
`
      );

      writeFile(
        path.join(resXmlPath, 'gbg_map_widget_info.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="180dp"
    android:minHeight="180dp"
    android:updatePeriodMillis="1800000"
    android:initialLayout="@layout/gbg_map_widget"
    android:resizeMode="horizontal|vertical"
    android:widgetCategory="home_screen" />
`
      );

      writeFile(
        path.join(resXmlPath, 'gbg_schedule_widget_info.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="180dp"
    android:minHeight="110dp"
    android:updatePeriodMillis="1800000"
    android:initialLayout="@layout/gbg_schedule_widget"
    android:resizeMode="horizontal|vertical"
    android:widgetCategory="home_screen" />
`
      );

      return config;
    },
  ]);

  return config;
};

module.exports = withGbgWidgets;
