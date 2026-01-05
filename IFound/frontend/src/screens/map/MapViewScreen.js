import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Title, Paragraph, Button, Chip, FAB } from 'react-native-paper';
import { colors } from '../../config/theme';

const MapViewScreen = ({ navigation, route }) => {
  const { caseId } = route.params || {};
  const [selectedMarker, setSelectedMarker] = useState(null);

  const mockMarkers = [
    {
      id: '1',
      title: 'Lost iPhone 13',
      category: 'Electronics',
      latitude: 37.78825,
      longitude: -122.4324,
      type: 'lost',
    },
    {
      id: '2',
      title: 'Found Cat',
      category: 'Pets',
      latitude: 37.79025,
      longitude: -122.4344,
      type: 'found',
    },
    {
      id: '3',
      title: 'Lost Wallet',
      category: 'Personal Items',
      latitude: 37.78625,
      longitude: -122.4304,
      type: 'lost',
    },
  ];

  const handleMarkerPress = (marker) => {
    setSelectedMarker(marker);
  };

  return (
    <View style={styles.container}>
      {/* Placeholder for actual map component */}
      {/* In production, use react-native-maps or similar */}
      <View style={styles.mapPlaceholder}>
        <Paragraph style={styles.placeholderText}>
          Map View
        </Paragraph>
        <Paragraph style={styles.placeholderSubtext}>
          (Integrate react-native-maps or similar library)
        </Paragraph>

        <View style={styles.markersList}>
          <Title style={styles.markersTitle}>Cases on Map:</Title>
          {mockMarkers.map((marker) => (
            <Button
              key={marker.id}
              mode={selectedMarker?.id === marker.id ? 'contained' : 'outlined'}
              onPress={() => handleMarkerPress(marker)}
              style={styles.markerButton}
              icon="map-marker"
            >
              {marker.title}
            </Button>
          ))}
        </View>
      </View>

      {selectedMarker && (
        <Card style={styles.markerCard}>
          <Card.Content>
            <View style={styles.cardHeader}>
              <Title style={styles.cardTitle}>{selectedMarker.title}</Title>
              <Chip
                mode="outlined"
                textStyle={{
                  color: selectedMarker.type === 'lost' ? colors.error : colors.success,
                }}
                style={{
                  borderColor: selectedMarker.type === 'lost' ? colors.error : colors.success,
                }}
              >
                {selectedMarker.type.toUpperCase()}
              </Chip>
            </View>
            <Paragraph>{selectedMarker.category}</Paragraph>
            <Button
              mode="contained"
              onPress={() => navigation.navigate('CaseDetail', { caseId: selectedMarker.id })}
              style={styles.viewButton}
            >
              View Details
            </Button>
          </Card.Content>
        </Card>
      )}

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.error }]} />
          <Paragraph style={styles.legendText}>Lost Items</Paragraph>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
          <Paragraph style={styles.legendText}>Found Items</Paragraph>
        </View>
      </View>

      <FAB
        icon="filter"
        style={styles.fab}
        onPress={() => {}}
        label="Filter"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  mapPlaceholder: {
    flex: 1,
    backgroundColor: colors.disabled + '20',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  placeholderText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
  },
  placeholderSubtext: {
    fontSize: 14,
    color: colors.placeholder,
    textAlign: 'center',
    marginBottom: 24,
  },
  markersList: {
    width: '100%',
    maxWidth: 300,
  },
  markersTitle: {
    fontSize: 16,
    marginBottom: 12,
    textAlign: 'center',
  },
  markerButton: {
    marginBottom: 8,
  },
  markerCard: {
    position: 'absolute',
    bottom: 80,
    left: 16,
    right: 16,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 18,
    marginRight: 8,
  },
  viewButton: {
    marginTop: 12,
    backgroundColor: colors.primary,
  },
  legend: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 8,
    elevation: 2,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  legendText: {
    fontSize: 12,
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
    backgroundColor: colors.primary,
  },
});

export default MapViewScreen;
