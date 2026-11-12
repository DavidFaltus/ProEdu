import React, { useState, useEffect, useMemo } from 'react';
import { 
  Bug, 
  Search, 
  RefreshCcw, 
  ExternalLink, 
  Mail, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Trash2, 
  Filter, 
  Monitor, 
  Image as ImageIcon, 
  Maximize2, 
  X, 
  MessageSquare, 
  Check, 
  HelpCircle, 
  Cpu, 
  Type, 
  Lightbulb, 
  MoreHorizontal,
  FileQuestion,
  ChevronDown
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../ui/dialog';
import { BugReport, BugReportStatus, BugReportCategory } from '../../types/bugReport';
import { 
  getBugReports, 
  updateBugReportStatus, 
  deleteBugReport, 
  getCategoryLabel 
} from '../../services/bugReportService';
import { toast } from 'sonner';

export default function BugReportsManager() {
  const [reports, setReports] = useState<BugReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filtry
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | BugReportStatus>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | BugReportCategory>('all');

  // Modály
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [reportToDelete, setReportToDelete] = useState<BugReport | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Editace poznámky
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [notesText, setNotesText] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  const loadReports = async (isManual = false) => {
    if (isManual) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const data = await getBugReports();
      setReports(data);
    } catch (err: any) {
      console.error('Chyba při načítání hlášení:', err);
      toast.error('Nepodařilo se načíst hlášení chyb.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  const handleStatusChange = async (reportId: string, newStatus: BugReportStatus) => {
    try {
      await updateBugReportStatus(reportId, newStatus);
      setReports(prev => prev.map(r => r.id === reportId ? { ...r, status: newStatus } : r));
      toast.success(
        newStatus === 'resolved' 
          ? 'Hlášení bylo označeno jako vyřešené.' 
          : newStatus === 'in_progress' 
          ? 'Stav změněn na V řešení.' 
          : 'Hlášení bylo vráceno mezi nové.'
      );
    } catch (err: any) {
      console.error('Chyba při změně stavu:', err);
      toast.error('Nepodařilo se změnit stav hlášení.');
    }
  };

  const handleSaveNotes = async (reportId: string) => {
    setSavingNotes(true);
    try {
      await updateBugReportStatus(reportId, reports.find(r => r.id === reportId)?.status || 'pending', notesText);
      setReports(prev => prev.map(r => r.id === reportId ? { ...r, resolutionNotes: notesText } : r));
      setEditingNotesId(null);
      toast.success('Interní poznámka byla uložena.');
    } catch (err: any) {
      console.error('Chyba při ukládání poznámky:', err);
      toast.error('Nepodařilo se uložit poznámku.');
    } finally {
      setSavingNotes(false);
    }
  };

  const handleDelete = async () => {
    if (!reportToDelete) return;
    setDeleting(true);
    try {
      await deleteBugReport(reportToDelete.id);
      setReports(prev => prev.filter(r => r.id !== reportToDelete.id));
      toast.success('Hlášení chyby bylo smazáno.');
      setReportToDelete(null);
    } catch (err: any) {
      console.error('Chyba při mazání:', err);
      toast.error('Nepodařilo se smazat hlášení.');
    } finally {
      setDeleting(false);
    }
  };

  // Statistiky
  const stats = useMemo(() => {
    const total = reports.length;
    const pending = reports.filter(r => r.status === 'pending').length;
    const inProgress = reports.filter(r => r.status === 'in_progress').length;
    const resolved = reports.filter(r => r.status === 'resolved').length;
    return { total, pending, inProgress, resolved };
  }, [reports]);

  // Filtrování
  const filteredReports = useMemo(() => {
    return reports.filter(report => {
      // Filtr stavu
      if (statusFilter !== 'all' && report.status !== statusFilter) {
        return false;
      }
      // Filtr kategorie
      if (categoryFilter !== 'all' && report.category !== categoryFilter) {
        return false;
      }
      // Vyhledávání
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = (report.userName || '').toLowerCase().includes(q);
        const matchesEmail = (report.userEmail || '').toLowerCase().includes(q);
        const matchesDesc = (report.description || '').toLowerCase().includes(q);
        const matchesUrl = (report.pageUrl || '').toLowerCase().includes(q);
        const matchesNotes = (report.resolutionNotes || '').toLowerCase().includes(q);
        return matchesName || matchesEmail || matchesDesc || matchesUrl || matchesNotes;
      }
      return true;
    });
  }, [reports, statusFilter, categoryFilter, searchQuery]);

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'Neuvedeno';
    let date: Date | null = null;
    if (timestamp.toDate && typeof timestamp.toDate === 'function') {
      date = timestamp.toDate();
    } else if (timestamp.seconds) {
      date = new Date(timestamp.seconds * 1000);
    } else if (timestamp._seconds) {
      date = new Date(timestamp._seconds * 1000);
    } else if (typeof timestamp === 'string' || typeof timestamp === 'number') {
      date = new Date(timestamp);
    }

    if (!date || isNaN(date.getTime())) return 'Nedávno';

    return date.toLocaleString('cs-CZ', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getCategoryBadge = (category: BugReportCategory) => {
    switch (category) {
      case 'question':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200/80">
            <HelpCircle size={13} className="text-amber-600" />
            Otázka / Zadání
          </span>
        );
      case 'technical':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-rose-50 text-rose-800 border border-rose-200/80">
            <Cpu size={13} className="text-rose-600" />
            Technická chyba
          </span>
        );
      case 'visual':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-purple-50 text-purple-800 border border-purple-200/80">
            <Type size={13} className="text-purple-600" />
            Vzhled / Text
          </span>
        );
      case 'improvement':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200/80">
            <Lightbulb size={13} className="text-emerald-600" />
            Návrh na zlepšení
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-gray-100 text-gray-700 border border-gray-200">
            <MoreHorizontal size={13} className="text-gray-500" />
            Jiné
          </span>
        );
    }
  };

  const getStatusBadge = (status: BugReportStatus) => {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-rose-500 text-white shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
            Nové
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-blue-600 text-white shadow-xs">
            <Clock size={12} />
            V řešení
          </span>
        );
      case 'resolved':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-600 text-white shadow-xs">
            <CheckCircle2 size={12} />
            Vyřešeno
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-rose-50 via-amber-50 to-white p-5 sm:p-6 rounded-3xl border border-rose-100/80 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-rose-500 text-white flex items-center justify-center shadow-lg shadow-rose-500/25">
            <Bug size={24} />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-[#0F2942] tracking-tight">Hlášení chyb od studentů</h1>
            <p className="text-xs sm:text-sm text-gray-500 font-medium">
              Všechna hlášení chyb, překlepů a technických problémů nahlášených studenty
            </p>
          </div>
        </div>

        <button
          onClick={() => loadReports(true)}
          disabled={refreshing || loading}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-gray-50 active:scale-95 text-gray-700 font-bold text-xs sm:text-sm rounded-2xl border border-gray-200/80 shadow-xs transition-all cursor-pointer self-start sm:self-auto"
        >
          <RefreshCcw size={15} className={refreshing ? 'animate-spin text-rose-600' : ''} />
          <span>{refreshing ? 'Aktualizuji...' : 'Obnovit'}</span>
        </button>
      </div>

      {/* Statistické karty */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
        <div 
          onClick={() => setStatusFilter('all')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'all'
              ? 'bg-white border-[#0F2942] ring-2 ring-[#0F2942]/10 shadow-sm'
              : 'bg-white border-gray-100 hover:border-gray-200'
          }`}
        >
          <p className="text-[11px] font-black uppercase tracking-wider text-gray-400">Celkem reportů</p>
          <p className="text-2xl sm:text-3xl font-black text-[#0F2942] mt-1">{stats.total}</p>
        </div>

        <div 
          onClick={() => setStatusFilter('pending')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'pending'
              ? 'bg-rose-50/60 border-rose-500 ring-2 ring-rose-500/20 shadow-sm'
              : 'bg-white border-gray-100 hover:border-rose-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-black uppercase tracking-wider text-rose-600">Nové k řešení</p>
            {stats.pending > 0 && (
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            )}
          </div>
          <p className="text-2xl sm:text-3xl font-black text-rose-600 mt-1">{stats.pending}</p>
        </div>

        <div 
          onClick={() => setStatusFilter('in_progress')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'in_progress'
              ? 'bg-blue-50/60 border-blue-500 ring-2 ring-blue-500/20 shadow-sm'
              : 'bg-white border-gray-100 hover:border-blue-200'
          }`}
        >
          <p className="text-[11px] font-black uppercase tracking-wider text-blue-600">V řešení</p>
          <p className="text-2xl sm:text-3xl font-black text-blue-600 mt-1">{stats.inProgress}</p>
        </div>

        <div 
          onClick={() => setStatusFilter('resolved')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'resolved'
              ? 'bg-emerald-50/60 border-emerald-500 ring-2 ring-emerald-500/20 shadow-sm'
              : 'bg-white border-gray-100 hover:border-emerald-200'
          }`}
        >
          <p className="text-[11px] font-black uppercase tracking-wider text-emerald-600">Vyřešeno</p>
          <p className="text-2xl sm:text-3xl font-black text-emerald-600 mt-1">{stats.resolved}</p>
        </div>
      </div>

      {/* Ovládací lišta: Hledání a filtry */}
      <div className="bg-white p-4 sm:p-5 rounded-3xl border border-gray-100 shadow-xs space-y-3.5">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Vyhledávací pole */}
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Hledat podle studenta, e-mailu, popisu nebo URL..."
              className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm rounded-2xl border border-gray-200 bg-gray-50/60 focus:bg-white focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 outline-none transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Filtr kategorie */}
          <div className="sm:w-60">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as any)}
              className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-2xl border border-gray-200 bg-gray-50/60 focus:bg-white focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 outline-none transition-all font-bold text-gray-700"
            >
              <option value="all">Všechny kategorie</option>
              <option value="question">📝 Otázka / Zadání</option>
              <option value="technical">⚡ Technická chyba</option>
              <option value="visual">🎨 Vzhled / Překlep</option>
              <option value="improvement">💡 Návrh na zlepšení</option>
              <option value="other">📌 Jiné</option>
            </select>
          </div>
        </div>

        {/* Přepínač stavu (Chips) */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-gray-100">
          <span className="text-xs font-black uppercase tracking-wider text-gray-400 mr-1 flex items-center gap-1">
            <Filter size={12} />
            Stav:
          </span>
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-[#0F2942] text-white shadow-xs'
                : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
            }`}
          >
            Všechny ({stats.total})
          </button>
          <button
            onClick={() => setStatusFilter('pending')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'pending'
                ? 'bg-rose-500 text-white shadow-xs'
                : 'bg-rose-50 hover:bg-rose-100 text-rose-700'
            }`}
          >
            Nové ({stats.pending})
          </button>
          <button
            onClick={() => setStatusFilter('in_progress')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'in_progress'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-blue-50 hover:bg-blue-100 text-blue-700'
            }`}
          >
            V řešení ({stats.inProgress})
          </button>
          <button
            onClick={() => setStatusFilter('resolved')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'resolved'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
            }`}
          >
            Vyřešeno ({stats.resolved})
          </button>
        </div>
      </div>

      {/* Seznam reportů */}
      {loading ? (
        <div className="p-12 text-center bg-white rounded-3xl border border-gray-100 shadow-xs">
          <div className="w-10 h-10 border-3 border-rose-500/20 border-t-rose-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm font-bold text-gray-500">Načítám hlášení chyb...</p>
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-3xl border border-gray-100 shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 size={28} className="text-emerald-500" />
          </div>
          <h3 className="text-base font-black text-[#0F2942]">Žádná hlášení nenalezena</h3>
          <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
            {searchQuery || statusFilter !== 'all' || categoryFilter !== 'all'
              ? 'Žádné hlášení neodpovídá zvoleným filtrům.'
              : 'Vše je v pořádku, žádný student zatím nenahlásil žádný problém.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredReports.map((report) => (
            <div
              key={report.id}
              className={`bg-white rounded-3xl border transition-all overflow-hidden ${
                report.status === 'pending'
                  ? 'border-rose-200/80 shadow-md shadow-rose-500/5'
                  : report.status === 'in_progress'
                  ? 'border-blue-200/80 shadow-sm'
                  : 'border-gray-100/90 shadow-xs opacity-90'
              }`}
            >
              {/* Karta - Header */}
              <div className="p-5 sm:p-6 border-b border-gray-100 bg-gray-50/40 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  {getStatusBadge(report.status)}
                  {getCategoryBadge(report.category)}
                  <span className="text-xs text-gray-400 font-medium">
                    {formatDate(report.createdAt)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {/* Změna stavu */}
                  <select
                    value={report.status}
                    onChange={(e) => handleStatusChange(report.id, e.target.value as BugReportStatus)}
                    className="text-xs font-black px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-gray-700 outline-none cursor-pointer hover:border-gray-300 transition-all"
                  >
                    <option value="pending">⏳ Nové</option>
                    <option value="in_progress">🔧 V řešení</option>
                    <option value="resolved">✅ Vyřešeno</option>
                  </select>

                  {/* Smazat */}
                  <button
                    onClick={() => setReportToDelete(report)}
                    className="p-1.5 rounded-xl text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer"
                    title="Smazat hlášení"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {/* Karta - Obsah */}
              <div className="p-5 sm:p-6 space-y-4">
                {/* Popis problému */}
                <div className="bg-[#FAF7F0] p-4 rounded-2xl border border-amber-200/50">
                  <p className="text-xs font-black uppercase tracking-wider text-gray-400 mb-1">
                    Popis nahlášené chyby:
                  </p>
                  <p className="text-sm font-semibold text-[#1E1B18] whitespace-pre-wrap leading-relaxed">
                    {report.description}
                  </p>
                </div>

                {/* Screenshot (pokud je přiložen) */}
                {report.screenshotUrl && (
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1.5">
                      <ImageIcon size={14} />
                      Přiložený snímek obrazovky:
                    </p>
                    <div className="relative inline-block border border-gray-200 rounded-2xl overflow-hidden group cursor-pointer bg-gray-900">
                      <img
                        src={report.screenshotUrl}
                        alt="Screenshot chyby"
                        onClick={() => setPreviewImage(report.screenshotUrl || null)}
                        className="max-h-48 max-w-full sm:max-w-md object-contain rounded-2xl transition-transform group-hover:scale-102"
                      />
                      <button
                        onClick={() => setPreviewImage(report.screenshotUrl || null)}
                        className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-bold text-xs gap-1.5"
                      >
                        <Maximize2 size={16} />
                        Zvětšit obrázek
                      </button>
                    </div>
                  </div>
                )}

                {/* Metadata & Odesílatel */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 text-xs">
                  <div className="space-y-1.5 p-3 rounded-2xl bg-gray-50 border border-gray-100">
                    <p className="font-bold text-gray-500 uppercase tracking-wider text-[10px]">Odesílatel</p>
                    <p className="font-bold text-[#0F2942]">
                      {report.userName} ({report.userEmail})
                    </p>
                    <div className="pt-1">
                      <a
                        href={`mailto:${report.userEmail}?subject=Re:%20Va%C5%A1e%20hl%C3%A1%C5%A1en%C3%AD%20chyby%20v%20ProEdu`}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-600 hover:text-rose-700 hover:underline"
                      >
                        <Mail size={13} />
                        Odpovědět studentovi na e-mail
                      </a>
                    </div>
                  </div>

                  <div className="space-y-1.5 p-3 rounded-2xl bg-gray-50 border border-gray-100">
                    <p className="font-bold text-gray-500 uppercase tracking-wider text-[10px]">Lokalita a zařízení</p>
                    <div className="flex items-center gap-1">
                      <span className="text-gray-500">URL:</span>
                      <a
                        href={report.pageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-blue-600 hover:underline truncate inline-flex items-center gap-1"
                        title={report.pageUrl}
                      >
                        {report.pageUrl}
                        <ExternalLink size={11} className="shrink-0" />
                      </a>
                    </div>
                    {report.screenResolution && (
                      <p className="text-gray-500">
                        Rozlišení: <span className="font-mono text-gray-700">{report.screenResolution}</span>
                      </p>
                    )}
                  </div>
                </div>

                {/* Interní poznámka učitele */}
                <div className="pt-2 border-t border-gray-100">
                  {editingNotesId === report.id ? (
                    <div className="space-y-2">
                      <label className="text-xs font-black uppercase tracking-wider text-gray-500">
                        Interní poznámka k řešení
                      </label>
                      <textarea
                        value={notesText}
                        onChange={(e) => setNotesText(e.target.value)}
                        placeholder="Zapište si sem, jak byla chyba vyřešena, nebo poznámku pro ostatní..."
                        rows={2}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-gray-200 outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleSaveNotes(report.id)}
                          disabled={savingNotes}
                          className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                        >
                          {savingNotes ? 'Ukládám...' : 'Uložit poznámku'}
                        </button>
                        <button
                          onClick={() => setEditingNotesId(null)}
                          className="px-3 py-1.5 border border-gray-200 text-gray-600 rounded-xl text-xs font-bold hover:bg-gray-50 transition-all cursor-pointer"
                        >
                          Zrušit
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                          Interní poznámka:
                        </p>
                        <p className="text-xs text-gray-600 italic">
                          {report.resolutionNotes || 'Žádná interní poznámka nezadána.'}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setEditingNotesId(report.id);
                          setNotesText(report.resolutionNotes || '');
                        }}
                        className="text-xs font-bold text-gray-400 hover:text-gray-700 transition-colors shrink-0"
                      >
                        {report.resolutionNotes ? 'Upravit' : '+ Přidat poznámku'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox Modal pro zvětšení screenshotu */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-12 right-0 p-2 text-white/80 hover:text-white rounded-full bg-white/10 hover:bg-white/20 transition-all cursor-pointer"
              title="Zavřít"
            >
              <X size={22} />
            </button>
            <img 
              src={previewImage} 
              alt="Zvětšený snímek obrazovky" 
              className="max-h-[85vh] max-w-full rounded-2xl object-contain shadow-2xl border border-white/10"
            />
            <a
              href={previewImage}
              target="_blank"
              rel="noreferrer"
              className="mt-3 text-xs text-white/80 hover:text-white underline inline-flex items-center gap-1"
            >
              Otevřít v novém okně v plném rozlišení <ExternalLink size={12} />
            </a>
          </div>
        </div>
      )}

      {/* Dialog pro potvrzení smazání */}
      <Dialog open={Boolean(reportToDelete)} onOpenChange={(open) => !open && setReportToDelete(null)}>
        <DialogContent className="max-w-md rounded-3xl p-6 bg-white text-[#1E1B18]">
          <DialogTitle className="text-lg font-black text-[#0F2942]">Smazat hlášení chyby?</DialogTitle>
          <DialogDescription className="text-xs text-gray-500 mt-2">
            Opravdu si přejete smazat toto hlášení od studenta <strong>{reportToDelete?.userName}</strong>? Tato akce je nevratná.
          </DialogDescription>
          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              onClick={() => setReportToDelete(null)}
              disabled={deleting}
              className="px-4 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-100 transition-all cursor-pointer"
            >
              Zrušit
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-xs font-black text-white shadow-md shadow-rose-600/20 transition-all cursor-pointer"
            >
              {deleting ? 'Mažu...' : 'Ano, smazat'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
