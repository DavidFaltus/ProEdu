import React, { useEffect, useRef, useState, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
  const [coords, setCoords] = useState<{
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
    maxHeight?: number;
    arrowLeft?: number;
    isBottomHalf?: boolean;
  }>({});

  const updatePosition = useCallback(() => {
    if (!triggerRef?.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const popoverWidth = Math.min(370, window.innerWidth - 32);

    const isBottomHalf = rect.top > window.innerHeight / 2;

    let top: number | undefined;
    let bottom: number | undefined;
    let left: number | undefined;
    let right: number | undefined;

    if (isBottomHalf) {
      // Desktop: přiblížit k levé straně obrazovky s elegantním odsazením 20px
      bottom = window.innerHeight - rect.top + 12;
      left = Math.max(16, Math.min(20, window.innerWidth - popoverWidth - 16));
    } else {
      // Mobil: otevírat dolů pod horní lištu, zarovnat k pravému okraji
      top = rect.bottom + 12;
      const idealRight = window.innerWidth - rect.right - 4;
      right = Math.max(12, Math.min(idealRight, window.innerWidth - popoverWidth - 12));
    }

    // Výpočet pozice středu zvonečku pro kapičku
    const actualLeft = left !== undefined ? left : (window.innerWidth - (right || 0) - popoverWidth);
    const bellCenterX = rect.left + rect.width / 2;
    const rawArrowLeft = bellCenterX - actualLeft;
    const arrowLeft = Math.max(34, Math.min(popoverWidth - 34, rawArrowLeft));

    const maxHeight = isBottomHalf
      ? Math.max(260, Math.min(480, rect.top - 28))
      : Math.max(260, Math.min(480, window.innerHeight - rect.bottom - 28));

    setCoords({ top, bottom, left, right, maxHeight, arrowLeft, isBottomHalf });
  }, [triggerRef]);

  useLayoutEffect(() => {
    if (isOpen) {
      updatePosition();
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);
      return () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition, true);
      };
    }
  }, [isOpen, updatePosition]);

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

  if (!isOpen || typeof document === 'undefined') return null;

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

  return createPortal(
    <>
      {/* Průhledný overlay pro spolehlivé zavření kliknutím mimo */}
      <div 
        className="fixed inset-0 z-[9998] bg-black/5 sm:bg-transparent pointer-events-auto"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={popoverRef}
        role="dialog"
        aria-label="Upozornění"
        className={cn(
          "fixed z-[9999]",
          "w-[340px] sm:w-[370px] max-w-[calc(100vw-24px)]",
          "animate-in fade-in zoom-in-95 duration-200 pointer-events-auto"
        )}
        style={{
          ...(coords.top !== undefined ? { top: `${coords.top}px` } : {}),
          ...(coords.bottom !== undefined ? { bottom: `${coords.bottom}px` } : {}),
          ...(coords.left !== undefined ? { left: `${coords.left}px` } : {}),
          ...(coords.right !== undefined ? { right: `${coords.right}px` } : {}),
          filter: 'drop-shadow(0 20px 30px rgba(0, 0, 0, 0.16))'
        }}
      >
        {/* Kapička nahoře (pokud se popover otevírá směrem dolů pod zvoneček) */}
        {!coords.isBottomHalf && coords.arrowLeft !== undefined && (
          <div 
            className="absolute -top-[9px] z-30 pointer-events-none"
            style={{ left: `${coords.arrowLeft - 13}px` }}
          >
            <svg width="26" height="10" viewBox="0 0 26 10">
              <path d="M0,10 C6,10 9,4 13,0 C17,4 20,10 26,10 Z" fill="#FAF7F0" />
              <path d="M0,10 C6,10 9,4 13,0 C17,4 20,10 26,10" fill="none" stroke="#E5E7EB" strokeWidth="1.2" />
            </svg>
          </div>
        )}

        {/* Hlavní tělo popoveru s oříznutými rohy */}
        <div 
          className="bg-white rounded-[2rem] border border-gray-100/90 flex flex-col overflow-hidden w-full shadow-2xl"
          style={{
            ...(coords.maxHeight ? { maxHeight: `${coords.maxHeight}px` } : {})
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
      <div className="overflow-y-auto divide-y divide-gray-50 flex-1 min-h-0">
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
        <div className="p-3 bg-white border-t border-gray-100 flex items-center justify-center shrink-0">
          <p className="text-[11px] font-semibold text-gray-400 flex items-center gap-1.5">
            <Sparkles size={12} className="text-[#F5C400]" />
            Kliknutím na položku přejdeš přímo k obsahu
          </p>
        </div>
      )}
    </div>

    {/* Kapička dole (pokud se popover otevírá směrem nahoru k tlačítku zvonečku v sidebaru) */}
    {coords.isBottomHalf && coords.arrowLeft !== undefined && (
      <div 
        className="absolute -bottom-[9px] z-30 pointer-events-none"
        style={{ left: `${coords.arrowLeft - 13}px` }}
      >
        <svg width="26" height="10" viewBox="0 0 26 10">
          <path d="M0,0 C6,0 9,6 13,10 C17,6 20,0 26,0 Z" fill="#FFFFFF" />
          <path d="M0,0 C6,0 9,6 13,10 C17,6 20,0 26,0" fill="none" stroke="#E5E7EB" strokeWidth="1.2" />
        </svg>
      </div>
    )}
  </div>
</>,
document.body
);
}
