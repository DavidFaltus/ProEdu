import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { auth } from '../lib/firebase';
import { useAuth } from './AuthContext';
import { toast } from 'sonner';

const MIN_FOCUS_MINUTES = 5;
const MAX_FOCUS_MINUTES = 240;

export interface TimerContextType {
  timeLeft: number;
  duration: number;
  isActive: boolean;
  isBreak: boolean;
  breakDuration: number;
  isOvertime: boolean;
  overtimeSeconds: number;
  selectedPlantEmoji: string;
  selectedPlantName: string;
  selectedTodoId: string;
  selectedTodoTitle: string;
  selectedTag: string;
  startTimer: (durationMin: number, plantEmoji: string, plantName: string, todoId?: string, todoTitle?: string, tag?: string) => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  resetTimer: () => void;
  skipToBreak: (durationMin: number) => void;
  setCustomDuration: (minutes: number) => void;
}

const TimerContext = createContext<TimerContextType | undefined>(undefined);

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const authCtx = useAuth();
  const { user } = authCtx;
  const refreshProfile = (authCtx as { refreshProfile?: () => Promise<void> }).refreshProfile;

  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [duration, setDuration] = useState(25 * 60);
  const [isActive, setIsActive] = useState(false);
  const [isBreak, setIsBreak] = useState(false);
  const [breakDuration, setBreakDuration] = useState(5 * 60);
  const [isOvertime, setIsOvertime] = useState(false);
  const [overtimeSeconds, setOvertimeSeconds] = useState(0);
  const [selectedPlantEmoji, setSelectedPlantEmoji] = useState('🌹');
  const [selectedPlantName, setSelectedPlantName] = useState('Růže');
  const [selectedTodoId, setSelectedTodoId] = useState('');
  const [selectedTodoTitle, setSelectedTodoTitle] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const isCompletingFocusRef = useRef(false);

  const handleFocusComplete = async () => {
    if (!user || isCompletingFocusRef.current) return;
    const durationMinutes = Math.round(duration / 60);
    if (durationMinutes < MIN_FOCUS_MINUTES || durationMinutes > MAX_FOCUS_MINUTES) {
      toast.error(`Délka soustředění musí být ${MIN_FOCUS_MINUTES} až ${MAX_FOCUS_MINUTES} minut.`);
      return;
    }

    isCompletingFocusRef.current = true;
    try {
      const token = await (auth.currentUser?.getIdToken() || user.getIdToken());
      const res = await fetch('/api/garden/record-focus', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          durationMinutes,
          plantType: selectedPlantEmoji,
          plantName: selectedPlantName,
          todoId: selectedTodoId || undefined,
          todoTitle: selectedTodoTitle || undefined,
          tag: selectedTag || undefined,
        }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error || 'Chyba při ukládání vypěstované rostlinky.');
      }

      if (refreshProfile) {
        await refreshProfile();
      }

      toast.success(`Skvělá práce! V tvé zahrádce vyrostla nová ${selectedPlantName}! 🌿🌱`);
    } catch (error: any) {
      console.error("Error saving focus session:", error);
      toast.error(error?.message || "Chyba při ukládání vypěstované rostlinky.");
    } finally {
      isCompletingFocusRef.current = false;
    }
  };

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    if (isActive) {
      interval = setInterval(() => {
        if (!isBreak) {
          // Focus mode
          if (timeLeft > 0) {
            setTimeLeft(prev => prev - 1);
          } else {
            // Focus finished
            setIsActive(false);
            handleFocusComplete();
            // Automatically switch to break mode
            setIsBreak(true);
            const defaultBreak = 5 * 60;
            setTimeLeft(defaultBreak);
            setBreakDuration(defaultBreak);
            setIsOvertime(false);
            setOvertimeSeconds(0);
            setIsActive(true); // Run break timer automatically
          }
        } else {
          // Break mode
          if (timeLeft > 0) {
            setTimeLeft(prev => prev - 1);
          } else {
            // Break finished -> overtime mode starts ticking up
            setIsOvertime(true);
            setOvertimeSeconds(prev => prev + 1);
          }
        }
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isActive, isBreak, timeLeft, duration, selectedPlantEmoji, selectedPlantName, selectedTodoId, selectedTodoTitle, selectedTag, user]);

  const startTimer = (durationMin: number, plantEmoji: string, plantName: string, todoId?: string, todoTitle?: string, tag?: string) => {
    const clampedMinutes = Math.min(MAX_FOCUS_MINUTES, Math.max(MIN_FOCUS_MINUTES, Math.round(durationMin)));
    const secs = clampedMinutes * 60;
    setDuration(secs);
    setTimeLeft(secs);
    setSelectedPlantEmoji(plantEmoji);
    setSelectedPlantName(plantName);
    setSelectedTodoId(todoId || '');
    setSelectedTodoTitle(todoTitle || '');
    setSelectedTag(tag || '');
    setIsBreak(false);
    setIsOvertime(false);
    setOvertimeSeconds(0);
    setIsActive(true);
  };

  const pauseTimer = () => {
    setIsActive(false);
  };

  const resumeTimer = () => {
    setIsActive(true);
  };

  const resetTimer = () => {
    setIsActive(false);
    setIsBreak(false);
    setIsOvertime(false);
    setOvertimeSeconds(0);
    setTimeLeft(duration);
  };

  const skipToBreak = (durationMin: number) => {
    setIsBreak(true);
    setIsOvertime(false);
    setOvertimeSeconds(0);
    const secs = Math.max(60, Math.round(durationMin * 60));
    setTimeLeft(secs);
    setBreakDuration(secs);
    setIsActive(true); // Run automatically
  };

  const setCustomDuration = (minutes: number) => {
    const clampedMinutes = Math.min(MAX_FOCUS_MINUTES, Math.max(MIN_FOCUS_MINUTES, Math.round(minutes)));
    const secs = clampedMinutes * 60;
    setDuration(secs);
    if (!isActive && !isBreak) {
      setTimeLeft(secs);
    }
  };

  return (
    <TimerContext.Provider value={{
      timeLeft,
      duration,
      isActive,
      isBreak,
      breakDuration,
      isOvertime,
      overtimeSeconds,
      selectedPlantEmoji,
      selectedPlantName,
      selectedTodoId,
      selectedTodoTitle,
      selectedTag,
      startTimer,
      pauseTimer,
      resumeTimer,
      resetTimer,
      skipToBreak,
      setCustomDuration
    }}>
      {children}
    </TimerContext.Provider>
  );
}

export function useTimer() {
  const context = useContext(TimerContext);
  if (context === undefined) {
    throw new Error('useTimer must be used within a TimerProvider');
  }
  return context;
}
