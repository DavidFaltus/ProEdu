import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Lock,
  Maximize2,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  X,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '../components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog';
import { useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import {
  ExistingMaterialItem,
  MaterialGrade,
  MaterialQuotaSummary,
  MaterialType,
  PracticeTopic,
  StudyProgressRecord,
} from '../types';
import {
  authorizeMaterialExport,
  fetchMaterialsCatalog,
  fetchPracticeCatalog,
} from '../services/practiceService';
import { fetchAllUserStudyProgress } from '../services/studyProgressService';
import {
  exportProtectedMaterialAsPdf,
  loadMaterialPages,
  MaterialPageItem,
  printWatermarkedPages,
} from '../utils/materialPages';
import {
  FullscreenMaterialReaderModal,
  ProtectedMaterialCanvas,
} from '../components/study/ProtectedMaterialCanvas';
import UnifiedPaywallModal from '../components/common/UnifiedPaywallModal';
import {
  BrainPinkIcon,
  BrainWhiteIcon,
  BookCyanIcon,
  BookWhiteIcon,
} from '../components/common/CustomIcon';
import { trackSectionClick } from '../services/analyticsService';
import { toast } from 'sonner';

const TOPIC_DOT_COLORS = [
  'bg-sky-500',
  'bg-emerald-500',
  'bg-amber-400',
  'bg-pink-400',
  'bg-violet-400',
  'bg-orange-400',
  'bg-teal-500',
  'bg-indigo-400',
];

const MATERIAL_TYPE_LABELS: Record<MaterialType, string> = {
  worksheet: 'Pracovní list',
  summary: 'Shrnutí',
  cheatsheet: 'Tahák',
};

const MATERIAL_TYPE_FILTER_LABELS: Array<{ key: MaterialType; label: string }> = [
  { key: 'worksheet', label: 'Pracovní listy' },
  { key: 'summary', label: 'Shrnutí' },
  { key: 'cheatsheet', label: 'Taháky' },
];

type SortOption = 'number' | 'newest' | 'title';
type GradeFilter = 'all' | '9' | '7' | '5';

const GRADE_LABELS: Record<GradeFilter, string> = {
  all: 'Vše',
  '9': '9.',
  '7': '7.',
  '5': '5.',
};

// Ročník je prozatím v UI skrytý (stav i filtrační logika zůstávají zachované pro budoucí zapnutí).
const SHOW_GRADE_FILTER_UI = false;

const SORT_LABELS: Record<SortOption, string> = {
  number: 'Podle čísla',
  newest: 'Od nejnovějších',
  title: 'Podle názvu',
};

function formatListNoun(count: number): string {
  if (count === 1) return 'list';
  if (count >= 2 && count <= 4) return 'listy';
  return 'listů';
}

function formatPagesLabel(pages: number): string {
  const n = Math.max(1, pages);
  if (n === 1) return '1 strana';
  if (n >= 2 && n <= 4) return `${n} strany`;
  return `${n} stran`;
}

function formatStepsLabel(steps: number): string {
  if (steps === 1) return '1 krok';
  if (steps >= 2 && steps <= 4) return `${steps} kroky`;
  return `${steps} kroků`;
}

function formatQuestionsLabel(count: number): string {
  if (count === 1) return '1 úloha na procvičení';
  if (count >= 2 && count <= 4) return `${count} úlohy na procvičení`;
  return `${count} úloh na procvičení`;
}

function formatCompletedLabel(count: number): string {
  if (count === 1) return '1 splněný';
  if (count >= 2 && count <= 4) return `${count} splněné`;
  return `${count} splněných`;
}

function formatShortCzechDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
  }).format(d);
}

function buildFallbackWatermark(email?: string | null, uid?: string | null): string {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Prague',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return `ProEducator • ${email || uid || 'Host'} • ${today}`;
}

function matchesGradeFilter(mat: ExistingMaterialItem, filter: GradeFilter): boolean {
  if (filter === 'all') return true;
  const grade = mat.grade || '9';
  if (grade === 'all') return true;
  if (filter === '9' && !mat.hasExplicitGrade) return true;
  return grade === filter;
}

function getMaterialFileBadge(mat: ExistingMaterialItem): string {
  const orig = (mat.originalName || '').toLowerCase();
  if (mat.fileType === 'application/pdf' || orig.endsWith('.pdf')) {
    return 'PDF';
  }
  if (mat.fileType || orig || mat.fileUrl || mat.pdfUrl || mat.svgUrl || mat.svgContent) {
    return 'Grafický list';
  }
  return 'Výklad';
}

interface TopicSidebarGroup {
  key: string;
  label: string;
  dotColor: string;
  topicIndex: number;
  count: number;
}

function LockedSheetIllustration({ onUnlock }: { onUnlock: () => void }) {
  return (
    <div
      onClick={onUnlock}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onUnlock();
        }
      }}
      className="relative w-full aspect-[4/3] rounded-2xl bg-[#EEF3F9] border border-slate-200/70 p-4 flex items-center justify-center overflow-hidden cursor-pointer group"
    >
      {/* Blurred schematic sheet preview (no protected data exposed) */}
      <div className="w-[72%] h-full bg-white rounded-xl shadow-sm border border-gray-200/70 overflow-hidden select-none pointer-events-none blur-[2px] opacity-80 flex flex-col">
        <div className="h-9 bg-[#1D6FE2] px-4 flex items-center justify-center">
          <div className="w-28 h-2.5 rounded-full bg-white/80" />
        </div>
        <div className="p-4 space-y-2.5 flex-1">
          <div className="w-20 h-2.5 rounded-full bg-[#3B82F6]/70" />
          <div className="w-full h-2 rounded-full bg-slate-200" />
          <div className="w-4/5 h-2 rounded-full bg-slate-200" />
          <div className="mt-2 p-2.5 rounded-lg bg-slate-100 space-y-1.5">
            <div className="w-2/3 h-2 rounded-full bg-slate-300" />
            <div className="w-full h-2 rounded-full bg-slate-200" />
            <div className="w-3/4 h-2 rounded-full bg-slate-200" />
          </div>
        </div>
      </div>

      <div className="absolute inset-0 bg-[#0F1E36]/10 group-hover:bg-[#0F1E36]/15 transition-colors flex flex-col items-center justify-center gap-2 p-4 text-center">
        <div className="w-12 h-12 rounded-2xl bg-white shadow-md text-[#0F1E36] flex items-center justify-center group-hover:scale-105 transition-transform">
          <Lock size={22} />
        </div>
        <span className="bg-white/95 backdrop-blur-xs text-[#0F1E36] text-xs font-black px-3.5 py-1.5 rounded-full shadow-sm border border-gray-200/80">
          Odemknout s ProEducator Premium
        </span>
      </div>
    </div>
  );
}

