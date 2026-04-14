import React from 'react';
import { motion } from 'motion/react';

interface GeometryDiagramProps {
  type: 'square' | 'triangle' | 'circle' | 'coordinate';
}

export const GeometryDiagram: React.FC<GeometryDiagramProps> = ({ type }) => {
  return (
    <div className="w-full h-48 bg-white rounded-3xl border-2 border-blue-50 flex items-center justify-center p-8 overflow-hidden relative">
      <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#3b82f6 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
      
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 12 }}
        className="relative z-10"
      >
        {type === 'square' && (
          <div className="relative">
            <div className="w-32 h-32 border-4 border-brand-blue bg-blue-50/50 rounded-lg" />
            <div className="absolute -left-6 top-1/2 -translate-y-1/2 font-bold text-brand-blue">a</div>
            <div className="absolute left-1/2 -bottom-6 -translate-x-1/2 font-bold text-brand-blue">a</div>
          </div>
        )}

        {type === 'triangle' && (
          <div className="relative">
            <svg width="160" height="120" viewBox="0 0 160 120">
              <path 
                d="M 20 100 L 140 100 L 20 20 Z" 
                fill="rgba(59, 130, 246, 0.1)" 
                stroke="#3b82f6" 
                strokeWidth="4" 
                strokeLinejoin="round"
              />
              <rect x="20" y="90" width="10" height="10" fill="none" stroke="#3b82f6" strokeWidth="2" />
              <text x="70" y="115" className="fill-brand-blue font-bold text-xs">4 cm</text>
              <text x="0" y="65" className="fill-brand-blue font-bold text-xs">3 cm</text>
              <text x="85" y="55" className="fill-brand-blue font-bold text-xs italic">c = ?</text>
            </svg>
          </div>
        )}

        {type === 'circle' && (
          <div className="relative">
            <div className="w-32 h-32 border-4 border-brand-orange bg-orange-50/50 rounded-full flex items-center justify-center">
              <div className="w-1 h-1 bg-brand-orange rounded-full" />
              <div className="absolute w-16 h-1 bg-brand-orange left-1/2 top-1/2 origin-left" />
              <div className="absolute left-[75%] top-[40%] font-bold text-brand-orange text-sm">r</div>
            </div>
          </div>
        )}

        {type === 'coordinate' && (
          <div className="relative">
            <svg width="160" height="160" viewBox="0 0 160 160">
              <line x1="10" y1="80" x2="150" y2="80" stroke="#94a3b8" strokeWidth="2" markerEnd="url(#arrow)" />
              <line x1="80" y1="150" x2="80" y2="10" stroke="#94a3b8" strokeWidth="2" markerEnd="url(#arrow)" />
              <path d="M 80 80 L 120 40" stroke="#f97316" strokeWidth="4" strokeDasharray="4 4" />
              <circle cx="120" cy="40" r="6" fill="#f97316" />
              <defs>
                <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
                </marker>
              </defs>
              <text x="150" y="95" className="fill-slate-400 text-[10px] font-bold">x</text>
              <text x="65" y="15" className="fill-slate-400 text-[10px] font-bold">y</text>
            </svg>
          </div>
        )}
      </motion.div>
    </div>
  );
};
