import React, { useState, useEffect, useRef } from "react";
import { Outlet, useNavigate, useLocation, Link } from "react-router-dom";
import { Sidebar, SidebarBody, SidebarLink } from "./ui/sidebar";
import { projectService } from "@/services/projectService";
import {
  IconArrowLeft,
  IconBrandTabler,
  IconSettings,
  IconUserBolt,
  IconApps,
  IconAppsFilled,
  IconHistory,
  IconBrandCodepen,
  IconHome,
  IconLayoutDashboard,
  IconLayoutDashboardFilled,
  IconPin,
  IconPinFilled,
  IconLayoutSidebarLeftExpand,
  IconLayoutSidebarLeftExpandFilled,
  IconSquareRoundedPlus,
  IconSquareRoundedPlusFilled,
} from "@tabler/icons-react";
import { motion, AnimatePresence } from "motion/react";
import { useSidebar } from "./ui/sidebar";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import { useAppStore } from "@/stores/useAppStore";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { useTheme } from "./theme-provider";
import { Sun, Moon, Menu, X, Edit, ChevronDown, ChevronRight, FolderOpen, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./ui/popover";

export function AuthenticatedLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const { currentProject, setCurrentProject } = useAppStore();
  const { theme, setTheme } = useTheme();
  const [pinned, setPinned] = useState(false);
  const [open, setOpen] = useState(pinned);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [userProjects, setUserProjects] = useState<any[]>([]);
  const [projectsExpanded, setProjectsExpanded] = useState(false);
  const [isEditingProjectName, setIsEditingProjectName] = useState(false);
  const [projectNameInput, setProjectNameInput] = useState("");
  const [isSavingProjectName, setIsSavingProjectName] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Check if we're on a project page
  const isProjectPage = location.pathname.startsWith('/project/');

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const handleProjectNameSave = async () => {
    if (!currentProject || !projectNameInput.trim() || projectNameInput === currentProject.name) {
      setIsEditingProjectName(false);
      return;
    }

    setIsSavingProjectName(true);
    try {
      const { project, error } = await projectService.updateProject(currentProject.id, {
        name: projectNameInput.trim()
      });

      if (!error && project) {
        setCurrentProject(project);
        // Update the project in userProjects list
        setUserProjects(prev => 
          prev.map(p => p.id === project.id ? project : p)
        );
      }
    } catch (error) {
      console.error('Error updating project name:', error);
    } finally {
      setIsSavingProjectName(false);
      setIsEditingProjectName(false);
    }
  };

  const handleProjectNameEdit = () => {
    if (currentProject) {
      setProjectNameInput(currentProject.name);
      setIsEditingProjectName(true);
      // Focus input and set cursor at end after popover opens
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          // Set cursor position at the end of the text
          const length = inputRef.current.value.length;
          inputRef.current.setSelectionRange(length, length);
        }
      }, 100);
    }
  };

  // Keep sidebar open when pinned
  useEffect(() => {
    if (pinned) {
      setOpen(true);
    }
  }, [pinned]);

  // Set mounted state
  useEffect(() => {
    setMounted(true);
  }, []);
  
  // Fetch user projects
  useEffect(() => {
    const fetchProjects = async () => {
      const { projects, error } = await projectService.getUserProjects();
      if (!error && projects) {
        setUserProjects(projects);
      }
    };
    
    if (user) {
      fetchProjects();
    }
  }, [user]);

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
    {
      label: "Dashboard",
      href: "/dashboard",
      icon: isActive("/dashboard") ? (
        <IconLayoutDashboardFilled className="h-5 w-5 shrink-0" />
      ) : (
        <IconLayoutDashboard className="h-5 w-5 shrink-0" />
      ),
      isActive: isActive("/dashboard")
    }
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
      <header className="fixed top-0 left-0 right-0 z-[100] h-16">
        <nav className="w-full h-full flex items-center relative">
          {/* Logo section - absolutely positioned */}
          <div className={cn(
            "absolute left-0 h-16 px-4 flex items-center transition-all duration-200",
            open ? "w-[250px]" : "w-auto"
          )}>
            <Link to="/" className="flex items-center gap-2 font-semibold text-lg [text-shadow:_0_1px_2px_rgb(0_0_0_/_20%)]">
              <span className="text-xl drop-shadow-sm">✨</span>
              <span className="text-foreground">Velocity</span>
            </Link>
          </div>
          
          {/* Center Content - Show project title on project pages, navigation links on non-project pages */}
          <div className="hidden md:flex items-center gap-8 mx-auto">
            {isProjectPage && currentProject ? (
              <Popover open={isEditingProjectName} onOpenChange={setIsEditingProjectName}>
                <PopoverTrigger asChild>
                  <button 
                    onClick={handleProjectNameEdit}
                    className="group text-center cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg px-3 py-1 transition-colors flex items-center gap-2"
                  >
                    <h1 className="text-lg font-semibold text-foreground">{currentProject.name}</h1>
                    <Edit className="w-4 h-4 opacity-0 group-hover:opacity-60 transition-opacity" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 px-3 pt-1">
                  <div className="space-y-1">
                    <Label htmlFor="project-name" className="text-xs text-muted-foreground">Project title</Label>
                    <div className="flex gap-1.5 items-center">
                      <Input
                        id="project-name"
                        ref={inputRef}
                        value={projectNameInput}
                        onChange={(e) => setProjectNameInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleProjectNameSave();
                          } else if (e.key === 'Escape') {
                            setIsEditingProjectName(false);
                          }
                        }}
                        placeholder="Enter project name"
                        className="flex-1 bg-background h-8 text-sm"
                        disabled={isSavingProjectName}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={handleProjectNameSave}
                        disabled={isSavingProjectName || !projectNameInput.trim() || projectNameInput === currentProject.name}
                        className="h-8 w-8"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            ) : !isProjectPage ? (
              <>
                <span className="text-sm font-medium text-foreground/40 cursor-not-allowed transition-all duration-200 hover:text-foreground/60">
                  Features
                </span>
                <span className="text-sm font-medium text-foreground/40 cursor-not-allowed transition-all duration-200 hover:text-foreground/60">
                  Learn
                </span>
                <span className="text-sm font-medium text-foreground/40 cursor-not-allowed transition-all duration-200 hover:text-foreground/60">
                  Pricing
                </span>
                <span className="text-sm font-medium text-foreground/40 cursor-not-allowed transition-all duration-200 hover:text-foreground/60">
                  Enterprise
                </span>
              </>
            ) : null}
          </div>
          
          {/* Right side controls - absolutely positioned */}
          <div className="absolute right-0 flex items-center gap-4 px-4">
            {/* Open Editor Button - only show on project pages */}
            {isProjectPage && currentProject && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/editor/${currentProject.id}`)}
                className="hidden md:flex gap-2"
              >
                <Edit className="w-4 h-4" />
                Open Editor
              </Button>
            )}
            
            {/* Theme Toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              className="relative hover:bg-background/20 [&_svg]:drop-shadow-sm"
              aria-label="Toggle theme"
            >
              <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            </Button>
          </div>
        </nav>
      </header>

      {/* Main content area with padding for fixed header */}
      <div className="flex h-screen pt-16">
        {/* Sidebar */}
        <Sidebar open={open} setOpen={setOpen} pinned={pinned} setPinned={setPinned} animate={true}>
          <SidebarBody className="justify-between gap-10">
          <div className="flex flex-1 flex-col overflow-x-hidden overflow-y-auto">
            <div className="mt-8 flex flex-col gap-2">
              {links.map((link, idx) => (
                <SidebarLink key={idx} link={link} />
              ))}
              
              {/* My Projects Dropdown */}
              <div className="flex flex-col">
                <button
                  onClick={() => setProjectsExpanded(!projectsExpanded)}
                  className={cn(
                    "flex items-center gap-2 py-2 rounded-xl text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-900 hover:text-neutral-900 dark:hover:text-white transition-colors group/sidebar relative",
                    "mx-1 px-3"
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
                
                {/* Projects List */}
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
                      className="flex flex-col gap-1 overflow-hidden mt-2"
                    >
                      {userProjects.length > 0 ? (
                        userProjects.map((project) => (
                          <Link
                            key={project.id}
                            to={`/project/${project.id}`}
                            className={cn(
                              "transition-colors py-1 px-3 rounded-xl block relative",
                              isProjectPage && currentProject?.id === project.id 
                                ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white"
                                : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-50 dark:hover:bg-neutral-900"
                            )}
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
                              className="text-sm whitespace-nowrap overflow-hidden block"
                              style={{ originX: 0 }}
                            >
                              {project.name}
                            </motion.span>
                          </Link>
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
                      <Link
                        to="/apps"
                        className="text-neutral-500 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors py-1 px-3 mt-1"
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
            </div>
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