import React, { useState } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { Card, Title, Paragraph, Chip, SegmentedButtons } from 'react-native-paper';
import { colors } from '../../config/theme';

const MySubmissionsScreen = ({ navigation }) => {
  const [filter, setFilter] = useState('all');

  const mockSubmissions = [
    {
      id: '1',
      caseTitle: 'Lost iPhone 13',
      date: '2024-11-05',
      status: 'pending',
      description: 'I saw a blue iPhone near the coffee shop...',
      caseId: '1',
    },
    {
      id: '2',
      caseTitle: 'Found Cat',
      date: '2024-11-03',
      status: 'accepted',
      description: 'I found the cat near Central Park...',
      caseId: '2',
      reward: '$50',
    },
    {
      id: '3',
      caseTitle: 'Lost Wallet',
      date: '2024-11-01',
      status: 'rejected',
      description: 'I think I saw it at the mall...',
      caseId: '3',
    },
  ];

  const getFilteredSubmissions = () => {
    if (filter === 'all') return mockSubmissions;
    return mockSubmissions.filter(sub => sub.status === filter);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending':
        return colors.warning;
      case 'accepted':
        return colors.success;
      case 'rejected':
        return colors.error;
      default:
        return colors.disabled;
    }
  };

  const getStatusLabel = (status) => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const renderSubmission = ({ item }) => (
    <Card
      style={styles.card}
      onPress={() => navigation.navigate('CaseDetail', { caseId: item.caseId })}
    >
      <Card.Content>
        <View style={styles.header}>
          <Title style={styles.title} numberOfLines={1}>{item.caseTitle}</Title>
          <Chip
            mode="outlined"
            textStyle={{ color: getStatusColor(item.status) }}
            style={{ borderColor: getStatusColor(item.status) }}
          >
            {getStatusLabel(item.status)}
          </Chip>
        </View>

        <Paragraph style={styles.description} numberOfLines={2}>
          {item.description}
        </Paragraph>

        <View style={styles.footer}>
          <Paragraph style={styles.date}>📅 {item.date}</Paragraph>
          {item.reward && (
            <Paragraph style={styles.reward}>💰 Reward: {item.reward}</Paragraph>
          )}
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
            { value: 'pending', label: 'Pending' },
            { value: 'accepted', label: 'Accepted' },
            { value: 'rejected', label: 'Rejected' },
          ]}
        />
      </View>

      <FlatList
        data={getFilteredSubmissions()}
        renderItem={renderSubmission}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Paragraph>No submissions found</Paragraph>
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
  filterContainer: {
    padding: 16,
    backgroundColor: colors.surface,
    elevation: 2,
  },
  list: {
    padding: 16,
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
  title: {
    flex: 1,
    fontSize: 18,
    marginRight: 8,
  },
  description: {
    color: colors.placeholder,
    marginBottom: 12,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  date: {
    fontSize: 12,
    color: colors.placeholder,
  },
  reward: {
    fontSize: 12,
    color: colors.success,
    fontWeight: 'bold',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
});

export default MySubmissionsScreen;
