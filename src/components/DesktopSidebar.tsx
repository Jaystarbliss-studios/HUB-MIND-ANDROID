import React, { useState, useRef, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LogOut, 
  Settings, 
  Pin, 
  PinOff,
  ChevronRight,
  LucideIcon
} from 'lucide-react';
import { User } from '../types';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface NavItemDef {
  to: string;
  label: string;
  icon: LucideIcon;
}

interface DesktopSidebarProps {
  navItems: NavItemDef[];
  profile: User | null;
  unprocessedCount: number;
  onLogout: () => void;
  onOpenProfile?: () => void;
}

const PIN_STORAGE_KEY = 'hubmind_sidebar_pinned_v1';

export const DesktopSidebar: React.FC<DesktopSidebarProps> = ({
  navItems,
  profile,
  unprocessedCount,
  onLogout,
  onOpenProfile,
}) => {
  const [isPinned, setIsPinned] = useState<boolean>(() => {
    try {
      return localStorage.getItem(PIN_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [isHovered, setIsHovered] = useState<boolean>(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isExpanded = isPinned || isHovered;

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(true);
    }, 50);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(false);
    }, 120);
  };

  const togglePin = () => {
    const next = !isPinned;
    setIsPinned(next);
    try {
      localStorage.setItem(PIN_STORAGE_KEY, String(next));
    } catch {}
  };

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  return (
    <>
      {/* Fixed Layout Anchor / Gutter Placeholder
          This ensures the main dashboard content NEVER experiences layout shifts or reflows */}
      <div 
        className={cn(
          "hidden md:block shrink-0 transition-[width] duration-200 ease-out print:hidden",
          isPinned ? "w-64" : "w-[72px]"
        )}
      />

      {/* Floating Animated Framer Motion Sidebar Container */}
      <motion.aside
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        initial={false}
        animate={{
          width: isExpanded ? 260 : 72,
        }}
        transition={{
          type: "spring",
          stiffness: 380,
          damping: 30,
          mass: 0.8,
        }}
        className={cn(
          "hidden md:flex flex-col fixed top-0 bottom-0 left-0 bg-slate-900/95 backdrop-blur-md border-r border-slate-800 z-40 print:hidden select-none overflow-hidden",
          isExpanded 
            ? "shadow-2xl shadow-black/70 border-slate-700/80" 
            : "shadow-md shadow-black/30"
        )}
      >
        {/* Brand / Logo Header */}
        <div className="h-16 px-4 flex items-center justify-between border-b border-slate-800/80 shrink-0">
          <div className="flex items-center gap-3 overflow-hidden">
            <img
              src="/hub-mind%20logo.png"
              alt="Hub-Mind"
              className="w-10 h-10 rounded-xl object-contain shrink-0"
              width={40}
              height={40}
            />

            <AnimatePresence initial={false}>
              {isExpanded && (
                <motion.div
                  initial={{ opacity: 0, x: -10, filter: "blur(2px)" }}
                  animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, x: -10, filter: "blur(2px)" }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="flex flex-col min-w-0 whitespace-nowrap"
                >
                  <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-1.5 leading-tight">
                    Hub-Mind
                    <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.2 bg-teal-500/20 text-teal-300 rounded border border-teal-500/30">
                      2.0
                    </span>
                  </h1>
                  <span className="text-[11px] text-slate-400 font-medium">Workspace Engine</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Pin / Collapse Toggle button when expanded */}
          <AnimatePresence>
            {isExpanded && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.12 }}
                onClick={togglePin}
                title={isPinned ? "Unpin sidebar (auto-collapse)" : "Pin sidebar open"}
                className={cn(
                  "p-1.5 rounded-lg text-slate-400 hover:text-slate-200 transition-colors shrink-0",
                  isPinned ? "bg-teal-500/15 text-teal-300 border border-teal-500/30" : "hover:bg-slate-800"
                )}
              >
                {isPinned ? (
                  <Pin className="w-4 h-4 text-teal-400 fill-teal-400/20 rotate-45" />
                ) : (
                  <PinOff className="w-4 h-4 text-slate-400 hover:text-slate-200" />
                )}
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* Navigation Items List */}
        <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto overflow-x-hidden no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isInbox = item.to === '/inbox';
            const hasInboxBadge = isInbox && unprocessedCount > 0;

            return (
              <NavLink
                key={item.to}
                to={item.to}
                title={!isExpanded ? item.label : undefined}
                className={({ isActive }) => cn(
                  "flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm font-medium transition-all duration-150 group relative h-9",
                  isActive
                    ? "bg-slate-800 text-teal-300 font-semibold shadow-xs border border-teal-500/20"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 active:scale-[0.98]"
                )}
              >
                <div className="relative flex items-center justify-center shrink-0 w-5 h-5">
                  <Icon className="w-4 h-4 transition-transform duration-150 group-hover:scale-105" />
                  
                  {/* Floating unread dot when collapsed */}
                  {!isExpanded && hasInboxBadge && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-teal-400 rounded-full border-2 border-slate-900 animate-pulse" />
                  )}
                </div>

                {/* Text Label & Badge with smooth expansion */}
                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -8 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      className="flex items-center justify-between flex-1 min-w-0 overflow-hidden whitespace-nowrap"
                    >
                      <span className="truncate text-xs font-medium tracking-tight">
                        {item.label}
                      </span>
                      {hasInboxBadge && (
                        <span className="ml-auto text-[10px] font-bold text-teal-300 bg-teal-500/20 border border-teal-500/30 px-1.5 py-0.2 rounded-full">
                          {unprocessedCount}
                        </span>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </NavLink>
            );
          })}

          {/* Admin Centre Link */}
          {profile?.role === 'admin' && (
            <NavLink
              to="/admin"
              title={!isExpanded ? "Admin Centre" : undefined}
              className={({ isActive }) => cn(
                "flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm font-medium transition-all duration-150 group relative h-9",
                isActive
                  ? "bg-slate-800 text-teal-300 font-semibold shadow-xs border border-teal-500/20"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 active:scale-[0.98]"
              )}
            >
              <div className="relative flex items-center justify-center shrink-0 w-5 h-5">
                <Settings className="w-4 h-4 text-teal-400 transition-transform duration-150 group-hover:rotate-45" />
              </div>

              <AnimatePresence initial={false}>
                {isExpanded && (
                  <motion.div
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    className="flex items-center justify-between flex-1 min-w-0 overflow-hidden whitespace-nowrap"
                  >
                    <span className="truncate text-xs font-medium tracking-tight">
                      Admin Centre
                    </span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold uppercase">
                      Admin
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </NavLink>
          )}
        </nav>

        {/* User Profile & Sign Out Footer */}
        <div className="p-2.5 border-t border-slate-800/80 bg-slate-950/40 shrink-0">
          <button
            type="button"
            onClick={onOpenProfile}
            title="Edit Profile, Google Picture & Username (@handle)"
            className="flex items-center gap-2.5 w-full p-1.5 rounded-xl hover:bg-slate-800/80 border border-transparent hover:border-slate-700/60 transition-all text-left group cursor-pointer"
          >
            {profile?.photoUrl ? (
              <img
                src={profile.photoUrl}
                alt={profile.displayName || "User"}
                className="w-9 h-9 rounded-xl object-cover border border-slate-700 shrink-0 group-hover:border-teal-400/50 transition-colors"
              />
            ) : (
              <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-semibold text-white text-xs shrink-0 bg-gradient-to-br from-teal-500/30 to-slate-900 group-hover:border-teal-400/50 transition-colors">
                {profile?.displayName?.charAt(0) || profile?.name?.charAt(0) || profile?.username?.charAt(0)?.toUpperCase() || '?'}
              </div>
            )}

            <AnimatePresence initial={false}>
              {isExpanded && (
                <motion.div
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="flex flex-col min-w-0 overflow-hidden whitespace-nowrap flex-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white truncate group-hover:text-teal-300 transition-colors">
                      {profile?.displayName || profile?.name || 'Workspace User'}
                    </span>
                    <span className="text-[10px] text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
                      Edit
                    </span>
                  </div>
                  <span className="text-[11px] text-teal-400 font-mono truncate">
                    @{profile?.username || 'user'}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </button>

          <AnimatePresence initial={false}>
            {isExpanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden"
              >
                <button
                  onClick={onLogout}
                  className="mt-2 flex w-full items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all duration-150 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.aside>
    </>
  );
};
