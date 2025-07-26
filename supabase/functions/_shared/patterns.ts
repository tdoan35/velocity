// React Native pattern recognition and matching utilities

export interface Pattern {
  id: string
  name: string
  category: 'navigation' | 'state' | 'component' | 'api' | 'styling' | 'storage' | 'animation' | 'gesture'
  keywords: string[]
  imports: string[]
  components: string[]
  hooks?: string[]
  methods?: string[]
  examples: string[]
  bestPractices: string[]
  antiPatterns?: string[]
}

// Comprehensive React Native and Expo patterns
export const REACT_NATIVE_PATTERNS: Record<string, Pattern> = {
  // Navigation Patterns
  stackNavigation: {
    id: 'stack-navigation',
    name: 'Stack Navigation',
    category: 'navigation',
    keywords: ['stack', 'navigation', 'navigate', 'push', 'pop', 'goBack'],
    imports: ['@react-navigation/native', '@react-navigation/stack'],
    components: ['NavigationContainer', 'Stack.Navigator', 'Stack.Screen'],
    hooks: ['useNavigation', 'useRoute', 'useFocusEffect', 'useIsFocused'],
    methods: ['navigate', 'push', 'pop', 'popToTop', 'goBack', 'reset'],
    examples: [
      'navigation.navigate("ScreenName", { param: value })',
      'navigation.push("ScreenName")',
      'navigation.goBack()',
      '<Stack.Navigator initialRouteName="Home">'
    ],
    bestPractices: [
      'Define TypeScript types for navigation params',
      'Use typed navigation hooks',
      'Handle deep linking properly',
      'Implement proper back handling'
    ]
  },
  
  tabNavigation: {
    id: 'tab-navigation',
    name: 'Tab Navigation',
    category: 'navigation',
    keywords: ['tab', 'bottom', 'tabs', 'tabbar'],
    imports: ['@react-navigation/bottom-tabs', '@react-navigation/material-bottom-tabs'],
    components: ['Tab.Navigator', 'Tab.Screen'],
    examples: [
      '<Tab.Navigator screenOptions={{ tabBarActiveTintColor: "blue" }}>',
      'tabBarIcon: ({ color, size }) => <Icon name="home" />'
    ],
    bestPractices: [
      'Use vector icons for tab icons',
      'Implement badge notifications',
      'Handle tab press events',
      'Lazy load tab screens'
    ]
  },

  // State Management Patterns
  zustandState: {
    id: 'zustand-state',
    name: 'Zustand State Management',
    category: 'state',
    keywords: ['zustand', 'store', 'state', 'global state'],
    imports: ['zustand', 'zustand/middleware'],
    components: [],
    hooks: ['useStore', 'create'],
    examples: [
      'const useStore = create((set) => ({ count: 0 }))',
      'const count = useStore((state) => state.count)',
      'const increment = useStore((state) => state.increment)'
    ],
    bestPractices: [
      'Use selectors to prevent unnecessary re-renders',
      'Implement persist middleware for storage',
      'Use immer for complex state updates',
      'Create separate stores for different domains'
    ]
  },

  contextApi: {
    id: 'context-api',
    name: 'React Context API',
    category: 'state',
    keywords: ['context', 'provider', 'consumer', 'useContext'],
    imports: ['react'],
    components: ['Provider', 'Consumer'],
    hooks: ['useContext', 'createContext'],
    examples: [
      'const ThemeContext = createContext()',
      '<ThemeContext.Provider value={theme}>',
      'const theme = useContext(ThemeContext)'
    ],
    bestPractices: [
      'Split contexts by concern',
      'Memoize context values',
      'Use custom hooks to consume context',
      'Avoid putting everything in one context'
    ]
  },

  // Component Patterns
  listComponent: {
    id: 'list-component',
    name: 'List Components',
    category: 'component',
    keywords: ['flatlist', 'list', 'scrollview', 'virtualized', 'sectionlist'],
    imports: ['react-native'],
    components: ['FlatList', 'SectionList', 'VirtualizedList', 'ScrollView'],
    methods: ['renderItem', 'keyExtractor', 'getItemLayout', 'onEndReached'],
    examples: [
      '<FlatList data={data} renderItem={renderItem} keyExtractor={item => item.id} />',
      'onEndReached={loadMore}',
      'ListEmptyComponent={<EmptyState />}'
    ],
    bestPractices: [
      'Use keyExtractor for performance',
      'Implement getItemLayout for fixed height items',
      'Use onEndReachedThreshold for pagination',
      'Optimize renderItem with React.memo'
    ]
  },

  formComponent: {
    id: 'form-component',
    name: 'Form Components',
    category: 'component',
    keywords: ['form', 'input', 'textinput', 'validation', 'keyboard'],
    imports: ['react-native', 'react-hook-form'],
    components: ['TextInput', 'KeyboardAvoidingView', 'TouchableWithoutFeedback'],
    hooks: ['useForm', 'Controller'],
    examples: [
      '<TextInput value={value} onChangeText={setValue} />',
      '<KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>',
      'Keyboard.dismiss()'
    ],
    bestPractices: [
      'Handle keyboard properly on both platforms',
      'Implement proper validation',
      'Use controlled components',
      'Handle focus management'
    ]
  },

  // API Integration Patterns
  restApi: {
    id: 'rest-api',
    name: 'REST API Integration',
    category: 'api',
    keywords: ['fetch', 'api', 'rest', 'http', 'axios', 'request'],
    imports: ['axios', 'react-query', '@tanstack/react-query'],
    hooks: ['useQuery', 'useMutation', 'useInfiniteQuery'],
    examples: [
      'const { data, error, isLoading } = useQuery(["key"], fetchData)',
      'axios.get("/api/data").then(res => res.data)',
      'fetch(url, { method: "POST", body: JSON.stringify(data) })'
    ],
    bestPractices: [
      'Implement proper error handling',
      'Use interceptors for auth tokens',
      'Cache responses appropriately',
      'Handle loading and error states'
    ]
  },

  graphqlApi: {
    id: 'graphql-api',
    name: 'GraphQL Integration',
    category: 'api',
    keywords: ['graphql', 'apollo', 'query', 'mutation', 'subscription'],
    imports: ['@apollo/client', 'graphql'],
    components: ['ApolloProvider'],
    hooks: ['useQuery', 'useMutation', 'useSubscription'],
    examples: [
      'const { data, loading, error } = useQuery(GET_DATA)',
      'const [mutate] = useMutation(UPDATE_DATA)',
      '<ApolloProvider client={client}>'
    ],
    bestPractices: [
      'Use fragments for reusable fields',
      'Implement optimistic updates',
      'Handle cache properly',
      'Use error policies appropriately'
    ]
  },

  // Styling Patterns
  stylesheetStyling: {
    id: 'stylesheet-styling',
    name: 'StyleSheet Styling',
    category: 'styling',
    keywords: ['style', 'stylesheet', 'styles', 'css', 'layout'],
    imports: ['react-native'],
    components: ['StyleSheet'],
    methods: ['create', 'compose', 'flatten', 'absoluteFillObject'],
    examples: [
      'const styles = StyleSheet.create({ container: { flex: 1 } })',
      'style={[styles.base, isActive && styles.active]}',
      'StyleSheet.absoluteFillObject'
    ],
    bestPractices: [
      'Use StyleSheet.create for optimization',
      'Compose styles with arrays',
      'Use constants for colors and dimensions',
      'Implement responsive design with dimensions'
    ]
  },

  styledComponents: {
    id: 'styled-components',
    name: 'Styled Components',
    category: 'styling',
    keywords: ['styled', 'css', 'theme', 'styled-components'],
    imports: ['styled-components/native'],
    components: ['ThemeProvider'],
    examples: [
      'const Container = styled.View`flex: 1;`',
      'const Button = styled.TouchableOpacity`padding: ${props => props.theme.spacing};`',
      '<ThemeProvider theme={theme}>'
    ],
    bestPractices: [
      'Use theme for consistency',
      'Create reusable styled components',
      'Use props for dynamic styling',
      'Implement proper TypeScript types'
    ]
  },

  // Storage Patterns
  asyncStorage: {
    id: 'async-storage',
    name: 'Async Storage',
    category: 'storage',
    keywords: ['storage', 'persist', 'save', 'cache', 'asyncstorage'],
    imports: ['@react-native-async-storage/async-storage'],
    methods: ['getItem', 'setItem', 'removeItem', 'clear', 'multiGet'],
    examples: [
      'await AsyncStorage.setItem("key", JSON.stringify(value))',
      'const value = await AsyncStorage.getItem("key")',
      'await AsyncStorage.multiGet(["key1", "key2"])'
    ],
    bestPractices: [
      'Always stringify/parse JSON data',
      'Handle errors properly',
      'Use try-catch blocks',
      'Implement data migration strategies'
    ]
  },

  // Animation Patterns
  animatedApi: {
    id: 'animated-api',
    name: 'Animated API',
    category: 'animation',
    keywords: ['animated', 'animation', 'transition', 'motion'],
    imports: ['react-native'],
    components: ['Animated.View', 'Animated.Text', 'Animated.ScrollView'],
    hooks: ['useAnimatedValue', 'useRef'],
    methods: ['timing', 'spring', 'decay', 'parallel', 'sequence'],
    examples: [
      'const fadeAnim = useRef(new Animated.Value(0)).current',
      'Animated.timing(fadeAnim, { toValue: 1, duration: 1000 })',
      '<Animated.View style={{ opacity: fadeAnim }}>'
    ],
    bestPractices: [
      'Use native driver when possible',
      'Batch animations for performance',
      'Clean up animations on unmount',
      'Use interpolation for complex animations'
    ]
  },

  reanimated: {
    id: 'reanimated',
    name: 'Reanimated 2',
    category: 'animation',
    keywords: ['reanimated', 'worklet', 'shared value', 'gesture'],
    imports: ['react-native-reanimated'],
    hooks: ['useAnimatedStyle', 'useSharedValue', 'useAnimatedGestureHandler'],
    examples: [
      'const translateX = useSharedValue(0)',
      'const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }))',
      'withSpring(translateX.value)'
    ],
    bestPractices: [
      'Use worklets for performance',
      'Combine with gesture handler',
      'Use layout animations',
      'Optimize for 60fps'
    ]
  },

  // Gesture Patterns
  gestureHandler: {
    id: 'gesture-handler',
    name: 'Gesture Handler',
    category: 'gesture',
    keywords: ['gesture', 'pan', 'pinch', 'swipe', 'drag', 'touch'],
    imports: ['react-native-gesture-handler'],
    components: ['GestureDetector', 'PanGestureHandler', 'TapGestureHandler'],
    hooks: ['useAnimatedGestureHandler'],
    examples: [
      '<GestureDetector gesture={panGesture}>',
      'Gesture.Pan().onUpdate((event) => { translateX.value = event.translationX })',
      'simultaneousHandlers={[ref1, ref2]}'
    ],
    bestPractices: [
      'Use native thread for gestures',
      'Combine with reanimated',
      'Handle gesture states properly',
      'Test on both platforms'
    ]
  }
}

