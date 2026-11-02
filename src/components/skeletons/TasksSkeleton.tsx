import React from 'react';
import { Skeleton } from './SkeletonPrimitives';

export const TasksSkeleton: React.FC = () => {
  return (
    <div id="tasks-skeleton" className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col min-h-0 shadow-sm flex-1">
      <div className="divide-y divide-slate-800 overflow-y-auto">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="p-4 md:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex-1 min-w-0 w-full space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-16 rounded" />
                <Skeleton className="h-5 w-14 rounded" />
                <Skeleton className="h-5 w-24 rounded ml-auto sm:ml-0" />
              </div>
              <Skeleton className="h-5 w-3/4 max-w-md" />
              <div className="flex items-center gap-4 pt-1">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-24 hidden sm:block" />
              </div>
            </div>
            <Skeleton className="h-9 w-16 rounded-lg self-end sm:self-center shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
};
