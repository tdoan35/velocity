import type { FileTree } from '../types/editor';

/**
 * Simple fallback files for Snack preview when no project files exist
 * These files are minimal and designed to work immediately in Snack without complex dependencies
 */
export const getSnackFallbackFiles = (projectName: string = 'Velocity App'): FileTree => ({
  'frontend/App.tsx': {
    path: 'frontend/App.tsx',
    content: `import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';

export default function App() {
  const [count, setCount] = useState(0);
  const [message, setMessage] = useState('Welcome to ${projectName}!');

  const handlePress = () => {
    const newCount = count + 1;
    setCount(newCount);
    
    if (newCount === 1) {
      setMessage('Great! Tap more to see what happens...');
    } else if (newCount === 5) {
      setMessage('You\\'re on fire! 🔥');
    } else if (newCount === 10) {
      setMessage('Amazing! You\\'ve tapped 10 times! ⭐');
    } else if (newCount > 10) {
      setMessage(\`Incredible! \${newCount} taps and counting! 🚀\`);
    }
  };

  const resetCounter = () => {
    setCount(0);
    setMessage('Welcome to ${projectName}!');
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🚀 ${projectName}</Text>
        <Text style={styles.subtitle}>Live React Native Preview</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.message}>{message}</Text>
        
        <View style={styles.counterContainer}>
          <Text style={styles.counterLabel}>Tap Counter</Text>
          <Text style={styles.counterValue}>{count}</Text>
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.primaryButton} onPress={handlePress}>
            <Text style={styles.buttonText}>Tap Me! 👆</Text>
          </TouchableOpacity>
          
          {count > 0 && (
            <TouchableOpacity style={styles.secondaryButton} onPress={resetCounter}>
              <Text style={styles.secondaryButtonText}>Reset Counter</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            This is your live preview! Any changes you make to the code will appear here instantly.
          </Text>
        </View>
        
        <View style={styles.features}>
          <Text style={styles.featuresTitle}>Ready to build?</Text>
          <Text style={styles.featuresText}>
            • Add components and screens
            • Connect to APIs
            • Style with custom designs
            • Deploy to app stores
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#f8fafc',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
    paddingTop: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
  },
  content: {
    flex: 1,
    alignItems: 'center',
  },
  message: {
    fontSize: 18,
    color: '#374151',
    textAlign: 'center',
    marginBottom: 32,
    paddingHorizontal: 16,
  },
  counterContainer: {
    alignItems: 'center',
    marginBottom: 32,
    padding: 24,
    backgroundColor: '#fff',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    minWidth: 150,
  },
  counterLabel: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 8,
  },
  counterValue: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#3b82f6',
  },
  buttonContainer: {
    alignItems: 'center',
    marginBottom: 32,
    width: '100%',
  },
  primaryButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  secondaryButton: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#e5e7eb',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  secondaryButtonText: {
    color: '#6b7280',
    fontSize: 16,
    fontWeight: '500',
  },
  infoBox: {
    backgroundColor: '#eff6ff',
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#3b82f6',
    marginHorizontal: 16,
    marginBottom: 24,
  },
  infoText: {
    fontSize: 14,
    color: '#1e40af',
    lineHeight: 20,
    textAlign: 'center',
  },
  features: {
    backgroundColor: '#f0fdf4',
    padding: 20,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#22c55e',
    maxWidth: 300,
  },
  featuresTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#15803d',
    marginBottom: 8,
    textAlign: 'center',
  },
  featuresText: {
    fontSize: 14,
    color: '#166534',
    lineHeight: 22,
  },
});`,
    type: 'typescript',
    lastModified: new Date(),
  },
});