import { useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation, Link } from "react-router-dom";
import { Sidebar, SidebarBody, SidebarLink } from "./ui/sidebar";
import { projectService } from "@/services/projectService";
import {
  IconArrowLeft,
  IconSettings,
  IconLayoutSidebarLeftExpand,
  IconLayoutSidebarLeftExpandFilled,
  IconSquareRoundedPlus,
  IconSquareRoundedPlusFilled,
} from "@tabler/icons-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import { useProjectContext } from "@/contexts/ProjectContext";
import { ChevronRight, FolderOpen, MoreHorizontal, Edit, Trash2 } from "lucide-react";
import { Navbar } from "./navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export function AuthenticatedLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const { currentProject, projects, setProjects, updateProject, deleteProject } = useProjectContext();
  const [pinned, setPinned] = useState(false);
  const [open, setOpen] = useState(pinned);
  const [mounted, setMounted] = useState(false);
  const [projectsExpanded, setProjectsExpanded] = useState(false);
  
  // Project menu state
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [hoveredProjectId, setHoveredProjectId] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [tempPinned, setTempPinned] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  
  // Check if we're on a project page
  const isProjectPage = location.pathname.startsWith('/project/');

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  // Keep sidebar open when pinned or temporarily pinned
  useEffect(() => {
    if (pinned || tempPinned) {
      setOpen(true);
    }
  }, [pinned, tempPinned]);

  // Handle dropdown state changes
  const handleDropdownOpenChange = (open: boolean) => {
    setDropdownOpen(open);
    if (open) {
      // Temporarily pin the sidebar when dropdown opens
      setTempPinned(true);
    } else {
      // Remove temporary pinning when dropdown closes
      setTempPinned(false);
      
      // State reconciliation: if sidebar should be closed (not hovered, not permanently pinned), close it
      if (!isHovered && !pinned) {
        setOpen(false);
      }
    }
  };

  // Set mounted state
  useEffect(() => {
    setMounted(true);
  }, []);
  
  // Fetch user projects and load them into app store
  useEffect(() => {
    const fetchProjects = async () => {
      const { projects: fetchedProjects, error } = await projectService.getUserProjects();
      if (!error && fetchedProjects) {
        // Convert to app store format
        const formattedProjects = fetchedProjects.map(project => ({
          id: project.id,
          name: project.name || project.title || 'Untitled Project',
          description: project.description || '',
          createdAt: new Date(project.created_at || Date.now()),
          updatedAt: new Date(project.updated_at || Date.now()),
          template: project.template_type || project.template || 'react-native',
          status: project.status || 'ready'
        }));
        setProjects(formattedProjects);
      }
    };
    
    if (user) {
      fetchProjects();
    }
  }, [user, setProjects]);

  // Project menu handlers
  const handleRenameProject = (project: any) => {
    setSelectedProject(project);
    setNewProjectName(project.name);
    setRenameDialogOpen(true);
  };

  const handleDeleteProject = (project: any) => {
    setSelectedProject(project);
    setDeleteDialogOpen(true);
  };

  const confirmRename = async () => {
    if (!selectedProject || !newProjectName.trim() || isUpdating) return;
    
    setIsUpdating(true);
    try {
      // Update in backend
      const { error } = await projectService.updateProject(selectedProject.id, {
        name: newProjectName.trim()
      });
      
      if (error) {
        console.error('Error renaming project:', error);
        return;
      }
      
      // Update in store
      updateProject(selectedProject.id, { name: newProjectName.trim() });
      
      setRenameDialogOpen(false);
      setSelectedProject(null);
      setNewProjectName('');
      
      // Reset sidebar state after rename
      setDropdownOpen(false);
      setTempPinned(false);
      setHoveredProjectId(null);
      
      // If sidebar should be closed (not permanently pinned), close it
      if (!pinned) {
        setOpen(false);
      }
    } catch (error) {
      console.error('Unexpected error renaming project:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  const confirmDelete = async () => {
    if (!selectedProject || isUpdating) return;
    
    setIsUpdating(true);
    try {
      // Delete from backend
      const { error } = await projectService.deleteProject(selectedProject.id);
      
      if (error) {
        console.error('Error deleting project:', error);
        return;
      }
      
      // Remove from store
      deleteProject(selectedProject.id);
      
      // If we're currently viewing this project, navigate away
      if (currentProject?.id === selectedProject.id) {
        navigate('/');
      }
      
      setDeleteDialogOpen(false);
      setSelectedProject(null);
      
      // Reset sidebar state after deletion
      setDropdownOpen(false);
      setTempPinned(false);
      setHoveredProjectId(null);
      
      // If sidebar should be closed (not permanently pinned), close it
      if (!pinned) {
        setOpen(false);
      }
    } catch (error) {
      console.error('Unexpected error deleting project:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  const animate = mounted;

  const isActive = (href: string) => {
    return location.pathname === href;
  };

  const links = [
    {
      label: "Create",
      href: "/",
      icon: isActive("/") ? (
        <IconSquareRoundedPlusFilled className="h-5 w-5 shrink-0" />
      ) : (
        <IconSquareRoundedPlus className="h-5 w-5 shrink-0" />
      ),
      isActive: isActive("/")
    },
  ];

  const logoutLink = {
    label: "Logout",
    href: "#",
    icon: (
      <IconArrowLeft className="h-5 w-5 shrink-0" />
    ),
    onClick: handleLogout,
    isActive: false
  };

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-transparent">
      {/* Navigation Bar */}
      <Navbar 
        className="h-14"
        onLogout={handleLogout}
        showDemoMenu={false}
        showProjectTitle={true}
      />

      {/* Main content area with padding for fixed header */}
      <div className="flex h-screen pt-14">
        {/* Sidebar */}
        <div
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <Sidebar 
            open={open} 
            setOpen={(newOpen) => {
              // Prevent closing when dropdown is open
              if (!newOpen && dropdownOpen) {
                return;
              }
              setOpen(newOpen);
            }} 
            pinned={pinned || tempPinned} 
            setPinned={setPinned} 
            animate={true}
          >
          <SidebarBody className="justify-between gap-10 overflow-hidden">
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Fixed top section - no scrolling */}
            <div className="mt-8 flex flex-col gap-2 flex-shrink-0">
              {links.map((link, idx) => (
                <SidebarLink key={idx} link={link} />
              ))}
              
              {/* My Projects button - fixed */}
              <button
                onClick={() => setProjectsExpanded(!projectsExpanded)}
                className={cn(
                  "flex items-center gap-2 py-2 rounded-xl text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-900 hover:text-neutral-900 dark:hover:text-white transition-colors group/sidebar relative",
                  "mx-1 px-3 flex-shrink-0"
                )}
              >
                {/* Outline for collapsed state when on project page */}
                {isProjectPage && !open && (
                  <motion.div 
                    className="absolute inset-y-0 rounded-xl border-2 border-neutral-300 dark:border-neutral-600"
                    initial={false}
                    animate={{
                      opacity: open ? 0 : 1,
                      left: "50%",
                      x: "-50%",
                      width: "40px"
                    }}
                    transition={{
                      duration: 0.2,
                      ease: "easeInOut"
                    }}
                  />
                )}
                <span className="flex-shrink-0 relative z-10">
                  <FolderOpen className="h-5 w-5" />
                </span>
                
                <motion.div
                  initial={{
                    opacity: open ? 1 : 0,
                    width: open ? "auto" : 0,
                  }}
                  animate={{
                    opacity: animate ? (open ? 1 : 0) : (open ? 1 : 0),
                    width: animate ? (open ? "auto" : 0) : (open ? "auto" : 0),
                  }}
                  transition={{
                    duration: animate ? 0.2 : 0,
                    ease: "easeInOut",
                    opacity: { duration: animate ? 0.15 : 0, delay: animate && open ? 0.05 : 0 }
                  }}
                  className="flex items-center justify-between overflow-hidden"
                  style={{ originX: 0 }}
                >
                  <span className="text-sm whitespace-nowrap pr-2">My Projects</span>
                  <motion.span
                    animate={{ rotate: projectsExpanded ? 90 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="ml-auto"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </motion.span>
                </motion.div>
              </button>
            </div>
            
            {/* Projects List - Only this section scrolls */}
            <AnimatePresence>
              {projectsExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ 
                    height: "auto", 
                    opacity: open ? 1 : 0,
                    marginLeft: open ? 28 : 0
                  }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ 
                    duration: 0.2,
                    ease: "easeInOut"
                  }}
                  className="flex flex-col overflow-hidden mt-2 flex-1 min-h-0"
                >
                  <div className="overflow-y-auto flex flex-col gap-1 min-h-0">
                    {projects.length > 0 ? (
                      projects.map((project) => (
                        <div
                          key={project.id}
                          className={cn(
                            "transition-colors py-1 px-3 rounded-xl relative flex items-center",
                            isProjectPage && currentProject?.id === project.id 
                              ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white"
                              : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-50 dark:hover:bg-neutral-900"
                          )}
                          onMouseEnter={() => setHoveredProjectId(project.id)}
                          onMouseLeave={() => setHoveredProjectId(null)}
                        >
                          <Link
                            to={`/project/${project.id}`}
                            className="flex-1 min-w-0 mr-2"
                          >
                            <motion.span
                              initial={{
                                opacity: open ? 1 : 0,
                                width: open ? "auto" : 0,
                              }}
                              animate={{
                                opacity: open ? 1 : 0,
                                width: open ? "auto" : 0,
                              }}
                              transition={{
                                duration: 0.2,
                                ease: "easeInOut",
                              }}
                              className="text-sm whitespace-nowrap overflow-hidden text-ellipsis block"
                              style={{ originX: 0 }}
                              title={project.name}
                            >
                              {project.name}
                            </motion.span>
                          </Link>
                          
                          {/* Menu button - only visible on hover and when sidebar is open */}
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ 
                              opacity: open && hoveredProjectId === project.id ? 1 : 0 
                            }}
                            transition={{ duration: 0.2 }}
                            className="flex-shrink-0"
                          >
                            <DropdownMenu onOpenChange={handleDropdownOpenChange}>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                                  onClick={(e) => e.preventDefault()}
                                >
                                  <MoreHorizontal className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-40">
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.preventDefault();
                                    handleRenameProject(project);
                                  }}
                                  className="cursor-pointer"
                                >
                                  <Edit className="mr-2 h-3 w-3" />
                                  Rename
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.preventDefault();
                                    handleDeleteProject(project);
                                  }}
                                  className="cursor-pointer text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
                                >
                                  <Trash2 className="mr-2 h-3 w-3" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </motion.div>
                        </div>
                      ))
                    ) : (
                      <motion.span
                        initial={{
                          opacity: open ? 1 : 0,
                          width: open ? "auto" : 0,
                        }}
                        animate={{
                          opacity: open ? 1 : 0,
                          width: open ? "auto" : 0,
                        }}
                        transition={{
                          duration: 0.2,
                          ease: "easeInOut",
                        }}
                        className="text-sm text-neutral-500 dark:text-neutral-500 py-1 px-2 whitespace-nowrap overflow-hidden block"
                        style={{ originX: 0 }}
                      >
                        No projects yet
                      </motion.span>
                    )}
                  </div>
                  <Link
                    to="/apps"
                    className="text-neutral-500 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors py-1 px-3 mt-1 flex-shrink-0"
                  >
                    <motion.span
                      initial={{
                        opacity: open ? 1 : 0,
                        width: open ? "auto" : 0,
                      }}
                      animate={{
                        opacity: open ? 1 : 0,
                        width: open ? "auto" : 0,
                      }}
                      transition={{
                        duration: 0.2,
                        ease: "easeInOut",
                      }}
                      className="text-xs whitespace-nowrap overflow-hidden block"
                      style={{ originX: 0 }}
                    >
                      View all projects →
                    </motion.span>
                  </Link>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setPinned(!pinned)}
              className={cn(
                "flex items-center gap-2 py-2 rounded-xl group/sidebar relative",
                "mx-1 px-3",
                "text-neutral-700 dark:text-neutral-200",
                "hover:bg-neutral-50 dark:hover:bg-neutral-900 hover:text-neutral-900 dark:hover:text-white transition-colors"
              )}
              title={pinned ? "Unpin sidebar" : "Pin sidebar"}
            >
              {pinned ? (
                <IconLayoutSidebarLeftExpandFilled className="h-5 w-5 shrink-0 relative z-10" />
              ) : (
                <IconLayoutSidebarLeftExpand className="h-5 w-5 shrink-0 relative z-10" />
              )}
            </button>
            <SidebarLink 
              link={{
                label: "Settings",
                href: "/settings",
                icon: (
                  <IconSettings className="h-5 w-5 shrink-0" />
                ),
                isActive: isActive("/settings")
              }}
            />
            <SidebarLink link={logoutLink} />
            {user && (
              <SidebarLink
                link={{
                  label: user.user_metadata?.first_name && user.user_metadata?.last_name
                    ? `${user.user_metadata.first_name} ${user.user_metadata.last_name}`
                    : user.user_metadata?.first_name
                    ? user.user_metadata.first_name
                    : user.email || "User",
                  href: "/profile",
                  icon: (
                    <div className="h-7 w-7 shrink-0 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 flex items-center justify-center">
                      <span className="text-white text-xs font-medium">
                        {user.user_metadata?.first_name && user.user_metadata?.last_name
                          ? `${user.user_metadata.first_name[0]}${user.user_metadata.last_name[0]}`.toUpperCase()
                          : user.user_metadata?.first_name
                          ? user.user_metadata.first_name[0].toUpperCase()
                          : user.email?.[0]?.toUpperCase() || "U"}
                      </span>
                    </div>
                  ),
                  isActive: isActive("/profile")
                }}
              />
            )}
          </div>
        </SidebarBody>
      </Sidebar>
      </div>
      
      {/* Spacer for sidebar */}
      <div className={cn(
        "hidden md:block transition-all duration-200 flex-shrink-0",
        open ? "w-[250px]" : "w-[60px]"
      )} />
      
      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden bg-transparent">
        <div className="flex h-full w-full flex-1 flex-col bg-transparent">
          <Outlet />
        </div>
      </div>
      </div>
      
      {/* Rename Project Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={(open) => {
        setRenameDialogOpen(open);
        if (!open) {
          // Reset sidebar state when dialog closes
          setDropdownOpen(false);
          setTempPinned(false);
          setHoveredProjectId(null);
          if (!pinned) {
            setOpen(false);
          }
        }
      }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Rename Project</DialogTitle>
            <DialogDescription>
              Enter a new name for your project "{selectedProject?.name}".
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="projectName" className="text-right">
                Name
              </Label>
              <Input
                id="projectName"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                className="col-span-3"
                placeholder="Enter project name..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isUpdating) {
                    confirmRename();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRenameDialogOpen(false)}
              disabled={isUpdating}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={confirmRename}
              disabled={!newProjectName.trim() || isUpdating}
            >
              {isUpdating ? "Renaming..." : "Rename"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Delete Project Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={(open) => {
        setDeleteDialogOpen(open);
        if (!open) {
          // Reset sidebar state when dialog closes
          setDropdownOpen(false);
          setTempPinned(false);
          setHoveredProjectId(null);
          if (!pinned) {
            setOpen(false);
          }
        }
      }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Delete Project</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{selectedProject?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isUpdating}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmDelete}
              disabled={isUpdating}
            >
              {isUpdating ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const Logo = () => {
  return (
    <a
      href="/"
      className="relative z-20 flex items-center space-x-2 py-1 text-sm font-normal text-black"
    >
      <span className="text-xl">✨</span>
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="font-medium whitespace-pre text-black dark:text-white"
      >
        Velocity
      </motion.span>
    </a>
  );
};

export const LogoIcon = () => {
  return (
    <a
      href="/"
      className="relative z-20 flex items-center space-x-2 py-1 text-sm font-normal text-black"
    >
      <span className="text-xl">✨</span>
    </a>
  );
};