/**
 * Pomocná utilita pro správné české skloňování křestních jmen do 5. pádu (vokativ).
 * Příklad: David -> Davide, Nela -> Nelo, Petr -> Petře, Tomáš -> Tomáši
 */

// Slovník nejčastějších českých křestních jmen s nepravidelným nebo specifickým tvarem vokativu
const VOCATIVE_OVERRIDES: Record<string, string> = {
  // Mužská jména
  petr: 'Petře',
  pavel: 'Pavle',
  karel: 'Karle',
  josef: 'Josefe',
  františek: 'Františku',
  jan: 'Jane',
  jiří: 'Jiří',
  tomáš: 'Tomáši',
  lukáš: 'Lukáši',
  matěj: 'Matěji',
  ondřej: 'Ondřeji',
  vojtěch: 'Vojto',
  vojta: 'Vojto',
  honza: 'Honzo',
  kuba: 'Kubo',
  míša: 'Míšo',
  péťa: 'Péťo',
  mirek: 'Mirku',
  zdeněk: 'Zdeňku',
  radek: 'Radku',
  marek: 'Marku',
  patrik: 'Patriku',
  hynek: 'Hynku',
  luděk: 'Luďku',
  daněk: 'Daňku',
  jindřich: 'Jindřichu',
  oldřich: 'Oldřichu',
  bedřich: 'Bedřichu',
  erik: 'Eriku',
  jakub: 'Jakube',
  david: 'Davide',
  martin: 'Martine',
  filip: 'Filipe',
  adam: 'Adame',
  daniel: 'Danieli',
  milan: 'Milane',
  roman: 'Romane',
  antonín: 'Antoníne',
  robin: 'Robine',
  šimon: 'Šimone',
  viktor: 'Viktore',
  robert: 'Roberte',
  richard: 'Richarde',
  aleš: 'Aleši',
  miloš: 'Miloši',
  tadeáš: 'Tadeáši',
  matyáš: 'Matyáši',
  jonáš: 'Jonáši',
  kryštof: 'Kryštofe',
  vít: 'Víte',
  vítek: 'Vítku',
  dominik: 'Dominiku',
  štěpán: 'Štěpáne',
  mika: 'Miko',
  alex: 'Alexi',
  max: 'Maxi',
  sam: 'Same',
  samuel: 'Samueli',
  ben: 'Bene',
  benjamin: 'Benjamine',
  oliver: 'Olivere',
  tobiáš: 'Tobiáši',
  teodor: 'Teodore',

  // Ženská jména
  nela: 'Nelo',
  anna: 'Anno',
  eliška: 'Eliško',
  tereza: 'Terezo',
  adéla: 'Adélo',
  karolína: 'Karolíno',
  kristýna: 'Kristýno',
  michaela: 'Michaelo',
  barbora: 'Barboro',
  lucie: 'Lucie',
  marie: 'Marie',
  kateřina: 'Kateřino',
  veronika: 'Veroniko',
  klára: 'Kláro',
  viktorie: 'Viktorie',
  julie: 'Julie',
  natálie: 'Natálie',
  natalie: 'Natalie',
  laura: 'Lauro',
  ema: 'Emo',
  emma: 'Emmo',
  sofie: 'Sofie',
  sofia: 'Sofio',
  zuzana: 'Zuzano',
  lenka: 'Lenko',
  alena: 'Aleno',
  petra: 'Petro',
  monika: 'Moniko',
  jana: 'Jano',
  eva: 'Evo',
  hana: 'Hano',
  simona: 'Simono',
  markéta: 'Markéto',
  daniela: 'Danielo',
  aneta: 'Aneto',
  nikola: 'Nikolo',
  sára: 'Sáro',
  amálie: 'Amálie',
  stela: 'Stelo',
  leontýna: 'Leontýno',
  mia: 'Mio',
  elena: 'Eleno',
  vanesa: 'Vaneso',
  jasmína: 'Jasmíno',
};

/**
 * Převede křestní jméno do 5. pádu (vokativ) pro přirozené české oslovení.
 * Pokud je jméno prázdné nebo nerozeznatelné, vrací bezpečný fallback.
 */
export function toCzechVocative(name?: string | null, fallback = 'studente'): string {
  if (!name || typeof name !== 'string') {
    return fallback;
  }

  // Vezmeme první slovo v případě, že bylo předáno celé jméno a příjmení
  const firstName = name.trim().split(/\s+/)[0];
  if (!firstName) {
    return fallback;
  }

  const lower = firstName.toLowerCase();

  // 1. Přímý override ze slovníku
  if (VOCATIVE_OVERRIDES[lower]) {
    const vocative = VOCATIVE_OVERRIDES[lower];
    // Zachováme původní velikost prvního písmene
    return firstName.charAt(0) === firstName.charAt(0).toUpperCase()
      ? vocative.charAt(0).toUpperCase() + vocative.slice(1)
      : vocative.toLowerCase();
  }

  // 2. Pravidla pro ženská jména končící na "ie" nebo "e" (Lucie, Julie, Marie, Sofie) -> zůstávají stejná
  if (lower.endsWith('ie') || lower.endsWith('e')) {
    return firstName;
  }

  // 3. Jména končící na "a" (Nela -> Nelo, Eliška -> Eliško, Honza -> Honzo) -> koncovka "o"
  if (lower.endsWith('a')) {
    return firstName.slice(0, -1) + 'o';
  }

  // 4. Jména končící na "ek" (František -> Františku, Mirek -> Mirku)
  if (lower.endsWith('ek')) {
    // Zkusit vypustit 'e' pokud před ním není shluk, nebo nahradit za 'ku'
    const stem = firstName.slice(0, -2);
    // Např. Marek -> Marku, Radek -> Radku
    if (stem.length > 2 && /[bcdfghjklmnpqrstvwxz]$/i.test(stem)) {
      return stem + 'ku';
    }
    return stem + 'eku';
  }

  // 5. Jména končící na k, g, h, ch -> koncovka "u" (Erik -> Eriku, Jindřich -> Jindřichu)
  if (lower.endsWith('k') || lower.endsWith('g') || lower.endsWith('h') || lower.endsWith('ch')) {
    return firstName + 'u';
  }

  // 6. Jména končící na měkké souhlásky (š, ž, č, ř, c, j, ď, ť, ň) -> koncovka "i" (Tomáš -> Tomáši, Aleš -> Aleši, Matěj -> Matěji)
  if (/[šžčřcjďťň]$/i.test(lower)) {
    return firstName + 'i';
  }

  // 7. Jména končící na "el" (Pavel -> Pavle, Daniel -> Danieli)
  if (lower.endsWith('el')) {
    return firstName.slice(0, -2) + 'le';
  }

  // 8. Jména končící na tvrdé / obojetné souhlásky (d, t, n, b, p, v, m, r, s, l) -> koncovka "e" (David -> Davide, Jan -> Jane)
  if (/[dtnbpvmsl]$/i.test(lower)) {
    return firstName + 'e';
  }

  if (lower.endsWith('r')) {
    // r -> ře (Petr -> Petře)
    return firstName.slice(0, -1) + 'ře';
  }

  // 9. Jména končící na samohlásku (i, í, y, ý, o, u) -> zůstávají stejná
  if (/[iíyýou]$/i.test(lower)) {
    return firstName;
  }

  // Výchozí bezpečný fallback
  return firstName;
}
