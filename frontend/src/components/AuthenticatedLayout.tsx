import React, { useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation, Link } from "react-router-dom";
import { Sidebar, SidebarBody, SidebarLink } from "./ui/sidebar";
import { projectService } from "@/services/projectService";
import {
  IconArrowLeft,
  IconSettings,
  IconLayoutDashboard,
  IconLayoutDashboardFilled,
  IconLayoutSidebarLeftExpand,
  IconLayoutSidebarLeftExpandFilled,
  IconSquareRoundedPlus,
  IconSquareRoundedPlusFilled,
} from "@tabler/icons-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import { useAppStore } from "@/stores/useAppStore";
import { ChevronRight, FolderOpen } from "lucide-react";
import { Navbar } from "./navigation";

export function AuthenticatedLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const { currentProject, projects, setProjects } = useAppStore();
  const [pinned, setPinned] = useState(false);
  const [open, setOpen] = useState(pinned);
  const [mounted, setMounted] = useState(false);
  const [projectsExpanded, setProjectsExpanded] = useState(false);
  
  // Check if we're on a project page
  const isProjectPage = location.pathname.startsWith('/project/');

  const handleLogout = async () => {
    await logout();
    navigate("/");
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
      <Navbar 
        className="h-14"
        onLogout={handleLogout}
        showDemoMenu={false}
        showProjectTitle={true}
      />

      {/* Main content area with padding for fixed header */}
      <div className="flex h-screen pt-14">
        {/* Sidebar */}
        <Sidebar open={open} setOpen={setOpen} pinned={pinned} setPinned={setPinned} animate={true}>
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
                            className="text-sm whitespace-nowrap overflow-hidden text-ellipsis block"
                            style={{ originX: 0 }}
                            title={project.name}
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