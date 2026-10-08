import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Bell, 
  CheckSquare, 
  GraduationCap, 
  Award, 
  MessageSquare, 
  HelpCircle, 
  BookOpen, 
  Video, 
  FileCheck, 
  X, 
  Check, 
  Sparkles,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { cn } from '../lib/utils';
import { AppNotification, NotificationType } from '../hooks/useNotifications';
import { format, isToday, isYesterday } from 'date-fns';
import { cs } from 'date-fns/locale';

interface NotificationPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  unreadCount: number;
  onMarkAllAsRead: () => Promise<void>;
  triggerRef?: React.RefObject<HTMLElement | null>;
}

function formatRelativeTime(date: Date): string {
  try {
    if (!date || isNaN(date.getTime())) return '';
    const diffInMinutes = Math.floor((Date.now() - date.getTime()) / (1000 * 60));
    if (diffInMinutes < 1) return 'Právě teď';
    if (diffInMinutes < 60) return `Před ${diffInMinutes} min`;
    if (isToday(date)) return `Dnes v ${format(date, 'HH:mm')}`;
    if (isYesterday(date)) return `Včera v ${format(date, 'HH:mm')}`;
    return `${format(date, 'd. M.')} v ${format(date, 'HH:mm')}`;
  } catch {
    return '';
  }
}

function getNotificationVisuals(type: NotificationType) {
  switch (type) {
    case 'todo':
      return {
        icon: CheckSquare,
        bg: 'bg-amber-100 text-amber-700',
        badgeBg: 'bg-amber-50 text-amber-800 border-amber-200'
      };
    case 'test':
      return {
        icon: GraduationCap,
        bg: 'bg-purple-100 text-purple-700',
        badgeBg: 'bg-purple-50 text-purple-800 border-purple-200'
      };
    case 'test_review':
      return {
        icon: Award,
        bg: 'bg-emerald-100 text-emerald-700',
        badgeBg: 'bg-emerald-50 text-emerald-800 border-emerald-200'
      };
    case 'inquiry_answer':
      return {
        icon: MessageSquare,
        bg: 'bg-blue-100 text-blue-700',
        badgeBg: 'bg-blue-50 text-blue-800 border-blue-200'
      };
    case 'inquiry_new':
      return {
        icon: HelpCircle,
        bg: 'bg-orange-100 text-orange-700',
        badgeBg: 'bg-orange-50 text-orange-800 border-orange-200'
      };
    case 'sheet':
      return {
        icon: BookOpen,
        bg: 'bg-cyan-100 text-cyan-700',
        badgeBg: 'bg-cyan-50 text-cyan-800 border-cyan-200'
      };
    case 'lesson':
      return {
        icon: Video,
        bg: 'bg-rose-100 text-rose-700',
        badgeBg: 'bg-rose-50 text-rose-800 border-rose-200'
      };
    case 'test_submitted':
      return {
        icon: FileCheck,
        bg: 'bg-indigo-100 text-indigo-700',
        badgeBg: 'bg-indigo-50 text-indigo-800 border-indigo-200'
      };
    default:
      return {
        icon: Bell,
        bg: 'bg-gray-100 text-gray-700',
        badgeBg: 'bg-gray-50 text-gray-800 border-gray-200'
      };
  }
}

