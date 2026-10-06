import React from 'react';
import { useAuth } from '../context/AuthContext';

export default function TodoPage() {
  const { profile } = useAuth();
  
  return (
    <div className="page-container">
      <h1 className="text-3xl font-bold mb-4">Moje úkoly</h1>
      <p>Tato sekce se připravuje...</p>
    </div>
  );
}
