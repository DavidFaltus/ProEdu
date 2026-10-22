import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Target, BookOpen, MessageSquare, Video, GraduationCap, Users, BarChart3 } from 'lucide-react';
import PracticeManager from '../components/admin/PracticeManager';
import MaterialsManager from '../components/admin/MaterialsManager';
import InquiriesManager from '../components/admin/InquiriesManager';
import LiveLessonsManager from '../components/admin/LiveLessonsManager';
import CoursesManager from '../components/admin/CoursesManager';
import StudentsProgressManager from '../components/admin/StudentsProgressManager';
import SurveyResponsesManager from '../components/admin/SurveyResponsesManager';
import { getAllInquiries, QuestionInquiry } from '../services/inquiryService';
import { subscribeToTeacherLiveLessons } from '../services/liveLessonService';
import { LiveLesson } from '../types';

export default function TeacherDashboard() {
  const { profile: userProfile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const validTabs = ['practices', 'materials', 'students', 'inquiries', 'lessons', 'courses', 'surveys'];
  const tabParam = searchParams.get('tab');
  const activeTab = tabParam && validTabs.includes(tabParam) ? tabParam : 'practices';

  // Overview data state
  const [inquiries, setInquiries] = useState<QuestionInquiry[]>([]);
  const [loadingInquiries, setLoadingInquiries] = useState(true);
  const [lessons, setLessons] = useState<LiveLesson[]>([]);
  const [loadingLessons, setLoadingLessons] = useState(true);

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value });
  };

  const loadInquiries = useCallback(async () => {
    try {
      const data = await getAllInquiries();
      setInquiries(data);
    } catch (err) {
      console.error('Failed to load inquiries:', err);
    } finally {
      setLoadingInquiries(false);
    }
  }, []);

  useEffect(() => {
    loadInquiries();
  }, [loadInquiries]);

  useEffect(() => {
    if (!userProfile?.uid) return;
    const unsub = subscribeToTeacherLiveLessons(
      userProfile.uid,
      (data) => {
        setLessons(data);
        setLoadingLessons(false);
      },
      (err) => {
        console.error('Failed to load teacher live lessons:', err);
        setLoadingLessons(false);
      }
    );
    return () => unsub();
  }, [userProfile?.uid]);

  const hasInquiries = !loadingInquiries && inquiries.length > 0;
  const activeLessons = lessons.filter(l => l.status === 'live' || l.status === 'scheduled');
  const hasLessons = !loadingLessons && activeLessons.length > 0;
  const bothExist = hasInquiries && hasLessons;

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 sm:space-y-8">
      <div>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-gray-900 tracking-tight font-playful mb-2">
          Učitelský panel
        </h1>
        <p className="text-gray-500 font-semibold text-xs sm:text-sm">
          Vítejte zpět, {userProfile?.name || 'Učiteli'}. Zde můžete spravovat svůj obsah a komunikovat se studenty.
        </p>
      </div>

      {/* Management Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="flex flex-nowrap overflow-x-auto gap-2 bg-transparent h-auto p-0 mb-6 sm:mb-8 w-full justify-start border-b border-gray-200 rounded-none pb-3 overscroll-x-contain scrollbar-hide">
          <TabsTrigger 
            value="practices" 
            className="shrink-0 rounded-xl data-[state=active]:bg-white data-[state=active]:text-[#B80053] data-[state=active]:shadow-sm data-[state=active]:border-[#B80053]/20 border border-transparent px-3.5 sm:px-4 py-2 sm:py-2.5 flex items-center gap-2 font-bold text-xs sm:text-sm transition-all"
          >
            <Target size={16} />
            <span>Procvičování</span>
          </TabsTrigger>
          <TabsTrigger 
            value="materials" 
            className="shrink-0 rounded-xl data-[state=active]:bg-white data-[state=active]:text-[#0F5238] data-[state=active]:shadow-sm data-[state=active]:border-[#0F5238]/20 border border-transparent px-3.5 sm:px-4 py-2 sm:py-2.5 flex items-center gap-2 font-bold text-xs sm:text-sm transition-all"
          >
            <BookOpen size={16} />
            <span>Studijní materiály</span>
          </TabsTrigger>
          <TabsTrigger 
            value="students" 
            className="shrink-0 rounded-xl data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm data-[state=active]:border-blue-200 border border-transparent px-3.5 sm:px-4 py-2 sm:py-2.5 flex items-center gap-2 font-bold text-xs sm:text-sm transition-all"
          >
            <Users size={16} />
            <span>Studenti</span>
          </TabsTrigger>
          <TabsTrigger 
            value="inquiries" 
            className="shrink-0 rounded-xl data-[state=active]:bg-white data-[state=active]:text-purple-600 data-[state=active]:shadow-sm data-[state=active]:border-purple-200 border border-transparent px-3.5 sm:px-4 py-2 sm:py-2.5 flex items-center gap-2 font-bold text-xs sm:text-sm transition-all"
          >
            <MessageSquare size={16} />
            <span>Dotazy</span>
            {inquiries.filter(i => i.status === 'pending').length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-black bg-rose-500 text-white">
                {inquiries.filter(i => i.status === 'pending').length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger 
            value="lessons" 
            className="shrink-0 rounded-xl data-[state=active]:bg-white data-[state=active]:text-red-600 data-[state=active]:shadow-sm data-[state=active]:border-red-200 border border-transparent px-3.5 sm:px-4 py-2 sm:py-2.5 flex items-center gap-2 font-bold text-xs sm:text-sm transition-all"
          >
            <Video size={16} />
            <span>Lekce</span>
            {lessons.filter(l => l.status === 'live').length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-black bg-red-600 text-white animate-pulse">
                Živě
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger 
            value="courses" 
            className="shrink-0 rounded-xl data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm data-[state=active]:border-indigo-200 border border-transparent px-3.5 sm:px-4 py-2 sm:py-2.5 flex items-center gap-2 font-bold text-xs sm:text-sm transition-all"
          >
            <GraduationCap size={16} />
            <span>Kurzy</span>
          </TabsTrigger>
          <TabsTrigger 
            value="surveys" 
            className="shrink-0 rounded-xl data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm data-[state=active]:border-blue-200 border border-transparent px-3.5 sm:px-4 py-2 sm:py-2.5 flex items-center gap-2 font-bold text-xs sm:text-sm transition-all"
          >
            <BarChart3 size={16} />
            <span>Dotazníky</span>
          </TabsTrigger>
          </TabsList>

          <TabsContent value="practices">
            <PracticeManager userId={userProfile?.uid || ''} />
          </TabsContent>

          <TabsContent value="materials">
            <MaterialsManager userId={userProfile?.uid || ''} />
          </TabsContent>

          <TabsContent value="students">
            <StudentsProgressManager />
          </TabsContent>

          <TabsContent value="inquiries">
            <InquiriesManager />
          </TabsContent>

          <TabsContent value="lessons">
            <LiveLessonsManager 
              userId={userProfile?.uid || ''} 
              teacherName={userProfile?.name || 'Učitel'} 
            />
          </TabsContent>

          <TabsContent value="courses">
            <CoursesManager userId={userProfile?.uid || ''} />
          </TabsContent>

          <TabsContent value="surveys">
            <SurveyResponsesManager />
          </TabsContent>
        </Tabs>
    </div>
  );
}
