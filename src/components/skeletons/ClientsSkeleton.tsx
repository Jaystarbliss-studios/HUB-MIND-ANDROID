import React from 'react';
import { Skeleton } from './SkeletonPrimitives';

export const ClientsSkeleton: React.FC = () => {
  return (
    <div id="clients-skeleton" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 overflow-y-auto flex-1 min-h-0 pb-4">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 md:p-6 h-full flex flex-col justify-between">
          <div>
            <div className="flex items-start gap-4 mb-4">
              <Skeleton className="w-12 h-12 rounded-xl shrink-0" />
              <div className="space-y-2 flex-1 min-w-0">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-5 w-16 rounded shrink-0" />
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-800 space-y-2">
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
};
