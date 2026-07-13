import React, { createContext, useContext, useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { useAuth } from './AuthContext';
import { toast } from 'sonner';

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
  const { user, profile, updateProfileData } = useAuth();
  
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

  const handleFocusComplete = async () => {
    if (!user) return;
    try {
      const currentHistory = profile?.focusSessionsHistory || [];
      const newSession = {
        plantType: selectedPlantEmoji,
        plantName: selectedPlantName,
        duration: duration,
        todoId: selectedTodoId || null,
        todoTitle: selectedTodoTitle || null,
        tag: selectedTag || null,
        completedAt: Timestamp.now(),
      };

      const currentPlants = profile?.gardenPlants || 0;
      await updateProfileData({
        gardenPlants: currentPlants + 1,
        focusSessionsHistory: [newSession, ...currentHistory],
      });

      toast.success(`Skvělá práce! V tvé zahrádce vyrostla nová ${selectedPlantName}! 🌿🌱`);
    } catch (error) {
      console.error("Error saving focus session:", error);
      toast.error("Chyba při ukládání vypěstované rostlinky.");
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

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
  }, [isActive, isBreak, timeLeft, duration, selectedPlantEmoji, selectedPlantName, selectedTodoId, selectedTodoTitle, selectedTag, user, profile]);

  const startTimer = (durationMin: number, plantEmoji: string, plantName: string, todoId?: string, todoTitle?: string, tag?: string) => {
    const secs = Math.round(durationMin * 60);
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
    const secs = Math.round(durationMin * 60);
    setTimeLeft(secs);
    setBreakDuration(secs);
    setIsActive(true); // Run automatically
  };

  const setCustomDuration = (minutes: number) => {
    const secs = Math.round(minutes * 60);
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
