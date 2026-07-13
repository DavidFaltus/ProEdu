import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { LearningSheet, MathTopic } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { BookOpen, Search, FileText, Filter, GraduationCap, ArrowRight, Download, Loader2 } from 'lucide-react';
import { Input } from '../components/ui/input';
import { motion, AnimatePresence } from 'motion/react';
import { PDFViewer } from '../components/PDFViewer';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Link } from 'react-router-dom';

const MATH_TOPICS: (MathTopic | 'Vše')[] = [
  'Vše',
  'Aritmetika', 
  'Geometrie', 
  'Zlomky a procenta', 
  'Rovnice', 
  'Slovní úlohy', 
  'Jednotky a měření'
];

export default function LearningSheets() {
  const [sheets, setSheets] = useState<LearningSheet[]>([]);
  const [search, setSearch] = useState('');
  const [selectedTopic, setSelectedTopic] = useState<MathTopic | 'Vše'>('Vše');
  const [selectedSubject, setSelectedSubject] = useState<string | 'Vše'>('Vše');
  const [selectedSheet, setSelectedSheet] = useState<LearningSheet | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'learningSheets'), (snap) => {
      setSheets(snap.docs.map(d => ({ id: d.id, ...d.data() } as LearningSheet)));
    });
    return unsub;
  }, []);

  const allSubjects = useMemo(() => Array.from(new Set(sheets.map(s => s.subject).filter(Boolean))), [sheets]);
  const allTopics = useMemo(() => {
    const rawTopics = Array.from(new Set(sheets.map(s => s.topic).filter(Boolean)));
    return Array.from(new Set([...MATH_TOPICS.filter(t => t !== 'Vše'), ...rawTopics])).filter(Boolean);
  }, [sheets]);

  const filteredSheets = sheets.filter(s => {
    const matchesSearch = s.title.toLowerCase().includes(search.toLowerCase());
    const matchesTopic = selectedTopic === 'Vše' || s.topic === selectedTopic;
    const matchesSubject = selectedSubject === 'Vše' || s.subject === selectedSubject;
    return matchesSearch && matchesTopic && matchesSubject;
  });

  return (
    <div className="page-container">
      <section className="text-center space-y-6 max-w-3xl mx-auto">
        <motion.h1 initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-5xl md:text-6xl font-display font-black text-[#1E1B18]">
          Výukové materiály
        </motion.h1>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="text-xl text-gray-500 leading-relaxed">
          Přehled všech dostupných studijních listů a výukových materiálů.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex flex-col lg:flex-row gap-4 justify-center mt-8 max-w-6xl mx-auto flex-wrap items-center relative z-10"
        >
          <div className="w-full lg:w-auto flex-1 flex gap-2 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 z-10" size={20} />
            <Input 
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Hledat v materiálech..."
              className="pl-12 h-14 rounded-2xl border-none bg-white shadow-xl focus:outline-none focus:ring-2 focus:ring-[#B80053]/20 transition-all font-bold placeholder:text-gray-400"
            />
          </div>
          <div className="w-full lg:w-48 text-left">
            <Select value={selectedSubject} onValueChange={(val: any) => setSelectedSubject(val)}>
              <SelectTrigger className="h-14 rounded-2xl border-none bg-white shadow-xl font-bold text-gray-700 px-6">
                <div className="flex items-center gap-2">
                  <GraduationCap size={18} className="text-[#B80053]" />
                  <SelectValue placeholder="Filtrovat předmět" />
                </div>
              </SelectTrigger>
              <SelectContent className="rounded-2xl">
                <SelectItem value="Vše" className="font-bold">Všechny předměty</SelectItem>
                {allSubjects.map(subject => (
                  <SelectItem key={subject} value={subject} className="font-bold">{subject}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full lg:w-48 text-left">
            <Select value={selectedTopic} onValueChange={(val: any) => setSelectedTopic(val)}>
              <SelectTrigger className="h-14 rounded-2xl border-none bg-white shadow-xl font-bold text-gray-700 px-6">
                <div className="flex items-center gap-2">
                  <Filter size={18} className="text-[#B80053]" />
                  <SelectValue placeholder="Filtrovat téma" />
                </div>
              </SelectTrigger>
              <SelectContent className="rounded-2xl">
                <SelectItem value="Vše" className="font-bold">Všechna témata</SelectItem>
                {allTopics.map(topic => (
                  <SelectItem key={topic} value={topic} className="font-bold">{topic}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </motion.div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8 mt-12">
        <AnimatePresence mode="popLayout">
          {filteredSheets.map((sheet, i) => (
            <motion.div
              key={sheet.id}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card 
                onClick={() => setSelectedSheet(sheet)}
                className="rounded-[2.5rem] border-none shadow-xl hover:shadow-2xl transition-all cursor-pointer group h-full flex flex-col bg-white overflow-hidden"
              >
                <div className="h-3 bg-[#B80053]/10 group-hover:bg-[#B80053]/20 transition-colors" />
                <CardHeader className="p-8 pb-4">
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-14 h-14 bg-pink-50 rounded-2xl flex items-center justify-center text-[#B80053] group-hover:scale-110 transition-transform shadow-sm">
                      <FileText size={28} />
                    </div>
                    {sheet.topic && (
                      <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-[10px] font-black uppercase tracking-widest">
                        {sheet.topic}
                      </span>
                    )}
                  </div>
                  <CardTitle className="text-2xl font-display text-[#1E1B18] group-hover:text-[#B80053] transition-colors leading-tight">
                    {sheet.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-8 pt-0 flex-1">
                  <p className="text-gray-500 text-lg line-clamp-4 leading-relaxed">
                    Výukový materiál {sheet.subject} - {sheet.level}.
                  </p>
                </CardContent>
                <div className="px-8 py-6 bg-[#FAF7F0] border-t border-gray-100 text-sm font-black text-[#B80053] uppercase tracking-widest flex items-center justify-between">
                  Zobrazit detail
                  <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                </div>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {filteredSheets.length === 0 && (
        <div className="text-center py-32 bg-white/50 rounded-[3rem] border-2 border-dashed border-gray-100">
          <div className="w-20 h-20 bg-pink-50 rounded-full flex items-center justify-center mx-auto mb-6 text-[#B80053]">
            <Search size={40} />
          </div>
          <h3 className="text-2xl font-display font-bold text-gray-900 mb-2">Nic jsme nenašli</h3>
          <p className="text-gray-400 text-lg font-bold">Zkus upravit vyhledávání nebo filtr.</p>
        </div>
      )}

      <section className="bg-[#FAF7F0] rounded-[3rem] p-12 text-[#1E1B18] text-center space-y-8 relative overflow-hidden mt-12 border border-[#E6E0D4]">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/40 rounded-full -mr-32 -mt-32 blur-3xl" />
        <div className="relative z-10 space-y-4">
          <h2 className="text-4xl font-display font-bold">Nevíš si rady s výběrem?</h2>
          <p className="text-gray-600 text-xl max-w-xl mx-auto">Napiš nám a rádi ti poradíme, které materiály jsou pro tebe ty pravé.</p>
          <div className="pt-4">
            <Link to="/contact" className="inline-flex items-center justify-center bg-[#F5C400] text-[#1E1B18] px-10 h-14 rounded-2xl text-xl font-black hover:scale-105 transition-transform shadow-xl hover:bg-[#F5C400]/90">
              Kontaktuj nás
            </Link>
          </div>
        </div>
      </section>

      <Dialog open={!!selectedSheet} onOpenChange={() => setSelectedSheet(null)}>
        <DialogContent className="max-w-[98vw] w-[98vw] max-h-[95dvh] h-[95dvh] overflow-hidden rounded-2xl p-0 border-none flex flex-col">
          {selectedSheet && (
            <div className="flex flex-col h-full w-full bg-white">
              {/* Header Bar */}
              <div className="shrink-0 flex items-center justify-between p-4 bg-white border-b border-gray-100">
                <div className="flex items-center gap-4">
                  <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-bold uppercase tracking-widest">
                    {selectedSheet.topic || 'Matematika'}
                  </span>
                  <DialogHeader>
                    <DialogTitle className="text-xl font-display font-bold m-0">
                      {selectedSheet.title}
                    </DialogTitle>
                  </DialogHeader>
                </div>
                
                <div className="flex items-center gap-3">
                  <Button 
                    variant="outline" 
                    className="h-10 rounded-xl font-bold bg-blue-50 text-brand-blue border-blue-100 hover:bg-blue-100" 
                    onClick={() => window.open(selectedSheet.fileUrl, '_blank')}
                  >
                    <ArrowRight size={18} className="mr-2 rotate-[-45deg]" />
                    Otevřít v panelu
                  </Button>
                  <Button variant="outline" className="h-10 rounded-xl font-bold" onClick={() => {
                      const a = document.createElement('a');
                      a.href = selectedSheet.fileUrl || '';
                      a.download = `${selectedSheet.title || 'material'}.pdf`;
                      a.click();
                    }}>
                      <Download size={18} className="mr-2" />
                      Stáhnout (PDF)
                  </Button>
                  <Button 
                    variant="ghost"
                    onClick={() => setSelectedSheet(null)}
                    className="h-10 w-10 p-0 rounded-full bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-500"
                  >
                    <ArrowRight size={20} />
                  </Button>
                </div>
              </div>
              
              {/* PDF Area */}
              <div className="flex-1 min-h-0 bg-gray-100/50 p-2 md:p-4 relative">
                {selectedSheet.fileUrl ? (
                  <div className="w-full h-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden relative">
                    <PDFViewer url={selectedSheet.fileUrl} title={selectedSheet.title} />
                  </div>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center">
                    <FileText size={48} className="text-gray-300 mb-4" />
                    <p className="text-gray-500 font-bold mb-6">K tomuto materiálu nebyl přiložen žádný soubor.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
