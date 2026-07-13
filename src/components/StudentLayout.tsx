import { Outlet } from 'react-router-dom';
import StudentSidebar from './StudentSidebar';

export default function StudentLayout() {
  return (
    <div className="min-h-screen bg-[#FAF6EE] text-[#1E1B18] font-sans flex overflow-hidden">
      {/* Sidebar - hidden on mobile, visible on md and up */}
      <div className="hidden md:block">
        <StudentSidebar />
      </div>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-y-auto relative">
        <div className="flex-grow p-4 md:p-10 max-w-[1600px] w-full mx-auto pb-24">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
