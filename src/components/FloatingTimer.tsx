import React, { useState } from 'react';
import { useTimer } from '../context/TimerContext';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Pause, Coffee, Sprout, AlertCircle, Maximize2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../lib/utils';

export default function FloatingTimer() {
  const {
    timeLeft,
    duration,
    isActive,
    isBreak,
    breakDuration,
    isOvertime,
    overtimeSeconds,
    selectedPlantEmoji,
    selectedPlantName,
    selectedTodoTitle,
    pauseTimer,
    resumeTimer,
    resetTimer
  } = useTimer();

  const [isHovered, setIsHovered] = useState(false);

  // Determine if we should show the widget
  // Show if it is active, or if it has started but paused, or if it is in break/overtime
  const isStarted = timeLeft < duration || isBreak || isOvertime || isActive;

  if (!isStarted) return null;

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // SVG circular progress calculation
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const currentTotal = isBreak ? breakDuration : duration;
  const progressRatio = currentTotal > 0 ? (timeLeft / currentTotal) : 0;
  const strokeDashoffset = circumference - progressRatio * circumference;

  // Colors based on state
  let themeBg = "bg-green-500 shadow-green-100/50";
  let themeText = "text-white";
  let themeBorder = "border-green-400";
  let themeCircleStroke = "stroke-green-200";
  let themeProgressStroke = "stroke-white";
  let icon = <Sprout size={18} />;
  let stateTitle = `Focus: ${selectedPlantEmoji} ${selectedPlantName}`;

  if (isOvertime) {
    themeBg = "bg-[#7C2D12] shadow-orange-900/30"; // Brown/dark orange for overtime
    themeText = "text-orange-100";
    themeBorder = "border-orange-800";
    themeCircleStroke = "stroke-orange-900/50";
    themeProgressStroke = "stroke-orange-300";
    icon = <AlertCircle size={18} className="animate-bounce" />;
    stateTitle = "Limit vypršel!";
  } else if (isBreak) {
    themeBg = "bg-blue-500 shadow-blue-100/50";
    themeText = "text-white";
    themeBorder = "border-blue-400";
    themeCircleStroke = "stroke-blue-200";
    themeProgressStroke = "stroke-white";
    icon = <Coffee size={18} />;
    stateTitle = "Pauza";
  }

  return (
    <div 
      className="fixed bottom-6 right-6 z-50 flex flex-col items-end"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <AnimatePresence>
        {isHovered && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="mb-3 bg-white p-5 rounded-3xl shadow-2xl border border-gray-100/80 w-64 text-[#1E1B18] space-y-3"
          >
            <div className="flex items-center justify-between border-b border-gray-50 pb-2">
              <span className="text-xs font-black uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
                {isBreak ? <Coffee size={12} className="text-blue-500" /> : <Sprout size={12} className="text-green-500" />}
                {isOvertime ? 'Limit pauzy' : isBreak ? 'Pauza' : 'Focus'}
              </span>
              <Link 
                to="/garden" 
                className="text-gray-400 hover:text-[#B80053] transition-colors p-1"
                title="Přejít do zahrádky"
              >
                <Maximize2 size={14} />
              </Link>
            </div>

            <div>
              <h4 className="font-display font-bold text-base leading-tight truncate">
                {stateTitle}
              </h4>
              {selectedTodoTitle && !isBreak && (
                <p className="text-xs text-gray-500 font-medium truncate mt-1">
                  Úkol: {selectedTodoTitle}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => isActive ? pauseTimer() : resumeTimer()}
                  className="w-8 h-8 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-700 flex items-center justify-center transition-all cursor-pointer border border-gray-100"
                >
                  {isActive ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
                </button>
                <button
                  onClick={resetTimer}
                  className="text-xs font-bold text-gray-400 hover:text-red-500 transition-colors px-2 py-1 cursor-pointer"
                >
                  Reset
                </button>
              </div>

              <div className="font-sans font-black text-xl text-gray-900 tracking-tight">
                {isOvertime ? `+${formatTime(overtimeSeconds)}` : formatTime(timeLeft)}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Circle Floating Button */}
      <motion.button
        layout
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className={cn(
          "w-16 h-16 rounded-full flex items-center justify-center relative cursor-pointer shadow-lg select-none border-4 border-white transition-colors duration-500",
          themeBg,
          themeText
        )}
      >
        {/* SVG Progress Ring */}
        <svg className="absolute inset-0 w-full h-full -rotate-90 p-0.5">
          <circle
            cx="28"
            cy="28"
            r={radius}
            className={cn("fill-transparent stroke-[3px]", themeCircleStroke)}
          />
          {!isOvertime && (
            <circle
              cx="28"
              cy="28"
              r={radius}
              className={cn("fill-transparent stroke-[3px] transition-all duration-300", themeProgressStroke)}
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
            />
          )}
        </svg>

        <div className="relative z-10 flex flex-col items-center justify-center">
          {isOvertime ? (
            <span className="text-[10px] font-black uppercase tracking-tighter animate-pulse">Over</span>
          ) : (
            icon
          )}
        </div>
      </motion.button>
    </div>
  );
}
