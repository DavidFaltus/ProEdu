import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Target, BookOpen, MessageSquare, Video } from 'lucide-react';
import PracticeManager from '../components/admin/PracticeManager';
import MaterialsManager from '../components/admin/MaterialsManager';
import InquiriesManager from '../components/admin/InquiriesManager';
import LiveLessonsManager from '../components/admin/LiveLessonsManager';

export default function TeacherDashboard() {
  const { profile: userProfile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const validTabs = ['practices', 'materials', 'inquiries', 'lessons'];
  const tabParam = searchParams.get('tab');
  const activeTab = tabParam && validTabs.includes(tabParam) ? tabParam : 'practices';

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value });
  };

  return (
    <div className="min-h-screen bg-[#FAF6EE] p-8 font-sans pb-32">
      <div className="max-w-7xl mx-auto space-y-8">
        <div>
          <h1 className="text-4xl font-black text-gray-900 tracking-tight font-playful mb-2">
            Učitelský panel
          </h1>
          <p className="text-gray-500 font-semibold">
            Vítejte zpět, {userProfile?.name || 'Učiteli'}. Zde můžete spravovat svůj obsah.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="flex flex-wrap gap-2 bg-transparent h-auto p-0 mb-8 w-full justify-start border-b border-gray-200 rounded-none pb-4">
            <TabsTrigger 
              value="practices" 
              className="rounded-xl data-[state=active]:bg-white data-[state=active]:text-[#B80053] data-[state=active]:shadow-sm data-[state=active]:border-[#B80053]/20 border border-transparent px-4 py-2.5 flex items-center gap-2 font-bold transition-all"
            >
              <Target size={18} />
              Procvičování & Banka otázek
            </TabsTrigger>
            <TabsTrigger 
              value="materials" 
              className="rounded-xl data-[state=active]:bg-white data-[state=active]:text-[#0F5238] data-[state=active]:shadow-sm data-[state=active]:border-[#0F5238]/20 border border-transparent px-4 py-2.5 flex items-center gap-2 font-bold transition-all"
            >
              <BookOpen size={18} />
              Studijní materiály
            </TabsTrigger>
            <TabsTrigger 
              value="inquiries" 
              className="rounded-xl data-[state=active]:bg-white data-[state=active]:text-purple-600 data-[state=active]:shadow-sm data-[state=active]:border-purple-200 border border-transparent px-4 py-2.5 flex items-center gap-2 font-bold transition-all"
            >
              <MessageSquare size={18} />
              Dotazy studentů
            </TabsTrigger>
            <TabsTrigger 
              value="lessons" 
              className="rounded-xl data-[state=active]:bg-white data-[state=active]:text-red-600 data-[state=active]:shadow-sm data-[state=active]:border-red-200 border border-transparent px-4 py-2.5 flex items-center gap-2 font-bold transition-all"
            >
              <Video size={18} />
              Lekce
            </TabsTrigger>
          </TabsList>

          <TabsContent value="practices">
            <PracticeManager userId={userProfile?.uid || ''} />
          </TabsContent>

          <TabsContent value="materials">
            <MaterialsManager userId={userProfile?.uid || ''} />
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
        </Tabs>
      </div>
    </div>
  );
}
