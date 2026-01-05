import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert, Image } from 'react-native';
import { TextInput, Button, Card, Title, Paragraph, Chip, HelperText } from 'react-native-paper';
import { colors } from '../../config/theme';

const SubmitTipScreen = ({ navigation, route }) => {
  const { caseId } = route.params || {};
  const [tipDescription, setTipDescription] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [location, setLocation] = useState('');
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [isAnonymous, setIsAnonymous] = useState(false);

  const mockCase = {
    id: caseId || '1',
    title: 'Lost iPhone 13',
    category: 'Electronics',
    reward: '$50',
  };

  const handlePhotoUpload = () => {
    // Simulate photo picker
    Alert.alert('Info', 'Photo picker would open here');
    // In production, use react-native-image-picker or expo-image-picker
  };

  const handleSubmit = () => {
    if (!tipDescription.trim()) {
      Alert.alert('Error', 'Please provide a description of your tip');
      return;
    }

    if (!isAnonymous && !contactInfo.trim()) {
      Alert.alert('Error', 'Please provide contact information or submit anonymously');
      return;
    }

    Alert.alert(
      'Success',
      'Your tip has been submitted successfully!',
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
      <Card style={styles.caseCard}>
        <Card.Content>
          <Title>Submitting tip for:</Title>
          <Paragraph style={styles.caseTitle}>{mockCase.title}</Paragraph>
          <View style={styles.caseDetails}>
            <Chip icon="tag" style={styles.chip}>{mockCase.category}</Chip>
            <Chip icon="cash" style={styles.chip}>{mockCase.reward}</Chip>
          </View>
        </Card.Content>
      </Card>

      <View style={styles.form}>
        <Title style={styles.sectionTitle}>Your Tip</Title>

        <TextInput
          label="Tip Description *"
          value={tipDescription}
          onChangeText={setTipDescription}
          mode="outlined"
          multiline
          numberOfLines={5}
          style={styles.input}
          placeholder="Describe what you saw, found, or know about this case..."
        />
        <HelperText type="info">
          Be as detailed as possible. This helps the owner verify the item.
        </HelperText>

        <TextInput
          label="Location (Optional)"
          value={location}
          onChangeText={setLocation}
          mode="outlined"
          style={styles.input}
          placeholder="Where did you see/find the item?"
          left={<TextInput.Icon icon="map-marker" />}
        />

        <Button
          mode="outlined"
          onPress={handlePhotoUpload}
          style={styles.photoButton}
          icon="camera"
        >
          Add Photos (Optional)
        </Button>
        <HelperText type="info">
          Photos can help verify your tip
        </HelperText>

        {selectedPhotos.length > 0 && (
          <View style={styles.photoPreview}>
            {selectedPhotos.map((photo, index) => (
              <Image
                key={index}
                source={{ uri: photo }}
                style={styles.photo}
              />
            ))}
          </View>
        )}

        <Title style={styles.sectionTitle}>Contact Information</Title>

        <View style={styles.anonymousContainer}>
          <Chip
            selected={isAnonymous}
            onPress={() => setIsAnonymous(!isAnonymous)}
            icon={isAnonymous ? 'check' : 'incognito'}
          >
            Submit Anonymously
          </Chip>
        </View>
        <HelperText type="info">
          Anonymous tips are accepted, but you won't be able to claim rewards
        </HelperText>

        {!isAnonymous && (
          <>
            <TextInput
              label="Contact Information"
              value={contactInfo}
              onChangeText={setContactInfo}
              mode="outlined"
              style={styles.input}
              placeholder="Email or phone number"
              left={<TextInput.Icon icon="email" />}
              keyboardType="email-address"
            />
            <HelperText type="info">
              We'll use this to notify you about updates
            </HelperText>
          </>
        )}

        <Card style={styles.infoCard}>
          <Card.Content>
            <Paragraph style={styles.infoText}>
              Your tip will be reviewed by the case owner. If your tip leads to the item being
              recovered, you may be eligible for the reward.
            </Paragraph>
          </Card.Content>
        </Card>

        <Button
          mode="contained"
          onPress={handleSubmit}
          style={styles.submitButton}
          icon="send"
        >
          Submit Tip
        </Button>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  caseCard: {
    margin: 16,
    elevation: 2,
  },
  caseTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.primary,
    marginTop: 4,
  },
  caseDetails: {
    flexDirection: 'row',
    marginTop: 8,
  },
  chip: {
    marginRight: 8,
  },
  form: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    marginBottom: 12,
    marginTop: 8,
  },
  input: {
    marginBottom: 4,
  },
  photoButton: {
    marginTop: 8,
    marginBottom: 4,
  },
  photoPreview: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
  },
  photo: {
    width: 80,
    height: 80,
    borderRadius: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  anonymousContainer: {
    marginTop: 8,
    marginBottom: 4,
  },
  infoCard: {
    backgroundColor: colors.info + '15',
    marginTop: 16,
    marginBottom: 16,
  },
  infoText: {
    fontSize: 14,
    lineHeight: 20,
  },
  submitButton: {
    marginTop: 8,
    marginBottom: 32,
    backgroundColor: colors.primary,
  },
});

export default SubmitTipScreen;
