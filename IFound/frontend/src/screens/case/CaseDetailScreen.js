import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Image, Dimensions, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Button, Card, Title, Paragraph, Chip, Divider, Text, Surface } from 'react-native-paper';
import { colors } from '../../config/theme';
import { caseAPI, visualDnaAPI } from '../../services/api';

const { width } = Dimensions.get('window');

// Color name to display color mapping
const COLOR_MAP = {
  RED: '#EF4444',
  ORG: '#F97316',
  YEL: '#EAB308',
  GRN: '#22C55E',
  CYN: '#06B6D4',
  BLU: '#3B82F6',
  PUR: '#A855F7',
  PNK: '#EC4899',
  BRN: '#92400E',
  BLK: '#1F2937',
  WHT: '#F9FAFB',
  GRY: '#6B7280',
  GLD: '#D97706',
  SLV: '#9CA3AF',
  BGE: '#D2B48C',
  TAN: '#D2B48C',
};

// Entity type icons
const ENTITY_ICONS = {
  pet: 'paw',
  person: 'account',
  vehicle: 'car',
  document: 'file-document',
  item: 'package-variant',
  unknown: 'help-circle',
};

const CaseDetailScreen = ({ navigation, route }) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [caseData, setCaseData] = useState(null);
  const [visualDNA, setVisualDNA] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const { caseId } = route.params || {};

  useEffect(() => {
    if (caseId) {
      fetchCaseData();
    } else {
      // Use mock data if no caseId provided
      setCaseData(mockCase);
      setLoading(false);
    }
  }, [caseId]);

  const fetchCaseData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch case and visual DNA in parallel
      const [caseResponse, dnaResponse] = await Promise.all([
        caseAPI.getCaseById(caseId).catch(() => null),
        visualDnaAPI.getCaseVisualDNA(caseId).catch(() => null),
      ]);

      if (caseResponse?.data) {
        setCaseData(caseResponse.data);
      } else {
        setCaseData(mockCase);
      }

      if (dnaResponse?.data?.records?.length > 0) {
        setVisualDNA(dnaResponse.data.records[0]); // Use first photo's DNA
      }
    } catch (err) {
      console.error('Error fetching case data:', err);
      setError('Failed to load case details');
      setCaseData(mockCase);
    } finally {
      setLoading(false);
    }
  };

  const mockCase = {
    id: caseId || '1',
    title: 'Lost iPhone 13',
    description: 'Lost my iPhone 13 Pro in blue color. Last seen near the downtown coffee shop on Main Street. Has a distinctive case with a purple pattern.',
    category: 'Electronics',
    status: 'Active',
    reward: '$50',
    location: 'Downtown, Main Street',
    date: '2024-11-05',
    images: [
      'https://via.placeholder.com/400x300/2563EB/FFFFFF?text=Photo+1',
      'https://via.placeholder.com/400x300/10B981/FFFFFF?text=Photo+2',
    ],
    postedBy: 'John Doe',
  };

  const handleSubmitTip = () => {
    navigation.navigate('SubmitTip', { caseId: caseData?.id || mockCase.id });
  };

  // Parse DNA ID for display
  const parseDnaId = (dnaId) => {
    if (!dnaId) return null;
    // Format: ENTITY-COLORS-SHAPE-NEURAL-HASH-QUALITY
    const parts = dnaId.split('-');
    if (parts.length >= 6) {
      return {
        entity: parts[0],
        colors: parts[1].split('.'),
        shape: parts[2],
        neural: parts[3],
        hash: parts[4],
        quality: parts[5],
      };
    }
    return null;
  };

  const renderDNAFingerprint = () => {
    if (!visualDNA?.dna_v2_id) return null;

    const parsed = parseDnaId(visualDNA.dna_v2_id);
    if (!parsed) return null;

    return (
      <Card style={styles.dnaCard}>
        <Card.Content>
          <View style={styles.dnaHeader}>
            <Title style={styles.dnaTitle}>Visual DNA Fingerprint</Title>
            <Chip mode="flat" style={styles.versionChip}>
              v{visualDNA.algorithm_version || '2.0'}
            </Chip>
          </View>

          {/* Human-readable DNA ID */}
          <Surface style={styles.dnaIdContainer}>
            <Text style={styles.dnaIdLabel}>DNA ID</Text>
            <Text style={styles.dnaIdText}>{visualDNA.dna_v2_id}</Text>
          </Surface>

          {/* DNA Components */}
          <View style={styles.dnaComponents}>
            {/* Entity Type */}
            <View style={styles.dnaComponent}>
              <Text style={styles.componentLabel}>Entity</Text>
              <Chip icon={ENTITY_ICONS[visualDNA.entity_type] || 'help-circle'}>
                {parsed.entity}
              </Chip>
            </View>

            {/* Colors */}
            <View style={styles.dnaComponent}>
              <Text style={styles.componentLabel}>Colors</Text>
              <View style={styles.colorRow}>
                {parsed.colors.map((colorCode, index) => (
                  <View key={index} style={styles.colorChip}>
                    <View
                      style={[
                        styles.colorDot,
                        { backgroundColor: COLOR_MAP[colorCode] || '#9CA3AF' }
                      ]}
                    />
                    <Text style={styles.colorText}>{colorCode}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Shape */}
            <View style={styles.dnaComponent}>
              <Text style={styles.componentLabel}>Shape</Text>
              <Chip icon="shape">{parsed.shape}</Chip>
            </View>

            {/* Quality */}
            <View style={styles.dnaComponent}>
              <Text style={styles.componentLabel}>Quality</Text>
              <Chip
                icon="star"
                style={[
                  styles.qualityChip,
                  visualDNA.quality_tier === 'high' && styles.qualityHigh,
                  visualDNA.quality_tier === 'medium' && styles.qualityMedium,
                  visualDNA.quality_tier === 'low' && styles.qualityLow,
                ]}
              >
                {parsed.quality}
              </Chip>
            </View>
          </View>

          {/* Neural Hash */}
          <View style={styles.hashRow}>
            <View style={styles.hashItem}>
              <Text style={styles.hashLabel}>Neural</Text>
              <Text style={styles.hashValue}>{parsed.neural}</Text>
            </View>
            <View style={styles.hashItem}>
              <Text style={styles.hashLabel}>pHash</Text>
              <Text style={styles.hashValue}>{parsed.hash}</Text>
            </View>
          </View>

          {/* Confidence */}
          {visualDNA.entity_confidence && (
            <Text style={styles.confidenceText}>
              {(visualDNA.entity_confidence * 100).toFixed(1)}% confidence
            </Text>
          )}
        </Card.Content>
      </Card>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading case details...</Text>
      </View>
    );
  }

  const displayCase = caseData || mockCase;
  const images = displayCase.images || displayCase.Photos?.map(p => p.image_url) || [
    'https://via.placeholder.com/400x300/6B7280/FFFFFF?text=No+Image',
  ];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.imageCarousel}>
        <Image
          source={{ uri: images[currentImageIndex] }}
          style={styles.image}
          resizeMode="cover"
        />
        {images.length > 1 && (
          <View style={styles.imageIndicator}>
            {images.map((_, index) => (
              <TouchableOpacity
                key={index}
                onPress={() => setCurrentImageIndex(index)}
              >
                <View
                  style={[
                    styles.dot,
                    index === currentImageIndex && styles.activeDot,
                  ]}
                />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* DNA Fingerprint Card */}
      {renderDNAFingerprint()}

      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.header}>
            <Title>{displayCase.title}</Title>
            <Chip mode="outlined" textStyle={styles.statusText}>
              {displayCase.status}
            </Chip>
          </View>

          <View style={styles.metaContainer}>
            <Chip icon="tag" style={styles.metaChip}>
              {displayCase.category || displayCase.case_type}
            </Chip>
            <Chip icon="map-marker" style={styles.metaChip}>
              {displayCase.location || displayCase.lost_location}
            </Chip>
            <Chip icon="calendar" style={styles.metaChip}>
              {displayCase.date || displayCase.lost_date?.split('T')[0]}
            </Chip>
          </View>

          <Divider style={styles.divider} />

          <Paragraph style={styles.description}>{displayCase.description}</Paragraph>

          <Divider style={styles.divider} />

          <View style={styles.rewardContainer}>
            <Paragraph style={styles.label}>Reward Offered:</Paragraph>
            <Title style={styles.rewardAmount}>
              {displayCase.reward || `$${displayCase.bounty_amount || 0}`}
            </Title>
          </View>

          <View style={styles.posterContainer}>
            <Paragraph style={styles.label}>Posted by:</Paragraph>
            <Paragraph>{displayCase.postedBy || displayCase.User?.name || 'Anonymous'}</Paragraph>
          </View>
        </Card.Content>
      </Card>

      <View style={styles.buttonContainer}>
        <Button
          mode="contained"
          onPress={handleSubmitTip}
          style={styles.submitButton}
          icon="send"
        >
          Submit a Tip
        </Button>
        <Button
          mode="outlined"
          onPress={() => navigation.navigate('MapView', { caseId: displayCase.id })}
          style={styles.mapButton}
          icon="map"
        >
          View on Map
        </Button>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    marginTop: 16,
    color: colors.text,
  },
  imageCarousel: {
    width: width,
    height: 300,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageIndicator: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    marginHorizontal: 4,
  },
  activeDot: {
    backgroundColor: colors.primary,
  },
  // DNA Card Styles
  dnaCard: {
    margin: 16,
    marginBottom: 8,
    elevation: 3,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  dnaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  dnaTitle: {
    fontSize: 18,
    color: colors.primary,
  },
  versionChip: {
    backgroundColor: colors.primary + '20',
  },
  dnaIdContainer: {
    backgroundColor: '#1F2937',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  dnaIdLabel: {
    fontSize: 10,
    color: '#9CA3AF',
    marginBottom: 4,
    fontWeight: '600',
  },
  dnaIdText: {
    fontFamily: 'monospace',
    fontSize: 14,
    color: '#10B981',
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  dnaComponents: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  dnaComponent: {
    minWidth: '45%',
  },
  componentLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginBottom: 4,
    fontWeight: '600',
  },
  colorRow: {
    flexDirection: 'row',
    gap: 8,
  },
  colorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 4,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  colorText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#374151',
  },
  qualityChip: {
    backgroundColor: '#F3F4F6',
  },
  qualityHigh: {
    backgroundColor: '#D1FAE5',
  },
  qualityMedium: {
    backgroundColor: '#FEF3C7',
  },
  qualityLow: {
    backgroundColor: '#FEE2E2',
  },
  hashRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  hashItem: {
    alignItems: 'center',
  },
  hashLabel: {
    fontSize: 10,
    color: '#6B7280',
    marginBottom: 2,
  },
  hashValue: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#1F2937',
    fontWeight: '600',
  },
  confidenceText: {
    textAlign: 'center',
    fontSize: 12,
    color: '#6B7280',
  },
  // Case Card Styles
  card: {
    margin: 16,
    marginTop: 8,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusText: {
    color: colors.success,
  },
  metaContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  metaChip: {
    marginRight: 8,
    marginBottom: 8,
  },
  divider: {
    marginVertical: 16,
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
  },
  rewardContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  label: {
    fontWeight: 'bold',
    color: colors.text,
  },
  rewardAmount: {
    color: colors.primary,
  },
  posterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  buttonContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  submitButton: {
    marginBottom: 12,
    backgroundColor: colors.primary,
  },
  mapButton: {
    borderColor: colors.primary,
  },
});

export default CaseDetailScreen;
