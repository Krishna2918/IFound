import React, { useState } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { Card, Title, Paragraph, Chip, SegmentedButtons, Divider } from 'react-native-paper';
import { colors } from '../../config/theme';

const PaymentHistoryScreen = ({ navigation }) => {
  const [filter, setFilter] = useState('all');

  const mockTransactions = [
    {
      id: '1',
      type: 'received',
      amount: '$50',
      description: 'Reward for finding iPhone 13',
      date: '2024-11-05',
      status: 'completed',
      caseId: '1',
    },
    {
      id: '2',
      type: 'paid',
      amount: '$100',
      description: 'Reward for Lost Wallet case',
      date: '2024-11-03',
      status: 'completed',
      caseId: '2',
    },
    {
      id: '3',
      type: 'received',
      amount: '$25',
      description: 'Reward for tip on Found Cat',
      date: '2024-10-28',
      status: 'pending',
      caseId: '3',
    },
    {
      id: '4',
      type: 'paid',
      amount: '$75',
      description: 'Reward for Lost Dog case',
      date: '2024-10-25',
      status: 'completed',
      caseId: '4',
    },
  ];

  const getFilteredTransactions = () => {
    if (filter === 'all') return mockTransactions;
    return mockTransactions.filter(t => t.type === filter);
  };

  const calculateTotal = () => {
    const received = mockTransactions
      .filter(t => t.type === 'received' && t.status === 'completed')
      .reduce((sum, t) => sum + parseFloat(t.amount.replace('$', '')), 0);

    const paid = mockTransactions
      .filter(t => t.type === 'paid' && t.status === 'completed')
      .reduce((sum, t) => sum + parseFloat(t.amount.replace('$', '')), 0);

    return { received, paid, net: received - paid };
  };

  const totals = calculateTotal();

  const renderTransaction = ({ item }) => (
    <Card
      style={styles.card}
      onPress={() => navigation.navigate('CaseDetail', { caseId: item.caseId })}
    >
      <Card.Content>
        <View style={styles.transactionHeader}>
          <View style={styles.transactionInfo}>
            <Title
              style={[
                styles.amount,
                { color: item.type === 'received' ? colors.success : colors.error }
              ]}
            >
              {item.type === 'received' ? '+' : '-'}{item.amount}
            </Title>
            <Paragraph style={styles.description}>{item.description}</Paragraph>
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
            {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
          </Chip>
        </View>

        <View style={styles.transactionFooter}>
          <Paragraph style={styles.date}>📅 {item.date}</Paragraph>
          <Chip
            mode="flat"
            style={{
              backgroundColor: item.type === 'received'
                ? colors.success + '20'
                : colors.error + '20',
            }}
            textStyle={{
              color: item.type === 'received' ? colors.success : colors.error,
            }}
          >
            {item.type === 'received' ? 'Received' : 'Paid'}
          </Chip>
        </View>
      </Card.Content>
    </Card>
  );

  return (
    <View style={styles.container}>
      <Card style={styles.summaryCard}>
        <Card.Content>
          <Title style={styles.summaryTitle}>Payment Summary</Title>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryItem}>
              <Paragraph style={styles.summaryLabel}>Total Received</Paragraph>
              <Title style={[styles.summaryValue, { color: colors.success }]}>
                ${totals.received.toFixed(2)}
              </Title>
            </View>
            <View style={styles.summaryItem}>
              <Paragraph style={styles.summaryLabel}>Total Paid</Paragraph>
              <Title style={[styles.summaryValue, { color: colors.error }]}>
                ${totals.paid.toFixed(2)}
              </Title>
            </View>
            <View style={styles.summaryItemFull}>
              <Paragraph style={styles.summaryLabel}>Net Balance</Paragraph>
              <Title
                style={[
                  styles.summaryValue,
                  { color: totals.net >= 0 ? colors.success : colors.error }
                ]}
              >
                ${Math.abs(totals.net).toFixed(2)}
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
            { value: 'received', label: 'Received' },
            { value: 'paid', label: 'Paid' },
          ]}
        />
      </View>

      <FlatList
        data={getFilteredTransactions()}
        renderItem={renderTransaction}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <Divider style={styles.divider} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Paragraph>No transactions found</Paragraph>
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
});

export default PaymentHistoryScreen;
