import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
  Linking,
} from 'react-native';
import {
  Card,
  Title,
  Paragraph,
  Text,
  Chip,
  Button,
  Divider,
  ActivityIndicator,
  TextInput,
  List,
} from 'react-native-paper';
import { colors } from '../../config/theme';
import { claimAPI } from '../../services/api';

const STATUS_COLORS = {
  pending: '#FFC107',
  under_review: '#2196F3',
  accepted: '#4CAF50',
  rejected: '#F44336',
  completed: '#9E9E9E',
  cancelled: '#757575',
  disputed: '#FF5722',
};

const STATUS_LABELS = {
  pending: 'Pending Review',
  under_review: 'Under Review',
  accepted: 'Accepted',
  rejected: 'Rejected',
  completed: 'Completed',
  cancelled: 'Cancelled',
  disputed: 'Disputed',
};

const ClaimDetailScreen = ({ navigation, route }) => {
  const { claimId } = route.params || {};

  const [claim, setClaim] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [questionAnswer, setQuestionAnswer] = useState('');

  useEffect(() => {
    fetchClaimDetails();
  }, [claimId]);

  const fetchClaimDetails = async () => {
    try {
      setLoading(true);
      const response = await claimAPI.getClaimById(claimId);
      if (response.success) {
        setClaim(response.data);
      }
    } catch (error) {
      console.error('Error fetching claim:', error);
      // Use mock data
      setClaim(mockClaim);
    } finally {
      setLoading(false);
    }
  };

  const cancelClaim = async () => {
    Alert.alert(
      'Cancel Claim',
      'Are you sure you want to cancel this claim?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              setActionLoading(true);
              await claimAPI.cancelClaim(claimId);
              Alert.alert('Success', 'Claim cancelled');
              navigation.goBack();
            } catch (error) {
              Alert.alert('Error', error.message);
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const answerQuestion = async () => {
    if (!questionAnswer.trim()) {
      Alert.alert('Error', 'Please enter your answer');
      return;
    }

    try {
      setActionLoading(true);
      await claimAPI.answerVerificationQuestion(claimId, {
        answer: questionAnswer,
      });
      Alert.alert('Success', 'Answer submitted');
      setQuestionAnswer('');
      fetchClaimDetails();
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setActionLoading(false);
    }
  };

  const confirmHandover = async () => {
    Alert.alert(
      'Confirm Handover',
      'Confirm that you have received your item?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            try {
              setActionLoading(true);
              await claimAPI.confirmHandover(claimId);
              Alert.alert('Success', 'Handover confirmed! Thank you for using IFound.');
              fetchClaimDetails();
            } catch (error) {
              Alert.alert('Error', error.message);
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const openChat = () => {
    navigation.navigate('Chat', {
      claimId: claim.id,
      otherPartyName: claim.finder?.first_name
        ? `${claim.finder.first_name} ${claim.finder.last_name || ''}`.trim()
        : 'Finder',
      itemTitle: claim.case?.title || 'Item',
    });
  };

  const openDispute = () => {
    Alert.alert(
      'Open Dispute',
      'If you believe there is an issue with this claim, you can open a dispute. An admin will review the case.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open Dispute',
          style: 'destructive',
          onPress: async () => {
            try {
              setActionLoading(true);
              await claimAPI.openDispute(claimId, { reason: 'Issue with handover' });
              Alert.alert('Success', 'Dispute opened. An admin will review your case.');
              fetchClaimDetails();
            } catch (error) {
              Alert.alert('Error', error.message);
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!claim) {
    return (
      <View style={styles.centered}>
        <Text>Claim not found</Text>
      </View>
    );
  }

  const renderStatusTimeline = () => (
    <Card style={styles.card}>
      <Card.Content>
        <Title style={styles.sectionTitle}>Status Timeline</Title>
        {claim.statusHistory?.map((event, index) => (
          <View key={index} style={styles.timelineItem}>
            <View style={styles.timelineDot} />
            {index < claim.statusHistory.length - 1 && (
              <View style={styles.timelineLine} />
            )}
            <View style={styles.timelineContent}>
              <Text style={styles.timelineStatus}>
                {STATUS_LABELS[event.status] || event.status}
              </Text>
              <Text style={styles.timelineDate}>
                {new Date(event.timestamp).toLocaleString()}
              </Text>
              {event.note && (
                <Text style={styles.timelineNote}>{event.note}</Text>
              )}
            </View>
          </View>
        ))}
      </Card.Content>
    </Card>
  );

  const renderVerificationQA = () => {
    if (!claim.verificationQuestions?.length) return null;

    const pendingQuestion = claim.verificationQuestions.find(q => !q.answered);

    return (
      <Card style={styles.card}>
        <Card.Content>
          <Title style={styles.sectionTitle}>Verification Questions</Title>
          <Paragraph style={styles.qaDescription}>
            The finder has asked some questions to verify your ownership.
          </Paragraph>

          {claim.verificationQuestions.map((q, index) => (
            <View key={index} style={styles.qaItem}>
              <Text style={styles.question}>Q: {q.question}</Text>
              {q.answered ? (
                <Text style={styles.answer}>A: {q.answer}</Text>
              ) : (
                <Chip icon="clock" style={styles.pendingChip}>
                  Awaiting your answer
                </Chip>
              )}
            </View>
          ))}

          {pendingQuestion && (
            <View style={styles.answerForm}>
              <TextInput
                mode="outlined"
                label="Your Answer"
                value={questionAnswer}
                onChangeText={setQuestionAnswer}
                multiline
                style={styles.answerInput}
              />
              <Button
                mode="contained"
                onPress={answerQuestion}
                loading={actionLoading}
                style={styles.answerButton}
              >
                Submit Answer
              </Button>
            </View>
          )}
        </Card.Content>
      </Card>
    );
  };

  const renderHandoverInfo = () => {
    if (claim.status !== 'accepted') return null;

    return (
      <Card style={styles.card}>
        <Card.Content>
          <Title style={styles.sectionTitle}>Handover Details</Title>

          {claim.handover_location && (
            <List.Item
              title="Meeting Location"
              description={claim.handover_location}
              left={(props) => <List.Icon {...props} icon="map-marker" />}
              onPress={() => {
                const url = `https://maps.google.com/?q=${encodeURIComponent(claim.handover_location)}`;
                Linking.openURL(url);
              }}
            />
          )}

          {claim.handover_time && (
            <List.Item
              title="Meeting Time"
              description={new Date(claim.handover_time).toLocaleString()}
              left={(props) => <List.Icon {...props} icon="clock" />}
            />
          )}

          <View style={styles.handoverActions}>
            <Button
              mode="contained"
              icon="chat"
              onPress={openChat}
              style={styles.chatButton}
            >
              Chat with Finder
            </Button>

            <Button
              mode="contained"
              icon="check"
              onPress={confirmHandover}
              loading={actionLoading}
              style={styles.confirmButton}
            >
              Confirm Received
            </Button>
          </View>
        </Card.Content>
      </Card>
    );
  };

  return (
    <ScrollView style={styles.container}>
      {/* Case Info Card */}
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.caseHeader}>
            {claim.case?.photos?.[0] && (
              <Image
                source={{ uri: claim.case.photos[0].url }}
                style={styles.caseImage}
              />
            )}
            <View style={styles.caseInfo}>
              <Title style={styles.caseTitle}>{claim.case?.title}</Title>
              <Chip style={styles.categoryChip}>{claim.case?.category}</Chip>
            </View>
          </View>

          <Divider style={styles.divider} />

          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Status:</Text>
            <Chip
              style={[
                styles.statusChip,
                { backgroundColor: STATUS_COLORS[claim.status] },
              ]}
              textStyle={styles.statusText}
            >
              {STATUS_LABELS[claim.status]}
            </Chip>
          </View>

          {claim.bounty_offered > 0 && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Reward Offered:</Text>
              <Text style={styles.infoValue}>${claim.bounty_offered} CAD</Text>
            </View>
          )}

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Submitted:</Text>
            <Text style={styles.infoValue}>
              {new Date(claim.createdAt).toLocaleString()}
            </Text>
          </View>
        </Card.Content>
      </Card>

      {/* Verification Description */}
      <Card style={styles.card}>
        <Card.Content>
          <Title style={styles.sectionTitle}>Your Verification</Title>
          <Paragraph>{claim.verification_description}</Paragraph>

          {claim.proof_photos?.length > 0 && (
            <ScrollView horizontal style={styles.proofPhotos}>
              {claim.proof_photos.map((photo, index) => (
                <Image
                  key={index}
                  source={{ uri: photo.url }}
                  style={styles.proofPhoto}
                />
              ))}
            </ScrollView>
          )}
        </Card.Content>
      </Card>

      {/* Verification Q&A */}
      {renderVerificationQA()}

      {/* Handover Info */}
      {renderHandoverInfo()}

      {/* Status Timeline */}
      {renderStatusTimeline()}

      {/* Actions */}
      <View style={styles.actions}>
        {['pending', 'under_review'].includes(claim.status) && (
          <Button
            mode="outlined"
            onPress={cancelClaim}
            loading={actionLoading}
            style={styles.cancelButton}
          >
            Cancel Claim
          </Button>
        )}

        {claim.status === 'rejected' && claim.rejection_reason && (
          <Card style={styles.rejectionCard}>
            <Card.Content>
              <Title style={styles.rejectionTitle}>Rejection Reason</Title>
              <Paragraph>{claim.rejection_reason}</Paragraph>
            </Card.Content>
          </Card>
        )}

        {claim.status === 'accepted' && (
          <Button
            mode="text"
            onPress={openDispute}
            icon="alert"
            textColor="#FF5722"
          >
            Report Issue
          </Button>
        )}
      </View>
    </ScrollView>
  );
};

// Mock data for development
const mockClaim = {
  id: '1',
  status: 'accepted',
  bounty_offered: 25,
  verification_description: 'The wallet has my initials JD on the inside. There is a small scratch on the leather near the card slots. Contains my library card from downtown branch.',
  createdAt: new Date(Date.now() - 86400000).toISOString(),
  handover_location: '123 Main Street Coffee Shop',
  handover_time: new Date(Date.now() + 86400000).toISOString(),
  proof_photos: [
    { url: 'https://via.placeholder.com/200' },
  ],
  verificationQuestions: [
    { question: 'What color is the interior lining?', answer: 'Navy blue', answered: true },
    { question: 'How many card slots are there?', answer: null, answered: false },
  ],
  statusHistory: [
    { status: 'pending', timestamp: new Date(Date.now() - 86400000).toISOString() },
    { status: 'under_review', timestamp: new Date(Date.now() - 43200000).toISOString(), note: 'Finder is reviewing your verification' },
    { status: 'accepted', timestamp: new Date(Date.now() - 3600000).toISOString(), note: 'Ownership verified!' },
  ],
  case: {
    id: 'c1',
    title: 'Lost Blue Wallet',
    category: 'Wallet',
    photos: [{ url: 'https://via.placeholder.com/100' }],
  },
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    padding: 16,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
  },
  caseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  caseImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    marginRight: 12,
    backgroundColor: '#E0E0E0',
  },
  caseInfo: {
    flex: 1,
  },
  caseTitle: {
    fontSize: 18,
    marginBottom: 8,
  },
  categoryChip: {
    alignSelf: 'flex-start',
  },
  divider: {
    marginVertical: 16,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusLabel: {
    fontSize: 16,
    marginRight: 8,
  },
  statusChip: {},
  statusText: {
    color: '#FFFFFF',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  infoLabel: {
    color: '#666',
  },
  infoValue: {
    fontWeight: '500',
  },
  sectionTitle: {
    fontSize: 18,
    marginBottom: 12,
  },
  proofPhotos: {
    marginTop: 12,
  },
  proofPhoto: {
    width: 120,
    height: 120,
    borderRadius: 8,
    marginRight: 8,
  },
  qaDescription: {
    color: '#666',
    marginBottom: 16,
  },
  qaItem: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
  },
  question: {
    fontWeight: '500',
    marginBottom: 8,
  },
  answer: {
    color: '#4CAF50',
  },
  pendingChip: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFF3CD',
  },
  answerForm: {
    marginTop: 16,
  },
  answerInput: {
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
  },
  answerButton: {
    backgroundColor: colors.primary,
  },
  handoverActions: {
    marginTop: 16,
  },
  chatButton: {
    marginBottom: 12,
    backgroundColor: '#2196F3',
  },
  confirmButton: {
    backgroundColor: '#4CAF50',
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
    marginRight: 12,
    marginTop: 4,
  },
  timelineLine: {
    position: 'absolute',
    left: 5,
    top: 16,
    bottom: -16,
    width: 2,
    backgroundColor: '#E0E0E0',
  },
  timelineContent: {
    flex: 1,
  },
  timelineStatus: {
    fontWeight: '500',
    marginBottom: 4,
  },
  timelineDate: {
    color: '#666',
    fontSize: 12,
  },
  timelineNote: {
    color: '#666',
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 4,
  },
  actions: {
    marginBottom: 32,
  },
  cancelButton: {
    borderColor: '#F44336',
  },
  rejectionCard: {
    backgroundColor: '#FFEBEE',
  },
  rejectionTitle: {
    color: '#C62828',
    fontSize: 16,
  },
});

export default ClaimDetailScreen;
