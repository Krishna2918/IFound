import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
  KeyboardAvoidingView,
  Platform,
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
  IconButton,
  List,
} from 'react-native-paper';
import { colors } from '../../config/theme';
import { claimAPI } from '../../services/api';

const VerificationQAScreen = ({ navigation, route }) => {
  const { claimId, claimData: initialClaimData } = route.params || {};

  const [claim, setClaim] = useState(initialClaimData || null);
  const [loading, setLoading] = useState(!initialClaimData);
  const [actionLoading, setActionLoading] = useState(false);
  const [newQuestion, setNewQuestion] = useState('');
  const [showQuestionInput, setShowQuestionInput] = useState(false);

  useEffect(() => {
    if (!initialClaimData) {
      fetchClaimDetails();
    }
  }, [claimId, initialClaimData]);

  const fetchClaimDetails = async () => {
    try {
      setLoading(true);
      const response = await claimAPI.getClaimById(claimId);
      if (response.success) {
        setClaim(response.data);
      }
    } catch (error) {
      console.error('Error fetching claim:', error);
      Alert.alert('Error', 'Failed to load claim details');
    } finally {
      setLoading(false);
    }
  };

  const askQuestion = async () => {
    if (!newQuestion.trim()) {
      Alert.alert('Error', 'Please enter a question');
      return;
    }

    try {
      setActionLoading(true);
      await claimAPI.askVerificationQuestion(claimId, { question: newQuestion });
      Alert.alert('Success', 'Question sent to claimant');
      setNewQuestion('');
      setShowQuestionInput(false);
      fetchClaimDetails();
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to send question');
    } finally {
      setActionLoading(false);
    }
  };

  const acceptClaim = async () => {
    Alert.alert(
      'Accept Claim',
      'Are you sure this is the rightful owner? You will need to arrange handover.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept',
          onPress: async () => {
            try {
              setActionLoading(true);
              await claimAPI.reviewClaim(claimId, {
                decision: 'accept',
                notes: 'Ownership verified through Q&A'
              });
              Alert.alert('Success', 'Claim accepted! You can now chat to arrange handover.', [
                {
                  text: 'Chat Now',
                  onPress: () => navigation.navigate('Chat', {
                    claimId,
                    otherPartyName: claim.claimant?.first_name
                      ? `${claim.claimant.first_name} ${claim.claimant.last_name || ''}`.trim()
                      : 'Claimant',
                    itemTitle: claim.case?.title || claim.foundCase?.title || 'Item',
                  }),
                },
                { text: 'Later', onPress: () => navigation.goBack() },
              ]);
            } catch (error) {
              Alert.alert('Error', error.message || 'Failed to accept claim');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const rejectClaim = async () => {
    Alert.alert(
      'Reject Claim',
      'Are you sure you want to reject this claim? Please provide a reason.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            try {
              setActionLoading(true);
              await claimAPI.reviewClaim(claimId, {
                decision: 'reject',
                reason: 'Could not verify ownership'
              });
              Alert.alert('Claim Rejected', 'The claimant has been notified.');
              navigation.goBack();
            } catch (error) {
              Alert.alert('Error', error.message || 'Failed to reject claim');
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
        <Button mode="text" onPress={() => navigation.goBack()}>
          Go Back
        </Button>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView style={styles.scrollView}>
        {/* Claimant Info */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.claimantHeader}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {claim.claimant?.first_name?.[0] || 'U'}
                </Text>
              </View>
              <View style={styles.claimantInfo}>
                <Title style={styles.claimantName}>
                  {claim.claimant?.first_name} {claim.claimant?.last_name?.[0]}.
                </Title>
                <View style={styles.trustBadges}>
                  {claim.claimant?.email_verified && (
                    <Chip icon="email-check" compact style={styles.badge}>
                      Email Verified
                    </Chip>
                  )}
                  {claim.claimant?.phone_verified && (
                    <Chip icon="phone-check" compact style={styles.badge}>
                      Phone Verified
                    </Chip>
                  )}
                </View>
              </View>
            </View>
          </Card.Content>
        </Card>

        {/* Ownership Description */}
        <Card style={styles.card}>
          <Card.Content>
            <Title style={styles.sectionTitle}>Their Claim</Title>
            <Paragraph style={styles.description}>
              {claim.verification_description || 'No description provided'}
            </Paragraph>

            {claim.proof_photos?.length > 0 && (
              <>
                <Text style={styles.label}>Proof Photos</Text>
                <ScrollView horizontal style={styles.proofPhotos}>
                  {claim.proof_photos.map((photo, index) => (
                    <Image
                      key={index}
                      source={{ uri: photo.url }}
                      style={styles.proofPhoto}
                    />
                  ))}
                </ScrollView>
              </>
            )}

            {claim.bounty_offered > 0 && (
              <View style={styles.rewardBanner}>
                <Text style={styles.rewardLabel}>Reward Offered</Text>
                <Text style={styles.rewardAmount}>${claim.bounty_offered} CAD</Text>
              </View>
            )}
          </Card.Content>
        </Card>

        {/* Verification Q&A */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.sectionHeader}>
              <Title style={styles.sectionTitle}>Verification Questions</Title>
              <IconButton
                icon="plus"
                mode="contained"
                size={20}
                onPress={() => setShowQuestionInput(!showQuestionInput)}
              />
            </View>

            <Paragraph style={styles.qaHint}>
              Ask questions only the real owner would know the answer to.
            </Paragraph>

            {/* Question List */}
            {claim.verificationQuestions?.length > 0 ? (
              claim.verificationQuestions.map((q, index) => (
                <View key={index} style={styles.qaItem}>
                  <View style={styles.questionRow}>
                    <Text style={styles.questionLabel}>Q:</Text>
                    <Text style={styles.questionText}>{q.question}</Text>
                  </View>
                  {q.answered ? (
                    <View style={styles.answerRow}>
                      <Text style={styles.answerLabel}>A:</Text>
                      <Text style={styles.answerText}>{q.answer}</Text>
                    </View>
                  ) : (
                    <Chip
                      icon="clock-outline"
                      style={styles.waitingChip}
                      textStyle={styles.waitingChipText}
                    >
                      Waiting for answer
                    </Chip>
                  )}
                </View>
              ))
            ) : (
              <View style={styles.noQuestions}>
                <Text style={styles.noQuestionsText}>
                  No questions asked yet. Ask a question to verify ownership.
                </Text>
              </View>
            )}

            {/* Add Question Form */}
            {showQuestionInput && (
              <View style={styles.questionForm}>
                <TextInput
                  mode="outlined"
                  label="Your Question"
                  placeholder="e.g., What's inside the front pocket?"
                  value={newQuestion}
                  onChangeText={setNewQuestion}
                  multiline
                  style={styles.questionInput}
                />
                <View style={styles.questionButtons}>
                  <Button
                    mode="outlined"
                    onPress={() => {
                      setNewQuestion('');
                      setShowQuestionInput(false);
                    }}
                    style={styles.cancelButton}
                  >
                    Cancel
                  </Button>
                  <Button
                    mode="contained"
                    onPress={askQuestion}
                    loading={actionLoading}
                    disabled={actionLoading || !newQuestion.trim()}
                    style={styles.sendButton}
                  >
                    Send Question
                  </Button>
                </View>
              </View>
            )}

            {/* Suggested Questions */}
            {!showQuestionInput && (
              <View style={styles.suggestions}>
                <Text style={styles.suggestionsTitle}>Quick questions:</Text>
                <View style={styles.suggestionChips}>
                  {[
                    'What color is the inside?',
                    'Any scratches or marks?',
                    'What are the contents?',
                    'When did you lose it?',
                  ].map((suggestion, i) => (
                    <Chip
                      key={i}
                      mode="outlined"
                      onPress={() => {
                        setNewQuestion(suggestion);
                        setShowQuestionInput(true);
                      }}
                      style={styles.suggestionChip}
                    >
                      {suggestion}
                    </Chip>
                  ))}
                </View>
              </View>
            )}
          </Card.Content>
        </Card>

        {/* Handover Preference */}
        <Card style={styles.card}>
          <Card.Content>
            <Title style={styles.sectionTitle}>Handover Preference</Title>
            <List.Item
              title={
                claim.handover_preference === 'public'
                  ? 'Public Place'
                  : claim.handover_preference === 'police'
                  ? 'Police Station'
                  : 'Shipping'
              }
              description={
                claim.handover_preference === 'public'
                  ? 'Prefers to meet in a public location'
                  : claim.handover_preference === 'police'
                  ? 'Prefers to meet at a police station'
                  : 'Willing to receive via shipping'
              }
              left={(props) => (
                <List.Icon
                  {...props}
                  icon={
                    claim.handover_preference === 'public'
                      ? 'map-marker'
                      : claim.handover_preference === 'police'
                      ? 'shield-account'
                      : 'truck-delivery'
                  }
                />
              )}
            />
            {claim.additional_notes && (
              <>
                <Divider style={styles.divider} />
                <Text style={styles.label}>Additional Notes</Text>
                <Paragraph>{claim.additional_notes}</Paragraph>
              </>
            )}
          </Card.Content>
        </Card>

        {/* Decision Actions */}
        {claim.status === 'pending' || claim.status === 'under_review' ? (
          <Card style={styles.card}>
            <Card.Content>
              <Title style={styles.sectionTitle}>Your Decision</Title>
              <Paragraph style={styles.decisionHint}>
                Once you're confident about the ownership, make your decision.
              </Paragraph>
              <View style={styles.decisionButtons}>
                <Button
                  mode="contained"
                  icon="check"
                  onPress={acceptClaim}
                  loading={actionLoading}
                  disabled={actionLoading}
                  style={styles.acceptButton}
                >
                  Accept Claim
                </Button>
                <Button
                  mode="outlined"
                  icon="close"
                  onPress={rejectClaim}
                  loading={actionLoading}
                  disabled={actionLoading}
                  style={styles.rejectButton}
                  textColor="#F44336"
                >
                  Reject Claim
                </Button>
              </View>
            </Card.Content>
          </Card>
        ) : (
          <Card style={[styles.card, { backgroundColor: '#E8F5E9' }]}>
            <Card.Content>
              <View style={styles.completedBanner}>
                <Text style={styles.completedIcon}>
                  {claim.status === 'accepted' ? '.' : '.'}
                </Text>
                <Text style={styles.completedText}>
                  {claim.status === 'accepted'
                    ? 'You accepted this claim'
                    : claim.status === 'rejected'
                    ? 'You rejected this claim'
                    : `Claim is ${claim.status}`}
                </Text>
              </View>
              {claim.status === 'accepted' && (
                <Button
                  mode="contained"
                  icon="chat"
                  onPress={() => navigation.navigate('Chat', {
                    claimId,
                    otherPartyName: claim.claimant?.first_name
                      ? `${claim.claimant.first_name} ${claim.claimant.last_name || ''}`.trim()
                      : 'Claimant',
                    itemTitle: claim.case?.title || claim.foundCase?.title || 'Item',
                  })}
                  style={styles.chatButton}
                >
                  Chat with Claimant
                </Button>
              )}
            </Card.Content>
          </Card>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  scrollView: {
    flex: 1,
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
  claimantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  claimantInfo: {
    flex: 1,
  },
  claimantName: {
    fontSize: 18,
    marginBottom: 4,
  },
  trustBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  badge: {
    marginRight: 4,
    marginTop: 4,
    height: 26,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    marginBottom: 8,
  },
  description: {
    lineHeight: 22,
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
    marginTop: 12,
    marginBottom: 8,
  },
  proofPhotos: {
    marginBottom: 12,
  },
  proofPhoto: {
    width: 100,
    height: 100,
    borderRadius: 8,
    marginRight: 8,
    backgroundColor: '#E0E0E0',
  },
  rewardBanner: {
    backgroundColor: '#E8F5E9',
    padding: 12,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  rewardLabel: {
    color: '#2E7D32',
    fontWeight: '500',
  },
  rewardAmount: {
    color: '#2E7D32',
    fontSize: 18,
    fontWeight: 'bold',
  },
  qaHint: {
    color: '#666',
    marginBottom: 16,
  },
  qaItem: {
    backgroundColor: '#F5F5F5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  questionRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  questionLabel: {
    fontWeight: 'bold',
    color: colors.primary,
    marginRight: 8,
  },
  questionText: {
    flex: 1,
    fontWeight: '500',
  },
  answerRow: {
    flexDirection: 'row',
    paddingLeft: 20,
  },
  answerLabel: {
    fontWeight: 'bold',
    color: '#4CAF50',
    marginRight: 8,
  },
  answerText: {
    flex: 1,
    color: '#333',
  },
  waitingChip: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFF3CD',
    marginLeft: 20,
  },
  waitingChipText: {
    color: '#856404',
  },
  noQuestions: {
    padding: 20,
    alignItems: 'center',
  },
  noQuestionsText: {
    color: '#666',
    textAlign: 'center',
  },
  questionForm: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
  },
  questionInput: {
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
  },
  questionButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  cancelButton: {
    marginRight: 8,
  },
  sendButton: {
    backgroundColor: colors.primary,
  },
  suggestions: {
    marginTop: 16,
  },
  suggestionsTitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  suggestionChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  suggestionChip: {
    marginRight: 8,
    marginBottom: 8,
  },
  divider: {
    marginVertical: 12,
  },
  decisionHint: {
    color: '#666',
    marginBottom: 16,
  },
  decisionButtons: {
    gap: 12,
  },
  acceptButton: {
    backgroundColor: '#4CAF50',
    marginBottom: 12,
  },
  rejectButton: {
    borderColor: '#F44336',
  },
  completedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  completedIcon: {
    fontSize: 24,
    marginRight: 8,
  },
  completedText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#2E7D32',
  },
  chatButton: {
    backgroundColor: '#2196F3',
  },
});

export default VerificationQAScreen;
