import React, { useState } from 'react';
import { View, StyleSheet, FlatList, ScrollView } from 'react-native';
import { Searchbar, Chip, Card, Title, Paragraph, Button, Divider } from 'react-native-paper';
import { colors } from '../../config/theme';

const SearchScreen = ({ navigation }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

  const categories = [
    { key: 'all', label: 'All' },
    { key: 'electronics', label: 'Electronics' },
    { key: 'pets', label: 'Pets' },
    { key: 'personal', label: 'Personal Items' },
    { key: 'documents', label: 'Documents' },
    { key: 'jewelry', label: 'Jewelry' },
  ];

  const types = [
    { key: 'all', label: 'All' },
    { key: 'lost', label: 'Lost' },
    { key: 'found', label: 'Found' },
  ];

  const mockResults = [
    { id: '1', title: 'Lost iPhone 13', category: 'Electronics', type: 'lost', location: 'Downtown', date: '2024-11-05' },
    { id: '2', title: 'Found Cat', category: 'Pets', type: 'found', location: 'Central Park', date: '2024-11-04' },
    { id: '3', title: 'Lost Wallet', category: 'Personal Items', type: 'lost', location: 'Mall', date: '2024-11-03' },
  ];

  const handleSearch = () => {
    // Implement search logic
    console.log('Searching for:', searchQuery);
  };

  const clearFilters = () => {
    setSelectedCategory('all');
    setSelectedType('all');
    setSearchQuery('');
  };

  const renderResult = ({ item }) => (
    <Card
      style={styles.card}
      onPress={() => navigation.navigate('CaseDetail', { caseId: item.id })}
    >
      <Card.Content>
        <View style={styles.cardHeader}>
          <Title style={styles.cardTitle}>{item.title}</Title>
          <Chip
            mode="outlined"
            style={item.type === 'lost' ? styles.lostChip : styles.foundChip}
            textStyle={item.type === 'lost' ? styles.lostText : styles.foundText}
          >
            {item.type.toUpperCase()}
          </Chip>
        </View>
        <Paragraph>{item.category}</Paragraph>
        <View style={styles.metadata}>
          <Paragraph style={styles.metaText}>📍 {item.location}</Paragraph>
          <Paragraph style={styles.metaText}>📅 {item.date}</Paragraph>
        </View>
      </Card.Content>
    </Card>
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Search for lost or found items..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          onSubmitEditing={handleSearch}
          style={styles.searchbar}
        />
        <Button
          mode="text"
          onPress={() => setShowFilters(!showFilters)}
          icon={showFilters ? 'filter-off' : 'filter'}
          style={styles.filterToggle}
        >
          {showFilters ? 'Hide' : 'Show'} Filters
        </Button>
      </View>

      {showFilters && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          <View style={styles.filterSection}>
            <Paragraph style={styles.filterLabel}>Category:</Paragraph>
            <View style={styles.filterChips}>
              {categories.map((cat) => (
                <Chip
                  key={cat.key}
                  selected={selectedCategory === cat.key}
                  onPress={() => setSelectedCategory(cat.key)}
                  style={styles.filterChip}
                >
                  {cat.label}
                </Chip>
              ))}
            </View>
          </View>

          <Divider style={styles.filterDivider} />

          <View style={styles.filterSection}>
            <Paragraph style={styles.filterLabel}>Type:</Paragraph>
            <View style={styles.filterChips}>
              {types.map((type) => (
                <Chip
                  key={type.key}
                  selected={selectedType === type.key}
                  onPress={() => setSelectedType(type.key)}
                  style={styles.filterChip}
                >
                  {type.label}
                </Chip>
              ))}
            </View>
          </View>

          <Button mode="text" onPress={clearFilters} style={styles.clearButton}>
            Clear All
          </Button>
        </ScrollView>
      )}

      <FlatList
        data={mockResults}
        renderItem={renderResult}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Paragraph>No results found. Try adjusting your filters.</Paragraph>
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
  searchContainer: {
    padding: 16,
    backgroundColor: colors.surface,
    elevation: 2,
  },
  searchbar: {
    marginBottom: 8,
  },
  filterToggle: {
    alignSelf: 'flex-start',
  },
  filterScroll: {
    maxHeight: 150,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.disabled,
  },
  filterSection: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  filterLabel: {
    fontWeight: 'bold',
    marginBottom: 8,
  },
  filterChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  filterChip: {
    marginRight: 8,
    marginBottom: 8,
  },
  filterDivider: {
    height: '100%',
    width: 1,
    marginHorizontal: 8,
  },
  clearButton: {
    alignSelf: 'center',
    marginHorizontal: 16,
  },
  list: {
    padding: 16,
  },
  card: {
    marginBottom: 12,
    elevation: 2,
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
  },
  lostChip: {
    borderColor: colors.error,
  },
  lostText: {
    color: colors.error,
  },
  foundChip: {
    borderColor: colors.success,
  },
  foundText: {
    color: colors.success,
  },
  metadata: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  metaText: {
    fontSize: 12,
    color: colors.placeholder,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
});

export default SearchScreen;
