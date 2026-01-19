import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { Card, Title, Paragraph, Chip, SegmentedButtons, ActivityIndicator, Text } from 'react-native-paper';
import { colors } from '../../config/theme';
import { submissionAPI } from '../../services/api';

const MySubmissionsScreen = ({ navigation }) => {
  const [filter, setFilter] = useState('all');
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchMySubmissions = useCallback(async () => {
    try {
      setError(null);
      const params = filter !== 'all' ? { status: filter } : {};
      const response = await submissionAPI.getMySubmissions(params);
      setSubmissions(response.data?.submissions || []);
    } catch (err) {
      console.error('Failed to fetch submissions:', err);
      setError(err.message || 'Failed to load submissions');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchMySubmissions();
  }, [fetchMySubmissions]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchMySubmissions();
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending':
        return colors.warning;
      case 'verified':
      case 'accepted':
        return colors.success;
      case 'rejected':
        return colors.error;
      case 'reviewing':
        return colors.primary;
      default:
        return colors.disabled;
    }
  };

  const getStatusLabel = (status) => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  const renderSubmission = ({ item }) => (
    <Card
      style={styles.card}
      onPress={() => navigation.navigate('CaseDetail', { caseId: item.case_id })}
    >
      <Card.Content>
        <View style={styles.header}>
          <Title style={styles.title} numberOfLines={1}>
            {item.case?.title || 'Case Submission'}
          </Title>
          <Chip
            mode="outlined"
            textStyle={{ color: getStatusColor(item.verification_status || item.status) }}
            style={{ borderColor: getStatusColor(item.verification_status || item.status) }}
          >
            {getStatusLabel(item.verification_status || item.status || 'pending')}
          </Chip>
        </View>

        <Paragraph style={styles.description} numberOfLines={2}>
          {item.content || item.description || 'No description provided'}
        </Paragraph>

        <View style={styles.footer}>
          <Paragraph style={styles.date}>{formatDate(item.createdAt)}</Paragraph>
          {item.reward_earned && (
            <Paragraph style={styles.reward}>Reward: ${item.reward_earned}</Paragraph>
          )}
        </View>
      </Card.Content>
    </Card>
  );

  if (loading && !refreshing) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading your submissions...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <Chip icon="refresh" onPress={fetchMySubmissions}>Retry</Chip>
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
            { value: 'pending', label: 'Pending' },
            { value: 'verified', label: 'Verified' },
            { value: 'rejected', label: 'Rejected' },
          ]}
        />
      </View>

      <FlatList
        data={submissions}
        renderItem={renderSubmission}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Paragraph>No submissions found</Paragraph>
            <Paragraph style={styles.emptySubtext}>
              Submit tips on cases to earn rewards
            </Paragraph>
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
  emptySubtext: {
    color: colors.placeholder,
    marginTop: 4,
  },
});

export default MySubmissionsScreen;
