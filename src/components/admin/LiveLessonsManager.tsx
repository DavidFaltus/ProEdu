import React, { useState, useEffect, useMemo } from 'react';
import { 
  Video, Plus, Calendar, Clock, Copy, ExternalLink, Play, CheckCircle2, 
  XCircle, Trash2, Edit2, AlertCircle, RefreshCw, Sparkles, UserCheck,
  Users, Search, Check, Square, CheckSquare, X, User
} from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cs } from 'date-fns/locale';
import { Timestamp } from 'firebase/firestore';
import { LiveLesson, LiveLessonStatus } from '../../types';
import { 
  subscribeToTeacherLiveLessons, 
  createLiveLesson, 
  updateLiveLesson, 
  updateLessonStatus, 
  deleteLiveLesson,
  getAllStudents,
  StudentUserItem
} from '../../services/liveLessonService';
import { getGoogleAccessToken, createGoogleMeetCalendarEvent } from '../../services/calendarService';
import { auth } from '../../lib/firebase';
import { cn } from '../../lib/utils';

interface LiveLessonsManagerProps {
  userId: string;
  teacherName: string;
}

export default function LiveLessonsManager({ userId, teacherName }: LiveLessonsManagerProps) {
  const effectiveUserId = userId || auth.currentUser?.uid || '';
  const effectiveTeacherName = teacherName || auth.currentUser?.displayName || 'Učitel';
  const [lessons, setLessons] = useState<LiveLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('active');

  // Students list state
  const [allStudents, setAllStudents] = useState<StudentUserItem[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('Matematika');
  const [description, setDescription] = useState('');
  const [scheduledDateTime, setScheduledDateTime] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [meetUrl, setMeetUrl] = useState('');
  const [isGeneratingMeet, setIsGeneratingMeet] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Audience & Student Selection State
  const [targetAudience, setTargetAudience] = useState<'all' | 'individual'>('all');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [studentSearch, setStudentSearch] = useState('');

  // Subscribe to teacher's lessons in Firestore
  useEffect(() => {
    if (!effectiveUserId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = subscribeToTeacherLiveLessons(
      effectiveUserId,
      (fetched) => {
        setLessons(fetched);
        setLoading(false);
      },
      (err) => {
        toast.error('Chyba při načítání živých lekcí: ' + err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [effectiveUserId]);

  // Load all registered students
  useEffect(() => {
    let isMounted = true;
    setLoadingStudents(true);
    getAllStudents()
      .then((res) => {
        if (isMounted) {
          setAllStudents(res);
          setLoadingStudents(false);
        }
      })
      .catch((err) => {
        console.error('Chyba při načítání studentů:', err);
        if (isMounted) setLoadingStudents(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // Filter students by name or email (case-insensitive)
  const filteredStudents = useMemo(() => {
    if (!studentSearch.trim()) return allStudents;
    const term = studentSearch.trim().toLowerCase();
    return allStudents.filter(
      (s) =>
        (s.name && s.name.toLowerCase().includes(term)) ||
        (s.email && s.email.toLowerCase().includes(term))
    );
  }, [allStudents, studentSearch]);

  const toggleStudent = (studentId: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(studentId)
        ? prev.filter((id) => id !== studentId)
        : [...prev, studentId]
    );
  };

  const selectAllFiltered = () => {
    const idsToAdd = filteredStudents.map((s) => s.id);
    setSelectedStudentIds((prev) => Array.from(new Set([...prev, ...idsToAdd])));
  };

  const deselectAllFiltered = () => {
    const idsToRemove = new Set(filteredStudents.map((s) => s.id));
    setSelectedStudentIds((prev) => prev.filter((id) => !idsToRemove.has(id)));
  };

  // Open modal for creating a new lesson
  const handleOpenCreateModal = () => {
    setEditingLessonId(null);
    setTitle('');
    setSubject('Matematika');
    setDescription('');
    setTargetAudience('all');
    setSelectedStudentIds([]);
    setStudentSearch('');
    
    // Default scheduled time: 1 hour from now rounded to next 15 minutes
    const now = new Date();
    now.setHours(now.getHours() + 1);
    now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0);
    const pad = (n: number) => n.toString().padStart(2, '0');
    const localDateTimeString = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    
    setScheduledDateTime(localDateTimeString);
    setDurationMinutes(45);
    setMeetUrl('');
    setIsModalOpen(true);
  };

  // Open modal for editing
  const handleOpenEditModal = (lesson: LiveLesson) => {
    setEditingLessonId(lesson.id || null);
    setTitle(lesson.title);
    setSubject(lesson.subject || 'Matematika');
    setDescription(lesson.description || '');
    setTargetAudience(lesson.targetAudience || 'all');
    setSelectedStudentIds(lesson.studentIds || []);
    setStudentSearch('');
    
    const d = lesson.scheduledAt.toDate();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const localDateTimeString = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    setScheduledDateTime(localDateTimeString);
    
    setDurationMinutes(lesson.durationMinutes || 45);
    setMeetUrl(lesson.meetUrl || '');
    setIsModalOpen(true);
  };

  // Generate Google Meet link via Google Calendar API
  const handleGenerateMeetLink = async () => {
    if (!title.trim()) {
      toast.error('Nejprve prosím vyplňte název lekce.');
      return;
    }
    if (!scheduledDateTime) {
      toast.error('Vyberte prosím datum a čas lekce.');
      return;
    }

    try {
      setIsGeneratingMeet(true);
      toast.info('Požadavek na autorizaci Google účtu a vytvoření schůzky...');

      const token = await getGoogleAccessToken();
      const startTime = new Date(scheduledDateTime);
      const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);

      const eventData = {
        summary: `ProEdu: ${title.trim()}`,
        description: description.trim() || `Živá online lekce v ProEdu s lektorem ${effectiveTeacherName}.`,
        start: {
          dateTime: startTime.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      };

      const { meetUrl: generatedUrl } = await createGoogleMeetCalendarEvent(token, eventData);
      setMeetUrl(generatedUrl);
      toast.success('Odkaz na Google Meet byl úspěšně vygenerován a uložen do vašeho Google kalendáře!');
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Nepodařilo se vygenerovat odkaz přes Google Kalendář. Můžete odkaz vložit i ručně.');
    } finally {
      setIsGeneratingMeet(false);
    }
  };

  // Save lesson (create or update)
  const handleSaveLesson = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast.error('Zadejte prosím název lekce.');
      return;
    }

    if (!scheduledDateTime) {
      toast.error('Zvolte datum a čas lekce.');
      return;
    }

    if (!meetUrl.trim()) {
      toast.error('Zadejte nebo vygenerujte odkaz na videohovor (Google Meet).');
      return;
    }

    // Basic URL validation
    const trimmedUrl = meetUrl.trim();
    if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
      toast.error('Odkaz musí začínat https:// (např. https://meet.google.com/xxx-yyyy-zzz)');
      return;
    }

    if (targetAudience === 'individual' && selectedStudentIds.length === 0) {
      toast.error('Vyberte prosím alespoň jednoho studenta, nebo přepněte na Všichni studenti.');
      return;
    }

    try {
      setIsSaving(true);
      const scheduledTimestamp = Timestamp.fromDate(new Date(scheduledDateTime));

      if (editingLessonId) {
        await updateLiveLesson(editingLessonId, {
          title: title.trim(),
          description: description.trim() || undefined,
          subject: subject.trim() || undefined,
          scheduledAt: scheduledTimestamp,
          durationMinutes: Number(durationMinutes),
          meetUrl: trimmedUrl,
          targetAudience,
          studentIds: targetAudience === 'individual' ? selectedStudentIds : undefined,
        });
        toast.success('Lekce byla úspěšně upravena.');
      } else {
        await createLiveLesson({
          title: title.trim(),
          description: description.trim() || undefined,
          subject: subject.trim() || undefined,
          teacherId: effectiveUserId,
          teacherName: effectiveTeacherName,
          provider: 'google_meet',
          meetUrl: trimmedUrl,
          scheduledAt: scheduledTimestamp,
          durationMinutes: Number(durationMinutes),
          status: 'scheduled',
          targetAudience,
          studentIds: targetAudience === 'individual' ? selectedStudentIds : undefined,
        });
        toast.success('Nová živá lekce byla naplánována a publikována studentům.');
      }

      setIsModalOpen(false);
    } catch (error: any) {
      console.error(error);
      toast.error('Chyba při ukládání lekce: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Status transitions
  const handleStartLesson = async (lesson: LiveLesson) => {
    if (!lesson.id) return;
    try {
      await updateLessonStatus(lesson.id, 'live');
      toast.success('Lekce byla spuštěna! Otevírám Google Meet...');
      window.open(lesson.meetUrl, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      toast.error('Nepodařilo se spustit lekci: ' + err.message);
    }
  };

  const handleFinishLesson = async (lesson: LiveLesson) => {
    if (!lesson.id) return;
    try {
      await updateLessonStatus(lesson.id, 'completed');
      toast.success('Lekce byla označena jako dokončená.');
    } catch (err: any) {
      toast.error('Chyba: ' + err.message);
    }
  };

  const handleCancelLesson = async (lesson: LiveLesson) => {
    if (!lesson.id) return;
    if (!window.confirm('Opravdu chcete tuto lekci zrušit?')) return;
    try {
      await updateLessonStatus(lesson.id, 'cancelled');
      toast.success('Lekce byla zrušena.');
    } catch (err: any) {
      toast.error('Chyba: ' + err.message);
    }
  };

  const handleDeleteLesson = async (lessonId: string) => {
    if (!window.confirm('Opravdu chcete lekci trvale smazat?')) return;
    try {
      await deleteLiveLesson(lessonId);
      toast.success('Lekce byla smazána.');
    } catch (err: any) {
      toast.error('Chyba při mazání: ' + err.message);
    }
  };

  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success('Odkaz na Google Meet byl zkopírován do schránky.');
  };

  // Filter lessons
  const filteredLessons = lessons.filter((l) => {
    if (filter === 'active') return l.status === 'live' || l.status === 'scheduled';
    if (filter === 'completed') return l.status === 'completed' || l.status === 'cancelled';
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
            <Video size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Správa lekcí</h2>
            <p className="text-xs text-gray-500">
              Plánujte online hodiny, generujte schůzky v kalendáři a připojujte studenty.
            </p>
          </div>
        </div>

        <Button
          onClick={handleOpenCreateModal}
          className="bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold flex items-center gap-2 shadow-sm"
        >
          <Plus size={18} />
          Naplánovat novou lekci
        </Button>
      </div>

      {/* Info notice about Google Meet & students without Google accounts */}
      <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4 flex items-start gap-3 text-amber-900 text-xs sm:text-sm">
        <UserCheck className="shrink-0 mt-0.5 text-amber-600" size={18} />
        <div>
          <span className="font-bold">Podpora pro studenty bez Google účtu:</span> Studenti bez účtu Google se mohou snadno připojit z počítače nebo notebooku. Po otevření odkazu zadají své jméno a kliknou na <em>„Požádat o připojení“ (Knocking)</em>. Vám se v běžícím Google Meet hovoru zobrazí vyskakovací okno, kde je jedním kliknutím vpustíte.
        </div>
      </div>

      {/* Tabs / Filters */}
      <div className="flex gap-2 border-b border-gray-200 pb-2">
        <button
          onClick={() => setFilter('active')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            filter === 'active' 
              ? 'bg-[#1E1B18] text-white shadow-sm' 
              : 'text-gray-500 hover:bg-gray-100'
          }`}
        >
          Aktivní & Naplánované ({lessons.filter(l => l.status === 'live' || l.status === 'scheduled').length})
        </button>
        <button
          onClick={() => setFilter('completed')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            filter === 'completed' 
              ? 'bg-[#1E1B18] text-white shadow-sm' 
              : 'text-gray-500 hover:bg-gray-100'
          }`}
        >
          Proběhlé & Zrušené ({lessons.filter(l => l.status === 'completed' || l.status === 'cancelled').length})
        </button>
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            filter === 'all' 
              ? 'bg-[#1E1B18] text-white shadow-sm' 
              : 'text-gray-500 hover:bg-gray-100'
          }`}
        >
          Všechny ({lessons.length})
        </button>
      </div>

      {/* Lessons List */}
      {loading ? (
        <div className="py-12 text-center text-gray-400">
          <RefreshCw className="animate-spin mx-auto mb-2" size={24} />
          <p className="text-sm font-medium">Načítám lekce...</p>
        </div>
      ) : filteredLessons.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-200 p-8">
          <Video className="mx-auto text-gray-300 mb-3" size={40} />
          <p className="text-gray-700 font-bold text-base">Žádné lekce v této kategorii</p>
          <p className="text-gray-400 text-xs mt-1 max-w-md mx-auto">
            {filter === 'active' 
              ? 'Momentálně nemáte naplánované žádné živé hodiny. Klikněte na tlačítko výše a naplánujte první online výuku!' 
              : 'Žádné dokončené lekce.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredLessons.map((lesson) => {
            const isLive = lesson.status === 'live';
            const isScheduled = lesson.status === 'scheduled';
            const isCompleted = lesson.status === 'completed';
            const isCancelled = lesson.status === 'cancelled';
            const lessonDate = lesson.scheduledAt?.toDate ? lesson.scheduledAt.toDate() : new Date();

            return (
              <Card 
                key={lesson.id} 
                className={`rounded-2xl border shadow-sm transition-all overflow-hidden ${
                  isLive 
                    ? 'border-red-400 bg-red-50/20 shadow-md ring-2 ring-red-400/30' 
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <CardContent className="p-5 flex flex-col justify-between h-full gap-4">
                  {/* Top Bar: Subject & Status */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg bg-gray-100 text-gray-700">
                        {lesson.subject || 'Výuka'}
                      </span>
                      {lesson.targetAudience === 'individual' ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 flex items-center gap-1">
                          <UserCheck size={11} />
                          {lesson.studentIds?.length || 0} studentů
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1">
                          <Users size={11} />
                          Všichni
                        </span>
                      )}
                    </div>

                    {isLive && (
                      <span className="flex items-center gap-1.5 text-xs font-black text-red-600 bg-red-100/80 px-2.5 py-1 rounded-full animate-pulse">
                        <span className="w-2 h-2 rounded-full bg-red-600 animate-ping" />
                        PRÁVĚ PROBÍHÁ
                      </span>
                    )}

                    {isScheduled && (
                      <Badge variant="outline" className="border-blue-200 text-blue-700 bg-blue-50/60 font-semibold text-xs">
                        Naplánováno
                      </Badge>
                    )}

                    {isCompleted && (
                      <Badge variant="outline" className="border-green-200 text-green-700 bg-green-50/60 font-semibold text-xs">
                        Dokončeno
                      </Badge>
                    )}

                    {isCancelled && (
                      <Badge variant="outline" className="border-gray-200 text-gray-500 bg-gray-50 font-semibold text-xs">
                        Zrušeno
                      </Badge>
                    )}
                  </div>

                  {/* Title & Description */}
                  <div>
                    <h3 className="text-lg font-black text-gray-900 leading-tight mb-1">
                      {lesson.title}
                    </h3>
                    {lesson.description && (
                      <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed mb-2">
                        {lesson.description}
                      </p>
                    )}
                    {lesson.targetAudience === 'individual' && lesson.studentIds && lesson.studentIds.length > 0 && (
                      <div className="flex items-center gap-1.5 text-[11px] text-purple-700 bg-purple-50/80 px-2.5 py-1.5 rounded-xl border border-purple-100">
                        <UserCheck size={13} className="shrink-0" />
                        <span className="truncate">
                          <strong>Přiřazeno:</strong> {lesson.studentIds.map(id => allStudents.find(s => s.id === id)?.name || 'Student').join(', ')}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Date, Time & Duration */}
                  <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-gray-600 bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                    <div className="flex items-center gap-1.5 font-bold">
                      <Calendar size={14} className="text-gray-400" />
                      {format(lessonDate, 'd. MMMM yyyy', { locale: cs })}
                    </div>
                    <div className="flex items-center gap-1.5 font-bold">
                      <Clock size={14} className="text-gray-400" />
                      {format(lessonDate, 'HH:mm')} ({lesson.durationMinutes} min)
                    </div>
                  </div>

                  {/* Google Meet Link Display */}
                  <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-blue-50/50 border border-blue-100 text-xs">
                    <div className="flex items-center gap-2 truncate">
                      <Video size={14} className="text-blue-600 shrink-0" />
                      <span className="truncate font-mono text-[11px] text-blue-800">
                        {lesson.meetUrl}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopyLink(lesson.meetUrl)}
                      className="h-7 px-2 text-blue-700 hover:bg-blue-100 rounded-lg cursor-pointer shrink-0"
                      title="Kopírovat odkaz"
                    >
                      <Copy size={13} />
                    </Button>
                  </div>

                  {/* Actions Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-100">
                    <div className="flex items-center gap-1">
                      {/* Edit / Delete */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenEditModal(lesson)}
                        className="h-8 w-8 p-0 rounded-lg hover:bg-gray-100 text-gray-500"
                        title="Upravit lekci"
                      >
                        <Edit2 size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteLesson(lesson.id!)}
                        className="h-8 w-8 p-0 rounded-lg hover:bg-red-50 text-red-500"
                        title="Smazat lekci"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>

                    <div className="flex items-center gap-2 ml-auto">
                      {isScheduled && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCancelLesson(lesson)}
                            className="h-8 text-xs font-bold text-gray-500 hover:bg-gray-50 rounded-lg"
                          >
                            Zrušit
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleStartLesson(lesson)}
                            className="h-8 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center gap-1.5 shadow-sm"
                          >
                            <Play size={13} className="fill-white" />
                            Spustit lekci
                          </Button>
                        </>
                      )}

                      {isLive && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleFinishLesson(lesson)}
                            className="h-8 text-xs font-bold text-green-700 border-green-200 hover:bg-green-50 rounded-lg"
                          >
                            <CheckCircle2 size={14} className="mr-1" />
                            Ukončit
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => window.open(lesson.meetUrl, '_blank', 'noopener,noreferrer')}
                            className="h-8 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center gap-1.5 shadow-sm"
                          >
                            <ExternalLink size={13} />
                            Vstoupit do Meetu
                          </Button>
                        </>
                      )}

                      {(isCompleted || isCancelled) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(lesson.meetUrl, '_blank', 'noopener,noreferrer')}
                          className="h-8 text-xs font-bold text-gray-600 hover:bg-gray-50 rounded-lg flex items-center gap-1"
                        >
                          <ExternalLink size={13} />
                          Otevřít odkaz
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto rounded-3xl p-6 sm:p-7">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-gray-900 flex items-center gap-2">
              <Video className="text-red-600" size={22} />
              {editingLessonId ? 'Upravit živou lekci' : 'Naplánovat novou lekci Google Meet'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveLesson} className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-bold text-gray-700">Název lekce *</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="např. Příprava na přijímačky – Lineární rovnice"
                className="mt-1 rounded-xl"
                maxLength={256}
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-bold text-gray-700">Předmět</Label>
                <select
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full mt-1 h-9 rounded-xl border border-gray-200 px-3 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue"
                >
                  <option value="Matematika">Matematika</option>
                  <option value="Český jazyk">Český jazyk</option>
                  <option value="Konzultace">Konzultace / Doučování</option>
                  <option value="Jiné">Jiné</option>
                </select>
              </div>

              <div>
                <Label className="text-xs font-bold text-gray-700">Délka trvání (minuty)</Label>
                <Input
                  type="number"
                  min={15}
                  max={240}
                  step={5}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  className="mt-1 rounded-xl"
                  required
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-bold text-gray-700">Datum a čas začátku *</Label>
              <Input
                type="datetime-local"
                value={scheduledDateTime}
                onChange={(e) => setScheduledDateTime(e.target.value)}
                className="mt-1 rounded-xl"
                required
              />
            </div>

            <div>
              <Label className="text-xs font-bold text-gray-700">Popis nebo instrukce pro studenty</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Připravte si sešit, rýsovací potřeby a vzorce..."
                className="mt-1 rounded-xl min-h-[70px]"
                maxLength={1000}
              />
            </div>

            {/* Target Audience & Student Selection */}
            <div className="space-y-3 pt-1">
              <Label className="text-xs font-bold text-gray-700 flex items-center justify-between">
                <span>Cílová skupina lekce *</span>
                <span className="text-[11px] text-gray-400 font-normal">
                  {targetAudience === 'all' 
                    ? 'Lekce bude viditelná pro všechny studenty' 
                    : `Lekce bude viditelná pouze pro vybrané studenty (${selectedStudentIds.length})`}
                </span>
              </Label>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTargetAudience('all')}
                  className={cn(
                    "flex items-center justify-center gap-2 p-3 rounded-2xl border text-xs font-bold transition-all cursor-pointer",
                    targetAudience === 'all'
                      ? "bg-[#1E1B18] text-white border-[#1E1B18] shadow-sm"
                      : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                  )}
                >
                  <Users size={16} />
                  Všichni studenti
                </button>

                <button
                  type="button"
                  onClick={() => setTargetAudience('individual')}
                  className={cn(
                    "flex items-center justify-center gap-2 p-3 rounded-2xl border text-xs font-bold transition-all cursor-pointer",
                    targetAudience === 'individual'
                      ? "bg-[#1E1B18] text-white border-[#1E1B18] shadow-sm"
                      : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                  )}
                >
                  <UserCheck size={16} />
                  Konkrétní studenti {selectedStudentIds.length > 0 && `(${selectedStudentIds.length})`}
                </button>
              </div>

              {/* Individual Student Selection Panel */}
              {targetAudience === 'individual' && (
                <div className="p-4 rounded-2xl bg-gray-50/80 border border-gray-200 space-y-3 animate-in fade-in-50 duration-200">
                  {/* Search Bar */}
                  <div className="relative">
                    <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <Input
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      placeholder="Hledat studenta podle jména nebo e-mailu..."
                      className="pl-9 bg-white rounded-xl text-xs h-10 border-gray-200 focus-visible:ring-brand-blue"
                    />
                    {studentSearch && (
                      <button
                        type="button"
                        onClick={() => setStudentSearch('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* Batch actions & counter */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 font-medium">
                    <span>
                      Vybráno: <strong className="text-gray-900">{selectedStudentIds.length}</strong> z celkem {allStudents.length} studentů
                    </span>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={selectAllFiltered}
                        className="h-7 px-2 text-[11px] font-bold text-blue-600 hover:bg-blue-50"
                      >
                        Vybrat zobrazené ({filteredStudents.length})
                      </Button>
                      {selectedStudentIds.length > 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={deselectAllFiltered}
                          className="h-7 px-2 text-[11px] font-bold text-red-600 hover:bg-red-50"
                        >
                          Zrušit výběr
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Selected Chips */}
                  {selectedStudentIds.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1.5 bg-white rounded-xl border border-gray-100">
                      {selectedStudentIds.map((id) => {
                        const student = allStudents.find((s) => s.id === id);
                        return (
                          <span
                            key={id}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 text-[11px] font-bold border border-blue-100"
                          >
                            <span>{student?.name || id}</span>
                            <button
                              type="button"
                              onClick={() => toggleStudent(id)}
                              className="text-blue-500 hover:text-blue-700 cursor-pointer"
                            >
                              <X size={12} />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Scrollable Student List */}
                  <div className="max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-white divide-y divide-gray-100 shadow-inner">
                    {loadingStudents ? (
                      <div className="p-6 text-center text-xs text-gray-400">
                        Načítám seznam studentů...
                      </div>
                    ) : filteredStudents.length === 0 ? (
                      <div className="p-6 text-center text-xs text-gray-400">
                        {allStudents.length === 0
                          ? 'V aplikaci zatím nejsou zaregistrovaní žádní studenti.'
                          : `Žádný student neodpovídá výrazu „${studentSearch}“.`}
                      </div>
                    ) : (
                      filteredStudents.map((student) => {
                        const isSelected = selectedStudentIds.includes(student.id);

                        return (
                          <div
                            key={student.id}
                            onClick={() => toggleStudent(student.id)}
                            className={cn(
                              "p-2.5 px-3 flex items-center justify-between gap-3 text-xs cursor-pointer transition-colors",
                              isSelected 
                                ? "bg-blue-50/60 hover:bg-blue-50 font-medium" 
                                : "hover:bg-gray-50 text-gray-700"
                            )}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className={cn(
                                "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-black",
                                isSelected ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-500"
                              )}>
                                {student.name.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0 truncate">
                                <p className={cn("truncate font-bold text-xs", isSelected ? "text-blue-950" : "text-gray-900")}>
                                  {student.name}
                                </p>
                                <p className="truncate text-[11px] text-gray-400 font-normal">
                                  {student.email || 'Bez emailu'}
                                </p>
                              </div>
                            </div>

                            <div className="shrink-0">
                              {isSelected ? (
                                <CheckSquare size={18} className="text-blue-600" />
                              ) : (
                                <Square size={18} className="text-gray-300" />
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Meet Link Section */}
            <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                  <Video size={15} className="text-red-500" />
                  Odkaz na Google Meet *
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateMeetLink}
                  disabled={isGeneratingMeet}
                  className="h-7 text-xs font-bold border-blue-200 text-blue-700 bg-blue-50/80 hover:bg-blue-100 rounded-lg flex items-center gap-1.5"
                >
                  <Sparkles size={13} className={isGeneratingMeet ? 'animate-spin' : ''} />
                  {isGeneratingMeet ? 'Vytvářím schůzku...' : 'Vygenerovat přes Google Kalendář'}
                </Button>
              </div>

              <Input
                value={meetUrl}
                onChange={(e) => setMeetUrl(e.target.value)}
                placeholder="https://meet.google.com/xxx-yyyy-zzz"
                className="rounded-xl font-mono text-xs bg-white"
                required
              />

              <p className="text-[11px] text-gray-500 leading-relaxed">
                Můžete vygenerovat nový odkaz jedním kliknutím tlačítkem výše (přes připojený Google účet), nebo sem ručně vložit odkaz na libovolnou existující místnost Google Meet.
              </p>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsModalOpen(false)}
                className="rounded-xl text-gray-500"
              >
                Zrušit
              </Button>
              <Button
                type="submit"
                disabled={isSaving}
                className="bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-sm"
              >
                {isSaving ? 'Ukládám...' : editingLessonId ? 'Uložit změny' : 'Naplánovat lekci'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
