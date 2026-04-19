import React, { useState } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, isToday, startOfWeek, endOfWeek } from 'date-fns';
import { cs } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Circle } from 'lucide-react';
import { TodoItem } from '../types';
import { safeToDate } from '../lib/utils';
import { Button } from './ui/button';

interface QuickCalendarProps {
  todos: TodoItem[];
}

export default function QuickCalendar({ todos }: QuickCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());

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

  return (
    <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-display font-bold text-brand-blue capitalize">
          {format(currentDate, 'MMMM yyyy', { locale: cs })}
        </h3>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" onClick={prevMonth} className="rounded-xl hover:bg-gray-50">
            <ChevronLeft size={20} />
          </Button>
          <Button variant="ghost" size="icon" onClick={nextMonth} className="rounded-xl hover:bg-gray-50">
            <ChevronRight size={20} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2">
        {daysOfWeek.map(day => (
          <div key={day} className="text-center text-xs font-bold text-gray-400 py-2">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {calendarDays.map((day, idx) => {
          const dayTodos = getTodosForDay(day);
          const isCurrentMonth = isSameDay(startOfMonth(day), startOfMonth(currentDate));

          return (
            <div
              key={idx}
              className={`relative aspect-square flex flex-col items-center justify-center rounded-2xl transition-all cursor-pointer hover:bg-blue-50 group
                ${!isCurrentMonth ? 'opacity-20' : ''}
                ${isToday(day) ? 'bg-brand-blue/5 border-2 border-brand-blue/20' : ''}
              `}
            >
              <span className={`text-sm font-bold ${isToday(day) ? 'text-brand-blue' : 'text-gray-600'}`}>
                {format(day, 'd')}
              </span>

              {dayTodos.length > 0 && (
                <div className="flex gap-0.5 mt-1">
                  {dayTodos.slice(0, 3).map((t, i) => (
                    <Circle
                      key={i}
                      size={6}
                      fill={t.completed ? '#10b981' : '#3b82f6'}
                      className={t.completed ? 'text-green-500' : 'text-blue-500'}
                    />
                  ))}
                </div>
              )}

              {dayTodos.length > 0 && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                  <div className="bg-gray-900 text-white text-[10px] rounded-lg py-2 px-3 whitespace-nowrap shadow-xl">
                    {dayTodos.map(t => (
                      <div key={t.id} className="flex items-center gap-2 mb-1 last:mb-0">
                        <div className={`w-1.5 h-1.5 rounded-full ${t.completed ? 'bg-green-500' : 'bg-blue-500'}`} />
                        {t.title}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
