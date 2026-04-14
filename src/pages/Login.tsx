import * as React from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { GraduationCap, Chrome, Mail, Lock, User as UserIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  
  const { signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth();
  const navigate = useNavigate();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        await signInWithEmail(email, password);
        toast.success('Přihlášení proběhlo úspěšně');
      } else {
        if (!name) {
          toast.error('Prosím zadejte své jméno');
          setLoading(false);
          return;
        }
        await signUpWithEmail(email, password, name);
        toast.success('Registrace proběhla úspěšně');
      }
      navigate('/dashboard');
    } catch (error: any) {
      console.error(error);
      let message = 'Nastala chyba';
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        message = 'Nesprávný e-mail nebo heslo';
      } else if (error.code === 'auth/email-already-in-use') {
        message = 'Tento e-mail se již používá. Zkuste se místo toho přihlásit.';
      } else if (error.code === 'auth/weak-password') {
        message = 'Heslo musí mít alespoň 6 znaků';
      }
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      await signInWithGoogle();
      toast.success('Přihlášení přes Google proběhlo úspěšně');
      navigate('/dashboard');
    } catch (error: any) {
      console.error(error);
      if (error.code === 'auth/popup-closed-by-user') {
        toast.info('Přihlášení bylo zrušeno');
      } else {
        toast.error('Nepodařilo se přihlásit přes Google');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[80vh] px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md"
      >
        <Card className="border-none shadow-2xl rounded-[2.5rem] overflow-hidden bg-white">
          <div className="h-4 bg-gradient-to-r from-orange-500 to-orange-400" />
          <CardHeader className="text-center space-y-4 pt-10 pb-6">
            <div className="mx-auto w-20 h-20 bg-blue-50 rounded-[1.5rem] flex items-center justify-center text-blue-600 shadow-inner">
              <GraduationCap size={40} />
            </div>
            <div className="space-y-1">
              <CardTitle className="text-3xl font-bold text-blue-900">
                {isLogin ? 'Vítejte zpět' : 'Vytvořit účet'}
              </CardTitle>
              <CardDescription className="text-gray-500 text-base">
                {isLogin ? 'Přihlaste se ke svému účtu ProEdu' : 'Začněte svou cestu k úspěchu ještě dnes'}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="px-8 pb-10">
            <form onSubmit={handleAuth} className="space-y-5">
              <AnimatePresence mode="wait">
                {!isLogin && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-2"
                  >
                    <Label className="text-blue-900 font-semibold ml-1">Jméno a příjmení</Label>
                    <div className="relative">
                      <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <Input 
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Jan Novák"
                        className="pl-12 h-12 rounded-2xl border-gray-100 bg-gray-50/50 focus:bg-white transition-all"
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="space-y-2">
                <Label className="text-blue-900 font-semibold ml-1">E-mailová adresa</Label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <Input 
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tvuj@email.cz"
                    className="pl-12 h-12 rounded-2xl border-gray-100 bg-gray-50/50 focus:bg-white transition-all"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-blue-900 font-semibold ml-1">Heslo</Label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <Input 
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pl-12 h-12 rounded-2xl border-gray-100 bg-gray-50/50 focus:bg-white transition-all"
                    required
                  />
                </div>
              </div>

              <Button 
                type="submit"
                disabled={loading}
                className="w-full h-14 bg-orange-500 hover:bg-orange-600 text-white rounded-2xl text-lg font-bold shadow-lg shadow-orange-100 transition-all active:scale-[0.98]"
              >
                {loading ? 'Zpracovávám...' : (isLogin ? 'Přihlásit se' : 'Vytvořit účet')}
              </Button>
            </form>

            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-gray-100" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-4 text-gray-400 font-medium">Nebo pokračujte s</span>
              </div>
            </div>

            <Button 
              type="button"
              onClick={handleGoogleLogin} 
              disabled={loading}
              variant="outline"
              className="w-full h-14 border-2 border-gray-100 rounded-2xl flex gap-3 text-base font-semibold hover:bg-gray-50 transition-all"
            >
              <Chrome size={20} className="text-blue-500" />
              Google účtem
            </Button>

            <p className="mt-8 text-center text-sm text-gray-500">
              {isLogin ? 'Ještě nemáte účet?' : 'Již máte účet?'}
              <button 
                onClick={() => setIsLogin(!isLogin)}
                className="ml-2 text-blue-600 font-bold hover:underline"
              >
                {isLogin ? 'Zaregistrujte se' : 'Přihlaste se'}
              </button>
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
