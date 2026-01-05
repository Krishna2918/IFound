import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, TouchableOpacity, Text, Image } from 'react-native';
import { Searchbar, Card, Title, Paragraph, Surface, ActivityIndicator } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../../config/theme';
import { caseAPI } from '../../services/api';

const HomeScreen = ({ navigation }) => {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    hasMore: false,
  });
  const [loadingMore, setLoadingMore] = useState(false);

  const filters = [
    { key: 'all', label: 'All', icon: 'view-grid' },
    { key: 'lost_item', label: 'Lost Items', icon: 'magnify', color: '#2563EB' },
    { key: 'found_item', label: 'Found Items', icon: 'hand-heart', color: '#10B981' },
    { key: 'lost_pet', label: 'Lost Pets', icon: 'dog', color: '#F59E0B' },
  ];

  // Refresh cases when screen gains focus
  useFocusEffect(
    useCallback(() => {
      fetchCases(true);
    }, [selectedFilter, searchQuery])
  );

  const fetchCases = async (reset = false) => {
    try {
      if (reset) {
        setLoading(true);
      }

      const params = {
        page: reset ? 1 : pagination.page,
        limit: pagination.limit,
        status: 'active', // Only show active cases
      };

      // Add category filter
      if (selectedFilter !== 'all') {
        params.category = selectedFilter;
      }

      // Add search query
      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }

      const response = await caseAPI.getCases(params);

      if (response.success) {
        const newCases = response.data || [];

        if (reset) {
          setCases(newCases);
        } else {
          setCases(prev => [...prev, ...newCases]);
        }

        setPagination(prev => ({
          ...prev,
          page: reset ? 2 : prev.page + 1,
          total: response.pagination?.total || newCases.length,
          hasMore: newCases.length === pagination.limit,
        }));
      }
    } catch (error) {
      console.error('Error fetching cases:', error);
      // Use fallback mock data on error
      if (cases.length === 0) {
        setCases(mockCases);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchCases(true);
  }, [selectedFilter, searchQuery]);

  const onLoadMore = () => {
    if (!loadingMore && pagination.hasMore) {
      setLoadingMore(true);
      fetchCases(false);
    }
  };

  const handleFilterChange = (filterKey) => {
    setSelectedFilter(filterKey);
    setPagination(prev => ({ ...prev, page: 1 }));
    setCases([]);
    setLoading(true);
  };

  const handleSearch = useCallback(() => {
    setPagination(prev => ({ ...prev, page: 1 }));
    setCases([]);
    fetchCases(true);
  }, [searchQuery, selectedFilter]);

  const getCaseType = (category) => {
    if (category === 'found_item') return 'found';
    return 'finding';
  };

  const getReward = (caseItem) => {
    return caseItem.bounty_amount || caseItem.reward || 0;
  };

  const getLocation = (caseItem) => {
    if (caseItem.location_description) return caseItem.location_description;
    if (caseItem.city && caseItem.state) return `${caseItem.city}, ${caseItem.state}`;
    if (caseItem.last_seen_location) return caseItem.last_seen_location;
    return 'Location not specified';
  };

  const getPosterName = (caseItem) => {
    if (caseItem.poster) {
      return `${caseItem.poster.first_name || ''} ${caseItem.poster.last_name?.[0] || ''}.`.trim();
    }
    return 'Anonymous';
  };

  const getCaseImage = (caseItem) => {
    if (caseItem.photos && caseItem.photos.length > 0) {
      return caseItem.photos[0].url || caseItem.photos[0].thumbnail_url;
    }
    return null;
  };

  const renderCase = ({ item }) => {
    const isFound = getCaseType(item.category) === 'found';
    const reward = getReward(item);
    const imageUrl = getCaseImage(item);

    return (
      <Card
        style={styles.card}
        onPress={() => navigation.navigate('CaseDetail', { caseId: item.id })}
      >
        <View style={styles.cardRow}>
          {/* Image thumbnail */}
          {imageUrl && (
            <Image
              source={{ uri: imageUrl }}
              style={styles.cardImage}
              resizeMode="cover"
            />
          )}

          <Card.Content style={[styles.cardContent, !imageUrl && styles.cardContentFull]}>
            <View style={styles.cardHeader}>
              <View style={[styles.typeBadge, isFound ? styles.foundBadge : styles.findingBadge]}>
                <Icon
                  name={isFound ? 'hand-heart' : 'magnify'}
                  size={12}
                  color={isFound ? '#10B981' : '#2563EB'}
                />
                <Text style={[styles.typeBadgeText, isFound ? styles.foundBadgeText : styles.findingBadgeText]}>
                  {isFound ? 'FOUND' : 'LOOKING FOR'}
                </Text>
              </View>
              {reward > 0 && (
                <View style={styles.rewardBadge}>
                  <Icon name="currency-usd" size={12} color="#F59E0B" />
                  <Text style={styles.rewardBadgeText}>${reward}</Text>
                </View>
              )}
            </View>

            <Title style={styles.cardTitle} numberOfLines={2}>{item.title}</Title>

            <View style={styles.cardDetails}>
              <View style={styles.detailRow}>
                <Icon name="tag" size={14} color="#6B7280" />
                <Text style={styles.detailText}>{item.category?.replace(/_/g, ' ') || 'Item'}</Text>
              </View>
              <View style={styles.detailRow}>
                <Icon name="map-marker" size={14} color="#6B7280" />
                <Text style={styles.detailText} numberOfLines={1}>{getLocation(item)}</Text>
              </View>
            </View>

            <View style={styles.cardFooter}>
              <Text style={styles.postedBy}>Posted by {getPosterName(item)}</Text>
              {isFound ? (
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => navigation.navigate('ClaimItem', { caseData: item })}
                >
                  <Text style={styles.actionButtonText}>Claim</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => navigation.navigate('SubmitTip', { caseData: item })}
                >
                  <Text style={styles.actionButtonText}>Submit Tip</Text>
                </TouchableOpacity>
              )}
            </View>
          </Card.Content>
        </View>
      </Card>
    );
  };

  const renderHeader = () => (
    <>
      {/* Action Buttons - Post */}
      <Text style={styles.postSectionTitle}>Post a Listing</Text>
      <View style={styles.actionContainer}>
        <TouchableOpacity
          style={[styles.postButton, styles.foundButton]}
          onPress={() => navigation.navigate('ReportFound')}
        >
          <View style={[styles.actionIconContainer, styles.foundIconBg]}>
            <Icon name="hand-heart" size={28} color="#10B981" />
          </View>
          <Text style={styles.actionTitle}>I Found</Text>
          <Text style={styles.actionSubtitle}>Report something you found</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.postButton, styles.findingButton]}
          onPress={() => navigation.navigate('CreateCase')}
        >
          <View style={[styles.actionIconContainer, styles.findingIconBg]}>
            <Icon name="magnify" size={28} color="#2563EB" />
          </View>
          <Text style={styles.actionTitle}>I Am Finding</Text>
          <Text style={styles.actionSubtitle}>Post with bounty reward</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <Searchbar
        placeholder="Search lost or found items..."
        onChangeText={setSearchQuery}
        value={searchQuery}
        style={styles.searchbar}
        onSubmitEditing={handleSearch}
      />

      {/* Browse Section */}
      <Text style={styles.browseSectionTitle}>Browse Listings</Text>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        {filters.map((filter) => (
          <TouchableOpacity
            key={filter.key}
            style={[
              styles.filterTab,
              selectedFilter === filter.key && styles.filterTabActive,
              selectedFilter === filter.key && filter.color && { borderColor: filter.color },
            ]}
            onPress={() => handleFilterChange(filter.key)}
          >
            <Icon
              name={filter.icon}
              size={16}
              color={selectedFilter === filter.key ? (filter.color || colors.primary) : '#6B7280'}
            />
            <Text
              style={[
                styles.filterTabText,
                selectedFilter === filter.key && styles.filterTabTextActive,
                selectedFilter === filter.key && filter.color && { color: filter.color },
              ]}
            >
              {filter.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Info cards based on filter */}
      {selectedFilter === 'lost_item' && (
        <Surface style={styles.infoCard}>
          <Icon name="information-outline" size={18} color="#2563EB" />
          <Text style={styles.infoCardText}>
            These items are lost. Submit a tip if you have information and earn the bounty!
          </Text>
        </Surface>
      )}

      {selectedFilter === 'found_item' && (
        <Surface style={styles.infoCardGreen}>
          <Icon name="information-outline" size={18} color="#10B981" />
          <Text style={styles.infoCardTextGreen}>
            These items were found by others. Claim yours if you recognize it!
          </Text>
        </Surface>
      )}

      <Text style={styles.resultsCount}>
        {pagination.total > 0 ? pagination.total : cases.length} {cases.length === 1 ? 'listing' : 'listings'}
      </Text>
    </>
  );

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.loadingMore}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  };

  if (loading && cases.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading listings...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={cases}
        renderItem={renderCase}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={renderFooter}
        contentContainerStyle={styles.list}
        onEndReached={onLoadMore}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="folder-open-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyText}>No listings found</Text>
            <Text style={styles.emptySubtext}>
              Try adjusting your filters or check back later
            </Text>
          </View>
        }
      />
    </View>
  );
};

