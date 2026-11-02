import React, { useState, useMemo, useRef } from 'react';
import { Project, Task, Meeting } from '../types';
import { safeFormat, safeParseISO } from '../lib/dateUtils';
import {
  Calendar as CalendarIcon,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Clock,
  AlertTriangle,
  User,
  Plus,
  Filter,
  Search,
  Layers,
  ArrowUpRight,
  CheckSquare,
  Flag,
  Target,
  Maximize2,
  CalendarRange,
  Zap,
  Info
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ProjectGanttTimelineProps {
  project: Project;
  tasks: Task[];
  meetings?: Meeting[];
  onAddTask?: () => void;
}

type TimeScale = 'days' | 'weeks' | 'months';
type WindowPreset = '2weeks' | '4weeks' | '8weeks' | '12weeks' | 'fit';
type GroupBy = 'none' | 'status' | 'assignee' | 'priority';

interface GanttItem {
  id: string;
  type: 'task' | 'milestone' | 'meeting';
  title: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  deadline?: string;
  status: string;
  priority?: string;
  assignee?: string;
  checklistTotal: number;
  checklistDone: number;
  progress: number;
  isOverdue: boolean;
  isMilestone: boolean;
  rawTask?: Task;
  rawMeeting?: Meeting;
}

export const ProjectGanttTimeline: React.FC<ProjectGanttTimelineProps> = ({
  project,
  tasks,
  meetings = [],
  onAddTask,
}) => {
  const navigate = useNavigate();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // States
  const [timeScale, setTimeScale] = useState<TimeScale>('weeks');
  const [windowPreset, setWindowPreset] = useState<WindowPreset>('8weeks');
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed' | 'overdue'>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [hoveredItem, setHoveredItem] = useState<GanttItem | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const now = useMemo(() => new Date(), []);

  // Process and normalize tasks & meetings into timeline items
  const timelineItems: GanttItem[] = useMemo(() => {
    const items: GanttItem[] = [];

    tasks.forEach((t) => {
      const created = safeParseISO(t.createdAt || new Date().toISOString());
      let end: Date;
      let isExplicitMilestone = false;

      // Check if explicitly marked or named as milestone
      if (
        t.title.toLowerCase().startsWith('milestone:') ||
        t.title.toLowerCase().startsWith('[milestone]') ||
        t.title.toLowerCase().includes('milestone') ||
        (t as any).isMilestone === true
      ) {
        isExplicitMilestone = true;
      }

      if (t.deadline) {
        end = safeParseISO(t.deadline);
      } else {
        // Default task duration of 5 days from creation
        end = new Date(created.getTime() + 5 * 86400000);
      }

      // Start date: If created is later than deadline, clamp to 2 days before deadline
      let start = created;
      if (start.getTime() > end.getTime()) {
        start = new Date(end.getTime() - 2 * 86400000);
      }

      const totalChecklist = t.checklist ? t.checklist.length : 0;
      const doneChecklist = t.checklist ? t.checklist.filter((c) => c.done).length : 0;

      let progress = 0;
      if (t.status === 'completed') {
        progress = 100;
      } else if (totalChecklist > 0) {
        progress = Math.round((doneChecklist / totalChecklist) * 100);
      } else if (t.status === 'in_progress') {
        progress = 50;
      } else if (t.status === 'submitted' || t.status === 'under_review') {
        progress = 80;
      } else {
        progress = 10;
      }

      const isOverdue = t.status !== 'completed' && end.getTime() < now.getTime();

      items.push({
        id: t.id,
        type: isExplicitMilestone ? 'milestone' : 'task',
        title: t.title,
        description: t.description,
        startDate: start,
        endDate: end,
        deadline: t.deadline,
        status: t.status,
        priority: t.priority,
        assignee: t.assignedToUsername || (t.assignedTo ? 'Team Member' : undefined),
        checklistTotal: totalChecklist,
        checklistDone: doneChecklist,
        progress,
        isOverdue,
        isMilestone: isExplicitMilestone,
        rawTask: t,
      });
    });

    // Add project meetings as milestone/sync events
    meetings.forEach((m) => {
      const meetDate = safeParseISO(m.date || m.createdAt);
      items.push({
        id: `meeting-${m.id}`,
        type: 'meeting',
        title: m.title || 'Project Meeting',
        startDate: meetDate,
        endDate: meetDate,
        status: m.status || 'scheduled',
        checklistTotal: 0,
        checklistDone: 0,
        progress: m.status === 'completed' ? 100 : 0,
        isOverdue: m.status !== 'completed' && meetDate.getTime() < now.getTime(),
        isMilestone: true,
        rawMeeting: m,
      });
    });

    return items;
  }, [tasks, meetings, now]);

  // Compute Timeline Boundary Window
  const { timelineStart, timelineEnd, totalDays } = useMemo(() => {
    let minTime = now.getTime() - 7 * 86400000; // default 1 week back
    let maxTime = now.getTime() + 28 * 86400000; // default 4 weeks ahead

    if (windowPreset === 'fit' && timelineItems.length > 0) {
      const startTimes = timelineItems.map((i) => i.startDate.getTime());
      const endTimes = timelineItems.map((i) => i.endDate.getTime());
      minTime = Math.min(...startTimes, now.getTime()) - 3 * 86400000;
      maxTime = Math.max(...endTimes, now.getTime()) + 7 * 86400000;
    } else {
      const daysCount =
        windowPreset === '2weeks'
          ? 14
          : windowPreset === '4weeks'
          ? 28
          : windowPreset === '8weeks'
          ? 56
          : 84;
      minTime = now.getTime() - 7 * 86400000;
      maxTime = minTime + daysCount * 86400000;
    }

    const tStart = new Date(minTime);
    const tEnd = new Date(maxTime);
    const days = Math.max(7, Math.ceil((tEnd.getTime() - tStart.getTime()) / 86400000));

    return {
      timelineStart: tStart,
      timelineEnd: tEnd,
      totalDays: days,
    };
  }, [now, windowPreset, timelineItems]);

  // Calculate ticks / headers
  const ticks = useMemo(() => {
    const list: { label: string; subLabel?: string; percent: number; isWeekend?: boolean; isToday?: boolean }[] = [];
    const spanMs = timelineEnd.getTime() - timelineStart.getTime();

    if (timeScale === 'days') {
      for (let d = 0; d <= totalDays; d++) {
        const dDate = new Date(timelineStart.getTime() + d * 86400000);
        const isWeekend = dDate.getDay() === 0 || dDate.getDay() === 6;
        const isToday =
          dDate.getFullYear() === now.getFullYear() &&
          dDate.getMonth() === now.getMonth() &&
          dDate.getDate() === now.getDate();

        list.push({
          label: safeFormat(dDate.toISOString(), 'd'),
          subLabel: safeFormat(dDate.toISOString(), 'EEE'),
          percent: (d / totalDays) * 100,
          isWeekend,
          isToday,
        });
      }
    } else if (timeScale === 'weeks') {
      const stepDays = 7;
      const stepCount = Math.ceil(totalDays / stepDays);
      for (let w = 0; w <= stepCount; w++) {
        const wDate = new Date(timelineStart.getTime() + w * stepDays * 86400000);
        list.push({
          label: safeFormat(wDate.toISOString(), 'MMM d'),
          subLabel: `W${Math.ceil((wDate.getDate() + 6) / 7)}`,
          percent: Math.min(100, (w * stepDays * 86400000) / spanMs * 100),
        });
      }
    } else {
      // Months scale
      const stepDays = 14;
      const stepCount = Math.ceil(totalDays / stepDays);
      for (let m = 0; m <= stepCount; m++) {
        const mDate = new Date(timelineStart.getTime() + m * stepDays * 86400000);
        list.push({
          label: safeFormat(mDate.toISOString(), 'MMM d'),
          subLabel: safeFormat(mDate.toISOString(), 'yyyy'),
          percent: Math.min(100, (m * stepDays * 86400000) / spanMs * 100),
        });
      }
    }
    return list;
  }, [timelineStart, timelineEnd, totalDays, timeScale, now]);

  // Position converter helper
  const getPercentFromDate = (date: Date) => {
    const totalMs = timelineEnd.getTime() - timelineStart.getTime();
    const elapsed = date.getTime() - timelineStart.getTime();
    const pct = (elapsed / totalMs) * 100;
    return Math.max(0, Math.min(100, pct));
  };

  const todayPercent = getPercentFromDate(now);

  // Filtered timeline items
  const filteredItems = useMemo(() => {
    return timelineItems.filter((item) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = item.title.toLowerCase().includes(q);
        const matchAssignee = item.assignee?.toLowerCase().includes(q);
        if (!matchTitle && !matchAssignee) return false;
      }

      // Status
      if (statusFilter === 'active' && item.status === 'completed') return false;
      if (statusFilter === 'completed' && item.status !== 'completed') return false;
      if (statusFilter === 'overdue' && !item.isOverdue) return false;

      // Priority
      if (priorityFilter !== 'all' && item.priority !== priorityFilter) return false;

      return true;
    });
  }, [timelineItems, searchQuery, statusFilter, priorityFilter]);

  // Grouped items
  const groupedSections = useMemo(() => {
    if (groupBy === 'none') {
      return [{ groupName: 'All Project Deliverables', items: filteredItems }];
    }

    const map = new Map<string, GanttItem[]>();

    filteredItems.forEach((item) => {
      let key = 'Other';
      if (groupBy === 'status') {
        key = item.status.replace('_', ' ').toUpperCase();
      } else if (groupBy === 'assignee') {
        key = item.assignee ? `@${item.assignee}` : 'Unassigned';
      } else if (groupBy === 'priority') {
        key = item.priority ? item.priority.toUpperCase() : 'NO PRIORITY';
      }

      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(item);
    });

    return Array.from(map.entries()).map(([groupName, items]) => ({
      groupName,
      items,
    }));
  }, [filteredItems, groupBy]);

  // Key Project Metrics
  const metrics = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter((t) => t.status === 'completed').length;
    const overdue = timelineItems.filter((i) => i.isOverdue).length;
    const milestonesCount = timelineItems.filter((i) => i.isMilestone).length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { total, completed, overdue, milestonesCount, pct };
  }, [tasks, timelineItems]);

  const handleScrollToToday = () => {
    if (scrollContainerRef.current) {
      const width = scrollContainerRef.current.scrollWidth;
      const targetScroll = (todayPercent / 100) * width - scrollContainerRef.current.clientWidth / 2;
      scrollContainerRef.current.scrollTo({ left: Math.max(0, targetScroll), behavior: 'smooth' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Overview Cards & Project Roadmap Header */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-teal-400" />
              Progress
            </p>
            <h3 className="text-xl font-bold text-white mt-1">{metrics.pct}%</h3>
            <p className="text-[10px] text-slate-500 mt-0.5">{metrics.completed} of {metrics.total} completed</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 font-bold">
            <Zap className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
              <Flag className="w-3.5 h-3.5 text-amber-400" />
              Milestones
            </p>
            <h3 className="text-xl font-bold text-white mt-1">{metrics.milestonesCount}</h3>
            <p className="text-[10px] text-slate-500 mt-0.5">Key targets & events</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Flag className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
              <CheckSquare className="w-3.5 h-3.5 text-blue-400" />
              Active Tasks
            </p>
            <h3 className="text-xl font-bold text-white mt-1">{metrics.total - metrics.completed}</h3>
            <p className="text-[10px] text-slate-500 mt-0.5">In flight work</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
              Overdue
            </p>
            <h3 className="text-xl font-bold text-rose-300 mt-1">{metrics.overdue}</h3>
            <p className="text-[10px] text-rose-400/80 mt-0.5">{metrics.overdue === 0 ? 'All on schedule' : 'Needs attention'}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Gantt Canvas Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4 shadow-xl">
        {/* Controls Toolbar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            {/* Timescale Selector */}
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              {(['days', 'weeks', 'months'] as TimeScale[]).map((scale) => (
                <button
                  key={scale}
                  onClick={() => setTimeScale(scale)}
                  className={`px-3 py-1.5 rounded-lg font-medium capitalize transition-all cursor-pointer ${
                    timeScale === scale
                      ? 'bg-teal-500 text-slate-950 font-bold shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {scale}
                </button>
              ))}
            </div>

            {/* Window Presets */}
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              {[
                { id: '2weeks', label: '2W' },
                { id: '4weeks', label: '4W' },
                { id: '8weeks', label: '8W' },
                { id: '12weeks', label: '12W' },
                { id: 'fit', label: 'Fit All' },
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => setWindowPreset(p.id as WindowPreset)}
                  className={`px-2.5 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                    windowPreset === p.id
                      ? 'bg-slate-800 text-teal-300 font-bold border border-teal-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Jump to Today button */}
            <button
              onClick={handleScrollToToday}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 hover:text-white hover:border-slate-700 transition-all cursor-pointer font-medium"
              title="Center timeline on today"
            >
              <div className="w-2 h-2 rounded-full bg-teal-400 animate-ping" />
              Today
            </button>
          </div>

          {/* Search, Filter & Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter tasks or @assignee..."
                className="w-44 sm:w-52 bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500"
              />
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-teal-500 cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="completed">Completed</option>
              <option value="overdue">Overdue</option>
            </select>

            {/* Group By Selector */}
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as any)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-teal-500 cursor-pointer"
            >
              <option value="none">No Grouping</option>
              <option value="status">Group by Status</option>
              <option value="assignee">Group by Assignee</option>
              <option value="priority">Group by Priority</option>
            </select>

            {/* Add Task / Milestone */}
            <button
              onClick={onAddTask ? onAddTask : () => navigate(`/tasks?new=true&projectId=${project.id}`)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs transition-all shadow-sm cursor-pointer ml-auto sm:ml-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Task
            </button>
          </div>
        </div>

        {/* Gantt Chart Horizontal Scroll Container */}
        <div
          ref={scrollContainerRef}
          className="relative overflow-x-auto border border-slate-800 rounded-2xl bg-slate-950/60 shadow-inner select-none"
          style={{ minHeight: '380px' }}
        >
          <div style={{ minWidth: timeScale === 'days' ? '1400px' : '900px' }} className="p-3">
            {/* Time Header Scale Bar */}
            <div className="sticky top-0 z-30 flex items-stretch h-10 border-b border-slate-800/80 bg-slate-950/95 backdrop-blur-md rounded-t-xl">
              {/* Fixed Left Column for Task Label */}
              <div className="w-72 shrink-0 px-4 flex items-center justify-between border-r border-slate-800/80 font-mono text-[11px] font-bold text-slate-400">
                <span>TASK / DELIVERABLE</span>
                <span className="text-[10px] text-slate-500 font-normal">DURATION</span>
              </div>

              {/* Grid Axis Header */}
              <div className="relative flex-1 h-full">
                {ticks.map((tick, i) => (
                  <div
                    key={i}
                    style={{ left: `${tick.percent}%` }}
                    className={`absolute top-0 bottom-0 flex flex-col justify-center px-1.5 border-l border-slate-800/60 transform -translate-x-1/2 ${
                      tick.isToday
                        ? 'bg-teal-500/10 text-teal-300 font-bold'
                        : tick.isWeekend
                        ? 'text-slate-500/70 bg-slate-900/30'
                        : 'text-slate-400'
                    }`}
                  >
                    <span className="text-[10px] whitespace-nowrap leading-none">{tick.label}</span>
                    {tick.subLabel && (
                      <span className="text-[9px] text-slate-500 leading-none mt-0.5">{tick.subLabel}</span>
                    )}
                  </div>
                ))}

                {/* Today marker label in header */}
                {todayPercent >= 0 && todayPercent <= 100 && (
                  <div
                    style={{ left: `${todayPercent}%` }}
                    className="absolute top-1 bottom-1 w-0.5 bg-teal-400 z-40 transform -translate-x-1/2"
                  >
                    <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-teal-500 text-slate-950 text-[9px] font-black px-1.5 py-0.2 rounded-full uppercase shadow-md">
                      Today
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Gantt Row Items */}
            <div className="divide-y divide-slate-800/40 relative">
              {/* Today vertical line spanning full height of grid */}
              {todayPercent >= 0 && todayPercent <= 100 && (
                <div
                  style={{ left: `calc(18rem + (100% - 18rem) * ${todayPercent / 100})` }}
                  className="absolute top-0 bottom-0 w-0.5 bg-teal-400/50 pointer-events-none z-10 shadow-[0_0_12px_rgba(45,212,191,0.4)]"
                />
              )}

              {groupedSections.map((section, sIdx) => (
                <div key={sIdx} className="space-y-1">
                  {/* Group Section Header */}
                  {groupBy !== 'none' && (
                    <div className="flex items-center gap-2 py-2 px-3 bg-slate-900/80 border-y border-slate-800/80 text-xs font-bold text-teal-300 uppercase tracking-wider">
                      <Layers className="w-3.5 h-3.5" />
                      <span>{section.groupName}</span>
                      <span className="text-[10px] text-slate-400 font-mono font-normal">
                        ({section.items.length})
                      </span>
                    </div>
                  )}

                  {section.items.map((item) => {
                    const startPct = getPercentFromDate(item.startDate);
                    const endPct = getPercentFromDate(item.endDate);
                    const durationDays = Math.max(1, Math.ceil((item.endDate.getTime() - item.startDate.getTime()) / 86400000));
                    const rawWidthPct = Math.max(3, endPct - startPct);
                    const barWidthPct = Math.min(100 - startPct, rawWidthPct);

                    // Colors based on state
                    let barBg = 'bg-teal-500/20 border-teal-500/40 text-teal-200';
                    let progressBg = 'bg-teal-500/40';

                    if (item.status === 'completed') {
                      barBg = 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200';
                      progressBg = 'bg-emerald-500/50';
                    } else if (item.isOverdue) {
                      barBg = 'bg-rose-500/25 border-rose-500/50 text-rose-200';
                      progressBg = 'bg-rose-500/40';
                    } else if (item.priority === 'urgent') {
                      barBg = 'bg-amber-500/20 border-amber-500/50 text-amber-200';
                      progressBg = 'bg-amber-500/40';
                    } else if (item.type === 'meeting') {
                      barBg = 'bg-purple-500/20 border-purple-500/40 text-purple-200';
                      progressBg = 'bg-purple-500/50';
                    }

                    return (
                      <div
                        key={item.id}
                        className="flex items-center h-12 hover:bg-slate-900/50 transition-colors group relative"
                        onMouseEnter={(e) => {
                          setHoveredItem(item);
                          const rect = e.currentTarget.getBoundingClientRect();
                          setTooltipPos({ x: e.clientX, y: rect.bottom + 8 });
                        }}
                        onMouseLeave={() => setHoveredItem(null)}
                      >
                        {/* Left Task Meta Column */}
                        <div
                          onClick={() => {
                            if (item.rawTask) navigate(`/tasks/${item.rawTask.id}`);
                          }}
                          className="w-72 shrink-0 px-4 flex items-center justify-between border-r border-slate-800/60 cursor-pointer hover:text-teal-300"
                        >
                          <div className="flex items-center gap-2 min-w-0 pr-2">
                            {item.isMilestone ? (
                              <div className="w-5 h-5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shrink-0">
                                <Flag className="w-3 h-3" />
                              </div>
                            ) : item.status === 'completed' ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                            ) : (
                              <div
                                className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                  item.isOverdue
                                    ? 'bg-rose-400 animate-pulse'
                                    : item.priority === 'urgent'
                                    ? 'bg-amber-400'
                                    : 'bg-teal-400'
                                }`}
                              />
                            )}

                            <span
                              className={`text-xs font-medium truncate ${
                                item.status === 'completed'
                                  ? 'text-slate-500 line-through'
                                  : 'text-slate-200 group-hover:text-teal-300'
                              }`}
                            >
                              {item.title}
                            </span>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {item.assignee && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono truncate max-w-[65px]">
                                @{item.assignee}
                              </span>
                            )}
                            <span className="text-[10px] text-slate-500 font-mono">
                              {durationDays}d
                            </span>
                          </div>
                        </div>

                        {/* Gantt Bar Stage */}
                        <div className="relative flex-1 h-full flex items-center px-2">
                          {/* Grid vertical reference lines */}
                          {ticks.map((t, idx) => (
                            <div
                              key={idx}
                              style={{ left: `${t.percent}%` }}
                              className="absolute top-0 bottom-0 border-l border-slate-800/20 pointer-events-none"
                            />
                          ))}

                          {/* Milestone Diamond or Duration Bar */}
                          {item.isMilestone ? (
                            <div
                              style={{ left: `${Math.min(95, Math.max(2, endPct))}%` }}
                              onClick={() => item.rawTask && navigate(`/tasks/${item.rawTask.id}`)}
                              className="absolute transform -translate-x-1/2 flex items-center gap-2 cursor-pointer z-20 group/m"
                            >
                              {/* Diamond icon */}
                              <div className="w-7 h-7 rotate-45 bg-amber-500/20 border-2 border-amber-400 text-amber-300 flex items-center justify-center shadow-[0_0_10px_rgba(251,191,36,0.3)] hover:scale-110 transition-transform">
                                <Flag className="w-3.5 h-3.5 -rotate-45" />
                              </div>
                              <span className="text-[11px] font-bold text-amber-300 whitespace-nowrap drop-shadow">
                                {item.title} ({safeFormat(item.endDate.toISOString(), 'MMM d')})
                              </span>
                            </div>
                          ) : (
                            <div
                              style={{
                                left: `${Math.min(92, Math.max(1, startPct))}%`,
                                width: `${Math.max(4, barWidthPct)}%`,
                              }}
                              onClick={() => item.rawTask && navigate(`/tasks/${item.rawTask.id}`)}
                              className={`relative h-7 rounded-lg border flex items-center px-2 shadow-sm overflow-hidden cursor-pointer transition-all hover:brightness-110 ${barBg}`}
                            >
                              {/* Internal progress completion fill */}
                              <div
                                style={{ width: `${item.progress}%` }}
                                className={`absolute left-0 top-0 bottom-0 -z-0 transition-all ${progressBg}`}
                              />

                              {/* Content inside the bar */}
                              <div className="relative z-10 flex items-center justify-between w-full min-w-0 text-[11px] font-semibold">
                                <span className="truncate pr-2">
                                  {item.title}
                                </span>
                                <span className="text-[10px] font-mono shrink-0 opacity-90">
                                  {item.progress}%
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}

              {filteredItems.length === 0 && (
                <div className="py-16 text-center space-y-3">
                  <CalendarRange className="w-10 h-10 text-slate-600 mx-auto" />
                  <p className="text-sm text-slate-400 font-medium">No tasks or milestones match the current filters.</p>
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setStatusFilter('all');
                      setPriorityFilter('all');
                    }}
                    className="px-4 py-1.5 rounded-xl bg-slate-800 text-xs font-semibold text-teal-400 hover:bg-slate-700 transition-colors cursor-pointer"
                  >
                    Reset Filters
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Legend & Guide Footer */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-slate-800 text-xs text-slate-400">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-teal-500/40 border border-teal-500" />
              <span>In Progress</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-emerald-500/40 border border-emerald-500" />
              <span>Completed</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-rose-500/40 border border-rose-500" />
              <span>Overdue</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rotate-45 bg-amber-500/40 border border-amber-400" />
              <span>Milestone</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-purple-500/40 border border-purple-400" />
              <span>Meeting / Event</span>
            </div>
          </div>

          <div className="text-[11px] text-slate-500">
            Click any task to view details or edit timeline milestones.
          </div>
        </div>
      </div>

      {/* Floating Hover Tooltip Card */}
      {hoveredItem && (
        <div
          style={{
            position: 'fixed',
            left: Math.min(window.innerWidth - 300, Math.max(20, tooltipPos.x - 140)),
            top: tooltipPos.y,
          }}
          className="z-50 pointer-events-none bg-slate-900/95 border border-slate-700 rounded-xl p-3 shadow-2xl backdrop-blur-md max-w-xs space-y-2 animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs font-bold text-white leading-tight">
              {hoveredItem.title}
            </span>
            <span
              className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                hoveredItem.status === 'completed'
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : hoveredItem.isOverdue
                  ? 'bg-rose-500/20 text-rose-300'
                  : 'bg-teal-500/20 text-teal-300'
              }`}
            >
              {hoveredItem.status.replace('_', ' ')}
            </span>
          </div>

          {hoveredItem.description && (
            <p className="text-[11px] text-slate-400 line-clamp-2">{hoveredItem.description}</p>
          )}

          <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-300 pt-1 border-t border-slate-800">
            <div>
              <span className="text-slate-500 block">Start</span>
              <span className="font-mono">{safeFormat(hoveredItem.startDate.toISOString(), 'MMM d, yyyy')}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Deadline</span>
              <span className={`font-mono ${hoveredItem.isOverdue ? 'text-rose-400 font-bold' : ''}`}>
                {hoveredItem.deadline ? safeFormat(hoveredItem.deadline, 'MMM d, yyyy') : 'No deadline'}
              </span>
            </div>
          </div>

          {hoveredItem.checklistTotal > 0 && (
            <div className="pt-1 border-t border-slate-800 text-[10px]">
              <div className="flex justify-between text-slate-400 mb-1">
                <span>Checklist</span>
                <span>
                  {hoveredItem.checklistDone} / {hoveredItem.checklistTotal} done ({hoveredItem.progress}%)
                </span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div
                  style={{ width: `${hoveredItem.progress}%` }}
                  className="bg-teal-400 h-full rounded-full"
                />
              </div>
            </div>
          )}

          {hoveredItem.assignee && (
            <div className="text-[10px] text-teal-400 font-mono">
              Assigned: @{hoveredItem.assignee}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
