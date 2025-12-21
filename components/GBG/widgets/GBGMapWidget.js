import React from 'react';
import useGbgWidgetData from './useGbgWidgetData';
import GBGMapView from './GBGMapView';

const GBGMapWidget = () => {
    const { isReady, mapDimensions, mapKey, sectorColors, sectorStaff } = useGbgWidgetData();
    return (
        <GBGMapView
            isReady={isReady}
            mapDimensions={mapDimensions}
            mapKey={mapKey}
            sectorColors={sectorColors}
            sectorStaff={sectorStaff}
        />
    );
};

export default GBGMapWidget;
