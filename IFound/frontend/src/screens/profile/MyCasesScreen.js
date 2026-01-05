import React, { useState } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { Card, Title, Paragraph, Chip, FAB, SegmentedButtons, IconButton } from 'react-native-paper';
import { colors } from '../../config/theme';

const MyCasesScreen = ({ navigation }) => {
  const [filter, setFilter] = useState('all');

  const mockCases = [
    {
      id: '1',
      title: 'Lost iPhone 13',
      category: 'Electronics',
      status: 'active',
      date: '2024-11-05',
      tipsCount: 3,
      reward: '$50',
    },
    {
      id: '2',
      title: 'Found Cat',
      category: 'Pets',
      status: 'resolved',
      date: '2024-11-03',
      tipsCount: 5,
      reward: 'No reward',
    },
    {
      id: '3',
      title: 'Lost Wallet',
      category: 'Personal Items',
      status: 'active',
      date: '2024-11-01',
      tipsCount: 1,
      reward: '$100',
    },
    {
      id: '4',
      title: 'Lost Keys',
      category: 'Personal Items',
      status: 'closed',
      date: '2024-10-28',
      tipsCount: 0,
      reward: '$20',
    },
  ];

  const getFilteredCases = () => {
    if (filter === 'all') return mockCases;
    return mockCases.filter(c => c.status === filter);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return colors.success;
      case 'resolved':
        return colors.primary;
      case 'closed':
        return colors.disabled;
      default:
        return colors.disabled;
    }
  };

  const getStatusLabel = (status) => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const renderCase = ({ item }) => (
    <Card
      style={styles.card}
      onPress={() => navigation.navigate('CaseDetail', { caseId: item.id })}
    >
      <Card.Content>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Title style={styles.title}>{item.title}</Title>
            <Chip
              mode="outlined"
              textStyle={{ color: getStatusColor(item.status) }}
              style={{ borderColor: getStatusColor(item.status) }}
            >
              {getStatusLabel(item.status)}
            </Chip>
          </View>
          <IconButton
            icon="dots-vertical"
            size={20}
            onPress={() => {}}
          />
        </View>

        <View style={styles.metadata}>
          <Chip icon="tag" style={styles.metaChip}>{item.category}</Chip>
          <Chip icon="calendar" style={styles.metaChip}>{item.date}</Chip>
        </View>

        <View style={styles.footer}>
          <View style={styles.tipsContainer}>
            <Paragraph style={styles.tipsText}>
              💬 {item.tipsCount} {item.tipsCount === 1 ? 'tip' : 'tips'}
            </Paragraph>
          </View>
          <Paragraph style={styles.reward}>{item.reward}</Paragraph>
        </View>
      </Card.Content>
    </Card>
  );

  return (
    <View style={styles.container}>
      <View style={styles.filterContainer}>
        <SegmentedButtons
          value={filter}
          onValueChange={setFilter}
          buttons={[
            { value: 'all', label: 'All' },
            { value: 'active', label: 'Active' },
            { value: 'resolved', label: 'Resolved' },
            { value: 'closed', label: 'Closed' },
          ]}
        />
      </View>

      <FlatList
        data={getFilteredCases()}
        renderItem={renderCase}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Paragraph>No cases found</Paragraph>
          </View>
        }
      />

      <FAB
        icon="plus"
        label="New Case"
        style={styles.fab}
        onPress={() => navigation.navigate('CreateCase')}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  filterContainer: {
    padding: 16,
    backgroundColor: colors.surface,
    elevation: 2,
  },
  list: {
    padding: 16,
    paddingBottom: 80,
  },
  card: {
    marginBottom: 12,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 18,
    flex: 1,
  },
  metadata: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  metaChip: {
    marginRight: 8,
    marginBottom: 4,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  tipsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tipsText: {
    fontSize: 14,
    color: colors.placeholder,
  },
  reward: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: 'bold',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
    backgroundColor: colors.primary,
  },
});

export default MyCasesScreen;
