import React, { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { User, Camera, Lock, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface ProfileSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ProfileSettings({ open, onOpenChange }: ProfileSettingsProps) {
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

    // Limit size to 2MB (víc než dost za fotku)
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
              
              // Resize to max 200x200 (pro avatar víc než dost)
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] rounded-[2.5rem] p-0 overflow-hidden border-none shadow-3xl bg-white">
        <div className="bg-brand-blue p-8 text-white relative">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl" />
          <DialogHeader className="relative z-10">
            <DialogTitle className="text-3xl font-display font-bold text-white">Nastavení profilu</DialogTitle>
            <DialogDescription className="text-blue-100 text-lg">
              Uprav si své údaje a zabezpečení účtu.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto">
          {/* Avatar Section */}
          <div className="flex flex-col items-center gap-4">
            <div className="relative group">
              <div className="w-32 h-32 rounded-[2rem] bg-blue-50 flex items-center justify-center overflow-hidden border-4 border-white shadow-xl">
                {profile?.photoURL ? (
                  <img src={profile.photoURL} alt={profile.name} className="w-full h-full object-cover" />
                ) : (
                  <User size={64} className="text-brand-blue" />
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
                className="absolute -bottom-2 -right-2 w-10 h-10 bg-brand-orange text-white rounded-xl shadow-lg flex items-center justify-center hover:scale-110 transition-transform active:scale-95"
              >
                <Camera size={20} />
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                className="hidden" 
                accept=".jpg,.jpeg,.png,image/jpeg,image/png"
              />
            </div>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Klikni pro změnu fotky</p>
          </div>

          <div className="space-y-6">
            {/* Name Change */}
            <div className="space-y-3">
              <Label className="text-sm font-bold text-gray-400 uppercase tracking-widest px-1">Tvoje jméno</Label>
              <div className="flex gap-2">
                <Input 
                  value={name} 
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-2xl h-12 bg-gray-50 border-none focus-visible:ring-2 focus-visible:ring-brand-blue font-bold px-4"
                />
                <Button 
                  onClick={handleNameUpdate}
                  disabled={isSaving || name === profile?.name}
                  className="rounded-2xl h-12 px-6 bg-brand-blue hover:bg-brand-blue/90 font-bold shadow-lg shadow-blue-100"
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
              <div className="flex items-center gap-2 text-brand-blue">
                <Lock size={18} />
                <h3 className="font-display font-bold text-xl">Změna hesla</h3>
              </div>
              
              <div className="space-y-3">
                <Label className="text-sm font-bold text-gray-400 uppercase tracking-widest px-1">Nové heslo</Label>
                <Input 
                  type="password"
                  placeholder="********"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="rounded-2xl h-12 bg-gray-50 border-none focus-visible:ring-2 focus-visible:ring-brand-blue font-bold px-4"
                />
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-bold text-gray-400 uppercase tracking-widest px-1">Potvrzení hesla</Label>
                <Input 
                  type="password"
                  placeholder="********"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="rounded-2xl h-12 bg-gray-50 border-none focus-visible:ring-2 focus-visible:ring-brand-blue font-bold px-4"
                />
              </div>

              <Button 
                onClick={handlePasswordUpdate}
                disabled={isChangingPassword || !newPassword}
                className="w-full rounded-2xl h-12 bg-white text-brand-blue border-2 border-brand-blue hover:bg-blue-50 font-bold transition-all"
              >
                {isChangingPassword ? 'Změna...' : 'Aktualizovat heslo'}
              </Button>
            </div>
          </div>
        </div>
        
        <div className="p-8 pt-0 flex justify-center">
             <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-gray-400 font-bold hover:text-gray-600">
                Zavřít nastavení
             </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
