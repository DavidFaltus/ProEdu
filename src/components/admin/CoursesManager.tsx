import React, { useState, useEffect } from 'react';
import { 
  Plus, Edit2, Trash2, GraduationCap, Calendar, Clock, 
  User, DollarSign, BookOpen, Sparkles, Check, Loader2, 
  ExternalLink, Layers, Search, AlertCircle, X
} from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { toast } from 'sonner';
import { Course } from '../../types';
import { 
  getAllCourses, 
  createCourse, 
  updateCourse, 
  deleteCourse,
  seedDefaultCourses 
} from '../../services/courseService';
import { Link } from 'react-router-dom';

interface CoursesManagerProps {
  userId: string;
}

export default function CoursesManager({ userId }: CoursesManagerProps) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('all');

  // Dialog State (Create / Edit)
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [saving, setSaving] = useState(false);

  // Form Fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subject, setSubject] = useState('Matematika');
  const [price, setPrice] = useState('2 490 Kč / sezóna');
  const [difficulty, setDifficulty] = useState('Střední (Cermat 9. třída)');
  const [schedule, setSchedule] = useState('Úterý 17:00 – 18:30 (1× týdně, 90 min)');
  const [instructorName, setInstructorName] = useState('Mgr. Kateřina Dvořáková');
  const [startDate, setStartDate] = useState('2026-10-01');
  const [endDate, setEndDate] = useState('2027-04-10');
  const [badge, setBadge] = useState('Aktivní kurz');
  const [color, setColor] = useState('blue');
  const [meetUrl, setMeetUrl] = useState('');
  
  // Syllabus items
  const [syllabus, setSyllabus] = useState<string[]>([]);
  const [newTopic, setNewTopic] = useState('');

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getAllCourses();
      setCourses(data);
    } catch (err: any) {
      toast.error('Chyba při načítání kurzů: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreateDialog = () => {
    setEditingCourse(null);
    setTitle('');
    setDescription('');
    setSubject('Matematika');
    setPrice('2 490 Kč / sezóna');
    setDifficulty('Střední (Cermat 9. třída)');
    setSchedule('Úterý 17:00 – 18:30 (1× týdně, 90 min)');
    setInstructorName('Mgr. Kateřina Dvořáková');
    setStartDate('2026-10-01');
    setEndDate('2027-04-10');
    setBadge('Aktivní kurz');
    setColor('blue');
    setMeetUrl('https://meet.google.com/');
    setSyllabus([
      'Úvod do testů CERMAT a časový plán',
      'Klíčové početní operace a zlomky',
      'Rovnice a vyjádření neznámé',
      'Geometrie a konstrukční úlohy',
      'Závěrečný test nanečisto'
    ]);
    setIsDialogOpen(true);
  };

  const openEditDialog = (c: Course) => {
    setEditingCourse(c);
    setTitle(c.title || '');
    setDescription(c.description || '');
    setSubject(c.subject || 'Matematika');
    setPrice(c.price || '2 490 Kč / sezóna');
    setDifficulty(c.difficulty || 'Střední (Cermat 9. třída)');
    setSchedule(c.schedule || '');
    setInstructorName(c.instructorName || '');
    setStartDate(c.startDate || '');
    setEndDate(c.endDate || '');
    setBadge(c.badge || '');
    setColor(c.color || 'blue');
    setMeetUrl(c.meetUrl || '');
    setSyllabus(Array.isArray(c.syllabus) ? c.syllabus : []);
    setIsDialogOpen(true);
  };

  const handleAddSyllabusItem = () => {
    if (!newTopic.trim()) return;
    setSyllabus(prev => [...prev, newTopic.trim()]);
    setNewTopic('');
  };

  const handleRemoveSyllabusItem = (index: number) => {
    setSyllabus(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Zadej prosím název kurzu');
      return;
    }

    setSaving(true);
    try {
      const payload: Partial<Course> = {
        title: title.trim(),
        description: description.trim(),
        subject,
        price: price.trim(),
        difficulty: difficulty.trim(),
        schedule: schedule.trim(),
        instructorName: instructorName.trim(),
        startDate,
        endDate,
        badge: badge.trim(),
        color,
        meetUrl: meetUrl.trim(),
        syllabus: syllabus.filter(Boolean),
        teacherId: userId
      };

      if (editingCourse) {
        await updateCourse(editingCourse.id, payload);
        toast.success(`Kurz "${title}" byl úspěšně upraven!`);
      } else {
        await createCourse(payload as any, userId);
        toast.success(`Nový kurz "${title}" byl vytvořen!`);
      }

      setIsDialogOpen(false);
      await loadData();
    } catch (err: any) {
      toast.error('Chyba při ukládání: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (courseId: string) => {
    if (!confirm('Opravdu si přeješ smazat tento kurz?')) return;
    setDeletingId(courseId);
    try {
      await deleteCourse(courseId);
      toast.success('Kurz byl smazán.');
      await loadData();
    } catch (err: any) {
      toast.error('Chyba při mazání: ' + err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const filteredCourses = courses.filter(c => {
    const matchesSearch = !search || 
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      (c.description && c.description.toLowerCase().includes(search.toLowerCase())) ||
      (c.instructorName && c.instructorName.toLowerCase().includes(search.toLowerCase()));

    const matchesSubject = subjectFilter === 'all' || 
      (subjectFilter === 'math' && (c.subject === 'Matematika' || c.subject === 'MA + ČJ')) ||
      (subjectFilter === 'czech' && (c.subject === 'Český jazyk' || c.subject === 'MA + ČJ')) ||
      c.subject === subjectFilter;

    return matchesSearch && matchesSubject;
  });

  const colors = ['blue', 'purple', 'orange', 'green', 'rose'];

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-gray-100 shadow-xs">
        <div>
          <h2 className="text-2xl font-display font-black text-gray-900 tracking-tight flex items-center gap-2.5">
            <GraduationCap className="text-indigo-600" size={28} />
            Správa přípravných kurzů
          </h2>
          <p className="text-gray-500 text-sm mt-0.5">
            Vytvářej nové kurzy, upravuj osnovu témat, náročnost, ceny a termíny výuky.
          </p>
        </div>

        <Button
          onClick={openCreateDialog}
          className="bg-[#F5C400] text-[#1E1B18] hover:bg-[#F5C400]/90 h-11 px-6 rounded-xl font-bold flex items-center gap-2 cursor-pointer shadow-sm"
        >
          <Plus size={18} /> Vytvořit kurz
        </Button>
      </div>

      {/* Filter and Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
          <Input 
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Hledat kurz podle názvu, popisu nebo lektora..."
            className="pl-10 h-11 rounded-2xl bg-white border-gray-200"
          />
        </div>

        <div className="w-full sm:w-56">
          <Select value={subjectFilter} onValueChange={setSubjectFilter}>
            <SelectTrigger className="h-11 rounded-2xl bg-white border-gray-200 font-bold text-xs">
              <SelectValue placeholder="Všechny předměty" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all">Všechny předměty</SelectItem>
              <SelectItem value="Matematika">Matematika</SelectItem>
              <SelectItem value="Český jazyk">Český jazyk</SelectItem>
              <SelectItem value="MA + ČJ">MA + ČJ (Kombo)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* List of Courses */}
      {loading ? (
        <div className="text-center py-20 bg-white rounded-3xl border border-gray-100">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-indigo-600 mb-3" />
          <p className="text-gray-500 font-bold text-sm">Načítání kurzů...</p>
        </div>
      ) : filteredCourses.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-gray-200 p-8 space-y-4">
          <GraduationCap size={44} className="mx-auto text-gray-300" />
          <div>
            <h3 className="text-lg font-bold text-gray-900">Nenalezeny žádné kurzy</h3>
            <p className="text-gray-500 text-sm mt-1">Zkus upravit vyhledávání nebo vytvoř nový kurz.</p>
          </div>
          <Button onClick={openCreateDialog} className="rounded-xl font-bold bg-[#1E1B18] text-white">
            <Plus size={16} className="mr-1.5" /> Vytvořit první kurz
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredCourses.map(course => (
            <Card key={course.id} className="rounded-3xl border-gray-100 shadow-sm hover:shadow-md transition-all flex flex-col justify-between overflow-hidden bg-white">
              <div className={`h-2 bg-gradient-to-r ${
                course.color === 'purple' ? 'from-purple-500 to-indigo-600' :
                course.color === 'orange' ? 'from-amber-500 to-orange-600' :
                course.color === 'green' ? 'from-emerald-500 to-teal-600' :
                course.color === 'rose' ? 'from-rose-500 to-pink-600' :
                'from-blue-500 to-indigo-600'
              }`} />

              <CardHeader className="p-6 pb-2 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-800 border border-indigo-100">
                    {course.subject || 'Příprava'}
                  </span>
                  {course.badge && (
                    <span className="text-[10px] font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded-md">
                      {course.badge}
                    </span>
                  )}
                </div>

                <CardTitle className="text-lg font-display font-black text-gray-900 line-clamp-2">
                  {course.title}
                </CardTitle>
                <p className="text-xs text-gray-500 line-clamp-2 font-medium">
                  {course.description}
                </p>
              </CardHeader>

              <CardContent className="p-6 pt-3 space-y-3.5 flex-1 flex flex-col justify-between text-xs text-gray-600">
                <div className="space-y-2 bg-gray-50/80 p-3.5 rounded-2xl">
                  {course.price && (
                    <div className="flex items-center justify-between font-bold text-gray-900">
                      <span className="text-gray-500">Cena:</span>
                      <span className="text-amber-700 font-black">{course.price}</span>
                    </div>
                  )}

                  {course.difficulty && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Náročnost:</span>
                      <span className="font-bold text-gray-700">{course.difficulty}</span>
                    </div>
                  )}

                  {course.schedule && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Rozvrh:</span>
                      <span className="font-bold text-gray-700 truncate max-w-[170px]" title={course.schedule}>
                        {course.schedule}
                      </span>
                    </div>
                  )}

                  {course.instructorName && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Lektor:</span>
                      <span className="font-bold text-gray-700 truncate max-w-[170px]" title={course.instructorName}>
                        {course.instructorName}
                      </span>
                    </div>
                  )}

                  {course.syllabus && course.syllabus.length > 0 && (
                    <div className="flex items-center justify-between pt-1 border-t border-gray-200/60">
                      <span className="text-gray-500 flex items-center gap-1">
                        <Layers size={13} /> Počet témat:
                      </span>
                      <span className="font-black text-indigo-700">{course.syllabus.length} témat</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                  <Link to={`/courses/${course.id}`} target="_blank" className="flex-1">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full h-9 rounded-xl text-xs font-bold border-gray-200 hover:border-black flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <ExternalLink size={13} /> Náhled
                    </Button>
                  </Link>

                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => openEditDialog(course)}
                    className="h-9 px-3 rounded-xl text-xs font-bold border-gray-200 hover:border-black flex items-center gap-1 cursor-pointer"
                  >
                    <Edit2 size={13} /> Upravit
                  </Button>

                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => handleDelete(course.id)}
                    disabled={deletingId === course.id}
                    className="h-9 px-2.5 rounded-xl text-rose-600 hover:bg-rose-50 hover:text-rose-700 cursor-pointer"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-2xl rounded-[2.5rem] p-6 sm:p-8 bg-white max-h-[90vh] overflow-y-auto">
          <DialogHeader className="mb-2">
            <DialogTitle className="text-2xl font-display font-black text-gray-900 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
                <GraduationCap size={22} />
              </div>
              <span>{editingCourse ? 'Upravit kurz' : 'Vytvořit nový kurz'}</span>
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-5 pt-2">
            {/* Základní informace */}
            <div className="space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-gray-400">
                1. Základní informace o kurzu
              </h4>

              <div className="grid sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <Label className="text-xs font-bold text-gray-700">Název kurzu *</Label>
                  <Input
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="např. Intenzivní kurz Matematiky na SŠ"
                    className="h-11 rounded-xl mt-1 font-bold"
                    required
                  />
                </div>

                <div>
                  <Label className="text-xs font-bold text-gray-700">Předmět</Label>
                  <Select value={subject} onValueChange={setSubject}>
                    <SelectTrigger className="h-11 rounded-xl mt-1 font-bold text-xs">
                      <SelectValue placeholder="Vyber předmět" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="Matematika">Matematika</SelectItem>
                      <SelectItem value="Český jazyk">Český jazyk</SelectItem>
                      <SelectItem value="MA + ČJ">MA + ČJ (Komplexní balíček)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs font-bold text-gray-700">Odznak / Badge</Label>
                  <Input
                    value={badge}
                    onChange={e => setBadge(e.target.value)}
                    placeholder="např. Doporučeno • Nejoblíbenější"
                    className="h-11 rounded-xl mt-1 text-xs font-bold"
                  />
                </div>

                <div className="sm:col-span-2">
                  <Label className="text-xs font-bold text-gray-700">Popis kurzu</Label>
                  <Textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Detailní popis kurzu, co se studenti naučí, cíl přípravy..."
                    className="rounded-xl mt-1 text-xs font-medium min-h-[80px]"
                  />
                </div>
              </div>
            </div>

            {/* Termíny, cena & rozvrh */}
            <div className="space-y-3 pt-2 border-t border-gray-100">
              <h4 className="text-xs font-black uppercase tracking-wider text-gray-400">
                2. Cena, náročnost a harmonogram
              </h4>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-bold text-gray-700">Cena kurzu</Label>
                  <Input
                    value={price}
                    onChange={e => setPrice(e.target.value)}
                    placeholder="např. 2 490 Kč / sezóna"
                    className="h-11 rounded-xl mt-1 font-bold"
                  />
                </div>

                <div>
                  <Label className="text-xs font-bold text-gray-700">Náročnost</Label>
                  <Input
                    value={difficulty}
                    onChange={e => setDifficulty(e.target.value)}
                    placeholder="např. Střední (Cermat 9. třída)"
                    className="h-11 rounded-xl mt-1 text-xs font-bold"
                  />
                </div>

                <div className="sm:col-span-2">
                  <Label className="text-xs font-bold text-gray-700">Rozvrh lekcí (den a čas)</Label>
                  <Input
                    value={schedule}
                    onChange={e => setSchedule(e.target.value)}
                    placeholder="např. Úterý 17:00 – 18:30 (1× týdně, 90 min)"
                    className="h-11 rounded-xl mt-1 text-xs font-bold"
                  />
                </div>

                <div>
                  <Label className="text-xs font-bold text-gray-700">Datum zahájení</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="h-11 rounded-xl mt-1 text-xs font-bold"
                  />
                </div>

                <div>
                  <Label className="text-xs font-bold text-gray-700">Datum ukončení</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="h-11 rounded-xl mt-1 text-xs font-bold"
                  />
                </div>
              </div>
            </div>

            {/* Lektor a Google Meet */}
            <div className="space-y-3 pt-2 border-t border-gray-100">
              <h4 className="text-xs font-black uppercase tracking-wider text-gray-400">
                3. Lektor a Google Meet
              </h4>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-bold text-gray-700">Jméno lektora</Label>
                  <Input
                    value={instructorName}
                    onChange={e => setInstructorName(e.target.value)}
                    placeholder="např. Mgr. Petr Horák"
                    className="h-11 rounded-xl mt-1 text-xs font-bold"
                  />
                </div>

                <div>
                  <Label className="text-xs font-bold text-gray-700">Google Meet odkaz (privátní pro žáky)</Label>
                  <Input
                    value={meetUrl}
                    onChange={e => setMeetUrl(e.target.value)}
                    placeholder="https://meet.google.com/..."
                    className="h-11 rounded-xl mt-1 text-xs font-bold"
                  />
                </div>

                <div>
                  <Label className="text-xs font-bold text-gray-700 block mb-1.5">Barevný motiv</Label>
                  <div className="flex gap-2">
                    {colors.map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setColor(c)}
                        className={`w-7 h-7 rounded-full border-2 transition-transform cursor-pointer ${
                          c === 'blue' ? 'bg-blue-500' :
                          c === 'purple' ? 'bg-purple-500' :
                          c === 'orange' ? 'bg-orange-500' :
                          c === 'green' ? 'bg-emerald-500' : 'bg-rose-500'
                        } ${color === c ? 'scale-115 border-black ring-2 ring-offset-2 ring-black' : 'border-transparent'}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Přehled látky / Osnova kurzu */}
            <div className="space-y-3 pt-2 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                  <Layers size={14} /> 4. Přehled látky a osnova kurzu ({syllabus.length} témat)
                </h4>
              </div>

              {/* Přidat nové téma */}
              <div className="flex gap-2">
                <Input
                  value={newTopic}
                  onChange={e => setNewTopic(e.target.value)}
                  placeholder="Přidat téma do osnovy kurzu..."
                  className="h-10 rounded-xl text-xs font-bold flex-1"
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddSyllabusItem();
                    }
                  }}
                />
                <Button
                  type="button"
                  onClick={handleAddSyllabusItem}
                  className="h-10 px-4 rounded-xl font-bold text-xs bg-gray-900 text-white cursor-pointer"
                >
                  <Plus size={15} className="mr-1" /> Přidat
                </Button>
              </div>

              {/* Seznam témat */}
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {syllabus.length === 0 ? (
                  <p className="text-xs text-gray-400 italic py-2">Zatím nebyla přidána žádná témata do osnovy.</p>
                ) : (
                  syllabus.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-2 p-2 px-3 rounded-xl bg-gray-50 border border-gray-100 text-xs text-gray-800">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-5 h-5 rounded-full bg-white border border-gray-200 text-gray-500 text-[10px] font-bold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <span className="font-semibold truncate">{item}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveSyllabusItem(idx)}
                        className="text-gray-400 hover:text-rose-600 p-1 cursor-pointer"
                        title="Odebrat z osnovy"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <DialogFooter className="pt-3 border-t border-gray-100">
              <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)} className="rounded-xl font-bold h-11">
                Zrušit
              </Button>
              <Button type="submit" disabled={saving || !title.trim()} className="rounded-xl font-bold h-11 px-7 bg-[#F5C400] text-[#1E1B18] hover:bg-[#F5C400]/90">
                {saving ? <Loader2 size={16} className="animate-spin mr-1.5" /> : null}
                {editingCourse ? 'Uložit změny' : 'Vytvořit kurz'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
