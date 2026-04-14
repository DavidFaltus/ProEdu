import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { motion } from 'motion/react';
import { Trophy, CheckCircle2, Star } from 'lucide-react';

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-grow">
        <section className="flex items-center justify-center px-4 py-12 md:py-24">
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <motion.div 
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
              className="space-y-8 text-center lg:text-left"
            >
              <div className="relative inline-block">
                <div className="flex flex-col items-center lg:items-start">
                  <img 
                    src="https://www.pro-edu.eu/wp-content/uploads/2023/04/logo-proedu-2.png" 
                    alt="ProEdu" 
                    className="h-24 md:h-32 w-auto mb-4"
                    referrerPolicy="no-referrer"
                  />
                  <motion.div
                    initial={{ rotate: -20, scale: 0 }}
                    animate={{ rotate: -5, scale: 1 }}
                    transition={{ delay: 0.5, type: 'spring' }}
                    className="absolute -top-10 -right-24 hidden md:block"
                  >
                    <img 
                      src="https://cdn-icons-png.flaticon.com/512/3112/3112946.png" 
                      alt="Trophy" 
                      className="w-32 h-32 drop-shadow-xl"
                      referrerPolicy="no-referrer"
                    />
                  </motion.div>
                </div>
              </div>

              <div className="space-y-4">
                <h2 className="text-4xl md:text-6xl font-display text-gray-800 leading-tight">
                  Výuková aplikace, která se <br className="hidden md:block" />
                  <span className="text-brand-blue underline decoration-brand-orange/30 decoration-8 underline-offset-8">Ti přizpůsobí.</span>
                </h2>
                <p className="text-xl md:text-2xl text-gray-600 max-w-xl mx-auto lg:mx-0 leading-relaxed">
                  Jednoduché ovládání - maximální procvičení. <br className="hidden md:block" />
                  Připrav se s námi na přijímačky nebo na didakťáky ještě dnes.
                </p>
              </div>

              <div className="flex flex-col items-center lg:items-start space-y-8">
                <div className="font-playful text-4xl md:text-5xl text-gray-700">
                  Procvičuj <span className="text-brand-orange drop-shadow-sm font-bold">ZDARMA</span>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-6 w-full sm:w-auto">
                  <Link 
                    to="/practice" 
                    className="btn-orange h-16 px-12 rounded-2xl text-xl font-display tracking-wide flex items-center justify-center min-w-[240px]"
                  >
                    Přijímačky na SŠ
                  </Link>
                  <Link 
                    to="/practice" 
                    className="btn-purple h-16 px-12 rounded-2xl text-xl font-display tracking-wide flex items-center justify-center min-w-[240px]"
                  >
                    Příprava na maturitu
                  </Link>
                </div>
              </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, scale: 0.8, rotate: 5 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative hidden lg:flex justify-center"
            >
              <div className="relative z-10">
                <img 
                  src="https://pro-edu.eu/wp-content/uploads/2023/04/knihy.png" 
                  alt="Knihy" 
                  className="max-w-md w-full h-auto drop-shadow-2xl"
                  referrerPolicy="no-referrer"
                />
                <motion.div
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute -top-10 -right-10 bg-white p-6 rounded-3xl shadow-2xl border-2 border-blue-50"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-green-100 rounded-2xl flex items-center justify-center text-green-600">
                      <CheckCircle2 size={28} />
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 font-bold uppercase tracking-wider">Úspěšnost</div>
                      <div className="text-xl font-black text-gray-800">98% studentů</div>
                    </div>
                  </div>
                </motion.div>
                
                <motion.div
                  animate={{ y: [0, 10, 0] }}
                  transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                  className="absolute -bottom-10 -left-10 bg-white p-6 rounded-3xl shadow-2xl border-2 border-orange-50"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-orange-100 rounded-2xl flex items-center justify-center text-orange-600">
                      <Trophy size={28} />
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 font-bold uppercase tracking-wider">Ocenění</div>
                      <div className="text-xl font-black text-gray-800">Top Edu 2024</div>
                    </div>
                  </div>
                </motion.div>
              </div>
              
              {/* Background blobs */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-blue-100/30 rounded-full blur-3xl -z-10" />
            </motion.div>
          </div>
        </section>

        <section className="bg-white py-24 px-4">
          <div className="max-w-7xl mx-auto space-y-16">
            <div className="text-center space-y-4">
              <h2 className="text-4xl md:text-5xl font-display font-bold text-brand-blue">Proč studovat s ProEdu?</h2>
              <p className="text-gray-500 text-xl max-w-2xl mx-auto">Víme, co studenti potřebují k úspěchu. Naše platforma je postavena na moderních metodách.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-12">
              <div className="space-y-6 p-8 rounded-[2.5rem] bg-blue-50/50 border-2 border-transparent hover:border-blue-100 transition-all">
                <div className="w-16 h-16 bg-white rounded-2xl shadow-md flex items-center justify-center text-brand-blue">
                  <Star size={32} />
                </div>
                <h3 className="text-2xl font-display font-bold">Individuální přístup</h3>
                <p className="text-gray-600 leading-relaxed">Aplikace sleduje tvůj pokrok a doporučuje ti přesně to, co ti nejde. Šetříme tvůj čas.</p>
              </div>

              <div className="space-y-6 p-8 rounded-[2.5rem] bg-orange-50/50 border-2 border-transparent hover:border-orange-100 transition-all">
                <div className="w-16 h-16 bg-white rounded-2xl shadow-md flex items-center justify-center text-brand-orange">
                  <Trophy size={32} />
                </div>
                <h3 className="text-2xl font-display font-bold">Hravé učení</h3>
                <p className="text-gray-600 leading-relaxed">Učení nemusí být nuda. Sbírej ocenění, sleduj své statistiky a bav se u každého testu.</p>
              </div>

              <div className="space-y-6 p-8 rounded-[2.5rem] bg-purple-50/50 border-2 border-transparent hover:border-purple-100 transition-all">
                <div className="w-16 h-16 bg-white rounded-2xl shadow-md flex items-center justify-center text-brand-purple">
                  <CheckCircle2 size={32} />
                </div>
                <h3 className="text-2xl font-display font-bold">Ověřené materiály</h3>
                <p className="text-gray-600 leading-relaxed">Všechny testy a materiály jsou připraveny zkušenými pedagogy podle aktuálních osnov.</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="py-8 px-4 md:px-12 flex flex-col md:flex-row justify-between items-center gap-4 text-gray-500 text-sm">
        <div className="flex items-center gap-2">
          Vytvořeno s láskou ke studentům ❤️ <span className="font-bold text-gray-700">©ProEdu, s. r. o.</span>
        </div>
        <div className="flex gap-6">
          <Link to="#" className="hover:text-brand-blue transition-colors">Obchodní podmínky</Link>
          <Link to="#" className="hover:text-brand-blue transition-colors">Ochrana údajů</Link>
        </div>
      </footer>
    </div>
  );
}
