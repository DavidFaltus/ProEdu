import * as React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  LayoutDashboard, 
  Sprout, 
  GraduationCap, 
  BookOpen, 
  Play, 
  Settings, 
  LogOut,
  CheckSquare,
  Bell,
  LogIn,
  Lock
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { toast } from 'sonner';
import { useNotifications } from '../hooks/useNotifications';
import NotificationPopover from './NotificationPopover';
import { trackSectionClick } from '../services/analyticsService';

const EMOJIS = ['🎓', '🦊', '🦁', '🦉', '🦖', '🚀', '🧠', '👾', '🌟', '🦄', '🐼', '🐯', '🐧', '🐨', '🎯', '🎨', '🎮', '🎧', '🐱', '🐶'];
const COLORS = ['#FEF3C7', '#FEE2E2', '#E0F2FE', '#D1FAE5', '#F3E8FF', '#FCE7F3', '#FFEDD5', '#E2E8F0', '#CFFAFE', '#F5F5F5'];

interface StudentSidebarProps {
  onNavigate?: () => void;
  className?: string;
}

export default function StudentSidebar({ onNavigate, className }: StudentSidebarProps = {}) {
  const { user, profile, loading, isPremium, isTeacher, jokers, signOut, isProfileSettingsOpen, setIsProfileSettingsOpen, updateProfileData, openAuthModal } = useAuth();
  const [isAvatarModalOpen, setIsAvatarModalOpen] = React.useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { notifications, unreadCount, markAllAsRead } = useNotifications();
  const [isNotificationsOpen, setIsNotificationsOpen] = React.useState(false);
  const notificationBtnRef = React.useRef<HTMLButtonElement>(null);

  const handleToggleNotifications = async () => {
    const nextState = !isNotificationsOpen;
    setIsNotificationsOpen(nextState);
    if (nextState) {
      await markAllAsRead();
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const menuItems: { name: string; path: string; icon: any; active: boolean; locked?: boolean; onClick?: () => void }[] = [
    {
      name: 'Hlavní stránka',
      path: '/',
      icon: LayoutDashboard,
      active: location.pathname === '/' || location.pathname === '/student' || location.pathname === '/dashboard'
    },
    {
      name: 'Procvičování',
      path: '/practice',
      icon: Play,
      active: location.pathname.startsWith('/practice')
    },
    {
      name: 'Materiály',
      path: '/learning',
      icon: BookOpen,
      active: location.pathname.startsWith('/learning'),
      locked: !isPremium,
    },
    {
      name: 'Kurzy',
      path: '/courses',
      icon: GraduationCap,
      active: location.pathname.startsWith('/courses'),
    },
    ...(isTeacher ? [{
      name: 'Administrace',
      path: '/teacher',
      icon: GraduationCap,
      active: location.pathname.startsWith('/teacher')
    }] : [])
  ];

  return (
    <aside className={cn("w-64 md:w-72 shrink-0 bg-white border-r border-gray-100 flex flex-col justify-between p-5 sm:p-6 h-full md:h-[100dvh] md:sticky md:top-0 shadow-sm z-30 overflow-y-auto overscroll-contain", className)}>
      <div className="flex-1 flex flex-col min-h-0">
        {/* Logo and Brand */}
        <div className="flex items-center justify-between">
          <Link 
            to="/" 
            onClick={() => {
              trackSectionClick('sidebar_logo', '/');
              if (onNavigate) onNavigate();
            }} 
            className="flex flex-row items-center gap-2 group py-2 pl-2 shrink-0"
          >
            <img 
              src="/photo/logo2.svg" 
              alt="ProEdu" 
              className="h-[46px] md:h-[51px] w-auto group-hover:scale-105 transition-transform"
              referrerPolicy="no-referrer"
            />
            <span className="font-playful text-3xl text-[#F5C400] leading-none mt-3">-cator</span>
          </Link>
          {onNavigate && (
            <button
              onClick={onNavigate}
              className="md:hidden p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              aria-label="Zavřít menu"
            >
              ✕
            </button>
          )}
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 flex flex-col justify-between pt-6 min-h-0">
          <div className="space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const activeStyle = item.active 
                ? 'bg-[#F5C400] text-[#1E1B18] font-black border-b-4 border-[#C29B00] shadow-md scale-[1.02]' 
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 font-bold';
              
              return (
                <Link
                  key={item.name}
                  to={item.path}
                  onClick={() => {
                    trackSectionClick(`sidebar_${item.name}`, item.path);
                    if (item.onClick) item.onClick();
                    if (onNavigate) onNavigate();
                  }}
                  className={cn(
                    "flex items-center gap-4 px-4 py-3.5 rounded-[1.25rem] text-sm tracking-wide transition-all select-none",
                    activeStyle
                  )}
                >
                  <Icon size={20} className={cn("shrink-0", item.active ? "text-[#1E1B18]" : "text-gray-400")} />
                  <span>{item.name}</span>
                  {item.locked && (
                    <Lock size={15} className="ml-auto text-amber-600/90 shrink-0" />
                  )}
                </Link>
              );
            })}
          </div>

          {/* Sekce Nastavení posunutá do horní sekce a připnutá na úplný spodek */}
          {user && (
            <div className="mt-auto pt-4">
              <Link
                to="/settings"
                onClick={() => {
                  trackSectionClick('sidebar_settings', '/settings');
                  if (onNavigate) onNavigate();
                }}
                className={cn(
                  "w-full flex items-center gap-4 px-4 py-3.5 rounded-[1.25rem] text-sm tracking-wide transition-all select-none cursor-pointer",
                  location.pathname === '/settings'
                    ? 'bg-[#F5C400] text-[#1E1B18] font-black border-b-4 border-[#C29B00] shadow-md scale-[1.02]'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 font-bold'
                )}
              >
                <Settings size={20} className={cn("shrink-0", location.pathname === '/settings' ? "text-[#1E1B18]" : "text-gray-400")} />
                <span>Nastavení</span>
              </Link>
            </div>
          )}
        </nav>
      </div>

      {/* User Profile Card Footer */}
      <div className="border-t border-gray-100 pt-5 mt-4 flex flex-col gap-2 relative shrink-0">
        {user || profile ? (
          <>
            <div className="bg-[#FAF7F0] p-3.5 rounded-[1.5rem] border border-gray-200/60 shadow-2xs space-y-2.5">
              {/* Řádek 1: Avatar, Jméno a Akční tlačítka (Notifikace + Odhlášení) */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <button
                    onClick={() => setIsAvatarModalOpen(true)}
                    className="w-10 h-10 rounded-full overflow-hidden border-2 border-white shrink-0 shadow-sm cursor-pointer hover:scale-105 transition-transform flex items-center justify-center"
                    style={{ backgroundColor: profile?.avatarBgColor || '#FEF3C7' }}
                    title="Změnit avatar"
                  >
                    {profile?.avatarEmoji ? (
                      <span className="text-xl leading-none">{profile.avatarEmoji}</span>
                    ) : profile?.photoURL ? (
                      <img src={profile.photoURL} alt={profile.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xl leading-none">🎓</span>
                    )}
                  </button>

                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-gray-800 truncate leading-tight flex items-center gap-1.5" title={profile?.name}>
                      {profile?.name || 'Můj profil'}
                      {unreadCount > 0 && (
                        <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse shrink-0" title="Máš nová upozornění!" />
                      )}
                    </h4>
                    <p className="text-[11px] text-gray-400 truncate font-medium">
                      {profile?.email || ''}
                    </p>
                  </div>
                </div>

                {/* Tlačítka pro notifikace a odhlášení */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    ref={notificationBtnRef}
                    onClick={handleToggleNotifications}
                    className={cn(
                      "p-1.5 rounded-xl transition-all shrink-0 cursor-pointer relative",
                      isNotificationsOpen
                        ? "bg-[#F5C400] text-[#1E1B18] shadow-xs"
                        : unreadCount > 0 
                          ? "text-red-500 bg-red-50 hover:bg-red-100" 
                          : "text-gray-400 hover:text-gray-600 hover:bg-white"
                    )}
                    title={unreadCount > 0 ? `Máš ${unreadCount} nových aktivit!` : "Upozornění"}
                    aria-label="Upozornění"
                  >
                    <Bell size={16} />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-red-500 text-white font-black text-[9px] w-4 h-4 rounded-full flex items-center justify-center animate-pulse">
                        {unreadCount}
                      </span>
                    )}
                  </button>

                  <button 
                    onClick={handleSignOut} 
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-white rounded-xl transition-all shrink-0 cursor-pointer"
                    title="Odhlásit se"
                  >
                    <LogOut size={16} />
                  </button>
                </div>
              </div>

              {/* Řádek 2: Role / Odznáček plánu a žolíky */}
              <div className="pt-2 border-t border-gray-200/50 flex items-center justify-between gap-1.5">
                {profile?.role === 'premium' ? (
                  <span className="w-full text-center text-[10px] font-black uppercase tracking-wider text-amber-800 bg-amber-100/90 py-1 px-2.5 rounded-lg border border-amber-200/60 flex items-center justify-center gap-1 shadow-2xs">
                    ✨ Premium účet
                  </span>
                ) : profile?.role === 'course' ? (
                  <span className="w-full text-center text-[10px] font-black uppercase tracking-wider text-blue-800 bg-blue-100/90 py-1 px-2.5 rounded-lg border border-blue-200/60 flex items-center justify-center gap-1 shadow-2xs">
                    🎓 Kurz student
                  </span>
                ) : profile?.role === 'teacher' ? (
                  <span className="w-full text-center text-[10px] font-black uppercase tracking-wider text-purple-800 bg-purple-100/90 py-1 px-2.5 rounded-lg border border-purple-200/60 flex items-center justify-center gap-1 shadow-2xs">
                    👑 Učitel
                  </span>
                ) : (
                  <div className="flex items-center justify-between w-full">
                    <span className="text-[10px] font-black uppercase tracking-wider text-gray-600 bg-gray-100/80 px-2 py-0.5 rounded-lg border border-gray-200/70">
                      Základní plán
                    </span>
                    <span className="text-[10px] font-bold text-gray-700 bg-white px-2 py-0.5 rounded-lg border border-gray-200/70 flex items-center gap-1.5 shadow-2xs">
                      <span>🃏</span>
                      <span className="font-mono font-black text-gray-900">{jokers}</span>
                      <span className="text-gray-500 font-semibold">žolíků</span>
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Floating Notification Popover */}
            <NotificationPopover
              isOpen={isNotificationsOpen}
              onClose={() => setIsNotificationsOpen(false)}
              notifications={notifications}
              unreadCount={unreadCount}
              onMarkAllAsRead={markAllAsRead}
              triggerRef={notificationBtnRef}
            />
          </>
        ) : loading ? (
          <div className="bg-[#FAF7F0] p-4 rounded-[1.5rem] border border-gray-200/50 space-y-2.5 animate-pulse">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-full bg-gray-200/70 shrink-0" />
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="h-3.5 bg-gray-200/70 rounded w-3/4" />
                <div className="h-2.5 bg-gray-200/50 rounded w-1/2" />
              </div>
            </div>
            <div className="h-4 bg-gray-200/60 rounded-lg w-full" />
          </div>
        ) : (
          <div className="bg-[#FAF7F0] p-4 rounded-[1.5rem] border border-gray-200/50 space-y-2.5 text-center">
            <p className="text-xs text-gray-500 font-bold">Pro plný přístup se přihlas</p>
            <button
              type="button"
              onClick={openAuthModal}
              className="w-full h-11 rounded-xl bg-[#1E1B18] text-[#FAF7F0] hover:bg-[#332f2b] font-black text-xs flex items-center justify-center gap-2 shadow-sm transition-transform active:scale-95 cursor-pointer"
            >
              <LogIn size={16} />
              Přihlásit se
            </button>
          </div>
        )}

        {/* Legal links */}
        <div className="pt-2 flex items-center justify-center gap-2 text-[11px] text-gray-400 font-medium select-none">
          <Link
            to="/terms"
            onClick={onNavigate}
            className="hover:text-gray-700 hover:underline transition-colors"
          >
            Podmínky
          </Link>
          <span>•</span>
          <Link
            to="/gdpr"
            onClick={onNavigate}
            className="hover:text-gray-700 hover:underline transition-colors"
          >
            GDPR
          </Link>
          <span>•</span>
          <Link
            to="/contact"
            onClick={onNavigate}
            className="hover:text-gray-700 hover:underline transition-colors"
          >
            Kontakt
          </Link>
        </div>
      </div>


      <Dialog open={isAvatarModalOpen} onOpenChange={setIsAvatarModalOpen}>
        <DialogContent className="rounded-[2.5rem] p-8 border-none shadow-2xl max-w-md bg-white">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-2xl font-display font-black text-[#1E1B18]">
              Vyber si svůj profil
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            <div>
              <label className="font-bold text-gray-700 text-sm block mb-3">Vyber si emoji</label>
              <div className="grid grid-cols-5 gap-3 max-h-40 overflow-y-auto p-2 bg-gray-50 rounded-2xl border border-gray-100">
                {EMOJIS.map(emoji => (
                  <button
                    key={emoji}
                    onClick={async () => {
                      try {
                        await updateProfileData({ avatarEmoji: emoji });
                        toast.success('Emoji uloženo!');
                      } catch (err) {
                        toast.error('Chyba při ukládání.');
                      }
                    }}
                    className={cn(
                      "w-12 h-12 rounded-xl text-2xl flex items-center justify-center hover:bg-white hover:scale-110 hover:shadow-sm transition-all cursor-pointer",
                      profile?.avatarEmoji === emoji ? "bg-white border-2 border-[#B80053]" : "border border-transparent"
                    )}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="font-bold text-gray-700 text-sm block mb-3">Vyber si barvu pozadí</label>
              <div className="grid grid-cols-5 gap-3 p-2 bg-gray-50 rounded-2xl border border-gray-100">
                {COLORS.map(color => (
                  <button
                    key={color}
                    onClick={async () => {
                      try {
                        await updateProfileData({ avatarBgColor: color });
                        toast.success('Barva uložena!');
                      } catch (err) {
                        toast.error('Chyba při ukládání.');
                      }
                    }}
                    style={{ backgroundColor: color }}
                    className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center hover:scale-110 hover:shadow-sm transition-all cursor-pointer border-2",
                      profile?.avatarBgColor === color ? "border-[#B80053]" : "border-white"
                    )}
                  >
                    {profile?.avatarBgColor === color && <span className="text-[#B80053] font-bold text-xs">✓</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
