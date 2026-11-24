export interface PremiumBenefit {
  id: string;
  label: string;
  highlighted?: boolean;
}

export const PREMIUM_BENEFITS: readonly PremiumBenefit[] = [
  {
    id: 'unlimited-practice',
    label: 'Neomezené procvičování bez žolíků a čekání',
  },
  {
    id: 'detailed-stats',
    label: 'Podrobné statistiky a chytrá doporučení k procvičování',
  },
  {
    id: 'study-planner',
    label: 'Chytrý studijní plánovač v kalendáři',
  },
  {
    id: 'learning-sheets',
    label: 'Přehledné grafické listy',
  },
  {
    id: 'ad-free',
    label: '100% bez reklam a přerušování',
  },
  {
    id: 'future-features',
    label: 'Všechny budoucí funkce v ceně 99 Kč',
    highlighted: true,
  },
] as const;
