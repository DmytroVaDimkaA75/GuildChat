import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import GBGMapView from './GBGMapView';
import useGbgWidgetData from './useGbgWidgetData';
import { formatRemaining, getMapTitle } from './gbgWidgetUtils';

const MAX_SCHEDULE_ITEMS = 5;
const WIDGET_DIR = 'gbg_widgets';
const MAP_IMAGE_FILE = 'gbg_map_widget.png';
const MAP_DATA_FILE = 'gbg_map_widget.json';
const SCHEDULE_DATA_FILE = 'gbg_schedule_widget.json';

const buildScheduleLines = (schedule, nowSeconds) => schedule.slice(0, MAX_SCHEDULE_ITEMS).map(item => {
    const timeRemaining = item.openTime ? Math.max(item.openTime - nowSeconds, 0) : null;
    const timeLabel = item.openTime ? formatRemaining(timeRemaining) : '--:--:--';
    const armyLabel = item.army === 'attack' ? 'АТК' : item.army === 'defense' ? 'ЗХС' : '';
    const bonusReadyRemaining = item.bonusReadyAt && item.bonusReadyAt > nowSeconds ? formatRemaining(item.bonusReadyAt - nowSeconds) : null;
    const bonusLabel = bonusReadyRemaining ? `${item.bonusValue}% (${bonusReadyRemaining})` : `${item.bonusValue}%`;
    return [item.name, timeLabel, armyLabel, bonusLabel].filter(Boolean).join(' • ');
});

const GBGWidgetSync = () => {
    const { isReady, mapDimensions, mapKey, sectorColors, sectorSchedule, sectorStaff } = useGbgWidgetData();
    const [ViewShotComponent, setViewShotComponent] = useState(null);
    const [fileSystem, setFileSystem] = useState(null);
    const viewShotRef = useRef(null);
    const isCapturingRef = useRef(false);

    const mapTitle = useMemo(() => getMapTitle(mapKey), [mapKey]);

    useEffect(() => {
        let isActive = true;
        import('react-native-view-shot')
            .then(module => {
                if (isActive) setViewShotComponent(() => module.default ?? module.ViewShot ?? null);
            })
            .catch(() => {
                if (isActive) setViewShotComponent(null);
            });
        import('expo-file-system')
            .then(module => {
                if (isActive) setFileSystem(module);
            })
            .catch(() => {
                if (isActive) setFileSystem(null);
            });
        return () => { isActive = false; };
    }, []);

    useEffect(() => {
        if (!isReady || !fileSystem) return;
        const syncSchedule = async () => {
            const now = Math.floor(Date.now() / 1000);
            const updatedLabel = new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
            const lines = buildScheduleLines(sectorSchedule, now);
            const widgetDir = `${fileSystem.documentDirectory}${WIDGET_DIR}/`;
            const schedulePath = `${widgetDir}${SCHEDULE_DATA_FILE}`;
            const info = await fileSystem.getInfoAsync(widgetDir);
            if (!info.exists) {
                await fileSystem.makeDirectoryAsync(widgetDir, { intermediates: true });
            }
            await fileSystem.writeAsStringAsync(schedulePath, JSON.stringify({
                updatedAt: now,
                updatedLabel,
                lines,
            }));
        };
        syncSchedule();
    }, [fileSystem, isReady, sectorSchedule]);

    useEffect(() => {
        if (!isReady || !fileSystem || !ViewShotComponent || isCapturingRef.current) return;
        const captureMap = async () => {
            try {
                isCapturingRef.current = true;
                const updatedLabel = new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
                const tempUri = await viewShotRef.current?.capture?.({
                    format: 'png',
                    quality: 1,
                });
                if (tempUri) {
                    const widgetDir = `${fileSystem.documentDirectory}${WIDGET_DIR}/`;
                    const mapImagePath = `${widgetDir}${MAP_IMAGE_FILE}`;
                    const mapDataPath = `${widgetDir}${MAP_DATA_FILE}`;
                    const info = await fileSystem.getInfoAsync(widgetDir);
                    if (!info.exists) {
                        await fileSystem.makeDirectoryAsync(widgetDir, { intermediates: true });
                    }
                    await fileSystem.moveAsync({ from: tempUri, to: mapImagePath });
                    await fileSystem.writeAsStringAsync(mapDataPath, JSON.stringify({
                        updatedAt: Math.floor(Date.now() / 1000),
                        updatedLabel,
                        mapKey,
                        mapTitle,
                    }));
                }
            } finally {
                isCapturingRef.current = false;
            }
        };
        captureMap();
    }, [ViewShotComponent, fileSystem, isReady, mapKey, mapTitle, sectorColors, sectorStaff]);

    return (
        <View style={styles.hidden}>
            {ViewShotComponent && (
                <ViewShotComponent ref={viewShotRef} style={styles.captureContainer} options={{ format: 'png', quality: 1 }}>
                    <GBGMapView
                        isReady={isReady}
                        mapDimensions={mapDimensions}
                        mapKey={mapKey}
                        sectorColors={sectorColors}
                        sectorStaff={sectorStaff}
                    />
                </ViewShotComponent>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    hidden: {
        position: 'absolute',
        left: -9999,
        top: -9999,
        width: 1,
        height: 1,
        opacity: 0,
    },
    captureContainer: {
        width: 320,
        height: 320,
    },
});

export default GBGWidgetSync;