export default function NotificationPopover({
  isOpen,
  onClose,
  notifications,
  unreadCount,
  onMarkAllAsRead,
  triggerRef
}: NotificationPopoverProps) {
  const navigate = useNavigate();
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on Escape or click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current && 
        !popoverRef.current.contains(target) &&
        triggerRef?.current && 
        !triggerRef.current.contains(target)
      ) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen, onClose, triggerRef]);

  // Automatically mark all as read whenever popover opens
  useEffect(() => {
    if (isOpen) {
      onMarkAllAsRead();
    }
  }, [isOpen, onMarkAllAsRead]);

  if (!isOpen) return null;

  const handleNotificationClick = async (item: AppNotification) => {
    onClose();
    await onMarkAllAsRead();
    if (item.meetUrl) {
      window.open(item.meetUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    if (item.link) {
      navigate(item.link);
    }
  };

  return (
    <div
      ref={popoverRef}
      className={cn(
        "absolute bottom-[calc(100%+12px)] left-0 z-50",
        "w-[340px] sm:w-[370px] max-w-[calc(100vw-2rem)]",
        "bg-white rounded-[2rem] shadow-2xl border border-gray-100/90",
        "flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      )}
      style={{
        boxShadow: '0 20px 45px -10px rgba(0, 0, 0, 0.18), 0 0 1px 1px rgba(0, 0, 0, 0.05)'
      }}
    >
      {/* Header */}
      <div className="p-4 sm:p-5 bg-[#FAF7F0] border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#F5C400] text-[#1E1B18] flex items-center justify-center font-bold shadow-xs">
            <Bell size={16} />
          </div>
          <div>
            <h3 className="font-display font-black text-base text-[#1E1B18] leading-none">
              Upozornění
            </h3>
            <p className="text-[11px] font-medium text-gray-500 mt-1">
              {unreadCount > 0 
                ? `${unreadCount} ${unreadCount === 1 ? 'nová aktivita' : unreadCount < 5 ? 'nové aktivity' : 'nových aktivit'}`
                : 'Vše je přečteno'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {notifications.length > 0 && (
            <button
              onClick={() => onMarkAllAsRead()}
              className="text-[11px] font-bold text-gray-500 hover:text-[#1E1B18] hover:bg-white/80 px-2.5 py-1.5 rounded-xl transition-all flex items-center gap-1 cursor-pointer"
              title="Označit vše jako přečtené"
            >
              <Check size={13} />
              <span>Přečteno</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-white/80 rounded-xl transition-colors cursor-pointer"
            title="Zavřít"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* List */}
      <div className="max-h-[380px] overflow-y-auto divide-y divide-gray-50">
        {notifications.length === 0 ? (
          <div className="py-12 px-6 text-center space-y-3">
            <div className="w-14 h-14 mx-auto rounded-3xl bg-amber-50 text-amber-500 flex items-center justify-center text-2xl shadow-inner">
              🎉
            </div>
            <div>
              <h4 className="font-bold text-gray-800 text-sm">
                Všechno máš hotovo!
              </h4>
              <p className="text-xs text-gray-400 mt-1 max-w-[220px] mx-auto leading-relaxed">
                Nemáš žádná nová upozornění. Skvělá práce, jen tak dál!
              </p>
            </div>
          </div>
        ) : (
          notifications.map((item) => {
            const visual = getNotificationVisuals(item.type);
            const IconComponent = visual.icon;

            return (
              <div
                key={item.id}
                onClick={() => handleNotificationClick(item)}
                className={cn(
                  "p-3.5 sm:p-4 transition-all flex items-start gap-3 cursor-pointer group relative",
                  item.isNew 
                    ? "bg-amber-50/40 hover:bg-amber-50/70" 
                    : "hover:bg-gray-50/80"
                )}
              >
                {/* Visual Icon */}
                <div className={cn(
                  "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-2xs mt-0.5",
                  visual.bg
                )}>
                  <IconComponent size={18} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 pr-1">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className={cn(
                      "text-[10px] font-bold px-2 py-0.5 rounded-full border",
                      visual.badgeBg
                    )}>
                      {item.tagText}
                    </span>
                    <span className="text-[11px] font-medium text-gray-400 shrink-0">
                      {formatRelativeTime(item.timestamp)}
                    </span>
                  </div>

                  <h5 className={cn(
                    "text-xs sm:text-sm font-bold truncate leading-tight transition-colors",
                    item.isNew ? "text-[#1E1B18]" : "text-gray-700 group-hover:text-black"
                  )}>
                    {item.title}
                  </h5>

                  <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">
                    {item.description}
                  </p>
                </div>

                {/* Right indicator arrow */}
                <div className="shrink-0 self-center text-gray-300 group-hover:text-gray-600 group-hover:translate-x-0.5 transition-all">
                  {item.meetUrl ? <ExternalLink size={14} /> : <ChevronRight size={14} />}
                </div>

                {/* Unread dot */}
                {item.isNew && (
                  <span className="absolute top-4 right-3 w-2 h-2 bg-red-500 rounded-full" />
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      {notifications.length > 0 && (
        <div className="p-3 bg-gray-50/70 border-t border-gray-100 flex items-center justify-center">
          <p className="text-[11px] font-semibold text-gray-400 flex items-center gap-1.5">
            <Sparkles size={12} className="text-[#F5C400]" />
            Kliknutím na položku přejdeš přímo k obsahu
          </p>
        </div>
      )}
    </div>
  );
}
