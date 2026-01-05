import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert, Text, TouchableOpacity } from 'react-native';
import { TextInput, Button, Chip, Title, HelperText, Surface } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors } from '../../config/theme';

const ReportFoundScreen = ({ navigation }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [dateFound, setDateFound] = useState('');
  const [contactPreference, setContactPreference] = useState('in_app');

  const categories = [
    { key: 'electronics', label: 'Electronics', icon: 'cellphone' },
    { key: 'pet', label: 'Pet', icon: 'dog' },
    { key: 'personal', label: 'Personal Items', icon: 'bag-personal' },
    { key: 'documents', label: 'Documents', icon: 'file-document' },
    { key: 'jewelry', label: 'Jewelry', icon: 'diamond-stone' },
    { key: 'keys', label: 'Keys', icon: 'key' },
    { key: 'other', label: 'Other', icon: 'help-circle' },
  ];

  const contactOptions = [
    { key: 'in_app', label: 'In-App Messages', icon: 'message' },
    { key: 'phone', label: 'Phone Call', icon: 'phone' },
    { key: 'email', label: 'Email', icon: 'email' },
  ];

  const validateForm = () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter what you found');
      return false;
    }
    if (!description.trim()) {
      Alert.alert('Error', 'Please provide a description');
      return false;
    }
    if (!category) {
      Alert.alert('Error', 'Please select a category');
      return false;
    }
    if (!location.trim()) {
      Alert.alert('Error', 'Please enter where you found it');
      return false;
    }
    return true;
  };

  const handleSubmit = () => {
    if (!validateForm()) return;

    Alert.alert(
      'Success',
      'Your found item has been reported! The owner will be able to find and contact you.',
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
      {/* Header */}
      <Surface style={styles.header}>
        <View style={styles.headerContent}>
          <View style={styles.headerIcon}>
            <Icon name="hand-heart" size={32} color="#10B981" />
          </View>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>Report Found Item</Text>
            <Text style={styles.headerSubtitle}>
              Help reunite lost items with their owners
            </Text>
          </View>
        </View>
      </Surface>

      <View style={styles.content}>
        {/* What did you find? */}
        <View style={styles.section}>
          <Title style={styles.sectionTitle}>What did you find?</Title>
          <TextInput
            label="Title *"
            value={title}
            onChangeText={setTitle}
            mode="outlined"
            style={styles.input}
            placeholder="e.g., Found iPhone, Lost Dog, Keys"
          />
          <HelperText type="info">
            Give a clear title to help the owner find this
          </HelperText>
        </View>

        {/* Category */}
        <View style={styles.section}>
          <Title style={styles.sectionTitle}>Category *</Title>
          <View style={styles.categoryGrid}>
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat.key}
                style={[
                  styles.categoryItem,
                  category === cat.key && styles.categoryItemSelected,
                ]}
                onPress={() => setCategory(cat.key)}
              >
                <Icon
                  name={cat.icon}
                  size={24}
                  color={category === cat.key ? '#FFFFFF' : '#6B7280'}
                />
                <Text
                  style={[
                    styles.categoryLabel,
                    category === cat.key && styles.categoryLabelSelected,
                  ]}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Description */}
        <View style={styles.section}>
          <Title style={styles.sectionTitle}>Description *</Title>
          <TextInput
            value={description}
            onChangeText={setDescription}
            mode="outlined"
            multiline
            numberOfLines={4}
            style={styles.input}
            placeholder="Describe the item - color, brand, condition, any identifying marks..."
          />
          <HelperText type="info">
            Include details that will help the owner identify their item
          </HelperText>
        </View>

        {/* Location Found */}
        <View style={styles.section}>
          <Title style={styles.sectionTitle}>Where did you find it? *</Title>
          <TextInput
            label="Location"
            value={location}
            onChangeText={setLocation}
            mode="outlined"
            style={styles.input}
            placeholder="e.g., Central Park near the fountain"
            left={<TextInput.Icon icon="map-marker" />}
          />
          <HelperText type="info">
            Be specific to help the owner verify ownership
          </HelperText>
        </View>

        {/* Date Found */}
        <View style={styles.section}>
          <Title style={styles.sectionTitle}>When did you find it?</Title>
          <TextInput
            label="Date Found (Optional)"
            value={dateFound}
            onChangeText={setDateFound}
            mode="outlined"
            style={styles.input}
            placeholder="e.g., Today, Yesterday, Dec 25"
            left={<TextInput.Icon icon="calendar" />}
          />
        </View>

        {/* Contact Preference */}
        <View style={styles.section}>
          <Title style={styles.sectionTitle}>How should owners contact you?</Title>
          <View style={styles.contactOptions}>
            {contactOptions.map((option) => (
              <TouchableOpacity
                key={option.key}
                style={[
                  styles.contactOption,
                  contactPreference === option.key && styles.contactOptionSelected,
                ]}
                onPress={() => setContactPreference(option.key)}
              >
                <Icon
                  name={option.icon}
                  size={20}
                  color={contactPreference === option.key ? '#10B981' : '#6B7280'}
                />
                <Text
                  style={[
                    styles.contactOptionLabel,
                    contactPreference === option.key && styles.contactOptionLabelSelected,
                  ]}
                >
                  {option.label}
                </Text>
                {contactPreference === option.key && (
                  <Icon name="check-circle" size={18} color="#10B981" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Add Photos */}
        <View style={styles.section}>
          <Button
            mode="outlined"
            onPress={() => {}}
            style={styles.photoButton}
            icon="camera"
          >
            Add Photos (Optional)
          </Button>
          <HelperText type="info">
            Photos help owners identify their items
          </HelperText>
        </View>

        {/* Info Card */}
        <Surface style={styles.infoCard}>
          <Icon name="information-outline" size={20} color="#2563EB" />
          <Text style={styles.infoText}>
            Your report will be visible to users searching for lost items.
            Owners can contact you through your preferred method to claim their item.
          </Text>
        </Surface>

        {/* Submit Button */}
        <View style={styles.buttonContainer}>
          <Button
            mode="outlined"
            onPress={() => navigation.goBack()}
            style={styles.cancelButton}
          >
            Cancel
          </Button>
          <Button
            mode="contained"
            onPress={handleSubmit}
            style={styles.submitButton}
            icon="check-circle"
          >
            Submit Report
          </Button>
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
  header: {
    backgroundColor: '#ECFDF5',
    margin: 16,
    borderRadius: 16,
    elevation: 2,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  headerIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  headerTextContainer: {
    flex: 1,
    marginLeft: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#065F46',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#047857',
    marginTop: 2,
  },
  content: {
    padding: 16,
    paddingTop: 0,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    marginBottom: 12,
  },
  input: {
    marginBottom: 4,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  categoryItemSelected: {
    backgroundColor: '#10B981',
    borderColor: '#059669',
  },
  categoryLabel: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  categoryLabelSelected: {
    color: '#FFFFFF',
  },
  contactOptions: {
    gap: 10,
  },
  contactOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 14,
    gap: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  contactOptionSelected: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
  },
  contactOptionLabel: {
    flex: 1,
    fontSize: 14,
    color: '#6B7280',
  },
  contactOptionLabelSelected: {
    color: '#065F46',
    fontWeight: '500',
  },
  photoButton: {
    marginTop: 8,
    marginBottom: 4,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 24,
    gap: 12,
    elevation: 1,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#1E40AF',
    lineHeight: 18,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 32,
  },
  cancelButton: {
    flex: 1,
    borderColor: '#E5E7EB',
  },
  submitButton: {
    flex: 2,
    backgroundColor: '#10B981',
  },
});

export default ReportFoundScreen;
