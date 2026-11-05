import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { 
  Search, Filter, 
  Eye, X, Download
} from 'lucide-react';
import {
  CapIcon,
  BookCyanIcon,
  MaterialYellowIcon,
} from '../components/common/CustomIcon';
import { Input } from '../components/ui/input';
import { motion } from 'motion/react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';
import { sanitizeSvg } from '../utils/svgUtils';
import { downloadMaterialAsPdf } from '../utils/pdfToSvg';
import { useAuth } from '../context/AuthContext';
import { getAllMaterials, ExistingMaterialItem } from '../services/practiceService';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { toast } from 'sonner';
import UnifiedPaywallModal from '../components/common/UnifiedPaywallModal';
import { trackSectionClick } from '../services/analyticsService';

export default function LearningSheets() {
  const { user, isPremium } = useAuth();
  const navigate = useNavigate();
  const [materials, setMaterials] = useState<ExistingMaterialItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedTopic, setSelectedTopic] = useState<string>('Vše');
  const [selectedSubject, setSelectedSubject] = useState<string>('Vše');
  const [previewMaterial, setPreviewMaterial] = useState<ExistingMaterialItem | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [isPaywallDismissed, setIsPaywallDismissed] = useState(false);

  const handleDownload = async (mat: ExistingMaterialItem) => {
    if (downloadingId === mat.id) return;
    trackSectionClick('material_download_click', `/learning`, {
      materialId: mat.id,
      title: mat.title,
      subject: mat.subject
    });
    setDownloadingId(mat.id);
    try {
      await downloadMaterialAsPdf({
        title: mat.title,
        pdfUrl: mat.pdfUrl,
        fileUrl: mat.fileUrl,
        svgUrl: mat.svgUrl,
        svgContent: mat.svgContent
      });
      toast.success(`PDF „${mat.title}“ bylo staženo.`);
    } catch (err: any) {
      console.error('Failed to download PDF:', err);
      toast.error(err?.message || 'Nepodařilo se stáhnout PDF soubor.');
    } finally {
      setDownloadingId(null);
    }
  };

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const items = await getAllMaterials();
        setMaterials(items);
      } catch (err) {
        console.error('Failed to load learning sheets:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const topicsList = Array.from(new Set(materials.map(m => m.topic).filter(Boolean)));

  const filteredMaterials = materials.filter(m => {
    const matchesSubject = selectedSubject === 'Vše' || m.subject === selectedSubject;
    const matchesTopic = selectedTopic === 'Vše' || m.topic === selectedTopic;
    const q = search.toLowerCase().trim();
    const matchesSearch = !q || 
      m.title.toLowerCase().includes(q) || 
      (m.topic && m.topic.toLowerCase().includes(q)) ||
      (m.studyTheory && m.studyTheory.toLowerCase().includes(q));
    return matchesSubject && matchesTopic && matchesSearch;
  });

  return (
    <div className="page-container space-y-8 pb-16">
      <section className="text-center space-y-4 max-w-3xl mx-auto">
        <motion.h1 
          initial={{ opacity: 0, y: -15 }} 
          animate={{ opacity: 1, y: 0 }} 
          className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-playful text-gray-700 tracking-tight"
        >
          Výukové materiály
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          transition={{ delay: 0.1 }} 
          className="text-base md:text-lg text-gray-500 leading-relaxed"
        >
          Přehledné grafické listy, shrnutí látky z PDF a taháky pro přípravu na přijímačky.
        </motion.p>

        {/* Search & Filter Bar */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex flex-col sm:flex-row gap-3 justify-center mt-6 max-w-4xl mx-auto flex-wrap items-center relative z-10"
        >
          <div className="w-full sm:w-auto flex-1 flex gap-2 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 z-10" size={18} />
            <Input 
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Hledat v materiálech..."
              className="pl-11 h-12 rounded-2xl border-none bg-white shadow-md focus:outline-none focus:ring-2 focus:ring-amber-500/20 font-bold placeholder:text-gray-400 text-sm"
            />
          </div>

          <div className="w-full sm:w-44 text-left">
            <Select value={selectedSubject} onValueChange={(val: any) => setSelectedSubject(val)}>
              <SelectTrigger className="h-12 rounded-2xl border-none bg-white shadow-md font-bold text-gray-700 px-4 text-xs">
                <div className="flex items-center gap-2">
                  <CapIcon size={17} />
                  <SelectValue placeholder="Předmět" />
                </div>
              </SelectTrigger>
              <SelectContent className="rounded-2xl">
                <SelectItem value="Vše" className="font-bold">Všechny předměty</SelectItem>
                <SelectItem value="Matematika" className="font-bold">Matematika</SelectItem>
                <SelectItem value="Čeština" className="font-bold">Čeština</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="w-full sm:w-48 text-left">
            <Select value={selectedTopic} onValueChange={(val: any) => setSelectedTopic(val)}>
              <SelectTrigger className="h-12 rounded-2xl border-none bg-white shadow-md font-bold text-gray-700 px-4 text-xs">
                <div className="flex items-center gap-2">
                  <Filter size={16} className="text-amber-600" />
                  <SelectValue placeholder="Téma" />
                </div>
              </SelectTrigger>
              <SelectContent className="rounded-2xl">
                <SelectItem value="Vše" className="font-bold">Všechna témata</SelectItem>
                {topicsList.map(t => (
                  <SelectItem key={t} value={t} className="font-bold">{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </motion.div>
      </section>

      {/* Main Content Area */}
      <div className="relative max-w-6xl mx-auto">
        <div className={cn("transition-all", !isPremium && "filter blur-sm select-none pointer-events-none")}>
          {loading ? (
            <div className="text-center py-24 bg-white/60 rounded-[2.5rem]">
              <div className="w-10 h-10 border-4 border-[#1E1B18] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-gray-500 font-bold text-sm">Načítání výukových listů...</p>
            </div>
          ) : filteredMaterials.length === 0 ? (
            <div className="text-center py-24 bg-white/60 rounded-[2.5rem] border-2 border-dashed border-gray-200">
              <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-amber-600">
                <BookCyanIcon size={34} />
              </div>
              <h3 className="text-xl font-display font-bold text-gray-900 mb-1">Žádné materiály nenalezeny</h3>
              <p className="text-gray-400 text-sm font-medium">
                {search ? 'Zkuste upravit vyhledávací dotaz.' : 'Pro zvolený filtr zatím nejsou k dispozici studijní materiály.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredMaterials.map((mat, index) => {
                const hasSvg = Boolean(mat.svgUrl || mat.svgContent);
                const hasTheoryText = Boolean(mat.studyTheory && !mat.studyTheory.includes('<svg'));

                return (
                  <motion.div
                    key={mat.id}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    whileHover={{ y: -4 }}
                    className="bg-white rounded-[2.5rem] p-5 sm:p-6 border border-gray-200/80 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col justify-between gap-4 group"
                  >
                    <div className="space-y-3.5">
                      {/* Vizuální obrázkový náhled první strany listu */}
                      <div 
                        onClick={() => {
                          if (hasSvg) {
                            trackSectionClick('material_thumbnail_click', `/study/${mat.id}`, {
                              materialId: mat.id,
                              title: mat.title,
                              subject: mat.subject
                            });
                            setPreviewMaterial(mat);
                          }
                        }}
                        className={cn(
                          "w-full h-44 sm:h-48 rounded-2xl overflow-hidden bg-slate-50 border border-gray-100 relative flex items-center justify-center transition-all duration-300 shadow-2xs group-hover:shadow-sm",
                          hasSvg ? "cursor-pointer" : "cursor-default"
                        )}
                      >
                        {mat.thumbnailUrl ? (
                          <img 
                            src={mat.thumbnailUrl} 
                            alt={mat.title} 
                            className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-300" 
                            loading="lazy"
                          />
                        ) : mat.svgUrl ? (
                          <img 
                            src={mat.svgUrl} 
                            alt={mat.title} 
                            className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-300" 
                            loading="lazy"
                          />
                        ) : mat.svgContent ? (
                          <div 
                            className="w-full h-full flex items-center justify-center p-2 overflow-hidden pointer-events-none group-hover:scale-105 transition-transform duration-300 [&>svg]:max-w-full [&>svg]:max-h-full [&>svg]:h-auto [&>svg]:w-auto"
                            dangerouslySetInnerHTML={{ __html: sanitizeSvg(mat.svgContent) }}
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center gap-2 text-gray-400 p-4 text-center">
                            <div className={cn(
                              "w-12 h-12 rounded-2xl flex items-center justify-center shadow-xs",
                              mat.subject === 'Matematika' ? "bg-teal-50 text-teal-600" : "bg-rose-50 text-rose-600"
                            )}>
                              <BookCyanIcon size={24} />
                            </div>
                            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                              Výukový přehled
                            </span>
                          </div>
                        )}

                        {/* Hover Overlay s ikonou oka pro zvětšení náhledu */}
                        {hasSvg && (
                          <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <span className="bg-white/95 text-gray-900 px-3 py-1.5 rounded-xl text-xs font-black shadow-md flex items-center gap-1.5 backdrop-blur-xs">
                              <Eye size={13} /> Zvětšit náhled
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-md ${
                            mat.subject === 'Matematika' 
                              ? 'bg-teal-50 text-teal-800 border border-teal-100' 
                              : 'bg-rose-50 text-rose-800 border border-rose-100'
                          }`}>
                            {mat.subject}
                          </span>
                          {mat.topic && (
                            <span className="text-[11px] text-gray-400 font-bold truncate max-w-[150px]">
                              {mat.topic}
                            </span>
                          )}
                        </div>

                        <h4 className="font-display font-black text-base sm:text-lg text-[#1E1B18] line-clamp-2">
                          {mat.title}
                        </h4>

                        {hasTheoryText && (
                          <p className="text-xs text-gray-600 font-medium line-clamp-2 bg-gray-50/80 p-2.5 rounded-xl leading-relaxed">
                            {mat.studyTheory}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                      {hasSvg && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            trackSectionClick('material_preview_click', `/study/${mat.id}`, {
                              materialId: mat.id,
                              title: mat.title,
                              subject: mat.subject
                            });
                            setPreviewMaterial(mat);
                          }}
                          className="flex-1 rounded-xl h-10 text-xs font-bold border-gray-200 hover:border-black flex items-center justify-center gap-1.5 cursor-pointer bg-white transition-all"
                        >
                          <Eye size={14} />
                          <span>Náhled</span>
                        </Button>
                      )}

                      <Button
                        size="sm"
                        onClick={() => handleDownload(mat)}
                        disabled={downloadingId === mat.id}
                        className="flex-1 rounded-xl bg-[#B9D8FC] hover:bg-[#A3CCFA] text-[#0F2942] font-black text-xs h-10 px-4 flex items-center justify-center gap-1.5 shadow-xs border border-blue-200/80 hover:scale-105 transition-transform cursor-pointer"
                      >
                        <Download size={14} className="text-[#0F2942]" />
                        <span>{downloadingId === mat.id ? 'Stahuji...' : 'Stáhnout'}</span>
                      </Button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* SVG Preview Modal */}
      {previewMaterial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <MaterialYellowIcon size={20} />
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
              {previewMaterial.svgUrl ? (
                <img 
                  src={previewMaterial.svgUrl} 
                  alt={previewMaterial.title || "Náhled"} 
                  className="max-w-full max-h-[70vh] object-contain rounded-xl shadow-md bg-white p-2" 
                />
              ) : previewMaterial.svgContent ? (
                <div 
                  className="max-w-full bg-white shadow-md rounded-xl overflow-hidden p-2"
                  dangerouslySetInnerHTML={{ __html: sanitizeSvg(previewMaterial.svgContent) }}
                />
              ) : null}
            </div>

            <div className="px-6 py-3 bg-white border-t border-gray-100 flex items-center justify-between">
              <Button
                onClick={() => handleDownload(previewMaterial)}
                disabled={downloadingId === previewMaterial.id}
                className="rounded-xl bg-[#B9D8FC] hover:bg-[#A3CCFA] text-[#0F2942] font-black text-xs h-10 px-5 flex items-center justify-center gap-1.5 shadow-xs border border-blue-200/80 hover:scale-105 transition-transform cursor-pointer"
              >
                <Download size={14} className="text-[#0F2942]" />
                <span>{downloadingId === previewMaterial.id ? 'Stahuji...' : 'Stáhnout'}</span>
              </Button>
              <Button
                variant="outline"
                onClick={() => setPreviewMaterial(null)}
                className="rounded-xl font-bold text-xs cursor-pointer"
              >
                Zavřít
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Sjednocený Paywall modal se zešedlým pozadím pro uživatele bez Premium */}
      <UnifiedPaywallModal
        isOpen={!isPremium && !isPaywallDismissed}
        onClose={() => {
          setIsPaywallDismissed(true);
          navigate('/practice');
        }}
        type="premium"
        description="Kompletní výukové listy, grafické přehledy látky, taháky a vzorové postupy k přijímačkám z matematiky i češtiny jsou dostupné v rámci předplatného Premium."
      />
    </div>
  );
}
