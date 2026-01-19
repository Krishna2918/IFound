import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, TouchableOpacity, Text, Image, Platform } from 'react-native';
import { Searchbar, Card, Title, Paragraph, Surface, ActivityIndicator, Chip } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import { colors } from '../../config/theme';
import { searchAPI, caseAPI } from '../../services/api';

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

  // New search-related state
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [searchRadius, setSearchRadius] = useState(50); // km
  const [sortBy, setSortBy] = useState('relevance');
  const [searchEngine, setSearchEngine] = useState(null);
  const suggestionTimeout = useRef(null);

  const filters = [
    { key: 'all', label: 'All', icon: 'view-grid' },
    { key: 'lost_item', label: 'Lost Items', icon: 'magnify', color: '#2563EB' },
    { key: 'found_item', label: 'Found Items', icon: 'hand-heart', color: '#10B981' },
    { key: 'lost_pet', label: 'Lost Pets', icon: 'dog', color: '#F59E0B' },
  ];

  // Get user location on mount
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const location = await Location.getCurrentPositionAsync({});
          setUserLocation({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          });
        }
      } catch (error) {
        console.log('Location permission denied or error:', error);
      }
    })();
  }, []);

  // Refresh cases when screen gains focus
  useFocusEffect(
    useCallback(() => {
      fetchCases(true);
    }, [selectedFilter, searchQuery, sortBy])
  );

  const fetchCases = async (reset = false) => {
    try {
      if (reset) {
        setLoading(true);
        setShowSuggestions(false);
      }

      // Build search params for the new search API
      const params = {
        page: reset ? 1 : pagination.page,
        limit: pagination.limit,
        status: 'active',
        sort: sortBy,
      };

      // Add search query
      if (searchQuery.trim()) {
        params.q = searchQuery.trim();
      }

      // Add category filter
      if (selectedFilter !== 'all') {
        params.type = selectedFilter;
      }

      // Add location for distance-based search
      if (userLocation && sortBy === 'distance') {
        params.lat = userLocation.latitude;
        params.lng = userLocation.longitude;
        params.radius = searchRadius;
      }

      // Use the new search API
      const response = await searchAPI.searchCases(params);

      if (response.success) {
        const newCases = response.data?.cases || response.data || [];

        if (reset) {
          setCases(newCases);
        } else {
          setCases(prev => [...prev, ...newCases]);
        }

        setPagination(prev => ({
          ...prev,
          page: reset ? 2 : prev.page + 1,
          total: response.data?.total || newCases.length,
          hasMore: newCases.length === pagination.limit,
        }));

        // Track which search engine was used
        if (response.data?.searchEngine) {
          setSearchEngine(response.data.searchEngine);
        }
      }
    } catch (error) {
      console.error('Error fetching cases:', error);
      // Fallback to old API if search API fails
      try {
        const fallbackParams = {
          page: reset ? 1 : pagination.page,
          limit: pagination.limit,
          status: 'active',
        };
        if (selectedFilter !== 'all') fallbackParams.category = selectedFilter;
        if (searchQuery.trim()) fallbackParams.search = searchQuery.trim();

        const fallbackResponse = await caseAPI.getCases(fallbackParams);
        if (fallbackResponse.success) {
          const newCases = fallbackResponse.data || [];
          if (reset) setCases(newCases);
          else setCases(prev => [...prev, ...newCases]);
        }
      } catch (fallbackError) {
        // Use mock data as last resort
        if (cases.length === 0) {
          setCases(mockCases);
        }
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  };

  // Fetch autocomplete suggestions
  const fetchSuggestions = async (query) => {
    if (!query || query.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    try {
      const response = await searchAPI.getSuggestions(query, 5);
      if (response.suggestions && response.suggestions.length > 0) {
        setSuggestions(response.suggestions);
        setShowSuggestions(true);
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    } catch (error) {
      console.log('Suggestions error:', error);
      setSuggestions([]);
    }
  };

  // Debounced search input handler
  const handleSearchChange = (text) => {
    setSearchQuery(text);

    // Clear previous timeout
    if (suggestionTimeout.current) {
      clearTimeout(suggestionTimeout.current);
    }

    // Debounce suggestions fetch
    suggestionTimeout.current = setTimeout(() => {
      fetchSuggestions(text);
    }, 300);
  };

  // Handle suggestion selection
  const handleSuggestionSelect = (suggestion) => {
    setSearchQuery(suggestion);
    setShowSuggestions(false);
    setSuggestions([]);
    fetchCases(true);
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
                  onPress={() => {
                    // Normalize case data for ClaimItemScreen
                    const normalizedCaseData = {
                      id: item.id,
                      title: item.title,
                      category: item.category,
                      description: item.description,
                      photos: item.photos?.map(p => ({ url: p.url || p.thumbnail_url })) || [],
                    };
                    navigation.navigate('ClaimItem', { caseId: item.id, caseData: normalizedCaseData });
                  }}
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

  // Render horizontal slider card
  const renderSliderCard = ({ item }) => {
    const isFound = getCaseType(item.category) === 'found';
    const reward = getReward(item);
    const imageUrl = getCaseImage(item);

    return (
      <TouchableOpacity
        style={styles.sliderCard}
        onPress={() => navigation.navigate('CaseDetail', { caseId: item.id })}
        activeOpacity={0.9}
      >
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.sliderCardImage}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.sliderCardImage, { justifyContent: 'center', alignItems: 'center' }]}>
            <Icon name={isFound ? 'hand-heart' : 'magnify'} size={48} color={colors.onSurfaceVariant} />
          </View>
        )}
        <View style={styles.sliderCardContent}>
          <View style={styles.sliderCardHeader}>
            <View style={[styles.typeBadge, isFound ? styles.foundBadge : styles.findingBadge]}>
              <Icon
                name={isFound ? 'hand-heart' : 'magnify'}
                size={12}
                color={isFound ? '#10B981' : '#60A5FA'}
              />
              <Text style={[styles.typeBadgeText, isFound ? styles.foundBadgeText : styles.findingBadgeText]}>
                {isFound ? 'FOUND' : 'LOOKING FOR'}
              </Text>
            </View>
            {reward > 0 && (
              <View style={styles.rewardBadge}>
                <Icon name="currency-usd" size={12} color="#FCD34D" />
                <Text style={styles.rewardBadgeText}>${reward}</Text>
              </View>
            )}
          </View>
          <Text style={styles.sliderCardTitle} numberOfLines={2}>{item.title}</Text>
          <View style={styles.sliderCardLocation}>
            <Icon name="map-marker" size={14} color={colors.onSurfaceVariant} />
            <Text style={styles.sliderCardLocationText} numberOfLines={1}>{getLocation(item)}</Text>
          </View>
          <View style={styles.sliderCardFooter}>
            <Text style={styles.postedBy}>Posted by {getPosterName(item)}</Text>
            <View style={styles.actionButton}>
              <Text style={styles.actionButtonText}>{isFound ? 'Claim' : 'Submit Tip'}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // Get featured cases (with bounties or recent)
  const getFeaturedCases = () => {
    return cases
      .filter(c => c.bounty_amount > 0 || c.category === 'lost_pet')
      .slice(0, 10);
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

      {/* Horizontal Slider - Featured Cases */}
      {getFeaturedCases().length > 0 && (
        <View style={styles.sliderSection}>
          <View style={styles.sliderHeader}>
            <Text style={styles.sliderTitle}>Featured Listings</Text>
            <TouchableOpacity onPress={() => handleFilterChange('all')}>
              <Text style={styles.seeAllText}>See All</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={getFeaturedCases()}
            renderItem={renderSliderCard}
            keyExtractor={(item) => `slider-${item.id}`}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.sliderList}
            snapToInterval={292}
            decelerationRate="fast"
          />
        </View>
      )}

      {/* Search */}
      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Search lost or found items..."
          onChangeText={handleSearchChange}
          value={searchQuery}
          style={styles.searchbar}
          onSubmitEditing={handleSearch}
          onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
          iconColor={colors.onSurfaceVariant}
          placeholderTextColor={colors.placeholder}
          inputStyle={{ color: colors.text }}
        />

        {/* Autocomplete Suggestions */}
        {showSuggestions && suggestions.length > 0 && (
          <Surface style={styles.suggestionsContainer}>
            {suggestions.map((suggestion, index) => (
              <TouchableOpacity
                key={index}
                style={styles.suggestionItem}
                onPress={() => handleSuggestionSelect(suggestion)}
              >
                <Icon name="magnify" size={16} color={colors.onSurfaceVariant} />
                <Text style={styles.suggestionText}>{suggestion}</Text>
              </TouchableOpacity>
            ))}
          </Surface>
        )}
      </View>

      {/* Sort Options */}
      <View style={styles.sortContainer}>
        <Text style={styles.sortLabel}>Sort by:</Text>
        {[
          { key: 'relevance', label: 'Relevance', icon: 'star' },
          { key: 'date', label: 'Newest', icon: 'clock-outline' },
          { key: 'bounty', label: 'Bounty', icon: 'currency-usd' },
          ...(userLocation ? [{ key: 'distance', label: 'Nearby', icon: 'map-marker' }] : []),
        ].map((option) => (
          <Chip
            key={option.key}
            selected={sortBy === option.key}
            onPress={() => {
              setSortBy(option.key);
              fetchCases(true);
            }}
            style={[styles.sortChip, sortBy === option.key && styles.sortChipActive]}
            textStyle={[styles.sortChipText, sortBy === option.key && styles.sortChipTextActive]}
            icon={option.icon}
            compact
          >
            {option.label}
          </Chip>
        ))}
      </View>

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
    color: colors.onSurfaceVariant,
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
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  foundButton: {
    backgroundColor: '#064E3B',
    borderWidth: 2,
    borderColor: '#10B981',
  },
  findingButton: {
    backgroundColor: '#1E3A5F',
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
    backgroundColor: '#065F46',
  },
  findingIconBg: {
    backgroundColor: '#1E3A8A',
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 2,
  },
  actionSubtitle: {
    fontSize: 11,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
  },
  searchContainer: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
    zIndex: 10,
  },
  searchbar: {
    elevation: 2,
    backgroundColor: colors.surface,
  },
  suggestionsContainer: {
    position: 'absolute',
    top: 56,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderRadius: 8,
    elevation: 4,
    zIndex: 100,
    maxHeight: 200,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  suggestionText: {
    fontSize: 14,
    color: colors.text,
  },
  sortContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 8,
    flexWrap: 'wrap',
  },
  sortLabel: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    marginRight: 4,
  },
  sortChip: {
    backgroundColor: colors.surfaceVariant,
    height: 28,
  },
  sortChipActive: {
    backgroundColor: colors.primaryContainer,
  },
  sortChipText: {
    fontSize: 11,
    color: colors.onSurfaceVariant,
  },
  sortChipTextActive: {
    color: colors.primary,
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
    backgroundColor: colors.surfaceVariant,
    gap: 6,
    borderWidth: 2,
    borderColor: 'transparent',
    marginBottom: 4,
  },
  filterTabActive: {
    backgroundColor: colors.surface,
    borderColor: colors.primary,
  },
  filterTabText: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    fontWeight: '500',
  },
  filterTabTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#1E3A5F',
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
    color: '#93C5FD',
    lineHeight: 18,
  },
  infoCardGreen: {
    flexDirection: 'row',
    backgroundColor: '#064E3B',
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
    color: '#6EE7B7',
    lineHeight: 18,
  },
  resultsCount: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  list: {
    paddingBottom: 16,
  },
  // Horizontal slider styles
  sliderSection: {
    marginBottom: 16,
  },
  sliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sliderTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  seeAllText: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '500',
  },
  sliderList: {
    paddingLeft: 16,
    paddingRight: 8,
  },
  sliderCard: {
    width: 280,
    marginRight: 12,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  sliderCardImage: {
    width: '100%',
    height: 140,
    backgroundColor: colors.surfaceVariant,
  },
  sliderCardContent: {
    padding: 12,
  },
  sliderCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sliderCardTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 6,
  },
  sliderCardLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sliderCardLocationText: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    flex: 1,
  },
  sliderCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  // Regular card styles
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    elevation: 2,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  cardRow: {
    flexDirection: 'row',
  },
  cardImage: {
    width: 100,
    height: '100%',
    minHeight: 120,
    backgroundColor: colors.surfaceVariant,
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
    backgroundColor: '#065F46',
  },
  findingBadge: {
    backgroundColor: '#1E3A8A',
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  foundBadgeText: {
    color: '#6EE7B7',
  },
  findingBadgeText: {
    color: '#93C5FD',
  },
  rewardBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#78350F',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 2,
  },
  rewardBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FCD34D',
  },
  cardTitle: {
    fontSize: 15,
    marginBottom: 8,
    lineHeight: 20,
    color: colors.text,
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
    color: colors.onSurfaceVariant,
    flex: 1,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  postedBy: {
    fontSize: 11,
    color: colors.onSurfaceVariant,
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
    color: colors.onPrimary,
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
    color: colors.onSurfaceVariant,
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    marginTop: 4,
  },
});

export default HomeScreen;
