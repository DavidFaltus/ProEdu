import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { Course, UserProfile } from '../types';
import { Link } from 'react-router-dom';
import { BookOpen, Calendar, GraduationCap, Users, Plus, Check, Loader2, ArrowRight } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

export default function Courses() {
  const { profile } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Teacher form state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('blue');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;

    let q;
    if (profile.role === 'teacher') {
      q = query(collection(db, 'courses'), where('teacherId', '==', profile.uid));
    } else {
      q = query(collection(db, 'courses'), where('studentIds', 'array-contains', profile.uid));
    }

    const unsub = onSnapshot(q, (snapshot) => {
      setCourses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Course)));
      setLoading(false);
    });

    return unsub;
  }, [profile]);

  const handleAddCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || profile.role !== 'teacher') return;
    
    setSaving(true);
    try {
      await addDoc(collection(db, 'courses'), {
        title,
        description,
        teacherId: profile.uid,
        color,
        studentIds: [], // newly created course has no students initially
        createdAt: serverTimestamp(),
      });
      toast.success('Kurz byl úspěšně vytvořen!');
      setIsAddOpen(false);
      setTitle('');
      setDescription('');
      setColor('blue');
    } catch (err: any) {
      toast.error('Chyba při vytváření kurzu: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const colors = ['blue', 'purple', 'orange', 'green', 'rose'];

  return (
    <div className="page-container">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-[1.5rem] bg-indigo-50 flex items-center justify-center text-indigo-500 shadow-sm border border-indigo-100">
            <GraduationCap size={32} />
          </div>
          <div>
            <h1 className="text-4xl font-display font-black text-brand-blue">Tvoje Kurzy</h1>
            <p className="text-gray-500 text-lg">Prostor pro organizovanou výuku a sdílení</p>
          </div>
        </div>

        {profile?.role === 'teacher' && (
          <div className="flex items-center gap-3">
            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger className={cn(
              "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-1 disabled:pointer-events-none disabled:opacity-50",
              "btn-brand h-14 px-6 rounded-2xl font-bold shadow-xl shadow-blue-200 cursor-pointer"
            )}>
              <Plus size={20} /> Vytvořit kurz
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] rounded-[2rem] border-none shadow-2xl p-8">
              <DialogHeader className="mb-6">
                <DialogTitle className="text-2xl font-display font-black text-brand-blue flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                    <Plus size={20} className="text-brand-blue" />
                  </div>
                  Nový kurz
                </DialogTitle>
              </DialogHeader>

              <form onSubmit={handleAddCourse} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="title" className="font-bold text-gray-700">Název kurzu</Label>
                  <Input 
                    id="title" 
                    value={title} 
                    onChange={e => setTitle(e.target.value)} 
                    required 
                    className="h-14 rounded-2xl bg-gray-50 border-gray-200 text-lg font-medium"
                    placeholder="Např. Přijímačky MAT 2026"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description" className="font-bold text-gray-700">Popis</Label>
                  <Textarea 
                    id="description" 
                    value={description} 
                    onChange={e => setDescription(e.target.value)} 
                    className="min-h-[120px] rounded-2xl bg-gray-50 border-gray-200 resize-none text-base"
                    placeholder="Krátké představení obsahu a cílů kurzu..."
                  />
                </div>

                <div className="space-y-2">
                  <Label className="font-bold text-gray-700">Barva kurzu</Label>
                  <div className="flex gap-3">
                    {colors.map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setColor(c)}
                        className={cn(
                          "w-12 h-12 rounded-xl flex items-center justify-center transition-all focus:outline-none",
                          c === 'blue' && "bg-blue-500 text-white",
                          c === 'purple' && "bg-purple-500 text-white",
                          c === 'orange' && "bg-orange-500 text-white",
                          c === 'green' && "bg-green-500 text-white",
                          c === 'rose' && "bg-rose-500 text-white",
                          color === c ? "ring-4 ring-offset-2 ring-gray-200 scale-110 shadow-lg" : "opacity-80 hover:opacity-100 hover:scale-105"
                        )}
                      >
                        {color === c && <Check size={20} strokeWidth={3} />}
                      </button>
                    ))}
                  </div>
                </div>

                <DialogFooter className="pt-4">
                  <div className="flex justify-end gap-3 w-full">
                    <Button type="button" variant="ghost" onClick={() => setIsAddOpen(false)} className="rounded-xl font-bold h-12">
                      Zrušit
                    </Button>
                    <Button type="submit" disabled={saving || !title} className="rounded-xl font-bold h-12 px-8 btn-brand">
                      {saving ? <Loader2 size={20} className="animate-spin" /> : 'Vytvořit'}
                    </Button>
                  </div>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        )}
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-indigo-300">
          <Loader2 size={40} className="animate-spin" />
        </div>
      ) : courses.length === 0 ? (
        <div className="text-center py-20 bg-white/50 backdrop-blur-md rounded-[3rem] border border-white">
          <div className="w-24 h-24 bg-white/60 rounded-[2rem] flex items-center justify-center mx-auto mb-6 text-gray-400 rotate-12 shadow-sm">
            <BookOpen size={40} />
          </div>
          <h2 className="text-2xl font-display font-bold text-gray-600 mb-2">Zatím tu žádné kurzy nejsou</h2>
          {profile?.role === 'teacher' ? (
            <p className="text-gray-500 max-w-md mx-auto line-clamp-2">Vytvoř kurz pro své studenty a začni jim organizovat studium, materiály a testy efektivně na jedno místo.</p>
          ) : (
            <p className="text-gray-500 max-w-md mx-auto line-clamp-2">Požádej svého učitele, at tě přidá do některého ze svých kurzů.</p>
          )}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          <AnimatePresence>
            {courses.map((course, index) => (
              <motion.div
                key={course.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Link to={`/courses/${course.id}`} className="block h-full group">
                  <Card className={cn(
                    "h-full rounded-[2.5rem] border-none shadow-xl transition-all duration-300 group-hover:-translate-y-2 relative overflow-hidden group-hover:shadow-2xl",
                    course.color === 'blue' && "bg-gradient-to-br from-brand-blue to-blue-600 text-white shadow-blue-200/50",
                    course.color === 'purple' && "bg-gradient-to-br from-purple-500 to-purple-700 text-white shadow-purple-200/50",
                    course.color === 'orange' && "bg-gradient-to-br from-brand-orange to-orange-500 text-white shadow-orange-200/50",
                    course.color === 'green' && "bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-emerald-200/50",
                    course.color === 'rose' && "bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow-rose-200/50",
                  )}>
                    <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full blur-2xl -mr-20 -mt-20 pointer-events-none group-hover:bg-white/20 transition-colors" />
                    <CardHeader className="relative z-10 p-8 pb-4">
                      <div className="flex justify-between items-start mb-4">
                        <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center">
                          <BookOpen size={24} className="text-white" />
                        </div>
                        <div className="flex items-center gap-2 bg-white/20 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider">
                          <Users size={14} />
                          {course.studentIds.length}
                        </div>
                      </div>
                      <CardTitle className="text-2xl font-display font-bold group-hover:text-white/90 transition-colors">
                        {course.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-8 pt-4 relative z-10 flex flex-col justify-between h-[calc(100%-120px)]">
                      <p className="text-white/80 line-clamp-3 leading-relaxed mb-6">
                        {course.description}
                      </p>
                      
                      <div className="flex items-center justify-between mt-auto">
                        <div className="text-sm font-medium text-white/60">
                          {profile?.role === 'teacher' ? 'Správa kurzu' : 'Vstoupit do kurzu'}
                        </div>
                        <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center group-hover:bg-white group-hover:text-current transition-colors text-white">
                          <ArrowRight size={20} className={cn(
                            course.color === 'blue' && "group-hover:text-blue-600",
                            course.color === 'purple' && "group-hover:text-purple-600",
                            course.color === 'orange' && "group-hover:text-orange-500",
                            course.color === 'green' && "group-hover:text-teal-600",
                            course.color === 'rose' && "group-hover:text-rose-600"
                          )} />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
