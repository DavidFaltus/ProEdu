import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { extractTestFromFile } from '../services/geminiService';
import { MathTopic, Question } from '../types';
import { UploadCloud, Loader2, FileText, CheckCircle2, Trash2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { addDoc, collection, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';

const MATH_TOPICS: MathTopic[] = [
  'Aritmetika', 
  'Geometrie', 
  'Zlomky a procenta', 
  'Rovnice', 
  'Slovní úlohy', 
  'Jednotky a měření'
];

interface TestImporterProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function TestImporter({ open, onOpenChange }: TestImporterProps) {
  const { profile } = useAuth();
  const [step, setStep] = useState<'upload' | 'processing' | 'review'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [testData, setTestData] = useState<{
    title: string;
    description: string;
    topic: MathTopic;
    questions: Question[];
  }>({
    title: '',
    description: '',
    topic: 'Aritmetika',
    questions: []
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleProcessFile = async () => {
    if (!file) return;
    
    setStep('processing');
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = (reader.result as string).split(',')[1];
        const mimeType = file.type;
        
        const extracted = await extractTestFromFile(base64String, mimeType);
        
        setTestData({
          title: extracted.title || 'Nový test ze souboru',
          description: extracted.description || '',
          topic: 'Aritmetika',
          questions: extracted.questions || []
        });
        
        setStep('review');
        toast.success('Soubor byl úspěšně zpracován');
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error(error);
      toast.error('Chyba při zpracování souboru');
      setStep('upload');
    }
  };

  const handleSaveTest = async () => {
    if (!testData.title || testData.questions.length === 0) {
      toast.error('Test musí mít název a alespoň jednu otázku');
      return;
    }

    try {
      await addDoc(collection(db, 'tests'), {
        ...testData,
        createdBy: profile?.uid,
        createdAt: Timestamp.now()
      });
      toast.success('Test byl úspěšně přidán');
      onOpenChange(false);
      // Reset state
      setTimeout(() => {
        setStep('upload');
        setFile(null);
        setTestData({ title: '', description: '', topic: 'Aritmetika', questions: [] });
      }, 300);
    } catch (error) {
      toast.error('Chyba při ukládání testu');
    }
  };

  const handleAddQuestion = () => {
    setTestData({
      ...testData,
      questions: [...testData.questions, { id: Date.now().toString(), question: '', options: ['', '', '', ''], correctAnswer: '', topic: testData.topic }]
    });
  };

  return (
    <Dialog open={open} onOpenChange={(val) => {
      if (!val && step === 'processing') return; // Prevent closing while processing
      onOpenChange(val);
      if (!val) {
        setTimeout(() => {
          setStep('upload');
          setFile(null);
        }, 300);
      }
    }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-[2.5rem] border-none shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-3xl font-display font-bold text-brand-blue">
            {step === 'upload' && 'Nahrát test ze souboru'}
            {step === 'processing' && 'Zpracovávám soubor...'}
            {step === 'review' && 'Kontrola a úprava testu'}
          </DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div className="py-12 flex flex-col items-center justify-center space-y-6">
            <div 
              className="w-full max-w-md border-2 border-dashed border-blue-200 rounded-[2rem] p-12 flex flex-col items-center justify-center text-center hover:bg-blue-50/50 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="application/pdf,image/*"
                onChange={handleFileChange}
              />
              <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center text-brand-blue mb-6">
                <UploadCloud size={40} />
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">Vyberte soubor</h3>
              <p className="text-gray-500 text-sm">Podporované formáty: PDF, PNG, JPG</p>
              
              {file && (
                <div className="mt-6 p-4 bg-white rounded-xl border border-blue-100 flex items-center gap-3 w-full">
                  <FileText className="text-brand-blue" />
                  <span className="font-bold text-sm truncate">{file.name}</span>
                  <CheckCircle2 className="text-green-500 ml-auto" size={18} />
                </div>
              )}
            </div>
            
            <Button 
              onClick={handleProcessFile} 
              disabled={!file}
              className="btn-blue h-14 px-12 rounded-2xl text-lg font-bold"
            >
              Zpracovat pomocí AI
            </Button>
          </div>
        )}

        {step === 'processing' && (
          <div className="py-24 flex flex-col items-center justify-center space-y-6">
            <div className="relative">
              <div className="w-24 h-24 border-4 border-blue-100 rounded-full"></div>
              <div className="w-24 h-24 border-4 border-brand-blue border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-brand-blue">
                <Loader2 size={32} className="animate-spin" />
              </div>
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-2xl font-bold text-gray-800">AI analyzuje dokument</h3>
              <p className="text-gray-500">Převádím text na elektronický test. To může chvíli trvat...</p>
            </div>
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-8 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-blue-50/30 p-6 rounded-[2rem]">
              <div className="space-y-2">
                <Label className="font-bold text-gray-700">Název testu</Label>
                <Input 
                  value={testData.title} 
                  onChange={e => setTestData({...testData, title: e.target.value})}
                  className="rounded-xl h-12 bg-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="font-bold text-gray-700">Téma</Label>
                <Select value={testData.topic} onValueChange={(val: MathTopic) => {
                  setTestData({
                    ...testData, 
                    topic: val,
                    questions: testData.questions.map(q => ({ ...q, topic: val }))
                  });
                }}>
                  <SelectTrigger className="rounded-xl h-12 bg-white">
                    <SelectValue placeholder="Vyberte téma..." />
                  </SelectTrigger>
                  <SelectContent>
                    {MATH_TOPICS.map(topic => (
                      <SelectItem key={topic} value={topic}>{topic}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label className="font-bold text-gray-700">Popis</Label>
                <Textarea 
                  value={testData.description} 
                  onChange={e => setTestData({...testData, description: e.target.value})}
                  className="rounded-xl bg-white"
                />
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-2xl text-brand-blue">Zkontrolované otázky ({testData.questions.length})</h3>
                <Button variant="outline" size="sm" onClick={handleAddQuestion} className="rounded-xl border-2 hover:bg-blue-50">
                  <Plus size={16} className="mr-2" /> Přidat otázku
                </Button>
              </div>
              
              {testData.questions.map((q, idx) => (
                <div key={q.id} className="p-8 bg-white border-2 border-gray-100 rounded-[2rem] space-y-6 relative hover:border-brand-blue transition-all shadow-sm">
                  <div className="flex justify-between items-center">
                    <span className="px-3 py-1 bg-brand-blue text-white rounded-full text-xs font-bold">Otázka {idx + 1}</span>
                    <Button variant="ghost" size="sm" onClick={() => setTestData({...testData, questions: testData.questions.filter(item => item.id !== q.id)})} className="text-red-400 hover:text-red-600">
                      <Trash2 size={18} />
                    </Button>
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase text-gray-400 tracking-widest">Znění otázky</Label>
                    <Input 
                      value={q.question} 
                      onChange={e => {
                        const qs = [...testData.questions];
                        qs[idx].question = e.target.value;
                        setTestData({...testData, questions: qs});
                      }}
                      className="rounded-xl bg-gray-50 border-none h-12"
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {q.options.map((opt, optIdx) => (
                      <div key={optIdx} className="space-y-1">
                        <Label className="text-[10px] uppercase text-gray-400 font-bold">Možnost {String.fromCharCode(65 + optIdx)}</Label>
                        <Input 
                          value={opt} 
                          onChange={e => {
                            const qs = [...testData.questions];
                            qs[idx].options[optIdx] = e.target.value;
                            setTestData({...testData, questions: qs});
                          }}
                          className={`rounded-xl border-none h-12 ${opt === q.correctAnswer ? 'bg-green-50 text-green-700 ring-2 ring-green-500' : 'bg-gray-50'}`}
                        />
                      </div>
                    ))}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase text-gray-400 tracking-widest">Správná odpověď</Label>
                      <Select value={q.correctAnswer} onValueChange={(val: string) => {
                        const qs = [...testData.questions];
                        qs[idx].correctAnswer = val;
                        setTestData({...testData, questions: qs});
                      }}>
                        <SelectTrigger className="rounded-xl bg-gray-50 border-none h-12">
                          <SelectValue placeholder="Vyberte správnou odpověď" />
                        </SelectTrigger>
                        <SelectContent>
                          {q.options.map((opt, optIdx) => (
                            <SelectItem key={optIdx} value={opt}>{opt || `Možnost ${String.fromCharCode(65 + optIdx)}`}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase text-gray-400 tracking-widest">Vysvětlení (volitelné)</Label>
                      <Input 
                        value={q.explanation || ''} 
                        onChange={e => {
                          const qs = [...testData.questions];
                          qs[idx].explanation = e.target.value;
                          setTestData({...testData, questions: qs});
                        }}
                        className="rounded-xl bg-gray-50 border-none h-12"
                        placeholder="Proč je to správně?"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 'review' && (
          <DialogFooter className="sticky bottom-0 bg-white pt-4 pb-2 border-t border-gray-50 mt-8">
            <Button variant="outline" onClick={() => setStep('upload')} className="rounded-xl h-14 px-8">Zpět</Button>
            <Button onClick={handleSaveTest} className="btn-orange h-14 px-12 rounded-2xl text-lg font-bold">Přidat k procvičování</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
