import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { 
  Search, FileText, Filter, GraduationCap, Lock, Sparkles, 
  BookOpen, Eye, ArrowRight, X, Download 
} from 'lucide-react';
import { Input } from '../components/ui/input';
import { motion } from 'motion/react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Link } from 'react-router-dom';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { getAllMaterials, ExistingMaterialItem } from '../services/practiceService';

export default function LearningSheets() {
  const { user, openAuthModal } = useAuth();
  const [materials, setMaterials] = useState<ExistingMaterialItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedTopic, setSelectedTopic] = useState<string>('Vše');
  const [selectedSubject, setSelectedSubject] = useState<string>('Vše');
  const [previewMaterial, setPreviewMaterial] = useState<ExistingMaterialItem | null>(null);

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
          initial={{ opacity: 0, y: -20 }} 
          animate={{ opacity: 1, y: 0 }} 
          className="text-4xl md:text-5xl lg:text-6xl font-display font-black text-[#1E1B18]"
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
                  <GraduationCap size={16} className="text-amber-600" />
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
        <div className={cn("transition-all", !user && "filter blur-md select-none pointer-events-none opacity-50")}>
          {loading ? (
            <div className="text-center py-24 bg-white/60 rounded-[2.5rem]">
              <div className="w-10 h-10 border-4 border-[#1E1B18] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-gray-500 font-bold text-sm">Načítání výukových listů...</p>
            </div>
          ) : filteredMaterials.length === 0 ? (
            <div className="text-center py-24 bg-white/60 rounded-[2.5rem] border-2 border-dashed border-gray-200">
              <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-amber-600">
                <FileText size={32} />
              </div>
              <h3 className="text-xl font-display font-bold text-gray-900 mb-1">Žádné materiály nenalezeny</h3>
              <p className="text-gray-400 text-sm font-medium">
                {search ? 'Zkuste upravit vyhledávací dotaz.' : 'Pro zvolený filtr zatím nejsou k dispozici studijní materiály.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredMaterials.map(mat => {
                const hasSvg = Boolean(mat.svgUrl || mat.svgContent);

                return (
                  <motion.div
                    key={mat.id}
                    whileHover={{ y: -3 }}
                    className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm hover:shadow-lg transition-all flex flex-col justify-between gap-5 group"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-md ${
                          mat.subject === 'Matematika' 
                            ? 'bg-teal-50 text-teal-800 border border-teal-100' 
                            : 'bg-rose-50 text-rose-800 border border-rose-100'
                        }`}>
                          {mat.subject}
                        </span>
                      </div>

                      <div>
                        <h4 className="font-display font-black text-lg text-gray-900 group-hover:text-amber-900 transition-colors line-clamp-2">
                          {mat.title}
                        </h4>
                        {mat.topic && (
                          <p className="text-xs text-gray-400 font-bold mt-1">
                            Téma: {mat.topic}
                          </p>
                        )}
                      </div>

                      {mat.studyTheory && (
                        <p className="text-xs text-gray-600 font-medium line-clamp-3 bg-gray-50/80 p-3 rounded-2xl leading-relaxed">
                          {mat.studyTheory}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                      {hasSvg && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPreviewMaterial(mat)}
                          className="flex-1 rounded-xl h-10 text-xs font-bold border-gray-200 hover:border-black flex items-center justify-center gap-1.5 cursor-pointer bg-white"
                        >
                          <Eye size={14} />
                          <span>Náhled</span>
                        </Button>
                      )}

                      <Link to={`/study/${mat.id}`} className="flex-1">
                        <Button
                          size="sm"
                          className="w-full rounded-xl bg-[#1E1B18] hover:bg-[#332f2b] text-white font-bold text-xs h-10 flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                        >
                          <BookOpen size={14} />
                          <span>Studovat</span>
                        </Button>
                      </Link>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* Locked state overlay for non-authenticated visitors */}
        {!user && (
          <div className="absolute inset-0 flex items-center justify-center p-4 z-20 pointer-events-auto">
            <div className="bg-white/95 backdrop-blur-xl border border-gray-100 shadow-3xl rounded-[2.5rem] p-8 md:p-12 max-w-lg w-full text-center space-y-6">
              <div className="w-20 h-20 bg-amber-50 border border-amber-200/60 rounded-3xl mx-auto flex items-center justify-center text-amber-600 shadow-inner">
                <Lock size={36} />
              </div>
              <div className="space-y-2">
                <span className="px-3.5 py-1 bg-amber-100/80 text-amber-900 text-[11px] font-black uppercase tracking-widest rounded-full">
                  Výukové materiály
                </span>
                <h3 className="text-3xl md:text-4xl font-display font-black text-[#1E1B18] tracking-tight">
                  Odemkni si materiály
                </h3>
                <p className="text-gray-500 font-medium text-sm md:text-base leading-relaxed">
                  Získej přístup k přehledům látky, tahákům z PDF a výukovým listům pro přípravu na zkoušky.
                </p>
              </div>
              <div className="pt-2">
                <Button
                  onClick={openAuthModal}
                  className="w-full h-14 rounded-2xl bg-[#1E1B18] text-[#FAF7F0] hover:bg-[#332f2b] text-base font-black shadow-lg transition-transform hover:scale-[1.02] flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Sparkles size={18} className="text-yellow-400" />
                  Přihlásit se pro přístup
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SVG Preview Modal */}
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
              ) : null}
            </div>

            <div className="px-6 py-3 bg-white border-t border-gray-100 flex items-center justify-between">
              <Link to={`/study/${previewMaterial.id}`}>
                <Button className="rounded-xl font-bold text-xs bg-[#1E1B18] text-white">
                  Přejít na kompletní výklad
                </Button>
              </Link>
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
