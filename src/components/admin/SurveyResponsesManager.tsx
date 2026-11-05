import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart3, 
  Search, 
  RefreshCcw, 
  Download, 
  Share2, 
  GraduationCap, 
  School, 
  Users, 
  TrendingUp, 
  Calendar,
  Filter,
  CheckCircle2,
  Trash2,
  Loader2,
  AlertTriangle
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../ui/dialog';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../lib/firebase';
import { collection, getDocs, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { cacheManager } from '../../lib/cacheManager';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { CoopBlueIcon, TeamBlueIcon, CapIcon } from '../common/CustomIcon';

export interface SurveyResponseItem {
  id: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  answer: string;
  customAnswer?: string;
  school?: string;
  grade?: string;
  bonusAwarded?: number;
  createdAt?: any;
}

const SURVEYS_CACHE_KEY = 'surveys:all';
const SURVEYS_SESSION_KEY = 'proedu_admin_surveys_cache';

export default function SurveyResponsesManager() {
  const { user } = useAuth();
  const [surveys, setSurveys] = useState<SurveyResponseItem[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = sessionStorage.getItem(SURVEYS_SESSION_KEY);
        if (raw) return JSON.parse(raw);
      } catch {
        // Ignore session cache parse error
      }
    }
    return [];
  });
  const [loading, setLoading] = useState(() => surveys.length === 0);
  const [refreshing, setRefreshing] = useState(false);

  // Filtry
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSourceFilter, setSelectedSourceFilter] = useState<string>('all');
  const [selectedGradeFilter, setSelectedGradeFilter] = useState<string>('all');

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [surveyToDelete, setSurveyToDelete] = useState<SurveyResponseItem | null>(null);

  const loadSurveys = async (isManual = false) => {
    if (isManual) {
      setRefreshing(true);
      cacheManager.invalidate(SURVEYS_CACHE_KEY);
    } else if (surveys.length === 0) {
      setLoading(true);
    }

    try {
      const fetched = await cacheManager.getOrFetch(
        SURVEYS_CACHE_KEY,
        async () => {
          let result: SurveyResponseItem[] = [];

          // 1. Nejrychlejší cesta: Přímé čtení z Firestore kolekce surveyResponses (~120 ms)
          try {
            const snap = await getDocs(collection(db, 'surveyResponses'));
            result = snap.docs.map(d => ({
              id: d.id,
              ...(d.data() as any)
            }));
          } catch (fsErr) {
            console.warn('Direct surveyResponses read note:', fsErr);
          }

          // 2. Fallback: Pokud je přímé čtení prázdné, zkusíme serverový endpoint s krátkým timeoutem
          if (result.length === 0 && user) {
            try {
              const token = await user.getIdToken();
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 2500);
              const res = await fetch('/api/admin/surveys', {
                headers: { Authorization: `Bearer ${token}` },
                signal: controller.signal
              });
              clearTimeout(timeoutId);
              if (res.ok) {
                const data = await res.json();
                if (data.success && Array.isArray(data.surveys)) {
                  result = data.surveys;
                }
              }
            } catch (apiErr) {
              console.warn('Backend /api/admin/surveys note:', apiErr);
            }
          }

          // 3. Fallback: pokud je stále prázdno, načteme přímo z profilů v users
          if (result.length === 0) {
            try {
              const usersSnap = await getDocs(collection(db, 'users'));
              result = usersSnap.docs
                .map(d => ({ id: d.id, ...(d.data() as any) }))
                .filter(u => u.surveyCompleted)
                .map(u => ({
                  id: 'survey_' + u.uid,
                  userId: u.uid,
                  userEmail: u.email,
                  userName: u.name,
                  answer: u.surveyAnswer || 'Nezadáno',
                  customAnswer: u.surveyAnswerCustom,
                  school: u.surveySchool,
                  grade: u.surveyGrade,
                  bonusAwarded: 20,
                  createdAt: u.createdAt
                }));
            } catch (usersErr) {
              console.warn('Fallback users read note:', usersErr);
            }
          }

          // Seřazení od nejnovějších
          result.sort((a, b) => {
            const getMillis = (val: any) => {
              if (!val) return 0;
              if (val.toMillis) return val.toMillis();
              if (typeof val.seconds === 'number') return val.seconds * 1000;
              if (typeof val._seconds === 'number') return val._seconds * 1000;
              const t = new Date(val).getTime();
              return isNaN(t) ? 0 : t;
            };
            return getMillis(b.createdAt) - getMillis(a.createdAt);
          });

          return result;
        },
        3 * 60 * 1000
      );

      setSurveys(fetched);
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem(SURVEYS_SESSION_KEY, JSON.stringify(fetched));
        } catch {
          // Ignore storage quota error
        }
      }

      if (isManual) {
        toast.success(`Načteno ${fetched.length} vyplněných dotazníků`);
      }
    } catch (err: any) {
      console.error('Chyba při načítání dotazníků:', err);
      toast.error('Nepodařilo se načíst data z dotazníků');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const confirmDeleteSurvey = async () => {
    if (!surveyToDelete) return;
    const item = surveyToDelete;

    setDeletingId(item.id);
    try {
      let deleted = false;
      // 1. Přímé smazání ve Firestore (okamžité)
      try {
        await deleteDoc(doc(db, 'surveyResponses', item.id));
        deleted = true;
      } catch (delErr) {
        console.warn('Doc delete note:', delErr);
      }

      if (item.userId) {
        try {
          await updateDoc(doc(db, 'users', item.userId), {
            surveyCompleted: false,
            surveyAnswer: null,
            surveyAnswerCustom: null,
            surveySchool: null,
            surveyGrade: null
          });
        } catch (uErr) {
          console.warn('User reset note:', uErr);
        }
      }

      // 2. Asynchronní synchronizace se serverem
      if (user) {
        user.getIdToken().then(token => {
          fetch(`/api/admin/surveys/${encodeURIComponent(item.id)}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
          }).catch(() => {});
        }).catch(() => {});
      }

      const updated = surveys.filter(s => s.id !== item.id);
      setSurveys(updated);
      cacheManager.invalidate(SURVEYS_CACHE_KEY);
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem(SURVEYS_SESSION_KEY, JSON.stringify(updated));
        } catch {}
      }

      setSurveyToDelete(null);
      toast.success('Odpověď z dotazníku byla úspěšně smazána.');
    } catch (err: any) {
      console.error('Chyba při mazání dotazníku:', err);
      toast.error('Nepodařilo se smazat odpověď.');
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    loadSurveys();
  }, []);

  // --- ANALYTIKA A STATISTIKY ---
  const analytics = useMemo(() => {
    const total = surveys.length;
    if (total === 0) {
      return {
        total: 0,
        sourceCounts: {},
        gradeCounts: {},
        topSchools: [],
        topSource: null,
        topGrade: null,
        uniqueSchoolsCount: 0
      };
    }

    const sourceCounts: Record<string, number> = {};
    const gradeCounts: Record<string, number> = {};
    const schoolCounts: Record<string, number> = {};

    surveys.forEach((item) => {
      // Odkud nás znají
      const src = item.answer || 'Neuvedeno';
      sourceCounts[src] = (sourceCounts[src] || 0) + 1;

      // Ročník
      const gr = item.grade || 'Neuvedeno';
      gradeCounts[gr] = (gradeCounts[gr] || 0) + 1;

      // Škola
      if (item.school && item.school.trim()) {
        const cleanSchool = item.school.trim();
        schoolCounts[cleanSchool] = (schoolCounts[cleanSchool] || 0) + 1;
      }
    });

    // Top Source
    let topSource = { name: 'Žádný', count: 0, pct: 0 };
    Object.entries(sourceCounts).forEach(([name, count]) => {
      if (count > topSource.count) {
        topSource = { name, count, pct: Math.round((count / total) * 100) };
      }
    });

    // Top Grade
    let topGrade = { name: 'Žádný', count: 0, pct: 0 };
    Object.entries(gradeCounts).forEach(([name, count]) => {
      if (count > topGrade.count) {
        topGrade = { name, count, pct: Math.round((count / total) * 100) };
      }
    });

    // Top Schools
    const topSchools = Object.entries(schoolCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    return {
      total,
      sourceCounts,
      gradeCounts,
      topSchools,
      topSource: topSource.count > 0 ? topSource : null,
      topGrade: topGrade.count > 0 ? topGrade : null,
      uniqueSchoolsCount: Object.keys(schoolCounts).length
    };
  }, [surveys]);

  // Filtrovaná data pro tabulku
  const filteredSurveys = useMemo(() => {
    return surveys.filter((item) => {
      // Fulltext search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchEmail = item.userEmail?.toLowerCase().includes(q);
        const matchSchool = item.school?.toLowerCase().includes(q);
        const matchGrade = item.grade?.toLowerCase().includes(q);
        const matchAnswer = item.answer?.toLowerCase().includes(q);
        const matchCustom = item.customAnswer?.toLowerCase().includes(q);
        if (!matchEmail && !matchSchool && !matchGrade && !matchAnswer && !matchCustom) {
          return false;
        }
      }

      // Filter by source
      if (selectedSourceFilter !== 'all' && item.answer !== selectedSourceFilter) {
        return false;
      }

      // Filter by grade
      if (selectedGradeFilter !== 'all' && item.grade !== selectedGradeFilter) {
        return false;
      }

      return true;
    });
  }, [surveys, searchQuery, selectedSourceFilter, selectedGradeFilter]);

  // Export do CSV
  const handleExportCSV = () => {
    if (surveys.length === 0) {
      toast.error('Žádná data k exportu');
      return;
    }

    const headers = ['Datum', 'Email', 'Odkud se o nas dozvedel', 'Upresneni', 'Skola', 'Rocnik'];
    const rows = surveys.map(s => {
      const dateStr = s.createdAt?.toDate 
        ? s.createdAt.toDate().toLocaleString('cs-CZ') 
        : (s.createdAt?.seconds ? new Date(s.createdAt.seconds * 1000).toLocaleString('cs-CZ') : '');
      return [
        `"${dateStr}"`,
        `"${s.userEmail || ''}"`,
        `"${s.answer || ''}"`,
        `"${s.customAnswer || ''}"`,
        `"${s.school || ''}"`,
        `"${s.grade || ''}"`
      ].join(';');
    });

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `proedu_dotazniky_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Export do CSV byl úspěšně vygenerován');
  };

  const formatDate = (val: any) => {
    if (!val) return '—';
    try {
      if (val.toDate) {
        return val.toDate().toLocaleString('cs-CZ', {
          day: 'numeric',
          month: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }
      const secs = val.seconds ?? val._seconds;
      if (typeof secs === 'number') {
        return new Date(secs * 1000).toLocaleString('cs-CZ', {
          day: 'numeric',
          month: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }
      const d = new Date(val);
      if (!isNaN(d.getTime())) {
        return d.toLocaleString('cs-CZ', {
          day: 'numeric',
          month: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }
      return '—';
    } catch {
      return '—';
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-300">
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-100">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center text-xl shadow-inner shrink-0">
              <CoopBlueIcon size={22} />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight font-display">
                Odkud jste o nás slyšeli ? – Výsledky a Analytika
              </h2>
              <p className="text-gray-500 font-semibold text-xs sm:text-sm">
                Přehled marketingových kanálů, škol a ročníků studentů z úvodního dotazníku.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            className="rounded-xl border border-blue-200/80 bg-white hover:bg-blue-50/50 text-[#0F2942] font-black text-xs h-9 px-3.5 flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <Download size={14} />
            <span>Export CSV</span>
          </Button>
          <Button
            size="sm"
            onClick={() => loadSurveys(true)}
            disabled={refreshing || loading}
            className="rounded-xl bg-[#B9D8FC] hover:bg-[#A3CCFA] text-[#0F2942] font-black text-xs h-9 px-3.5 flex items-center gap-1.5 shadow-2xs border border-blue-200/80 cursor-pointer disabled:opacity-50"
          >
            <RefreshCcw size={14} className={cn(refreshing && "animate-spin text-[#0F2942]")} />
            <span>Obnovit</span>
          </Button>
        </div>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        <Card className="rounded-2xl border-gray-200/80 shadow-xs bg-white p-4 sm:p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 shadow-inner">
            <TeamBlueIcon size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Celkem odpovědí</p>
            <h3 className="text-2xl font-black text-gray-900 font-mono mt-0.5">
              {loading ? '...' : analytics.total}
            </h3>
            <p className="text-[11px] font-semibold text-blue-700 mt-0.5">
              vyplněných dotazníků
            </p>
          </div>
        </Card>

        <Card className="rounded-2xl border-gray-200/80 shadow-xs bg-white p-4 sm:p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 shadow-inner">
            <TrendingUp size={22} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider truncate">Hlavní zdroj</p>
            <h3 className="text-lg font-black text-gray-900 truncate mt-0.5" title={analytics.topSource?.name || 'Žádný'}>
              {loading ? '...' : (analytics.topSource ? analytics.topSource.name : 'Zatím žádný')}
            </h3>
            <p className="text-[11px] font-semibold text-emerald-700 mt-0.5">
              {analytics.topSource ? `${analytics.topSource.count} žáků (${analytics.topSource.pct} %)` : 'Čeká se na data'}
            </p>
          </div>
        </Card>

        <Card className="rounded-2xl border-gray-200/80 shadow-xs bg-white p-4 sm:p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 shadow-inner">
            <CapIcon size={24} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider truncate">Klíčový ročník</p>
            <h3 className="text-lg font-black text-gray-900 truncate mt-0.5" title={analytics.topGrade?.name || 'Žádný'}>
              {loading ? '...' : (analytics.topGrade ? analytics.topGrade.name : 'Zatím žádný')}
            </h3>
            <p className="text-[11px] font-semibold text-purple-700 mt-0.5">
              {analytics.topGrade ? `${analytics.topGrade.count} žáků (${analytics.topGrade.pct} %)` : 'Čeká se na data'}
            </p>
          </div>
        </Card>

        <Card className="rounded-2xl border-gray-200/80 shadow-xs bg-white p-4 sm:p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 shadow-inner">
            <CapIcon size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Různorodost škol</p>
            <h3 className="text-2xl font-black text-gray-900 font-mono mt-0.5">
              {loading ? '...' : analytics.uniqueSchoolsCount}
            </h3>
            <p className="text-[11px] font-semibold text-amber-700 mt-0.5">
              unikátních škol
            </p>
          </div>
        </Card>
      </div>

      {/* ANALYTICS VISUAL BREAKDOWN (2 COLUMNS) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">
        
        {/* Levý sloupec: Rozpad zdrojů ("Odkud nás znají") */}
        <Card className="rounded-2xl border-gray-200/80 shadow-xs bg-white p-5 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-gray-100">
            <div className="flex items-center gap-2 font-black text-sm text-gray-900">
              <CoopBlueIcon size={18} />
              <span>Odkud o nás žáci slyšeli</span>
            </div>
            <span className="text-xs text-gray-400 font-bold">Podíl kanálů</span>
          </div>

          <div className="space-y-3">
            {Object.keys(analytics.sourceCounts).length === 0 ? (
              <p className="text-xs text-gray-400 font-medium py-4 text-center">Zatím nebyly zaznamenány žádné odpovědi.</p>
            ) : (
              Object.entries(analytics.sourceCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([name, count]) => {
                  const pct = Math.round((count / analytics.total) * 100);
                  return (
                    <div key={name} className="space-y-1">
                      <div className="flex justify-between items-center text-xs font-bold">
                        <span className="text-gray-800 truncate">{name}</span>
                        <span className="font-mono text-gray-500 shrink-0">{count} žáků ({pct} %)</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all duration-300"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </Card>

        {/* Pravý sloupec: Rozpad ročníků ("Do kterého ročníku") */}
        <Card className="rounded-2xl border-gray-200/80 shadow-xs bg-white p-5 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-gray-100">
            <div className="flex items-center gap-2 font-black text-sm text-gray-900">
              <CapIcon size={18} />
              <span>Zastoupení ročníků</span>
            </div>
            <span className="text-xs text-gray-400 font-bold">Cílové skupiny</span>
          </div>

          <div className="space-y-3">
            {Object.keys(analytics.gradeCounts).length === 0 ? (
              <p className="text-xs text-gray-400 font-medium py-4 text-center">Zatím nebyly zaznamenány žádné odpovědi.</p>
            ) : (
              Object.entries(analytics.gradeCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([name, count]) => {
                  const pct = Math.round((count / analytics.total) * 100);
                  return (
                    <div key={name} className="space-y-1">
                      <div className="flex justify-between items-center text-xs font-bold">
                        <span className="text-gray-800 truncate">{name}</span>
                        <span className="font-mono text-gray-500 shrink-0">{count} žáků ({pct} %)</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full bg-purple-500 rounded-full transition-all duration-300"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </Card>

      </div>

      {/* FILTER & DETAILED TABLE SECTION */}
      <Card className="rounded-2xl border-gray-200/80 shadow-xs bg-white p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <h3 className="font-black text-base text-gray-900">Detailní přehled odeslaných odpovědí</h3>
            <span className="px-2 py-0.5 rounded-lg bg-gray-100 text-gray-600 font-mono text-xs font-bold">
              {filteredSurveys.length}
            </span>
          </div>

          {/* Search and Filters */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                type="text"
                placeholder="Hledat žáka, školu..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 text-xs h-9 rounded-xl border-gray-200 bg-white"
              />
            </div>

            <select
              value={selectedSourceFilter}
              onChange={(e) => setSelectedSourceFilter(e.target.value)}
              className="text-xs h-9 px-3 rounded-xl border border-gray-200 bg-white font-medium cursor-pointer shadow-2xs"
            >
              <option value="all">Všechny zdroje</option>
              {Object.keys(analytics.sourceCounts).map((src) => (
                <option key={src} value={src}>{src}</option>
              ))}
            </select>

            <select
              value={selectedGradeFilter}
              onChange={(e) => setSelectedGradeFilter(e.target.value)}
              className="text-xs h-9 px-3 rounded-xl border border-gray-200 bg-white font-medium cursor-pointer shadow-2xs"
            >
              <option value="all">Všechny ročníky</option>
              {Object.keys(analytics.gradeCounts).map((gr) => (
                <option key={gr} value={gr}>{gr}</option>
              ))}
            </select>
          </div>
        </div>

        {/* TABLE */}
        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#FAF7F0] text-gray-500 font-bold uppercase tracking-wider border-b border-gray-200/80">
              <tr>
                <th className="py-3 px-4">Datum</th>
                <th className="py-3 px-4">Student</th>
                <th className="py-3 px-4">Odkud o nás ví</th>
                <th className="py-3 px-4">Škola</th>
                <th className="py-3 px-4">Ročník</th>
                <th className="py-3 px-4 text-right">Akce</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-400">
                    Načítání výsledků dotazníků...
                  </td>
                </tr>
              ) : filteredSurveys.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-400">
                    {surveys.length === 0 
                      ? 'Zatím nebyl odeslán žádný dotazník.' 
                      : 'Žádné odpovědi neodpovídají zadanému filtru.'}
                  </td>
                </tr>
              ) : (
                filteredSurveys.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="py-3 px-4 text-gray-500 whitespace-nowrap">
                      {formatDate(item.createdAt)}
                    </td>
                    <td className="py-3 px-4 text-gray-900 whitespace-nowrap">
                      {item.userName ? (
                        <div>
                          <div className="font-bold text-gray-900">{item.userName}</div>
                          <div className="text-[11px] text-gray-400 font-medium">{item.userEmail || item.userId}</div>
                        </div>
                      ) : (
                        <div className="font-bold text-gray-900">{item.userEmail || item.userId || 'Student'}</div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 font-bold border border-blue-200 text-[11px]">
                        {item.answer}
                      </span>
                      {item.customAnswer && (
                        <p className="text-[10px] text-gray-500 mt-0.5 italic">
                          "{item.customAnswer}"
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-4 text-gray-800">
                      {item.school ? (
                        <span className="font-semibold text-gray-900">{item.school}</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {item.grade ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-purple-50 text-purple-800 font-bold border border-purple-200 text-[11px]">
                          {item.grade}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setSurveyToDelete(item)}
                        disabled={deletingId === item.id}
                        title="Smazat tuto odpověď a zresetovat dotazník studentovi"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer disabled:opacity-40"
                      >
                        {deletingId === item.id ? (
                          <Loader2 size={15} className="animate-spin text-rose-500" />
                        ) : (
                          <Trash2 size={15} />
                        )}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* POTVRZOVACÍ MODÁL PRO SMAZÁNÍ DOTAZNÍKU */}
      <Dialog open={!!surveyToDelete} onOpenChange={open => { if (!open && !deletingId) setSurveyToDelete(null); }}>
        <DialogContent className="sm:max-w-md rounded-[2rem] p-6 sm:p-8 bg-white border border-gray-100 shadow-2xl space-y-5">
          <div className="space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mb-2">
              <AlertTriangle size={24} />
            </div>
            <DialogTitle className="text-xl sm:text-2xl font-sans font-black text-gray-900">
              Smazat vyplněný dotazník?
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-gray-600 leading-relaxed">
              Opravdu chceš trvale odstranit tento dotazník? Studentovi se zároveň v profilu dotazník zresetuje, aby ho mohl případně vyplnit znovu.
            </DialogDescription>
          </div>

          {surveyToDelete && (
            <div className="bg-[#FAF7F0] rounded-2xl p-4 border border-[#E6E0D4] space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-500 font-bold">Student:</span>
                <span className="font-black text-gray-900 truncate">
                  {surveyToDelete.userName || surveyToDelete.userEmail || surveyToDelete.userId}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-500 font-bold">Odkud o nás ví:</span>
                <span className="font-bold text-blue-800">{surveyToDelete.answer}</span>
              </div>
              {surveyToDelete.school && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-gray-500 font-bold">Škola:</span>
                  <span className="font-semibold text-gray-800 truncate">{surveyToDelete.school}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
            <Button
              type="button"
              variant="outline"
              disabled={!!deletingId}
              onClick={() => setSurveyToDelete(null)}
              className="flex-1 rounded-xl h-11 border-gray-200 text-gray-700 font-bold text-xs cursor-pointer"
            >
              Zrušit
            </Button>
            <Button
              type="button"
              disabled={!!deletingId}
              onClick={confirmDeleteSurvey}
              className="flex-1 rounded-xl h-11 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs shadow-md shadow-rose-100 cursor-pointer flex items-center justify-center gap-2"
            >
              {deletingId ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  <span>Mažu dotazník...</span>
                </>
              ) : (
                <>
                  <Trash2 size={15} />
                  <span>Ano, smazat dotazník</span>
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}