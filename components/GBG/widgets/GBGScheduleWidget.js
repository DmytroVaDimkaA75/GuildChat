import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import useGbgWidgetData from './useGbgWidgetData';
import { formatRemaining, getArmyColor } from './gbgWidgetUtils';

const GBGScheduleWidget = () => {
    const { currentTime, isReady, sectorSchedule } = useGbgWidgetData();

    const upcoming = useMemo(() => sectorSchedule.slice(0, 5), [sectorSchedule]);

    if (!isReady) {
        return (
            <View style={styles.loaderContainer}>
                <ActivityIndicator size="small" color="#3498db" />
                <Text style={styles.loaderText}>Завантаження секторів...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Відкриття секторів</Text>
            {upcoming.length > 0 ? (
                <View style={styles.list}>
                    {upcoming.map(item => {
                        const timeRemainingSeconds = item.openTime ? Math.max(item.openTime - currentTime, 0) : 0;
                        return (
                            <View key={item.name} style={styles.row}>
                                <View style={styles.rowLeft}>
                                    <View style={[styles.armyBox, { backgroundColor: getArmyColor(item.army) }]} />
                                    <Text style={styles.sectorName}>{item.name}</Text>
                                </View>
                                <Text style={styles.sectorTime}>{item.openTime ? formatRemaining(timeRemainingSeconds) : '--:--:--'}</Text>
                            </View>
                        );
                    })}
                </View>
            ) : (
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>Найближчим часом секторів немає</Text>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#1c1c1e',
        borderRadius: 24,
        padding: 16,
        width: '100%',
    },
    title: {
        color: '#EDEDED',
        fontSize: 20,
        fontWeight: '700',
        marginBottom: 12,
    },
    list: {
        gap: 12,
    },
    row: {
        backgroundColor: '#2C2C2E',
        borderRadius: 18,
        paddingVertical: 12,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    rowLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    armyBox: {
        width: 26,
        height: 26,
        borderRadius: 8,
    },
    sectorName: {
        color: '#F2F2F2',
        fontSize: 18,
        fontWeight: '600',
    },
    sectorTime: {
        color: '#F2F2F2',
        fontSize: 18,
        fontWeight: '700',
    },
    emptyContainer: {
        paddingVertical: 12,
    },
    emptyText: {
        color: '#B0B0B0',
        fontSize: 14,
    },
    loaderContainer: {
        backgroundColor: '#1c1c1e',
        borderRadius: 24,
        paddingVertical: 24,
        paddingHorizontal: 16,
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
    },
    loaderText: {
        marginTop: 8,
        color: '#E0E0E0',
        fontSize: 12,
    },
});

export default GBGScheduleWidget;