// Pattern detection function
export function detectPatterns(text: string): Pattern[] {
  const detectedPatterns: Pattern[] = []
  const textLower = text.toLowerCase()

  for (const pattern of Object.values(REACT_NATIVE_PATTERNS)) {
    let score = 0

    // Check keywords
    for (const keyword of pattern.keywords) {
      if (textLower.includes(keyword.toLowerCase())) {
        score += 1
      }
    }

    // Check imports
    for (const imp of pattern.imports) {
      if (textLower.includes(imp.toLowerCase())) {
        score += 2
      }
    }

    // Check components
    for (const component of pattern.components) {
      if (text.includes(component)) {
        score += 2
      }
    }

    // Check hooks
    if (pattern.hooks) {
      for (const hook of pattern.hooks) {
        if (text.includes(hook)) {
          score += 1.5
        }
      }
    }

    // Add pattern if score is significant
    if (score >= 2) {
      detectedPatterns.push(pattern)
    }
  }

  return detectedPatterns
}

// Get pattern by category
export function getPatternsByCategory(category: Pattern['category']): Pattern[] {
  return Object.values(REACT_NATIVE_PATTERNS).filter(p => p.category === category)
}

// Get pattern examples
export function getPatternExamples(patternId: string): string[] {
  const pattern = REACT_NATIVE_PATTERNS[patternId]
  return pattern ? pattern.examples : []
}

// Get best practices for patterns
export function getBestPractices(patterns: Pattern[]): string[] {
  const practices = new Set<string>()
  
  for (const pattern of patterns) {
    for (const practice of pattern.bestPractices) {
      practices.add(practice)
    }
  }

  return Array.from(practices)
}

// Check if code follows pattern
export function validatePatternUsage(code: string, pattern: Pattern): {
  valid: boolean
  issues: string[]
  suggestions: string[]
} {
  const issues: string[] = []
  const suggestions: string[] = []

  // Check for anti-patterns
  if (pattern.antiPatterns) {
    for (const antiPattern of pattern.antiPatterns) {
      if (code.includes(antiPattern)) {
        issues.push(`Anti-pattern detected: ${antiPattern}`)
      }
    }
  }

  // Check for missing imports
  const hasImport = pattern.imports.some(imp => code.includes(imp))
  if (!hasImport && pattern.imports.length > 0) {
    suggestions.push(`Consider importing from: ${pattern.imports.join(', ')}`)
  }

  // Check for best practices
  suggestions.push(...pattern.bestPractices.map(bp => `Best practice: ${bp}`))

  return {
    valid: issues.length === 0,
    issues,
    suggestions
  }
}