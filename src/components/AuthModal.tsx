import * as React from 'react';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Lock, Mail, User as UserIcon, Sparkles, LogIn, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

export default function AuthModal() {
  const { isAuthModalOpen, setIsAuthModalOpen, signInWithEmail, signUpWithEmail, signInWithGoogle } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setName('');
  };

  const handleClose = (open: boolean) => {
    setIsAuthModalOpen(open);
    if (!open) {
      resetForm();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        await signInWithEmail(email, password);
        toast.success('Úspěšně přihlášeno! Vítej zpět.');
      } else {
        if (!name.trim()) {
          toast.error('Zadej prosím své jméno.');
          setLoading(false);
          return;
        }
        await signUpWithEmail(email, password, name.trim());
        toast.success('Registrace proběhla úspěšně! Vítej v ProEdu.');
      }
      setIsAuthModalOpen(false);
      resetForm();
    } catch (error: any) {
      console.error('Auth error:', error);
      let message = 'Nastala chyba při ověření.';
      if (
        error.code === 'auth/user-not-found' ||
        error.code === 'auth/wrong-password' ||
        error.code === 'auth/invalid-credential'
      ) {
        message = 'Nesprávný e-mail nebo heslo.';
      } else if (error.code === 'auth/email-already-in-use') {
        message = 'Tento e-mail se již používá. Zkus se přihlásit.';
      } else if (error.code === 'auth/weak-password') {
        message = 'Heslo musí mít alespoň 6 znaků.';
      }
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    try {
      await signInWithGoogle();
      toast.success('Přihlášení přes Google proběhlo úspěšně!');
      setIsAuthModalOpen(false);
      resetForm();
    } catch (error: any) {
      console.error('Google auth error:', error);
      if (error.code !== 'auth/popup-closed-by-user') {
        toast.error('Nepodařilo se přihlásit přes Google.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isAuthModalOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md w-[92vw] rounded-[2.5rem] p-0 overflow-hidden border border-gray-100 shadow-3xl bg-[#FAF7F0]">
        {/* Header decoration */}
        <div className="bg-gradient-to-r from-[#1E1B18] to-[#3a3530] p-6 text-white text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-400/10 rounded-full blur-2xl" />
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full text-xs font-black uppercase tracking-wider text-amber-300 mb-2">
            <Sparkles size={14} /> ProEdu vzdělávání
          </div>
          <DialogTitle className="text-2xl font-display font-black tracking-tight text-white">
            {isLogin ? 'Přihlášení k účtu' : 'Vytvořit nový účet'}
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-300 font-medium mt-1">
            {isLogin
              ? 'Přihlas se a pokračuj ve své studijní cestě.'
              : 'Zaregistruj se a získej přístup ke všem testům a materiálům.'}
          </DialogDescription>
        </div>

        {/* Modal body */}
        <div className="p-6 md:p-8 space-y-5 bg-white rounded-t-[2rem]">
          {/* Mode Switcher */}
          <div className="flex bg-[#FAF7F0] p-1 rounded-2xl border border-gray-200">
            <button
              type="button"
              onClick={() => setIsLogin(true)}
              className={`flex-1 py-2 text-xs font-black rounded-xl transition-all ${
                isLogin
                  ? 'bg-white text-[#1E1B18] shadow-sm'
                  : 'text-gray-400 hover:text-gray-700'
              }`}
            >
              Přihlášení
            </button>
            <button
              type="button"
              onClick={() => setIsLogin(false)}
              className={`flex-1 py-2 text-xs font-black rounded-xl transition-all ${
                !isLogin
                  ? 'bg-white text-[#1E1B18] shadow-sm'
                  : 'text-gray-400 hover:text-gray-700'
              }`}
            >
              Registrace
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="space-y-1.5">
                <Label className="text-xs font-black text-gray-700 uppercase tracking-wider">Jméno a příjmení</Label>
                <div className="relative">
                  <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <Input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Např. Jan Novák"
                    className="pl-10 h-12 rounded-xl border-gray-200 bg-[#FAF7F0]/60 font-bold focus:bg-white text-sm"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-black text-gray-700 uppercase tracking-wider">E-mail</Label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="student@skola.cz"
                  className="pl-10 h-12 rounded-xl border-gray-200 bg-[#FAF7F0]/60 font-bold focus:bg-white text-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-black text-gray-700 uppercase tracking-wider">Heslo</Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <Input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-10 h-12 rounded-xl border-gray-200 bg-[#FAF7F0]/60 font-bold focus:bg-white text-sm"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl font-black text-sm bg-[#1E1B18] text-[#FAF7F0] hover:bg-[#332f2b] transition-all shadow-md mt-2 flex items-center justify-center gap-2"
            >
              {loading ? (
                'Zpracovávám...'
              ) : isLogin ? (
                <>
                  <LogIn size={16} /> Přihlásit se
                </>
              ) : (
                <>
                  <ArrowRight size={16} /> Vytvořit účet zdarma
                </>
              )}
            </Button>
          </form>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-[10px] uppercase font-black text-gray-400 tracking-wider">
              <span className="bg-white px-2">Nebo pokračuj přes</span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={handleGoogle}
            disabled={loading}
            className="w-full h-12 rounded-xl font-bold border-gray-200 text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-2 text-sm"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            Přihlásit se účtem Google
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
