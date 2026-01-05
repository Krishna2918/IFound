import React from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { Button, Title, Text } from 'react-native-paper';
import { colors } from '../../config/theme';

const OnboardingScreen = ({ navigation }) => {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Title style={styles.logo}>🔍 I Found!!</Title>
        <Text style={styles.tagline}>
          Help Find Missing Persons, Criminals, and Lost Items
        </Text>
        <Text style={styles.description}>
          Join our community to earn bounties by helping people find what matters most
        </Text>
      </View>

      <View style={styles.actions}>
        <Button
          mode="contained"
          onPress={() => navigation.navigate('Register')}
          style={styles.button}
        >
          Get Started
        </Button>
        <Button
          mode="outlined"
          onPress={() => navigation.navigate('Login')}
          style={styles.button}
        >
          I Already Have an Account
        </Button>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'space-between',
    padding: 20,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    fontSize: 48,
    marginBottom: 16,
  },
  tagline: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.primary,
    textAlign: 'center',
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  actions: {
    marginBottom: 40,
  },
  button: {
    marginBottom: 12,
    paddingVertical: 8,
  },
});

export default OnboardingScreen;
