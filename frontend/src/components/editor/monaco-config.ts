import type { Monaco } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'

export const MONACO_OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  fontSize: 14,
  fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, "Courier New", monospace',
  minimap: {
    enabled: true,
  },
  automaticLayout: true,
  scrollBeyondLastLine: false,
  wordWrap: 'on',
  wrappingStrategy: 'advanced',
  lineNumbers: 'on',
  renderLineHighlight: 'all',
  scrollbar: {
    vertical: 'visible',
    horizontal: 'visible',
    useShadows: false,
    verticalHasArrows: false,
    horizontalHasArrows: false,
    verticalScrollbarSize: 10,
    horizontalScrollbarSize: 10,
  },
  overviewRulerBorder: false,
  cursorStyle: 'line',
  cursorBlinking: 'smooth',
  smoothScrolling: true,
  contextmenu: true,
  mouseWheelZoom: true,
  suggestSelection: 'first',
  tabSize: 2,
  insertSpaces: true,
  formatOnPaste: true,
  formatOnType: true,
  autoClosingBrackets: 'always',
  autoClosingQuotes: 'always',
  autoSurround: 'languageDefined',
  autoIndent: 'advanced',
  dragAndDrop: true,
  links: true,
  colorDecorators: true,
  accessibilitySupport: 'auto',
  quickSuggestions: {
    other: true,
    comments: false,
    strings: true,
  },
  parameterHints: {
    enabled: true,
  },
  hover: {
    enabled: true,
    delay: 300,
  },
}

export const LIGHT_THEME_DATA: editor.IStandaloneThemeData = {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '6A737D' },
    { token: 'keyword', foreground: 'D73A49' },
    { token: 'string', foreground: '032F62' },
    { token: 'number', foreground: '005CC5' },
    { token: 'type', foreground: 'D73A49' },
    { token: 'function', foreground: '6F42C1' },
    { token: 'variable', foreground: 'E36209' },
  ],
  colors: {
    'editor.background': '#FFFFFF',
    'editor.foreground': '#24292E',
    'editor.lineHighlightBackground': '#F6F8FA',
    'editorCursor.foreground': '#24292E',
    'editorWhitespace.foreground': '#D1D5DA',
    'editor.selectionBackground': '#0366D625',
  },
}

export const DARK_THEME_DATA: editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '8B949E' },
    { token: 'keyword', foreground: 'FF7B72' },
    { token: 'string', foreground: 'A5D6FF' },
    { token: 'number', foreground: '79C0FF' },
    { token: 'type', foreground: 'FF7B72' },
    { token: 'function', foreground: 'D2A8FF' },
    { token: 'variable', foreground: 'FFA657' },
  ],
  colors: {
    'editor.background': '#0D1117',
    'editor.foreground': '#C9D1D9',
    'editor.lineHighlightBackground': '#161B22',
    'editorCursor.foreground': '#58A6FF',
    'editorWhitespace.foreground': '#484F58',
    'editor.selectionBackground': '#58A6FF30',
  },
}

export function configureMonaco(monaco: Monaco) {
  // Define custom themes
  monaco.editor.defineTheme('velocity-light', LIGHT_THEME_DATA)
  monaco.editor.defineTheme('velocity-dark', DARK_THEME_DATA)

  // Configure TypeScript/JavaScript defaults
  monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ESNext,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    lib: ['ESNext', 'DOM', 'DOM.Iterable'],
    allowJs: true,
    checkJs: false,
    jsx: monaco.languages.typescript.JsxEmit.React,
    declaration: true,
    outDir: './dist',
    rootDir: './src',
    removeComments: true,
    noEmit: true,
    importHelpers: true,
    isolatedModules: true,
    esModuleInterop: true,
    resolveJsonModule: true,
    skipLibCheck: true,
    allowSyntheticDefaultImports: true,
    strict: true,
    forceConsistentCasingInFileNames: true,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    baseUrl: '.',
    paths: {
      '@/*': ['./src/*'],
    },
  })

  monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
    ...monaco.languages.typescript.javascriptDefaults.getCompilerOptions(),
  })

  // Add React Native type definitions
  const reactNativeTypes = `
    declare module 'react-native' {
      export interface ViewProps {
        style?: any;
        children?: React.ReactNode;
      }
      export interface TextProps {
        style?: any;
        children?: React.ReactNode;
      }
      export interface TouchableOpacityProps {
        onPress?: () => void;
        style?: any;
        children?: React.ReactNode;
      }
      export interface ScrollViewProps {
        style?: any;
        contentContainerStyle?: any;
        children?: React.ReactNode;
      }
      export interface ImageProps {
        source: { uri: string } | number;
        style?: any;
      }
      export interface TextInputProps {
        value?: string;
        onChangeText?: (text: string) => void;
        placeholder?: string;
        style?: any;
      }
      
      export const View: React.FC<ViewProps>;
      export const Text: React.FC<TextProps>;
      export const TouchableOpacity: React.FC<TouchableOpacityProps>;
      export const ScrollView: React.FC<ScrollViewProps>;
      export const Image: React.FC<ImageProps>;
      export const TextInput: React.FC<TextInputProps>;
      export const StyleSheet: {
        create: <T extends Record<string, any>>(styles: T) => T;
      };
    }
  `

  monaco.languages.typescript.javascriptDefaults.addExtraLib(
    reactNativeTypes,
    'react-native.d.ts'
  )
  monaco.languages.typescript.typescriptDefaults.addExtraLib(
    reactNativeTypes,
    'react-native.d.ts'
  )

  // Configure diagnostic options
  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  })

  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  })
}