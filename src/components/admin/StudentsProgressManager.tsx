import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, 
  Search, 
  TrendingUp, 
  CheckCircle2, 
  XCircle, 
  Calendar, 
  Clock, 
  BookOpen, 
  Calculator, 
  Award, 
  RefreshCcw, 
  ChevronRight, 
  ArrowLeft,
  Sparkles,
  BarChart3,
  GraduationCap,
  ShieldCheck,
  UserCheck,
  Check,
  Loader2
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter, 
  DialogDescription 
} from '../ui/dialog';
import { cn } from '../../lib/utils';
import { 
  getStudentsProgressList, 
  StudentProgressItem, 
  StudentPracticeAttempt,
  updateStudentAccess 
} from '../../services/studentProgressService';
import { getAllCourses } from '../../services/courseService';
import { Course } from '../../types';
import { toast } from 'sonner';
import { TeamBlueIcon, CorrectCyanIcon, StarYellowIcon, StarPinkIcon, CapIcon, BrainPinkIcon, BookCyanIcon } from '../common/CustomIcon';

export default function StudentsProgressManager() {
  const [students, setStudents] = useState<StudentProgressItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<'all' | 'free' | 'premium' | 'course'>('all');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [subjectFilter, setSubjectFilter] = useState<'all' | 'Matematika' | 'Čeština'>('all');

  // Správa přístupu a kurzů
  const [courses, setCourses] = useState<Course[]>([]);
  const [isAccessModalOpen, setIsAccessModalOpen] = useState(false);
  const [targetStudent, setTargetStudent] = useState<StudentProgressItem | null>(null);
  const [accessRole, setAccessRole] = useState<'free' | 'premium' | 'course'>('free');
  const [accessCourseIds, setAccessCourseIds] = useState<string[]>([]);
  const [isSavingAccess, setIsSavingAccess] = useState(false);

  const loadData = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);

    try {
      const data = await getStudentsProgressList();
      setStudents(data);
      if (isManual) {
        toast.success('Seznam studentů byl aktualizován');
      }
      // Pokud nebyl vybrán student a máme studenty, předvybereme prvního
      if (!selectedStudentId && data.length > 0) {
        setSelectedStudentId(data[0].uid);
      }
    } catch (err: any) {
      console.error('Chyba při načítání postupu studentů:', err);
      toast.error('Nepodařilo se načíst data o studentech');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    getAllCourses().then(cData => {
      setCourses(cData);
    }).catch(err => {
      console.warn('Nepodařilo se načíst kurzy pro přiřazení:', err);
    });
  }, []);

  const handleOpenAccessModal = (student: StudentProgressItem) => {
    setTargetStudent(student);
    const normalizedRole = student.role === 'course' 
      ? 'course' 
      : (student.role === 'premium' ? 'premium' : 'free');
    setAccessRole(normalizedRole);
    setAccessCourseIds(student.enrolledCourseIds || []);
    setIsAccessModalOpen(true);
  };

  const handleToggleCourse = (courseId: string) => {
    setAccessCourseIds(prev => {
      const exists = prev.includes(courseId);
      const next = exists ? prev.filter(id => id !== courseId) : [...prev, courseId];
      if (!exists && next.length > 0) {
        setAccessRole('course');
      }
      return next;
    });
  };

  const handleSaveAccess = async () => {
    if (!targetStudent) return;
    setIsSavingAccess(true);

    try {
      await updateStudentAccess(targetStudent.uid, {
        role: accessRole,
        enrolledCourseIds: accessCourseIds
      });

      // Optimistic update of local state
      setStudents(prev => prev.map(s => {
        if (s.uid === targetStudent.uid) {
          return {
            ...s,
            role: accessRole,
            enrolledCourseIds: accessCourseIds,
            courseId: accessCourseIds.length > 0 ? accessCourseIds[0] : undefined
          };
        }
        return s;
      }));

      toast.success(`Přístup studenta ${targetStudent.name} byl úspěšně upraven.`);
      setIsAccessModalOpen(false);
      setTargetStudent(null);
    } catch (err: any) {
      console.error('Chyba při ukládání přístupu:', err);
      toast.error(err.message || 'Nepodařilo se uložit přístup studenta.');
    } finally {
      setIsSavingAccess(false);
    }
  };

  // Filtrovaný seznam studentů
  const filteredStudents = useMemo(() => {
    return students.filter(student => {
      const matchesSearch = 
        student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        student.email.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesRole = 
        selectedRole === 'all' || 
        (selectedRole === 'free' && (student.role === 'free' || student.role === 'student')) ||
        student.role === selectedRole;

      return matchesSearch && matchesRole;
    });
  }, [students, searchQuery, selectedRole]);

  // Vybraný student
  const selectedStudent = useMemo(() => {
    return students.find(s => s.uid === selectedStudentId) || null;
  }, [students, selectedStudentId]);

  // Filtrované pokusy vybraného studenta
  const filteredAttempts = useMemo(() => {
    if (!selectedStudent) return [];
    if (subjectFilter === 'all') return selectedStudent.attempts;
    return selectedStudent.attempts.filter(a => a.subject.toLowerCase() === subjectFilter.toLowerCase());
  }, [selectedStudent, subjectFilter]);

  // Globální souhrnné statistiky
  const overallStats = useMemo(() => {
    const totalStudents = students.length;
    const totalAttempts = students.reduce((acc, s) => acc + s.totalAttempts, 0);
    const activeStudents = students.filter(s => s.totalAttempts > 0).length;
    const studentsWithAttempts = students.filter(s => s.totalAttempts > 0);
    const overallAvg = studentsWithAttempts.length > 0
      ? Math.round(studentsWithAttempts.reduce((acc, s) => acc + s.averagePercentage, 0) / studentsWithAttempts.length)
      : 0;

    return { totalStudents, totalAttempts, activeStudents, overallAvg };
  }, [students]);

  const formatDate = (date: Date | null | undefined) => {
    if (!date) return 'Zatím neprocvičoval(a)';
    return date.toLocaleDateString('cs-CZ', {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatShortDate = (date: Date | null | undefined) => {
    if (!date) return '-';
    return date.toLocaleDateString('cs-CZ', {
      day: 'numeric',
      month: 'numeric'
    });
  };

  const getScoreBadgeColor = (percentage: number) => {
    if (percentage >= 80) return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    if (percentage >= 50) return 'bg-amber-50 text-amber-800 border-amber-200';
    return 'bg-rose-50 text-rose-800 border-rose-200';
  };

  const getScoreBarColor = (percentage: number) => {
    if (percentage >= 80) return 'bg-emerald-500';
    if (percentage >= 50) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'premium':
        return (
          <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md flex items-center gap-1">
            <StarPinkIcon size={12} /> Premium
          </span>
        );
      case 'course':
        return (
          <span className="text-[10px] font-black uppercase tracking-wider text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md flex items-center gap-1">
            <CapIcon size={12} /> Kurz (VIP)
          </span>
        );
      default:
        return (
          <span className="text-[10px] font-bold text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-md">
            Free
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 gap-4 bg-white rounded-3xl border border-gray-200">
        <div className="w-10 h-10 border-4 border-[#B80053] border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-600 font-bold text-sm">Načítání přehledu studentů a jejich výsledků...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* HEADER SECTION: Title & Quick Global Stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-display font-black text-gray-900 tracking-tight flex items-center gap-3">
            <TeamBlueIcon size={30} />
            Přehled studentů a výsledků
          </h2>
          <p className="text-gray-500 text-sm font-semibold mt-1">
            Sledujte, co vaši studenti procvičují, jaké mají skóre a kde potřebují pomoci.
          </p>
        </div>

        <Button
          onClick={() => loadData(true)}
          disabled={refreshing}
          variant="outline"
          className="rounded-2xl border-gray-200 hover:bg-gray-50 text-gray-700 font-bold text-xs h-10 px-4 self-start md:self-center flex items-center gap-2 cursor-pointer shadow-2xs"
        >
          <RefreshCcw size={14} className={cn(refreshing && "animate-spin")} />
          <span>{refreshing ? 'Aktualizace...' : 'Obnovit data'}</span>
        </Button>
      </div>

      {/* KPI STAT CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-xs font-bold uppercase tracking-wider">Celkem studentů</span>
            <TeamBlueIcon size={20} />
          </div>
          <div className="text-3xl font-black text-gray-900 font-mono">
            {overallStats.totalStudents}
          </div>
          <p className="text-[11px] text-gray-400 font-medium">Registrovaných účtů</p>
        </Card>

        <Card className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-xs font-bold uppercase tracking-wider">Dokončených cvičení</span>
            <CorrectCyanIcon size={20} />
          </div>
          <div className="text-3xl font-black text-gray-900 font-mono">
            {overallStats.totalAttempts}
          </div>
          <p className="text-[11px] text-gray-400 font-medium">Celkem vyhodnocených testů</p>
        </Card>

        <Card className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-xs font-bold uppercase tracking-wider">Průměrná úspěšnost</span>
            <TrendingUp size={18} className="text-amber-500" />
          </div>
          <div className="text-3xl font-black text-gray-900 font-mono flex items-baseline gap-1">
            {overallStats.overallAvg}<span className="text-lg font-bold text-gray-400">%</span>
          </div>
          <p className="text-[11px] text-gray-400 font-medium">Napříč všemi studenty</p>
        </Card>

        <Card className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-xs font-bold uppercase tracking-wider">Aktivní studenti</span>
            <StarYellowIcon size={20} />
          </div>
          <div className="text-3xl font-black text-gray-900 font-mono">
            {overallStats.activeStudents}
          </div>
          <p className="text-[11px] text-gray-400 font-medium">Alespoň 1 procvičená lekce</p>
        </Card>
      </div>

      {/* MAIN TWO-COLUMN MASTER-DETAIL LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* LEFT COLUMN (lg:col-span-5): Student List & Search */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white p-4 sm:p-5 rounded-3xl border border-gray-200/80 shadow-sm space-y-3">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <Input
                placeholder="Hledat studenta podle jména nebo e-mailu..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-11 rounded-2xl bg-[#FAF7F0] border-gray-200 text-sm font-medium focus:bg-white"
              />
            </div>

            {/* Role Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              <button
                onClick={() => setSelectedRole('all')}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer",
                  selectedRole === 'all'
                    ? "bg-[#1E1B18] text-white shadow-2xs"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                )}
              >
                Všichni ({students.length})
              </button>
              <button
                onClick={() => setSelectedRole('course')}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer",
                  selectedRole === 'course'
                    ? "bg-blue-600 text-white shadow-2xs"
                    : "bg-blue-50 text-blue-800 hover:bg-blue-100 border border-blue-200/50"
                )}
              >
                Kurz ({students.filter(s => s.role === 'course').length})
              </button>
              <button
                onClick={() => setSelectedRole('premium')}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer",
                  selectedRole === 'premium'
                    ? "bg-amber-600 text-white shadow-2xs"
                    : "bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200/50"
                )}
              >
                Premium ({students.filter(s => s.role === 'premium').length})
              </button>
              <button
                onClick={() => setSelectedRole('free')}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer",
                  selectedRole === 'free'
                    ? "bg-gray-700 text-white shadow-2xs"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                )}
              >
                Free ({students.filter(s => s.role === 'free' || s.role === 'student').length})
              </button>
            </div>
          </div>

          {/* Student Cards List */}
          <div className="space-y-2.5 max-h-[700px] overflow-y-auto pr-1">
            {filteredStudents.length === 0 ? (
              <div className="bg-white rounded-3xl p-8 text-center border border-gray-200 text-gray-500 font-medium">
                Nenalezen žádný student odpovídající hledání.
              </div>
            ) : (
              filteredStudents.map(student => {
                const isSelected = student.uid === selectedStudentId;

                return (
                  <div
                    key={student.uid}
                    onClick={() => setSelectedStudentId(student.uid)}
                    className={cn(
                      "p-4 rounded-3xl border transition-all cursor-pointer flex items-center justify-between gap-3 text-left relative overflow-hidden",
                      isSelected
                        ? "bg-white border-blue-500 shadow-md ring-2 ring-blue-500/10"
                        : "bg-white/90 hover:bg-white border-gray-200/70 hover:border-gray-300 hover:shadow-xs"
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Avatar */}
                      <div 
                        className="w-11 h-11 rounded-2xl overflow-hidden border border-gray-100 flex items-center justify-center shrink-0 shadow-2xs"
                        style={{ backgroundColor: student.avatarBgColor || '#FEF3C7' }}
                      >
                        {student.avatarEmoji ? (
                          <span className="text-xl leading-none">{student.avatarEmoji}</span>
                        ) : student.photoURL ? (
                          <img src={student.photoURL} alt={student.name} className="w-full h-full object-cover" />
                        ) : (
                          <CapIcon size={24} />
                        )}
                      </div>

                      {/* Name & Role */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="font-bold text-gray-900 text-sm truncate leading-tight">
                            {student.name}
                          </h4>
                          {getRoleBadge(student.role)}
                        </div>
                        <p className="text-[11px] text-gray-400 truncate mt-0.5">
                          {student.email}
                        </p>
                      </div>
                    </div>

                    {/* Stats Pill on Card */}
                    <div className="flex flex-col items-end shrink-0 gap-1">
                      {student.totalAttempts > 0 ? (
                        <>
                          <span className={cn(
                            "px-2 py-0.5 rounded-lg text-xs font-black border font-mono",
                            getScoreBadgeColor(student.averagePercentage)
                          )}>
                            {student.averagePercentage}%
                          </span>
                          <span className="text-[10px] text-gray-400 font-bold">
                            {student.totalAttempts}× procvičeno
                          </span>
                        </>
                      ) : (
                        <span className="text-[10px] font-semibold text-gray-400 bg-gray-50 px-2 py-1 rounded-lg">
                          Neaktivní
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT COLUMN (lg:col-span-7): Selected Student Detail & Practice Results */}
        <div className="lg:col-span-7">
          {!selectedStudent ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-gray-200 text-gray-400 font-medium">
              Vyberte studenta ze seznamu vlevo pro zobrazení jeho výsledků a historie procvičování.
            </div>
          ) : (
            <div className="space-y-6">
              
              {/* STUDENT PROFILE HEADER CARD */}
              <Card className="rounded-[2.5rem] border border-gray-200/80 bg-white p-6 sm:p-7 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div 
                      className="w-16 h-16 rounded-3xl overflow-hidden border-2 border-white flex items-center justify-center shrink-0 shadow-sm"
                      style={{ backgroundColor: selectedStudent.avatarBgColor || '#FEF3C7' }}
                    >
                      {selectedStudent.avatarEmoji ? (
                        <span className="text-3xl leading-none">{selectedStudent.avatarEmoji}</span>
                      ) : selectedStudent.photoURL ? (
                        <img src={selectedStudent.photoURL} alt={selectedStudent.name} className="w-full h-full object-cover" />
                      ) : (
                        <CapIcon size={34} />
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-2xl font-display font-black text-gray-900">
                          {selectedStudent.name}
                        </h3>
                        {getRoleBadge(selectedStudent.role)}
                      </div>
                      <p className="text-gray-500 font-medium text-xs sm:text-sm">
                        {selectedStudent.email}
                      </p>
                      <p className="text-gray-400 text-[11px] font-medium mt-1">
                        Registrace: {formatShortDate(selectedStudent.createdAt)} • Poslední aktivita: {formatDate(selectedStudent.lastPracticeAt)}
                      </p>
                    </div>
                  </div>

                  {/* Button "Spravovat přístup" napravo od jména studenta */}
                  <div className="flex items-center shrink-0 self-start sm:self-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenAccessModal(selectedStudent)}
                      className="rounded-xl border-gray-200 hover:border-black hover:bg-gray-50 text-gray-800 font-bold text-xs h-10 px-4 flex items-center gap-2 cursor-pointer shadow-2xs"
                    >
                      <ShieldCheck size={16} className="text-blue-600" />
                      <span>Spravovat přístup</span>
                    </Button>
                  </div>
                </div>

                {/* Detailed KPI row */}
                <div className="grid grid-cols-3 gap-3 pt-6 mt-6 border-t border-gray-100 text-center">
                  <div className="bg-[#FAF7F0] p-3 rounded-2xl border border-gray-200/50">
                    <div className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                      Procvičeno
                    </div>
                    <div className="text-2xl font-black text-gray-900 font-mono mt-0.5">
                      {selectedStudent.totalAttempts}
                    </div>
                    <div className="text-[10px] text-gray-500 font-semibold">lekcí</div>
                  </div>

                  <div className="bg-[#FAF7F0] p-3 rounded-2xl border border-gray-200/50">
                    <div className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                      Úspěšnost
                    </div>
                    <div className="text-2xl font-black text-gray-900 font-mono mt-0.5">
                      {selectedStudent.averagePercentage}%
                    </div>
                    <div className="text-[10px] text-gray-500 font-semibold">průměr</div>
                  </div>

                  <div className="bg-[#FAF7F0] p-3 rounded-2xl border border-gray-200/50">
                    <div className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                      Otázky
                    </div>
                    <div className="text-2xl font-black text-gray-900 font-mono mt-0.5">
                      {selectedStudent.totalScore} <span className="text-sm font-normal text-gray-400">/ {selectedStudent.totalQuestions}</span>
                    </div>
                    <div className="text-[10px] text-gray-500 font-semibold">správných</div>
                  </div>
                </div>

                {/* Subject Distribution */}
                <div className="grid grid-cols-2 gap-3 pt-3">
                  <div className="p-3 rounded-2xl bg-emerald-50/50 border border-emerald-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <BrainPinkIcon size={18} />
                      <span className="font-bold text-xs text-gray-800">Matematika</span>
                    </div>
                    <span className="font-mono font-black text-xs text-emerald-800">
                      {selectedStudent.mathAttemptsCount}×
                    </span>
                  </div>

                  <div className="p-3 rounded-2xl bg-rose-50/50 border border-rose-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <BookCyanIcon size={18} />
                      <span className="font-bold text-xs text-gray-800">Čeština</span>
                    </div>
                    <span className="font-mono font-black text-xs text-rose-800">
                      {selectedStudent.czechAttemptsCount}×
                    </span>
                  </div>
                </div>
              </Card>

              {/* PRACTICE ATTEMPTS / RESULTS LIST */}
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-lg font-black text-gray-900 tracking-tight flex items-center gap-2">
                    <BarChart3 size={18} className="text-blue-600" />
                    Historie procvičovaných témat ({filteredAttempts.length})
                  </h4>

                  {/* Subject filter */}
                  <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-gray-200 text-xs font-bold">
                    <button
                      onClick={() => setSubjectFilter('all')}
                      className={cn(
                        "px-2.5 py-1 rounded-lg transition-all cursor-pointer",
                        subjectFilter === 'all' ? "bg-gray-900 text-white" : "text-gray-600 hover:text-black"
                      )}
                    >
                      Vše
                    </button>
                    <button
                      onClick={() => setSubjectFilter('Matematika')}
                      className={cn(
                        "px-2.5 py-1 rounded-lg transition-all cursor-pointer",
                        subjectFilter === 'Matematika' ? "bg-emerald-600 text-white" : "text-gray-600 hover:text-black"
                      )}
                    >
                      Matika
                    </button>
                    <button
                      onClick={() => setSubjectFilter('Čeština')}
                      className={cn(
                        "px-2.5 py-1 rounded-lg transition-all cursor-pointer",
                        subjectFilter === 'Čeština' ? "bg-rose-600 text-white" : "text-gray-600 hover:text-black"
                      )}
                    >
                      Čeština
                    </button>
                  </div>
                </div>

                {filteredAttempts.length === 0 ? (
                  <Card className="rounded-3xl border border-dashed border-gray-200 p-8 text-center bg-white space-y-2">
                    <p className="text-gray-600 font-bold text-sm">
                      Žádné výsledky procvičování
                    </p>
                    <p className="text-gray-400 text-xs">
                      {selectedStudent.totalAttempts === 0 
                        ? 'Student zatím v aplikaci nedokončil žádné procvičování.'
                        : 'Pro vybraný filtr předmětu nebyly nalezeny žádné záznamy.'}
                    </p>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {filteredAttempts.map((attempt) => {
                      const isMath = attempt.subject.toLowerCase() === 'matematika';

                      return (
                        <div
                          key={attempt.id}
                          className="bg-white p-4 sm:p-5 rounded-3xl border border-gray-200/80 shadow-2xs hover:shadow-xs transition-all space-y-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className={cn(
                                  "text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md",
                                  isMath 
                                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200/60" 
                                    : "bg-rose-50 text-rose-800 border border-rose-200/60"
                                )}>
                                  {attempt.subject}
                                </span>
                                <span className="text-[11px] text-gray-400 font-semibold flex items-center gap-1">
                                  <Clock size={12} />
                                  {formatDate(attempt.createdAt)}
                                </span>
                              </div>
                              <h5 className="font-bold text-gray-900 text-base">
                                {attempt.subtopicTitle}
                              </h5>
                            </div>

                            {/* Percentage badge */}
                            <div className="text-right shrink-0">
                              <span className={cn(
                                "px-3 py-1 rounded-xl text-sm font-black border font-mono inline-block shadow-2xs",
                                getScoreBadgeColor(attempt.percentage)
                              )}>
                                {attempt.percentage}%
                              </span>
                              <div className="text-[11px] font-bold text-gray-500 mt-1">
                                {attempt.score} z {attempt.totalQuestions} správně
                              </div>
                            </div>
                          </div>

                          {/* Progress bar visualizer */}
                          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                            <div 
                              className={cn("h-full rounded-full transition-all duration-500", getScoreBarColor(attempt.percentage))}
                              style={{ width: `${attempt.percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          )}
        </div>

      </div>

      {/* DIALOG PRO SPRÁVU PŘÍSTUPU A KURZŮ STUDENTA */}
      <Dialog open={isAccessModalOpen} onOpenChange={setIsAccessModalOpen}>
        <DialogContent className="rounded-3xl p-6 sm:p-8 w-full sm:max-w-xl bg-white shadow-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <ShieldCheck size={18} />
              </span>
              <DialogTitle className="text-xl sm:text-2xl font-display font-black text-gray-900">
                Spravovat přístup
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs sm:text-sm text-gray-500 font-medium">
              Upravte tarif a přiřazené kurzy pro studenta <span className="font-bold text-gray-800">{targetStudent?.name}</span> ({targetStudent?.email}).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-3">
            {/* 1. VÝBĚR STATUSU / TARIFU */}
            <div className="space-y-2.5">
              <label className="text-xs font-black uppercase tracking-wider text-gray-700 block">
                Status / Tarif studenta
              </label>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {/* Free */}
                <button
                  type="button"
                  onClick={() => setAccessRole('free')}
                  className={cn(
                    "p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2",
                    accessRole === 'free'
                      ? "border-gray-900 bg-gray-900 text-white shadow-sm ring-2 ring-gray-900/10"
                      : "border-gray-200 bg-white hover:border-gray-300 text-gray-700"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider">Free</span>
                    {accessRole === 'free' && <Check size={14} className="text-emerald-400" />}
                  </div>
                  <p className={cn(
                    "text-[11px] leading-snug",
                    accessRole === 'free' ? "text-gray-300" : "text-gray-500"
                  )}>
                    Základní bezplatný účet, omezené cvičení
                  </p>
                </button>

                {/* Premium */}
                <button
                  type="button"
                  onClick={() => setAccessRole('premium')}
                  className={cn(
                    "p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2",
                    accessRole === 'premium'
                      ? "border-amber-500 bg-amber-500 text-white shadow-sm ring-2 ring-amber-500/20"
                      : "border-amber-200/80 bg-amber-50/40 hover:border-amber-300 text-amber-950"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider flex items-center gap-1">
                      <StarPinkIcon size={13} /> Premium
                    </span>
                    {accessRole === 'premium' && <Check size={14} className="text-white" />}
                  </div>
                  <p className={cn(
                    "text-[11px] leading-snug",
                    accessRole === 'premium' ? "text-amber-100" : "text-amber-800/80"
                  )}>
                    Kompletní teorie, materiály a neomezené testy
                  </p>
                </button>

                {/* Kurz VIP */}
                <button
                  type="button"
                  onClick={() => setAccessRole('course')}
                  className={cn(
                    "p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2",
                    accessRole === 'course'
                      ? "border-blue-600 bg-blue-600 text-white shadow-sm ring-2 ring-blue-600/20"
                      : "border-blue-200/80 bg-blue-50/40 hover:border-blue-300 text-blue-950"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider flex items-center gap-1">
                      <CapIcon size={14} /> Kurz (VIP)
                    </span>
                    {accessRole === 'course' && <Check size={14} className="text-white" />}
                  </div>
                  <p className={cn(
                    "text-[11px] leading-snug",
                    accessRole === 'course' ? "text-blue-100" : "text-blue-800/80"
                  )}>
                    Živé lekce kurzů + veškeré výhody Premium
                  </p>
                </button>
              </div>
            </div>

            {/* 2. PŘIŘAZENÍ KURZŮ */}
            <div className="space-y-2.5 pt-4 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black uppercase tracking-wider text-gray-700 block">
                  Přiřazené kurzy ({accessCourseIds.length})
                </label>
                <span className="text-[11px] text-gray-400 font-medium">
                  Označte kurzy, do kterých má mít student přístup
                </span>
              </div>

              {courses.length === 0 ? (
                <div className="p-4 bg-gray-50 rounded-2xl text-center text-xs text-gray-400 border border-dashed border-gray-200">
                  Žádné kurzy nejsou k dispozici.
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {courses.map(course => {
                    const isChecked = accessCourseIds.includes(course.id);

                    return (
                      <div
                        key={course.id}
                        onClick={() => handleToggleCourse(course.id)}
                        className={cn(
                          "p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3",
                          isChecked 
                            ? "bg-blue-50/70 border-blue-200 shadow-2xs" 
                            : "bg-white hover:bg-gray-50 border-gray-200/80"
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className={cn(
                            "w-5 h-5 rounded-lg border flex items-center justify-center shrink-0 transition-colors",
                            isChecked 
                              ? "bg-blue-600 border-blue-600 text-white" 
                              : "border-gray-300 bg-white"
                          )}>
                            {isChecked && <Check size={13} strokeWidth={3} />}
                          </div>

                          <div className="min-w-0">
                            <h5 className="font-bold text-xs sm:text-sm text-gray-900 truncate">
                              {course.title}
                            </h5>
                            {course.subject && (
                              <span className="text-[10px] font-semibold text-gray-400">
                                {course.subject}
                              </span>
                            )}
                          </div>
                        </div>

                        {course.price && (
                          <span className="text-[11px] font-bold text-gray-500 shrink-0">
                            {course.price}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="pt-4 border-t border-gray-100 flex items-center justify-end gap-2.5">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAccessModalOpen(false)}
              disabled={isSavingAccess}
              className="rounded-xl font-bold text-xs h-10 px-4 cursor-pointer"
            >
              Zrušit
            </Button>
            <Button
              type="button"
              onClick={handleSaveAccess}
              disabled={isSavingAccess}
              className="rounded-xl bg-[#1E1B18] hover:bg-black text-white font-bold text-xs h-10 px-5 shadow-sm cursor-pointer"
            >
              {isSavingAccess ? <Loader2 size={14} className="animate-spin mr-1.5" /> : null}
              Uložit změny
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
