import React from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { ErrorTypeInsight } from '../../services/statisticsService';
import { AlertCircle, CheckCircle2, Lightbulb, X, ArrowRight, Target } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ErrorTypeDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  errorTypes: ErrorTypeInsight[];
}

export default function ErrorTypeDetailModal({
  isOpen,
  onClose,
  errorTypes
}: ErrorTypeDetailModalProps) {
  const navigate = useNavigate();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent 
        showCloseButton={false}
        className="max-w-xl p-0 overflow-hidden bg-white text-[#1E1B18] border border-gray-100 shadow-2xl rounded-3xl max-h-[88vh] flex flex-col"
      >
        <DialogTitle className="sr-only">Přehled typických chyb a doporučení</DialogTitle>
        <DialogDescription className="sr-only">Rozbor slabých míst a strategie pro jejich odstranění</DialogDescription>

        {/* Modal Header */}
        <div className="bg-gradient-to-r from-rose-50 via-amber-50 to-[#FAF7F0] px-6 py-5 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-500 text-white flex items-center justify-center shadow-md shadow-rose-500/20 font-black text-lg">
              🎯
            </div>
            <div>
              <h3 className="text-lg font-black text-[#0F2942] tracking-tight">
                Rozbor typů chyb
              </h3>
              <p className="text-xs text-gray-500 font-medium">
                Kde konkrétně ztrácíš body a jak na tom zapracovat
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-white/80 transition-all cursor-pointer"
            title="Zavřít"
          >
            <X size={18} />
          </button>
        </div>

        {/* List of Error Categories */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {errorTypes.map(err => {
            return (
              <div
                key={err.id}
                className="p-4 sm:p-5 rounded-2xl border border-gray-200/80 bg-white hover:border-gray-300 transition-all space-y-3 text-left shadow-2xs"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center text-base shrink-0 font-bold">
                      {err.icon}
                    </span>
                    <div>
                      <h4 className="font-black text-sm text-[#0F2942] leading-tight">
                        {err.title}
                      </h4>
                      <span className="text-[11px] text-gray-400 font-medium">
                        {err.count > 0 ? `${err.count} zaznamenaných chyb (${err.percentage} % ze všech)` : 'Žádná zaznamenaná chyba'}
                      </span>
                    </div>
                  </div>

                  {err.count > 0 && (
                    <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-800 border border-rose-200 shrink-0">
                      {err.percentage} % chyb
                    </span>
                  )}
                </div>

                <p className="text-xs text-gray-600 leading-relaxed font-medium">
                  {err.description}
                </p>

                {/* Practical Advice Tip */}
                <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/60 text-xs text-amber-900 flex items-start gap-2">
                  <Lightbulb size={14} className="text-amber-600 shrink-0 mt-0.5" />
                  <span className="font-medium">
                    {err.id === 'sign_error' && 'Při počítání si vždy nejprve zakroužkuj všechna mínus před závorkou. Častá chyba je roznásobení se špatným znaménkem u druhého členu.'}
                    {err.id === 'fraction_reduction' && 'Než začneš násobit složité čitatele, zkontroluj, zda nelze krátit křížem. Ušetří ti to čas a předejdeš velkým číslům.'}
                    {err.id === 'geometry_formula' && 'Vždy si na okraj papíru napiš základní vzorec dříve, než začneš dosazovat čísla. Zkontroluj jednotky (cm vs. m, dm² vs. cm²).'}
                    {err.id === 'spelling_rules' && 'U shody přísudku s podmětem si vždy nejprve podtrhni podmět a urči jeho rod (zejména životný rod mužský má přednost).'}
                    {err.id === 'text_analysis' && 'U úloh typu „Co z textu nevyplývá“ si v textu podtrhni věty, které vylučují jednotlivé možnosti. Nikdy neodpovídej zpaměti.'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Footer */}
        <div className="p-4 px-6 bg-gray-50/80 border-t border-gray-100 flex items-center justify-between gap-3 shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="rounded-xl font-bold text-xs h-10 px-4 border-gray-200 cursor-pointer"
          >
            Rozumím
          </Button>

          <Button
            type="button"
            onClick={() => {
              onClose();
              navigate('/practice');
            }}
            className="rounded-xl bg-[#0F2942] hover:bg-[#1E1B18] text-white font-black text-xs h-10 px-5 flex items-center gap-2 shadow-sm cursor-pointer"
          >
            <span>Přejít na procvičování</span>
            <ArrowRight size={13} />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
