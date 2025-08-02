import React, { useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation, Link } from "react-router-dom";
import { Sidebar, SidebarBody, SidebarLink } from "./ui/sidebar";
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
import { motion } from "motion/react";
import { useSidebar } from "./ui/sidebar";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import { Button } from "./ui/button";
import { useTheme } from "./theme-provider";
import { Sun, Moon, Menu, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";

export function AuthenticatedLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const { theme, setTheme } = useTheme();
  const [pinned, setPinned] = useState(false);
  const [open, setOpen] = useState(pinned);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

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

  const animate = mounted;

  const isActive = (href: string) => {
    return location.pathname === href;
  };

  const links = [
    {
      label: "Create",
      href: "/",
      icon: isActive("/") ? (
        <IconSquareRoundedPlusFilled className="h-5 w-5 shrink-0 text-neutral-700 dark:text-neutral-200" />
      ) : (
        <IconSquareRoundedPlus className="h-5 w-5 shrink-0 text-neutral-700 dark:text-neutral-200" />
      ),
    },
    {
      label: "Dashboard",
      href: "/dashboard",
      icon: isActive("/dashboard") ? (
        <IconLayoutDashboardFilled className="h-5 w-5 shrink-0 text-neutral-700 dark:text-neutral-200" />
      ) : (
        <IconLayoutDashboard className="h-5 w-5 shrink-0 text-neutral-700 dark:text-neutral-200" />
      ),
    },
    {
      label: "My Apps",
      href: "/apps",
      icon: isActive("/apps") ? (
        <IconAppsFilled className="h-5 w-5 shrink-0 text-neutral-700 dark:text-neutral-200" />
      ) : (
        <IconApps className="h-5 w-5 shrink-0 text-neutral-700 dark:text-neutral-200" />
      ),
    }
  ];

  const logoutLink = {
    label: "Logout",
    href: "#",
    icon: (
      <IconArrowLeft className="h-5 w-5 shrink-0 text-neutral-700 dark:text-neutral-200" />
    ),
    onClick: handleLogout,
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
          
          {/* Center Navigation Links - centered in full width */}
          <div className="hidden md:flex items-center gap-8 mx-auto">
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
          </div>
          
          {/* Right side controls - absolutely positioned */}
          <div className="absolute right-0 flex items-center gap-4 px-4">
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
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setPinned(!pinned)}
              className={cn(
                "flex items-center justify-start gap-2 py-2 px-0 group/sidebar",
                "text-neutral-700 dark:text-neutral-200",
                "hover:text-neutral-900 dark:hover:text-white transition-colors"
              )}
              title={pinned ? "Unpin sidebar" : "Pin sidebar"}
            >
              {pinned ? (
                <IconLayoutSidebarLeftExpandFilled className="h-5 w-5 shrink-0" />
              ) : (
                <IconLayoutSidebarLeftExpand className="h-5 w-5 shrink-0" />
              )}
            </button>
            <SidebarLink 
              link={{
                label: "Settings",
                href: "/settings",
                icon: (
                  <IconSettings className="h-5 w-5 shrink-0 text-neutral-700 dark:text-neutral-200" />
                ),
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