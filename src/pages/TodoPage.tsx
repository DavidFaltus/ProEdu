import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function TodoPage() {
  const { user, openAuthModal } = useAuth();

  if (!user) {
    return (
      <div className="page-container max-w-xl mx-auto py-16 text-center space-y-4">
        <h1 className="text-3xl sm:text-4xl font-playful font-black text-gray-700">Moje úkoly</h1>
        <p className="text-sm text-gray-500">Studijní plán a úkoly jsou dostupné po přihlášení.</p>
        <button
          type="button"
          onClick={() => openAuthModal()}
          className="px-5 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-sm cursor-pointer"
        >
          Přihlásit se
        </button>
      </div>
    );
  }

  return (
    <div className="page-container space-y-4">
      <h1 className="text-3xl sm:text-4xl md:text-5xl font-playful font-black text-gray-700">Moje úkoly</h1>
      <p className="text-sm text-gray-600">
        Svůj studijní plán a úkoly můžeš spravovat přímo v{' '}
        <Link to="/calendar" className="text-blue-600 font-bold hover:underline">kalendáři</Link>.
      </p>
    </div>
  );
}