// Fallback mock data for development/offline
const mockCases = [
  { id: '1', title: 'Lost iPhone 13 Pro', category: 'lost_item', bounty_amount: 500, location_description: 'Downtown Mall', poster: { first_name: 'John', last_name: 'Doe' } },
  { id: '2', title: 'Found Orange Cat', category: 'found_item', bounty_amount: 0, location_description: 'Central Park', poster: { first_name: 'Sarah', last_name: 'Miller' } },
  { id: '3', title: 'Lost Wallet - Brown Leather', category: 'lost_item', bounty_amount: 100, location_description: 'Bus Station', poster: { first_name: 'Mike', last_name: 'Ross' } },
  { id: '4', title: 'Found Set of Keys', category: 'found_item', bounty_amount: 0, location_description: 'Coffee Shop on Main St', poster: { first_name: 'Lisa', last_name: 'Kim' } },
  { id: '5', title: 'Missing Dog - Golden Retriever', category: 'lost_pet', bounty_amount: 1000, location_description: 'Riverside Area', poster: { first_name: 'Tom', last_name: 'Wilson' } },
];

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
    marginTop: 12,
    fontSize: 14,
    color: '#6B7280',
  },
  postSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    paddingHorizontal: 16,
    paddingTop: 16,
    marginBottom: 12,
  },
  actionContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
  },
  postButton: {
    flex: 1,
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  foundButton: {
    backgroundColor: '#ECFDF5',
    borderWidth: 2,
    borderColor: '#10B981',
  },
  findingButton: {
    backgroundColor: '#EFF6FF',
    borderWidth: 2,
    borderColor: '#2563EB',
  },
  actionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  foundIconBg: {
    backgroundColor: '#D1FAE5',
  },
  findingIconBg: {
    backgroundColor: '#DBEAFE',
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 2,
  },
  actionSubtitle: {
    fontSize: 11,
    color: colors.placeholder,
    textAlign: 'center',
  },
  searchbar: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
    elevation: 2,
  },
  browseSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    gap: 6,
    borderWidth: 2,
    borderColor: 'transparent',
    marginBottom: 4,
  },
  filterTabActive: {
    backgroundColor: '#FFFFFF',
    borderColor: colors.primary,
  },
  filterTabText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  filterTabTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#EFF6FF',
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 12,
    gap: 10,
    marginBottom: 12,
    elevation: 1,
  },
  infoCardText: {
    flex: 1,
    fontSize: 13,
    color: '#1E40AF',
    lineHeight: 18,
  },
  infoCardGreen: {
    flexDirection: 'row',
    backgroundColor: '#ECFDF5',
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 12,
    gap: 10,
    marginBottom: 12,
    elevation: 1,
  },
  infoCardTextGreen: {
    flex: 1,
    fontSize: 13,
    color: '#065F46',
    lineHeight: 18,
  },
  resultsCount: {
    fontSize: 13,
    color: '#6B7280',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  list: {
    paddingBottom: 16,
  },
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    elevation: 2,
    borderRadius: 12,
    overflow: 'hidden',
  },
  cardRow: {
    flexDirection: 'row',
  },
  cardImage: {
    width: 100,
    height: '100%',
    minHeight: 120,
    backgroundColor: '#E5E7EB',
  },
  cardContent: {
    flex: 1,
    padding: 12,
  },
  cardContentFull: {
    paddingLeft: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  foundBadge: {
    backgroundColor: '#D1FAE5',
  },
  findingBadge: {
    backgroundColor: '#DBEAFE',
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  foundBadgeText: {
    color: '#065F46',
  },
  findingBadgeText: {
    color: '#1E40AF',
  },
  rewardBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 2,
  },
  rewardBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#B45309',
  },
  cardTitle: {
    fontSize: 15,
    marginBottom: 8,
    lineHeight: 20,
  },
  cardDetails: {
    gap: 4,
    marginBottom: 10,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailText: {
    fontSize: 12,
    color: '#6B7280',
    flex: 1,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  postedBy: {
    fontSize: 11,
    color: '#9CA3AF',
    flex: 1,
  },
  actionButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  loadingMore: {
    paddingVertical: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 4,
  },
});

export default HomeScreen;
