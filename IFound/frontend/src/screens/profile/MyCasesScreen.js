import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { Card, Title, Paragraph, Chip, FAB, SegmentedButtons, IconButton, ActivityIndicator, Text } from 'react-native-paper';
import { colors } from '../../config/theme';
import { caseAPI } from '../../services/api';

const MyCasesScreen = ({ navigation }) => {
  const [filter, setFilter] = useState('all');
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchMyCases = useCallback(async () => {
    try {
      setError(null);
      const params = filter !== 'all' ? { status: filter } : {};
      const response = await caseAPI.getMyCases(params);
      setCases(response.data?.cases || []);
    } catch (err) {
      console.error('Failed to fetch cases:', err);
      setError(err.message || 'Failed to load cases');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchMyCases();
  }, [fetchMyCases]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchMyCases();
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return colors.success;
      case 'resolved':
      case 'completed':
        return colors.primary;
      case 'claimed':
        return '#F59E0B';
      case 'expired':
      case 'closed':
        return colors.disabled;
      default:
        return colors.disabled;
    }
  };

  const getStatusLabel = (status) => {
    return status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ');
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  const formatReward = (amount) => {
    if (!amount || amount === 0) return 'No reward';
    return `$${parseFloat(amount).toFixed(0)}`;
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
          <Chip icon="tag" style={styles.metaChip}>
            {item.item_category || item.case_type || 'Other'}
          </Chip>
          <Chip icon="calendar" style={styles.metaChip}>
            {formatDate(item.createdAt)}
          </Chip>
        </View>

        <View style={styles.footer}>
          <View style={styles.tipsContainer}>
            <Paragraph style={styles.tipsText}>
              {item.view_count || 0} views
            </Paragraph>
          </View>
          <Paragraph style={styles.reward}>
            {formatReward(item.bounty_amount)}
          </Paragraph>
        </View>
      </Card.Content>
    </Card>
  );

  if (loading && !refreshing) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading your cases...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <Chip icon="refresh" onPress={fetchMyCases}>Retry</Chip>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.filterContainer}>
        <SegmentedButtons
          value={filter}
          onValueChange={setFilter}
          buttons={[
            { value: 'all', label: 'All' },
            { value: 'active', label: 'Active' },
            { value: 'claimed', label: 'Claimed' },
            { value: 'resolved', label: 'Resolved' },
          ]}
        />
      </View>

      <FlatList
        data={cases}
        renderItem={renderCase}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Paragraph>No cases found</Paragraph>
            <Paragraph style={styles.emptySubtext}>
              Post a case to find your lost item
            </Paragraph>
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
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  loadingText: {
    marginTop: 16,
    color: colors.placeholder,
  },
  errorText: {
    marginBottom: 16,
    color: colors.error,
    textAlign: 'center',
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
  emptySubtext: {
    color: colors.placeholder,
    marginTop: 4,
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
