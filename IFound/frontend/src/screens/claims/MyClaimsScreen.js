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
  Divider,
  ActivityIndicator,
  FAB,
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
  pending: 'Pending Review',
  under_review: 'Under Review',
  accepted: 'Accepted',
  rejected: 'Rejected',
  completed: 'Completed',
  cancelled: 'Cancelled',
  disputed: 'Disputed',
};

const MyClaimsScreen = ({ navigation }) => {
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchClaims();
  }, [filter]);

  const fetchClaims = async () => {
    try {
      setLoading(true);
      const response = await claimAPI.getMyClaims({ status: filter === 'all' ? null : filter });
      if (response.success) {
        setClaims(response.data || []);
      }
    } catch (error) {
      console.error('Error fetching claims:', error);
      // Use mock data for development
      setClaims(mockClaims);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchClaims();
    setRefreshing(false);
  }, [filter]);

  const renderFilterChips = () => (
    <View style={styles.filterContainer}>
      {['all', 'pending', 'accepted', 'completed'].map((status) => (
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
  );

  const renderClaimCard = ({ item }) => (
    <TouchableOpacity
      onPress={() => navigation.navigate('ClaimDetail', { claimId: item.id })}
    >
      <Card style={styles.claimCard}>
        <Card.Content>
          <View style={styles.cardHeader}>
            {item.case?.photos?.[0] && (
              <Image
                source={{ uri: item.case.photos[0].url }}
                style={styles.itemImage}
              />
            )}
            <View style={styles.cardInfo}>
              <Title style={styles.itemTitle} numberOfLines={1}>
                {item.case?.title || 'Unknown Item'}
              </Title>
              <Paragraph style={styles.itemCategory} numberOfLines={1}>
                {item.case?.category}
              </Paragraph>
              <Chip
                style={[
                  styles.statusChip,
                  { backgroundColor: STATUS_COLORS[item.status] || '#999' },
                ]}
                textStyle={styles.statusChipText}
              >
                {STATUS_LABELS[item.status] || item.status}
              </Chip>
            </View>
          </View>

          <Divider style={styles.divider} />

          <View style={styles.cardDetails}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Submitted:</Text>
              <Text style={styles.detailValue}>
                {new Date(item.createdAt).toLocaleDateString()}
              </Text>
            </View>
            {item.bounty_offered > 0 && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Reward Offered:</Text>
                <Text style={styles.detailValue}>
                  ${item.bounty_offered} CAD
                </Text>
              </View>
            )}
            {item.status === 'accepted' && (
              <View style={styles.messageHint}>
                <Text style={styles.messageHintText}>
                  Tap to chat with finder
                </Text>
              </View>
            )}
          </View>
        </Card.Content>
      </Card>
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>📋</Text>
      <Title style={styles.emptyTitle}>No Claims Yet</Title>
      <Paragraph style={styles.emptyText}>
        When you claim found items, they will appear here.
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
      {renderFilterChips()}

      <FlatList
        data={claims}
        renderItem={renderClaimCard}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
          />
        }
        ListEmptyComponent={renderEmptyState}
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
    createdAt: new Date().toISOString(),
    case: {
      id: 'c1',
      title: 'Lost Blue Wallet',
      category: 'Wallet',
      photos: [{ url: 'https://via.placeholder.com/100' }],
    },
  },
  {
    id: '2',
    status: 'accepted',
    bounty_offered: 50,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    case: {
      id: 'c2',
      title: 'Lost Keys with Red Keychain',
      category: 'Keys',
      photos: [{ url: 'https://via.placeholder.com/100' }],
    },
  },
  {
    id: '3',
    status: 'completed',
    bounty_offered: 0,
    createdAt: new Date(Date.now() - 172800000).toISOString(),
    case: {
      id: 'c3',
      title: 'iPhone 13 Pro',
      category: 'Electronics',
      photos: [{ url: 'https://via.placeholder.com/100' }],
    },
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
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  filterChip: {
    marginRight: 8,
  },
  listContent: {
    padding: 16,
    paddingBottom: 80,
  },
  claimCard: {
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemImage: {
    width: 70,
    height: 70,
    borderRadius: 8,
    marginRight: 12,
    backgroundColor: '#E0E0E0',
  },
  cardInfo: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 16,
    marginBottom: 2,
  },
  itemCategory: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  statusChip: {
    alignSelf: 'flex-start',
  },
  statusChipText: {
    color: '#FFFFFF',
    fontSize: 12,
  },
  divider: {
    marginVertical: 12,
  },
  cardDetails: {},
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  detailLabel: {
    color: '#666',
  },
  detailValue: {
    fontWeight: '500',
  },
  messageHint: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 8,
  },
  messageHintText: {
    color: '#1976D2',
    textAlign: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
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
    paddingHorizontal: 32,
  },
});

export default MyClaimsScreen;
