import React, { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { User, Camera, Lock, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { cn } from '../lib/utils';

const EMOJIS = ['🎓', '🦊', '🦁', '🦉', '🦖', '🚀', '🧠', '👾', '🌟', '🦄', '🐼', '🐯', '🐧', '🐨', '🎯', '🎨', '🎮', '🎧', '🐱', '🐶'];
const COLORS = ['#FEF3C7', '#FEE2E2', '#E0F2FE', '#D1FAE5', '#F3E8FF', '#FCE7F3', '#FFEDD5', '#E2E8F0', '#CFFAFE', '#F5F5F5'];
export default function Settings() {
  const { profile, updateProfileData, updateUserPassword } = useAuth();
  const [name, setName] = useState(profile?.name || '');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync internal state with profile when profile changes
  React.useEffect(() => {
    if (profile?.name) setName(profile.name);
  }, [profile?.name]);

  const handleNameUpdate = async () => {
    if (!name.trim()) return;
    setIsSaving(true);
    try {
      await updateProfileData({ name: name.trim() });
      toast.success('Jméno bylo úspěšně aktualizováno');
    } catch (error) {
      toast.error('Nepodařilo se aktualizovat jméno');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePasswordUpdate = async () => {
    if (!newPassword || newPassword !== confirmPassword) {
      toast.error('Hesla se neshodují nebo jsou prázdná');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Heslo musí mít alespoň 6 znaků');
      return;
    }
    setIsChangingPassword(true);
    try {
      await updateUserPassword(newPassword);
      toast.success('Heslo bylo úspěšně změněno');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      console.error("Password update error:", error);
      if (error.code === 'auth/requires-recent-login') {
        toast.error('Pro změnu hesla se musíte znovu přihlásit');
      } else {
        toast.error('Nepodařilo se změnit heslo. Zkuste to prosím později.');
      }
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    // Validate file type (JPG, PNG)
    const validTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    if (!validTypes.includes(file.type)) {
      toast.error('Povoleny jsou pouze formáty JPG a PNG');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Limit size to 2MB
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Obrázek je příliš velký (max 2MB)');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setIsUploading(true);
    setUploadProgress(10);
    
    const resizeAndGetBase64 = (file: File): Promise<string> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            try {
              const canvas = document.createElement('canvas');
              let width = img.width;
              let height = img.height;
              
              // Resize to max 200x200
              const max = 200;
              if (width > height) {
                if (width > max) {
                  height *= max / width;
                  width = max;
                }
              } else {
                if (height > max) {
                  width *= max / height;
                  height = max;
                }
              }
              
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              if (!ctx) {
                reject(new Error('Canvas context not available'));
                return;
              }
              ctx.drawImage(img, 0, 0, width, height);
              resolve(canvas.toDataURL('image/jpeg', 0.8));
            } catch (err) {
              reject(err);
            }
          };
          img.onerror = () => reject(new Error('Chyba při dekódování obrázku'));
          img.src = e.target?.result as string;
        };
        reader.onerror = () => reject(new Error('Chyba při čtení souboru'));
        reader.readAsDataURL(file);
      });
    };

    setIsUploading(true);
    setUploadProgress(20);
    
    try {
      console.log("Processing image...");
      const base64Photo = await resizeAndGetBase64(file);
      
      setUploadProgress(60);
      await updateProfileData({ photoURL: base64Photo });
      
      setUploadProgress(100);
      toast.success('Profilová fotka byla aktualizována');
    } catch (error: any) {
      console.error("Critical upload error:", error);
      toast.error(`Chyba: ${error.message || 'Zkuste to prosím znovu'}`);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="page-container">
      <section className="text-center space-y-6 max-w-3xl mx-auto mb-12">
        <motion.h1 
          initial={{ opacity: 0, y: -20 }} 
          animate={{ opacity: 1, y: 0 }} 
          className="text-5xl md:text-6xl font-display font-black text-[#1E1B18]"
        >
          Nastavení profilu
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          transition={{ delay: 0.2 }} 
          className="text-xl text-gray-500 leading-relaxed"
        >
          Uprav si své údaje, heslo a zabezpečení účtu.
        </motion.p>
      </section>

      <div className="max-w-2xl mx-auto bg-white p-8 md:p-12 rounded-[2.5rem] shadow-xl border border-gray-100/50 space-y-8 mt-12">
        {/* Avatar Section */}
        <div className="flex flex-col items-center gap-6">
          <div className="relative group">
            <div className="w-32 h-32 rounded-[2.5rem] bg-blue-50 flex items-center justify-center overflow-hidden border-4 border-white shadow-xl" style={{ backgroundColor: profile?.avatarBgColor || '#FEF3C7' }}>
              {profile?.avatarEmoji ? (
                <span className="text-6xl select-none">{profile.avatarEmoji}</span>
              ) : profile?.photoURL ? (
                <img src={profile.photoURL} alt={profile.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-6xl select-none">🎓</span>
              )}
              {isUploading && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center p-4">
                  <div className="w-10 h-1 border-2 border-brand-blue border-t-transparent rounded-full animate-spin mb-2" />
                  <div className="w-full bg-gray-100 h-1 rounded-full overflow-hidden">
                    <div 
                      className="bg-brand-blue h-full transition-all duration-300" 
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="absolute -bottom-2 -right-2 w-10 h-10 bg-brand-orange text-white rounded-xl shadow-lg flex items-center justify-center hover:scale-110 transition-transform active:scale-95 cursor-pointer"
              title="Nahrát fotku"
            >
              <Camera size={20} />
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={async (e) => {
                try {
                  await updateProfileData({ avatarEmoji: "" });
                } catch (err) {}
                handleFileChange(e);
              }} 
              className="hidden" 
              accept=".jpg,.jpeg,.png,image/jpeg,image/png"
            />
          </div>
          
          <div className="text-center space-y-2">
            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Klikni na foťák pro změnu fotky</p>
            {profile?.avatarEmoji && (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    await updateProfileData({ avatarEmoji: "" });
                    toast.success('Zobrazuje se tvá profilová fotka.');
                  } catch (err) {
                    toast.error('Chyba při odebírání emoji.');
                  }
                }}
                className="h-8 rounded-lg text-xs font-bold border-gray-200 text-gray-500 hover:text-red-500 hover:border-red-200 cursor-pointer"
              >
                Použít nahranou fotku místo emoji
              </Button>
            )}
          </div>

          {/* Emoji & Background Color Editor */}
          <div className="w-full max-w-md space-y-4 pt-6 border-t border-gray-100">
            <div>
              <Label className="text-sm font-bold text-gray-400 uppercase tracking-widest block mb-2 text-center">Vyber si emoji</Label>
              <div className="grid grid-cols-5 gap-2 max-h-36 overflow-y-auto p-2 bg-gray-50 rounded-2xl border border-gray-100">
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
                      "w-10 h-10 rounded-xl text-xl flex items-center justify-center hover:bg-white hover:scale-110 hover:shadow-sm transition-all cursor-pointer",
                      profile?.avatarEmoji === emoji ? "bg-white border-2 border-[#B80053]" : "border border-transparent"
                    )}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-sm font-bold text-gray-400 uppercase tracking-widest block mb-2 text-center">Barva pozadí</Label>
              <div className="grid grid-cols-5 gap-2 p-2 bg-gray-50 rounded-2xl border border-gray-100">
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
                      "w-10 h-10 rounded-xl flex items-center justify-center hover:scale-110 hover:shadow-sm transition-all cursor-pointer border-2",
                      profile?.avatarBgColor === color ? "border-[#B80053]" : "border-white"
                    )}
                  >
                    {profile?.avatarBgColor === color && <span className="text-[#B80053] font-bold text-xs">✓</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Name Change */}
          <div className="space-y-3">
            <Label className="text-sm font-bold text-gray-400 uppercase tracking-widest px-1">Tvoje jméno</Label>
            <div className="flex gap-2">
              <Input 
                value={name} 
                onChange={(e) => setName(e.target.value)}
                className="rounded-2xl h-12 bg-gray-50 border-none focus-visible:ring-2 focus-visible:ring-[#B80053]/20 font-bold px-4"
              />
              <Button 
                onClick={handleNameUpdate}
                disabled={isSaving || name === profile?.name}
                className="rounded-2xl h-12 px-6 bg-[#B80053] hover:bg-[#B80053]/90 text-white font-bold shadow-lg shadow-pink-100 cursor-pointer"
              >
                {isSaving ? '...' : <CheckCircle2 size={20} />}
              </Button>
            </div>
          </div>

          {/* Email (Readonly) */}
          <div className="space-y-3 opacity-60">
            <Label className="text-sm font-bold text-gray-400 uppercase tracking-widest px-1">E-mail (nelze změnit)</Label>
            <Input 
              value={profile?.email} 
              disabled 
              className="rounded-2xl h-12 bg-gray-100 border-none font-bold px-4 cursor-not-allowed"
            />
            <p className="text-[10px] text-gray-400 font-bold flex items-center gap-1 px-1">
              <AlertCircle size={10} /> Email je tvůj unikátní identifikátor.
            </p>
          </div>

          <hr className="border-gray-100" />

          {/* Password Change */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-[#B80053]">
              <Lock size={18} />
              <h3 className="font-sans font-black text-xl text-gray-900">Změna hesla</h3>
            </div>
            
            <div className="space-y-3">
              <Label className="text-sm font-bold text-gray-400 uppercase tracking-widest px-1">Nové heslo</Label>
              <Input 
                type="password"
                placeholder="********"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="rounded-2xl h-12 bg-gray-50 border-none focus-visible:ring-2 focus-visible:ring-[#B80053]/20 font-bold px-4"
              />
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-bold text-gray-400 uppercase tracking-widest px-1">Potvrzení hesla</Label>
              <Input 
                type="password"
                placeholder="********"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="rounded-2xl h-12 bg-gray-50 border-none focus-visible:ring-2 focus-visible:ring-[#B80053]/20 font-bold px-4"
              />
            </div>

            <Button 
              onClick={handlePasswordUpdate}
              disabled={isChangingPassword || !newPassword}
              className="w-full rounded-2xl h-12 bg-white text-[#B80053] border-2 border-[#B80053] hover:bg-pink-50 font-bold transition-all cursor-pointer"
            >
              {isChangingPassword ? 'Změna...' : 'Aktualizovat heslo'}
            </Button>
          </div>
        </div>
      </div>

      <section className="bg-[#FAF7F0] rounded-[3rem] p-12 text-[#1E1B18] text-center space-y-8 relative overflow-hidden mt-12 border border-[#E6E0D4] max-w-2xl mx-auto w-full">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/40 rounded-full -mr-32 -mt-32 blur-3xl" />
        <div className="relative z-10 space-y-4">
          <h2 className="text-4xl font-display font-bold">Potřebuješ s něčím pomoci?</h2>
          <p className="text-gray-600 text-xl max-w-xl mx-auto">Napiš nám na podporu a my ti rádi pomůžeme vyřešit jakýkoliv problém s tvým účtem.</p>
          <div className="pt-4">
            <Link to="/contact" className="inline-flex items-center justify-center bg-[#F5C400] text-[#1E1B18] px-10 h-14 rounded-2xl text-xl font-black hover:scale-105 transition-transform shadow-xl hover:bg-[#F5C400]/90">
              Kontaktuj nás
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
