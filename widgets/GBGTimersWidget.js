import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';

export function GBGTimersWidget() {
  return (
    <FlexWidget
      style={{
        width: 'match_parent',
        height: 'match_parent',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 12,
      }}
      clickAction="OPEN_APP"
    >
      <TextWidget text="GBG Таймери — OK" style={{ fontSize: 18 }} />
      <TextWidget text="(наступний крок: список секторів)" style={{ fontSize: 12 }} />
    </FlexWidget>
  );
}
