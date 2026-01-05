import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Avatar, Title, Paragraph, Card, List, Button, Divider } from 'react-native-paper';
import { colors } from '../../config/theme';

const ProfileScreen = ({ navigation }) => {
  const user = {
    name: 'John Doe',
    email: 'john.doe@example.com',
    phone: '+1 234 567 8900',
    avatar: 'https://via.placeholder.com/150/2563EB/FFFFFF?text=JD',
    memberSince: 'November 2024',
    stats: {
      casesPosted: 5,
      tipsSubmitted: 12,
      successfulFinds: 3,
      rating: 4.8,
    },
  };

  const handleLogout = () => {
    // Implement logout logic
    navigation.reset({
      index: 0,
      routes: [{ name: 'Login' }],
    });
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Avatar.Image
          size={100}
          source={{ uri: user.avatar }}
          style={styles.avatar}
        />
        <Title style={styles.name}>{user.name}</Title>
        <Paragraph style={styles.email}>{user.email}</Paragraph>
        <Paragraph style={styles.memberSince}>Member since {user.memberSince}</Paragraph>
      </View>

      <Card style={styles.statsCard}>
        <Card.Content>
          <Title style={styles.statsTitle}>My Statistics</Title>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Title style={styles.statValue}>{user.stats.casesPosted}</Title>
              <Paragraph style={styles.statLabel}>Cases Posted</Paragraph>
            </View>
            <View style={styles.statItem}>
              <Title style={styles.statValue}>{user.stats.tipsSubmitted}</Title>
              <Paragraph style={styles.statLabel}>Tips Submitted</Paragraph>
            </View>
            <View style={styles.statItem}>
              <Title style={styles.statValue}>{user.stats.successfulFinds}</Title>
              <Paragraph style={styles.statLabel}>Successful Finds</Paragraph>
            </View>
            <View style={styles.statItem}>
              <Title style={styles.statValue}>{user.stats.rating} ⭐</Title>
              <Paragraph style={styles.statLabel}>Rating</Paragraph>
            </View>
          </View>
        </Card.Content>
      </Card>

      <Card style={styles.menuCard}>
        <List.Section>
          <List.Item
            title="My Cases"
            description="View cases you've posted"
            left={props => <List.Icon {...props} icon="briefcase" />}
            right={props => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => navigation.navigate('MyCases')}
          />
          <Divider />
          <List.Item
            title="My Submissions"
            description="View tips you've submitted"
            left={props => <List.Icon {...props} icon="send" />}
            right={props => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => navigation.navigate('MySubmissions')}
          />
          <Divider />
          <List.Item
            title="Payment History"
            description="View rewards and transactions"
            left={props => <List.Icon {...props} icon="cash" />}
            right={props => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => navigation.navigate('PaymentHistory')}
          />
          <Divider />
          <List.Item
            title="Edit Profile"
            description="Update your information"
            left={props => <List.Icon {...props} icon="account-edit" />}
            right={props => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => {}}
          />
          <Divider />
          <List.Item
            title="Settings"
            description="App preferences and notifications"
            left={props => <List.Icon {...props} icon="cog" />}
            right={props => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => {}}
          />
          <Divider />
          <List.Item
            title="Help & Support"
            description="Get help or report issues"
            left={props => <List.Icon {...props} icon="help-circle" />}
            right={props => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => {}}
          />
        </List.Section>
      </Card>

      <Button
        mode="outlined"
        onPress={handleLogout}
        style={styles.logoutButton}
        icon="logout"
        textColor={colors.error}
      >
        Logout
      </Button>

      <View style={styles.footer}>
        <Paragraph style={styles.version}>Version 1.0.0</Paragraph>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: colors.primary,
  },
  avatar: {
    marginBottom: 12,
  },
  name: {
    color: colors.surface,
    fontSize: 24,
    fontWeight: 'bold',
  },
  email: {
    color: colors.surface,
    opacity: 0.9,
  },
  memberSince: {
    color: colors.surface,
    opacity: 0.8,
    fontSize: 12,
    marginTop: 4,
  },
  statsCard: {
    margin: 16,
    elevation: 2,
  },
  statsTitle: {
    marginBottom: 16,
    textAlign: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
    width: '45%',
    marginBottom: 16,
  },
  statValue: {
    fontSize: 28,
    color: colors.primary,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 12,
    color: colors.placeholder,
    textAlign: 'center',
  },
  menuCard: {
    margin: 16,
    marginTop: 0,
    elevation: 2,
  },
  logoutButton: {
    margin: 16,
    borderColor: colors.error,
  },
  footer: {
    alignItems: 'center',
    padding: 16,
  },
  version: {
    fontSize: 12,
    color: colors.placeholder,
  },
});

export default ProfileScreen;
