import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Image,
} from 'react-native';
import {
  Card,
  Title,
  Paragraph,
  Text,
  Chip,
  Button,
  Divider,
  ActivityIndicator,
  Badge,
} from 'react-native-paper';
import { colors } from '../../config/theme';
import { claimAPI } from '../../services/api';

const STATUS_COLORS = {
  pending: '#FFC107',
  under_review: '#2196F3',
  accepted: '#4CAF50',
  rejected: '#F44336',
  completed: '#9E9E9E',
  cancelled: '#757575',
  disputed: '#FF5722',
};

const STATUS_LABELS = {
  pending: 'Pending',
  under_review: 'Reviewing',
  accepted: 'Accepted',
  rejected: 'Rejected',
  completed: 'Completed',
  cancelled: 'Cancelled',
  disputed: 'Disputed',
};

const ReviewClaimsScreen = ({ navigation, route }) => {
  const { caseId, caseData } = route.params || {};

  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [stats, setStats] = useState({ pending: 0, accepted: 0, total: 0 });

  useEffect(() => {
    fetchClaims();
  }, [caseId, filter]);

  const fetchClaims = async () => {
    try {
      setLoading(true);
      const response = await claimAPI.getClaimsForCase(caseId, {
        status: filter === 'all' ? null : filter,
      });
      if (response.success) {
        setClaims(response.data?.claims || []);
        setStats(response.data?.stats || { pending: 0, accepted: 0, total: 0 });
      }
    } catch (error) {
      console.error('Error fetching claims:', error);
      // Use mock data for development
      setClaims(mockClaims);
      setStats({ pending: 2, accepted: 1, total: 4 });
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchClaims();
    setRefreshing(false);
  }, [caseId, filter]);

  const renderHeader = () => (
    <View style={styles.header}>
      {/* Case Summary */}
      {caseData && (
        <Card style={styles.caseCard}>
          <Card.Content>
            <View style={styles.caseRow}>
              {caseData.photos?.[0] && (
                <Image
                  source={{ uri: caseData.photos[0].url }}
                  style={styles.caseImage}
                />
              )}
              <View style={styles.caseInfo}>
                <Title style={styles.caseTitle} numberOfLines={1}>
                  {caseData.title}
                </Title>
                <Paragraph style={styles.caseCategory}>
                  {caseData.category}
                </Paragraph>
              </View>
            </View>
          </Card.Content>
        </Card>
      )}

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{stats.total}</Text>
          <Text style={styles.statLabel}>Total Claims</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: '#FFC107' }]}>
            {stats.pending}
          </Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: '#4CAF50' }]}>
            {stats.accepted}
          </Text>
          <Text style={styles.statLabel}>Accepted</Text>
        </View>
      </View>

      {/* Filters */}
      <View style={styles.filterContainer}>
        {['all', 'pending', 'accepted', 'rejected'].map((status) => (
          <Chip
            key={status}
            selected={filter === status}
            onPress={() => setFilter(status)}
            style={styles.filterChip}
            selectedColor={colors.primary}
          >
            {status === 'all' ? 'All' : STATUS_LABELS[status]}
          </Chip>
        ))}
      </View>
    </View>
  );

  const renderClaimCard = ({ item }) => {
    const hasUnreadQA = item.verificationQuestions?.some(
      (q) => q.answered && !q.seenByFinder
    );

    return (
      <TouchableOpacity
        onPress={() =>
          navigation.navigate('VerificationQA', {
            claimId: item.id,
            claimData: item,
          })
        }
      >
        <Card style={styles.claimCard}>
          <Card.Content>
            {/* Claimant Info */}
            <View style={styles.claimantRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {item.claimant?.first_name?.[0] || 'U'}
                </Text>
              </View>
              <View style={styles.claimantInfo}>
                <Text style={styles.claimantName}>
                  {item.claimant?.first_name} {item.claimant?.last_name?.[0]}.
                </Text>
                <Text style={styles.claimDate}>
                  {new Date(item.createdAt).toLocaleDateString()}
                </Text>
              </View>
              <View style={styles.statusContainer}>
                <Chip
                  style={[
                    styles.statusChip,
                    { backgroundColor: STATUS_COLORS[item.status] || '#999' },
                  ]}
                  textStyle={styles.statusChipText}
                >
                  {STATUS_LABELS[item.status] || item.status}
                </Chip>
                {hasUnreadQA && <Badge style={styles.badge}>New</Badge>}
              </View>
            </View>

            <Divider style={styles.divider} />

            {/* Claim Preview */}
            <Text style={styles.descriptionLabel}>Ownership Claim:</Text>
            <Paragraph style={styles.description} numberOfLines={2}>
              {item.verification_description || 'No description provided'}
            </Paragraph>

            {/* Proof Photos Preview */}
            {item.proof_photos?.length > 0 && (
              <View style={styles.proofRow}>
                {item.proof_photos.slice(0, 3).map((photo, index) => (
                  <Image
                    key={index}
                    source={{ uri: photo.url }}
                    style={styles.proofThumb}
                  />
                ))}
                {item.proof_photos.length > 3 && (
                  <View style={styles.morePhotos}>
                    <Text style={styles.morePhotosText}>
                      +{item.proof_photos.length - 3}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Quick Info */}
            <View style={styles.quickInfo}>
              {item.bounty_offered > 0 && (
                <Chip icon="gift" compact style={styles.infoChip}>
                  ${item.bounty_offered} reward
                </Chip>
              )}
              {item.verificationQuestions?.length > 0 && (
                <Chip icon="chat-question" compact style={styles.infoChip}>
                  {item.verificationQuestions.filter((q) => q.answered).length}/
                  {item.verificationQuestions.length} Q&A
                </Chip>
              )}
            </View>

            {/* Action hint */}
            {item.status === 'pending' && (
              <View style={styles.actionHint}>
                <Text style={styles.actionHintText}>
                  Tap to review and verify ownership
                </Text>
              </View>
            )}
          </Card.Content>
        </Card>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>📭</Text>
      <Title style={styles.emptyTitle}>No Claims Yet</Title>
      <Paragraph style={styles.emptyText}>
        {filter === 'all'
          ? "No one has claimed this item yet. When someone does, they'll appear here."
          : `No ${filter} claims found.`}
      </Paragraph>
    </View>
  );

  if (loading && !refreshing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={claims}
        renderItem={renderClaimCard}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmptyState}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
          />
        }
      />
    </View>
  );
};

// Mock data for development
const mockClaims = [
  {
    id: '1',
    status: 'pending',
    bounty_offered: 25,
    verification_description:
      'The wallet has my initials JD on the inside. There is a small scratch on the leather near the card slots.',
    createdAt: new Date().toISOString(),
    claimant: {
      first_name: 'John',
      last_name: 'Doe',
    },
    proof_photos: [
      { url: 'https://via.placeholder.com/80' },
      { url: 'https://via.placeholder.com/80' },
    ],
    verificationQuestions: [],
  },
  {
    id: '2',
    status: 'under_review',
    bounty_offered: 0,
    verification_description:
      'This is my wallet. I lost it at the mall last Tuesday. It has my library card inside.',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    claimant: {
      first_name: 'Jane',
      last_name: 'Smith',
    },
    proof_photos: [{ url: 'https://via.placeholder.com/80' }],
    verificationQuestions: [
      { question: 'What color is the inside?', answered: true, answer: 'Brown' },
    ],
  },
  {
    id: '3',
    status: 'accepted',
    bounty_offered: 50,
    verification_description: 'My wallet with all my IDs and credit cards.',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    claimant: {
      first_name: 'Bob',
      last_name: 'Wilson',
    },
    proof_photos: [],
    verificationQuestions: [
      { question: 'What color is the inside?', answered: true, answer: 'Black leather' },
      { question: 'Any unique marks?', answered: true, answer: 'Scratch near zipper' },
    ],
  },
];

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    marginBottom: 8,
  },
  caseCard: {
    margin: 16,
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
  },
  caseRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  caseImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 12,
    backgroundColor: '#E0E0E0',
  },
  caseInfo: {
    flex: 1,
  },
  caseTitle: {
    fontSize: 16,
    marginBottom: 4,
  },
  caseCategory: {
    color: '#666',
    fontSize: 14,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    padding: 16,
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.primary,
  },
  statLabel: {
    color: '#666',
    fontSize: 12,
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    backgroundColor: '#E0E0E0',
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  filterChip: {
    marginRight: 8,
  },
  listContent: {
    paddingBottom: 20,
  },
  claimCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
  },
  claimantRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  claimantInfo: {
    flex: 1,
  },
  claimantName: {
    fontSize: 16,
    fontWeight: '500',
  },
  claimDate: {
    color: '#666',
    fontSize: 12,
  },
  statusContainer: {
    alignItems: 'flex-end',
  },
  statusChip: {
    height: 26,
  },
  statusChipText: {
    color: '#FFFFFF',
    fontSize: 11,
  },
  badge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#FF5722',
  },
  divider: {
    marginVertical: 12,
  },
  descriptionLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  description: {
    lineHeight: 20,
    marginBottom: 12,
  },
  proofRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  proofThumb: {
    width: 50,
    height: 50,
    borderRadius: 6,
    marginRight: 6,
    backgroundColor: '#E0E0E0',
  },
  morePhotos: {
    width: 50,
    height: 50,
    borderRadius: 6,
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  morePhotosText: {
    color: '#666',
    fontWeight: '500',
  },
  quickInfo: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  infoChip: {
    marginRight: 8,
    marginBottom: 4,
    height: 28,
  },
  actionHint: {
    backgroundColor: '#E3F2FD',
    padding: 8,
    borderRadius: 6,
    marginTop: 4,
  },
  actionHintText: {
    color: '#1976D2',
    fontSize: 12,
    textAlign: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 60,
    marginBottom: 16,
  },
  emptyTitle: {
    marginBottom: 8,
  },
  emptyText: {
    color: '#666',
    textAlign: 'center',
  },
});

export default ReviewClaimsScreen;
