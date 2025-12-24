import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import { MAP_DATA } from './gbgWidgetUtils';

const GBGMapView = ({ isReady, mapDimensions, mapKey, sectorColors, sectorStaff }) => {
    const mapData = MAP_DATA[mapKey] || {};
    const viewBox = `0 0 ${mapDimensions.width} ${mapDimensions.height}`;

    if (!isReady) {
        return (
            <View style={styles.loaderContainer}>
                <ActivityIndicator size="small" color="#3498db" />
                <Text style={styles.loaderText}>Завантаження карти...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Svg width="100%" height="100%" viewBox={viewBox}>
                {Object.entries(mapData).map(([sectorId, config]) => {
                    const { fill, text, icon } = config;
                    const fillStyle = { ...(fill?.style || {}) };
                    const color = sectorColors[sectorId];

                    if (color) fillStyle.fill = color;
                    fillStyle.stroke = '#121212';
                    fillStyle.strokeWidth = mapKey === 'volcanic_archipelago' ? 0.7 : 1.5;
                    fillStyle.strokeOpacity = 1;

                    const textStyle = { ...(text?.style || {}), display: sectorStaff[sectorId] ? 'none' : text?.style?.display ?? 'inline' };
                    const iconStyle = { ...(icon?.style || {}), display: sectorStaff[sectorId] ? 'inline' : 'none', fill: '#FFFFFF' };
                    if (typeof iconStyle.stroke === 'string' && iconStyle.stroke.toLowerCase() !== 'none') iconStyle.stroke = '#FFFFFF';

                    return (
                        <G key={sectorId}>
                            {fill && <Path {...fill.props} d={fill.d} style={fillStyle} />}
                            {text && <Path {...text.props} d={text.d} style={textStyle} />}
                            {icon && <Path {...icon.props} d={icon.d} style={iconStyle} />}
                        </G>
                    );
                })}
            </Svg>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#1c1c1e',
        borderRadius: 24,
        padding: 12,
        width: '100%',
        aspectRatio: 1,
        alignItems: 'center',
        justifyContent: 'center',
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

export default GBGMapView;
