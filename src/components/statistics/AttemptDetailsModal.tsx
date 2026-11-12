import React from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { StudentAttemptRecord, DetailedAnswerRecord } from '../../services/statisticsService';
import { CheckCircle2, XCircle, Clock, RotateCcw, X, HelpCircle, BookOpen } from 'lucide-react';
import { MathRenderer } from '../common/MathRenderer';
import { useNavigate } from 'react-router-dom';

interface AttemptDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  attempt: StudentAttemptRecord | null;
}

export default function AttemptDetailsModal({
  isOpen,
  onClose,
  attempt
}: AttemptDetailsModalProps) {
  const navigate = useNavigate();

  if (!attempt) return null;

  const hasDetailedAnswers = Array.isArray(attempt.detailedAnswers) && attempt.detailedAnswers.length > 0;

  const formatDate = (date: Date) => {
    try {
      return date.toLocaleDateString('cs-CZ', {
        day: 'numeric',
        month: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '';
    }
  };

  const getScoreBadgeClass = (pct: number) => {
    if (pct >= 80) return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    if (pct >= 50) return 'bg-blue-50 text-brand-blue border-blue-200';
    return 'bg-rose-50 text-rose-800 border-rose-200';
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent 
        showCloseButton={false}
        className="max-w-2xl p-0 overflow-hidden bg-white text-[#1E1B18] border border-gray-100 shadow-2xl rounded-3xl max-h-[90vh] flex flex-col"
      >
        <DialogTitle className="sr-only">Detail pokusu: {attempt.subtopicTitle}</DialogTitle>
        <DialogDescription className="sr-only">Rozbor jednotlivých odpovědí z cvičení</DialogDescription>

        {/* Modal Header */}
        <div className="bg-gradient-to-r from-blue-50 via-amber-50 to-[#FAF7F0] px-6 py-5 border-b border-gray-100 flex items-start justify-between shrink-0">
          <div className="space-y-1 pr-4 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                attempt.subject === 'Matematika'
                  ? 'bg-blue-100/70 text-blue-800 border-blue-200'
                  : 'bg-rose-100/70 text-rose-800 border-rose-200'
              }`}>
                {attempt.subject}
              </span>
              <span className="text-xs text-gray-500 font-medium">
                {attempt.topicTitle}
              </span>
            </div>

            <h3 className="text-lg sm:text-xl font-black text-[#0F2942] tracking-tight truncate">
              {attempt.subtopicTitle}
            </h3>

            <div className="flex items-center gap-3 text-xs text-gray-500 pt-0.5">
              <span>{formatDate(attempt.createdAt)}</span>
              <span>•</span>
              <span className={`font-black px-2 py-0.5 rounded-md border text-[11px] ${getScoreBadgeClass(attempt.percentage)}`}>
                {attempt.score} z {attempt.totalQuestions} správně ({attempt.percentage} %)
              </span>
              {attempt.durationSeconds && attempt.durationSeconds > 0 && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1 font-medium">
                    <Clock size={12} />
                    {Math.round(attempt.durationSeconds / 60)} min
                  </span>
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-white/80 transition-all cursor-pointer shrink-0"
            title="Zavřít"
          >
            <X size={18} />
          </button>
        </div>

        {/* Answers List */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {!hasDetailedAnswers ? (
            <div className="p-8 text-center rounded-2xl bg-gray-50 border border-dashed border-gray-200 space-y-3">
              <HelpCircle className="w-10 h-10 text-gray-400 mx-auto stroke-1" />
              <div className="space-y-1">
                <h4 className="font-bold text-sm text-gray-800">
                  U tohoto staršího pokusu není uložen podrobný rozbor otázek
                </h4>
                <p className="text-xs text-gray-500 max-w-md mx-auto">
                  Detailní rozbor po jednotlivých otázkách a autorských řešeních se ukládá pro všechna nová procvičování. Spusť si cvičení znovu a vyzkoušej to!
                </p>
              </div>
            </div>
          ) : (
            attempt.detailedAnswers.map((ans, idx) => {
              const isCorrect = ans.isCorrect;
              return (
                <div
                  key={ans.questionId || idx}
                  className={`p-4 rounded-2xl border transition-all text-left space-y-3 ${
                    isCorrect
                      ? 'bg-emerald-50/40 border-emerald-200/80'
                      : 'bg-rose-50/40 border-rose-200/80'
                  }`}
                >
                  {/* Question header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                        isCorrect ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                      }`}>
                        {isCorrect ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
                      </div>
                      <span className="text-xs font-black text-gray-700 uppercase tracking-wider">
                        Otázka {idx + 1}
                      </span>
                    </div>

                    <span className={`text-[11px] font-black px-2 py-0.5 rounded-full ${
                      isCorrect ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                    }`}>
                      {isCorrect ? 'Správně' : 'Chyba'}
                    </span>
                  </div>

                  {/* Question body */}
                  <div className="text-sm font-bold text-[#1E1B18] leading-relaxed">
                    <MathRenderer content={ans.questionText} />
                  </div>

                  {/* Answers comparison */}
                  <div className="p-3 rounded-xl bg-white/80 border border-gray-100 space-y-1.5 text-xs">
                    <div className="flex items-start gap-2">
                      <span className="text-gray-400 font-bold shrink-0 w-28">Tvá odpověď:</span>
                      <span className={`font-black ${isCorrect ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {ans.userAnswer ? <MathRenderer content={ans.userAnswer} /> : 'Bez odpovědi'}
                      </span>
                    </div>

                    {!isCorrect && ans.correctAnswer && (
                      <div className="flex items-start gap-2 pt-1 border-t border-gray-100">
                        <span className="text-gray-400 font-bold shrink-0 w-28">Správné řešení:</span>
                        <span className="font-black text-emerald-700">
                          <MathRenderer content={ans.correctAnswer} />
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Explanation if present */}
                  {ans.explanation && (
                    <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/70 text-xs text-amber-950 space-y-1">
                      <div className="flex items-center gap-1.5 font-black text-[11px] text-amber-900 uppercase tracking-wider">
                        <BookOpen size={12} className="text-amber-700" />
                        <span>Autorské vysvětlení postupu</span>
                      </div>
                      <div className="leading-relaxed font-medium">
                        <MathRenderer content={ans.explanation} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 px-6 bg-gray-50/80 border-t border-gray-100 flex items-center justify-between gap-3 shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="rounded-xl font-bold text-xs h-10 px-4 border-gray-200 cursor-pointer"
          >
            Zavřít
          </Button>

          <Button
            type="button"
            onClick={() => {
              onClose();
              navigate(`/practice/session/${attempt.subtopicId}`);
            }}
            className="rounded-xl bg-[#0F2942] hover:bg-[#1E1B18] text-white font-black text-xs h-10 px-5 flex items-center gap-2 shadow-sm cursor-pointer"
          >
            <RotateCcw size={13} />
            <span>Procvičit toto téma znovu</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
