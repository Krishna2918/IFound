import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import {
  Text,
  Avatar,
  Badge,
  ActivityIndicator,
  Divider,
  Chip,
} from 'react-native-paper';
import { colors } from '../../config/theme';
import { messageAPI } from '../../services/api';
import { useFocusEffect } from '@react-navigation/native';

const STATUS_COLORS = {
  pending: '#FFC107',
  under_review: '#2196F3',
  accepted: '#4CAF50',
  rejected: '#F44336',
  completed: '#9E9E9E',
  cancelled: '#757575',
  disputed: '#FF5722',
};

const ChatListScreen = ({ navigation }) => {
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Refresh chats when screen gains focus
  useFocusEffect(
    useCallback(() => {
      fetchChats();
      fetchUnreadCount();
    }, [])
  );

  const fetchChats = async () => {
    try {
      const response = await messageAPI.getMyChats();
      if (response.success) {
        setChats(response.data.chats || []);
      }
    } catch (error) {
      console.error('Error fetching chats:', error);
      // Use mock data in development
      setChats(mockChats);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchUnreadCount = async () => {
    try {
      const response = await messageAPI.getUnreadCount();
      if (response.success) {
        setUnreadCount(response.data.unreadCount || 0);
      }
    } catch (error) {
      console.error('Error fetching unread count:', error);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchChats();
    fetchUnreadCount();
  }, []);

  const openChat = (chat) => {
    const otherPartyName = chat.other_party
      ? `${chat.other_party.first_name} ${chat.other_party.last_name}`.trim()
      : 'Unknown';

    navigation.navigate('Chat', {
      claimId: chat.claim_id,
      otherPartyName,
      itemTitle: chat.item_title,
    });
  };

  const formatLastMessage = (message) => {
    if (!message) return 'No messages yet';

    if (message.message_type === 'system') {
      return 'Chat started';
    }
    if (message.message_type === 'location') {
      return '📍 Shared a location';
    }
    if (message.message_type === 'image') {
      return '📷 Shared an image';
    }
    if (message.message_type === 'handover_request') {
      return '🤝 Handover request';
    }

    // Truncate long messages
    if (message.content.length > 50) {
      return message.content.substring(0, 50) + '...';
    }
    return message.content;
  };

  const formatTime = (dateString) => {
    if (!dateString) return '';

    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const getInitials = (party) => {
    if (!party) return '??';
    const first = party.first_name?.[0] || '';
    const last = party.last_name?.[0] || '';
    return (first + last).toUpperCase() || '??';
  };

  const renderChatItem = ({ item }) => (
    <TouchableOpacity onPress={() => openChat(item)} style={styles.chatItem}>
      <View style={styles.avatarContainer}>
        {item.other_party?.profile_photo_url ? (
          <Avatar.Image
            size={50}
            source={{ uri: item.other_party.profile_photo_url }}
          />
        ) : (
          <Avatar.Text
            size={50}
            label={getInitials(item.other_party)}
            style={styles.avatar}
          />
        )}
        {item.unread_count > 0 && (
          <Badge style={styles.unreadBadge}>{item.unread_count}</Badge>
        )}
      </View>

      <View style={styles.chatContent}>
        <View style={styles.chatHeader}>
          <Text style={styles.chatName} numberOfLines={1}>
            {item.other_party
              ? `${item.other_party.first_name} ${item.other_party.last_name}`.trim()
              : 'Unknown User'}
          </Text>
          <Text style={styles.chatTime}>
            {formatTime(item.last_message?.createdAt || item.updated_at)}
          </Text>
        </View>

        <Text style={styles.itemTitle} numberOfLines={1}>
          {item.item_title}
        </Text>

        <View style={styles.chatFooter}>
          <Text
            style={[
              styles.lastMessage,
              item.unread_count > 0 && styles.unreadMessage,
            ]}
            numberOfLines={1}
          >
            {formatLastMessage(item.last_message)}
          </Text>
          <Chip
            style={[
              styles.roleChip,
              item.role === 'finder' ? styles.finderChip : styles.claimantChip,
            ]}
            textStyle={styles.roleChipText}
          >
            {item.role === 'finder' ? 'Finder' : 'Owner'}
          </Chip>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>💬</Text>
      <Text style={styles.emptyTitle}>No Conversations</Text>
      <Text style={styles.emptyText}>
        When you have accepted claims, you'll be able to chat with the other
        party here to coordinate handovers.
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header Stats */}
      {chats.length > 0 && (
        <View style={styles.headerStats}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{chats.length}</Text>
            <Text style={styles.statLabel}>Conversations</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, unreadCount > 0 && styles.unreadStat]}>
              {unreadCount}
            </Text>
            <Text style={styles.statLabel}>Unread</Text>
          </View>
        </View>
      )}

      <FlatList
        data={chats}
        renderItem={renderChatItem}
        keyExtractor={(item) => item.claim_id}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <Divider style={styles.divider} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
          />
        }
        ListEmptyComponent={renderEmptyState}
      />
    </View>
  );
};

// Mock data for development
const mockChats = [
  {
    claim_id: 'claim1',
    role: 'claimant',
    other_party: {
      id: 'user1',
      first_name: 'John',
      last_name: 'Doe',
      profile_photo_url: null,
    },
    item_title: 'Lost Blue Wallet',
    last_message: {
      content: 'Let\'s meet at the coffee shop tomorrow at 2pm',
      message_type: 'text',
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
    unread_count: 2,
    status: 'accepted',
    updated_at: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    claim_id: 'claim2',
    role: 'finder',
    other_party: {
      id: 'user2',
      first_name: 'Jane',
      last_name: 'Smith',
      profile_photo_url: null,
    },
    item_title: 'Lost Keys with Red Keychain',
    last_message: {
      content: 'Shared a location',
      message_type: 'location',
      createdAt: new Date(Date.now() - 86400000).toISOString(),
    },
    unread_count: 0,
    status: 'accepted',
    updated_at: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    claim_id: 'claim3',
    role: 'claimant',
    other_party: {
      id: 'user3',
      first_name: 'Mike',
      last_name: 'Johnson',
      profile_photo_url: null,
    },
    item_title: 'iPhone 13 Pro',
    last_message: {
      content: 'Thank you for returning my phone!',
      message_type: 'text',
      createdAt: new Date(Date.now() - 172800000).toISOString(),
    },
    unread_count: 0,
    status: 'completed',
    updated_at: new Date(Date.now() - 172800000).toISOString(),
  },
];

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerStats: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.primary,
  },
  unreadStat: {
    color: '#F97316',
  },
  statLabel: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginHorizontal: 16,
  },
  listContent: {
    flexGrow: 1,
  },
  chatItem: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  avatar: {
    backgroundColor: colors.primary,
  },
  unreadBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#FF5722',
  },
  chatContent: {
    flex: 1,
    justifyContent: 'center',
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  chatName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
    marginRight: 8,
  },
  chatTime: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
  },
  itemTitle: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    marginBottom: 4,
  },
  chatFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lastMessage: {
    fontSize: 14,
    color: colors.onSurfaceVariant,
    flex: 1,
    marginRight: 8,
  },
  unreadMessage: {
    color: colors.text,
    fontWeight: '500',
  },
  roleChip: {
    height: 22,
  },
  roleChipText: {
    fontSize: 10,
    color: colors.onPrimary,
  },
  finderChip: {
    backgroundColor: '#1E3A8A',
  },
  claimantChip: {
    backgroundColor: '#065F46',
  },
  divider: {
    marginLeft: 78,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    paddingTop: 80,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default ChatListScreen;
