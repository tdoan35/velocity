import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { 
  Package, 
  Plus, 
  Trash2, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle,
  Search,
  Loader2,
  AlertTriangle
} from 'lucide-react';
import { snackagerService } from '../../services/snackagerService';
import type { DependencyResolution } from '../../services/snackagerService';
import { useToast } from '../../hooks/use-toast';
import { cn } from '../../lib/utils';

interface DependencyManagerProps {
  dependencies: Record<string, string>;
  onDependenciesChange: (dependencies: Record<string, string>) => void;
  projectId?: string;
  sdkVersion?: string;
  className?: string;
}

interface AddDependencyDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (name: string, version: string) => void;
  existingDependencies: string[];
}

export function DependencyManager({
  dependencies,
  onDependenciesChange,
  projectId,
  sdkVersion = '52.0.0',
  className
}: DependencyManagerProps) {
  const [isResolving, setIsResolving] = useState(false);
  const [resolution, setResolution] = useState<DependencyResolution | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { toast } = useToast();

  // Filter dependencies based on search
  const filteredDependencies = Object.entries(dependencies).filter(([name]) =>
    name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Resolve dependencies
  const resolveDependencies = async () => {
    setIsResolving(true);
    try {
      const result = await snackagerService.resolveDependencies(dependencies, sdkVersion);
      setResolution(result);
      
      if (result.conflicts.length > 0) {
        toast({
          title: 'Dependency conflicts detected',
          description: `Found ${result.conflicts.length} conflicts. Check the suggestions.`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Dependencies resolved',
          description: 'All dependencies are compatible.',
        });
      }

      // Save resolution if projectId provided
      if (projectId) {
        await snackagerService.saveDependencyResolution(projectId, result);
      }
    } catch (error) {
      toast({
        title: 'Resolution failed',
        description: 'Failed to resolve dependencies. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsResolving(false);
    }
  };

  // Add dependency
  const handleAddDependency = (name: string, version: string) => {
    if (dependencies[name]) {
      toast({
        title: 'Dependency exists',
        description: `${name} is already in your dependencies.`,
        variant: 'destructive',
      });
      return;
    }

    const updatedDeps = {
      ...dependencies,
      [name]: version || 'latest',
    };
    onDependenciesChange(updatedDeps);
    
    toast({
      title: 'Dependency added',
      description: `Added ${name}@${version || 'latest'}`,
    });
  };

  // Remove dependency
  const handleRemoveDependency = (name: string) => {
    const updatedDeps = { ...dependencies };
    delete updatedDeps[name];
    onDependenciesChange(updatedDeps);
    
    toast({
      title: 'Dependency removed',
      description: `Removed ${name}`,
    });
  };

  // Update dependency version
  const handleUpdateVersion = (name: string, version: string) => {
    const updatedDeps = {
      ...dependencies,
      [name]: version,
    };
    onDependenciesChange(updatedDeps);
  };

  // Prefetch common packages on mount
  useEffect(() => {
    snackagerService.prefetchCommonPackages(sdkVersion);
  }, [sdkVersion]);

  return (
    <Card className={cn("flex flex-col h-full", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Dependencies</CardTitle>
            <CardDescription>
              Manage npm packages for your project
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={resolveDependencies}
              disabled={isResolving}
            >
              {isResolving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
            </Button>
            <Button
              size="sm"
              onClick={() => setIsAddDialogOpen(true)}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0">
        {/* Search */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search dependencies..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
        </div>

        {/* Dependency list */}
        <ScrollArea className="flex-1 px-4">
          <div className="space-y-2 pb-4">
            {filteredDependencies.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {searchQuery ? 'No dependencies found' : 'No dependencies added yet'}
              </div>
            ) : (
              filteredDependencies.map(([name, version]) => {
                const conflict = resolution?.conflicts.find(c => c.package === name);
                
                return (
                  <div
                    key={name}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg border",
                      conflict && "border-destructive bg-destructive/10"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Package className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{name}</span>
                          {conflict && (
                            <AlertTriangle className="w-3 h-3 text-destructive" />
                          )}
                        </div>
                        <Input
                          value={version}
                          onChange={(e) => handleUpdateVersion(name, e.target.value)}
                          className="h-6 w-24 text-xs mt-1"
                          placeholder="Version"
                        />
                      </div>
                    </div>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveDependency(name)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        {/* Resolution status */}
        {resolution && (
          <div className="border-t p-4">
            {resolution.conflicts.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="w-4 h-4" />
                  <span className="font-medium">
                    {resolution.conflicts.length} conflict(s) found
                  </span>
                </div>
                {resolution.suggestions.length > 0 && (
                  <div className="space-y-1">
                    {resolution.suggestions.slice(0, 3).map((suggestion, i) => (
                      <p key={i} className="text-xs text-muted-foreground">
                        • {suggestion}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle className="w-4 h-4" />
                <span>All dependencies resolved successfully</span>
              </div>
            )}
          </div>
        )}
      </CardContent>

      {/* Add dependency dialog */}
      <AddDependencyDialog
        isOpen={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        onAdd={handleAddDependency}
        existingDependencies={Object.keys(dependencies)}
      />
    </Card>
  );
}

function AddDependencyDialog({
  isOpen,
  onClose,
  onAdd,
  existingDependencies
}: AddDependencyDialogProps) {
  const [packageName, setPackageName] = useState('');
  const [version, setVersion] = useState('latest');
  const [suggestions] = useState([
    { name: '@react-navigation/native', description: 'React Navigation for React Native' },
    { name: 'react-native-screens', description: 'Native navigation primitives' },
    { name: 'react-native-safe-area-context', description: 'Safe area boundaries' },
    { name: 'react-native-gesture-handler', description: 'Declarative gesture APIs' },
    { name: 'react-native-reanimated', description: 'React Native animations' },
    { name: 'axios', description: 'Promise based HTTP client' },
    { name: 'lodash', description: 'JavaScript utility library' },
  ]);

  const handleSubmit = () => {
    if (!packageName.trim()) return;
    
    onAdd(packageName.trim(), version.trim());
    setPackageName('');
    setVersion('latest');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Dependency</DialogTitle>
          <DialogDescription>
            Add a new npm package to your project
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Package Name</label>
            <Input
              placeholder="e.g., axios, lodash, @react-navigation/native"
              value={packageName}
              onChange={(e) => setPackageName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Version</label>
            <Input
              placeholder="latest"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
          </div>

          {/* Suggestions */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              Popular packages
            </label>
            <ScrollArea className="h-32">
              <div className="space-y-1">
                {suggestions
                  .filter(s => !existingDependencies.includes(s.name))
                  .map((suggestion) => (
                    <button
                      key={suggestion.name}
                      className="w-full text-left p-2 hover:bg-muted rounded-md transition-colors"
                      onClick={() => {
                        setPackageName(suggestion.name);
                        setVersion('latest');
                      }}
                    >
                      <div className="text-sm font-medium">{suggestion.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {suggestion.description}
                      </div>
                    </button>
                  ))}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!packageName.trim()}>
            Add Package
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}