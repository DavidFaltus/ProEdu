import * as React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { BookOpen, CheckCircle2, Lightbulb, Play, HelpCircle } from 'lucide-react';

interface StudySessionModalProps {
  subtopic: any;
  subject: string;
  isOpen: boolean;
  onClose: () => void;
  onStartPractice: (subtopic: any) => void;
}

export default function StudySessionModal({
  subtopic,
  subject,
  isOpen,
  onClose,
  onStartPractice
}: StudySessionModalProps) {
  if (!subtopic) return null;

  const example = subtopic.exampleProblem;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl w-[94vw] rounded-[2.5rem] p-0 overflow-hidden border border-gray-100 shadow-3xl bg-[#FAF7F0] max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#1E1B18] to-[#3a3530] p-6 text-white text-left relative overflow-hidden shrink-0">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-400/10 rounded-full blur-2xl" />
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full text-xs font-black uppercase tracking-wider text-amber-300 mb-2">
            <BookOpen size={14} /> Výukový režim: {subject}
          </div>
          <DialogTitle className="text-2xl md:text-3xl font-display font-black tracking-tight text-white">
            {subtopic.name}
          </DialogTitle>
          <DialogDescription className="text-xs md:text-sm text-gray-300 font-medium mt-1">
            {subtopic.description}
          </DialogDescription>
        </div>

        {/* Scrollable content body */}
        <div className="p-6 md:p-8 space-y-6 overflow-y-auto flex-1 bg-white">
          {example ? (
            <div className="space-y-6">
              <div className="bg-[#FAF7F0] p-5 rounded-2xl border border-gray-200/80 space-y-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-700 bg-amber-100/70 px-2.5 py-0.5 rounded-full inline-block">
                  Vzorový příklad
                </span>
                <p className="text-base md:text-lg font-black text-[#1E1B18] leading-snug">
                  {example.question}
                </p>
              </div>
              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                  <CheckCircle2 size={16} className="text-emerald-500" />
                  Postup řešení krok za krokem
                </h4>
                <div className="space-y-2.5">
                  {example.solutionSteps?.map((step: string, idx: number) => (
                    <div
                      key={idx}
                      className="p-3.5 bg-gray-50/80 border border-gray-100 rounded-xl text-xs md:text-sm font-semibold text-gray-700 flex items-start gap-3"
                    >
                      <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 font-black text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <span className="leading-relaxed">{step}</span>
                    </div>
                  ))}
                </div>
              </div>
              {example.explanation && (
                <div className="bg-amber-50/80 border border-amber-200/60 p-4 rounded-2xl flex items-start gap-3 text-xs md:text-sm text-amber-900 font-medium">
                  <Lightbulb size={20} className="text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-black block mb-0.5 text-amber-950">Tip a časté chyby:</strong>
                    {example.explanation}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-10 space-y-3">
              <HelpCircle size={40} className="mx-auto text-gray-300" />
              <p className="text-sm font-bold text-gray-500">K tomuto podtématu se připravují další vzorové příklady.</p>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-4 md:p-6 bg-[#FAF7F0] border-t border-gray-200/80 flex items-center justify-between gap-4 shrink-0">
          <Button
            variant="outline"
            onClick={onClose}
            className="rounded-xl font-bold text-xs h-11 px-5 border-gray-200"
          >
            Zavřít výklad
          </Button>
          <Button
            onClick={() => {
              onClose();
              onStartPractice(subtopic);
            }}
            className="rounded-xl font-black text-xs h-11 px-6 bg-[#1E1B18] text-[#FAF7F0] hover:bg-[#332f2b] shadow-md flex items-center gap-2"
          >
            <Play size={14} className="fill-current" />
            Vyzkoušet si v procvičování
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
