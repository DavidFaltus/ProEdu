import * as React from 'react';
import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Chrome, Lock, ShieldCheck, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { CapIcon, MailBlueIcon, TeamBlueIcon } from '../components/common/CustomIcon';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [step, setStep] = useState<'form' | 'otp'>('form');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [name, setName] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resending, setResending] = useState(false);
  
  const { 
    signInWithGoogle, 
    signInWithEmail, 
    initRegistration, 
    confirmRegistration, 
    resendRegistrationOtp 
  } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        await signInWithEmail(email, password);
        toast.success('Přihlášení proběhlo úspěšně');
        navigate('/dashboard');
      } else {
        const trimmedName = name.trim();
        if (!trimmedName || trimmedName.length < 2) {
          toast.error('Prosím zadejte své jméno a příjmení (alespoň 2 znaky)');
          setLoading(false);
          return;
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.trim())) {
          toast.error('Zadejte prosím platnou e-mailovou adresu');
          setLoading(false);
          return;
        }
        if (password.length < 6) {
          toast.error('Heslo musí mít alespoň 6 znaků');
          setLoading(false);
          return;
        }
        if (password !== confirmPassword) {
          toast.error('Zadaná hesla se neshodují. Zkontrolujte prosím obě hesla.');
          setLoading(false);
          return;
        }
        const res = await initRegistration(email.trim(), password, trimmedName, confirmPassword);
        if (res.simulated) {
          toast.info('Režim lokálního náhledu: Ověřovací kód byl vypsán do konzole serveru.');
        } else {
          toast.success('Ověřovací kód byl odeslán na váš e-mail!');
        }
        setStep('otp');
        setResendCooldown(60);
      }
    } catch (error: any) {
      console.error(error);
      let message = error?.message || 'Nastala chyba';
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

  const handleConfirmOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode || otpCode.trim().length !== 6) {
      toast.error('Zadejte prosím celý 6místný kód.');
      return;
    }

    setLoading(true);
    try {
      await confirmRegistration(email, otpCode.trim());
      toast.success('Registrace byla úspěšně dokončena! Vítejte v ProEdu.');
      navigate('/dashboard');
    } catch (err: any) {
      console.error('OTP confirmation error:', err);
      toast.error(err.message || 'Zadaný kód není správný.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0 || resending) return;
    setResending(true);
    try {
      const res = await resendRegistrationOtp(email);
      if (res.simulated) {
        toast.info('Nový kód byl vypsán do konzole serveru.');
      } else {
        toast.success('Nový kód byl odeslán na váš e-mail.');
      }
      setResendCooldown(60);
    } catch (err: any) {
      toast.error(err.message || 'Nepodařilo se znovu odeslat kód.');
    } finally {
      setResending(false);
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
    <div className="flex items-center justify-center min-h-[80vh] px-4 py-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md"
      >
        <Card className="border-none shadow-2xl rounded-[2.5rem] overflow-hidden bg-white">
          <div className="h-4 bg-gradient-to-r from-[#F5C400] to-[#EAB308]" />
          <CardHeader className="text-center space-y-4 pt-10 pb-6">
            <div className="mx-auto w-20 h-20 bg-[#FAF7F0] rounded-[1.5rem] flex items-center justify-center text-[#625500] shadow-sm">
              <CapIcon size={44} />
            </div>
            <div className="space-y-1">
              <CardTitle className="text-3xl font-serif font-black text-[#1E1B18]">
                {step === 'otp'
                  ? 'Ověření e-mailu'
                  : isLogin
                  ? 'Vítejte zpět'
                  : 'Vytvořit účet'}
              </CardTitle>
              <CardDescription className="text-gray-500 text-base">
                {step === 'otp'
                  ? `Zadejte 6místný kód zaslaný na adresu ${email}`
                  : isLogin
                  ? 'Přihlaste se ke svému účtu ProEdu'
                  : 'Začněte svou cestu k úspěchu ještě dnes'}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="px-8 pb-10">
            {step === 'form' ? (
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
                        <TeamBlueIcon className="absolute left-4 top-1/2 -translate-y-1/2" size={18} />
                        <Input 
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Jan Novák"
                          className="pl-12 h-12 rounded-2xl border-gray-100 bg-gray-50/50 focus:bg-white transition-all font-semibold"
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="space-y-2">
                  <Label className="text-blue-900 font-semibold ml-1">E-mailová adresa</Label>
                  <div className="relative">
                    <MailBlueIcon className="absolute left-4 top-1/2 -translate-y-1/2" size={18} />
                    <Input 
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="tvuj@email.cz"
                      className="pl-12 h-12 rounded-2xl border-gray-100 bg-gray-50/50 focus:bg-white transition-all font-semibold"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-blue-900 font-semibold ml-1">Heslo</Label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <Input 
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="pl-12 pr-12 h-12 rounded-2xl border-gray-100 bg-gray-50/50 focus:bg-white transition-all"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 focus:outline-none cursor-pointer"
                      title={showPassword ? 'Skrýt heslo' : 'Zobrazit heslo'}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {!isLogin && (
                  <div className="space-y-2">
                    <Label className="text-blue-900 font-semibold ml-1">Potvrzení hesla</Label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <Input 
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className={`pl-12 pr-12 h-12 rounded-2xl border-gray-100 bg-gray-50/50 focus:bg-white transition-all ${
                          confirmPassword && password !== confirmPassword ? 'border-red-300 focus:border-red-500' : ''
                        }`}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        tabIndex={-1}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 focus:outline-none cursor-pointer"
                        title={showConfirmPassword ? 'Skrýt heslo' : 'Zobrazit heslo'}
                      >
                        {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    {confirmPassword && password !== confirmPassword && (
                      <p className="text-xs text-red-500 font-semibold ml-2">Hesla se neshodují</p>
                    )}
                  </div>
                )}

                <Button 
                  type="submit"
                  disabled={loading}
                  className="w-full h-14 bg-[#F5C400] text-[#1E1B18] border-b-4 border-[#C29B00] hover:bg-[#EAB308] rounded-2xl text-lg font-bold shadow-md transition-all active:translate-y-[2px] active:border-b-0 cursor-pointer"
                >
                  {loading ? 'Zpracovávám...' : (isLogin ? 'Přihlásit se' : 'Pokračovat k ověření')}
                </Button>

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
                  className="w-full h-14 border-2 border-gray-100 rounded-2xl flex gap-3 text-base font-semibold hover:bg-[#FAF7F0] transition-all cursor-pointer"
                >
                  <Chrome size={20} className="text-[#2B44B8]" />
                  Google účtem
                </Button>

                <p className="mt-8 text-center text-sm text-gray-500">
                  {isLogin ? 'Ještě nemáte účet?' : 'Již máte účet?'}
                  <button 
                    type="button"
                    onClick={() => {
                      setIsLogin(!isLogin);
                      setStep('form');
                    }}
                    className="ml-2 text-[#2B44B8] font-bold hover:underline cursor-pointer"
                  >
                    {isLogin ? 'Zaregistrujte se' : 'Přihlaste se'}
                  </button>
                </p>
              </form>
            ) : (
              /* OTP Step on Login page */
              <form onSubmit={handleConfirmOtp} className="space-y-6">
                <div className="bg-[#FAF7F0] p-4 rounded-2xl border border-blue-100 flex items-start gap-3">
                  <ShieldCheck className="text-blue-600 shrink-0 mt-0.5" size={22} />
                  <div className="text-xs text-gray-700 leading-relaxed">
                    Na adresu <strong className="text-blue-900">{email}</strong> byl odeslán 6místný jednorázový kód. Zadejte jej prosím níže.
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-black text-gray-700 uppercase tracking-wider text-center block">
                    6místný ověřovací kód
                  </Label>
                  <Input 
                    type="text"
                    maxLength={6}
                    required
                    autoFocus
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="123456"
                    className="h-16 text-center font-mono text-3xl tracking-[0.5em] font-black rounded-2xl border-2 border-blue-200 bg-white focus:border-blue-500 shadow-inner"
                  />
                </div>

                <Button 
                  type="submit"
                  disabled={loading || otpCode.length !== 6}
                  className="w-full h-14 bg-[#F5C400] text-[#1E1B18] border-b-4 border-[#C29B00] hover:bg-[#EAB308] rounded-2xl text-lg font-bold shadow-md transition-all active:translate-y-[2px] active:border-b-0 cursor-pointer"
                >
                  {loading ? 'Ověřuji...' : 'Potvrdit a vstoupit'}
                </Button>

                <div className="flex items-center justify-center text-xs pt-2 text-gray-500 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={resendCooldown > 0 || resending}
                    className="font-bold text-blue-600 hover:text-blue-800 disabled:text-gray-400 flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed py-1.5 px-3 rounded-lg hover:bg-blue-50/50 transition-colors"
                  >
                    <RefreshCw size={14} className={resending ? 'animate-spin' : ''} />
                    {resendCooldown > 0 ? `Znovu poslat kód za ${resendCooldown}s` : 'Poslat kód znovu'}
                  </button>
                </div>
              </form>
            )}

            <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-center gap-3 text-xs text-gray-400 font-medium">
              <Link to="/terms" className="hover:text-gray-700 hover:underline">
                Obchodní podmínky
              </Link>
              <span>•</span>
              <Link to="/gdpr" className="hover:text-gray-700 hover:underline">
                GDPR
              </Link>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
