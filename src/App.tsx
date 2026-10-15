import * as React from 'react';
import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TimerProvider } from './context/TimerContext';
import { Toaster } from './components/ui/sonner';
import StudentSidebar from './components/StudentSidebar';
import AuthModal from './components/AuthModal';
import FloatingTimer from './components/FloatingTimer';
import LiveLessonNotificationWatcher from './components/LiveLessonNotificationWatcher';
import ErrorBoundary from './components/ErrorBoundary';
import { Menu, X, LayoutDashboard, Play, BookOpen, GraduationCap, Bell, Lock, LogIn, ShieldCheck } from 'lucide-react';
import { useNotifications } from './hooks/useNotifications';
import NotificationPopover from './components/NotificationPopover';
import { cn } from './lib/utils';

// Pages
import Login from './pages/Login';
import StudentDashboard from './pages/StudentDashboard';
import TeacherDashboard from './pages/TeacherDashboard';
import TestTaker from './pages/TestTaker';
import TestReview from './pages/TestReview';
import LearningSheets from './pages/LearningSheets';
import Practice from './pages/Practice';
import Contact from './pages/Contact';
import Courses from './pages/Courses';
import CourseDetail from './pages/CourseDetail';
import Garden from './pages/Garden';
import TodoPage from './pages/TodoPage';
import Settings from './pages/Settings';
import StudyView from './pages/StudyView';
import PracticeSession from './pages/PracticeSession';

import DevMonetizationToolbar from './components/common/DevMonetizationToolbar';

function PrivateRoute({ children, role }: { children: React.ReactNode; role?: 'student' | 'teacher' }) {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 bg-[#FAF6EE]">
        <div className="w-12 h-12 border-4 border-[#1E1B18] border-t-transparent rounded-full animate-spin" />
        <p className="text-[#1E1B18] font-bold text-sm">Načítání...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (role && !profile) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 bg-[#FAF6EE]">
        <div className="w-12 h-12 border-4 border-[#F5C400] border-t-transparent rounded-full animate-spin" />
        <p className="text-[#1E1B18] font-bold text-sm">Načítání profilu...</p>
      </div>
    );
  }

  if (role) {
    if (role === 'teacher' && profile?.role !== 'teacher') {
      return <Navigate to="/" replace />;
    }
    if (role === 'student' && profile?.role === 'teacher') {
      return <Navigate to="/teacher" replace />;
    }
  }

  return <>{children}</>;
}

function DashboardRedirect() {
  const { profile, loading } = useAuth();

  if (loading || !profile) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 bg-[#FAF6EE]">
        <div className="w-12 h-12 border-4 border-[#1E1B18] border-t-transparent rounded-full animate-spin" />
        <p className="text-[#1E1B18] font-bold text-sm">Přesměrování...</p>
      </div>
    );
  }

  if (profile.role === 'teacher') {
    return <Navigate to="/teacher" replace />;
  }

  return <Navigate to="/" replace />;
}

