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
      const resXmlPath = path.join(androidMainPath, 'res', 'xml');

      writeFile(
        path.join(javaPath, 'GBGMapWidgetProvider.kt'),
        `package ${packageName}.widgets

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews
import ${packageName}.R

class GBGMapWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        appWidgetIds.forEach { appWidgetId ->
            val views = RemoteViews(context.packageName, R.layout.gbg_map_widget)
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
import android.widget.RemoteViews
import ${packageName}.R

class GBGScheduleWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        appWidgetIds.forEach { appWidgetId ->
            val views = RemoteViews(context.packageName, R.layout.gbg_schedule_widget)
            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
`
      );

      writeFile(
        path.join(resLayoutPath, 'gbg_map_widget.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:background="@android:color/black"
    android:padding="12dp">

    <TextView
        android:id="@+id/gbg_map_widget_title"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:text="GBG: карта секторів"
        android:textColor="@android:color/white"
        android:textSize="16sp"
        android:textStyle="bold" />
</FrameLayout>
`
      );

      writeFile(
        path.join(resLayoutPath, 'gbg_schedule_widget.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:background="@android:color/black"
    android:padding="12dp">

    <TextView
        android:id="@+id/gbg_schedule_widget_title"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:text="GBG: найближчі сектори"
        android:textColor="@android:color/white"
        android:textSize="16sp"
        android:textStyle="bold" />
</FrameLayout>
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
