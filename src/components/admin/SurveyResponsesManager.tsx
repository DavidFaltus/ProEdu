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
  CheckCircle2
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';

export interface SurveyResponseItem {
  id: string;
  userId: string;
  userEmail?: string;
  answer: string;
  customAnswer?: string;
  school?: string;
  grade?: string;
  bonusAwarded?: number;
  createdAt?: any;
}

export default function SurveyResponsesManager() {
  const { user } = useAuth();
  const [surveys, setSurveys] = useState<SurveyResponseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filtry
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSourceFilter, setSelectedSourceFilter] = useState<string>('all');
  const [selectedGradeFilter, setSelectedGradeFilter] = useState<string>('all');

  const loadSurveys = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);

    try {
      let fetched: SurveyResponseItem[] = [];

      // 1. Zkusíme načíst data z bezpečného serverového endpointu
      if (user) {
        try {
          const token = await user.getIdToken();
          const res = await fetch('/api/admin/surveys', {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            if (data.success && Array.isArray(data.surveys)) {
              fetched = data.surveys;
            }
          }
        } catch (apiErr) {
          console.warn('Backend /api/admin/surveys note:', apiErr);
        }
      }

      // 2. Fallback: pokud server neodpověděl, zkusíme Firestore kolekci surveyResponses
      if (fetched.length === 0) {
        try {
          const snap = await getDocs(collection(db, 'surveyResponses'));
          fetched = snap.docs.map(doc => ({
            id: doc.id,
            ...(doc.data() as any)
          }));
        } catch (fsErr) {
          console.warn('Direct surveyResponses read note:', fsErr);
          // 3. Fallback: načíst z uživatelských profilů, kteří mají surveyCompleted === true
          try {
            const usersSnap = await getDocs(collection(db, 'users'));
            fetched = usersSnap.docs
              .map(d => ({ id: d.id, ...d.data() as any }))
              .filter(u => u.surveyCompleted)
              .map(u => ({
                id: u.uid,
                userId: u.uid,
                userEmail: u.email,
                answer: u.surveyAnswer || 'Nezadáno',
                customAnswer: u.surveyAnswerCustom,
                school: u.surveySchool,
                grade: u.surveyGrade,
                bonusAwarded: 20,
                createdAt: u.createdAt
              }));
          } catch (usersErr) {
            console.error('All survey fetching strategies failed:', usersErr);
          }
        }
      }

      // Seřazení od nejnovějších
      fetched.sort((a, b) => {
        const aT = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
        const bT = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
        return bT - aT;
      });

      setSurveys(fetched);
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
      const date = val.toDate ? val.toDate() : new Date(val.seconds ? val.seconds * 1000 : val);
      return date.toLocaleDateString('cs-CZ', {
        day: 'numeric',
        month: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
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
              <Share2 size={20} />
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
            className="rounded-xl border-gray-200 hover:bg-gray-50 text-gray-700 font-bold text-xs h-9 px-3.5 flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <Download size={14} />
            <span>Export CSV</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadSurveys(true)}
            disabled={refreshing || loading}
            className="rounded-xl border-gray-200 hover:bg-gray-50 text-gray-700 font-bold text-xs h-9 px-3.5 flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <RefreshCcw size={14} className={cn(refreshing && "animate-spin text-blue-600")} />
            <span>Obnovit</span>
          </Button>
        </div>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        <Card className="rounded-2xl border-gray-200/80 shadow-xs bg-white p-4 sm:p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 shadow-inner">
            <Users size={22} />
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
            <GraduationCap size={22} />
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
            <School size={22} />
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
              <Share2 size={16} className="text-blue-600" />
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
              <GraduationCap size={16} className="text-purple-600" />
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
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-400">
                    Načítání výsledků dotazníků...
                  </td>
                </tr>
              ) : filteredSurveys.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-400">
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
                    <td className="py-3 px-4 text-gray-900 font-bold whitespace-nowrap">
                      {item.userEmail || item.userId || 'Student'}
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
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}