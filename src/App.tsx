import * as React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Toaster } from './components/ui/sonner';
import Navbar from './components/Navbar';
import StudentSidebar from './components/StudentSidebar';
import Home from './pages/Home';
import Login from './pages/Login';
import StudentDashboard from './pages/StudentDashboard';
import TeacherDashboard from './pages/TeacherDashboard';
import TestTaker from './pages/TestTaker';
import TestReview from './pages/TestReview';
import GradingPanel from './pages/GradingPanel';
import LearningSheets from './pages/LearningSheets';
import Practice from './pages/Practice';
import Contact from './pages/Contact';
import Courses from './pages/Courses';
import CourseDetail from './pages/CourseDetail';
import Garden from './pages/Garden';
import TodoPage from './pages/TodoPage';
import Settings from './pages/Settings';
import FloatingTimer from './components/FloatingTimer';

function PrivateRoute({ children, role }: { children: React.ReactNode, role?: 'student' | 'teacher' }) {
  const { user, profile, loading } = useAuth();

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-screen gap-4">
      <div className="w-12 h-12 border-4 border-brand-blue border-t-transparent rounded-full animate-spin" />
      <p className="text-brand-blue font-bold">Načítání...</p>
    </div>
  );
  
  if (!user) return <Navigate to="/login" />;
  
  // If a role is required, we must wait for the profile to be available
  if (role && !profile) return (
    <div className="flex flex-col items-center justify-center h-screen gap-4">
      <div className="w-12 h-12 border-4 border-brand-orange border-t-transparent rounded-full animate-spin" />
      <p className="text-brand-orange font-bold">Načítání profilu...</p>
    </div>
  );
  
  if (role && profile?.role !== role) return <Navigate to="/" />;

  return <>{children}</>;
}

function AppContent() {
  const location = useLocation();
  const { user, profile } = useAuth();

  // Determine if we should show the sidebar layout:
  // User must be logged in, must be a student, and must not be on landing page, login page, taking or reviewing a test.
  const isStudentView = user && profile?.role === 'student' && 
    location.pathname !== '/' && 
    location.pathname !== '/login';

  if (isStudentView) {
    return (
      <div className="min-h-screen bg-[#FAF6EE] text-[#1E1B18] font-sans flex overflow-hidden">
        {/* Sidebar */}
        <div className="hidden md:block">
          <StudentSidebar />
        </div>
        
        {/* Main Content Area */}
        <main className="flex-grow flex flex-col h-screen overflow-y-auto relative">
          <div className="flex-grow p-4 md:p-10 max-w-[1600px] w-full mx-auto pb-24">
            <Routes>
              <Route path="/student" element={<PrivateRoute role="student"><StudentDashboard /></PrivateRoute>} />
              <Route path="/courses" element={<PrivateRoute><Courses /></PrivateRoute>} />
              <Route path="/courses/:id" element={<PrivateRoute><CourseDetail /></PrivateRoute>} />
              <Route path="/learning" element={<PrivateRoute><LearningSheets /></PrivateRoute>} />
              <Route path="/practice" element={<PrivateRoute><Practice /></PrivateRoute>} />
              <Route path="/contact" element={<PrivateRoute><Contact /></PrivateRoute>} />
              <Route path="/garden" element={<PrivateRoute role="student"><Garden /></PrivateRoute>} />
              <Route path="/todo" element={<PrivateRoute role="student"><TodoPage /></PrivateRoute>} />
              <Route path="/settings" element={<PrivateRoute><Settings /></PrivateRoute>} />
              <Route path="/test/:id" element={<PrivateRoute><TestTaker /></PrivateRoute>} />
              <Route path="/review/:id" element={<PrivateRoute><TestReview /></PrivateRoute>} />
              <Route path="*" element={<Navigate to="/student" />} />
            </Routes>
          </div>
        </main>
        <FloatingTimer />
        <Toaster />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle,_#ffffff_0%,_#e1f1ff_100%)] text-[#555] font-sans flex flex-col">
      <Navbar />
      <main className="flex-grow flex flex-col">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route 
            path="/dashboard" 
            element={
              <PrivateRoute>
                <DashboardRedirect />
              </PrivateRoute>
            } 
          />
          <Route 
            path="/student" 
            element={
              <PrivateRoute role="student">
                <StudentDashboard />
              </PrivateRoute>
            } 
          />
          <Route 
            path="/teacher" 
            element={
              <PrivateRoute role="teacher">
                <TeacherDashboard />
              </PrivateRoute>
            } 
          />
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
          <Route 
            path="/grade/:id" 
            element={
              <PrivateRoute role="teacher">
                <GradingPanel />
              </PrivateRoute>
            } 
          />
          <Route 
            path="/courses" 
            element={
              <PrivateRoute>
                <Courses />
              </PrivateRoute>
            } 
          />
          <Route 
            path="/courses/:id" 
            element={
              <PrivateRoute>
                <CourseDetail />
              </PrivateRoute>
            } 
          />
          <Route 
            path="/learning" 
            element={
              <PrivateRoute>
                <LearningSheets />
              </PrivateRoute>
            } 
          />
          <Route path="/practice" element={<Practice />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/settings" element={<PrivateRoute><Settings /></PrivateRoute>} />
        </Routes>
      </main>
      <Toaster />
    </div>
  );
}

function DashboardRedirect() {
  const { profile, loading } = useAuth();
  if (loading || !profile) return (
    <div className="flex flex-col items-center justify-center h-screen gap-4">
      <div className="w-12 h-12 border-4 border-brand-blue border-t-transparent rounded-full animate-spin" />
      <p className="text-brand-blue font-bold">Přesměrování...</p>
    </div>
  );
  if (profile.role === 'teacher') return <Navigate to="/teacher" />;
  return <Navigate to="/student" />;
}

import { TimerProvider } from './context/TimerContext';

export default function App() {
  return (
    <AuthProvider>
      <TimerProvider>
        <Router>
          <AppContent />
        </Router>
      </TimerProvider>
    </AuthProvider>
  );
}
