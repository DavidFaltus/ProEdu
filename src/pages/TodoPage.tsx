import { useAuth } from '../context/AuthContext';
import TodoManager from '../components/TodoManager';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';

export default function TodoPage() {
  const { profile } = useAuth();

  return (
    <div className="page-container">
      <section className="text-center space-y-6 max-w-3xl mx-auto mb-12">
        <motion.h1 
          initial={{ opacity: 0, y: -20 }} 
          animate={{ opacity: 1, y: 0 }} 
          className="text-5xl md:text-6xl font-display font-black text-[#1E1B18]"
        >
          Moje úkoly
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          transition={{ delay: 0.2 }} 
          className="text-xl text-gray-500 leading-relaxed"
        >
          Uspořádej si své úkoly a studijní plány.
        </motion.p>
      </section>

      <div className="max-w-4xl mx-auto bg-white p-8 rounded-[2.5rem] shadow-xl border border-gray-100/50 mt-12">
        <TodoManager targetStudentId={profile?.uid || ''} variant="default" />
      </div>

      <section className="bg-[#FAF7F0] rounded-[3rem] p-12 text-[#1E1B18] text-center space-y-8 relative overflow-hidden mt-12 border border-[#E6E0D4] max-w-4xl mx-auto w-full">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/40 rounded-full -mr-32 -mt-32 blur-3xl" />
        <div className="relative z-10 space-y-4">
          <h2 className="text-4xl font-display font-bold">Nevíš si rady s výběrem?</h2>
          <p className="text-gray-600 text-xl max-w-xl mx-auto">Napiš nám a rádi ti poradíme, jak si nejlépe rozvrhnout své studium.</p>
          <div className="pt-4">
            <Link to="/contact" className="inline-flex items-center justify-center bg-[#F5C400] text-[#1E1B18] px-10 h-14 rounded-2xl text-xl font-black hover:scale-105 transition-transform shadow-xl hover:bg-[#F5C400]/90">
              Kontaktuj nás
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
