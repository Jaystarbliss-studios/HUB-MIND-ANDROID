import React from 'react';
import { Skeleton } from './SkeletonPrimitives';

export const DashboardSkeleton: React.FC = () => {
  return (
    <div id="dashboard-skeleton" className="p-4 md:p-8 max-w-7xl mx-auto h-full overflow-y-auto space-y-10">
      {/* Greeting Header Skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-9 w-64 md:w-80" />
        <Skeleton className="h-4 w-48" />
      </div>

      {/* Circular Progress Indicators Gauges Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-center justify-between shadow-sm">
            <div className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="w-24 h-24 rounded-full shrink-0" />
          </div>
        ))}
      </div>

      {/* Focus & Health Sections Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Today's Focus */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
          <Skeleton className="h-3 w-28" />
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="w-5 h-5 rounded-full" />
                <Skeleton className="h-4 w-40" />
              </div>
            ))}
          </div>
        </div>

        {/* Business Health */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
          <Skeleton className="h-3 w-32" />
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-4 w-12" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Activity & Scratchpad Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        <div className="md:col-span-8 space-y-4">
          <Skeleton className="h-3 w-32" />
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-56 md:w-80" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-3 w-24 shrink-0" />
              </div>
            ))}
          </div>
        </div>

        <div className="md:col-span-4 space-y-4">
          <Skeleton className="h-3 w-36" />
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col min-h-[220px] justify-between">
            <div className="space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-3 w-2/3" />
            </div>
            <Skeleton className="h-5 w-20 self-start mt-6" />
          </div>
        </div>
      </div>
    </div>
  );
};
