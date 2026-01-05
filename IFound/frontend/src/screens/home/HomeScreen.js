import React, { useState } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, TouchableOpacity, Text } from 'react-native';
import { Searchbar, Card, Title, Paragraph, Surface } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors } from '../../config/theme';

const HomeScreen = ({ navigation }) => {
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');

  const filters = [
    { key: 'all', label: 'All', icon: 'view-grid' },
    { key: 'finding', label: 'Lost Items', icon: 'magnify', color: '#2563EB' },
    { key: 'found', label: 'Found Items', icon: 'hand-heart', color: '#10B981' },
  ];

  // Mock data with both types
  const mockCases = [
    { id: '1', title: 'Lost iPhone 13 Pro', category: 'Electronics', reward: 500, location: 'Downtown Mall', type: 'finding', postedBy: 'John D.' },
    { id: '2', title: 'Found Orange Cat', category: 'Pets', reward: 0, location: 'Central Park', type: 'found', postedBy: 'Sarah M.' },
    { id: '3', title: 'Lost Wallet - Brown Leather', category: 'Personal Items', reward: 100, location: 'Bus Station', type: 'finding', postedBy: 'Mike R.' },
    { id: '4', title: 'Found Set of Keys', category: 'Keys', reward: 0, location: 'Coffee Shop on Main St', type: 'found', postedBy: 'Lisa K.' },
    { id: '5', title: 'Missing Dog - Golden Retriever', category: 'Pets', reward: 1000, location: 'Riverside Area', type: 'finding', postedBy: 'Tom W.' },
  ];

  const filteredCases = selectedFilter === 'all'
    ? mockCases
    : mockCases.filter(c => c.type === selectedFilter);

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1500);
  };

  const renderCase = ({ item }) => {
    const isFound = item.type === 'found';

    return (
      <Card
        style={styles.card}
        onPress={() => navigation.navigate('CaseDetail', { caseId: item.id })}
      >
        <Card.Content>
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
            {item.reward > 0 && (
              <View style={styles.rewardBadge}>
                <Icon name="currency-usd" size={12} color="#F59E0B" />
                <Text style={styles.rewardBadgeText}>${item.reward}</Text>
              </View>
            )}
          </View>

          <Title style={styles.cardTitle}>{item.title}</Title>

          <View style={styles.cardDetails}>
            <View style={styles.detailRow}>
              <Icon name="tag" size={14} color="#6B7280" />
              <Text style={styles.detailText}>{item.category}</Text>
            </View>
            <View style={styles.detailRow}>
              <Icon name="map-marker" size={14} color="#6B7280" />
              <Text style={styles.detailText}>{item.location}</Text>
            </View>
          </View>

          <View style={styles.cardFooter}>
            <Text style={styles.postedBy}>Posted by {item.postedBy}</Text>
            {isFound ? (
              <Text style={styles.actionHint}>Tap to claim</Text>
            ) : (
              <Text style={styles.actionHint}>Tap to submit tip</Text>
            )}
          </View>
        </Card.Content>
      </Card>
    );
  };

  const renderHeader = () => (
    <>
      {/* Action Buttons - Post */}
      <Text style={styles.postSectionTitle}>Post a Listing</Text>
      <View style={styles.actionContainer}>
        <TouchableOpacity
          style={[styles.actionButton, styles.foundButton]}
          onPress={() => navigation.navigate('ReportFound')}
        >
          <View style={[styles.actionIconContainer, styles.foundIconBg]}>
            <Icon name="hand-heart" size={28} color="#10B981" />
          </View>
          <Text style={styles.actionTitle}>I Found</Text>
          <Text style={styles.actionSubtitle}>Report something you found</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.findingButton]}
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
            onPress={() => setSelectedFilter(filter.key)}
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
      {selectedFilter === 'finding' && (
        <Surface style={styles.infoCard}>
          <Icon name="information-outline" size={18} color="#2563EB" />
          <Text style={styles.infoCardText}>
            These items are lost. Submit a tip if you have information and earn the bounty!
          </Text>
        </Surface>
      )}

      {selectedFilter === 'found' && (
        <Surface style={styles.infoCardGreen}>
          <Icon name="information-outline" size={18} color="#10B981" />
          <Text style={styles.infoCardTextGreen}>
            These items were found by others. Claim yours if you recognize it!
          </Text>
        </Surface>
      )}

      <Text style={styles.resultsCount}>
        {filteredCases.length} {filteredCases.length === 1 ? 'listing' : 'listings'}
      </Text>
    </>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={filteredCases}
        renderItem={renderCase}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="folder-open-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyText}>No listings found</Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
  actionButton: {
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
    fontSize: 16,
    marginBottom: 8,
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
    fontSize: 13,
    color: '#6B7280',
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
    fontSize: 12,
    color: '#9CA3AF',
  },
  actionHint: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '500',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 12,
  },
});

export default HomeScreen;
