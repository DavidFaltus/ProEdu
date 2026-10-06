import React, { useState, useEffect } from 'react';
import { 
  BookOpen, Plus, Trash2, Eye, FileText, Search, Sparkles, 
  Upload, Filter, CheckCircle2, ChevronRight, RefreshCw, X, Pencil 
} from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { toast } from 'sonner';
import PdfSvgDropzone from './PdfSvgDropzone';
import { 
  getAllMaterials, saveMaterial, deleteMaterial, getMaterialById,
  ExistingMaterialItem, PREDEFINED_SUBJECTS 
} from '../../services/practiceService';
import { auth } from '../../lib/firebase';
import { StudyStep } from '../../types';

interface MaterialsManagerProps {
  userId?: string;
}

export default function MaterialsManager({ userId }: MaterialsManagerProps) {
  const effectiveUserId = userId || auth.currentUser?.uid || '';

  const [materials, setMaterials] = useState<ExistingMaterialItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<string>('Vše');

  // Create/Upload Modal state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newSubject, setNewSubject] = useState<'Matematika' | 'Čeština'>('Matematika');
  const [newTopic, setNewTopic] = useState('');
  const [newTheory, setNewTheory] = useState('');
  const [uploadedSvgString, setUploadedSvgString] = useState<string>('');
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  // Edit Modal state
  const [editMaterial, setEditMaterial] = useState<ExistingMaterialItem | null>(null);
  const [editFullSubtopic, setEditFullSubtopic] = useState<ExistingMaterialItem | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editSubject, setEditSubject] = useState<'Matematika' | 'Čeština'>('Matematika');
  const [editTopic, setEditTopic] = useState('');
  const [editTheory, setEditTheory] = useState('');
  const [editSteps, setEditSteps] = useState<StudyStep[]>([]);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // SVG Preview Modal state
  const [previewMaterial, setPreviewMaterial] = useState<ExistingMaterialItem | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const items = await getAllMaterials();
      setMaterials(items);
    } catch (err: any) {
      toast.error('Chyba při načítání materiálů: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenUpload = () => {
    setNewTitle('');
    setNewSubject('Matematika');
    setNewTopic('');
    setNewTheory('');
    setUploadedSvgString('');
    setUploadedFileName('');
    setIsUploadModalOpen(true);
  };

  const handleSaveMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      toast.error('Zadejte prosím název materiálu.');
      return;
    }

    if (!uploadedSvgString && !newTheory.trim()) {
      toast.error('Nahrajte soubor PDF/SVG nebo zadejte textový výklad.');
      return;
    }

    setIsSaving(true);
    try {
      await saveMaterial({
        title: newTitle.trim(),
        subject: newSubject,
        topic: newTopic.trim() || 'Obecné',
        studyTheory: newTheory.trim(),
        svgContent: uploadedSvgString || undefined
      }, effectiveUserId);

      toast.success('Studijní materiál úspěšně uložen do databáze!');
      setIsUploadModalOpen(false);
      await loadData();
    } catch (err: any) {
      toast.error('Chyba při ukládání: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenEdit = async (mat: ExistingMaterialItem) => {
    setEditMaterial(mat);
    setEditLoading(true);
    try {
      const full = await getMaterialById(mat.id);
      if (full) {
        setEditFullSubtopic(full);
        setEditTitle(full.title);
        setEditSubject((full.subject as 'Matematika' | 'Čeština') || 'Matematika');
        setEditTopic(full.topic || '');
        setEditTheory(full.studyTheory || '');
        setEditSteps([]);
      } else {
        toast.error('Nepodařilo se načíst detail materiálu.');
        setEditMaterial(null);
      }
    } catch (err: any) {
      toast.error('Chyba při načítání detailu: ' + err.message);
      setEditMaterial(null);
    } finally {
      setEditLoading(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editMaterial) return;
    if (!editTitle.trim()) {
      toast.error('Zadejte prosím název materiálu.');
      return;
    }

    setIsSavingEdit(true);
    try {
      await saveMaterial({
        id: editMaterial.id,
        title: editTitle.trim(),
        subject: editSubject,
        topic: editTopic.trim() || 'Obecné',
        studyTheory: editTheory.trim(),
        svgUrl: editFullSubtopic?.svgUrl || undefined,
        svgContent: editFullSubtopic?.svgContent || undefined
      }, effectiveUserId);

      toast.success('Materiál byl úspěšně upraven!');
      setEditMaterial(null);
      await loadData();
    } catch (err: any) {
      toast.error('Chyba při ukládání úprav: ' + err.message);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const addStep = () => {
    setEditSteps([...editSteps, { title: '', content: '' }]);
  };

  const updateStep = (index: number, field: keyof StudyStep, value: any) => {
    const newSteps = [...editSteps];
    newSteps[index] = { ...newSteps[index], [field]: value };
    setEditSteps(newSteps);
  };

  const updateStepOption = (stepIndex: number, optionIndex: number, value: string) => {
    const newSteps = [...editSteps];
    const step = newSteps[stepIndex];
    const opts = step.testOptions ? [...step.testOptions] : ['', '', '', ''];
    opts[optionIndex] = value;
    newSteps[stepIndex] = { ...step, testOptions: opts };
    setEditSteps(newSteps);
  };

  const removeStep = (index: number) => {
    const newSteps = [...editSteps];
    newSteps.splice(index, 1);
    setEditSteps(newSteps);
  };

  const handleDeleteMaterial = async (id: string, title: string) => {
    if (!window.confirm(`Opravdu chcete smazat materiál "${title}"?`)) return;
    try {
      await deleteMaterial(id);
      toast.success('Materiál byl smazán.');
      await loadData();
    } catch (err: any) {
      toast.error('Chyba při mazání: ' + err.message);
    }
  };

  const filteredMaterials = materials.filter(m => {
    const matchesSubject = selectedSubject === 'Vše' || m.subject === selectedSubject;
    const q = search.toLowerCase().trim();
    const matchesSearch = !q || 
      m.title.toLowerCase().includes(q) || 
      (m.topic && m.topic.toLowerCase().includes(q));
    return matchesSubject && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-gray-100 shadow-sm">
        <div>
          <h3 className="text-xl font-display font-black text-[#1E1B18]">
            Studijní materiály a grafické listy
          </h3>
          <p className="text-xs text-gray-500 font-medium">
            Spravujte výukové materiály, přehledy a taháky pro studenty.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={handleOpenUpload}
            className="rounded-xl bg-[#1E1B18] hover:bg-[#332f2b] text-white font-bold h-10 px-4 flex items-center gap-2 cursor-pointer shadow-sm text-xs"
          >
            <Plus size={16} />
            <span>Nahrát nový materiál</span>
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-white/70 p-4 rounded-2xl border border-gray-100 shadow-sm">
        <div className="relative flex-1 w-full sm:w-auto">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Hledat mezi materiály..."
            className="pl-10 h-10 rounded-xl text-xs font-medium bg-white"
          />
        </div>

        <div className="flex gap-1.5 self-start sm:self-auto">
          {['Vše', 'Matematika', 'Čeština'].map(sub => (
            <button
              key={sub}
              onClick={() => setSelectedSubject(sub)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                selectedSubject === sub
                  ? 'bg-[#1E1B18] text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {sub}
            </button>
          ))}
        </div>
      </div>

      {/* Materials Grid / List */}
      {loading ? (
        <div className="text-center py-20 bg-white rounded-3xl">
          <div className="w-10 h-10 border-4 border-[#1E1B18] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 font-bold text-sm">Načítání studijních materiálů...</p>
        </div>
      ) : filteredMaterials.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-gray-200 p-8 space-y-4">
          <div className="w-16 h-16 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto text-2xl">
            📑
          </div>
          <h3 className="text-2xl font-display font-black text-gray-800">Žádné materiály</h3>
          <p className="text-gray-400 text-sm max-w-md mx-auto">
            Zatím jste nenahráli žádné materiály. Nahrajte PDF tahák nebo soubor SVG pomocí tlačítka níže.
          </p>
          <Button
            onClick={handleOpenUpload}
            className="rounded-xl bg-[#1E1B18] text-white font-bold h-10 px-5 text-xs"
          >
            + Nahrát první materiál
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMaterials.map(mat => {
            const hasSvg = Boolean(mat.svgUrl || mat.svgContent);

            return (
              <div
                key={mat.id}
                className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all flex flex-col justify-between gap-4 group"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                      mat.subject === 'Matematika' ? 'bg-teal-50 text-teal-800' : 'bg-rose-50 text-rose-800'
                    }`}>
                      {mat.subject}
                    </span>
                    </div>

                  <div>
                    <h4 className="font-bold text-base text-gray-900 group-hover:text-amber-950 transition-colors line-clamp-1">
                      {mat.title}
                    </h4>
                    {mat.topic && (
                      <p className="text-xs text-gray-400 font-medium mt-0.5">
                        Téma: {mat.topic}
                      </p>
                    )}
                  </div>

                  {mat.studyTheory && (
                    <p className="text-xs text-gray-500 font-medium line-clamp-2 bg-gray-50 p-2.5 rounded-xl">
                      {mat.studyTheory}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-gray-100 gap-2">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPreviewMaterial(mat)}
                      className="rounded-xl h-9 px-3 text-xs font-bold border-gray-300 hover:border-black flex items-center gap-1.5 cursor-pointer bg-white"
                    >
                      <Eye size={14} />
                      <span>Zobrazit</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenEdit(mat)}
                      className="rounded-xl h-9 px-3 text-xs font-bold border-gray-300 hover:border-black flex items-center gap-1.5 cursor-pointer bg-white"
                    >
                      <Pencil size={14} />
                      <span>Upravit</span>
                    </Button>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteMaterial(mat.id, mat.title)}
                    className="rounded-xl h-9 w-9 p-0 text-gray-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                    title="Smazat materiál"
                  >
                    <Trash2 size={15} />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload New Material Modal */}
      <Dialog open={isUploadModalOpen} onOpenChange={setIsUploadModalOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-3xl">
          <DialogHeader className="px-6 pt-6 pb-3 border-b border-gray-100">
            <div className="flex items-center gap-2 text-emerald-700">
              <Upload size={20} />
              <DialogTitle className="text-xl font-bold text-gray-900 font-display">
                Nahrát studijní materiál (PDF / SVG)
              </DialogTitle>
            </div>
            <p className="text-xs text-gray-500 font-medium">
              Nahrajte výukový list v PDF nebo SVG. PDF bude automaticky převedeno do vektorového SVG a uloženo do databáze.
            </p>
          </DialogHeader>

          <form onSubmit={handleSaveMaterial} className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700">Název materiálu *</label>
              <Input
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="např. Pythagorova věta a vzorce"
                className="h-11 rounded-xl text-sm"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700">Předmět</label>
                <select
                  value={newSubject}
                  onChange={e => setNewSubject(e.target.value as any)}
                  className="w-full h-11 px-3 rounded-xl border border-gray-200 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-black"
                >
                  <option value="Matematika">Matematika</option>
                  <option value="Čeština">Čeština</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700">Téma</label>
                <Input
                  value={newTopic}
                  onChange={e => setNewTopic(e.target.value)}
                  placeholder="např. Geometrie"
                  className="h-11 rounded-xl text-sm"
                />
              </div>
            </div>

            {/* Drag & Drop PDF / SVG */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700">
                Grafický list (Drag & Drop souboru PDF nebo SVG)
              </label>
              <PdfSvgDropzone
                valueSvgString={uploadedSvgString}
                fileName={uploadedFileName}
                onChange={(res) => {
                  if (res) {
                    setUploadedSvgString(res.svgString);
                    setUploadedFileName(res.fileName);
                    if (!newTitle) {
                      setNewTitle(res.fileName.replace(/\.(pdf|svg)$/i, ''));
                    }
                  } else {
                    setUploadedSvgString('');
                    setUploadedFileName('');
                  }
                }}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700">
                Doplňkový teoretický výklad (volitelné)
              </label>
              <textarea
                value={newTheory}
                onChange={e => setNewTheory(e.target.value)}
                rows={3}
                placeholder="Zde můžete vložit stručný textový souhrn nebo definici..."
                className="w-full p-3 rounded-xl border border-gray-200 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>

            <DialogFooter className="pt-4 border-t border-gray-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsUploadModalOpen(false)}
                className="rounded-xl font-bold text-xs"
              >
                Zrušit
              </Button>
              <Button
                type="submit"
                disabled={isSaving}
                className="rounded-xl bg-[#1E1B18] text-white font-bold text-xs px-5 shadow-sm"
              >
                {isSaving ? 'Ukládám do databáze...' : 'Uložit materiál'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Material Modal */}
      <Dialog open={!!editMaterial} onOpenChange={(open) => !open && setEditMaterial(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-3xl">
          <DialogHeader className="px-6 pt-6 pb-3 border-b border-gray-100 bg-gray-50">
            <div className="flex items-center gap-2 text-amber-700">
              <Pencil size={20} />
              <DialogTitle className="text-xl font-bold text-gray-900 font-display">
                Upravit materiál a kroky
              </DialogTitle>
            </div>
            {editMaterial && (
              <p className="text-xs text-gray-500 font-medium">
                Upravujete: <span className="font-bold text-gray-700">{editMaterial.title}</span>
              </p>
            )}
          </DialogHeader>

          {editLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12">
              <div className="w-10 h-10 border-4 border-[#1E1B18] border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-sm font-bold text-gray-500">Načítání detailů materiálu...</p>
            </div>
          ) : (
            <form onSubmit={handleSaveEdit} className="flex-1 overflow-y-auto p-6 space-y-8 bg-white">
              {/* SECTION A: BASIC INFO */}
              <div className="space-y-4">
                <h4 className="font-black text-sm text-gray-800 uppercase tracking-wider">Základní informace</h4>
                
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-700">Název materiálu *</label>
                  <Input
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    className="h-11 rounded-xl text-sm"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-700">Předmět</label>
                    <select
                      value={editSubject}
                      onChange={e => setEditSubject(e.target.value as any)}
                      className="w-full h-11 px-3 rounded-xl border border-gray-200 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-black"
                    >
                      <option value="Matematika">Matematika</option>
                      <option value="Čeština">Čeština</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-700">Téma</label>
                    <Input
                      value={editTopic}
                      onChange={e => setEditTopic(e.target.value)}
                      className="h-11 rounded-xl text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-700">Teoretický výklad</label>
                  <textarea
                    value={editTheory}
                    onChange={e => setEditTheory(e.target.value)}
                    rows={4}
                    className="w-full p-3 rounded-xl border border-gray-200 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-black"
                  />
                </div>
              </div>

              {/* SECTION B: STUDY STEPS */}
              <div className="space-y-4 pt-6 border-t border-gray-100">
                <div className="flex items-center justify-between">
                  <h4 className="font-black text-sm text-gray-800 uppercase tracking-wider">Studijní kroky</h4>
                  <Button
                    type="button"
                    onClick={addStep}
                    className="rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-xs h-8 px-3 flex items-center gap-1"
                  >
                    <Plus size={14} /> Přidat krok
                  </Button>
                </div>
                
                {editSteps.length === 0 ? (
                  <p className="text-xs text-gray-400 italic bg-gray-50 p-4 rounded-xl text-center">
                    Tento materiál zatím nemá žádné kroky.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {editSteps.map((step, stepIdx) => (
                      <div key={stepIdx} className="p-4 rounded-2xl border border-gray-200 bg-gray-50/50 space-y-4 relative group">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-amber-500 text-white font-black text-xs flex items-center justify-center shrink-0">
                              {stepIdx + 1}
                            </span>
                            <div className="flex-1 w-full">
                              <Input
                                value={step.title}
                                onChange={e => updateStep(stepIdx, 'title', e.target.value)}
                                placeholder="Název kroku (např. Vzorec a definice)"
                                className="h-9 rounded-lg text-sm font-bold bg-white"
                              />
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => removeStep(stepIdx)}
                            className="h-8 w-8 p-0 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg shrink-0"
                            title="Smazat krok"
                          >
                            <Trash2 size={16} />
                          </Button>
                        </div>
                        
                        <div className="space-y-1.5 pl-8">
                          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Výkladový text kroku</label>
                          <textarea
                            value={step.content}
                            onChange={e => updateStep(stepIdx, 'content', e.target.value)}
                            rows={3}
                            placeholder="Vysvětlení v rámci tohoto kroku..."
                            className="w-full p-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-black"
                          />
                        </div>

                        <div className="pl-8 pt-3 border-t border-gray-200/60 mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* 4-choice Test Question */}
                          <div className="space-y-3 bg-white p-3.5 rounded-2xl border border-gray-100 shadow-sm">
                            <div className="flex items-center justify-between">
                              <h5 className="text-[10px] font-black text-blue-700 uppercase tracking-wider flex items-center gap-1.5">
                                <CheckCircle2 size={13} className="text-blue-600" /> Kontrolní otázka ke kroku (volba ze 4 možností)
                              </h5>
                            </div>
                            
                            <Input
                              value={step.testQuestion || ''}
                              onChange={e => updateStep(stepIdx, 'testQuestion', e.target.value)}
                              placeholder="Znění kontrolní otázky..."
                              className="h-9 text-xs rounded-xl bg-gray-50/70 font-medium"
                            />
                            
                            <div className="space-y-2 pt-1">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Možnosti A–D (kliknutím na písmeno označte správnou)</span>
                              </div>
                              {[0, 1, 2, 3].map(optIdx => {
                                const letter = ['A', 'B', 'C', 'D'][optIdx];
                                const val = step.testOptions?.[optIdx] || '';
                                const isCorrect = Boolean(val && step.correctAnswer === val);

                                return (
                                  <div key={optIdx} className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (val) {
                                          updateStep(stepIdx, 'correctAnswer', val);
                                        }
                                      }}
                                      className={`w-7 h-7 rounded-lg text-xs font-black flex items-center justify-center shrink-0 transition-all cursor-pointer ${
                                        isCorrect
                                          ? 'bg-emerald-600 text-white shadow-xs'
                                          : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                                      }`}
                                      title={isCorrect ? 'Označeno jako správná odpověď' : `Klikněte pro nastavení ${letter} jako správné`}
                                    >
                                      {letter}
                                    </button>
                                    <Input
                                      value={val}
                                      onChange={e => {
                                        const newVal = e.target.value;
                                        const wasCorrect = step.correctAnswer === val;
                                        updateStepOption(stepIdx, optIdx, newVal);
                                        if (wasCorrect) {
                                          updateStep(stepIdx, 'correctAnswer', newVal);
                                        }
                                      }}
                                      placeholder={`Možnost ${letter}`}
                                      className={`h-8 text-xs rounded-xl ${isCorrect ? 'border-emerald-500 bg-emerald-50/30 font-bold text-emerald-950' : 'bg-gray-50'}`}
                                    />
                                    {isCorrect && (
                                      <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md uppercase tracking-wider shrink-0">
                                        Správná
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            
                            <div className="space-y-1 pt-1">
                              <label className="text-[10px] font-bold text-gray-500">Zvolená správná odpověď:</label>
                              <select
                                value={step.correctAnswer || ''}
                                onChange={e => updateStep(stepIdx, 'correctAnswer', e.target.value)}
                                className="w-full h-8 px-2.5 rounded-xl border border-gray-200 text-xs font-bold bg-white focus:outline-none focus:ring-1 focus:ring-black"
                              >
                                <option value="">-- Vyberte správnou možnost ze 4 zadaných --</option>
                                {[0, 1, 2, 3].map(optIdx => {
                                  const val = step.testOptions?.[optIdx]?.trim();
                                  if (!val) return null;
                                  return (
                                    <option key={optIdx} value={val}>
                                      {['A', 'B', 'C', 'D'][optIdx]}: {val}
                                    </option>
                                  );
                                })}
                              </select>
                            </div>
                          </div>

                          {/* Tutor Tip */}
                          <div className="space-y-3 bg-white p-3.5 rounded-2xl border border-gray-100 shadow-sm flex flex-col">
                            <h5 className="text-[10px] font-black text-amber-700 uppercase tracking-wider flex items-center gap-1.5">
                              <Sparkles size={13} className="text-amber-600" /> Bublinka s tipem od lektora
                            </h5>
                            <p className="text-[11px] text-gray-400 font-medium">
                              Tento tip se studentovi zobrazí v přehledné bublince až po rozkliknutí tlačítka u kroku.
                            </p>
                            <textarea
                              value={step.tutorTip || ''}
                              onChange={e => updateStep(stepIdx, 'tutorTip', e.target.value)}
                              rows={5}
                              placeholder="Extra doporučení lektora, pomůcka, trik nebo častá chyba v tomto kroku..."
                              className="w-full flex-1 p-3 rounded-xl border border-gray-200 text-xs bg-gray-50/70 focus:outline-none focus:ring-1 focus:ring-black resize-none font-medium leading-relaxed"
                            />
                          </div>
                        </div>

                      </div>
                    ))}
                  </div>
                )}
              </div>

            </form>
          )}

          {!editLoading && (
            <DialogFooter className="px-6 py-4 border-t border-gray-100 bg-gray-50">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditMaterial(null)}
                className="rounded-xl font-bold text-xs"
              >
                Zrušit
              </Button>
              <Button
                type="submit"
                onClick={handleSaveEdit}
                disabled={isSavingEdit}
                className="rounded-xl bg-[#1E1B18] text-white font-bold text-xs px-6 shadow-sm"
              >
                {isSavingEdit ? 'Ukládám změny...' : 'Uložit změny'}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Preview Modal */}
      {previewMaterial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-emerald-600" />
                <h4 className="font-bold text-gray-900 text-base truncate">
                  {previewMaterial.title}
                </h4>
              </div>
              <button
                onClick={() => setPreviewMaterial(null)}
                className="p-1.5 rounded-xl text-gray-400 hover:text-black hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6 bg-slate-50 flex items-center justify-center min-h-[300px]">
              {previewMaterial.svgContent ? (
                <div 
                  className="max-w-full bg-white shadow-md rounded-xl overflow-hidden p-2"
                  dangerouslySetInnerHTML={{ __html: previewMaterial.svgContent }}
                />
              ) : previewMaterial.svgUrl ? (
                <img 
                  src={previewMaterial.svgUrl} 
                  alt="Náhled" 
                  className="max-w-full max-h-[70vh] object-contain rounded-xl shadow-md bg-white p-2" 
                />
              ) : (
                <div className="text-center p-8">
                  <p className="text-gray-500 font-medium">Tento materiál nemá grafický list.</p>
                  {previewMaterial.studyTheory && (
                    <p className="text-sm text-gray-700 mt-2 bg-white p-4 rounded-xl border border-gray-200">
                      {previewMaterial.studyTheory}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="px-6 py-3 bg-white border-t border-gray-100 flex justify-end">
              <Button
                variant="outline"
                onClick={() => setPreviewMaterial(null)}
                className="rounded-xl font-bold text-xs"
              >
                Zavřít
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
