import React from 'react';

export interface QuickFormulaToolbarProps {
  onInsert: (snippet: string) => void;
  className?: string;
  size?: 'sm' | 'xs';
}

interface FormulaAction {
  label: string;
  display: string;
  snippet: string;
  title: string;
}

const FORMULA_ACTIONS: FormulaAction[] = [
  {
    label: 'Zlomek',
    display: 'a/b',
    snippet: '$\\frac{a}{b}$',
    title: 'Vložit zlomek \\frac{čitatel}{jmenovatel}'
  },
  {
    label: 'Složený zl.',
    display: 'a/(b/c)',
    snippet: '$\\frac{a}{\\frac{b}{c}}$',
    title: 'Vložit složený zlomek \\frac{a}{\\frac{b}{c}}'
  },
  {
    label: 'Mocnina',
    display: 'x²',
    snippet: '$x^{2}$',
    title: 'Vložit mocninu x^{n}'
  },
  {
    label: 'Odmocnina',
    display: '√x',
    snippet: '$\\sqrt{x}$',
    title: 'Vložit druhou odmocninu \\sqrt{x}'
  },
  {
    label: 'n-tá odm.',
    display: '∛x',
    snippet: '$\\sqrt[3]{x}$',
    title: 'Vložit n-tou odmocninu \\sqrt[3]{x}'
  },
  {
    label: 'Násobení',
    display: '·',
    snippet: '$\\cdot$',
    title: 'Vložit matematickou tečku násobení \\cdot'
  },
  {
    label: 'Dělení',
    display: ':',
    snippet: '$:$',
    title: 'Vložit dvojtečku dělení'
  },
  {
    label: 'Plus/Mínus',
    display: '±',
    snippet: '$\\pm$',
    title: 'Vložit plus/mínus \\pm'
  },
  {
    label: 'Přibližně',
    display: '≈',
    snippet: '$\\approx$',
    title: 'Vložit přibližné rovnítko \\approx'
  },
  {
    label: 'Nerovná se',
    display: '≠',
    snippet: '$\\neq$',
    title: 'Vložit nerovná se \\neq'
  },
  {
    label: 'Menší/rovno',
    display: '≤',
    snippet: '$\\leq$',
    title: 'Vložit menší nebo rovno \\leq'
  },
  {
    label: 'Větší/rovno',
    display: '≥',
    snippet: '$\\geq$',
    title: 'Vložit větší nebo rovno \\geq'
  },
  {
    label: 'Pí',
    display: 'π',
    snippet: '$\\pi$',
    title: 'Vložit Ludolfovo číslo \\pi'
  },
  {
    label: 'Stupně',
    display: '°',
    snippet: '$^{\\circ}$',
    title: 'Vložit značku stupňů ^{\\circ}'
  },
  {
    label: 'Inline blok',
    display: '$...$',
    snippet: '$  $',
    title: 'Vložit inline matematický blok $ ... $'
  },
  {
    label: 'Rovnice na střed',
    display: '$$...$$',
    snippet: '$$\n  \n$$',
    title: 'Vložit vycentrovaný blok rovnice $$ ... $$'
  }
];

export const QuickFormulaToolbar: React.FC<QuickFormulaToolbarProps> = ({
  onInsert,
  className = '',
  size = 'xs'
}) => {
  return (
    <div className={`flex flex-wrap items-center gap-1.5 p-2 bg-[#FAF7F0] border border-gray-200/80 rounded-xl ${className}`}>
      <span className="text-[10px] font-black uppercase tracking-wider text-amber-900/70 mr-1 select-none flex items-center gap-1">
        <span>Matematika:</span>
      </span>

      <div className="flex flex-wrap items-center gap-1">
        {FORMULA_ACTIONS.map((item, idx) => (
          <button
            key={idx}
            type="button"
            onMouseDown={(e) => {
              // Crucial: Prevent toolbar button from stealing focus from active input/textarea
              e.preventDefault();
            }}
            onClick={(e) => {
              e.preventDefault();
              onInsert(item.snippet);
            }}
            title={item.title}
            className={`px-2 py-1 rounded-lg font-bold transition-all cursor-pointer border shadow-2xs hover:scale-105 active:scale-95 bg-white hover:bg-amber-50 hover:border-amber-400 text-gray-800 ${
              size === 'xs' ? 'text-xs' : 'text-sm'
            }`}
          >
            <span className="font-mono text-amber-800 font-black mr-1">{item.display}</span>
            <span className="text-[10px] text-gray-500 font-sans hidden sm:inline">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default QuickFormulaToolbar;
