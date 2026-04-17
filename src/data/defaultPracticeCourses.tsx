import { GraduationCap, Percent, Shapes } from 'lucide-react';
import { PracticeCourse } from '../types';

export const defaultPracticeCourses: Partial<PracticeCourse>[] = [
  {
    id: 'arithmetic-practice',
    title: 'Mistr Aritmetiky',
    description: 'Procvičování základních početních operací, priorit operací a práce s čísly.',
    topic: 'Aritmetika',
    difficulty: 'Začátečník',
    questionCount: 10,
    students: 1240,
    color: '#3b82f6',
    icon: <GraduationCap size={32} />
  },
  {
    id: 'fractions-practice',
    title: 'Zlomky a Procenta',
    description: 'Ovládni převody, krácení zlomků a výpočty s procenty hravě.',
    topic: 'Zlomky a procenta',
    difficulty: 'Střední',
    questionCount: 15,
    students: 850,
    color: '#8b5cf6',
    icon: <Percent size={32} />
  },
  {
    id: 'geometry-practice',
    title: 'Geometrický Guru',
    description: 'Úhly, plochy, objemy a rýsování v jednom komplexním bloku.',
    topic: 'Geometrie',
    difficulty: 'Pokročilý',
    questionCount: 12,
    students: 620,
    color: '#f59e0b',
    icon: <Shapes size={32} />
  },
  {
    id: 'equations-practice',
    title: 'Vládce Rovnic',
    description: 'Lineární rovnice, soustavy a úpravy výrazů krok za krokem.',
    topic: 'Rovnice',
    difficulty: 'Střední',
    questionCount: 10,
    students: 450,
    color: '#10b981',
    icon: <Shapes size={32} />
  },
  {
    id: 'word-problems-practice',
    title: 'Logický Expert',
    description: 'Řešení slovních úloh, selský rozum a aplikace matematiky v praxi.',
    topic: 'Slovní úlohy',
    difficulty: 'Pokročilý',
    questionCount: 8,
    students: 310,
    color: '#ef4444',
    icon: <GraduationCap size={32} />
  }
];

