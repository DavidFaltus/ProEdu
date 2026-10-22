import React from 'react';

/**
 * RouteSkeleton: High-performance loading fallback for React.lazy route transitions.
 * Prevents Cumulative Layout Shift (CLS) with consistent layout structure.
 */
export default function RouteSkeleton() {
  return (
    <div className="min-h-screen bg-[#FAF6EE] p-4 md:p-8 animate-pulse flex flex-col gap-6 max-w-6xl mx-auto">
      {/* Header bar skeleton */}
      <div className="flex items-center justify-between pb-4 border-b border-[#EADFC7]/60">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-200/50" />
          <div className="space-y-2">
            <div className="w-32 h-5 rounded-lg bg-amber-200/60" />
            <div className="w-20 h-3 rounded-md bg-amber-200/40" />
          </div>
        </div>
        <div className="flex gap-2">
          <div className="w-10 h-10 rounded-full bg-amber-200/40" />
          <div className="w-24 h-10 rounded-xl bg-amber-200/50" />
        </div>
      </div>

      {/* Hero / Banner skeleton */}
      <div className="w-full h-36 rounded-3xl bg-amber-100/70 border border-amber-200/60 p-6 flex flex-col justify-center gap-3">
        <div className="w-1/3 h-7 rounded-xl bg-amber-200/70" />
        <div className="w-2/3 h-4 rounded-lg bg-amber-200/40" />
      </div>

      {/* Grid content skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="h-44 rounded-3xl bg-white/80 border border-amber-200/40 p-5 flex flex-col justify-between">
          <div className="w-12 h-12 rounded-2xl bg-amber-100" />
          <div className="space-y-2">
            <div className="w-3/4 h-5 rounded-lg bg-gray-200" />
            <div className="w-1/2 h-3 rounded-md bg-gray-100" />
          </div>
        </div>
        <div className="h-44 rounded-3xl bg-white/80 border border-amber-200/40 p-5 flex flex-col justify-between">
          <div className="w-12 h-12 rounded-2xl bg-amber-100" />
          <div className="space-y-2">
            <div className="w-3/4 h-5 rounded-lg bg-gray-200" />
            <div className="w-1/2 h-3 rounded-md bg-gray-100" />
          </div>
        </div>
        <div className="h-44 rounded-3xl bg-white/80 border border-amber-200/40 p-5 flex flex-col justify-between">
          <div className="w-12 h-12 rounded-2xl bg-amber-100" />
          <div className="space-y-2">
            <div className="w-3/4 h-5 rounded-lg bg-gray-200" />
            <div className="w-1/2 h-3 rounded-md bg-gray-100" />
          </div>
        </div>
      </div>
    </div>
  );
}