function AppContent() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const { user, profile, isPremium, isTeacher, jokers, openAuthModal } = useAuth();
  const { notifications, unreadCount, markAllAsRead } = useNotifications();
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const notificationBtnRef = React.useRef<HTMLButtonElement>(null);

  const handleToggleNotifications = async () => {
    const nextState = !isNotificationsOpen;
    setIsNotificationsOpen(nextState);
    if (nextState) {
      await markAllAsRead();
    }
  };

  const navItems = [
    {
      label: 'Domů',
      path: '/',
      icon: LayoutDashboard,
      active: location.pathname === '/' || location.pathname === '/student' || location.pathname === '/dashboard'
    },
    {
      label: 'Procvičování',
      path: '/practice',
      icon: Play,
      active: location.pathname.startsWith('/practice')
    },
    {
      label: 'Materiály',
      path: '/learning',
      icon: BookOpen,
      active: location.pathname.startsWith('/learning'),
      locked: !isPremium
    },
    {
      label: 'Kurzy',
      path: '/courses',
      icon: GraduationCap,
      active: location.pathname.startsWith('/courses')
    },
    ...(isTeacher ? [{
      label: 'Admin',
      path: '/teacher',
      icon: ShieldCheck,
      active: location.pathname.startsWith('/teacher')
    }] : [])
  ];

  return (
    <div className="min-h-[100dvh] bg-[#FAF6EE] text-[#1E1B18] font-sans flex flex-col md:flex-row overflow-hidden">
      {/* Desktop Sidebar */}
      <div className="hidden md:block">
        <StudentSidebar />
      </div>

      {/* Mobile Top Bar */}
      <div className="md:hidden flex items-center justify-between px-3.5 sm:px-5 py-2.5 bg-white/95 backdrop-blur-md border-b border-gray-100 sticky top-0 z-40 h-14">
        <Link to="/" className="flex items-center gap-1.5 shrink-0">
          <img 
            src="/photo/logo2.svg" 
            alt="ProEdu" 
            className="h-8 w-auto"
            referrerPolicy="no-referrer"
          />
          <span className="font-playful text-2xl text-[#F5C400] leading-none mt-2">-cator</span>
        </Link>

        {/* Action icons right: Jokers, Notifications, Avatar / Login, Hamburger */}
        <div className="flex items-center gap-2 shrink-0">
          {user ? (
            <>
              {profile?.role !== 'premium' && profile?.role !== 'course' && profile?.role !== 'teacher' && (
                <div 
                  className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#FAF7F0] border border-gray-200/70 text-[11px] font-bold text-gray-800"
                  title="Zbývající žolíky na dnešek"
                >
                  <span className="text-xs">🃏</span>
                  <span className="font-mono font-black">{jokers}</span>
                </div>
              )}

              {/* Mobile Notification Button */}
              <button
                ref={notificationBtnRef}
                onClick={handleToggleNotifications}
                className={cn(
                  "p-2 rounded-xl transition-all relative cursor-pointer",
                  isNotificationsOpen
                    ? "bg-[#F5C400] text-[#1E1B18]"
                    : unreadCount > 0 
                      ? "text-red-500 bg-red-50" 
                      : "text-gray-500 hover:bg-gray-100"
                )}
                aria-label="Upozornění"
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span className="absolute 1 top-1 right-1 bg-red-500 text-white font-black text-[9px] w-4 h-4 rounded-full flex items-center justify-center animate-pulse">
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Notification Popover */}
              <NotificationPopover
                isOpen={isNotificationsOpen}
                onClose={() => setIsNotificationsOpen(false)}
                notifications={notifications}
                unreadCount={unreadCount}
                onMarkAllAsRead={markAllAsRead}
                triggerRef={notificationBtnRef}
              />

              {/* Mobile User Avatar */}
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="w-8 h-8 rounded-full overflow-hidden border-2 border-[#F5C400] flex items-center justify-center text-sm shadow-xs cursor-pointer"
                style={{ backgroundColor: profile?.avatarBgColor || '#FEF3C7' }}
                title={profile?.name || 'Profil'}
              >
                {profile?.avatarEmoji ? (
                  <span>{profile.avatarEmoji}</span>
                ) : profile?.photoURL ? (
                  <img src={profile.photoURL} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span>🎓</span>
                )}
              </button>
            </>
          ) : (
            <button
              onClick={openAuthModal}
              className="px-3 py-1.5 rounded-xl bg-[#1E1B18] text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs"
            >
              <LogIn size={13} />
              <span>Přihlásit</span>
            </button>
          )}

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-xl text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
            aria-label="Menu"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer (Left or Full Slide-in) */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div 
            className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-72 max-w-[85vw] bg-white h-full shadow-2xl z-10 animate-in slide-in-from-left duration-200">
            <StudentSidebar 
              onNavigate={() => setMobileMenuOpen(false)} 
              className="h-full border-r-0"
            />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-grow flex flex-col h-[calc(100dvh-56px)] md:h-[100dvh] overflow-y-auto relative overscroll-y-contain">
        <div className="flex-grow p-3.5 sm:p-5 md:p-8 lg:p-10 max-w-[1600px] w-full mx-auto pb-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] md:pb-24">
          <Routes>
            {/* Hlavní stránka = Nástěnka studenta */}
            <Route path="/" element={<StudentDashboard />} />
            <Route path="/student" element={<Navigate to="/" replace />} />
            <Route path="/dashboard" element={<DashboardRedirect />} />

            {/* Procvičování & Materiály & Výuka */}
            <Route path="/practice" element={<Practice />} />
            <Route path="/practice/session/:subtopicId" element={<PracticeSession />} />
            <Route path="/learning" element={<LearningSheets />} />
            <Route path="/courses" element={<Courses />} />
            <Route path="/courses/:id" element={<CourseDetail />} />
            <Route path="/garden" element={<PrivateRoute role="student"><Garden /></PrivateRoute>} />
            <Route path="/todo" element={<PrivateRoute role="student"><TodoPage /></PrivateRoute>} />
            <Route path="/study/:subtopicId" element={<StudyView />} />
            <Route
              path="/test/:id"
              element={
                <PrivateRoute>
                  <TestTaker />
                </PrivateRoute>
              }
            />
            <Route
              path="/review/:id"
              element={
                <PrivateRoute>
                  <TestReview />
                </PrivateRoute>
              }
            />

            {/* Administrace pro učitele */}
            <Route
              path="/teacher"
              element={
                <PrivateRoute role="teacher">
                  <TeacherDashboard />
                </PrivateRoute>
              }
            />

            {/* Nastavení, Kontakt a Přihlášení */}
            <Route
              path="/settings"
              element={
                <PrivateRoute>
                  <Settings />
                </PrivateRoute>
              }
            />
            <Route path="/contact" element={<Contact />} />
            <Route path="/login" element={<Login />} />

            {/* Fallback na hlavní stránku */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-gray-200/80 px-2 py-1 pb-[calc(env(safe-area-inset-bottom,0px)+0.35rem)] flex items-center justify-around shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              to={item.path}
              className={cn(
                "flex flex-col items-center justify-center min-w-[56px] py-1 px-2 rounded-2xl transition-all relative select-none",
                item.active 
                  ? "text-[#1E1B18] font-black" 
                  : "text-gray-500 hover:text-gray-900 font-bold"
              )}
            >
              <div className={cn(
                "p-1.5 rounded-xl transition-all",
                item.active ? "bg-[#F5C400] text-[#1E1B18] shadow-xs" : ""
              )}>
                <Icon size={19} />
              </div>
              <span className="text-[10px] tracking-tight leading-none mt-1">
                {item.label}
              </span>
              {item.locked && (
                <Lock size={10} className="absolute top-1 right-2 text-amber-700" />
              )}
            </Link>
          );
        })}
      </nav>

      <FloatingTimer />
      <LiveLessonNotificationWatcher />
      <DevMonetizationToolbar />
      <AuthModal />
      <Toaster />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <TimerProvider>
          <Router>
            <AppContent />
          </Router>
        </TimerProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