export default function LearningSheets() {
  const { user, isPremium, isCourseUser, isTeacher } = useAuth();
  const hasMaterialsAccess = isPremium || isCourseUser || isTeacher;
  const navigate = useNavigate();

  const [materials, setMaterials] = useState<ExistingMaterialItem[]>([]);
  const [practiceTopics, setPracticeTopics] = useState<PracticeTopic[]>([]);
  const [studyProgressMap, setStudyProgressMap] = useState<Record<string, StudyProgressRecord>>({});
  const [quota, setQuota] = useState<MaterialQuotaSummary | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters & sorting
  const [activeSubject, setActiveSubject] = useState<'Matematika' | 'Čeština'>('Matematika');
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>('all');
  const [search, setSearch] = useState('');
  const [selectedTopicKey, setSelectedTopicKey] = useState<string>('all'); // 'all' | '__exam__' | topic group key
  const [selectedTypes, setSelectedTypes] = useState<Record<MaterialType, boolean>>({
    worksheet: true,
    summary: true,
    cheatsheet: true,
  });
  const [sortBy, setSortBy] = useState<SortOption>('number');
  const [visibleLimit, setVisibleLimit] = useState(8);

  // Selected sheet & preview state
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);
  const [isMobileDetailOpen, setIsMobileDetailOpen] = useState(false);
  const [isMobileTypeFilterOpen, setIsMobileTypeFilterOpen] = useState(false);

  const [previewPages, setPreviewPages] = useState<MaterialPageItem[]>([]);
  const [previewPageIdx, setPreviewPageIdx] = useState(0);
  const [previewWatermark, setPreviewWatermark] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [measuredPageCounts, setMeasuredPageCounts] = useState<Record<string, number>>({});

  // Fullscreen reader & export states
  const [isReaderOpen, setIsReaderOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);
  const [paywallDescription, setPaywallDescription] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    async function loadAll() {
      setLoading(true);
      try {
        const [catalogRes, practiceRes, progressRes] = await Promise.all([
          fetchMaterialsCatalog({ includeHidden: isTeacher }),
          fetchPracticeCatalog({ includeHidden: isTeacher }).catch(() => ({
            topics: [] as PracticeTopic[],
            subtopics: [],
          })),
          fetchAllUserStudyProgress(user?.uid).catch(() => ({})),
        ]);

        if (cancelled) return;
        setMaterials(catalogRes.materials);
        setQuota(catalogRes.quota || null);
        setPracticeTopics(practiceRes.topics || []);
        setStudyProgressMap(progressRes);
      } catch (err) {
        console.error('Failed to load learning sheets:', err);
        if (!cancelled) {
          setMaterials([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadAll();
    return () => {
      cancelled = true;
    };
  }, [user?.uid, isTeacher, isPremium, isCourseUser]);

  // Reset topic selection & pagination when subject changes
  useEffect(() => {
    setSelectedTopicKey('all');
    setVisibleLimit(8);
  }, [activeSubject, gradeFilter]);

  useEffect(() => {
    setVisibleLimit(8);
  }, [selectedTopicKey, search, selectedTypes, sortBy]);

  // Automaticky zavřít mobilní bottom sheet při přechodu na desktop (resize / otočení tabletu)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
      if (e.matches) {
        setIsMobileDetailOpen(false);
      }
    };
    handleChange(mq);
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  const libraryMaterials = useMemo(
    () =>
      materials.filter(
        (m) => !m.hiddenFromLibrary && m.status !== 'processing' && m.status !== 'error'
      ),
    [materials]
  );

  // Materials belonging to active subject + grade (before topic/type/search filters)
  const subjectGradeMaterials = useMemo(
    () =>
      libraryMaterials.filter(
        (m) =>
          (m.subject || 'Matematika') === activeSubject &&
          matchesGradeFilter(m, gradeFilter)
      ),
    [libraryMaterials, activeSubject, gradeFilter]
  );

  // Helper to resolve which sidebar topic key a material belongs to
  const subjectPracticeTopics = useMemo(
    () =>
      practiceTopics.filter(
        (t) => (t.subjectId || 'Matematika') === activeSubject
      ),
    [practiceTopics, activeSubject]
  );

  const resolveMaterialTopicKey = useMemo(() => {
    const byId = new Map<string, string>();
    const byLowerTitle = new Map<string, string>();
    subjectPracticeTopics.forEach((t) => {
      const canonical = `pt:${t.id}`;
      byId.set(t.id, canonical);
      if (t.title) byLowerTitle.set(t.title.trim().toLowerCase(), canonical);
    });

    return (mat: ExistingMaterialItem): string => {
      if (mat.topicId && byId.has(mat.topicId)) {
        return byId.get(mat.topicId)!;
      }
      const topicName = (mat.topic || '').trim().toLowerCase();
      if (topicName && byLowerTitle.has(topicName)) {
        return byLowerTitle.get(topicName)!;
      }
      if (mat.linkedSubtopic?.topicId && byId.has(mat.linkedSubtopic.topicId)) {
        return byId.get(mat.linkedSubtopic.topicId)!;
      }
      return `custom:${topicName || 'obecné'}`;
    };
  }, [subjectPracticeTopics]);

  const topicGroups: TopicSidebarGroup[] = useMemo(() => {
    const counts = new Map<string, number>();
    const customLabels = new Map<string, string>();

    subjectGradeMaterials.forEach((m) => {
      const key = resolveMaterialTopicKey(m);
      counts.set(key, (counts.get(key) || 0) + 1);
      if (key.startsWith('custom:') && !customLabels.has(key)) {
        customLabels.set(key, (m.topic || '').trim() || 'Obecné');
      }
    });

    const groups: TopicSidebarGroup[] = [];
    subjectPracticeTopics.forEach((t) => {
      const key = `pt:${t.id}`;
      const cnt = counts.get(key) || 0;
      if (cnt > 0) {
        groups.push({
          key,
          label: t.title,
          dotColor: TOPIC_DOT_COLORS[groups.length % TOPIC_DOT_COLORS.length],
          topicIndex: groups.length + 1,
          count: cnt,
        });
      }
    });

    Array.from(customLabels.entries())
      .sort((a, b) => a[1].localeCompare(b[1], 'cs'))
      .forEach(([key, label]) => {
        const cnt = counts.get(key) || 0;
        if (cnt > 0) {
          groups.push({
            key,
            label,
            dotColor: TOPIC_DOT_COLORS[groups.length % TOPIC_DOT_COLORS.length],
            topicIndex: groups.length + 1,
            count: cnt,
          });
        }
      });

    return groups;
  }, [subjectGradeMaterials, subjectPracticeTopics, resolveMaterialTopicKey]);

  const examPrepCount = useMemo(
    () => subjectGradeMaterials.filter((m) => Boolean(m.isExamPrep)).length,
    [subjectGradeMaterials]
  );

  // Map each material to a clean display code like "1.1", "1.2"
  const materialCodeMap = useMemo(() => {
    const topicIdxByKey = new Map<string, number>();
    topicGroups.forEach((g) => topicIdxByKey.set(g.key, g.topicIndex));

    const buckets = new Map<string, ExistingMaterialItem[]>();
    subjectGradeMaterials.forEach((m) => {
      const key = resolveMaterialTopicKey(m);
      const list = buckets.get(key) || [];
      list.push(m);
      buckets.set(key, list);
    });

    const codeMap = new Map<string, string>();
    buckets.forEach((list, key) => {
      const tIdx = topicIdxByKey.get(key) || 1;
      const sorted = [...list].sort((a, b) => {
        const aHasOrd = typeof a.order === 'number' && Number.isFinite(a.order);
        const bHasOrd = typeof b.order === 'number' && Number.isFinite(b.order);
        if (aHasOrd && bHasOrd && a.order !== b.order) return a.order! - b.order!;
        if (aHasOrd && !bHasOrd) return -1;
        if (!aHasOrd && bHasOrd) return 1;
        return String(a.title || '').localeCompare(String(b.title || ''), 'cs');
      });
      sorted.forEach((item, idx) => {
        const subNum =
          typeof item.order === 'number' && Number.isFinite(item.order) && item.order > 0
            ? item.order
            : idx + 1;
        codeMap.set(item.id, `${tIdx}.${subNum}`);
      });
    });
    return codeMap;
  }, [subjectGradeMaterials, topicGroups, resolveMaterialTopicKey]);

  const getStepProgressForMaterial = (mat: ExistingMaterialItem) => {
    const linked = mat.linkedSubtopic;
    if (!linked || linked.stepsCount <= 0) {
      return { totalSteps: 0, completedCount: 0, isCompleted: false, isInProgress: false };
    }
    const rec = studyProgressMap[linked.id];
    const completedCount = rec ? Math.min(linked.stepsCount, rec.completedSteps.length) : 0;
    const isCompleted = completedCount >= linked.stepsCount;
    const isInProgress = completedCount > 0 && !isCompleted;
    return { totalSteps: linked.stepsCount, completedCount, isCompleted, isInProgress };
  };

  const filteredMaterials = useMemo(() => {
    const q = search.toLowerCase().trim();
    const list = subjectGradeMaterials.filter((m) => {
      if (selectedTopicKey === '__exam__') {
        if (!m.isExamPrep) return false;
      } else if (selectedTopicKey !== 'all') {
        if (resolveMaterialTopicKey(m) !== selectedTopicKey) return false;
      }

      const mType: MaterialType = m.materialType || 'worksheet';
      if (!selectedTypes[mType]) return false;

      if (q) {
        const hay = `${m.title} ${m.topic} ${m.studyTheory || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'title') {
        return String(a.title || '').localeCompare(String(b.title || ''), 'cs');
      }
      if (sortBy === 'newest') {
        const aMs = a.createdAt ? new Date(a.createdAt).getTime() || 0 : 0;
        const bMs = b.createdAt ? new Date(b.createdAt).getTime() || 0 : 0;
        return bMs - aMs;
      }
      // 'number'
      const aCode = materialCodeMap.get(a.id) || '999.999';
      const bCode = materialCodeMap.get(b.id) || '999.999';
      const [aT, aS] = aCode.split('.').map(Number);
      const [bT, bS] = bCode.split('.').map(Number);
      if (aT !== bT) return aT - bT;
      return aS - bS;
    });
  }, [
    subjectGradeMaterials,
    selectedTopicKey,
    selectedTypes,
    search,
    sortBy,
    resolveMaterialTopicKey,
    materialCodeMap,
  ]);

  const completedInViewCount = useMemo(
    () =>
      filteredMaterials.filter((m) => getStepProgressForMaterial(m).isCompleted).length,
    [filteredMaterials, studyProgressMap]
  );

  // Ensure a selected material exists whenever filtered list updates
  useEffect(() => {
    if (filteredMaterials.length === 0) {
      setSelectedMaterialId(null);
      return;
    }
    if (!selectedMaterialId || !filteredMaterials.some((m) => m.id === selectedMaterialId)) {
      setSelectedMaterialId(filteredMaterials[0].id);
    }
  }, [filteredMaterials, selectedMaterialId]);

  const selectedMaterial = useMemo(
    () => filteredMaterials.find((m) => m.id === selectedMaterialId) || null,
    [filteredMaterials, selectedMaterialId]
  );

  // Load preview pages for the currently selected material
  useEffect(() => {
    setPreviewPageIdx(0);
    setPreviewError(null);

    if (!selectedMaterial || selectedMaterial.locked) {
      setPreviewPages([]);
      setPreviewWatermark(null);
      setPreviewLoading(false);
      return;
    }

    const hasSource = Boolean(
      selectedMaterial.fileUrl ||
        selectedMaterial.pdfUrl ||
        selectedMaterial.svgUrl ||
        selectedMaterial.svgContent
    );
    if (!hasSource) {
      setPreviewPages([]);
      setPreviewWatermark(null);
      setPreviewLoading(false);
      return;
    }

    const controller = new AbortController();
    setPreviewLoading(true);
    setPreviewPages([]);

    loadMaterialPages({
      fileUrl: selectedMaterial.fileUrl,
      pdfUrl: selectedMaterial.pdfUrl,
      svgUrl: selectedMaterial.svgUrl,
      svgContent: selectedMaterial.svgContent,
      fileType: selectedMaterial.fileType,
      originalName: selectedMaterial.originalName,
      signal: controller.signal,
    })
      .then((res) => {
        if (controller.signal.aborted) return;
        setPreviewPages(res.pages);
        setPreviewWatermark(res.watermarkText);
        if (res.pages.length > 0) {
          setMeasuredPageCounts((prev) =>
            prev[selectedMaterial.id] === res.pages.length
              ? prev
              : { ...prev, [selectedMaterial.id]: res.pages.length }
          );
        }
        if (res.isLocked) {
          setPreviewError('Tento materiál vyžaduje aktivní předplatné Premium.');
        }
      })
      .catch((err: any) => {
        if (controller.signal.aborted || err?.name === 'AbortError') return;
        setPreviewError(err?.message || 'Nepodařilo se načíst náhled materiálu.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setPreviewLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [selectedMaterial?.id, selectedMaterial?.locked]);

  const effectiveWatermark = useMemo(() => {
    if (isTeacher) return null;
    if (previewWatermark) return previewWatermark;
    return buildFallbackWatermark(user?.email, user?.uid);
  }, [isTeacher, previewWatermark, user?.email, user?.uid]);

  const openPaywall = (customDesc?: string) => {
    setIsMobileDetailOpen(false);
    setPaywallDescription(customDesc);
    setIsPaywallOpen(true);
  };

  const openReader = () => {
    setIsMobileDetailOpen(false);
    setIsReaderOpen(true);
  };

  const activeTypeCount = useMemo(
    () => MATERIAL_TYPE_FILTER_LABELS.filter(({ key }) => selectedTypes[key]).length,
    [selectedTypes]
  );
  const hasCustomTypeFilter = activeTypeCount < MATERIAL_TYPE_FILTER_LABELS.length;

  const handleToggleType = (typeKey: MaterialType) => {
    setSelectedTypes((prev) => ({ ...prev, [typeKey]: !prev[typeKey] }));
  };

  const handleSelectRow = (mat: ExistingMaterialItem) => {
    setSelectedMaterialId(mat.id);
    trackSectionClick('material_select', `/learning`, {
      materialId: mat.id,
      title: mat.title,
      locked: Boolean(mat.locked),
    });
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
      setIsMobileDetailOpen(true);
    }
  };

  const handlePrimaryAction = (mat: ExistingMaterialItem) => {
    if (mat.locked) {
      openPaywall(
        'Odemkni neomezené online čtení všech pracovních listů, shrnutí a taháků plus 8 stažení / tisků každé období.'
      );
      return;
    }
    if (mat.linkedSubtopic) {
      setIsMobileDetailOpen(false);
      trackSectionClick('material_study_click', `/study/${mat.linkedSubtopic.id}`, {
        materialId: mat.id,
        subtopicId: mat.linkedSubtopic.id,
      });
      navigate(`/study/${mat.linkedSubtopic.id}`);
      return;
    }
    openReader();
  };

  const handleDownloadPdf = async (mat: ExistingMaterialItem) => {
    if (mat.locked || !hasMaterialsAccess || mat.canDownload === false) {
      openPaywall(
        'Stahování PDF a tisk jsou součástí ProEducator Premium (8 unikátních listů každé předplatné období).'
      );
      return;
    }
    if (isDownloading || isPrinting) return;

    trackSectionClick('material_download_click', `/learning`, {
      materialId: mat.id,
      title: mat.title,
      subject: mat.subject,
    });
    setIsDownloading(true);
    try {
      const res = await exportProtectedMaterialAsPdf({
        materialId: mat.id,
        title: mat.title,
        downloadUrl: mat.downloadUrl,
        pdfUrl: mat.pdfUrl,
        fileUrl: mat.fileUrl,
        svgUrl: mat.svgUrl,
        svgContent: mat.svgContent,
        fileType: mat.fileType,
        originalName: mat.originalName,
        preloadedPages: selectedMaterial?.id === mat.id ? previewPages : undefined,
        isTeacher,
      });
      if (res.quota) {
        setQuota(res.quota);
      }
      toast.success(`Materiál „${mat.title}“ byl stažen.`);
    } catch (err: any) {
      if (err?.quota) setQuota(err.quota);
      toast.error(err?.message || 'Nepodařilo se stáhnout PDF.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePrint = async (mat: ExistingMaterialItem) => {
    if (mat.locked || !hasMaterialsAccess || mat.canDownload === false) {
      openPaywall(
        'Tisk a stahování PDF jsou součástí ProEducator Premium.'
      );
      return;
    }
    if (isPrinting || isDownloading || previewPages.length === 0) return;

    setIsPrinting(true);
    try {
      let watermarkForPrint = effectiveWatermark;
      if (!isTeacher) {
        const authRes = await authorizeMaterialExport(mat.id);
        if (authRes.quota) setQuota(authRes.quota);
        watermarkForPrint = authRes.watermarkText;
      }
      await printWatermarkedPages(mat.title, previewPages, watermarkForPrint);
    } catch (err: any) {
      if (err?.quota) setQuota(err.quota);
      toast.error(err?.message || 'Nepodařilo se připravit materiál k tisku.');
    } finally {
      setIsPrinting(false);
    }
  };

  const activeTopicTitle = useMemo(() => {
    if (selectedTopicKey === 'all') return 'Všechny materiály';
    if (selectedTopicKey === '__exam__') return 'Příprava na přijímačky';
    return topicGroups.find((g) => g.key === selectedTopicKey)?.label || 'Materiály';
  }, [selectedTopicKey, topicGroups]);

  const renderRightDetailPanel = (
    mat: ExistingMaterialItem,
    mode: 'full' | 'bodyOnly' | 'actionsOnly' = 'full'
  ) => {
    const code = materialCodeMap.get(mat.id) || '1.1';
    const typeLabel = MATERIAL_TYPE_LABELS[mat.materialType || 'worksheet'];
    const pageCount = Math.max(
      1,
      previewPages.length || measuredPageCounts[mat.id] || mat.pageCount || 1
    );
    const stepInfo = getStepProgressForMaterial(mat);
    const isAlreadyUnlocked = Boolean(quota?.unlockedMaterialIds?.includes(mat.id));
    const isCourseExempt = Boolean(quota?.courseExemptMaterialIds?.includes(mat.id));
    const safePreviewPageIdx = Math.min(previewPageIdx, Math.max(0, previewPages.length - 1));
    const currentPreviewPage = previewPages[safePreviewPageIdx] || null;
    const totalPreviewPages = previewPages.length || pageCount;

    const statusBadge = (() => {
      if (mat.locked) {
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-600">
            <Lock size={12} /> Premium
          </span>
        );
      }
      if (!hasMaterialsAccess && mat.isFreeSample) {
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/70">
            Ukázka zdarma
          </span>
        );
      }
      if (stepInfo.isCompleted) {
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/70">
            <Check size={12} strokeWidth={2.75} /> Splněno
          </span>
        );
      }
      if (stepInfo.isInProgress) {
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-[#FEF3C7] text-[#92400E]">
            Rozpracováno
          </span>
        );
      }
      return (
        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-[#EEF4FF] text-[#2563EB]">
          Nové
        </span>
      );
    })();

    const primaryButtonLabel = (() => {
      if (mat.locked) return 'Odemknout Premium';
      if (mat.linkedSubtopic) {
        return stepInfo.isInProgress ? 'Pokračovat ve studiu' : 'Začít studovat';
      }
      return 'Otevřít čtečku';
    })();

    const quotaFooterText = (() => {
      if (mat.locked) {
        return 'Odemkni neomezené online čtení a 8 stažení měsíčně';
      }
      if (!hasMaterialsAccess || mat.canDownload === false) {
        return 'Ukázka zdarma k online čtení · Stažení PDF s Premium';
      }
      if (quota?.unlimited) {
        return 'Učitelský přístup · Neomezené stažení a tisk';
      }
      if (isCourseExempt) {
        return 'Součást tvého kurzu · Bez odečtu z limitu';
      }
      if (isAlreadyUnlocked) {
        return 'Tento list už máš odemčený · Další stažení bez odečtu';
      }
      if (quota && quota.limit > 0) {
        const endFormatted = formatShortCzechDate(quota.periodEndsAt);
        return endFormatted
          ? `Zbývá ${quota.remaining} z ${quota.limit} stažení do ${endFormatted}`
          : `Zbývá ${quota.remaining} z ${quota.limit} stažení toto období`;
      }
      return 'Otevřením čtečky si můžeš materiál zvětšit nebo vytisknout';
    })();

    const actionButtons = (
      <div className="space-y-2 pt-1">
        {mat.locked ? (
          <>
            <Button
              type="button"
              onClick={() => handlePrimaryAction(mat)}
              className="w-full h-11 sm:h-12 rounded-full bg-[#F7C948] hover:bg-[#F1BE32] text-[#1E1B18] font-black text-sm px-4 flex items-center justify-center gap-2 shadow-xs border border-amber-300/60 cursor-pointer transition-transform hover:scale-[1.01]"
            >
              <Lock size={16} />
              <span>{primaryButtonLabel}</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => handleDownloadPdf(mat)}
              disabled={isDownloading || isPrinting}
              className="w-full h-11 rounded-full bg-white hover:bg-gray-50 text-[#0F1E36] border border-gray-300 hover:border-gray-400 font-bold text-sm px-4 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Download size={16} />
              <span>{isDownloading ? 'Stahuji...' : 'Stáhnout PDF'}</span>
            </Button>
          </>
        ) : mat.linkedSubtopic ? (
          <>
            {/* Řádek 1: plnošířkové primární CTA */}
            <Button
              type="button"
              onClick={() => handlePrimaryAction(mat)}
              className="w-full h-11 sm:h-12 rounded-full bg-[#F7C948] hover:bg-[#F1BE32] text-[#1E1B18] font-black text-sm px-4 flex items-center justify-center gap-1.5 shadow-xs border border-amber-300/60 cursor-pointer whitespace-nowrap transition-transform hover:scale-[1.01]"
            >
              <BookOpen size={16} className="shrink-0" />
              <span>{primaryButtonLabel}</span>
            </Button>

            {/* Řádek 2: 50/50 Otevřít čtečku + Stáhnout PDF s popiskem */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={openReader}
                className="w-full h-11 rounded-full bg-white hover:bg-gray-50 text-[#0F1E36] border border-gray-300 hover:border-gray-400 font-bold text-xs sm:text-sm px-3 flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Maximize2 size={15} className="shrink-0" />
                <span>Otevřít čtečku</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => handleDownloadPdf(mat)}
                disabled={isDownloading || isPrinting}
                className="w-full h-11 rounded-full bg-white hover:bg-gray-50 text-[#0F1E36] border border-gray-300 hover:border-gray-400 font-bold text-xs sm:text-sm px-3 flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                {isDownloading ? (
                  <Loader2 size={15} className="animate-spin shrink-0" />
                ) : (
                  <Download size={15} className="shrink-0" />
                )}
                <span>{isDownloading ? 'Stahuji...' : 'Stáhnout PDF'}</span>
              </Button>
            </div>
          </>
        ) : (
          <>
            <Button
              type="button"
              onClick={() => handlePrimaryAction(mat)}
              className="w-full h-11 sm:h-12 rounded-full bg-[#F7C948] hover:bg-[#F1BE32] text-[#1E1B18] font-black text-sm px-4 flex items-center justify-center gap-2 shadow-xs border border-amber-300/60 cursor-pointer transition-transform hover:scale-[1.01]"
            >
              <Maximize2 size={16} />
              <span>{primaryButtonLabel}</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => handleDownloadPdf(mat)}
              disabled={isDownloading || isPrinting}
              className="w-full h-11 rounded-full bg-white hover:bg-gray-50 text-[#0F1E36] border border-gray-300 hover:border-gray-400 font-bold text-sm px-4 flex items-center justify-center gap-2 cursor-pointer"
            >
              {isDownloading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Download size={16} />
              )}
              <span>{isDownloading ? 'Stahuji...' : 'Stáhnout PDF'}</span>
            </Button>
          </>
        )}

        {/* Centered Quota Line */}
        <p className="text-xs font-medium text-gray-500 text-center pt-0.5">
          {quotaFooterText}
        </p>
      </div>
    );

    if (mode === 'actionsOnly') {
      return actionButtons;
    }

    return (
      <div className="space-y-4">
        {/* Preview Frame */}
        {mat.locked ? (
          <LockedSheetIllustration onUnlock={() => handlePrimaryAction(mat)} />
        ) : previewLoading ? (
          <div className="w-full aspect-[4/3] rounded-2xl bg-[#EEF3F9] border border-slate-200/70 flex flex-col items-center justify-center gap-2.5">
            <div className="w-8 h-8 border-3 border-[#1D4ED8] border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-bold text-gray-500">Připravuji zabezpečený náhled...</span>
          </div>
        ) : previewError ? (
          <div className="w-full aspect-[4/3] rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center p-5 text-center">
            <p className="text-sm font-bold text-rose-800">{previewError}</p>
          </div>
        ) : currentPreviewPage ? (
          <div
            onClick={openReader}
            onContextMenu={(e) => e.preventDefault()}
            title="Kliknutím otevřete čtečku na celou obrazovku"
            className="relative w-full rounded-2xl bg-[#EEF3F9] border border-slate-200/70 p-3.5 pt-10 overflow-hidden cursor-zoom-in group"
          >
            {/* Floating Page Badge */}
            <div className="absolute top-2.5 right-3 z-10 bg-white/95 backdrop-blur-xs text-[#0F1E36] text-xs font-bold px-3 py-0.5 rounded-full shadow-xs border border-gray-200/70 select-none">
              Strana {safePreviewPageIdx + 1} / {totalPreviewPages}
            </div>

            <div className="max-w-[330px] xl:max-w-[380px] mx-auto rounded-xl shadow-sm bg-white overflow-hidden">
              <ProtectedMaterialCanvas
                page={currentPreviewPage}
                watermarkText={effectiveWatermark}
                maxCssWidth={380}
              />
            </div>

            {/* Subtle page flipping controls when multi-page */}
            {previewPages.length > 1 && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="mt-2.5 flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPreviewPageIdx((p) => Math.max(0, p - 1))}
                    disabled={safePreviewPageIdx === 0}
                    aria-label="Předchozí strana"
                    className="w-9 h-9 rounded-full bg-white hover:bg-gray-50 disabled:opacity-40 text-[#0F1E36] flex items-center justify-center shadow-2xs border border-gray-200/80 cursor-pointer"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setPreviewPageIdx((p) => Math.min(previewPages.length - 1, p + 1))
                    }
                    disabled={safePreviewPageIdx === previewPages.length - 1}
                    aria-label="Další strana"
                    className="w-9 h-9 rounded-full bg-white hover:bg-gray-50 disabled:opacity-40 text-[#0F1E36] flex items-center justify-center shadow-2xs border border-gray-200/80 cursor-pointer"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={openReader}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1D4ED8] hover:underline cursor-pointer"
                >
                  <Maximize2 size={13} />
                  <span>Celá obrazovka</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="w-full rounded-2xl bg-[#EEF3F9] border border-slate-200/70 p-5 space-y-2">
            <span className="text-xs font-black uppercase tracking-wider text-[#1D4ED8]">
              Teoretický výklad
            </span>
            <p className="text-sm text-gray-700 leading-relaxed line-clamp-6">
              {mat.studyTheory || 'Tento materiál obsahuje doprovodný studijní přehled.'}
            </p>
          </div>
        )}

        {/* Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          {mode === 'full' && (
            <span className="px-3 py-1 rounded-full text-xs font-black bg-[#1D4ED8] text-white">
              {code}
            </span>
          )}
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#EEF4FF] text-[#1D4ED8]">
            {typeLabel}
          </span>
          {statusBadge}
        </div>

        {/* Title & Meta */}
        <div className="space-y-1.5">
          {mode === 'full' && (
            <h3 className="text-2xl sm:text-[26px] font-display font-black text-[#0F1E36] leading-tight">
              {mat.title}
            </h3>
          )}
          <p className="text-sm font-medium text-gray-500">
            {mat.linkedSubtopic ? (
              <>
                {formatPagesLabel(pageCount)} · {formatStepsLabel(mat.linkedSubtopic.stepsCount)} ·{' '}
                {formatQuestionsLabel(mat.linkedSubtopic.questionCount)}
              </>
            ) : (
              <>
                {formatPagesLabel(pageCount)} · {typeLabel}
              </>
            )}
          </p>
        </div>

        {/* Study Progress Bar (when linked to subtopic with steps) */}
        {stepInfo.totalSteps > 0 && !mat.locked && (
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#1D4ED8] rounded-full transition-all duration-300"
                style={{
                  width: `${Math.round((stepInfo.completedCount / stepInfo.totalSteps) * 100)}%`,
                }}
              />
            </div>
            <span className="text-sm font-bold text-gray-500 shrink-0">
              Krok {stepInfo.completedCount} ze {stepInfo.totalSteps}
            </span>
          </div>
        )}

        {mode === 'full' && actionButtons}
      </div>
    );
  };

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Centered Page Header matching Practice.tsx */}
      <section className="text-center space-y-3 max-w-3xl mx-auto">
        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-playful text-gray-700 tracking-tight">
          Výukové materiály
        </h1>
        <p className="text-base sm:text-lg text-gray-500 font-medium leading-relaxed">
          {subjectGradeMaterials.length} {formatListNoun(subjectGradeMaterials.length)}, shrnutí a taháků. Vyber téma, list a podívej se na náhled.
        </p>
      </section>

      {/* Toolbar Row: Subjects LEFT (styled like Practice.tsx) + Search RIGHT (+ hidden Ročník behind feature flag) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Left Controls: Subject Switcher (+ optional Ročník) */}
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <div className="grid grid-cols-2 w-full sm:w-auto sm:inline-flex items-center gap-1.5 bg-white border border-[#E6DFD3] rounded-full p-1.5 shadow-xs shrink-0 max-w-full">
            <button
              type="button"
              onClick={() => setActiveSubject('Matematika')}
              className={cn(
                'justify-center px-3 sm:px-5 py-2 sm:py-2.5 rounded-full text-sm sm:text-base font-black inline-flex items-center gap-2 sm:gap-2.5 transition-all cursor-pointer whitespace-nowrap',
                activeSubject === 'Matematika'
                  ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-teal-900/10'
                  : 'text-gray-700 hover:text-emerald-700 hover:bg-emerald-50/70'
              )}
            >
              {activeSubject === 'Matematika' ? (
                <BrainWhiteIcon className="w-5 h-5 sm:w-6 sm:h-6 shrink-0" />
              ) : (
                <BrainPinkIcon className="w-5 h-5 sm:w-6 sm:h-6 shrink-0" />
              )}
              <span>Matematika</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubject('Čeština')}
              className={cn(
                'justify-center px-3 sm:px-5 py-2 sm:py-2.5 rounded-full text-sm sm:text-base font-black inline-flex items-center gap-2 sm:gap-2.5 transition-all cursor-pointer whitespace-nowrap',
                activeSubject === 'Čeština'
                  ? 'bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow-md shadow-rose-900/10'
                  : 'text-gray-700 hover:text-rose-700 hover:bg-rose-50/70'
              )}
            >
              {activeSubject === 'Čeština' ? (
                <BookWhiteIcon className="w-5 h-5 sm:w-6 sm:h-6 shrink-0" />
              ) : (
                <BookCyanIcon className="w-5 h-5 sm:w-6 sm:h-6 shrink-0" />
              )}
              <span>Český jazyk</span>
            </button>
          </div>

          {SHOW_GRADE_FILTER_UI && (
            <Select value={gradeFilter} onValueChange={(v: GradeFilter) => setGradeFilter(v)}>
              <SelectTrigger className="h-12 rounded-full bg-white border border-[#E6DFD3] shadow-2xs px-4 text-sm font-bold text-[#0F1E36] w-auto min-w-[124px] gap-1.5 cursor-pointer shrink-0">
                <span className="text-gray-400 font-semibold">Ročník</span>
                <span>{GRADE_LABELS[gradeFilter]}</span>
              </SelectTrigger>
              <SelectContent className="rounded-2xl">
                <SelectItem value="all" className="font-bold text-sm">
                  Vše
                </SelectItem>
                <SelectItem value="9" className="font-bold text-sm">
                  9.
                </SelectItem>
                <SelectItem value="7" className="font-bold text-sm">
                  7.
                </SelectItem>
                <SelectItem value="5" className="font-bold text-sm">
                  5.
                </SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Right Controls: Search */}
        <div className="relative w-full sm:w-72 md:w-80 shrink-0">
          <Search
            size={18}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              subjectGradeMaterials.length >= 2
                ? `Hledat mezi ${subjectGradeMaterials.length} listy...`
                : 'Hledat v materiálech...'
            }
            className="pl-11 h-12 rounded-full bg-white border border-[#E6DFD3] shadow-2xs text-sm font-medium placeholder:text-gray-400 focus-visible:ring-2 focus-visible:ring-[#1D4ED8]/20"
          />
        </div>
      </div>

      {/* Main 3-Column Workspace Card */}
      {loading ? (
        <div className="bg-white rounded-[2rem] border border-[#EAE4D7] shadow-sm py-24 text-center space-y-3">
          <div className="w-10 h-10 border-4 border-[#0F1E36] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-base font-bold text-gray-500">Načítám výukové materiály...</p>
        </div>
      ) : (
        <div className="bg-white rounded-[2rem] border border-[#EAE4D7] shadow-sm overflow-x-clip grid grid-cols-1 lg:grid-cols-[235px_minmax(0,1fr)_390px] xl:grid-cols-[255px_minmax(0,1fr)_420px] 2xl:grid-cols-[275px_minmax(0,1fr)_490px] divide-y lg:divide-y-0 lg:divide-x divide-[#EFEAE0]">
          {/* COLUMN 1: TÉMATA & TYP (Desktop only >= lg) */}
          <aside className="hidden lg:flex p-4 sm:p-5 flex-col justify-between gap-6 bg-white">
            <div className="space-y-2">
              <p className="text-xs font-black uppercase tracking-wider text-gray-400 px-3.5">
                Témata
              </p>

              {/* Desktop vertical topic list + Mobile horizontal scroll */}
              <div className="flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-x-visible pb-1 lg:pb-0">
                <button
                  type="button"
                  onClick={() => setSelectedTopicKey('all')}
                  className={cn(
                    'flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl text-sm font-bold transition-colors shrink-0 cursor-pointer text-left',
                    selectedTopicKey === 'all'
                      ? 'bg-[#FEF3C7] text-[#1E1B18]'
                      : 'text-gray-700 hover:bg-gray-50'
                  )}
                >
                  <span className="truncate">Všechny materiály</span>
                  <span className="text-sm font-bold text-gray-500 shrink-0">
                    {subjectGradeMaterials.length}
                  </span>
                </button>

                {topicGroups.map((group) => {
                  const active = selectedTopicKey === group.key;
                  return (
                    <button
                      key={group.key}
                      type="button"
                      onClick={() => setSelectedTopicKey(group.key)}
                      className={cn(
                        'flex items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-bold transition-colors shrink-0 cursor-pointer text-left',
                        active
                          ? 'bg-[#FEF3C7] text-[#1E1B18]'
                          : 'text-gray-700 hover:bg-gray-50'
                      )}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', group.dotColor)} />
                        <span className="truncate">{group.label}</span>
                      </span>
                      <span className="text-sm font-bold text-gray-400 shrink-0">
                        {group.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Exam Prep Filter */}
              <div className="pt-2 mt-2 border-t border-[#EFEAE0]">
                <button
                  type="button"
                  onClick={() => setSelectedTopicKey('__exam__')}
                  className={cn(
                    'w-full flex items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-bold transition-colors cursor-pointer text-left',
                    selectedTopicKey === '__exam__'
                      ? 'bg-[#FEF3C7] text-[#1E1B18]'
                      : 'text-gray-700 hover:bg-gray-50'
                  )}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <Star
                      size={16}
                      className={cn(
                        'shrink-0',
                        examPrepCount > 0 ? 'text-amber-500 fill-amber-400' : 'text-gray-400'
                      )}
                    />
                    <span className="truncate">Příprava na přijímačky</span>
                  </span>
                  <span className="text-sm font-bold text-gray-400 shrink-0">
                    {examPrepCount}
                  </span>
                </button>
              </div>
            </div>

            {/* TYP Checkboxes */}
            <div className="pt-4 border-t border-[#EFEAE0] space-y-2.5">
              <p className="text-xs font-black uppercase tracking-wider text-gray-400 px-1.5">
                Typ
              </p>
              <div className="flex flex-wrap lg:flex-col gap-2.5 px-1.5">
                {MATERIAL_TYPE_FILTER_LABELS.map(({ key, label }) => {
                  const checked = selectedTypes[key];
                  return (
                    <label
                      key={key}
                      className="inline-flex items-center gap-2.5 text-sm font-bold text-gray-700 cursor-pointer select-none"
                    >
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        onClick={() => handleToggleType(key)}
                        className={cn(
                          'w-[18px] h-[18px] rounded-md flex items-center justify-center transition-colors border cursor-pointer shrink-0',
                          checked
                            ? 'bg-[#1D4ED8] border-[#1D4ED8] text-white'
                            : 'bg-white border-gray-300 text-transparent hover:border-gray-400'
                        )}
                      >
                        <Check size={12} strokeWidth={3} />
                      </button>
                      <span onClick={() => handleToggleType(key)}>{label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </aside>

          {/* COLUMN 2: SHEET LIST */}
          <section className="p-4 sm:p-5 flex flex-col justify-between gap-4 min-w-0 bg-white">
            <div className="space-y-3.5 sm:space-y-4">
              {/* Mobile Topic Dropdown (< lg) */}
              <div className="lg:hidden">
                <Select value={selectedTopicKey} onValueChange={(v) => setSelectedTopicKey(v)}>
                  <SelectTrigger
                    aria-label="Vybrat téma materiálů"
                    className="w-full h-11 rounded-2xl bg-[#FAF8F4] border border-[#EAE4D7] px-3.5 text-sm font-bold text-[#0F1E36] shadow-2xs cursor-pointer"
                  >
                    <span className="flex items-center justify-between gap-2 min-w-0 flex-1 pr-1">
                      <span className="flex items-center gap-2 min-w-0">
                        {selectedTopicKey === '__exam__' ? (
                          <Star
                            size={15}
                            className={cn(
                              'shrink-0',
                              examPrepCount > 0
                                ? 'text-amber-500 fill-amber-400'
                                : 'text-gray-400'
                            )}
                          />
                        ) : selectedTopicKey !== 'all' ? (
                          <span
                            className={cn(
                              'w-2.5 h-2.5 rounded-full shrink-0',
                              topicGroups.find((g) => g.key === selectedTopicKey)?.dotColor ||
                                'bg-blue-500'
                            )}
                          />
                        ) : null}
                        <span className="truncate">{activeTopicTitle}</span>
                      </span>
                      <span className="text-xs font-black text-gray-500 shrink-0">
                        {selectedTopicKey === 'all'
                          ? subjectGradeMaterials.length
                          : selectedTopicKey === '__exam__'
                            ? examPrepCount
                            : (topicGroups.find((g) => g.key === selectedTopicKey)?.count ?? 0)}
                      </span>
                    </span>
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl max-h-80">
                    <SelectItem value="all" className="text-sm font-bold cursor-pointer py-2.5">
                      <span className="flex items-center justify-between gap-3 w-full">
                        <span>Všechny materiály</span>
                        <span className="text-xs font-bold text-gray-400">
                          {subjectGradeMaterials.length}
                        </span>
                      </span>
                    </SelectItem>

                    <SelectItem value="__exam__" className="text-sm font-bold cursor-pointer py-2.5">
                      <span className="flex items-center justify-between gap-3 w-full">
                        <span className="flex items-center gap-2">
                          <Star
                            size={14}
                            className={cn(
                              'shrink-0',
                              examPrepCount > 0
                                ? 'text-amber-500 fill-amber-400'
                                : 'text-gray-400'
                            )}
                          />
                          <span>Příprava na přijímačky</span>
                        </span>
                        <span className="text-xs font-bold text-gray-400">{examPrepCount}</span>
                      </span>
                    </SelectItem>

                    {topicGroups.map((group) => (
                      <SelectItem
                        key={group.key}
                        value={group.key}
                        className="text-sm font-bold cursor-pointer py-2.5"
                      >
                        <span className="flex items-center justify-between gap-3 w-full">
                          <span className="flex items-center gap-2">
                            <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', group.dotColor)} />
                            <span>{group.label}</span>
                          </span>
                          <span className="text-xs font-bold text-gray-400">{group.count}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* List Header */}
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-xl sm:text-2xl font-display font-black text-[#0F1E36] leading-snug">
                    {activeTopicTitle}
                  </h2>
                  <p className="text-sm font-medium text-gray-500">
                    {filteredMaterials.length} {formatListNoun(filteredMaterials.length)} ·{' '}
                    {formatCompletedLabel(completedInViewCount)}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsMobileTypeFilterOpen((prev) => !prev)}
                    aria-expanded={isMobileTypeFilterOpen}
                    className={cn(
                      'lg:hidden inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border text-xs font-bold transition-colors cursor-pointer shrink-0',
                      isMobileTypeFilterOpen || hasCustomTypeFilter
                        ? 'bg-[#EEF4FF] border-[#BFD8FE] text-[#1D4ED8]'
                        : 'bg-white border-gray-200 text-[#0F1E36] hover:bg-gray-50'
                    )}
                  >
                    <SlidersHorizontal size={14} />
                    <span>Filtry</span>
                    {hasCustomTypeFilter && (
                      <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[#1D4ED8] text-white text-[10px] font-black">
                        {activeTypeCount}
                      </span>
                    )}
                  </button>

                  <Select value={sortBy} onValueChange={(v: SortOption) => setSortBy(v)}>
                    <SelectTrigger className="h-9 border-none shadow-none bg-transparent hover:bg-gray-50 px-2.5 rounded-lg text-sm font-bold text-[#0F1E36] w-auto gap-1 cursor-pointer shrink-0">
                      <span>{SORT_LABELS[sortBy]}</span>
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="number" className="text-sm font-bold">
                        Podle čísla
                      </SelectItem>
                      <SelectItem value="newest" className="text-sm font-bold">
                        Od nejnovějších
                      </SelectItem>
                      <SelectItem value="title" className="text-sm font-bold">
                        Podle názvu
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Mobile Collapsible Type Filter Pills (< lg) */}
              {isMobileTypeFilterOpen && (
                <div className="lg:hidden flex flex-wrap items-center gap-2 p-2.5 rounded-2xl bg-[#FAF8F4] border border-[#EAE4D7]">
                  <span className="text-[11px] font-black uppercase tracking-wider text-gray-400 px-1">
                    Typ:
                  </span>
                  {MATERIAL_TYPE_FILTER_LABELS.map(({ key, label }) => {
                    const checked = selectedTypes[key];
                    return (
                      <button
                        key={key}
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        onClick={() => handleToggleType(key)}
                        className={cn(
                          'inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[34px] rounded-full text-xs font-bold border transition-colors cursor-pointer',
                          checked
                            ? 'bg-[#1D4ED8] border-[#1D4ED8] text-white shadow-2xs'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                        )}
                      >
                        {checked && <Check size={12} strokeWidth={3} />}
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Material Rows */}
              {filteredMaterials.length === 0 ? (
                <div className="py-16 px-4 text-center rounded-2xl border border-dashed border-gray-200 bg-[#FAF8F4] space-y-3">
                  <Sparkles size={28} className="mx-auto text-amber-500" />
                  <div className="space-y-1">
                    <p className="text-base font-bold text-[#0F1E36]">
                      Žádné materiály neodpovídají filtru
                    </p>
                    <p className="text-sm text-gray-500">
                      Zkuste upravit hledaný výraz nebo zapnout více typů materiálů.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearch('');
                      setSelectedTopicKey('all');
                      setGradeFilter('all');
                      setSelectedTypes({ worksheet: true, summary: true, cheatsheet: true });
                    }}
                    className="rounded-full text-sm font-bold px-4 h-10 cursor-pointer"
                  >
                    Obnovit filtry
                  </Button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {filteredMaterials.slice(0, visibleLimit).map((mat) => {
                    const isSelected = mat.id === selectedMaterial?.id;
                    const code = materialCodeMap.get(mat.id) || '1.1';
                    const pageCount = Math.max(
                      1,
                      measuredPageCounts[mat.id] || mat.pageCount || 1
                    );
                    const fileBadge = getMaterialFileBadge(mat);
                    const stepInfo = getStepProgressForMaterial(mat);

                    return (
                      <button
                        key={mat.id}
                        type="button"
                        onClick={() => handleSelectRow(mat)}
                        className={cn(
                          'w-full flex items-center justify-between gap-2.5 px-3.5 py-3 rounded-2xl transition-all text-left cursor-pointer border',
                          isSelected
                            ? 'bg-[#F4F8FF] border-[#BFD8FE] shadow-2xs'
                            : 'bg-white border-transparent hover:bg-gray-50/90 hover:border-gray-100'
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span
                            className={cn(
                              'w-10 h-8 rounded-xl text-xs font-black flex items-center justify-center shrink-0 transition-colors',
                              isSelected
                                ? 'bg-[#1D4ED8] text-white'
                                : 'bg-[#EEF2F7] text-[#0F2942]'
                            )}
                          >
                            {code}
                          </span>

                          <div className="min-w-0 flex-1">
                            <p className="text-sm sm:text-[15px] font-bold text-[#0F1E36] line-clamp-2 sm:truncate leading-snug">
                              {mat.title}
                            </p>
                            <p className="text-xs sm:text-[13px] font-medium text-gray-500 truncate">
                              {formatPagesLabel(pageCount)} · {fileBadge}
                            </p>
                          </div>
                        </div>

                        {/* Right status pill */}
                        <div className="shrink-0">
                          {mat.locked ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-500 border border-gray-200/70">
                              <Lock size={11} />
                              <span>Premium</span>
                            </span>
                          ) : stepInfo.isCompleted ? (
                            <span
                              className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 inline-flex items-center justify-center"
                              title="Splněno"
                            >
                              <Check size={14} strokeWidth={3} />
                            </span>
                          ) : stepInfo.isInProgress ? (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-[#FEF3C7] text-[#92400E]">
                              {stepInfo.completedCount} / {stepInfo.totalSteps}
                            </span>
                          ) : !hasMaterialsAccess && mat.isFreeSample ? (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                              Zdarma
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-[#EEF4FF] text-[#2563EB]">
                              Nové
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {filteredMaterials.length > visibleLimit && (
              <div className="pt-2 border-t border-gray-100 text-center">
                <button
                  type="button"
                  onClick={() => setVisibleLimit((prev) => prev + 12)}
                  className="text-sm font-bold text-[#1D4ED8] hover:underline py-1.5 px-4 cursor-pointer"
                >
                  Zobrazit dalších {filteredMaterials.length - visibleLimit}{' '}
                  {formatListNoun(filteredMaterials.length - visibleLimit)}
                </button>
              </div>
            )}
          </section>

          {/* COLUMN 3: PREVIEW & ACTIONS (Desktop sticky) */}
          <aside className="hidden lg:block lg:sticky lg:top-4 lg:self-start p-5 sm:p-6 bg-white">
            {selectedMaterial ? (
              renderRightDetailPanel(selectedMaterial)
            ) : (
              <div className="h-full min-h-[360px] flex flex-col items-center justify-center text-center p-6 text-gray-400 space-y-2">
                <BookOpen size={30} className="text-gray-300" />
                <p className="text-base font-bold text-gray-500">Vyber výukový list ze seznamu</p>
                <p className="text-sm text-gray-400">
                  Zde uvidíš náhled stran, postup studia i možnosti stažení.
                </p>
              </div>
            )}
          </aside>
        </div>
      )}

      {/* Mobile Bottom Sheet (< lg): sticky header + scrollable body + sticky CTA bar */}
      <Dialog open={isMobileDetailOpen} onOpenChange={setIsMobileDetailOpen}>
        <DialogContent
          showCloseButton={false}
          className="lg:hidden fixed inset-x-0 bottom-0 z-50 w-full max-w-none sm:max-w-none rounded-t-3xl rounded-b-none max-h-[88dvh] p-0 flex flex-col bg-white shadow-2xl border-0 border-t border-gray-200 overflow-hidden my-0"
        >
          <DialogTitle className="sr-only">
            {selectedMaterial?.title || 'Detail materiálu'}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Náhled a akce vybraného výukového materiálu
          </DialogDescription>

          {selectedMaterial && (
            <>
              {/* Sticky Sheet Header */}
              <div className="shrink-0 bg-white border-b border-gray-100 px-4 pt-2.5 pb-3">
                <div className="w-10 h-1.5 rounded-full bg-gray-300 mx-auto mb-2.5" />
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <span className="px-2.5 py-1 rounded-full text-xs font-black bg-[#1D4ED8] text-white shrink-0 mt-0.5">
                      {materialCodeMap.get(selectedMaterial.id) || '1.1'}
                    </span>
                    <h3 className="text-base sm:text-lg font-display font-black text-[#0F1E36] leading-snug line-clamp-2 min-w-0">
                      {selectedMaterial.title}
                    </h3>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsMobileDetailOpen(false)}
                    aria-label="Zavřít detail materiálu"
                    className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center shrink-0 cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Scrollable Sheet Body */}
              <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
                {renderRightDetailPanel(selectedMaterial, 'bodyOnly')}
              </div>

              {/* Sticky Bottom CTA Bar */}
              <div className="shrink-0 border-t border-gray-100 bg-white px-4 pt-2.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
                {renderRightDetailPanel(selectedMaterial, 'actionsOnly')}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Fullscreen Protected Reader Modal (Zoom + Print + PDF Export) */}
      {selectedMaterial && !selectedMaterial.locked && (
        <FullscreenMaterialReaderModal
          isOpen={isReaderOpen}
          onClose={() => setIsReaderOpen(false)}
          title={selectedMaterial.title}
          subtitle={`${selectedMaterial.subject} • ${selectedMaterial.topic || 'Výukový list'}`}
          pages={previewPages}
          currentPageIdx={previewPageIdx}
          onPageChange={setPreviewPageIdx}
          watermarkText={effectiveWatermark}
          canExport={hasMaterialsAccess && selectedMaterial.canDownload !== false}
          isAlreadyUnlocked={Boolean(quota?.unlockedMaterialIds?.includes(selectedMaterial.id))}
          isCourseExempt={Boolean(quota?.courseExemptMaterialIds?.includes(selectedMaterial.id))}
          quota={quota}
          onDownloadPdf={() => handleDownloadPdf(selectedMaterial)}
          onPrint={() => handlePrint(selectedMaterial)}
          onRequestUpgrade={() => {
            setIsReaderOpen(false);
            openPaywall(
              'Stažení PDF a tisk jsou součástí ProEducator Premium.'
            );
          }}
          isDownloading={isDownloading}
          isPrinting={isPrinting}
          studyTheory={selectedMaterial.studyTheory}
        />
      )}

      {/* Unified Paywall Modal (opened only on demand for locked actions) */}
      <UnifiedPaywallModal
        isOpen={isPaywallOpen}
        onClose={() => setIsPaywallOpen(false)}
        type="premium"
        description={
          paywallDescription ||
          'Staň se podporovatelem ProEducator, zafixuj si cenu 99 Kč/měsíc a získej neomezené online čtení všech materiálů plus 8 stažení / tisků každé období.'
        }
      />
    </div>
  );
}
