import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, limit, query } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '../lib/auth';
import { flushOfflineQueue, getOfflineActionQueue } from '../lib/offlineQueue';
import {
  Search,
  CheckSquare,
  Calendar,
  Folder,
  FileText,
  Briefcase,
  Inbox,
  LayoutDashboard,
  Users,
  Book,
  Brain,
  Clock3,
  Shield,
  Plus,
  RefreshCw,
  X,
  ArrowRight,
  CornerDownLeft,
  Command as CommandIcon,
  Mic,
  Zap,
  Building,
  AtSign,
  CalendarDays,
  CheckCircle2,
  ListTodo
} from 'lucide-react';

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenQuickCapture?: () => void;
}

interface PaletteItem {
  id: string;
  title: string;
  subtitle?: string;
  category: 'navigation' | 'action' | 'task' | 'document' | 'project' | 'client' | 'person' | 'meeting';
  icon: React.ComponentType<{ className?: string }>;
  iconColor?: string;
  badge?: string;
  shortcut?: string;
  url?: string;
  action?: () => void | Promise<void>;
  status?: string;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onOpenQuickCapture
}) => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [queryText, setQueryText] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'apps' | 'actions' | 'tasks' | 'docs' | 'projects' | 'people' | 'colleagues'>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [workspaceItems, setWorkspaceItems] = useState<PaletteItem[]>([]);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [syncStatusNotice, setSyncStatusNotice] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);

  // App Navigation Definitions
  const navigationItems: PaletteItem[] = useMemo(() => [
    {
      id: 'nav-today',
      title: 'Today Dashboard',
      subtitle: 'Daily overview, quick stats & focus agenda',
      category: 'navigation',
      icon: LayoutDashboard,
      iconColor: 'text-indigo-400',
      shortcut: 'G H',
      url: '/',
    },
    {
      id: 'nav-tasks',
      title: 'Tasks',
      subtitle: 'Workspace task boards, kanban & assignments',
      category: 'navigation',
      icon: CheckSquare,
      iconColor: 'text-teal-400',
      shortcut: 'G T',
      url: '/tasks',
    },
    {
      id: 'nav-calendar',
      title: 'Calendar & Schedule',
      subtitle: 'Meetings, agenda events & deadlines',
      category: 'navigation',
      icon: Calendar,
      iconColor: 'text-amber-400',
      shortcut: 'G C',
      url: '/calendar',
    },
    {
      id: 'nav-documents',
      title: 'Documents & Notes',
      subtitle: 'Collaborative docs, rich editor & versions',
      category: 'navigation',
      icon: Folder,
      iconColor: 'text-blue-400',
      shortcut: 'G D',
      url: '/documents',
    },
    {
      id: 'nav-projects',
      title: 'Projects',
      subtitle: 'Client projects, milestones & roadmaps',
      category: 'navigation',
      icon: Briefcase,
      iconColor: 'text-emerald-400',
      shortcut: 'G P',
      url: '/projects',
    },
    {
      id: 'nav-inbox',
      title: 'Inbox & Captures',
      subtitle: 'Triage unprocessed ideas, voice memos & notes',
      category: 'navigation',
      icon: Inbox,
      iconColor: 'text-purple-400',
      shortcut: 'G I',
      url: '/inbox',
    },
    {
      id: 'nav-colleagues',
      title: 'Colleagues Directory',
      subtitle: 'Team members, @usernames & network connections',
      category: 'navigation',
      icon: Users,
      iconColor: 'text-cyan-400',
      shortcut: 'G U',
      url: '/colleagues',
    },
    {
      id: 'nav-clients',
      title: 'Clients & CRM',
      subtitle: 'Client accounts, companies & contacts',
      category: 'navigation',
      icon: Book,
      iconColor: 'text-pink-400',
      shortcut: 'G K',
      url: '/clients',
    },
    {
      id: 'nav-knowledge',
      title: 'Knowledge Base',
      subtitle: 'Studio documentation & organizational memory',
      category: 'navigation',
      icon: Brain,
      iconColor: 'text-rose-400',
      shortcut: 'G B',
      url: '/knowledge',
    },
    {
      id: 'nav-followups',
      title: 'Follow-ups & Reminders',
      subtitle: 'Scheduled follow-up items and client checks',
      category: 'navigation',
      icon: Clock3,
      iconColor: 'text-orange-400',
      shortcut: 'G F',
      url: '/follow-ups',
    },
    ...(profile?.role === 'admin'
      ? [
          {
            id: 'nav-admin',
            title: 'Admin Centre',
            subtitle: 'User management, invites, RBAC & system audit logs',
            category: 'navigation' as const,
            icon: Shield,
            iconColor: 'text-amber-500',
            shortcut: 'G A',
            url: '/admin',
          },
        ]
      : []),
  ], [profile]);

  // Common Quick Actions
  const actionItems: PaletteItem[] = useMemo(() => [
    {
      id: 'act-new-task',
      title: 'Create New Task',
      subtitle: 'Quickly draft a new workspace task with priority & deadline',
      category: 'action',
      icon: Plus,
      iconColor: 'text-teal-400',
      badge: 'Action',
      action: () => {
        onClose();
        navigate('/tasks?create=true');
      },
    },
    {
      id: 'act-new-doc',
      title: 'Create New Document',
      subtitle: 'Open rich WPS-style document editor for a new file',
      category: 'action',
      icon: FileText,
      iconColor: 'text-blue-400',
      badge: 'Action',
      action: () => {
        onClose();
        navigate('/documents?new=true');
      },
    },
    {
      id: 'act-schedule-meeting',
      title: 'Schedule Meeting',
      subtitle: 'Add a new calendar appointment or sync with Google Meet',
      category: 'action',
      icon: CalendarDays,
      iconColor: 'text-amber-400',
      badge: 'Action',
      action: () => {
        onClose();
        navigate('/calendar?new=true');
      },
    },
    {
      id: 'act-quick-capture',
      title: 'Quick Capture to Inbox',
      subtitle: 'Save a rapid thought, link, or note to your inbox queue',
      category: 'action',
      icon: Zap,
      iconColor: 'text-purple-400',
      badge: 'Action',
      action: () => {
        onClose();
        if (onOpenQuickCapture) {
          onOpenQuickCapture();
        } else {
          navigate('/inbox');
        }
      },
    },
    {
      id: 'act-new-project',
      title: 'Start New Project',
      subtitle: 'Initialize a new project workspace with client & timeline',
      category: 'action',
      icon: Briefcase,
      iconColor: 'text-emerald-400',
      badge: 'Action',
      action: () => {
        onClose();
        navigate('/projects?new=true');
      },
    },
    {
      id: 'act-talk-jess',
      title: 'Talk to Jess AI Assistant',
      subtitle: 'Open voice & multimodal AI copilot to manage workspace',
      category: 'action',
      icon: Mic,
      iconColor: 'text-indigo-400',
      badge: 'Jess AI',
      action: () => {
        onClose();
        window.dispatchEvent(new CustomEvent('hubmind:open-jess'));
      },
    },
    {
      id: 'act-sync-offline',
      title: 'Sync Offline Queue Now',
      subtitle: 'Flush all pending offline changes & local storage records',
      category: 'action',
      icon: RefreshCw,
      iconColor: 'text-cyan-400',
      badge: 'Sync',
      action: async () => {
        setSyncStatusNotice('Flushing offline queue...');
        const res = await flushOfflineQueue();
        setSyncStatusNotice(`Synced ${res.synced} items (${res.remaining} remaining)`);
        setTimeout(() => {
          setSyncStatusNotice(null);
          onClose();
        }, 1200);
      },
    },
    ...(profile?.role === 'admin'
      ? [
          {
            id: 'act-invite-user',
            title: 'Invite Team Member',
            subtitle: 'Send onboarding invite with role & @username assignment',
            category: 'action' as const,
            icon: Users,
            iconColor: 'text-amber-400',
            badge: 'Admin',
            action: () => {
              onClose();
              navigate('/admin?tab=invite');
            },
          },
        ]
      : []),
  ], [navigate, onClose, onOpenQuickCapture, profile]);

  // Load searchable items from Firestore when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 40);
      fetchWorkspaceData();
    } else {
      setQueryText('');
      setSelectedIndex(0);
      setSyncStatusNotice(null);
    }
  }, [isOpen]);

  const fetchWorkspaceData = async () => {
    setLoadingWorkspace(true);
    try {
      const [tasksSnap, docsSnap, projSnap, clientsSnap, usersSnap, meetingsSnap] = await Promise.all([
        getDocs(query(collection(db, 'tasks'), limit(50))),
        getDocs(query(collection(db, 'documents'), limit(50))),
        getDocs(query(collection(db, 'projects'), limit(40))),
        getDocs(query(collection(db, 'clients'), limit(40))),
        getDocs(query(collection(db, 'users'), limit(50))),
        getDocs(query(collection(db, 'meetings'), limit(40))),
      ]);

      const fetched: PaletteItem[] = [];

      tasksSnap.docs.forEach((d) => {
        const data = d.data();
        fetched.push({
          id: `task-${d.id}`,
          title: data.title || 'Untitled Task',
          subtitle: data.description ? data.description.substring(0, 70) : `Priority: ${data.priority || 'medium'} • Status: ${data.status || 'pending'}`,
          category: 'task',
          icon: CheckSquare,
          iconColor: 'text-teal-400',
          badge: data.priority ? `${data.priority}` : 'Task',
          status: data.status,
          url: `/tasks/${d.id}`,
        });
      });

      docsSnap.docs.forEach((d) => {
        const data = d.data();
        fetched.push({
          id: `doc-${d.id}`,
          title: data.title || 'Untitled Document',
          subtitle: data.category ? `Category: ${data.category}` : 'Document',
          category: 'document',
          icon: FileText,
          iconColor: 'text-blue-400',
          badge: data.type || 'Doc',
          url: `/documents`,
        });
      });

      projSnap.docs.forEach((d) => {
        const data = d.data();
        fetched.push({
          id: `proj-${d.id}`,
          title: data.name || 'Untitled Project',
          subtitle: data.description || 'Project Workspace',
          category: 'project',
          icon: Briefcase,
          iconColor: 'text-emerald-400',
          badge: data.status || 'Project',
          url: `/projects/${d.id}`,
        });
      });

      clientsSnap.docs.forEach((d) => {
        const data = d.data();
        fetched.push({
          id: `client-${d.id}`,
          title: data.name || 'Untitled Client',
          subtitle: data.email || data.company || 'Client Profile',
          category: 'client',
          icon: Building,
          iconColor: 'text-pink-400',
          badge: 'Client',
          url: `/clients`,
        });
      });

      usersSnap.docs.forEach((d) => {
        const data = d.data();
        fetched.push({
          id: `user-${d.id}`,
          title: data.displayName || data.name || data.username || 'Workspace User',
          subtitle: `@${data.username || ''} • ${data.email || ''}`,
          category: 'person',
          icon: AtSign,
          iconColor: 'text-cyan-400',
          badge: data.role || 'Member',
          url: `/colleagues`,
        });
      });

      meetingsSnap.docs.forEach((d) => {
        const data = d.data();
        fetched.push({
          id: `meeting-${d.id}`,
          title: data.title || 'Workspace Meeting',
          subtitle: data.date ? `${data.date} at ${data.startTime || 'Scheduled'}` : 'Calendar Event',
          category: 'meeting',
          icon: CalendarDays,
          iconColor: 'text-amber-400',
          badge: 'Event',
          url: `/calendar`,
        });
      });

      setWorkspaceItems(fetched);
    } catch (err) {
      console.warn('[CommandPalette] Workspace fetch warning:', err);
    } finally {
      setLoadingWorkspace(false);
    }
  };

  // Filter and rank items based on search query and category filter
  const filteredList = useMemo(() => {
    let combined: PaletteItem[] = [];

    if (selectedFilter === 'apps') {
      combined = [...navigationItems];
    } else if (selectedFilter === 'actions') {
      combined = [...actionItems];
    } else if (selectedFilter === 'tasks') {
      combined = workspaceItems.filter((i) => i.category === 'task');
    } else if (selectedFilter === 'docs') {
      combined = workspaceItems.filter((i) => i.category === 'document');
    } else if (selectedFilter === 'projects') {
      combined = workspaceItems.filter((i) => i.category === 'project');
    } else if (selectedFilter === 'people' || selectedFilter === 'colleagues') {
      combined = workspaceItems.filter((i) => i.category === 'person');
    } else {
      // 'all'
      combined = [...navigationItems, ...actionItems, ...workspaceItems];
    }

    const cleanQuery = queryText.trim().toLowerCase();
    if (!cleanQuery) {
      return combined;
    }

    return combined.filter((item) => {
      const matchTitle = item.title.toLowerCase().includes(cleanQuery);
      const matchSub = item.subtitle ? item.subtitle.toLowerCase().includes(cleanQuery) : false;
      const matchBadge = item.badge ? item.badge.toLowerCase().includes(cleanQuery) : false;
      const matchShortcut = item.shortcut ? item.shortcut.toLowerCase().includes(cleanQuery) : false;
      return matchTitle || matchSub || matchBadge || matchShortcut;
    });
  }, [selectedFilter, navigationItems, actionItems, workspaceItems, queryText]);

  // Adjust selected index when list changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [queryText, selectedFilter]);

  // Scroll active item into view
  useEffect(() => {
    if (listContainerRef.current) {
      const activeEl = listContainerRef.current.querySelector('[data-active="true"]');
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  const handleSelectItem = (item: PaletteItem) => {
    if (item.action) {
      item.action();
    } else if (item.url) {
      onClose();
      navigate(item.url);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < filteredList.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : Math.max(0, filteredList.length - 1)));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredList[selectedIndex]) {
        handleSelectItem(filteredList[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-14 md:pt-20 px-3 sm:px-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl shadow-cyan-950/20 overflow-hidden flex flex-col max-h-[82vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Header Input */}
        <div className="flex items-center px-4 py-3.5 border-b border-slate-800 bg-slate-950/80 gap-3">
          <div className="p-1.5 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20 shrink-0">
            <CommandIcon className="w-4 h-4" />
          </div>
          <input
            ref={inputRef}
            type="text"
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command, navigate to an app, or search workspace..."
            className="w-full bg-transparent text-slate-100 placeholder-slate-500 focus:outline-none text-base font-normal tracking-wide"
          />
          {queryText && (
            <button
              onClick={() => setQueryText('')}
              className="p-1 text-slate-500 hover:text-slate-300 rounded transition-colors"
              title="Clear input"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center gap-1 text-[11px] font-mono text-slate-400 bg-slate-800/90 border border-slate-700 px-2 py-0.5 rounded shadow-sm">
            ESC
          </kbd>
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-900/95 border-b border-slate-800/80 text-xs overflow-x-auto no-scrollbar">
          {[
            { id: 'all', label: 'All' },
            { id: 'apps', label: 'Apps & Views', icon: LayoutDashboard },
            { id: 'actions', label: 'Actions', icon: Zap },
            { id: 'tasks', label: 'Tasks', icon: CheckSquare },
            { id: 'docs', label: 'Documents', icon: FileText },
            { id: 'projects', label: 'Projects', icon: Briefcase },
            { id: 'colleagues', label: 'Colleagues', icon: Users },
          ].map((tab) => {
            const isSelected = selectedFilter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSelectedFilter(tab.id as any)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium text-xs whitespace-nowrap transition-all ${
                  isSelected
                    ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40 shadow-sm shadow-teal-500/10'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                {tab.icon && <tab.icon className="w-3 h-3" />}
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Sync Notice if active */}
        {syncStatusNotice && (
          <div className="px-4 py-2 bg-teal-950/50 border-b border-teal-800/50 text-xs text-teal-300 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <RefreshCw className="w-3 h-3 animate-spin" />
              {syncStatusNotice}
            </span>
          </div>
        )}

        {/* Results / Commands List */}
        <div
          ref={listContainerRef}
          className="flex-1 overflow-y-auto p-2 divide-y divide-slate-800/30 min-h-[220px]"
        >
          {filteredList.length === 0 ? (
            <div className="py-14 text-center text-slate-500 text-sm flex flex-col items-center justify-center gap-2">
              <Search className="w-8 h-8 text-slate-600 stroke-1" />
              <p className="font-medium text-slate-400">No matching commands or resources</p>
              <p className="text-xs text-slate-600">Try searching for Tasks, Calendar, Documents, or quick actions like "Create Task"</p>
            </div>
          ) : (
            filteredList.map((item, index) => {
              const isSelected = index === selectedIndex;
              const IconComp = item.icon || FileText;

              return (
                <div
                  key={item.id}
                  data-active={isSelected}
                  onClick={() => handleSelectItem(item)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`group flex items-center justify-between px-3.5 py-2.5 rounded-xl cursor-pointer transition-all duration-100 ${
                    isSelected
                      ? 'bg-slate-800/90 border border-teal-500/30 text-slate-100 shadow-sm'
                      : 'hover:bg-slate-800/40 text-slate-300 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 pr-3">
                    <div
                      className={`p-2 rounded-lg border transition-colors shrink-0 ${
                        isSelected
                          ? 'bg-teal-500/15 border-teal-500/40 text-teal-300'
                          : 'bg-slate-800/70 border-slate-700/60 text-slate-400 group-hover:text-slate-200'
                      }`}
                    >
                      <IconComp className={`w-4 h-4 ${item.iconColor || ''}`} />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-slate-100 truncate">
                          {item.title}
                        </span>
                        {item.badge && (
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-semibold tracking-wider ${
                              item.category === 'action'
                                ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                                : item.category === 'navigation'
                                ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30'
                                : 'bg-slate-800 text-slate-400 border border-slate-700'
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </div>
                      {item.subtitle && (
                        <p className="text-xs text-slate-400 truncate mt-0.5">
                          {item.subtitle}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {item.shortcut && (
                      <kbd className="hidden sm:inline-flex items-center text-[10px] font-mono text-slate-400 bg-slate-950/80 border border-slate-800 px-1.5 py-0.5 rounded">
                        {item.shortcut}
                      </kbd>
                    )}
                    {isSelected && (
                      <div className="flex items-center gap-1 text-teal-400 text-xs font-mono">
                        <CornerDownLeft className="w-3.5 h-3.5" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Command Palette Footer */}
        <div className="px-4 py-2.5 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-800 rounded border border-slate-700 text-slate-300">
                ↑↓
              </kbd>
              <span className="hidden sm:inline">Navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-800 rounded border border-slate-700 text-slate-300">
                ↵
              </kbd>
              <span className="hidden sm:inline">Select</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-800 rounded border border-slate-700 text-slate-300">
                ⌘K
              </kbd>
              <span className="hidden sm:inline">Toggle Palette</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            {loadingWorkspace && (
              <span className="flex items-center gap-1 text-[11px] text-teal-400">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Indexing workspace
              </span>
            )}
            <span className="text-[11px] text-slate-400">
              {filteredList.length} items
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
