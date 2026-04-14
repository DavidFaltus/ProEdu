/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Toaster } from './components/ui/sonner';
import Navbar from './components/Navbar';
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
  return (
    <div className="min-h-screen bg-[#fcfcfc] text-[#2d3436] font-sans flex flex-col">
      <Navbar />
      <main className="flex-grow">
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
              <PrivateRoute role="student">
                <TestTaker />
              </PrivateRoute>
            } 
          />
          <Route 
            path="/review/:id" 
            element={
              <PrivateRoute role="student">
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
            path="/learning" 
            element={
              <PrivateRoute>
                <LearningSheets />
              </PrivateRoute>
            } 
          />
          <Route path="/practice" element={<Practice />} />
          <Route path="/contact" element={<Contact />} />
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

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <AppContent />
      </Router>
    </AuthProvider>
  );
}
