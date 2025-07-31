import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { ScrollArea } from '../components/ui/scroll-area';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Textarea } from '../components/ui/textarea';
import { 
  Plus, 
  Search, 
  FolderOpen, 
  Clock, 
  Code2, 
  Users,
  Globe,
  Lock,
  MoreVertical,
  Trash2,
  Share2,
  ExternalLink,
  Star,
  Copy
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useToast } from '../hooks/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';

interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
  isPublic: boolean;
  isFavorite: boolean;
  collaborators: number;
  sdk_version?: string;
  preview_url?: string;
}

// Mock data - in real app, this would come from Supabase
const MOCK_PROJECTS: Project[] = [
  {
    id: '1',
    name: 'My First App',
    description: 'A simple React Native app to get started',
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-01-20'),
    isPublic: false,
    isFavorite: true,
    collaborators: 1,
    sdk_version: '52.0.0',
  },
  {
    id: '2',
    name: 'E-commerce UI',
    description: 'Beautiful shopping app interface with product listings and cart',
    createdAt: new Date('2024-01-10'),
    updatedAt: new Date('2024-01-18'),
    isPublic: true,
    isFavorite: false,
    collaborators: 3,
    sdk_version: '52.0.0',
    preview_url: 'https://snack.expo.dev/@demo/ecommerce-ui',
  },
  {
    id: '3',
    name: 'Weather App',
    description: 'Real-time weather data with beautiful animations',
    createdAt: new Date('2024-01-05'),
    updatedAt: new Date('2024-01-12'),
    isPublic: true,
    isFavorite: true,
    collaborators: 2,
    sdk_version: '51.0.0',
  },
];

export function SnackProjects() {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [projects, setProjects] = useState<Project[]>(MOCK_PROJECTS);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newProject, setNewProject] = useState({
    name: '',
    description: '',
    isPublic: false,
  });
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'favorites' | 'public' | 'private'>('all');

  // Filter projects
  const filteredProjects = projects.filter(project => {
    const matchesSearch = project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         project.description.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesFilter = 
      selectedFilter === 'all' ||
      (selectedFilter === 'favorites' && project.isFavorite) ||
      (selectedFilter === 'public' && project.isPublic) ||
      (selectedFilter === 'private' && !project.isPublic);
    
    return matchesSearch && matchesFilter;
  });

  // Create new project
  const handleCreateProject = () => {
    const projectId = uuidv4();
    const project: Project = {
      id: projectId,
      name: newProject.name || 'Untitled Project',
      description: newProject.description || 'A new React Native project',
      createdAt: new Date(),
      updatedAt: new Date(),
      isPublic: newProject.isPublic,
      isFavorite: false,
      collaborators: 1,
      sdk_version: '52.0.0',
    };

    setProjects([project, ...projects]);
    setIsCreateDialogOpen(false);
    setNewProject({ name: '', description: '', isPublic: false });
    
    // Navigate to editor
    navigate(`/snack/${projectId}`);
  };

  // Toggle favorite
  const toggleFavorite = (projectId: string) => {
    setProjects(projects.map(p => 
      p.id === projectId ? { ...p, isFavorite: !p.isFavorite } : p
    ));
  };

  // Delete project
  const deleteProject = (projectId: string) => {
    setProjects(projects.filter(p => p.id !== projectId));
    toast({
      title: 'Project deleted',
      description: 'The project has been permanently deleted',
    });
  };

  // Duplicate project
  const duplicateProject = (project: Project) => {
    const newProjectId = uuidv4();
    const duplicated: Project = {
      ...project,
      id: newProjectId,
      name: `${project.name} (Copy)`,
      createdAt: new Date(),
      updatedAt: new Date(),
      isFavorite: false,
    };
    
    setProjects([duplicated, ...projects]);
    toast({
      title: 'Project duplicated',
      description: `Created a copy of "${project.name}"`,
    });
  };

  // Copy preview URL
  const copyPreviewUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast({
      title: 'Link copied',
      description: 'Preview link copied to clipboard',
    });
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Snack Projects</h1>
        <p className="text-muted-foreground">
          Create and manage your React Native projects with live preview
        </p>
      </div>

      {/* Actions Bar */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <div className="flex gap-2">
          <Button
            variant={selectedFilter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedFilter('all')}
          >
            All
          </Button>
          <Button
            variant={selectedFilter === 'favorites' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedFilter('favorites')}
          >
            <Star className="w-4 h-4 mr-1" />
            Favorites
          </Button>
          <Button
            variant={selectedFilter === 'public' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedFilter('public')}
          >
            <Globe className="w-4 h-4 mr-1" />
            Public
          </Button>
          <Button
            variant={selectedFilter === 'private' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedFilter('private')}
          >
            <Lock className="w-4 h-4 mr-1" />
            Private
          </Button>
        </div>
        
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Project
        </Button>
      </div>

      {/* Projects Grid */}
      {filteredProjects.length === 0 ? (
        <Card className="p-12 text-center">
          <FolderOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No projects found</h3>
          <p className="text-muted-foreground mb-4">
            {searchQuery ? 'Try adjusting your search terms' : 'Create your first project to get started'}
          </p>
          {!searchQuery && (
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Project
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map((project) => (
            <Card 
              key={project.id} 
              className="group hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => navigate(`/snack/${project.id}`)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="flex items-center gap-2">
                      {project.name}
                      {project.isFavorite && (
                        <Star className="w-4 h-4 fill-yellow-500 text-yellow-500" />
                      )}
                    </CardTitle>
                    <CardDescription className="mt-1 line-clamp-2">
                      {project.description}
                    </CardDescription>
                  </div>
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/snack/${project.id}`);
                      }}>
                        <Code2 className="w-4 h-4 mr-2" />
                        Open Editor
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(project.id);
                      }}>
                        <Star className="w-4 h-4 mr-2" />
                        {project.isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation();
                        duplicateProject(project);
                      }}>
                        <Copy className="w-4 h-4 mr-2" />
                        Duplicate
                      </DropdownMenuItem>
                      {project.preview_url && (
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation();
                          copyPreviewUrl(project.preview_url!);
                        }}>
                          <Share2 className="w-4 h-4 mr-2" />
                          Copy Preview URL
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        className="text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteProject(project.id);
                        }}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              
              <CardContent>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(project.updatedAt).toLocaleDateString()}
                  </div>
                  
                  {project.collaborators > 1 && (
                    <div className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {project.collaborators}
                    </div>
                  )}
                  
                  <Badge variant={project.isPublic ? 'secondary' : 'outline'} className="gap-1">
                    {project.isPublic ? <Globe className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                    {project.isPublic ? 'Public' : 'Private'}
                  </Badge>
                </div>
                
                {project.sdk_version && (
                  <div className="mt-3">
                    <Badge variant="outline" className="text-xs">
                      SDK {project.sdk_version}
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Project Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
            <DialogDescription>
              Start a new React Native project with Expo Snack
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Project Name</label>
              <Input
                placeholder="My Awesome App"
                value={newProject.name}
                onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                placeholder="Describe your project..."
                value={newProject.description}
                onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                rows={3}
              />
            </div>
            
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isPublic"
                checked={newProject.isPublic}
                onChange={(e) => setNewProject({ ...newProject, isPublic: e.target.checked })}
                className="rounded border-gray-300"
              />
              <label htmlFor="isPublic" className="text-sm">
                Make this project public
              </label>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateProject}>
              Create Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}