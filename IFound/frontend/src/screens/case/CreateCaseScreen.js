import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert, Text } from 'react-native';
import { TextInput, Button, Chip, Title, HelperText, Surface } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors } from '../../config/theme';
import { PLATFORM_FEE_PERCENT } from '../../config/constants';

const CreateCaseScreen = ({ navigation }) => {
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [reward, setReward] = useState('');
  const [dateLost, setDateLost] = useState('');

  const categories = [
    'Electronics',
    'Pets',
    'Personal Items',
    'Documents',
    'Jewelry',
    'Keys',
    'Other',
  ];

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

  const handleSubmit = () => {
    Alert.alert(
      'Success',
      'Case created successfully!',
      [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ]
    );
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
              icon="check-circle"
            >
              {reward && parseFloat(reward) > 0
                ? `Post Case - Pay $${parseFloat(reward).toLocaleString()}`
                : 'Post Case'}
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
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    gap: 12,
  },
  headerText: {
    flex: 1,
    fontSize: 14,
    color: '#1E40AF',
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
    backgroundColor: '#F9FAFB',
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
    color: '#6B7280',
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
    backgroundColor: '#E5E7EB',
    marginVertical: 8,
  },
  feeNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
    gap: 8,
  },
  feeNoteText: {
    flex: 1,
    fontSize: 12,
    color: '#6B7280',
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
