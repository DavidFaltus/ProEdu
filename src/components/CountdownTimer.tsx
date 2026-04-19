import React, { useState, useEffect } from 'react';
import { Card, CardContent } from './ui/card';
import { Clock, Calendar as CalendarIcon } from 'lucide-react';
import { TodoItem } from '../types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { cn } from '../lib/utils';

interface CountdownTimerProps {
  todos: TodoItem[];
  className?: string;
  compact?: boolean;
}

export function CountdownTimer({ todos, className, compact }: CountdownTimerProps) {
  const [selectedTodoId, setSelectedTodoId] = useState<string>('default');
  const [timeLeft, setTimeLeft] = useState<{ days: number; hours: number; minutes: number; seconds: number } | null>(null);

  const upcomingTodos = todos
    .filter(t => !t.completed && t.dueDate && t.dueDate.toDate() > new Date())
    .sort((a, b) => (a.dueDate?.toDate().getTime() || 0) - (b.dueDate?.toDate().getTime() || 0));

  const targetTodo = selectedTodoId === 'default' 
    ? upcomingTodos[0] 
    : upcomingTodos.find(t => t.id === selectedTodoId) || upcomingTodos[0];

  useEffect(() => {
    if (!targetTodo || !targetTodo.dueDate) {
      setTimeLeft(null);
      return;
    }

    const interval = setInterval(() => {
      const now = new Date().getTime();
      const targetDate = targetTodo.dueDate!.toDate().getTime();
      const distance = targetDate - now;

      if (distance < 0) {
        clearInterval(interval);
        setTimeLeft(null);
        return;
      }

      setTimeLeft({
        days: Math.floor(distance / (1000 * 60 * 60 * 24)),
        hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((distance % (1000 * 60)) / 1000)
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [targetTodo]);

  if (upcomingTodos.length === 0) return null;

  return (
    <Card className={cn(
      compact 
        ? "rounded-[1.5rem] md:rounded-[2rem] border-2 border-brand-blue/10 bg-gradient-to-br from-white to-blue-50/50 shadow-xl shadow-blue-900/5 overflow-hidden w-full relative group transition-all hover:border-brand-blue/20"
        : "rounded-[2.5rem] border-none shadow-2xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white overflow-hidden relative mb-8 w-full",
      className
    )}>
      {!compact && <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl pointer-events-none" />}
      {compact && <div className="absolute -top-10 -right-10 w-32 h-32 bg-brand-blue/5 rounded-full blur-2xl pointer-events-none group-hover:bg-brand-blue/10 transition-colors" />}
      
      <CardContent className={cn(
        "relative z-10 flex",
        compact ? "p-5 md:p-6 flex-col items-center justify-center gap-4 text-center" : "p-8 flex-col md:flex-row items-center justify-between gap-8"
      )}>
        <div className={cn("w-full", compact ? "flex flex-col items-center space-y-2" : "flex-1 space-y-3")}>
          <div className={cn(
            "flex items-center gap-2 px-3 py-1 rounded-full",
            compact ? "mx-auto bg-white border-2 border-brand-blue/10 text-brand-blue shadow-sm" : "w-fit bg-white/10 backdrop-blur-sm border border-white/20 text-blue-200"
          )}>
            <Clock size={14} className={cn("animate-pulse", compact ? "text-brand-orange" : "text-blue-200")} />
            <span className={cn(
              "text-[10px] md:text-xs font-black tracking-wider uppercase",
              compact ? "text-brand-blue" : "text-blue-100"
            )}>
              Nejbližší událost
            </span>
          </div>
          
          <Select value={selectedTodoId} onValueChange={setSelectedTodoId}>
            <SelectTrigger className={cn(
              "w-full h-auto py-1 transition-all rounded-xl",
              compact 
                ? "bg-transparent border-none p-0 text-gray-700 font-display text-base md:text-lg shadow-none focus:outline-none focus:ring-0 focus:ring-offset-0 hover:text-brand-blue justify-center" 
                : "bg-white/10 border-white/20 text-white font-display text-xl hover:bg-white/20 md:max-w-md py-3 px-4"
            )}>
              <SelectValue>
                <div className={cn("flex items-center gap-2 truncate origin-center", compact ? "justify-center" : "text-left")}>
                  <CalendarIcon size={compact ? 16 : 18} className="shrink-0 text-gray-400 group-hover:text-brand-blue transition-colors" />
                  <span className="truncate font-bold">{targetTodo?.title}</span>
                </div>
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="rounded-2xl border-2 border-gray-100 shadow-2xl p-2 z-[100]">
              <SelectItem value="default" className="font-bold cursor-pointer rounded-xl py-3 focus:bg-blue-50 focus:text-brand-blue">
                Automaticky: Nejbližší událost
              </SelectItem>
              {upcomingTodos.map(todo => (
                <SelectItem key={todo.id} value={todo.id} className="cursor-pointer rounded-xl py-3 focus:bg-blue-50 focus:text-brand-blue">
                  <div className="flex flex-col gap-1">
                    <span className="font-bold text-gray-800">{todo.title}</span>
                    <span className="text-xs text-gray-400">{todo.dueDate?.toDate().toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {timeLeft ? (
          <div className={cn("flex shrink-0", compact ? "gap-4 bg-transparent p-0 border-none shadow-none mt-2" : "gap-2.5 bg-white p-3 md:p-4 rounded-[1.5rem] shadow-sm border border-brand-blue/5")}>
            {[
              { label: 'Dní', value: timeLeft.days, color: 'text-brand-blue', bg: 'bg-blue-50' },
              { label: 'Hod', value: timeLeft.hours, color: 'text-brand-blue', bg: 'bg-blue-50' },
              { label: 'Min', value: timeLeft.minutes, color: 'text-brand-orange', bg: 'bg-orange-50' },
              { label: 'Sek', value: timeLeft.seconds, color: 'text-brand-orange', bg: 'bg-orange-50' }
            ].map((unit, i) => (
              <div key={i} className="flex flex-col items-center">
                <div className={cn(
                  "flex items-center justify-center font-black font-display transition-all",
                  compact 
                    ? `w-14 h-14 md:w-16 md:h-16 rounded-[1.2rem] ${unit.bg} ${unit.color} text-2xl md:text-3xl shadow-sm border border-white` 
                    : `w-16 h-16 md:w-20 md:h-20 rounded-[1rem] bg-white/10 backdrop-blur-md border border-white/20 text-2xl md:text-3xl shadow-inner group text-white`
                )}>
                  {unit.value.toString().padStart(2, '0')}
                </div>
                <span className={cn(
                  "text-[9px] md:text-[10px] font-black uppercase tracking-widest mt-2",
                  compact ? "text-gray-500" : "text-blue-200"
                )}>
                  {unit.label}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className={cn(
            "px-6 py-4 rounded-2xl text-center font-bold",
            compact ? "bg-gray-50 text-gray-400 border border-gray-100" : "bg-white/10 backdrop-blur-md border border-white/20 text-white"
          )}>
            Není událost
          </div>
        )}
      </CardContent>
    </Card>
  );
}
