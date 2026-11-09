import * as React from 'react';
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Lock, LogIn, ArrowRight, ShieldCheck, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { StarYellowIcon, MailBlueIcon, TeamBlueIcon } from './common/CustomIcon';
import { toast } from 'sonner';

export default function AuthModal() {
  const { 
    isAuthModalOpen, 
    setIsAuthModalOpen, 
    signInWithEmail, 
    initRegistration, 
    confirmRegistration, 
    resendRegistrationOtp, 
    signInWithGoogle 
  } = useAuth();

  const [isLogin, setIsLogin] = useState(true);
  const [step, setStep] = useState<'form' | 'otp'>('form');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [name, setName] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  // Odpočítávání pro znovuzaslání OTP kódu
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    setName('');
    setOtpCode('');
    setStep('form');
    setResendCooldown(0);
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
        setIsAuthModalOpen(false);
        resetForm();
      } else {
        const trimmedName = name.trim();
        if (!trimmedName || trimmedName.length < 2) {
          toast.error('Zadej prosím své jméno a příjmení (alespoň 2 znaky).');
          setLoading(false);
          return;
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.trim())) {
          toast.error('Zadej prosím platnou e-mailovou adresu.');
          setLoading(false);
          return;
        }
        if (password.length < 6) {
          toast.error('Heslo musí mít alespoň 6 znaků.');
          setLoading(false);
          return;
        }
        if (password !== confirmPassword) {
          toast.error('Zadaná hesla se neshodují. Zkontroluj prosím obě hesla.');
          setLoading(false);
          return;
        }

        const res = await initRegistration(email.trim(), password, trimmedName, confirmPassword);
        if (res.simulated) {
          toast.info('Režim lokálního náhledu: Ověřovací kód byl vypsán do konzole serveru.');
        } else {
          toast.success('Ověřovací kód byl zaslán na tvůj e-mail!');
        }
        setStep('otp');
        setResendCooldown(60);
      }
    } catch (error: any) {
      console.error('Auth error:', error);
      let message = error?.message || 'Nastala chyba při ověření.';
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

  const handleConfirmOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode || otpCode.trim().length !== 6) {
      toast.error('Zadej prosím celý 6místný kód.');
      return;
    }

    setLoading(true);
    try {
      await confirmRegistration(email, otpCode.trim());
      toast.success('Účet byl úspěšně ověřen a vytvořen! Vítej v ProEdu.');
      setIsAuthModalOpen(false);
      resetForm();
    } catch (err: any) {
      console.error('OTP confirmation error:', err);
      toast.error(err.message || 'Zadaný ověřovací kód není správný.');
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
        toast.success('Nový kód byl odeslán do tvé schránky.');
      }
      setResendCooldown(60);
    } catch (err: any) {
      toast.error(err.message || 'Nepodařilo se znovu odeslat kód.');
    } finally {
      setResending(false);
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
        <div className="bg-gradient-to-br from-[#DCEBFE] via-[#C7DFFC] to-[#B9D8FC] p-6 text-center relative overflow-hidden border-b border-blue-100">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/40 rounded-full blur-2xl pointer-events-none" />
          <DialogTitle className="text-2xl font-display font-black tracking-tight text-[#0F2942] flex items-center justify-center gap-2.5">
            <StarYellowIcon size={22} className="shrink-0" />
            <span>
              {step === 'otp'
                ? 'Ověření e-mailu'
                : isLogin
                ? 'Přihlášení k účtu'
                : 'Vytvořit nový účet'}
            </span>
            <StarYellowIcon size={22} className="shrink-0" />
          </DialogTitle>
          <DialogDescription className="text-xs text-[#284B63] font-medium mt-1">
            {step === 'otp'
              ? `Zadej 6místný kód zaslaný na adresu ${email}`
              : isLogin
              ? 'Přihlas se a pokračuj ve své studijní cestě.'
              : 'Zaregistruj se a získej přístup ke všem testům a materiálům.'}
          </DialogDescription>
        </div>

        {/* Modal body */}
        <div className="p-6 md:p-8 space-y-5 bg-white rounded-t-[2rem]">
          {step === 'form' ? (
            <>
              {/* Mode Switcher */}
              <div className="flex bg-[#FAF7F0] p-1 rounded-2xl border border-gray-200">
                <button
                  type="button"
                  onClick={() => setIsLogin(true)}
                  className={`flex-1 py-2 text-xs font-black rounded-xl transition-all cursor-pointer ${
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
                  className={`flex-1 py-2 text-xs font-black rounded-xl transition-all cursor-pointer ${
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
                      <TeamBlueIcon className="absolute left-3.5 top-1/2 -translate-y-1/2" size={16} />
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
                    <MailBlueIcon className="absolute left-3.5 top-1/2 -translate-y-1/2" size={16} />
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
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="pl-10 pr-10 h-12 rounded-xl border-gray-200 bg-[#FAF7F0]/60 font-bold focus:bg-white text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 focus:outline-none cursor-pointer"
                      title={showPassword ? 'Skrýt heslo' : 'Zobrazit heslo'}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {!isLogin && (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-black text-gray-700 uppercase tracking-wider">Potvrzení hesla</Label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                      <Input
                        type={showConfirmPassword ? 'text' : 'password'}
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className={`pl-10 pr-10 h-12 rounded-xl border-gray-200 bg-[#FAF7F0]/60 font-bold focus:bg-white text-sm ${
                          confirmPassword && password !== confirmPassword ? 'border-red-300 focus:border-red-500' : ''
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        tabIndex={-1}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 focus:outline-none cursor-pointer"
                        title={showConfirmPassword ? 'Skrýt heslo' : 'Zobrazit heslo'}
                      >
                        {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {confirmPassword && password !== confirmPassword && (
                      <p className="text-[11px] text-red-500 font-semibold ml-1">Hesla se neshodují</p>
                    )}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 rounded-xl font-black text-sm bg-[#B9D8FC] text-[#0F2942] hover:bg-[#A3CCFA] border border-blue-200/80 transition-all shadow-sm hover:shadow-md mt-2 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {loading ? (
                    'Zpracovávám...'
                  ) : isLogin ? (
                    <>
                      <LogIn size={16} /> Přihlásit se
                    </>
                  ) : (
                    <>
                      <ArrowRight size={16} /> Pokračovat k ověření
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
                className="w-full h-12 rounded-xl font-bold border-gray-200 text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-2 text-sm cursor-pointer"
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
            </>
          ) : (
            /* OTP Verification Step */
            <form onSubmit={handleConfirmOtp} className="space-y-5">
              <div className="bg-[#FAF7F0] p-4 rounded-2xl border border-blue-100 flex items-start gap-3">
                <ShieldCheck className="text-blue-600 shrink-0 mt-0.5" size={20} />
                <div className="text-xs text-gray-700 leading-relaxed">
                  Na adresu <strong className="text-blue-900">{email}</strong> jsme odeslali jednorázový 6místný kód. Platnost kódu je 15 minut.
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
                  className="h-14 text-center font-mono text-2xl tracking-[0.5em] font-black rounded-2xl border-2 border-blue-200 bg-white focus:border-blue-500 shadow-inner"
                />
              </div>

              <Button
                type="submit"
                disabled={loading || otpCode.length !== 6}
                className="w-full h-12 rounded-xl font-black text-sm bg-[#B9D8FC] text-[#0F2942] hover:bg-[#A3CCFA] border border-blue-200/80 transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? 'Ověřuji kód...' : 'Potvrdit a vstoupit do ProEdu'}
              </Button>

              <div className="flex items-center justify-center text-xs pt-2 text-gray-500 border-t border-gray-100">
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={resendCooldown > 0 || resending}
                  className="font-bold text-blue-600 hover:text-blue-800 disabled:text-gray-400 flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed py-1.5 px-3 rounded-lg hover:bg-blue-50/50 transition-colors"
                >
                  <RefreshCw size={13} className={resending ? 'animate-spin' : ''} />
                  {resendCooldown > 0 ? `Znovu poslat kód za ${resendCooldown}s` : 'Poslat kód znovu'}
                </button>
              </div>
            </form>
          )}

          <p className="text-[11px] text-center text-gray-500 mt-4 leading-relaxed">
            Pokračováním vyjadřujete souhlas s{' '}
            <Link
              to="/terms"
              onClick={() => setIsAuthModalOpen(false)}
              className="text-gray-800 underline font-semibold hover:text-black"
            >
              obchodními podmínkami
            </Link>
            {' '}a{' '}
            <Link
              to="/privacy"
              onClick={() => setIsAuthModalOpen(false)}
              className="text-gray-800 underline font-semibold hover:text-black"
            >
              ochranou osobních údajů (GDPR)
            </Link>
            .
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
