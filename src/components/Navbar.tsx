import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/button';
import { 
  User as UserIcon, 
  LogOut, 
  LayoutDashboard, 
  ArrowLeft,
  Settings,
  BookOpen,
  GraduationCap
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

export default function Navbar() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const isHome = location.pathname === '/';

  return (
    <nav className="px-6 md:px-12 py-6 flex justify-between items-center w-full bg-white/80 backdrop-blur-md sticky top-0 z-50 border-b border-gray-100">
      <div className="flex items-center gap-10">
        <Link to="/" className="flex items-center gap-2 group">
          <img 
            src="https://www.pro-edu.eu/wp-content/uploads/2023/04/logo-proedu-2.png" 
            alt="ProEdu" 
            className="h-10 md:h-12 w-auto group-hover:scale-105 transition-transform"
            referrerPolicy="no-referrer"
          />
        </Link>
        
        <div className="hidden lg:flex items-center gap-8">
          <Link to="/" className="text-gray-600 font-bold hover:text-brand-blue transition-colors">O nás</Link>
          <Link to="/learning" className="text-gray-600 font-bold hover:text-brand-blue transition-colors">Materiály</Link>
          <Link to="/practice" className="text-gray-600 font-bold hover:text-brand-blue transition-colors">Procvičování</Link>
          <Link to="/contact" className="text-gray-600 font-bold hover:text-brand-blue transition-colors">Kontakt</Link>
        </div>
      </div>

      <div className="flex items-center gap-6">
        {user ? (
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <div className="font-display font-black text-brand-blue text-lg leading-none mb-1">
                {profile?.role === 'teacher' ? 'Učitel' : 'Student'}
              </div>
              <div className="text-xs font-bold text-gray-400 truncate max-w-[150px] uppercase tracking-widest">
                {profile?.name || 'Můj účet'}
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-brand-blue hover:bg-blue-100 transition-all group">
                <UserIcon size={24} className="group-hover:rotate-12 transition-transform" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 rounded-[2rem] p-3 shadow-3xl border-none bg-white/95 backdrop-blur-md">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="font-display text-xl px-4 py-3 text-brand-blue">
                    Ahoj, {profile?.name?.split(' ')[0] || 'Uživateli'}! 👋
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator className="bg-gray-50 mx-2" />
                
                <DropdownMenuItem className="rounded-2xl cursor-pointer focus:bg-blue-50 focus:text-brand-blue p-3 transition-colors">
                  <Link to={profile?.role === 'teacher' ? '/teacher' : '/student'} className="flex items-center gap-3 font-bold w-full">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-brand-blue">
                      <LayoutDashboard size={20} />
                    </div>
                    Moje nástěnka
                  </Link>
                </DropdownMenuItem>

                <DropdownMenuItem className="rounded-2xl cursor-pointer focus:bg-purple-50 focus:text-brand-purple p-3 transition-colors">
                  <Link to="/learning" className="flex items-center gap-3 font-bold w-full">
                    <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-brand-purple">
                      <BookOpen size={20} />
                    </div>
                    Materiály
                  </Link>
                </DropdownMenuItem>

                {profile?.role === 'teacher' && (
                  <DropdownMenuItem className="rounded-2xl cursor-pointer focus:bg-orange-50 focus:text-brand-orange p-3 transition-colors">
                    <Link to="/teacher" className="flex items-center gap-3 font-bold w-full">
                      <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center text-brand-orange">
                        <GraduationCap size={20} />
                      </div>
                      Správa výuky
                    </Link>
                  </DropdownMenuItem>
                )}

                <DropdownMenuSeparator className="bg-gray-50 mx-2" />
                
                <DropdownMenuItem 
                  onClick={handleSignOut}
                  className="rounded-2xl cursor-pointer text-red-500 focus:text-red-600 focus:bg-red-50 p-3 transition-colors"
                >
                  <div className="flex items-center gap-3 font-bold">
                    <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                      <LogOut size={20} />
                    </div>
                    Odhlásit se
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <Link to="/login" className="text-gray-600 font-bold hover:text-brand-blue transition-colors hidden sm:block">
              Přihlásit se
            </Link>
            <Link 
              to="/login" 
              className="btn-orange rounded-2xl px-8 h-12 text-base font-bold shadow-xl shadow-orange-200 hover:scale-105 transition-transform flex items-center justify-center"
            >
              Začít se učit
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
}
