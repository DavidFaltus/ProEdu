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
  Mail
} from 'lucide-react';
import { cn, safeToDate } from '../lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { toast } from 'sonner';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

const EMOJIS = ['🎓', '🦊', '🦁', '🦉', '🦖', '🚀', '🧠', '👾', '🌟', '🦄', '🐼', '🐯', '🐧', '🐨', '🎯', '🎨', '🎮', '🎧', '🐱', '🐶'];
const COLORS = ['#FEF3C7', '#FEE2E2', '#E0F2FE', '#D1FAE5', '#F3E8FF', '#FCE7F3', '#FFEDD5', '#E2E8F0', '#CFFAFE', '#F5F5F5'];

export default function StudentSidebar() {
  const { profile, signOut, isProfileSettingsOpen, setIsProfileSettingsOpen, updateProfileData } = useAuth();
  const [isAvatarModalOpen, setIsAvatarModalOpen] = React.useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const [newTeacherTodosCount, setNewTeacherTodosCount] = React.useState(0);
  const [pendingTestsCount, setPendingTestsCount] = React.useState(0);
  const [newSheetsCount, setNewSheetsCount] = React.useState(0);

  React.useEffect(() => {
    if (!profile?.uid) return;

    const lastViewed = profile.lastViewedActivityAt ? safeToDate(profile.lastViewedActivityAt) : new Date(0);

    const q = query(
      collection(db, 'todos'),
      where('studentId', '==', profile.uid),
      where('completed', '==', false)
    );
    const unsub = onSnapshot(q, (snap) => {
      const teacherTodos = snap.docs.filter(doc => {
        const data = doc.data();
        const createdAt = safeToDate(data.createdAt) || new Date(0);
        return data.addedBy !== profile.uid && createdAt > lastViewed;
      });
      setNewTeacherTodosCount(teacherTodos.length);
    });

    const qTests = query(
      collection(db, 'assignedTests'),
      where('studentId', '==', profile.uid),
      where('status', '==', 'pending')
    );
    const unsubTests = onSnapshot(qTests, (snap) => {
      const newTests = snap.docs.filter(doc => {
        const data = doc.data();
        const assignedAt = safeToDate(data.assignedAt) || new Date(0);
        return assignedAt > lastViewed;
      });
      setPendingTestsCount(newTests.length);
    });

    const qSheets = query(
      collection(db, 'learningSheets')
    );
    const unsubSheets = onSnapshot(qSheets, (snap) => {
      const newSheets = snap.docs.filter(doc => {
        const data = doc.data();
        const createdAt = safeToDate(data.createdAt) || new Date(0);
        return createdAt > lastViewed;
      });
      setNewSheetsCount(newSheets.length);
    });

    return () => {
      unsub();
      unsubTests();
      unsubSheets();
    };
  }, [profile?.uid, profile?.lastViewedActivityAt]);

  const totalNotifications = newTeacherTodosCount + pendingTestsCount + newSheetsCount;

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };



  const menuItems: { name: string; path: string; icon: any; active: boolean; onClick?: () => void }[] = [
    {
      name: 'Studijní cesta',
      path: '/student',
      icon: LayoutDashboard,
      active: (location.pathname === '/student' || location.pathname === '/dashboard') && location.hash !== '#garden'
    },
    {
      name: 'Kurzy',
      path: '/courses',
      icon: GraduationCap,
      active: location.pathname.startsWith('/courses')
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
      active: location.pathname.startsWith('/learning')
    },
    {
      name: 'Úkoly',
      path: '/todo',
      icon: CheckSquare,
      active: location.pathname.startsWith('/todo')
    },
    {
      name: 'Zahrádka',
      path: '/garden',
      icon: Sprout,
      active: location.pathname === '/garden'
    }
  ];

  return (
    <aside className="w-64 md:w-72 shrink-0 bg-white border-r border-gray-100 flex flex-col justify-between p-6 h-screen sticky top-0 shadow-sm z-30">
      <div className="space-y-8 flex-1 flex flex-col">
        {/* Logo and Brand */}
        <Link to="/" className="flex flex-row items-center gap-2 group py-2 pl-2">
          <img 
            src="/photo/logo2.svg" 
            alt="ProEdu" 
            className="h-[51px] w-auto group-hover:scale-105 transition-transform"
            referrerPolicy="no-referrer"
          />
          <span className="font-playful text-3xl text-[#F5C400] leading-none mt-4">-cator</span>
        </Link>

        {/* Navigation Links */}
        <nav className="space-y-2 flex-1 pt-4">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const activeStyle = item.active 
              ? 'bg-[#F5C400] text-[#1E1B18] font-black border-b-4 border-[#C29B00] shadow-md scale-[1.02]' 
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 font-bold';
            
            return (
              <Link
                key={item.name}
                to={item.path}
                onClick={item.onClick}
                className={cn(
                  "flex items-center gap-4 px-4 py-3.5 rounded-[1.25rem] text-sm tracking-wide transition-all select-none",
                  activeStyle
                )}
              >
                <Icon size={20} className={cn("shrink-0", item.active ? "text-[#1E1B18]" : "text-gray-400")} />
                <span>{item.name}</span>
              </Link>
            );
          })}

        </nav>
      </div>

      {/* User Profile Card Footer */}
      <div className="border-t border-gray-100 pt-6 mt-auto flex flex-col gap-2">
        <Link
          to="/settings"
          className={cn(
            "w-full flex items-center gap-4 px-4 py-3 rounded-[1.25rem] text-sm tracking-wide transition-all select-none cursor-pointer",
            location.pathname === '/settings'
              ? 'bg-[#F5C400] text-[#1E1B18] font-black border-b-4 border-[#C29B00] shadow-md scale-[1.02]'
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 font-bold'
          )}
        >
          <Settings size={20} className={cn("shrink-0", location.pathname === '/settings' ? "text-[#1E1B18]" : "text-gray-400")} />
          <span>Nastavení</span>
        </Link>

        <div className="bg-[#FAF7F0] p-4 rounded-[1.5rem] flex items-center gap-3 border border-gray-200/50">
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
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-bold text-gray-800 truncate leading-tight flex items-center gap-1.5">
              {profile?.name || 'Můj profil'}
              {totalNotifications > 0 && (
                <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" title="Máš nové aktivity!" />
              )}
            </h4>
          </div>
          
          <button
            onClick={() => navigate('/student?tab=activity')}
            className={cn(
              "p-2 rounded-xl transition-all shrink-0 cursor-pointer relative",
              totalNotifications > 0 
                ? "text-red-500 bg-red-50 hover:bg-red-100" 
                : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
            )}
            title={totalNotifications > 0 ? `Máš ${totalNotifications} nových aktivit!` : "Žádné nové aktivity"}
          >
            <Mail size={16} />
            {totalNotifications > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white font-black text-[9px] w-4 h-4 rounded-full flex items-center justify-center">
                {totalNotifications}
              </span>
            )}
          </button>

          <button 
            onClick={handleSignOut} 
            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all shrink-0 cursor-pointer"
            title="Odhlásit se"
          >
            <LogOut size={16} />
          </button>
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
