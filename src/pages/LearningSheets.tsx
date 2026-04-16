import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { LearningSheet, MathTopic } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { BookOpen, Search, FileText, Filter, GraduationCap, ArrowRight } from 'lucide-react';
import { Input } from '../components/ui/input';
import { motion, AnimatePresence } from 'motion/react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

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
  const [selectedSheet, setSelectedSheet] = useState<LearningSheet | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (selectedSheet?.fileUrl && selectedSheet.fileUrl.startsWith('data:')) {
      try {
        const dataURI = selectedSheet.fileUrl;
        const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
        const byteString = atob(dataURI.split(',')[1]);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
          ia[i] = byteString.charCodeAt(i);
        }
        const blob = new Blob([ab], { type: mimeString });
        const url = URL.createObjectURL(blob);
        setPdfBlobUrl(url);
        return () => URL.revokeObjectURL(url);
      } catch (e) {
        console.error('Failed to create blob from data URI', e);
        setPdfBlobUrl(selectedSheet.fileUrl);
      }
    } else if (selectedSheet?.fileUrl) {
      setPdfBlobUrl(selectedSheet.fileUrl);
    } else {
      setPdfBlobUrl(null);
    }
  }, [selectedSheet]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'learningSheets'), (snap) => {
      setSheets(snap.docs.map(d => ({ id: d.id, ...d.data() } as LearningSheet)));
    });
    return unsub;
  }, []);

  const filteredSheets = sheets.filter(s => {
    const matchesSearch = s.title.toLowerCase().includes(search.toLowerCase());
    const matchesTopic = selectedTopic === 'Vše' || s.topic === selectedTopic;
    return matchesSearch && matchesTopic;
  });

  return (
    <div className="page-container">
      <header className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-purple-50 text-brand-purple rounded-3xl flex items-center justify-center shadow-sm">
              <BookOpen size={32} />
            </div>
            <div>
              <h1 className="text-4xl font-display font-bold text-brand-blue">Výukové materiály</h1>
              <p className="text-gray-500 text-lg">Přehled všech dostupných studijních listů.</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <Input 
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Hledat v materiálech..."
              className="pl-12 h-14 rounded-2xl border-none bg-white shadow-xl focus:ring-brand-purple"
            />
          </div>
          <div className="w-full md:w-64">
            <Select value={selectedTopic} onValueChange={(val: any) => setSelectedTopic(val)}>
              <SelectTrigger className="h-14 rounded-2xl border-none bg-white shadow-xl font-bold text-gray-700 px-6">
                <div className="flex items-center gap-2">
                  <Filter size={18} className="text-brand-purple" />
                  <SelectValue placeholder="Filtrovat téma" />
                </div>
              </SelectTrigger>
              <SelectContent className="rounded-2xl">
                {MATH_TOPICS.map(topic => (
                  <SelectItem key={topic} value={topic} className="font-bold">{topic}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
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
                <div className="h-3 bg-brand-purple/10 group-hover:bg-brand-purple/20 transition-colors" />
                <CardHeader className="p-8 pb-4">
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-14 h-14 bg-purple-50 rounded-2xl flex items-center justify-center text-brand-purple group-hover:scale-110 transition-transform shadow-sm">
                      <FileText size={28} />
                    </div>
                    {sheet.topic && (
                      <span className="px-3 py-1 bg-purple-50 text-brand-purple rounded-full text-[10px] font-black uppercase tracking-widest">
                        {sheet.topic}
                      </span>
                    )}
                  </div>
                  <CardTitle className="text-2xl font-display group-hover:text-brand-purple transition-colors leading-tight">
                    {sheet.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-8 pt-0 flex-1">
                  <p className="text-gray-500 text-lg line-clamp-4 leading-relaxed">
                    Výukový materiál {sheet.subject} - {sheet.level}.
                  </p>
                </CardContent>
                <div className="px-8 py-6 bg-purple-50/30 border-t border-purple-50 text-sm font-black text-brand-purple uppercase tracking-widest flex items-center justify-between">
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
          <div className="w-20 h-20 bg-purple-50 rounded-full flex items-center justify-center mx-auto mb-6 text-brand-purple">
            <Search size={40} />
          </div>
          <h3 className="text-2xl font-display font-bold text-gray-900 mb-2">Nic jsme nenašli</h3>
          <p className="text-gray-400 text-lg font-bold">Zkus upravit vyhledávání nebo filtr.</p>
        </div>
      )}

      <Dialog open={!!selectedSheet} onOpenChange={() => setSelectedSheet(null)}>
        <DialogContent className="max-w-[98vw] w-[98vw] max-h-[98vh] h-[98vh] overflow-hidden rounded-2xl p-0 border-none flex flex-col">
          {selectedSheet && (
            <div className="flex flex-col h-full w-full bg-white">
              {/* Header Bar */}
              <div className="shrink-0 flex items-center justify-between p-4 bg-white border-b border-gray-100">
                <div className="flex items-center gap-4">
                  <span className="px-3 py-1 bg-purple-50 text-brand-purple rounded-full text-xs font-bold uppercase tracking-widest">
                    {selectedSheet.topic || 'Matematika'}
                  </span>
                  <DialogHeader>
                    <DialogTitle className="text-xl font-display font-bold m-0">
                      {selectedSheet.title}
                    </DialogTitle>
                  </DialogHeader>
                </div>
                
                <div className="flex items-center gap-3">
                  <Button variant="outline" className="h-10 rounded-xl font-bold" onClick={() => {
                      const a = document.createElement('a');
                      a.href = selectedSheet.fileUrl || '';
                      a.download = `${selectedSheet.title || 'material'}.pdf`;
                      a.click();
                    }}>
                      <FileText size={18} className="mr-2" />
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
              <div className="flex-1 min-h-0 bg-gray-100/50 p-2 md:p-4">
                {selectedSheet.fileUrl ? (
                  <div className="w-full h-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    {pdfBlobUrl ? (
                      <iframe 
                        src={pdfBlobUrl} 
                        className="w-full h-full border-none" 
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="animate-spin w-8 h-8 rounded-full border-4 border-brand-purple border-t-transparent" />
                      </div>
                    )}
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
