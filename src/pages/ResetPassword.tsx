import * as React from 'react';
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { verifyPasswordResetCode, confirmPasswordReset } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { saveCredentialToBrowser } from '../lib/credentialHelper';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Lock, ShieldCheck, AlertTriangle, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { CapIcon, MailBlueIcon } from '../components/common/CustomIcon';
import { motion } from 'motion/react';
import { toast } from 'sonner';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { resetPassword } = useAuth();

  const oobCode = searchParams.get('oobCode') || searchParams.get('code') || '';
  const emailParam = searchParams.get('email') || '';

  const [verifying, setVerifying] = useState(Boolean(oobCode));
  const [verifiedEmail, setVerifiedEmail] = useState(emailParam);
  const [error, setError] = useState<string | null>(oobCode ? null : 'V odkazu chybí platný bezpečnostní kód pro obnovení hesla.');
  const [isSuccess, setIsSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Formulář pro nové vyžádání odkazu při chybě
  const [newLinkEmail, setNewLinkEmail] = useState(emailParam);
  const [requestingNewLink, setRequestingNewLink] = useState(false);
  const [newLinkSent, setNewLinkSent] = useState(false);

  useEffect(() => {
    if (!oobCode) return;

    let active = true;
    verifyPasswordResetCode(auth, oobCode)
      .then((email) => {
        if (!active) return;
        setVerifiedEmail(email);
        setNewLinkEmail(email);
        setVerifying(false);
      })
      .catch((err) => {
        if (!active) return;
        console.warn('verifyPasswordResetCode error:', err);
        setVerifying(false);
        if (err.code === 'auth/expired-action-code') {
          setError('Platnost tohoto odkazu již vypršela. Bezpečnostní limit je 1 hodina od odeslání.');
        } else if (err.code === 'auth/invalid-action-code') {
          setError('Tento odkaz je neplatný nebo již byl jednou použit k nastavení nového hesla.');
        } else {
          setError('Odkaz pro obnovení hesla je neplatný nebo expiroval.');
        }
      });

    return () => {
      active = false;
    };
  }, [oobCode]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error('Heslo musí mít alespoň 6 znaků.');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Zadaná hesla se neshodují. Zkontrolujte prosím obě pole.');
      return;
    }

    setSubmitting(true);
    try {
      await confirmPasswordReset(auth, oobCode, password);
      if (verifiedEmail) {
        await saveCredentialToBrowser({ id: verifiedEmail, password });
      }
      setIsSuccess(true);
      toast.success('Heslo bylo úspěšně změněno!');
    } catch (err: any) {
      console.error('confirmPasswordReset error:', err);
      if (err.code === 'auth/expired-action-code') {
        setError('Platnost tohoto odkazu mezitím vypršela. Vyžádejte si prosím nový odkaz.');
      } else if (err.code === 'auth/weak-password') {
        toast.error('Heslo je příliš jednoduché. Zvolte prosím alespoň 6 znaků.');
      } else {
        toast.error(err.message || 'Nepodařilo se nastavit nové heslo.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestNewLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newLinkEmail.trim();
    if (!trimmed) {
      toast.error('Zadejte prosím svou e-mailovou adresu.');
      return;
    }

    setRequestingNewLink(true);
    try {
      const res = await resetPassword(trimmed);
      setNewLinkSent(true);
      if (res?.simulated) {
        toast.info('Režim lokálního náhledu: Nový odkaz byl vypsán do konzole serveru.');
      } else {
        toast.success(`Nový odkaz byl odeslán na ${trimmed}!`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Nepodařilo se odeslat nový odkaz.');
    } finally {
      setRequestingNewLink(false);
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
              {isSuccess ? (
                <ShieldCheck size={44} className="text-emerald-600" />
              ) : error ? (
                <AlertTriangle size={44} className="text-amber-500" />
              ) : (
                <CapIcon size={44} />
              )}
            </div>

            <div className="space-y-1">
              <CardTitle className="text-3xl font-serif font-black text-[#1E1B18]">
                {verifying
                  ? 'Ověřuji odkaz...'
                  : isSuccess
                  ? 'Heslo změněno!'
                  : error
                  ? 'Odkaz vypršel'
                  : 'Nové heslo'}
              </CardTitle>
              <CardDescription className="text-gray-500 text-base">
                {verifying
                  ? 'Prosím počkejte, ověřujeme platnost bezpečnostního kódu.'
                  : isSuccess
                  ? 'Vaše přístupové heslo k účtu ProEdu bylo úspěšně aktualizováno.'
                  : error
                  ? error
                  : verifiedEmail
                  ? `Nastavte si nové heslo pro účet ${verifiedEmail}`
                  : 'Zadejte své nové přístupové heslo k účtu ProEdu.'}
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="px-8 pb-10">
            {verifying ? (
              <div className="py-8 flex flex-col items-center justify-center gap-4">
                <div className="w-10 h-10 border-4 border-[#F5C400] border-t-transparent rounded-full animate-spin" />
                <p className="text-sm font-bold text-gray-500">Načítám zabezpečený formulář...</p>
              </div>
            ) : isSuccess ? (
              <div className="space-y-6 pt-2">
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm font-medium leading-relaxed">
                  ✓ Účet je nyní plně zabezpečen novým heslem. Můžete pokračovat přímo do přihlášení.
                </div>

                <Button
                  onClick={() => navigate('/login')}
                  className="w-full h-14 bg-[#F5C400] text-[#1E1B18] border-b-4 border-[#C29B00] hover:bg-[#EAB308] rounded-2xl text-lg font-bold shadow-md transition-all active:translate-y-[2px] active:border-b-0 cursor-pointer flex items-center justify-center gap-2"
                >
                  Přejít k přihlášení <ArrowRight size={20} />
                </Button>
              </div>
            ) : error ? (
              /* Error / Expired code state with inline recovery request */
              <div className="space-y-6">
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200/80 text-amber-900 text-xs font-medium leading-relaxed">
                  Bezpečnostní odkaz má časově omezenou platnost 1 hodiny a lze jej použít pouze jednou. Zde si můžete nechat ihned zaslat nový odkaz.
                </div>

                <form onSubmit={handleRequestNewLink} method="post" className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reset-new-link-email" className="text-blue-900 font-semibold ml-1">
                      Váš e-mail
                    </Label>
                    <div className="relative">
                      <MailBlueIcon className="absolute left-4 top-1/2 -translate-y-1/2" size={18} />
                      <Input
                        id="reset-new-link-email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        value={newLinkEmail}
                        onChange={(e) => setNewLinkEmail(e.target.value)}
                        placeholder="student@skola.cz"
                        className="pl-12 h-12 rounded-2xl border-gray-100 bg-gray-50/50 focus:bg-white transition-all font-semibold"
                      />
                    </div>
                  </div>

                  {newLinkSent && (
                    <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-2">
                      <ShieldCheck size={18} className="text-emerald-600 shrink-0" />
                      <span>Nový odkaz byl odeslán do vaší e-mailové schránky!</span>
                    </div>
                  )}

                  <Button
                    type="submit"
                    disabled={requestingNewLink}
                    className="w-full h-14 bg-[#F5C400] text-[#1E1B18] border-b-4 border-[#C29B00] hover:bg-[#EAB308] rounded-2xl text-base font-bold shadow-md transition-all active:translate-y-[2px] active:border-b-0 cursor-pointer"
                  >
                    {requestingNewLink ? 'Odesílám...' : newLinkSent ? 'Poslat nový odkaz znovu' : 'Poslat nový odkaz pro obnovení'}
                  </Button>

                  <div className="text-center pt-2">
                    <Link to="/login" className="text-sm font-bold text-[#2B44B8] hover:underline">
                      ← Zpět na přihlašovací stránku
                    </Link>
                  </div>
                </form>
              </div>
            ) : (
              /* Valid Code: New Password Form */
              <form onSubmit={handleResetPassword} method="post" className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="reset-password-input" className="text-blue-900 font-semibold ml-1">
                    Nové heslo
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <Input
                      id="reset-password-input"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Alespoň 6 znaků"
                      className="pl-12 pr-12 h-12 rounded-2xl border-gray-100 bg-gray-50/50 focus:bg-white transition-all"
                      required
                      autoFocus
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

                <div className="space-y-2">
                  <Label htmlFor="reset-confirm-password-input" className="text-blue-900 font-semibold ml-1">
                    Potvrzení nového hesla
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <Input
                      id="reset-confirm-password-input"
                      name="confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Zadejte heslo znovu"
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

                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-14 bg-[#F5C400] text-[#1E1B18] border-b-4 border-[#C29B00] hover:bg-[#EAB308] rounded-2xl text-lg font-bold shadow-md transition-all active:translate-y-[2px] active:border-b-0 cursor-pointer"
                >
                  {submitting ? 'Ukládám heslo...' : 'Uložit nové heslo'}
                </Button>

                <div className="text-center pt-2">
                  <Link to="/login" className="text-sm font-bold text-[#2B44B8] hover:underline">
                    ← Zpět k přihlášení
                  </Link>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
