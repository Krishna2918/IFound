import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { Card, Title, Paragraph, Chip, SegmentedButtons, Divider, ActivityIndicator, Text } from 'react-native-paper';
import { colors } from '../../config/theme';
import { paymentAPI } from '../../services/api';

const PaymentHistoryScreen = ({ navigation }) => {
  const [filter, setFilter] = useState('all');
  const [transactions, setTransactions] = useState([]);
  const [balance, setBalance] = useState({ received: 0, paid: 0, net: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const params = filter !== 'all' ? { type: filter } : {};

      const [historyRes, balanceRes] = await Promise.all([
        paymentAPI.getTransactionHistory(params),
        paymentAPI.getUserBalance(),
      ]);

      setTransactions(historyRes.data?.transactions || []);

      const balanceData = balanceRes.data || {};
      setBalance({
        received: parseFloat(balanceData.total_earned || 0),
        paid: parseFloat(balanceData.total_spent || 0),
        net: parseFloat(balanceData.available_balance || 0),
      });
    } catch (err) {
      console.error('Failed to fetch payment data:', err);
      setError(err.message || 'Failed to load payment history');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  const formatAmount = (amount) => {
    return `$${parseFloat(amount || 0).toFixed(2)}`;
  };

  const getTransactionType = (transaction) => {
    if (transaction.transaction_type === 'bounty_payment') {
      return transaction.finder_id ? 'received' : 'paid';
    }
    return transaction.amount > 0 ? 'received' : 'paid';
  };

  const renderTransaction = ({ item }) => {
    const type = getTransactionType(item);
    const isReceived = type === 'received';

    return (
      <Card
        style={styles.card}
        onPress={() => item.case_id && navigation.navigate('CaseDetail', { caseId: item.case_id })}
      >
        <Card.Content>
          <View style={styles.transactionHeader}>
            <View style={styles.transactionInfo}>
              <Title
                style={[
                  styles.amount,
                  { color: isReceived ? colors.success : colors.error }
                ]}
              >
                {isReceived ? '+' : '-'}{formatAmount(item.net_amount || item.amount)}
              </Title>
              <Paragraph style={styles.description}>
                {item.metadata?.item_title || item.transaction_type?.replace('_', ' ') || 'Transaction'}
              </Paragraph>
            </View>
            <Chip
              mode="outlined"
              textStyle={{
                color: item.status === 'completed' ? colors.success : colors.warning,
              }}
              style={{
                borderColor: item.status === 'completed' ? colors.success : colors.warning,
              }}
            >
              {item.status?.charAt(0).toUpperCase() + item.status?.slice(1)}
            </Chip>
          </View>

          <View style={styles.transactionFooter}>
            <Paragraph style={styles.date}>{formatDate(item.createdAt)}</Paragraph>
            <Chip
              mode="flat"
              style={{
                backgroundColor: isReceived
                  ? colors.success + '20'
                  : colors.error + '20',
              }}
              textStyle={{
                color: isReceived ? colors.success : colors.error,
              }}
            >
              {isReceived ? 'Received' : 'Paid'}
            </Chip>
          </View>
        </Card.Content>
      </Card>
    );
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading payment history...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <Chip icon="refresh" onPress={fetchData}>Retry</Chip>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Card style={styles.summaryCard}>
        <Card.Content>
          <Title style={styles.summaryTitle}>Payment Summary</Title>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryItem}>
              <Paragraph style={styles.summaryLabel}>Total Earned</Paragraph>
              <Title style={[styles.summaryValue, { color: colors.success }]}>
                ${balance.received.toFixed(2)}
              </Title>
            </View>
            <View style={styles.summaryItem}>
              <Paragraph style={styles.summaryLabel}>Total Spent</Paragraph>
              <Title style={[styles.summaryValue, { color: colors.error }]}>
                ${balance.paid.toFixed(2)}
              </Title>
            </View>
            <View style={styles.summaryItemFull}>
              <Paragraph style={styles.summaryLabel}>Available Balance</Paragraph>
              <Title
                style={[
                  styles.summaryValue,
                  { color: balance.net >= 0 ? colors.success : colors.error }
                ]}
              >
                ${Math.abs(balance.net).toFixed(2)}
              </Title>
            </View>
          </View>
        </Card.Content>
      </Card>

      <View style={styles.filterContainer}>
        <SegmentedButtons
          value={filter}
          onValueChange={setFilter}
          buttons={[
            { value: 'all', label: 'All' },
            { value: 'bounty_payment', label: 'Bounties' },
            { value: 'withdrawal', label: 'Withdrawals' },
          ]}
        />
      </View>

      <FlatList
        data={transactions}
        renderItem={renderTransaction}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ItemSeparatorComponent={() => <Divider style={styles.divider} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Paragraph>No transactions found</Paragraph>
            <Paragraph style={styles.emptySubtext}>
              Your payment history will appear here
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
  summaryCard: {
    margin: 16,
    elevation: 2,
    backgroundColor: colors.primary + '10',
  },
  summaryTitle: {
    textAlign: 'center',
    marginBottom: 16,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  summaryItem: {
    width: '48%',
    alignItems: 'center',
    padding: 12,
    backgroundColor: colors.surface,
    borderRadius: 8,
    marginBottom: 8,
  },
  summaryItemFull: {
    width: '100%',
    alignItems: 'center',
    padding: 12,
    backgroundColor: colors.surface,
    borderRadius: 8,
  },
  summaryLabel: {
    fontSize: 12,
    color: colors.placeholder,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  filterContainer: {
    padding: 16,
    paddingTop: 0,
  },
  list: {
    padding: 16,
    paddingTop: 0,
  },
  card: {
    elevation: 2,
  },
  transactionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  transactionInfo: {
    flex: 1,
    marginRight: 12,
  },
  amount: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  description: {
    fontSize: 14,
    color: colors.text,
    marginTop: 4,
  },
  transactionFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  date: {
    fontSize: 12,
    color: colors.placeholder,
  },
  divider: {
    marginVertical: 8,
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

export default PaymentHistoryScreen;
