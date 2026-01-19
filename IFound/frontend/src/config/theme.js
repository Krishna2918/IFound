import { MD3DarkTheme, configureFonts } from 'react-native-paper';

const fontConfig = {
  displayLarge: { fontFamily: 'System', fontWeight: '400' },
  displayMedium: { fontFamily: 'System', fontWeight: '400' },
  displaySmall: { fontFamily: 'System', fontWeight: '400' },
  headlineLarge: { fontFamily: 'System', fontWeight: '400' },
  headlineMedium: { fontFamily: 'System', fontWeight: '400' },
  headlineSmall: { fontFamily: 'System', fontWeight: '400' },
  titleLarge: { fontFamily: 'System', fontWeight: '500' },
  titleMedium: { fontFamily: 'System', fontWeight: '500' },
  titleSmall: { fontFamily: 'System', fontWeight: '500' },
  labelLarge: { fontFamily: 'System', fontWeight: '500' },
  labelMedium: { fontFamily: 'System', fontWeight: '500' },
  labelSmall: { fontFamily: 'System', fontWeight: '500' },
  bodyLarge: { fontFamily: 'System', fontWeight: '400' },
  bodyMedium: { fontFamily: 'System', fontWeight: '400' },
  bodySmall: { fontFamily: 'System', fontWeight: '400' },
  // Legacy variants for compatibility
  regular: { fontFamily: 'System', fontWeight: 'normal' },
  medium: { fontFamily: 'System', fontWeight: '500' },
  bold: { fontFamily: 'System', fontWeight: 'bold' },
};

export const theme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    // Teal primary
    primary: '#14B8A6',
    accent: '#14B8A6',
    // Pure dark backgrounds
    background: '#0A0F1A',
    surface: '#111827',
    surfaceVariant: '#1F2937',
    // Muted text - no bright white
    text: '#94A3B8',
    onSurface: '#94A3B8',
    onBackground: '#94A3B8',
    onSurfaceVariant: '#64748B',
    // Button text - dark on teal
    onPrimary: '#042F2E',
    onSecondary: '#1C1917',
    // Containers
    primaryContainer: '#0D3D38',
    onPrimaryContainer: '#2DD4BF',
    secondary: '#F97316',
    secondaryContainer: '#431407',
    onSecondaryContainer: '#FDBA74',
    // Status colors - muted
    error: '#DC2626',
    warning: '#D97706',
    success: '#059669',
    info: '#2563EB',
    // UI elements
    disabled: '#374151',
    placeholder: '#4B5563',
    outline: '#374151',
    backdrop: 'rgba(0, 0, 0, 0.85)',
    notification: '#DC2626',
    // Card backgrounds
    card: '#111827',
    border: '#1F2937',
    // Elevation - all dark
    elevation: {
      level0: 'transparent',
      level1: '#111827',
      level2: '#1F2937',
      level3: '#1F2937',
      level4: '#374151',
      level5: '#374151',
    },
  },
  roundness: 12,
  fonts: configureFonts({ config: fontConfig }),
};

export const colors = theme.colors;
