import React, { useState, useEffect } from 'react';
import { 
  BookOpen, Plus, Trash2, Eye, FileText, Search, Sparkles, 
  Upload, Filter, CheckCircle2, ChevronRight, RefreshCw, X, Pencil,
  AlertTriangle, ZoomIn, ZoomOut, Download, ExternalLink, Clock
} from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { toast } from 'sonner';
import PdfSvgDropzone from './PdfSvgDropzone';
import { 
  getAllMaterials, saveMaterial, deleteMaterial, getMaterialById,
  updateMaterialViaApi, fetchMaterialStatus, mapDocToMaterial,
  ExistingMaterialItem, PREDEFINED_SUBJECTS, LEARNING_SHEETS_COLLECTION 
} from '../../services/practiceService';
import { sanitizeSvg } from '../../utils/svgUtils';
import { downloadMaterialAsPdf, isPdfResource } from '../../utils/pdfToSvg';
import { auth, db } from '../../lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { StudyStep } from '../../types';
import { BookCyanIcon, MaterialYellowIcon, CorrectCyanIcon, BulbYellowIcon } from '../common/CustomIcon';

interface MaterialsManagerProps {
  userId?: string;
}

export default function MaterialsManager({ userId }: MaterialsManagerProps) {
  const effectiveUserId = userId || auth.currentUser?.uid || '';

  const [materials, setMaterials] = useState<ExistingMaterialItem[]>([]);
  const [pendingUploads, setPendingUploads] = useState<Array<ExistingMaterialItem & { resolvedId?: string }>>([]);
  const [pendingEdits, setPendingEdits] = useState<Record<string, Partial<ExistingMaterialItem>>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<string>('Vše');

  // Create/Upload Modal state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newSubject, setNewSubject] = useState<'Matematika' | 'Čeština'>('Matematika');
  const [newTopic, setNewTopic] = useState('');
  const [newTheory, setNewTheory] = useState('');
  const [uploadedFileData, setUploadedFileData] = useState<string>('');
  const [uploadedFileType, setUploadedFileType] = useState<string>('');
  const [uploadedSvgString, setUploadedSvgString] = useState<string>('');
  const [uploadedSvgUrl, setUploadedSvgUrl] = useState<string>('');
  const [uploadedPdfUrl, setUploadedPdfUrl] = useState<string>('');
  const [uploadedThumbnailUrl, setUploadedThumbnailUrl] = useState<string>('');
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
  const [editFileData, setEditFileData] = useState<string>('');
  const [editFileType, setEditFileType] = useState<string>('');
  const [editFileUrl, setEditFileUrl] = useState<string>('');
  const [editFileCleared, setEditFileCleared] = useState(false);
  const [editSvgString, setEditSvgString] = useState<string>('');
  const [editSvgUrl, setEditSvgUrl] = useState<string>('');
  const [editPdfUrl, setEditPdfUrl] = useState<string>('');
  const [editThumbnailUrl, setEditThumbnailUrl] = useState<string>('');
  const [editFileName, setEditFileName] = useState<string>('');
  const [editSteps, setEditSteps] = useState<StudyStep[]>([]);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Preview Modal state
  const [previewMaterial, setPreviewMaterial] = useState<ExistingMaterialItem | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  const loadData = async () => {
    try {
      const items = await getAllMaterials();
      setMaterials(items);
    } catch (err: any) {
      console.warn('loadData fallback error:', err);
    }
  };

  // Real-time snapshot listener pro automatické sledování stavu nahrávání a zpracování
  useEffect(() => {
    setLoading(true);
    try {
      const q = query(collection(db, LEARNING_SHEETS_COLLECTION), orderBy('createdAt', 'desc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const items = snapshot.docs
          .map(d => mapDocToMaterial(d.id, d.data()))
          .filter(item => !item.hiddenFromLibrary);
        setMaterials(items);
        setPendingUploads(prev => prev.filter(p => !p.resolvedId || !items.some(m => m.id === p.resolvedId)));
        setLoading(false);
      }, (err) => {
        console.warn('Realtime snapshot listener fallback to getAllMaterials:', err);
        getAllMaterials().then(items => {
          setMaterials(items);
          setLoading(false);
        }).catch(e => {
          toast.error('Chyba při načítání materiálů: ' + e.message);
          setLoading(false);
        });
      });

      return () => unsubscribe();
    } catch {
      getAllMaterials().then(items => {
        setMaterials(items);
        setLoading(false);
      });
    }
  }, []);

  // Fallback polling pokud některý materiál zůstává ve stavu 'processing'
  useEffect(() => {
    const processingIds = materials
      .filter(m => m.status === 'processing' && !m.id.startsWith('temp_'))
      .map(m => m.id);
    if (processingIds.length === 0) return;

    const timer = window.setInterval(async () => {
      try {
        const updates = await Promise.all(
          processingIds.map(id => fetchMaterialStatus(id).catch(() => null))
        );
        let changed = false;
        setMaterials(prev =>
          prev.map(item => {
            const st = updates.find(u => u && u.materialId === item.id);
            if (!st || st.status === item.status) return item;
            changed = true;
            return {
              ...item,
              status: st.status,
              errorMessage: st.errorMessage || undefined,
              fileSize: st.fileSize ?? item.fileSize,
              fileUrl: st.fileUrl !== undefined ? st.fileUrl : item.fileUrl,
              pdfUrl: st.pdfUrl !== undefined ? st.pdfUrl : item.pdfUrl,
              svgUrl: st.svgUrl !== undefined ? st.svgUrl : item.svgUrl,
              thumbnailUrl: st.thumbnailUrl !== undefined ? st.thumbnailUrl : item.thumbnailUrl,
              downloadUrl: st.downloadUrl !== undefined ? st.downloadUrl : item.downloadUrl,
              fileType: st.fileType || item.fileType,
              originalName: st.originalName || item.originalName
            };
          })
        );
        if (changed) {
          await loadData();
        }
      } catch {
        // Ignorujeme dočasné síťové výpadky při dotazování stavu
      }
    }, 3000);

    return () => window.clearInterval(timer);
  }, [materials]);

  const handleOpenUpload = () => {
    setNewTitle('');
    setNewSubject('Matematika');
    setNewTopic('');
    setNewTheory('');
    setUploadedFileData('');
    setUploadedFileType('');
    setUploadedSvgString('');
    setUploadedSvgUrl('');
    setUploadedPdfUrl('');
    setUploadedThumbnailUrl('');
    setUploadedFileName('');
    setIsUploadModalOpen(true);
  };

  const handleSaveMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      toast.error('Zadejte prosím název materiálu.');
      return;
    }

    if (!uploadedFileData && !uploadedSvgString && !uploadedSvgUrl && !newTheory.trim()) {
      toast.error('Nahrajte soubor PDF/SVG nebo zadejte textový výklad.');
      return;
    }

    const titleCopy = newTitle.trim();
    const subjectCopy = newSubject;
    const topicCopy = newTopic.trim() || 'Obecné';
    const theoryCopy = newTheory.trim();
    const fileDataCopy = uploadedFileData || undefined;
    const fileTypeCopy =
      uploadedFileType ||
      (uploadedSvgString || uploadedFileName?.toLowerCase().endsWith('.svg') ? 'image/svg+xml' : 'application/pdf');
    const originalNameCopy = uploadedFileName || (uploadedSvgString ? 'material.svg' : 'material.pdf');
    const thumbnailCopy = uploadedThumbnailUrl || undefined;
    const svgUrlCopy = uploadedSvgUrl || undefined;
    const pdfUrlCopy = uploadedPdfUrl || undefined;
    const svgStringCopy = uploadedSvgString || undefined;

    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const optimisticItem: ExistingMaterialItem & { resolvedId?: string } = {
      id: tempId,
      title: titleCopy,
      subject: subjectCopy,
      topic: topicCopy,
      studyTheory: theoryCopy,
      hasStudyMaterial: true,
      status: 'processing',
      originalName: fileDataCopy || svgStringCopy ? originalNameCopy : undefined,
      fileType: fileDataCopy || svgStringCopy ? fileTypeCopy : undefined,
      thumbnailUrl: thumbnailCopy || null,
      fileUrl: null,
      pdfUrl: null,
      svgUrl: null
    };

    // Okamžitě zobrazíme kartu s točícím se kolečkem a zavřeme modální okno
    setPendingUploads(prev => [optimisticItem, ...prev]);
    setIsUploadModalOpen(false);
    toast.info('Nahrávám materiál a připravuji jej na pozadí...');

    setIsSaving(true);
    try {
      const materialId = await saveMaterial({
        title: titleCopy,
        subject: subjectCopy,
        topic: topicCopy,
        studyTheory: theoryCopy,
        fileData: fileDataCopy,
        fileType: fileTypeCopy,
        originalName: originalNameCopy,
        thumbnailDataUrl: thumbnailCopy,
        svgUrl: svgUrlCopy,
        pdfUrl: pdfUrlCopy,
        svgContent: svgStringCopy
      }, effectiveUserId);

      setPendingUploads(prev => {
        const existsInLive = materials.some(m => m.id === materialId);
        if (existsInLive) {
          return prev.filter(p => p.id !== tempId);
        }
        return prev.map(p => (p.id === tempId ? { ...p, resolvedId: materialId } : p));
      });
      toast.success('Materiál byl nahrán! Dokončuji přípravu na pozadí.');
    } catch (err: any) {
      setPendingUploads(prev =>
        prev.map(p => (p.id === tempId ? { ...p, status: 'error', errorMessage: err.message } : p))
      );
      toast.error('Chyba při ukládání: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenEdit = async (mat: ExistingMaterialItem) => {
    setEditMaterial(mat);
    setEditLoading(true);
    setEditFileData('');
    setEditFileCleared(false);
    try {
      const full = await getMaterialById(mat.id);
      if (full) {
        setEditFullSubtopic(full);
        setEditTitle(full.title);
        setEditSubject((full.subject as 'Matematika' | 'Čeština') || 'Matematika');
        setEditTopic(full.topic || '');
        setEditTheory(full.studyTheory || '');
        setEditFileData('');
        setEditFileType(full.fileType || '');
        setEditFileUrl(full.fileUrl || full.pdfUrl || full.svgUrl || '');
        setEditFileCleared(false);
        setEditSvgString(full.svgContent || '');
        setEditSvgUrl(full.svgUrl || '');
        setEditPdfUrl(full.pdfUrl || '');
        setEditThumbnailUrl(full.thumbnailUrl || '');
        setEditFileName(full.originalName || full.title || '');
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

    const materialId = editMaterial.id;
    const replacingFile = Boolean(editFileData || (editSvgString && editSvgString !== (editFullSubtopic?.svgContent || '')));

    const payload = {
      title: editTitle.trim(),
      subject: editSubject,
      topic: editTopic.trim() || 'Obecné',
      studyTheory: editTheory.trim(),
      ...(editFileData ? {
        fileData: editFileData,
        fileType: editFileType || (editSvgString || editFileName?.toLowerCase().endsWith('.svg') ? 'image/svg+xml' : 'application/pdf'),
        originalName: editFileName || 'material.svg',
        thumbnailDataUrl: editThumbnailUrl || undefined
      } : {}),
      ...(!editFileData && editSvgString && editSvgString !== (editFullSubtopic?.svgContent || '') ? {
        svgContent: editSvgString,
        fileType: 'image/svg+xml',
        originalName: editFileName || 'material.svg',
        thumbnailDataUrl: editThumbnailUrl || undefined
      } : {}),
      ...(editFileCleared ? { clearFile: true } : {})
    };

    if (replacingFile) {
      // Při nahrazení souboru okno hned zavřeme a zobrazíme točící se kolečko na kartě materiálu
      setPendingEdits(prev => ({
        ...prev,
        [materialId]: { status: 'processing', title: payload.title, subject: payload.subject, topic: payload.topic }
      }));
      setEditMaterial(null);
      toast.info('Nahrávám nový soubor k materiálu na pozadí...');
    } else {
      setIsSavingEdit(true);
    }

    try {
      const res = await updateMaterialViaApi(materialId, payload);
      setPendingEdits(prev => {
        const next = { ...prev };
        delete next[materialId];
        return next;
      });
      setMaterials(prev =>
        prev.map(m =>
          m.id === materialId
            ? {
                ...m,
                title: payload.title,
                subject: payload.subject,
                topic: payload.topic,
                studyTheory: payload.studyTheory,
                status: res.status || m.status,
                fileUrl: res.fileUrl !== undefined ? res.fileUrl : m.fileUrl,
                pdfUrl: res.pdfUrl !== undefined ? res.pdfUrl : m.pdfUrl,
                svgUrl: res.svgUrl !== undefined ? res.svgUrl : m.svgUrl,
                thumbnailUrl: res.thumbnailUrl !== undefined ? res.thumbnailUrl : m.thumbnailUrl,
                downloadUrl: res.downloadUrl !== undefined ? res.downloadUrl : m.downloadUrl,
                fileType: res.fileType !== undefined ? (res.fileType || undefined) : m.fileType,
                originalName: res.originalName !== undefined ? (res.originalName || undefined) : m.originalName
              }
            : m
        )
      );

      if (!replacingFile) {
        toast.success('Materiál byl úspěšně upraven!');
        setEditMaterial(null);
      } else {
        toast.success('Nový soubor zařazen ke zpracování na pozadí.');
      }
      await loadData();
    } catch (err: any) {
      setPendingEdits(prev => {
        const next = { ...prev };
        delete next[materialId];
        return next;
      });
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
    if (id.startsWith('temp_')) {
      setPendingUploads(prev => prev.filter(p => p.id !== id));
      return;
    }
    if (!window.confirm(`Opravdu chcete smazat materiál "${title}"?`)) return;
    try {
      await deleteMaterial(id);
      toast.success('Materiál byl smazán.');
      await loadData();
    } catch (err: any) {
      toast.error('Chyba při mazání: ' + err.message);
    }
  };

  const mergedMaterials: ExistingMaterialItem[] = [
    ...pendingUploads.filter(p => !p.resolvedId || !materials.some(m => m.id === p.resolvedId)),
    ...materials.map(m => (pendingEdits[m.id] ? { ...m, ...pendingEdits[m.id] } : m))
  ];

  const filteredMaterials = mergedMaterials.filter(m => {
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
            <BookCyanIcon size={32} />
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
            const isProcessing = mat.status === 'processing';
            const isError = mat.status === 'error';
            const hasFile = Boolean(mat.fileUrl || mat.svgUrl || mat.pdfUrl || mat.svgContent);

            return (
              <div
                key={mat.id}
                className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all flex flex-col justify-between gap-4 group"
              >
                {/* Visual Thumbnail Preview */}
                <div 
                  onClick={() => {
                    if (!isProcessing) {
                      setZoomLevel(1);
                      setPreviewMaterial(mat);
                    }
                  }}
                  className={`w-full h-44 bg-slate-50/80 rounded-2xl border border-gray-100 overflow-hidden flex items-center justify-center relative transition-all ${
                    isProcessing ? 'cursor-not-allowed opacity-90' : 'cursor-pointer group/thumb hover:border-amber-200'
                  }`}
                >
                  {isProcessing ? (
                    <div className="flex flex-col items-center justify-center gap-2.5 p-4 text-center">
                      <div className="w-9 h-9 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
                      <div className="space-y-0.5">
                        <span className="text-xs font-bold text-amber-900 block">
                          Zpracovává se na pozadí...
                        </span>
                        <span className="text-[10px] text-amber-700 font-medium block">
                          Ukládám části souboru do databáze
                        </span>
                      </div>
                    </div>
                  ) : isError ? (
                    <div className="flex flex-col items-center justify-center gap-2 p-4 text-center">
                      <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shadow-xs">
                        <AlertTriangle size={20} />
                      </div>
                      <span className="text-xs font-bold text-rose-800">
                        Chyba zpracování
                      </span>
                      <span className="text-[10px] text-rose-600 font-medium line-clamp-1 max-w-[200px]" title={mat.errorMessage}>
                        {mat.errorMessage || 'Soubor se nepodařilo zpracovat'}
                      </span>
                    </div>
                  ) : mat.thumbnailUrl ? (
                    <img 
                      src={mat.thumbnailUrl} 
                      alt={mat.title} 
                      className="w-full h-full object-contain p-2 group-hover/thumb:scale-105 transition-transform duration-300" 
                      loading="lazy"
                    />
                  ) : mat.svgUrl ? (
                    <img 
                      src={mat.svgUrl} 
                      alt={mat.title} 
                      className="w-full h-full object-contain p-2 group-hover/thumb:scale-105 transition-transform duration-300" 
                      loading="lazy"
                    />
                  ) : mat.svgContent ? (
                    <div 
                      className="w-full h-full flex items-center justify-center p-2 overflow-hidden pointer-events-none group-hover/thumb:scale-105 transition-transform duration-300 [&>svg]:max-w-full [&>svg]:max-h-full [&>svg]:h-auto [&>svg]:w-auto"
                      dangerouslySetInnerHTML={{ __html: sanitizeSvg(mat.svgContent) }}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-1.5 text-gray-400 p-4 text-center">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-xs ${
                        mat.subject === 'Matematika' ? "bg-teal-50 text-teal-600" : "bg-rose-50 text-rose-600"
                      }`}>
                        <BookCyanIcon size={20} />
                      </div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        Grafický list
                      </span>
                    </div>
                  )}

                  {/* Hover Overlay */}
                  {!isProcessing && !isError && hasFile && (
                    <div className="absolute inset-0 bg-black/25 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="bg-white/95 text-gray-900 px-3 py-1.5 rounded-xl text-xs font-black shadow-md flex items-center gap-1.5 backdrop-blur-xs">
                        <Eye size={12} /> Zvětšit náhled
                      </span>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                      mat.subject === 'Matematika' ? 'bg-teal-50 text-teal-800' : 'bg-rose-50 text-rose-800'
                    }`}>
                      {mat.subject}
                    </span>

                    {/* Real-time Status Badge */}
                    {isProcessing ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                        Zpracovává se...
                      </span>
                    ) : isError ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-900 border border-rose-300" title={mat.errorMessage}>
                        <AlertTriangle size={11} className="text-rose-600" />
                        Chyba
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        <CheckCircle2 size={11} className="text-emerald-600" />
                        Připraveno
                      </span>
                    )}
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
                      onClick={() => {
                        setZoomLevel(1);
                        setPreviewMaterial(mat);
                      }}
                      disabled={isProcessing}
                      className="rounded-xl h-9 px-3 text-xs font-bold border-gray-300 hover:border-black flex items-center gap-1.5 cursor-pointer bg-white disabled:opacity-50"
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
                userId={effectiveUserId}
                valueSvgString={uploadedSvgString}
                valueSvgUrl={uploadedSvgUrl}
                valueFileUrl={uploadedFileData || uploadedPdfUrl || uploadedSvgUrl}
                valueFileType={uploadedFileType}
                valueThumbnailUrl={uploadedThumbnailUrl}
                fileName={uploadedFileName}
                onChange={(res) => {
                  if (res) {
                    setUploadedFileData(res.fileData || '');
                    setUploadedFileType(res.fileType || '');
                    setUploadedSvgString(res.svgString || '');
                    setUploadedSvgUrl(res.svgUrl || '');
                    setUploadedPdfUrl(res.pdfUrl || '');
                    setUploadedThumbnailUrl(res.thumbnail || res.thumbnailDataUrl || '');
                    setUploadedFileName(res.fileName);
                    if (!newTitle) {
                      setNewTitle(res.fileName.replace(/\.(pdf|svg|png|jpg|jpeg|webp)$/i, ''));
                    }
                  } else {
                    setUploadedFileData('');
                    setUploadedFileType('');
                    setUploadedSvgString('');
                    setUploadedSvgUrl('');
                    setUploadedPdfUrl('');
                    setUploadedThumbnailUrl('');
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
                className="rounded-xl bg-[#1E1B18] text-white font-bold text-xs px-5 shadow-sm"
              >
                Uložit materiál
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

                {/* Drag & Drop PDF / SVG for editing */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-700">
                    Grafický list (Drag & Drop souboru PDF nebo SVG)
                  </label>
                  <PdfSvgDropzone
                    userId={effectiveUserId}
                    valueSvgString={editSvgString}
                    valueSvgUrl={editSvgUrl}
                    valueFileUrl={editFileData || editFileUrl}
                    valueFileType={editFileType}
                    valueThumbnailUrl={editThumbnailUrl}
                    fileName={editFileName}
                    onChange={(res) => {
                      if (res) {
                        setEditFileData(res.fileData || '');
                        setEditFileType(res.fileType || '');
                        setEditFileUrl(res.fileData || res.pdfUrl || res.svgUrl || '');
                        setEditFileCleared(false);
                        setEditSvgString(res.svgString || '');
                        setEditSvgUrl(res.svgUrl || '');
                        setEditPdfUrl(res.pdfUrl || '');
                        setEditThumbnailUrl(res.thumbnail || res.thumbnailDataUrl || '');
                        setEditFileName(res.fileName);
                      } else {
                        setEditFileData('');
                        setEditFileType('');
                        setEditFileUrl('');
                        setEditFileCleared(true);
                        setEditSvgString('');
                        setEditSvgUrl('');
                        setEditPdfUrl('');
                        setEditThumbnailUrl('');
                        setEditFileName('');
                      }
                    }}
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
                                <CorrectCyanIcon size={14} /> Kontrolní otázka ke kroku (volba ze 4 možností)
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
                              <BulbYellowIcon size={15} /> Bublinka s tipem od lektora
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

      {/* Universal Preview Modal with PDF and Zoom */}
      {previewMaterial && (() => {
        const isPdf = isPdfResource(previewMaterial);
        const fileSrc = previewMaterial.fileUrl || previewMaterial.pdfUrl || previewMaterial.svgUrl;
        const downloadSrc = previewMaterial.downloadUrl || previewMaterial.fileUrl || previewMaterial.pdfUrl || previewMaterial.svgUrl;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div className="flex items-center gap-2.5 min-w-0">
                  <MaterialYellowIcon size={22} className="shrink-0" />
                  <div className="min-w-0">
                    <h4 className="font-bold text-gray-900 text-base truncate">
                      {previewMaterial.title}
                    </h4>
                    <p className="text-[11px] text-gray-400 font-medium">
                      {previewMaterial.subject} {previewMaterial.topic ? `• ${previewMaterial.topic}` : ''} {previewMaterial.originalName ? `• ${previewMaterial.originalName}` : ''}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setPreviewMaterial(null)}
                  className="p-1.5 rounded-xl text-gray-400 hover:text-black hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-auto p-4 sm:p-6 bg-slate-100 flex items-center justify-center min-h-[350px]">
                {isPdf && fileSrc ? (
                  <iframe
                    src={`${fileSrc}#toolbar=1`}
                    className="w-full h-[70vh] border-0 rounded-2xl bg-white shadow-inner"
                    title={previewMaterial.title}
                  />
                ) : fileSrc ? (
                  <div className="w-full h-full flex items-center justify-center overflow-auto p-2">
                    <img
                      src={fileSrc}
                      alt={previewMaterial.title || "Náhled"}
                      style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'center center', transition: 'transform 0.15s ease-out' }}
                      className="max-w-full max-h-[70vh] object-contain rounded-xl shadow-md bg-white p-2"
                    />
                  </div>
                ) : previewMaterial.svgContent ? (
                  <div className="w-full h-full flex items-center justify-center overflow-auto p-2">
                    <div 
                      style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'center center', transition: 'transform 0.15s ease-out' }}
                      className="max-w-full bg-white shadow-md rounded-xl overflow-hidden p-2"
                      dangerouslySetInnerHTML={{ __html: sanitizeSvg(previewMaterial.svgContent) }}
                    />
                  </div>
                ) : (
                  <div className="text-center p-8 max-w-md">
                    <p className="text-gray-500 font-medium">Tento materiál nemá grafický list.</p>
                    {previewMaterial.studyTheory && (
                      <p className="text-xs text-gray-700 mt-2 bg-white p-4 rounded-xl border border-gray-200 text-left">
                        {previewMaterial.studyTheory}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="px-6 py-3.5 bg-white border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
                {/* Zoom controls for non-PDF image/SVG */}
                {!isPdf && fileSrc && (
                  <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setZoomLevel(z => Math.max(0.5, z - 0.25))}
                      className="h-8 w-8 p-0 rounded-lg cursor-pointer"
                      title="Zmenšit"
                    >
                      <ZoomOut size={14} />
                    </Button>
                    <span className="text-[11px] font-bold px-2 text-gray-700 min-w-[50px] text-center">
                      {Math.round(zoomLevel * 100)}%
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setZoomLevel(z => Math.min(3, z + 0.25))}
                      className="h-8 w-8 p-0 rounded-lg cursor-pointer"
                      title="Zvětšit"
                    >
                      <ZoomIn size={14} />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setZoomLevel(1)}
                      className="h-8 px-2 text-[10px] font-bold rounded-lg cursor-pointer text-gray-600"
                      title="Obnovit 100%"
                    >
                      100%
                    </Button>
                  </div>
                )}

                <div className="flex items-center gap-2 ml-auto">
                  {downloadSrc && (
                    <Button
                      type="button"
                      onClick={() =>
                        downloadMaterialAsPdf({
                          title: previewMaterial.title,
                          downloadUrl: previewMaterial.downloadUrl,
                          pdfUrl: previewMaterial.pdfUrl,
                          fileUrl: previewMaterial.fileUrl,
                          svgUrl: previewMaterial.svgUrl,
                          svgContent: previewMaterial.svgContent,
                          fileType: previewMaterial.fileType
                        }).catch((err: any) => toast.error(err?.message || 'Stažení selhalo.'))
                      }
                      className="rounded-xl bg-[#B9D8FC] hover:bg-[#A3CCFA] text-[#0F2942] font-black text-xs h-10 px-4 flex items-center justify-center gap-1.5 shadow-xs border border-blue-200/80 hover:scale-105 transition-transform cursor-pointer"
                    >
                      <Download size={14} />
                      <span>Stáhnout PDF</span>
                    </Button>
                  )}

                  {fileSrc && (
                    <a
                      href={fileSrc}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-xl border border-gray-200 hover:border-black text-gray-800 font-bold text-xs h-10 px-4 flex items-center justify-center gap-1.5 cursor-pointer bg-white"
                    >
                      <ExternalLink size={14} />
                      <span>Otevřít v novém okně</span>
                    </a>
                  )}

                  <Button
                    variant="outline"
                    onClick={() => setPreviewMaterial(null)}
                    className="rounded-xl font-bold text-xs h-10 px-4 cursor-pointer"
                  >
                    Zavřít
                  </Button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
