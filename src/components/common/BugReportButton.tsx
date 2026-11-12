import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTimer } from '../../context/TimerContext';
import BugReportModal from './BugReportModal';
import { Bug } from 'lucide-react';

export default function BugReportButton() {
  const { user } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Bezpečné zjištění, zda běží časovač v pravém dolním rohu, abychom nekolidovali
  let isTimerActive = false;
  try {
    const timer = useTimer();
    isTimerActive = Boolean(timer.timeLeft < timer.duration || timer.isBreak || timer.isOvertime || timer.isActive);
  } catch (e) {
    // Pokud je mimo TimerProvider, ignorujeme
  }

  // Tlačítko se zobrazuje pouze přihlášeným uživatelům (studentům i učitelům)
  if (!user) {
    return null;
  }

  // Dynamická pozice v pravém dolním rohu (s ohledem na spodní mobilní lištu a FloatingTimer)
  const positionClasses = isTimerActive
    ? 'bottom-36 sm:bottom-22 right-3.5 sm:right-6'
    : 'bottom-20 sm:bottom-6 right-3.5 sm:right-6';

  return (
    <>
      <div 
        className={`fixed ${positionClasses} z-40 transition-all duration-300`}
      >
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="group flex items-center gap-0 hover:gap-2 bg-white/95 hover:bg-white text-gray-700 hover:text-rose-600 border border-gray-200/90 hover:border-rose-300 shadow-md hover:shadow-xl rounded-full p-2.5 sm:p-3 transition-all duration-300 cursor-pointer backdrop-blur-md active:scale-95"
          title="Nahlásit chybu v aplikaci"
          aria-label="Nahlásit chybu"
        >
          <div className="w-5 h-5 flex items-center justify-center shrink-0">
            <Bug 
              size={18} 
              className="text-rose-500 group-hover:scale-110 group-hover:rotate-12 transition-transform duration-300" 
            />
          </div>
          <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 group-hover:max-w-[120px] group-hover:opacity-100 transition-all duration-300 ease-in-out text-xs font-bold text-gray-800">
            Nahlásit chybu
          </span>
        </button>
      </div>

      <BugReportModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
      />
    </>
  );
}
