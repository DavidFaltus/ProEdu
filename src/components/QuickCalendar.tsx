import React, { useState } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, isToday, startOfWeek, endOfWeek } from 'date-fns';
import { cs } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Circle, Calendar as CalendarIcon, CheckCircle2, Clock, ArrowRight } from 'lucide-react';
import { TodoItem } from '../types';
import { safeToDate, cn } from '../lib/utils';
import { Button } from './ui/button';
import { motion, AnimatePresence } from 'motion/react';

interface QuickCalendarProps {
  todos: TodoItem[];
}

export default function QuickCalendar({ todos }: QuickCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(new Date());

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const calendarDays = eachDayOfInterval({
    start: startDate,
    end: endDate,
  });

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

  const getTodosForDay = (day: Date) => {
    return todos.filter(todo =>
      todo.dueDate && isSameDay(safeToDate(todo.dueDate)!, day)
    );
  };

  const daysOfWeek = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
  const selectedDayTodos = getTodosForDay(selectedDay);

  return (
    <div className="grid lg:grid-cols-[1fr_350px] gap-8 bg-white rounded-[2.5rem] p-8 shadow-xl border border-gray-100 overflow-hidden">
      {/* Calendar Grid Side */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-brand-blue shadow-inner">
              <CalendarIcon size={20} />
            </div>
            <h3 className="text-2xl font-display font-black text-gray-900 capitalize">
              {format(currentDate, 'MMMM yyyy', { locale: cs })}
            </h3>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon" onClick={prevMonth} className="rounded-xl hover:bg-gray-50 border border-transparent hover:border-gray-100 transition-all">
              <ChevronLeft size={20} />
            </Button>
            <Button variant="ghost" size="icon" onClick={nextMonth} className="rounded-xl hover:bg-gray-50 border border-transparent hover:border-gray-100 transition-all">
              <ChevronRight size={20} />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-2 mb-2">
          {daysOfWeek.map(day => (
            <div key={day} className="text-center text-[10px] font-black text-gray-400 uppercase tracking-widest py-2">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2">
          {calendarDays.map((day, idx) => {
            const dayTodos = getTodosForDay(day);
            const isCurrentMonth = isSameDay(startOfMonth(day), startOfMonth(currentDate));
            const isSelected = isSameDay(day, selectedDay);

            return (
              <motion.div
                key={idx}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setSelectedDay(day)}
                className={cn(
                  "relative aspect-square flex flex-col items-center justify-center rounded-2xl transition-all cursor-pointer group border-2",
                  !isCurrentMonth ? "opacity-30" : "opacity-100",
                  isSelected 
                    ? "bg-brand-blue border-brand-blue text-white shadow-lg shadow-blue-100" 
                    : isToday(day)
                      ? "bg-blue-50/50 border-brand-blue/20 text-brand-blue hover:bg-blue-50"
                      : "bg-white border-gray-50 text-gray-600 hover:border-brand-blue/30 hover:bg-blue-50/30"
                )}
              >
                <span className={cn(
                  "text-lg font-display font-bold leading-none mb-1",
                  isSelected ? "text-white" : ""
                )}>
                  {format(day, 'd')}
                </span>

                {dayTodos.length > 0 && (
                  <div className="flex gap-0.5 justify-center">
                    {dayTodos.slice(0, 3).map((t, i) => (
                      <div
                        key={i}
                        className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          isSelected ? "bg-white/80" : t.completed ? "bg-green-500" : "bg-blue-500"
                        )}
                      />
                    ))}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Day Detail Side */}
      <div className="bg-gray-50/50 rounded-[1.5rem] border border-gray-100 flex flex-col min-h-[400px]">
        <div className="p-6 border-b border-gray-100 bg-white rounded-t-[1.5rem]">
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-display font-black text-brand-blue lining-nums leading-none">
              {format(selectedDay, 'd')}
            </span>
            <div className="flex flex-col">
              <span className="text-xs font-black text-gray-400 uppercase tracking-widest leading-none mb-1">
                {format(selectedDay, 'EEEE', { locale: cs })}
              </span>
              <span className="text-sm font-bold text-gray-600">
                {format(selectedDay, 'LLLL yyyy', { locale: cs })}
              </span>
            </div>
          </div>
        </div>

        <div className="flex-1 p-6 overflow-y-auto space-y-4 max-h-[500px] scrollbar-hide">
          <AnimatePresence mode="wait">
            {selectedDayTodos.length > 0 ? (
              <motion.div
                key={selectedDay.toISOString()}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-3"
              >
                {selectedDayTodos.map((todo) => (
                  <div 
                    key={todo.id}
                    className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all group"
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "mt-1 rounded-full p-0.5",
                        todo.completed ? "text-green-500" : "text-brand-blue"
                      )}>
                        {todo.completed ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                      </div>
                      <div className="flex-1">
                        <h4 className={cn(
                          "font-bold text-sm leading-tight text-gray-900 mb-2",
                          todo.completed && "line-through text-gray-400"
                        )}>
                          {todo.title}
                        </h4>
                        <div className="flex items-center justify-between">
                           <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400">
                            <Clock size={12} />
                            {format(safeToDate(todo.dueDate)!, 'HH:mm')}
                          </div>
                          <span className={cn(
                            "px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider",
                            todo.type === 'practice' ? "bg-blue-50 text-blue-600" : "bg-orange-50 text-orange-600"
                          )}>
                            {todo.type === 'practice' ? 'Procvičování' : 'Úkol'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="h-full flex flex-col items-center justify-center text-center py-12"
              >
                <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-gray-200 mb-4 border border-gray-50">
                  <CalendarIcon size={32} />
                </div>
                <p className="text-gray-400 font-bold text-sm">Žádné události</p>
                <p className="text-gray-300 text-xs mt-1">Užijte si volný den!</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {selectedDayTodos.length > 0 && (
          <div className="p-4 mt-auto border-t border-gray-100">
            <Button className="w-full bg-brand-blue hover:bg-brand-blue/90 text-white rounded-xl h-12 font-bold gap-2 text-sm shadow-lg shadow-blue-100">
              Spravovat události
              <ArrowRight size={16} />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
