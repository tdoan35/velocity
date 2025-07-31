import React, { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { ScrollArea } from '../components/ui/scroll-area';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { 
  Code2, 
  FileCode2,
  FolderOpen,
  Plus,
  Save,
  Download,
  Share2,
  Play,
  Settings,
  FileText,
  Image,
  Package,
  Smartphone,
  Monitor,
  ChevronLeft,
  X,
  Trash2
} from 'lucide-react';
import MonacoEditor from '@monaco-editor/react';
import { SnackPreviewPanel } from '../components/preview/SnackPreviewPanel';
import { DependencyManager } from '../components/editor/DependencyManager';
import { SnackEditorIntegration } from '../components/editor/SnackEditorIntegration';
import { useToast } from '../hooks/use-toast';
import { editor as MonacoEditorType } from 'monaco-editor';

// Project templates
const PROJECT_TEMPLATES = {
  blank: {
    name: 'Blank Project',
    description: 'Start with a minimal React Native app',
    files: {
      'App.js': {
        type: 'CODE',
        contents: `import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Hello, World!</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  text: {
    fontSize: 24,
    fontWeight: 'bold',
  },
});`
      }
    },
    dependencies: {
      'react': '^18.2.0',
      'react-native': '^0.74.0',
    }
  },
  navigation: {
    name: 'Navigation Example',
    description: 'React Navigation with multiple screens',
    files: {
      'App.js': {
        type: 'CODE',
        contents: `import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from './screens/HomeScreen';
import DetailsScreen from './screens/DetailsScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Home">
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Details" component={DetailsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}`
      },
      'screens/HomeScreen.js': {
        type: 'CODE',
        contents: `import React from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';

export default function HomeScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Home Screen</Text>
      <Button
        title="Go to Details"
        onPress={() => navigation.navigate('Details', { itemId: 86 })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    marginBottom: 20,
  },
});`
      },
      'screens/DetailsScreen.js': {
        type: 'CODE',
        contents: `import React from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';

export default function DetailsScreen({ route, navigation }) {
  const { itemId } = route.params || {};
  
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Details Screen</Text>
      <Text>Item ID: {itemId}</Text>
      <Button
        title="Go back"
        onPress={() => navigation.goBack()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    marginBottom: 20,
  },
});`
      }
    },
    dependencies: {
      'react': '^18.2.0',
      'react-native': '^0.74.0',
      '@react-navigation/native': '^6.1.0',
      '@react-navigation/native-stack': '^6.9.0',
      'react-native-screens': '~3.34.0',
      'react-native-safe-area-context': '4.12.0',
    }
  },
  components: {
    name: 'Component Library',
    description: 'Reusable UI components with examples',
    files: {
      'App.js': {
        type: 'CODE',
        contents: `import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import Button from './components/Button';
import Card from './components/Card';
import Input from './components/Input';

export default function App() {
  return (
    <ScrollView style={styles.container}>
      <Card title="Button Examples">
        <Button title="Primary Button" onPress={() => {}} />
        <Button title="Secondary Button" variant="secondary" onPress={() => {}} />
        <Button title="Danger Button" variant="danger" onPress={() => {}} />
      </Card>
      
      <Card title="Input Examples">
        <Input placeholder="Enter your name" />
        <Input placeholder="Enter password" secureTextEntry />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
});`
      },
      'components/Button.js': {
        type: 'CODE',
        contents: `import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';

export default function Button({ title, onPress, variant = 'primary' }) {
  return (
    <TouchableOpacity 
      style={[styles.button, styles[variant]]} 
      onPress={onPress}
    >
      <Text style={[styles.text, styles[\`\${variant}Text\`]]}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginVertical: 8,
    alignItems: 'center',
  },
  primary: {
    backgroundColor: '#007AFF',
  },
  secondary: {
    backgroundColor: '#E0E0E0',
  },
  danger: {
    backgroundColor: '#FF3B30',
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
  },
  primaryText: {
    color: 'white',
  },
  secondaryText: {
    color: '#333',
  },
  dangerText: {
    color: 'white',
  },
});`
      },
      'components/Card.js': {
        type: 'CODE',
        contents: `import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function Card({ title, children }) {
  return (
    <View style={styles.card}>
      {title && <Text style={styles.title}>{title}</Text>}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
});`
      },
      'components/Input.js': {
        type: 'CODE',
        contents: `import React from 'react';
import { TextInput, StyleSheet } from 'react-native';

export default function Input(props) {
  return (
    <TextInput
      style={styles.input}
      placeholderTextColor="#999"
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
});`
      }
    },
    dependencies: {
      'react': '^18.2.0',
      'react-native': '^0.74.0',
    }
  }
};

interface FileItem {
  path: string;
  type: 'CODE' | 'ASSET';
  contents: string;
}

export function SnackEditor() {
  const { projectId } = useParams<{ projectId?: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  // State
  const [sessionId] = useState(() => projectId || uuidv4());
  const [projectName, setProjectName] = useState('My Snack Project');
  const [projectDescription, setProjectDescription] = useState('A React Native app built with Velocity');
  const [files, setFiles] = useState<Record<string, FileItem>>(PROJECT_TEMPLATES.blank.files);
  const [currentFile, setCurrentFile] = useState('App.js');
  const [dependencies, setDependencies] = useState<Record<string, string>>(PROJECT_TEMPLATES.blank.dependencies);
  const [editor, setEditor] = useState<MonacoEditorType.IStandaloneCodeEditor | null>(null);
  const [activeTab, setActiveTab] = useState('code');
  const [isNewFileDialogOpen, setIsNewFileDialogOpen] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // File operations
  const createNewFile = useCallback((fileName: string) => {
    if (files[fileName]) {
      toast({
        title: 'File exists',
        description: `${fileName} already exists`,
        variant: 'destructive',
      });
      return;
    }

    const extension = fileName.split('.').pop();
    let contents = '';

    // Default content based on file type
    if (extension === 'js' || extension === 'jsx') {
      contents = `// ${fileName}\n\nexport default function Component() {\n  return null;\n}`;
    } else if (extension === 'json') {
      contents = '{\n  \n}';
    } else if (extension === 'md') {
      contents = `# ${fileName}\n\n`;
    }

    setFiles({
      ...files,
      [fileName]: {
        path: fileName,
        type: 'CODE',
        contents,
      },
    });

    setCurrentFile(fileName);
    setIsNewFileDialogOpen(false);
    setNewFileName('');
    setHasUnsavedChanges(true);
  }, [files, toast]);

  const deleteFile = useCallback((fileName: string) => {
    if (Object.keys(files).length === 1) {
      toast({
        title: 'Cannot delete',
        description: 'Project must have at least one file',
        variant: 'destructive',
      });
      return;
    }

    const newFiles = { ...files };
    delete newFiles[fileName];
    setFiles(newFiles);

    if (currentFile === fileName) {
      setCurrentFile(Object.keys(newFiles)[0]);
    }

    setHasUnsavedChanges(true);
  }, [files, currentFile, toast]);

  const updateFileContent = useCallback((fileName: string, content: string) => {
    setFiles({
      ...files,
      [fileName]: {
        ...files[fileName],
        contents: content,
      },
    });
    setHasUnsavedChanges(true);
  }, [files]);

  // Load template
  const loadTemplate = useCallback((templateKey: keyof typeof PROJECT_TEMPLATES) => {
    const template = PROJECT_TEMPLATES[templateKey];
    setFiles(template.files);
    setDependencies(template.dependencies);
    setCurrentFile(Object.keys(template.files)[0]);
    setProjectName(template.name);
    setProjectDescription(template.description);
    setIsTemplateDialogOpen(false);
    setHasUnsavedChanges(true);
    
    toast({
      title: 'Template loaded',
      description: `Loaded ${template.name} template`,
    });
  }, [toast]);

  // Handle editor mount
  const handleEditorMount = useCallback((editor: MonacoEditorType.IStandaloneCodeEditor) => {
    setEditor(editor);
  }, []);

  // Save project
  const saveProject = useCallback(async () => {
    // In a real implementation, this would save to Supabase
    setHasUnsavedChanges(false);
    toast({
      title: 'Project saved',
      description: 'Your changes have been saved',
    });
  }, [toast]);

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              {projectName}
              {hasUnsavedChanges && <Badge variant="secondary">Unsaved</Badge>}
            </h1>
            <p className="text-sm text-muted-foreground">{projectDescription}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsTemplateDialogOpen(true)}
          >
            <FileText className="w-4 h-4 mr-2" />
            Templates
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={saveProject}
          >
            <Save className="w-4 h-4 mr-2" />
            Save
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
          >
            <Share2 className="w-4 h-4 mr-2" />
            Share
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex">
        {/* Sidebar */}
        <div className="w-64 border-r flex flex-col">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <TabsList className="m-2">
              <TabsTrigger value="code" className="flex-1">
                <FileCode2 className="w-4 h-4 mr-1" />
                Files
              </TabsTrigger>
              <TabsTrigger value="dependencies" className="flex-1">
                <Package className="w-4 h-4 mr-1" />
                Packages
              </TabsTrigger>
            </TabsList>

            <TabsContent value="code" className="flex-1 m-0">
              <div className="px-2 pb-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setIsNewFileDialogOpen(true)}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  New File
                </Button>
              </div>
              
              <ScrollArea className="flex-1">
                <div className="px-2 pb-2 space-y-1">
                  {Object.entries(files).map(([fileName, file]) => (
                    <div
                      key={fileName}
                      className={`
                        group flex items-center justify-between px-3 py-2 rounded-md cursor-pointer
                        ${currentFile === fileName ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}
                      `}
                      onClick={() => setCurrentFile(fileName)}
                    >
                      <div className="flex items-center gap-2 flex-1">
                        <FileCode2 className="w-4 h-4" />
                        <span className="text-sm truncate">{fileName}</span>
                      </div>
                      {Object.keys(files).length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteFile(fileName);
                          }}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="dependencies" className="flex-1 m-0 p-2">
              <DependencyManager
                dependencies={dependencies}
                onDependenciesChange={setDependencies}
                className="h-full border-0"
              />
            </TabsContent>
          </Tabs>
        </div>

        {/* Editor */}
        <div className="flex-1">
          <MonacoEditor
            height="100%"
            language={currentFile.endsWith('.json') ? 'json' : 'javascript'}
            value={files[currentFile]?.contents || ''}
            onChange={(value) => value !== undefined && updateFileContent(currentFile, value)}
            onMount={handleEditorMount}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              lineNumbers: 'on',
              roundedSelection: false,
              scrollBeyondLastLine: false,
              automaticLayout: true,
            }}
          />
        </div>

        {/* Preview */}
        <div className="w-[500px] border-l">
          <SnackPreviewPanel
            sessionId={sessionId}
            className="h-full"
          />
        </div>
      </div>

      {/* Editor Integration */}
      {editor && (
        <SnackEditorIntegration
          editor={editor}
          sessionId={sessionId}
          currentFile={currentFile}
          files={files}
          dependencies={dependencies}
          onFilesUpdate={setFiles}
          onDependenciesUpdate={setDependencies}
        />
      )}

      {/* New File Dialog */}
      <Dialog open={isNewFileDialogOpen} onOpenChange={setIsNewFileDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New File</DialogTitle>
            <DialogDescription>
              Enter a name for the new file. Include the file extension.
            </DialogDescription>
          </DialogHeader>
          
          <Input
            placeholder="components/MyComponent.js"
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newFileName) {
                createNewFile(newFileName);
              }
            }}
          />
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewFileDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => createNewFile(newFileName)}
              disabled={!newFileName}
            >
              Create File
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template Dialog */}
      <Dialog open={isTemplateDialogOpen} onOpenChange={setIsTemplateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Choose a Template</DialogTitle>
            <DialogDescription>
              Start with a pre-built template to jumpstart your project
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-1 gap-4 py-4">
            {Object.entries(PROJECT_TEMPLATES).map(([key, template]) => (
              <Card
                key={key}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => loadTemplate(key as keyof typeof PROJECT_TEMPLATES)}
              >
                <div className="p-4">
                  <h3 className="font-semibold">{template.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {template.description}
                  </p>
                  <div className="flex gap-2 mt-3">
                    <Badge variant="secondary">
                      {Object.keys(template.files).length} files
                    </Badge>
                    <Badge variant="secondary">
                      {Object.keys(template.dependencies).length} dependencies
                    </Badge>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}