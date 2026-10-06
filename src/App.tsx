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
import { Menu, X } from 'lucide-react';

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

  if (role && profile?.role !== role) {
    return <Navigate to="/" replace />;
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

  return (
    <div className="min-h-screen bg-[#FAF6EE] text-[#1E1B18] font-sans flex flex-col md:flex-row overflow-hidden">
      {/* Desktop Sidebar */}
      <div className="hidden md:block">
        <StudentSidebar />
      </div>

      {/* Mobile Top Bar */}
      <div className="md:hidden flex items-center justify-between px-5 py-3.5 bg-white border-b border-gray-100 sticky top-0 z-40">
        <Link to="/" className="flex items-center gap-2">
          <img 
            src="/photo/logo2.svg" 
            alt="ProEdu" 
            className="h-9 w-auto"
            referrerPolicy="no-referrer"
          />
          <span className="font-playful text-2xl text-[#F5C400] leading-none mt-2">-cator</span>
        </Link>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 rounded-xl text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
          aria-label="Menu"
        >
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div 
            className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-72 max-w-[80vw] bg-white h-full shadow-2xl z-10">
            <StudentSidebar 
              onNavigate={() => setMobileMenuOpen(false)} 
              className="h-full border-r-0"
            />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-grow flex flex-col h-[calc(100vh-61px)] md:h-screen overflow-y-auto relative">
        <div className="flex-grow p-4 md:p-10 max-w-[1600px] w-full mx-auto pb-24">
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

      <FloatingTimer />
      <LiveLessonNotificationWatcher />
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
