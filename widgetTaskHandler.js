import React from 'react';
import { GBGMapWidget } from './widgets/GBGMapWidget';
import { GBGTimersWidget } from './widgets/GBGTimersWidget';

export default async function widgetTaskHandler(taskData) {
  const rawName =
    taskData?.widgetName ||
    taskData?.appWidgetProvider ||
    taskData?.name ||
    '';

  const n = String(rawName).toLowerCase();

  // Підлаштовуємось під різні формати, які може передати Android/бібліотека
  const isMap = n.includes('gbgmap') || n.includes('gbg_map') || n.includes('gbgmapwidgetprovider');
  const isTimers = n.includes('gbgtimers') || n.includes('gbg_timers') || n.includes('gbgtimerswidgetprovider');

  if (isMap) return <GBGMapWidget />;
  if (isTimers) return <GBGTimersWidget />;

  // fallback
  return <GBGTimersWidget />;
}
