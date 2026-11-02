import React, { useState } from 'react';
import { Project, Task, Client } from '../types';
import { safeParseISO, safeFormat } from '../lib/dateUtils';
import { Calendar, ChevronRight, ChevronDown, CheckCircle2, Clock, AlertTriangle, User, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ProjectTimelineViewProps {
  projects: Project[];
  tasks: Task[];
  clients: Client[];
}

export const ProjectTimelineView: React.FC<ProjectTimelineViewProps> = ({
  projects,
  tasks,
  clients,
}) => {
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  const [viewWindow, setViewWindow] = useState<'4weeks' | '8weeks' | '12weeks'>('8weeks');
  const navigate = useNavigate();

  const toggleExpand = (projectId: string) => {
    setExpandedProjects((prev) => ({
      ...prev,
      [projectId]: !prev[projectId],
    }));
  };

  // Timeline configuration
  const now = new Date();
  const daysToShow = viewWindow === '4weeks' ? 28 : viewWindow === '8weeks' ? 56 : 84;
  const startDate = new Date(now.getTime() - 7 * 86400000); // 1 week in the past
  const endDate = new Date(startDate.getTime() + daysToShow * 86400000);

  const getPositionPercent = (dateString?: string) => {
    if (!dateString) return 50;
    const date = new Date(dateString);
    const totalDuration = endDate.getTime() - startDate.getTime();
    const elapsed = date.getTime() - startDate.getTime();
    const pct = (elapsed / totalDuration) * 100;
    return Math.max(0, Math.min(100, pct));
  };

  const getBarWidthPercent = (startStr?: string, endStr?: string) => {
    if (!startStr && !endStr) return 30;
    const s = startStr ? new Date(startStr) : new Date(now.getTime() - 86400000 * 14);
    const e = endStr ? new Date(endStr) : new Date(now.getTime() + 86400000 * 14);

    const totalDuration = endDate.getTime() - startDate.getTime();
    const barDuration = Math.max(86400000 * 3, e.getTime() - s.getTime());
    const pct = (barDuration / totalDuration) * 100;
    return Math.max(8, Math.min(90, pct));
  };

  // Generate timeline tick markers
  const tickCount = viewWindow === '4weeks' ? 4 : viewWindow === '8weeks' ? 8 : 12;
  const ticks: { label: string; percent: number }[] = [];
  for (let i = 0; i <= tickCount; i++) {
    const tickTime = new Date(startDate.getTime() + (daysToShow * 86400000 * i) / tickCount);
    ticks.push({
      label: safeFormat(tickTime.toISOString(), 'MMM d'),
      percent: (i / tickCount) * 100,
    });
  }

  const todayPercent = getPositionPercent(now.toISOString());

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 md:p-6 space-y-5 overflow-hidden">
      {/* View Header & Scale Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-teal-400" />
            <span>Gantt Project Milestones & Deadlines Timeline</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Visual roadmap of active project phases, milestone deliverables, and target completion dates.
          </p>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800 self-start sm:self-auto">
          {(['4weeks', '8weeks', '12weeks'] as const).map((w) => (
            <button
              key={w}
              onClick={() => setViewWindow(w)}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                viewWindow === w
                  ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {w === '4weeks' ? '4 Weeks' : w === '8weeks' ? '8 Weeks' : '12 Weeks'}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline Gantt Grid Container */}
      <div className="overflow-x-auto min-w-[700px]">
        {/* Timescale Axis Bar */}
        <div className="relative h-8 border-b border-slate-800 bg-slate-950/70 rounded-t-xl mb-3 flex items-center text-[11px] font-mono text-slate-400">
          <div className="w-64 shrink-0 px-4 font-sans font-semibold text-slate-300">
            Project / Milestone
          </div>
          <div className="relative flex-1 h-full">
            {ticks.map((tick, i) => (
              <div
                key={i}
                style={{ left: `${tick.percent}%` }}
                className="absolute top-0 bottom-0 flex flex-col justify-center transform -translate-x-1/2 border-l border-slate-800/80 pl-1"
              >
                <span className="text-[10px] text-slate-400">{tick.label}</span>
              </div>
            ))}

            {/* Today indicator line */}
            {todayPercent >= 0 && todayPercent <= 100 && (
              <div
                style={{ left: `${todayPercent}%` }}
                className="absolute top-0 bottom-0 w-0.5 bg-teal-400 z-20 shadow-[0_0_8px_rgba(45,212,191,0.6)]"
              >
                <span className="absolute -top-1 left-1/2 -translate-x-1/2 bg-teal-500 text-slate-950 text-[9px] font-extrabold px-1 rounded uppercase tracking-wider">
                  Today
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Project Rows */}
        <div className="space-y-3">
          {projects.map((project) => {
            const isExpanded = !!expandedProjects[project.id];
            const projectTasks = tasks.filter((t) => t.projectId === project.id);
            const completedCount = projectTasks.filter((t) => t.status === 'completed').length;
            const progress =
              projectTasks.length > 0 ? Math.round((completedCount / projectTasks.length) * 100) : 0;

            const projStartLeft = getPositionPercent(project.createdAt);
            const projWidth = getBarWidthPercent(project.createdAt, (project as any).deadline);

            return (
              <div
                key={project.id}
                className="border border-slate-800/80 bg-slate-950/40 rounded-xl overflow-hidden"
              >
                {/* Main Project Row */}
                <div className="flex items-center h-14 hover:bg-slate-800/40 transition-colors">
                  <div className="w-64 shrink-0 px-4 flex items-center gap-2">
                    <button
                      onClick={() => toggleExpand(project.id)}
                      className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-teal-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </button>
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold text-white truncate">{project.name}</h4>
                      <p className="text-[11px] text-slate-400">
                        {projectTasks.length} tasks • {progress}% complete
                      </p>
                    </div>
                  </div>

                  {/* Gantt Bar Stage */}
                  <div className="relative flex-1 h-full flex items-center pr-4">
                    {/* Grid vertical lines */}
                    {ticks.map((t, idx) => (
                      <div
                        key={idx}
                        style={{ left: `${t.percent}%` }}
                        className="absolute top-0 bottom-0 border-l border-slate-800/30"
                      />
                    ))}

                    {/* Today indicator line */}
                    {todayPercent >= 0 && todayPercent <= 100 && (
                      <div
                        style={{ left: `${todayPercent}%` }}
                        className="absolute top-0 bottom-0 w-px bg-teal-400/40 z-10"
                      />
                    )}

                    {/* Project Bar */}
                    <div
                      style={{
                        left: `${Math.min(75, Math.max(2, projStartLeft))}%`,
                        width: `${Math.max(15, Math.min(80, projWidth))}%`,
                      }}
                      className="relative h-7 bg-gradient-to-r from-teal-500/20 to-blue-500/20 border border-teal-500/40 rounded-lg flex items-center px-2.5 shadow-sm overflow-hidden"
                    >
                      {/* Internal progress fill */}
                      <div
                        style={{ width: `${progress}%` }}
                        className="absolute left-0 top-0 bottom-0 bg-teal-500/30 -z-0"
                      />
                      <span className="relative z-10 text-[11px] font-semibold text-teal-200 truncate">
                        {project.name} ({progress}%)
                      </span>
                    </div>
                  </div>
                </div>

                {/* Expanded Project Tasks / Milestones */}
                {isExpanded && (
                  <div className="bg-slate-900/60 border-t border-slate-800/60 divide-y divide-slate-800/40 py-1">
                    {projectTasks.length === 0 ? (
                      <div className="px-12 py-3 text-xs text-slate-500 italic">
                        No sub-tasks attached to this project.
                      </div>
                    ) : (
                      projectTasks.map((t) => {
                        const taskLeft = getPositionPercent(t.deadline || t.createdAt);
                        const isDone = t.status === 'completed';

                        return (
                          <div
                            key={t.id}
                            className="flex items-center h-10 hover:bg-slate-800/30 transition-colors"
                          >
                            <div className="w-64 shrink-0 pl-10 pr-4 flex items-center gap-2">
                              <CheckCircle2
                                className={`w-3.5 h-3.5 shrink-0 ${
                                  isDone ? 'text-emerald-400' : 'text-slate-500'
                                }`}
                              />
                              <span
                                onClick={() => navigate(`/tasks/${t.id}`)}
                                className={`text-xs truncate cursor-pointer hover:text-teal-300 transition-colors ${
                                  isDone ? 'text-slate-500 line-through' : 'text-slate-200'
                                }`}
                              >
                                {t.title}
                              </span>
                            </div>

                            <div className="relative flex-1 h-full flex items-center pr-4">
                              {/* Grid lines */}
                              {ticks.map((tk, idx) => (
                                <div
                                  key={idx}
                                  style={{ left: `${tk.percent}%` }}
                                  className="absolute top-0 bottom-0 border-l border-slate-800/20"
                                />
                              ))}

                              {/* Milestone Marker */}
                              <div
                                style={{ left: `${Math.min(92, Math.max(4, taskLeft))}%` }}
                                onClick={() => navigate(`/tasks/${t.id}`)}
                                className={`relative cursor-pointer flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-medium border shadow-xs transform -translate-x-1/2 ${
                                  isDone
                                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                                    : t.priority === 'urgent'
                                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse'
                                    : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                                }`}
                              >
                                <Clock className="w-3 h-3 shrink-0" />
                                <span className="truncate max-w-[120px]">
                                  {t.deadline ? safeFormat(t.deadline, 'MMM d') : 'No deadline'}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
