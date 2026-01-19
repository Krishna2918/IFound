import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Image,
  Linking,
  Alert,
} from 'react-native';
import {
  Text,
  TextInput,
  IconButton,
  ActivityIndicator,
  Menu,
  Divider,
  Avatar,
  Card,
  Button,
} from 'react-native-paper';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { colors } from '../../config/theme';
import { messageAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const MESSAGE_TYPES = {
  text: 'text',
  system: 'system',
  location: 'location',
  image: 'image',
  handover_request: 'handover_request',
  handover_confirmed: 'handover_confirmed',
};

const ChatScreen = ({ navigation, route }) => {
  const { claimId, otherPartyName, itemTitle } = route.params || {};
  const { user } = useAuth();

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [menuVisible, setMenuVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const flatListRef = useRef(null);
  const pollIntervalRef = useRef(null);

  useEffect(() => {
    fetchMessages();
    // Poll for new messages every 5 seconds
    pollIntervalRef.current = setInterval(fetchMessages, 5000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [claimId]);

  const fetchMessages = async () => {
    try {
      const response = await messageAPI.getMessages(claimId);
      if (response.success) {
        setMessages(response.data.messages || []);
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
      // Use mock data in case of error
      if (messages.length === 0) {
        setMessages(mockMessages);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchMessages();
  }, [claimId]);

  const sendMessage = async () => {
    if (!messageText.trim()) return;

    const tempMessage = {
      id: `temp_${Date.now()}`,
      content: messageText.trim(),
      message_type: MESSAGE_TYPES.text,
      sender_id: user?.id,
      sender: {
        id: user?.id,
        first_name: user?.first_name || 'You',
        last_name: user?.last_name || '',
      },
      createdAt: new Date().toISOString(),
      sending: true,
    };

    setMessages(prev => [...prev, tempMessage]);
    setMessageText('');
    setSending(true);

    try {
      const response = await messageAPI.sendMessage(claimId, {
        content: messageText.trim(),
        message_type: MESSAGE_TYPES.text,
      });

      if (response.success) {
        // Replace temp message with real one
        setMessages(prev =>
          prev.map(m => m.id === tempMessage.id ? response.data.message : m)
        );
      }
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert('Error', 'Failed to send message');
      // Remove temp message on error
      setMessages(prev => prev.filter(m => m.id !== tempMessage.id));
    } finally {
      setSending(false);
    }
  };

  const sendLocationMessage = async () => {
    setMenuVisible(false);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Location access is required to share your location');
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = location.coords;

      // Get address
      const [address] = await Location.reverseGeocodeAsync({ latitude, longitude });
      const addressString = address
        ? `${address.street || ''} ${address.city || ''}, ${address.region || ''}`.trim()
        : `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

      setSending(true);
      const response = await messageAPI.sendMessage(claimId, {
        content: `Suggested meeting location: ${addressString}`,
        message_type: MESSAGE_TYPES.location,
        metadata: { latitude, longitude, address: addressString },
      });

      if (response.success) {
        setMessages(prev => [...prev, response.data.message]);
      }
    } catch (error) {
      console.error('Error sharing location:', error);
      Alert.alert('Error', 'Failed to share location');
    } finally {
      setSending(false);
    }
  };

  const sendHandoverRequest = async () => {
    setMenuVisible(false);

    Alert.alert(
      'Request Handover Confirmation',
      'This will ask the other party to confirm that the item has been handed over. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Request',
          onPress: async () => {
            try {
              setSending(true);
              const response = await messageAPI.sendMessage(claimId, {
                content: 'I would like to confirm the handover. Please confirm you have received/handed over the item.',
                message_type: MESSAGE_TYPES.handover_request,
              });

              if (response.success) {
                setMessages(prev => [...prev, response.data.message]);
              }
            } catch (error) {
              console.error('Error sending handover request:', error);
              Alert.alert('Error', 'Failed to send handover request');
            } finally {
              setSending(false);
            }
          },
        },
      ]
    );
  };

  const pickImage = async () => {
    setMenuVisible(false);

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      try {
        setSending(true);
        const formData = new FormData();
        formData.append('file', {
          uri: result.assets[0].uri,
          type: 'image/jpeg',
          name: `chat_image_${Date.now()}.jpg`,
        });

        const response = await messageAPI.uploadFile(claimId, formData);
        if (response.success) {
          setMessages(prev => [...prev, response.data.message]);
        }
      } catch (error) {
        console.error('Error uploading image:', error);
        Alert.alert('Error', 'Failed to upload image');
      } finally {
        setSending(false);
      }
    }
  };

  const openLocation = (metadata) => {
    if (metadata?.latitude && metadata?.longitude) {
      const url = Platform.select({
        ios: `maps:0,0?q=${metadata.latitude},${metadata.longitude}`,
        android: `geo:0,0?q=${metadata.latitude},${metadata.longitude}(Meeting+Location)`,
      });
      Linking.openURL(url).catch(() => {
        // Fallback to Google Maps web
        Linking.openURL(`https://maps.google.com/?q=${metadata.latitude},${metadata.longitude}`);
      });
    }
  };

  const renderMessage = ({ item }) => {
    const isMyMessage = item.sender_id === user?.id;
    const isSystem = item.message_type === MESSAGE_TYPES.system;

    if (isSystem) {
      return (
        <View style={styles.systemMessageContainer}>
          <Text style={styles.systemMessageText}>{item.content}</Text>
        </View>
      );
    }

    return (
      <View
        style={[
          styles.messageContainer,
          isMyMessage ? styles.myMessageContainer : styles.otherMessageContainer,
        ]}
      >
        {!isMyMessage && (
          <Avatar.Text
            size={32}
            label={`${item.sender?.first_name?.[0] || ''}${item.sender?.last_name?.[0] || ''}`}
            style={styles.avatar}
          />
        )}
        <View
          style={[
            styles.messageBubble,
            isMyMessage ? styles.myMessageBubble : styles.otherMessageBubble,
            item.sending && styles.sendingMessage,
          ]}
        >
          {/* Location message */}
          {item.message_type === MESSAGE_TYPES.location && (
            <TouchableOpacity onPress={() => openLocation(item.metadata)}>
              <View style={styles.locationMessage}>
                <Text style={styles.locationIcon}>📍</Text>
                <Text style={[styles.messageText, isMyMessage && styles.myMessageText]}>
                  {item.content}
                </Text>
              </View>
              <Text style={[styles.locationHint, isMyMessage && styles.myLocationHint]}>
                Tap to open in maps
              </Text>
            </TouchableOpacity>
          )}

          {/* Image message */}
          {item.message_type === MESSAGE_TYPES.image && item.metadata?.file_url && (
            <TouchableOpacity>
              <Image
                source={{ uri: item.metadata.file_url }}
                style={styles.messageImage}
                resizeMode="cover"
              />
            </TouchableOpacity>
          )}

          {/* Handover request message */}
          {item.message_type === MESSAGE_TYPES.handover_request && (
            <Card style={styles.handoverCard}>
              <Card.Content>
                <Text style={styles.handoverTitle}>Handover Request</Text>
                <Text style={styles.handoverText}>{item.content}</Text>
                {!isMyMessage && (
                  <Button
                    mode="contained"
                    onPress={() => navigation.goBack()}
                    style={styles.handoverButton}
                  >
                    Go to Claim Details
                  </Button>
                )}
              </Card.Content>
            </Card>
          )}

          {/* Regular text message */}
          {item.message_type === MESSAGE_TYPES.text && (
            <Text style={[styles.messageText, isMyMessage && styles.myMessageText]}>
              {item.content}
            </Text>
          )}

          <Text style={[styles.messageTime, isMyMessage && styles.myMessageTime]}>
            {item.sending ? 'Sending...' : formatTime(item.createdAt)}
          </Text>
        </View>
      </View>
    );
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      {/* Header info */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{itemTitle || 'Item Discussion'}</Text>
        <Text style={styles.headerSubtitle}>
          Chatting with {otherPartyName || 'other party'}
        </Text>
      </View>

      {/* Messages list */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messagesList}
        onRefresh={onRefresh}
        refreshing={refreshing}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>💬</Text>
            <Text style={styles.emptyText}>No messages yet</Text>
            <Text style={styles.emptySubtext}>
              Start the conversation to coordinate the handover
            </Text>
          </View>
        }
      />

      {/* Input area */}
      <View style={styles.inputContainer}>
        <Menu
          visible={menuVisible}
          onDismiss={() => setMenuVisible(false)}
          anchor={
            <IconButton
              icon="plus"
              size={24}
              onPress={() => setMenuVisible(true)}
              style={styles.attachButton}
            />
          }
        >
          <Menu.Item
            onPress={sendLocationMessage}
            leadingIcon="map-marker"
            title="Share Location"
          />
          <Menu.Item
            onPress={pickImage}
            leadingIcon="image"
            title="Send Image"
          />
          <Divider />
          <Menu.Item
            onPress={sendHandoverRequest}
            leadingIcon="handshake"
            title="Request Handover"
          />
        </Menu>

        <TextInput
          mode="outlined"
          placeholder="Type a message..."
          value={messageText}
          onChangeText={setMessageText}
          style={styles.input}
          outlineStyle={styles.inputOutline}
          multiline
          maxLength={1000}
        />

        <IconButton
          icon="send"
          size={24}
          iconColor={colors.primary}
          onPress={sendMessage}
          disabled={!messageText.trim() || sending}
          style={styles.sendButton}
        />
      </View>
    </KeyboardAvoidingView>
  );
};

// Mock messages for development
const mockMessages = [
  {
    id: '1',
    content: 'Chat has been enabled! You can now coordinate the handover of "Lost Blue Wallet".',
    message_type: MESSAGE_TYPES.system,
    sender_id: 'system',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: '2',
    content: 'Hi! I\'ve accepted your claim for the Lost Blue Wallet. Let\'s arrange a safe time and place to meet for the handover. When and where works best for you?',
    message_type: MESSAGE_TYPES.text,
    sender_id: 'finder1',
    sender: { id: 'finder1', first_name: 'John', last_name: 'Doe' },
    createdAt: new Date(Date.now() - 3500000).toISOString(),
  },
  {
    id: '3',
    content: 'Thank you so much! I can meet tomorrow afternoon. How about the coffee shop on Main Street?',
    message_type: MESSAGE_TYPES.text,
    sender_id: 'user1',
    sender: { id: 'user1', first_name: 'Jane', last_name: 'Smith' },
    createdAt: new Date(Date.now() - 3400000).toISOString(),
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
  header: {
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  headerSubtitle: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  messagesList: {
    padding: 16,
    flexGrow: 1,
  },
  messageContainer: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'flex-end',
  },
  myMessageContainer: {
    justifyContent: 'flex-end',
  },
  otherMessageContainer: {
    justifyContent: 'flex-start',
  },
  avatar: {
    marginRight: 8,
    backgroundColor: colors.surfaceVariant,
  },
  messageBubble: {
    maxWidth: '75%',
    padding: 12,
    borderRadius: 16,
  },
  myMessageBubble: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  otherMessageBubble: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 4,
  },
  sendingMessage: {
    opacity: 0.7,
  },
  messageText: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 20,
  },
  myMessageText: {
    color: colors.onPrimary,
  },
  messageTime: {
    fontSize: 11,
    color: colors.onSurfaceVariant,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  myMessageTime: {
    color: 'rgba(4,47,46,0.7)',
  },
  systemMessageContainer: {
    alignItems: 'center',
    marginVertical: 16,
  },
  systemMessageText: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    backgroundColor: colors.surfaceVariant,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    textAlign: 'center',
  },
  locationMessage: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  locationHint: {
    fontSize: 11,
    color: colors.onSurfaceVariant,
    marginTop: 4,
    fontStyle: 'italic',
  },
  myLocationHint: {
    color: 'rgba(255,255,255,0.7)',
  },
  messageImage: {
    width: 200,
    height: 150,
    borderRadius: 8,
  },
  handoverCard: {
    backgroundColor: '#78350F',
    borderRadius: 8,
  },
  handoverTitle: {
    fontWeight: 'bold',
    marginBottom: 4,
    color: '#FCD34D',
  },
  handoverText: {
    color: '#FDE68A',
    marginBottom: 8,
  },
  handoverButton: {
    marginTop: 8,
    backgroundColor: colors.primary,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  attachButton: {
    margin: 0,
  },
  input: {
    flex: 1,
    maxHeight: 100,
    marginHorizontal: 4,
    backgroundColor: colors.surfaceVariant,
  },
  inputOutline: {
    borderRadius: 20,
  },
  sendButton: {
    margin: 0,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.onSurfaceVariant,
    marginTop: 8,
    textAlign: 'center',
  },
});

export default ChatScreen;
