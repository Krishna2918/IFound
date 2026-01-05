import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {
  Button,
  Card,
  Title,
  Paragraph,
  TextInput,
  Text,
  Chip,
  HelperText,
  Divider,
  ActivityIndicator,
} from 'react-native-paper';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '../../config/theme';
import { claimAPI } from '../../services/api';

const MAX_BOUNTY = 50; // CAD - found item max bounty

const ClaimItemScreen = ({ navigation, route }) => {
  const { caseData } = route.params || {};

  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);

  // Form state
  const [verificationDescription, setVerificationDescription] = useState('');
  const [proofPhotos, setProofPhotos] = useState([]);
  const [bountyAmount, setBountyAmount] = useState('');
  const [handoverPreference, setHandoverPreference] = useState('public');
  const [additionalNotes, setAdditionalNotes] = useState('');

  // Validation
  const [errors, setErrors] = useState({});

  const validateStep1 = () => {
    const newErrors = {};

    if (!verificationDescription.trim()) {
      newErrors.description = 'Please describe how you can prove ownership';
    } else if (verificationDescription.length < 20) {
      newErrors.description = 'Please provide more details (at least 20 characters)';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStep2 = () => {
    const newErrors = {};

    if (proofPhotos.length === 0) {
      newErrors.photos = 'Please add at least one proof photo';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStep3 = () => {
    const newErrors = {};

    if (bountyAmount) {
      const amount = parseFloat(bountyAmount);
      if (isNaN(amount) || amount < 0) {
        newErrors.bounty = 'Please enter a valid amount';
      } else if (amount > MAX_BOUNTY) {
        newErrors.bounty = `Maximum reward is $${MAX_BOUNTY} CAD`;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const nextStep = () => {
    if (step === 1 && validateStep1()) {
      setStep(2);
    } else if (step === 2 && validateStep2()) {
      setStep(3);
    } else if (step === 3 && validateStep3()) {
      submitClaim();
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets) {
      setProofPhotos([...proofPhotos, ...result.assets.slice(0, 5 - proofPhotos.length)]);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera access is required to take photos');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
    });

    if (!result.canceled) {
      setProofPhotos([...proofPhotos, result.assets[0]]);
    }
  };

  const removePhoto = (index) => {
    setProofPhotos(proofPhotos.filter((_, i) => i !== index));
  };

  const submitClaim = async () => {
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('case_id', caseData.id);
      formData.append('verification_description', verificationDescription);
      formData.append('bounty_offered', bountyAmount || '0');
      formData.append('handover_preference', handoverPreference);
      formData.append('additional_notes', additionalNotes);

      // Add photos
      proofPhotos.forEach((photo, index) => {
        formData.append('proof_photos', {
          uri: photo.uri,
          type: 'image/jpeg',
          name: `proof_${index}.jpg`,
        });
      });

      const response = await claimAPI.createClaim(formData);

      if (response.success) {
        Alert.alert(
          'Claim Submitted',
          'Your claim has been submitted. The finder will review your verification details.',
          [
            {
              text: 'View My Claims',
              onPress: () => navigation.replace('MyClaims'),
            },
            {
              text: 'Go Home',
              onPress: () => navigation.navigate('Home'),
            },
          ]
        );
      }
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to submit claim');
    } finally {
      setLoading(false);
    }
  };

  const renderStepIndicator = () => (
    <View style={styles.stepIndicator}>
      {[1, 2, 3].map((s) => (
        <View key={s} style={styles.stepRow}>
          <View style={[styles.stepCircle, step >= s && styles.stepCircleActive]}>
            <Text style={[styles.stepNumber, step >= s && styles.stepNumberActive]}>
              {s}
            </Text>
          </View>
          {s < 3 && (
            <View style={[styles.stepLine, step > s && styles.stepLineActive]} />
          )}
        </View>
      ))}
    </View>
  );

  const renderStep1 = () => (
    <View style={styles.stepContent}>
      <Title style={styles.stepTitle}>Prove Ownership</Title>
      <Paragraph style={styles.stepDescription}>
        Describe unique details about this item that only the owner would know.
        This helps verify that you are the rightful owner.
      </Paragraph>

      <TextInput
        mode="outlined"
        label="Verification Description"
        placeholder="e.g., There's a scratch on the back, the lock code is 1234, it has my initials inside..."
        multiline
        numberOfLines={6}
        value={verificationDescription}
        onChangeText={setVerificationDescription}
        error={!!errors.description}
        style={styles.input}
      />
      <HelperText type="error" visible={!!errors.description}>
        {errors.description}
      </HelperText>

      <Card style={styles.tipCard}>
        <Card.Content>
          <Text style={styles.tipTitle}>Tips for strong verification:</Text>
          <Text style={styles.tipText}>- Mention unique marks, scratches, or wear</Text>
          <Text style={styles.tipText}>- Describe any customizations or stickers</Text>
          <Text style={styles.tipText}>- Include serial numbers if you know them</Text>
          <Text style={styles.tipText}>- Describe contents (for bags, wallets)</Text>
        </Card.Content>
      </Card>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContent}>
      <Title style={styles.stepTitle}>Add Proof Photos</Title>
      <Paragraph style={styles.stepDescription}>
        Upload photos that prove ownership (e.g., photos with you and the item,
        purchase receipts, packaging).
      </Paragraph>

      <View style={styles.photoGrid}>
        {proofPhotos.map((photo, index) => (
          <View key={index} style={styles.photoContainer}>
            <Image source={{ uri: photo.uri }} style={styles.photo} />
            <TouchableOpacity
              style={styles.removePhotoButton}
              onPress={() => removePhoto(index)}
            >
              <Text style={styles.removePhotoText}>X</Text>
            </TouchableOpacity>
          </View>
        ))}

        {proofPhotos.length < 5 && (
          <View style={styles.addPhotoContainer}>
            <TouchableOpacity style={styles.addPhotoButton} onPress={pickImage}>
              <Text style={styles.addPhotoIcon}>+</Text>
              <Text style={styles.addPhotoText}>Gallery</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addPhotoButton} onPress={takePhoto}>
              <Text style={styles.addPhotoIcon}>📷</Text>
              <Text style={styles.addPhotoText}>Camera</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {errors.photos && (
        <HelperText type="error" visible={true}>
          {errors.photos}
        </HelperText>
      )}

      <Text style={styles.photoHint}>
        {proofPhotos.length}/5 photos added
      </Text>
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepContent}>
      <Title style={styles.stepTitle}>Offer a Reward (Optional)</Title>
      <Paragraph style={styles.stepDescription}>
        You can offer a thank-you reward to the finder. This is optional but appreciated.
      </Paragraph>

      <TextInput
        mode="outlined"
        label="Reward Amount (CAD)"
        placeholder="0"
        keyboardType="numeric"
        value={bountyAmount}
        onChangeText={setBountyAmount}
        error={!!errors.bounty}
        left={<TextInput.Affix text="$" />}
        right={<TextInput.Affix text="CAD" />}
        style={styles.input}
      />
      <HelperText type="info" visible={!errors.bounty}>
        Maximum reward for found items is ${MAX_BOUNTY} CAD
      </HelperText>
      <HelperText type="error" visible={!!errors.bounty}>
        {errors.bounty}
      </HelperText>

      <Divider style={styles.divider} />

      <Text style={styles.label}>Handover Preference</Text>
      <View style={styles.chipRow}>
        <Chip
          selected={handoverPreference === 'public'}
          onPress={() => setHandoverPreference('public')}
          style={styles.chip}
        >
          Public Place
        </Chip>
        <Chip
          selected={handoverPreference === 'police'}
          onPress={() => setHandoverPreference('police')}
          style={styles.chip}
        >
          Police Station
        </Chip>
        <Chip
          selected={handoverPreference === 'shipping'}
          onPress={() => setHandoverPreference('shipping')}
          style={styles.chip}
        >
          Shipping
        </Chip>
      </View>

      <TextInput
        mode="outlined"
        label="Additional Notes (Optional)"
        placeholder="Any other information for the finder..."
        multiline
        numberOfLines={3}
        value={additionalNotes}
        onChangeText={setAdditionalNotes}
        style={styles.input}
      />
    </View>
  );

  if (!caseData) {
    return (
      <View style={styles.centered}>
        <Text>No case data provided</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView style={styles.scrollView}>
        {/* Case Summary */}
        <Card style={styles.caseCard}>
          <Card.Content>
            <View style={styles.caseHeader}>
              {caseData.photos?.[0] && (
                <Image
                  source={{ uri: caseData.photos[0].url }}
                  style={styles.caseImage}
                />
              )}
              <View style={styles.caseInfo}>
                <Title style={styles.caseTitle}>{caseData.title}</Title>
                <Chip size="small" style={styles.categoryChip}>
                  {caseData.category}
                </Chip>
              </View>
            </View>
          </Card.Content>
        </Card>

        {/* Step Indicator */}
        {renderStepIndicator()}

        {/* Step Content */}
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}

        {/* Navigation Buttons */}
        <View style={styles.buttonRow}>
          {step > 1 && (
            <Button
              mode="outlined"
              onPress={() => setStep(step - 1)}
              style={styles.backButton}
            >
              Back
            </Button>
          )}
          <Button
            mode="contained"
            onPress={nextStep}
            loading={loading}
            disabled={loading}
            style={styles.nextButton}
          >
            {step === 3 ? 'Submit Claim' : 'Next'}
          </Button>
        </View>
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
  caseCard: {
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
  },
  caseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  caseImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 12,
  },
  caseInfo: {
    flex: 1,
  },
  caseTitle: {
    fontSize: 16,
    marginBottom: 4,
  },
  categoryChip: {
    alignSelf: 'flex-start',
  },
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 20,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepCircleActive: {
    backgroundColor: colors.primary,
  },
  stepNumber: {
    color: '#757575',
    fontWeight: 'bold',
  },
  stepNumberActive: {
    color: '#FFFFFF',
  },
  stepLine: {
    width: 40,
    height: 3,
    backgroundColor: '#E0E0E0',
    marginHorizontal: 4,
  },
  stepLineActive: {
    backgroundColor: colors.primary,
  },
  stepContent: {
    marginBottom: 20,
  },
  stepTitle: {
    fontSize: 20,
    marginBottom: 8,
  },
  stepDescription: {
    color: '#666',
    marginBottom: 16,
  },
  input: {
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
  },
  tipCard: {
    backgroundColor: '#FFF3CD',
    marginTop: 12,
  },
  tipTitle: {
    fontWeight: 'bold',
    marginBottom: 8,
  },
  tipText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  photoContainer: {
    width: 100,
    height: 100,
    margin: 4,
    position: 'relative',
  },
  photo: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  removePhotoButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FF5252',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removePhotoText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  addPhotoContainer: {
    flexDirection: 'row',
  },
  addPhotoButton: {
    width: 100,
    height: 100,
    margin: 4,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
  },
  addPhotoIcon: {
    fontSize: 24,
    color: '#757575',
  },
  addPhotoText: {
    color: '#757575',
    fontSize: 12,
    marginTop: 4,
  },
  photoHint: {
    color: '#757575',
    textAlign: 'center',
  },
  divider: {
    marginVertical: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  chip: {
    marginRight: 8,
    marginBottom: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 32,
  },
  backButton: {
    flex: 1,
    marginRight: 8,
  },
  nextButton: {
    flex: 2,
    backgroundColor: colors.primary,
  },
});

export default ClaimItemScreen;
