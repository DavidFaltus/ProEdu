import React, { useState, useEffect } from 'react';
import { 
  BookOpen, Search, Check, FileText, Sparkles, Filter, X, ArrowRight, Loader2 
} from 'lucide-react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Input } from '../ui/input';
import { getAllMaterials, ExistingMaterialItem } from '../../services/practiceService';

interface MaterialSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (material: ExistingMaterialItem) => void;
  activeSubject?: string;
}

export default function MaterialSelectorModal({
  isOpen,
  onClose,
  onSelect,
  activeSubject
}: MaterialSelectorModalProps) {
  const [materials, setMaterials] = useState<ExistingMaterialItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState<string>(activeSubject || 'Vše');

  useEffect(() => {
    if (isOpen) {
      loadMaterials();
      if (activeSubject) setSubjectFilter(activeSubject);
    }
  }, [isOpen, activeSubject]);

  const loadMaterials = async () => {
    setLoading(true);
    try {
      const items = await getAllMaterials();
      setMaterials(items);
    } catch (err) {
      console.error('Failed to load materials:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredMaterials = materials.filter(m => {
    const matchesSubject = subjectFilter === 'Vše' || m.subject === subjectFilter;
    const q = search.toLowerCase().trim();
    const matchesSearch = !q || 
      m.title.toLowerCase().includes(q) || 
      (m.topic && m.topic.toLowerCase().includes(q)) ||
      (m.studyTheory && m.studyTheory.toLowerCase().includes(q));
    return matchesSubject && matchesSearch;
  });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-full sm:max-w-4xl lg:max-w-5xl max-h-[88vh] flex flex-col p-0 overflow-hidden rounded-3xl bg-white shadow-2xl">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-gray-100">

          <div className="flex items-center gap-2 text-amber-600">
            <BookOpen size={20} />
            <DialogTitle className="text-xl font-bold text-gray-900 font-display">
              Výběr z existujících studijních materiálů
            </DialogTitle>
          </div>
          <p className="text-xs text-gray-500 font-medium">
            Vyberte hotový výukový list nebo teorii z databáze a propojte ji s tímto podtématem.
          </p>

          {/* Search & Subject filter */}
          <div className="flex flex-col sm:flex-row gap-2 pt-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Hledat materiál podle názvu..."
                className="pl-9 h-10 rounded-xl text-xs font-medium"
              />
            </div>

            <div className="flex gap-1 shrink-0">
              {['Vše', 'Matematika', 'Čeština'].map(sub => (
                <button
                  key={sub}
                  type="button"
                  onClick={() => setSubjectFilter(sub)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    subjectFilter === sub 
                      ? 'bg-[#1E1B18] text-white shadow-sm' 
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {sub}
                </button>
              ))}
            </div>
          </div>
        </DialogHeader>

        {/* Materials List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-slate-50/50">
          {loading ? (
            <div className="py-12 text-center space-y-2">
              <Loader2 className="w-8 h-8 animate-spin text-amber-600 mx-auto" />
              <p className="text-xs text-gray-400 font-bold">Načítám materiály z databáze...</p>
            </div>
          ) : filteredMaterials.length === 0 ? (
            <div className="py-12 text-center space-y-2 bg-white rounded-2xl border border-dashed border-gray-200 p-6">
              <FileText size={36} className="text-gray-300 mx-auto" />
              <p className="text-sm font-bold text-gray-700">Nenalezen žádný materiál</p>
              <p className="text-xs text-gray-400">
                {search ? 'Zkuste změnit vyhledávací dotaz.' : 'V databázi zatím nejsou uloženy jiné materiály.'}
              </p>
            </div>
          ) : (
            filteredMaterials.map(mat => {
              const hasSvg = Boolean(mat.svgUrl || mat.svgContent);
              return (
                <div
                  key={mat.id}
                  onClick={() => {
                    onSelect(mat);
                    onClose();
                  }}
                  className="bg-white rounded-2xl p-4 border border-gray-200/80 hover:border-black hover:shadow-md transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                        mat.subject === 'Matematika' ? 'bg-teal-50 text-teal-800' : 'bg-rose-50 text-rose-800'
                      }`}>
                        {mat.subject}
                      </span>
                    </div>

                    <h4 className="font-bold text-sm text-gray-900 group-hover:text-amber-900 transition-colors truncate">
                      {mat.title}
                    </h4>

                    {mat.studyTheory && (
                      <p className="text-xs text-gray-400 font-medium line-clamp-1">
                        {mat.studyTheory}
                      </p>
                    )}
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    className="rounded-xl bg-gray-100 group-hover:bg-[#1E1B18] group-hover:text-white text-gray-800 font-bold text-xs h-9 px-3.5 shrink-0 self-end sm:self-center transition-colors cursor-pointer"
                  >
                    <span>Použít</span>
                    <ArrowRight size={13} className="ml-1" />
                  </Button>
                </div>
              );
            })
          )}
        </div>

        <DialogFooter className="px-6 py-3 border-t border-gray-100 bg-white">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="rounded-xl font-bold text-xs"
          >
            Zrušit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
