import React, { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { subscribeToStudentLiveLessons } from '../services/liveLessonService';
import { LiveLesson } from '../types';
import { isLessonJoined, markLessonAsJoined, playLessonNotificationSound } from '../lib/liveLessonUtils';
import { toast } from 'sonner';
import { Video, ExternalLink, BellRing, X } from 'lucide-react';

export default function LiveLessonNotificationWatcher() {
  const { user, profile } = useAuth();
  const notifiedLessonIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Only run for authenticated students
    if (!user?.uid || profile?.role === 'teacher') return;

    const unsubscribe = subscribeToStudentLiveLessons(
      user.uid,
      (lessons: LiveLesson[]) => {
        const liveLessons = lessons.filter((l) => l.status === 'live');

        // Check if any live lesson has ended or changed status; if so, remove from notified set
        const liveIds = new Set(liveLessons.map((l) => l.id));
        notifiedLessonIdsRef.current.forEach((id) => {
          if (!liveIds.has(id)) {
            notifiedLessonIdsRef.current.delete(id);
          }
        });

        liveLessons.forEach((lesson) => {
          // If student has already joined, do not alert
          if (isLessonJoined(lesson.id)) return;

          // If already notified for this lesson, do not re-notify immediately
          if (notifiedLessonIdsRef.current.has(lesson.id)) return;

          notifiedLessonIdsRef.current.add(lesson.id);

          // Play pleasant audio chime
          playLessonNotificationSound();

          // Show prominent toast notification
          toast.custom(
            (toastId) => (
              <div className="w-full sm:max-w-md bg-[#1E1B18] text-white p-4 sm:p-5 rounded-2xl shadow-2xl border-2 border-red-500/90 flex flex-col gap-3 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-red-600/20 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />

                <div className="flex items-start justify-between gap-3 relative z-10">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-red-600 text-white flex items-center justify-center shrink-0 shadow-md animate-pulse mt-0.5">
                      <Video size={20} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="flex h-2.5 w-2.5 relative">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-600 text-white">
                          Online hodina právě probíhá
                        </span>
                      </div>
                      <h4 className="font-black text-base text-white mt-1 leading-snug">
                        {lesson.title}
                      </h4>
                      <p className="text-xs text-gray-300 mt-1">
                        Lektor <span className="text-amber-300 font-bold">{lesson.teacherName}</span> čeká v hovoru Google Meet.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => toast.dismiss(toastId)}
                    className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                    title="Zavřít"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10 relative z-10">
                  <button
                    onClick={() => {
                      toast.dismiss(toastId);
                      // Allow re-notifying after 3 minutes if still not joined
                      setTimeout(() => {
                        notifiedLessonIdsRef.current.delete(lesson.id);
                      }, 180000);
                    }}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    Připomenout za chvíli
                  </button>

                  <button
                    onClick={() => {
                      markLessonAsJoined(lesson.id);
                      toast.dismiss(toastId);
                      window.open(lesson.meetUrl, '_blank', 'noopener,noreferrer');
                    }}
                    className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black flex items-center gap-1.5 shadow-lg shadow-red-600/40 transition-transform hover:scale-105 cursor-pointer"
                  >
                    <Video size={14} />
                    <span>Připojit se na hodinu</span>
                    <ExternalLink size={13} />
                  </button>
                </div>
              </div>
            ),
            {
              duration: 25000,
              position: 'top-right',
            }
          );
        });
      },
      (err) => {
        console.error('LiveLessonNotificationWatcher error:', err);
      }
    );

    return () => unsubscribe();
  }, [user?.uid, profile?.role]);

  return null;
}
