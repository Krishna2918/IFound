import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert, Text, TouchableOpacity } from 'react-native';
import { TextInput, Button, Chip, Title, HelperText, Surface, ActivityIndicator } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors } from '../../config/theme';
import { PLATFORM_FEE_PERCENT, CASE_TYPES, ITEM_CATEGORIES } from '../../config/constants';
import { caseAPI, searchAPI } from '../../services/api';

const CreateCaseScreen = ({ navigation }) => {
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [reward, setReward] = useState('');
  const [caseType, setCaseType] = useState(CASE_TYPES.LOST_ITEM);
  const [loading, setLoading] = useState(false);

  // Smart pricing state
  const [pricingSuggestion, setPricingSuggestion] = useState(null);
  const [loadingPricing, setLoadingPricing] = useState(false);

  const categories = [
    'Electronics',
    'Pets',
    'Personal Items',
    'Documents',
    'Jewelry',
    'Keys',
    'Other',
  ];

  // Fetch smart pricing when category changes
  useEffect(() => {
    if (category && step === 3) {
      fetchPricingSuggestion();
    }
  }, [category, step]);

  const fetchPricingSuggestion = async () => {
    // Map category names to backend category values
    const categoryMap = {
      'Electronics': 'electronics',
      'Pets': 'pet',
      'Personal Items': 'other',
      'Documents': 'documents',
      'Jewelry': 'jewelry',
      'Keys': 'keys',
      'Other': 'other',
    };

    setLoadingPricing(true);
    try {
      const response = await searchAPI.getPricingSuggestion({
        category: categoryMap[category] || 'other',
        description: description,
        isUrgent: false,
      });

      if (response.success) {
        setPricingSuggestion(response.pricing);
      }
    } catch (error) {
      console.log('Pricing suggestion error:', error);
    } finally {
      setLoadingPricing(false);
    }
  };

  const applyPricingTier = (amount) => {
    setReward(String(amount));
  };

  const validateStep1 = () => {
    if (!title || !description) {
      Alert.alert('Error', 'Please fill in all required fields');
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    if (!category || !location) {
      Alert.alert('Error', 'Please fill in all required fields');
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (step === 1 && validateStep1()) {
      setStep(2);
    } else if (step === 2 && validateStep2()) {
      setStep(3);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);

    try {
      // Map category names to backend item_category values
      const categoryMap = {
        'Electronics': ITEM_CATEGORIES.ELECTRONICS,
        'Pets': ITEM_CATEGORIES.PET,
        'Personal Items': ITEM_CATEGORIES.OTHER,
        'Documents': ITEM_CATEGORIES.DOCUMENTS,
        'Jewelry': ITEM_CATEGORIES.JEWELRY,
        'Keys': ITEM_CATEGORIES.OTHER,
        'Other': ITEM_CATEGORIES.OTHER,
      };

      const caseData = {
        title,
        description,
        case_type: caseType,
        item_category: categoryMap[category] || ITEM_CATEGORIES.OTHER,
        location_description: location,
        bounty_amount: parseFloat(reward) || 0,
        // Default coordinates (can be enhanced with location picker)
        latitude: 0,
        longitude: 0,
      };

      const response = await caseAPI.createCase(caseData);

      Alert.alert(
        'Success',
        'Case created successfully!',
        [
          {
            text: 'View Case',
            onPress: () => navigation.replace('CaseDetail', { caseId: response.data?.case?.id }),
          },
          {
            text: 'Go Home',
            onPress: () => navigation.navigate('Home'),
          },
        ]
      );
    } catch (error) {
      console.error('Failed to create case:', error);
      Alert.alert(
        'Error',
        error.message || 'Failed to create case. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.stepIndicator}>
        <View style={[styles.stepDot, step >= 1 && styles.stepDotActive]} />
        <View style={styles.stepLine} />
        <View style={[styles.stepDot, step >= 2 && styles.stepDotActive]} />
        <View style={styles.stepLine} />
        <View style={[styles.stepDot, step >= 3 && styles.stepDotActive]} />
      </View>

      <View style={styles.content}>
        {step === 1 && (
          <>
            <Title style={styles.stepTitle}>Step 1: What are you looking for?</Title>

            <View style={styles.headerCard}>
              <Icon name="magnify" size={24} color="#2563EB" />
              <Text style={styles.headerText}>Post a case to find your lost item</Text>
            </View>

            <TextInput
              label="Title *"
              value={title}
              onChangeText={setTitle}
              mode="outlined"
              style={styles.input}
              placeholder="e.g., Lost iPhone 13 Pro"
            />
            <HelperText type="info">
              Provide a clear, concise title
            </HelperText>

            <TextInput
              label="Description *"
              value={description}
              onChangeText={setDescription}
              mode="outlined"
              multiline
              numberOfLines={4}
              style={styles.input}
              placeholder="Describe your item in detail - color, size, distinguishing marks..."
            />
            <HelperText type="info">
              Include as many details as possible to help finders identify it
            </HelperText>
          </>
        )}

        {step === 2 && (
          <>
            <Title style={styles.stepTitle}>Step 2: Category & Location</Title>

            <Title style={styles.sectionTitle}>Select Category *</Title>
            <View style={styles.categoryContainer}>
              {categories.map((cat) => (
                <Chip
                  key={cat}
                  selected={category === cat}
                  onPress={() => setCategory(cat)}
                  style={styles.categoryChip}
                >
                  {cat}
                </Chip>
              ))}
            </View>

            <TextInput
              label="Location *"
              value={location}
              onChangeText={setLocation}
              mode="outlined"
              style={styles.input}
              placeholder="e.g., Downtown, Main Street"
              left={<TextInput.Icon icon="map-marker" />}
            />
            <HelperText type="info">
              Where was the item lost/found?
            </HelperText>
          </>
        )}

        {step === 3 && (
          <>
            <Title style={styles.stepTitle}>Step 3: Set Your Reward</Title>

            {/* Smart Pricing Suggestions */}
            {loadingPricing ? (
              <Surface style={styles.pricingCard}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.pricingLoadingText}>Getting smart pricing suggestions...</Text>
              </Surface>
            ) : pricingSuggestion ? (
              <Surface style={styles.pricingCard}>
                <View style={styles.pricingHeader}>
                  <Icon name="lightbulb-on" size={20} color="#F59E0B" />
                  <Text style={styles.pricingTitle}>Suggested Bounty</Text>
                </View>
                <Text style={styles.pricingSuggested}>${pricingSuggestion.suggested}</Text>
                <Text style={styles.pricingRange}>
                  Range: ${pricingSuggestion.minimum} - ${pricingSuggestion.maximum}
                </Text>

                <View style={styles.pricingTiers}>
                  {pricingSuggestion.tiers && Object.entries(pricingSuggestion.tiers).map(([tier, amount]) => (
                    <TouchableOpacity
                      key={tier}
                      style={[
                        styles.tierButton,
                        reward === String(amount) && styles.tierButtonActive
                      ]}
                      onPress={() => applyPricingTier(amount)}
                    >
                      <Text style={[
                        styles.tierLabel,
                        reward === String(amount) && styles.tierLabelActive
                      ]}>
                        {tier.charAt(0).toUpperCase() + tier.slice(1)}
                      </Text>
                      <Text style={[
                        styles.tierAmount,
                        reward === String(amount) && styles.tierAmountActive
                      ]}>
                        ${amount}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </Surface>
            ) : null}

            <View style={styles.rewardSection}>
              <Text style={styles.rewardLabel}>Bounty Amount</Text>
              <TextInput
                value={reward}
                onChangeText={(text) => setReward(text.replace(/[^0-9]/g, ''))}
                mode="outlined"
                style={styles.rewardInput}
                placeholder="Enter amount"
                keyboardType="numeric"
                left={<TextInput.Icon icon="currency-usd" />}
              />
              <HelperText type="info">
                Higher rewards attract more finders. No limit on amount.
              </HelperText>
            </View>

            {/* Fee Breakdown */}
            {reward && parseFloat(reward) > 0 && (
              <Surface style={styles.feeBreakdown}>
                <Text style={styles.feeTitle}>Fee Breakdown</Text>

                <View style={styles.feeRow}>
                  <Text style={styles.feeLabel}>Bounty Amount</Text>
                  <Text style={styles.feeValue}>${parseFloat(reward).toLocaleString()}</Text>
                </View>

                <View style={styles.feeRow}>
                  <Text style={styles.feeLabel}>Platform Fee ({PLATFORM_FEE_PERCENT}%)</Text>
                  <Text style={styles.feeValueMuted}>
                    -${(parseFloat(reward) * PLATFORM_FEE_PERCENT / 100).toFixed(2)}
                  </Text>
                </View>

                <View style={styles.feeDivider} />

                <View style={styles.feeRow}>
                  <Text style={styles.feeLabel}>Finder Receives</Text>
                  <Text style={styles.feeValueGreen}>
                    ${(parseFloat(reward) * (100 - PLATFORM_FEE_PERCENT) / 100).toFixed(2)}
                  </Text>
                </View>

                <View style={styles.feeNote}>
                  <Icon name="information-outline" size={16} color="#6B7280" />
                  <Text style={styles.feeNoteText}>
                    You pay ${parseFloat(reward).toLocaleString()}. The finder receives the bounty minus the platform fee.
                  </Text>
                </View>
              </Surface>
            )}

            <Button
              mode="outlined"
              onPress={() => {}}
              style={styles.photoButton}
              icon="camera"
            >
              Add Photos (Optional)
            </Button>
            <HelperText type="info">
              Add up to 5 photos to help identify your item
            </HelperText>
          </>
        )}

        <View style={styles.buttonContainer}>
          {step > 1 && (
            <Button
              mode="outlined"
              onPress={handleBack}
              style={styles.backButton}
            >
              Back
            </Button>
          )}

          {step < 3 ? (
            <Button
              mode="contained"
              onPress={handleNext}
              style={styles.nextButton}
            >
              Next
            </Button>
          ) : (
            <Button
              mode="contained"
              onPress={handleSubmit}
              style={styles.submitButton}
              icon={loading ? undefined : "check-circle"}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : reward && parseFloat(reward) > 0 ? (
                `Post Case - Pay $${parseFloat(reward).toLocaleString()}`
              ) : (
                'Post Case'
              )}
            </Button>
          )}
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  stepDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.disabled,
  },
  stepDotActive: {
    backgroundColor: colors.primary,
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: colors.disabled,
    marginHorizontal: 8,
  },
  content: {
    padding: 16,
  },
  stepTitle: {
    marginBottom: 16,
  },
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E3A5F',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    gap: 12,
  },
  headerText: {
    flex: 1,
    fontSize: 14,
    color: '#93C5FD',
  },
  sectionTitle: {
    fontSize: 16,
    marginBottom: 12,
    marginTop: 8,
  },
  input: {
    marginBottom: 4,
  },
  categoryContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  categoryChip: {
    marginRight: 8,
    marginBottom: 8,
  },
  pricingCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    alignItems: 'center',
  },
  pricingLoadingText: {
    marginTop: 8,
    fontSize: 13,
    color: colors.onSurfaceVariant,
  },
  pricingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  pricingTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  pricingSuggested: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#10B981',
    marginBottom: 4,
  },
  pricingRange: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    marginBottom: 12,
  },
  pricingTiers: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  tierButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: colors.surfaceVariant,
    alignItems: 'center',
    minWidth: 70,
  },
  tierButtonActive: {
    backgroundColor: colors.primary,
  },
  tierLabel: {
    fontSize: 10,
    color: colors.onSurfaceVariant,
    textTransform: 'uppercase',
  },
  tierLabelActive: {
    color: colors.onPrimary,
  },
  tierAmount: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.text,
    marginTop: 2,
  },
  tierAmountActive: {
    color: colors.onPrimary,
  },
  rewardSection: {
    marginBottom: 16,
  },
  rewardLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  rewardInput: {
    marginBottom: 4,
  },
  feeBreakdown: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    elevation: 1,
  },
  feeTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 12,
  },
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  feeLabel: {
    fontSize: 14,
    color: colors.onSurfaceVariant,
  },
  feeValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  feeValueMuted: {
    fontSize: 14,
    color: '#EF4444',
  },
  feeValueGreen: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#10B981',
  },
  feeDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 8,
  },
  feeNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surfaceVariant,
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
    gap: 8,
  },
  feeNoteText: {
    flex: 1,
    fontSize: 12,
    color: colors.onSurfaceVariant,
    lineHeight: 16,
  },
  photoButton: {
    marginTop: 8,
    marginBottom: 4,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
    gap: 12,
  },
  backButton: {
    flex: 1,
  },
  nextButton: {
    flex: 1,
    backgroundColor: colors.primary,
  },
  submitButton: {
    flex: 1,
    backgroundColor: '#10B981',
  },
});

export default CreateCaseScreen;
