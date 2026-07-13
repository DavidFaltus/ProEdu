import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTimer } from '../context/TimerContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Play, Pause, RotateCcw, Sprout, Loader2, Coffee, Tag, CheckSquare, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { cn } from '../lib/utils';

const SEEDS = [
  { emoji: '🌹', name: 'Růže' },
  { emoji: '🪻', name: 'Fialka' },
  { emoji: '🌻', name: 'Slunečnice' },
  { emoji: '🌷', name: 'Tulipán' },
  { emoji: '🪷', name: 'Lilie' },
];

export default function Garden() {
  const { user, profile } = useAuth();
  const {
    timeLeft,
    duration,
    isActive,
    isBreak,
    isOvertime,
    overtimeSeconds,
    selectedPlantEmoji,
    selectedPlantName,
    selectedTodoTitle,
    selectedTag,
    startTimer,
    pauseTimer,
    resumeTimer,
    resetTimer,
    skipToBreak,
    setCustomDuration
  } = useTimer();

  const [todos, setTodos] = useState<any[]>([]);

  // Local settings before start
  const [selectedSeedEmoji, setSelectedSeedEmoji] = useState('🌹');
  const [selectedSeedName, setSelectedSeedName] = useState('Růže');
  const [selectedTodoId, setSelectedTodoId] = useState('');
  const [selectedTodoTitleState, setSelectedTodoTitleState] = useState('');
  const [customTag, setCustomTag] = useState('');
  const [customMinutes, setCustomMinutes] = useState(25);

  const sessions = useMemo(() => {
    if (!profile?.focusSessionsHistory) return [];
    return profile.focusSessionsHistory.map((sess: any) => {
      const completedAtDate = sess.completedAt;
      const safeCompletedAt = {
        toDate: () => {
          if (completedAtDate && typeof completedAtDate.toDate === 'function') {
            return completedAtDate.toDate();
          }
          if (completedAtDate && typeof completedAtDate.seconds === 'number') {
            return new Date(completedAtDate.seconds * 1000);
          }
          if (completedAtDate instanceof Date) {
            return completedAtDate;
          }
          if (typeof completedAtDate === 'string') {
            return new Date(completedAtDate);
          }
          return new Date();
        }
      };
      return {
        ...sess,
        completedAt: safeCompletedAt
      };
    });
  }, [profile?.focusSessionsHistory]);

  useEffect(() => {
    if (!user) return;

    // Load active student todos
    const unsubTodos = onSnapshot(
      query(
        collection(db, 'todos'),
        where('studentId', '==', user.uid),
        where('completed', '==', false)
      ),
      (snap) => {
        setTodos(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    );

    return () => {
      unsubTodos();
    };
  }, [user]);

  const handleStart = () => {
    startTimer(
      customMinutes,
      selectedSeedEmoji,
      selectedSeedName,
      selectedTodoId,
      selectedTodoTitleState,
      customTag
    );
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const getGrowthStage = () => {
    let emoji = '🌱';
    let label = 'Připraveno k sázení';
    let labelColor = 'text-gray-400';
    let animateClass = 'animate-bounce';

    if (isOvertime) {
      emoji = selectedPlantEmoji;
      label = 'Pauza vypršela!';
      labelColor = 'text-[#7C2D12] font-black';
      animateClass = 'animate-pulse';
    } else if (isBreak) {
      emoji = selectedPlantEmoji;
      label = 'Pauza / Odpočinek';
      labelColor = 'text-blue-500';
      animateClass = 'animate-pulse';
    } else if (isActive) {
      const ratio = 1 - (timeLeft / duration);
      if (ratio < 0.25) {
        emoji = '🌱';
        label = 'Semínko (0-25%)';
        labelColor = 'text-gray-400';
        animateClass = 'animate-pulse';
      } else if (ratio < 0.50) {
        emoji = '🌿';
        label = 'Klíček (25-50%)';
        labelColor = 'text-green-500';
        animateClass = 'animate-pulse';
      } else if (ratio < 0.75) {
        emoji = '🌸';
        label = 'Poupě (50-75%)';
        labelColor = 'text-pink-500';
        animateClass = 'animate-pulse';
      } else {
        emoji = selectedPlantEmoji;
        label = 'Vykvetlo! (75-100%)';
        labelColor = 'text-yellow-500 animate-pulse';
        animateClass = 'animate-bounce';
      }
    }

    return (
      <div className="flex flex-col items-center justify-center gap-2 h-28 w-full">
        <span className={cn("text-7xl select-none leading-none", animateClass)}>{emoji}</span>
        <span className={cn("text-[10px] font-black uppercase tracking-widest", labelColor)}>{label}</span>
      </div>
    );
  };

  return (
    <div className="page-container">
      <section className="text-center space-y-6 max-w-3xl mx-auto mb-12">
        <motion.h1 
          initial={{ opacity: 0, y: -20 }} 
          animate={{ opacity: 1, y: 0 }} 
          className="text-5xl md:text-6xl font-display font-black text-[#1E1B18]"
        >
          Moje Zahrádka
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          transition={{ delay: 0.2 }} 
          className="text-xl text-[#19724F] font-bold leading-relaxed flex items-center justify-center gap-2"
        >
          <span>Soustřeď se na učení, pěstuj květiny a plň své úkoly!</span> 🌿
        </motion.p>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-12">
        {/* TIMER SECTION */}
        <Card className="rounded-[2.5rem] border border-green-100 shadow-md bg-white p-8 lg:col-span-1 flex flex-col items-stretch space-y-6 text-left">
          <CardHeader className="p-0 text-left w-full">
            <CardTitle className={cn(
              "font-sans font-black text-2xl md:text-3xl leading-none",
              isOvertime ? "text-[#7C2D12]" : isBreak ? "text-blue-600" : "text-green-700"
            )}>
              {isOvertime ? 'Pauza vypršela!' : isBreak ? 'Čas na pauzu' : 'Focus Timer'}
            </CardTitle>
            <CardDescription className={cn(
              "font-semibold text-xs mt-1.5 leading-relaxed",
              isOvertime ? "text-orange-850" : isBreak ? "text-blue-500" : "text-green-600"
            )}>
              {isOvertime 
                ? 'Přetahuješ limit přestávky.' 
                : isBreak 
                ? 'Odpočiň si, zasloužíš si to.' 
                : isActive 
                ? `Pracuješ na květině: ${selectedPlantName}` 
                : 'Vyber semínko a začni se soustředit.'
              }
            </CardDescription>
          </CardHeader>
          
          <CardContent className="p-0 flex flex-col items-center w-full space-y-6">
            {/* Visual growth animation */}
            <div className="w-full flex items-center justify-center">
              {getGrowthStage()}
            </div>

            <div className={cn(
              "w-48 h-48 rounded-full flex flex-col items-center justify-center border-8 transition-all duration-500 shadow-inner",
              isOvertime 
                ? 'border-orange-800 bg-orange-950/20 text-[#7C2D12]' 
                : isBreak 
                ? 'border-blue-400 bg-blue-50 text-blue-600' 
                : 'border-green-400 bg-green-50 text-green-700'
            )}>
              <span className="font-sans font-black text-5xl tabular-nums tracking-tighter">
                {isOvertime ? `+${formatTime(overtimeSeconds)}` : formatTime(timeLeft)}
              </span>
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-1">
                {isOvertime ? 'Overtime' : isBreak ? 'Pauza' : 'Focus'}
              </span>
            </div>

            {/* Paired Todo/Tag Active Label */}
            {(selectedTodoTitle || selectedTag) && isActive && (
              <div className="w-full bg-gray-50 p-3 rounded-xl border border-gray-100 text-left space-y-1">
                {selectedTodoTitle && (
                  <div className="flex items-center gap-2 text-xs font-bold text-gray-600">
                    <CheckSquare size={14} className="text-green-500" />
                    <span className="truncate">{selectedTodoTitle}</span>
                  </div>
                )}
                {selectedTag && (
                  <div className="flex items-center gap-2 text-xs font-bold text-gray-600">
                    <Tag size={14} className="text-[#B80053]" />
                    <span>{selectedTag}</span>
                  </div>
                )}
              </div>
            )}

            {/* Main Controls */}
            <div className="flex items-center gap-4">
              {!isActive && !isBreak && !isOvertime ? (
                <Button 
                  onClick={handleStart}
                  className="rounded-full px-8 h-14 bg-green-500 hover:bg-green-600 text-white font-black text-lg shadow-lg shadow-green-100 flex items-center gap-2 cursor-pointer"
                >
                  <Play fill="currentColor" size={18} />
                  <span>Sázet semínko</span>
                </Button>
              ) : (
                <>
                  <Button 
                    onClick={() => isActive ? pauseTimer() : resumeTimer()} 
                    className={cn(
                      "rounded-full w-14 h-14 p-0 flex items-center justify-center shadow-lg transition-transform hover:scale-105 cursor-pointer",
                      isOvertime 
                        ? 'bg-orange-800 hover:bg-orange-950 text-white' 
                        : isBreak 
                        ? 'bg-blue-500 hover:bg-blue-600 text-white' 
                        : 'bg-green-500 hover:bg-green-600 text-white'
                    )}
                  >
                    {isActive ? <Pause fill="currentColor" size={24} /> : <Play fill="currentColor" size={24} className="ml-1" />}
                  </Button>
                  <Button 
                    onClick={resetTimer} 
                    variant="outline"
                    className="rounded-full w-12 h-12 p-0 flex items-center justify-center text-gray-500 hover:bg-gray-100 border-2 cursor-pointer"
                  >
                    <RotateCcw size={20} />
                  </Button>
                </>
              )}
            </div>

            {/* Quick Break jump options */}
            <div className="w-full pt-4 border-t border-gray-100 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => skipToBreak(5)}
                className="flex-1 rounded-xl h-10 text-xs font-bold flex items-center gap-1 border-gray-200 cursor-pointer"
              >
                <Coffee size={12} className="text-blue-500" />
                <span>Pauza 5m</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => skipToBreak(10)}
                className="flex-1 rounded-xl h-10 text-xs font-bold flex items-center gap-1 border-gray-200 cursor-pointer"
              >
                <Coffee size={12} className="text-blue-500" />
                <span>Pauza 10m</span>
              </Button>
            </div>
          </CardContent>

          {/* Seed Selection Form (Only when idle) */}
          {!isActive && !isBreak && !isOvertime && (
            <div className="w-full space-y-4 pt-4 border-t border-gray-100 text-left">
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block mb-2 px-1">Vyber si semínko</label>
                <div className="grid grid-cols-5 gap-2 bg-gray-50 p-2 rounded-2xl border border-gray-100">
                  {SEEDS.map(seed => (
                    <button
                      key={seed.name}
                      onClick={() => {
                        setSelectedSeedEmoji(seed.emoji);
                        setSelectedSeedName(seed.name);
                      }}
                      className={cn(
                        "h-10 rounded-xl flex items-center justify-center hover:bg-white hover:scale-105 hover:shadow-sm transition-all cursor-pointer border-2 text-xl",
                        selectedSeedEmoji === seed.emoji ? "border-green-500 bg-white" : "border-transparent"
                      )}
                      title={seed.name}
                    >
                      {seed.emoji}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block mb-2 px-1">Přiřadit k úkolu</label>
                <select
                  value={selectedTodoId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedTodoId(id);
                    const todo = todos.find(t => t.id === id);
                    setSelectedTodoTitleState(todo ? todo.title : '');
                  }}
                  className="w-full h-11 rounded-xl bg-gray-50 border border-gray-150 px-4 text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-green-400/20"
                >
                  <option value="">-- Bez úkolu --</option>
                  {todos.map(todo => (
                    <option key={todo.id} value={todo.id}>{todo.title}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block mb-2 px-1">Předmět / Otagovat</label>
                <input
                  type="text"
                  placeholder="Např. Matematika, Čeština..."
                  value={customTag}
                  onChange={(e) => setCustomTag(e.target.value)}
                  className="w-full h-11 rounded-xl bg-gray-50 border border-gray-150 px-4 text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-green-400/20"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block mb-2 px-1">Délka soustředění</label>
                <div className="flex flex-wrap gap-2">
                  {[0.166, 15, 25, 40, 60].map(mins => {
                    const isTest = mins === 0.166;
                    const label = isTest ? "10s (Test)" : `${mins}m`;
                    return (
                      <button
                        key={mins}
                        onClick={() => {
                          setCustomMinutes(mins);
                          setCustomDuration(mins);
                        }}
                        className={cn(
                          "flex-1 h-9 rounded-lg font-bold text-xs transition-all cursor-pointer border min-w-[70px]",
                          customMinutes === mins 
                            ? "bg-green-500 text-white border-green-500 shadow-sm" 
                            : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* VIRTUAL GARDEN SECTION */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-gradient-to-br from-[#D5F7E5] to-[#BCEECF] rounded-[2.5rem] p-8 min-h-[400px] relative overflow-hidden border border-green-200/30 shadow-md flex flex-col">
            <div className="flex justify-between items-center mb-6 z-10 relative">
              <h3 className="font-playful text-3xl text-[#0F5238] m-0 leading-none">Moje úroda</h3>
              <div className="px-4 py-1.5 bg-white/60 backdrop-blur-sm rounded-full flex items-center gap-2 border border-white/20 text-[#0F5238] font-bold">
                <Sprout size={16} />
                <span>{sessions.length} rostlinek</span>
              </div>
            </div>

            <div className="flex-1 z-10 relative bg-white/30 backdrop-blur-sm rounded-[1.5rem] p-6 border border-white/40">
              {sessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center text-green-800/60 opacity-80 pt-10">
                  <Sprout size={48} className="mb-4 opacity-50" />
                  <p className="font-bold">Zatím tu nic neroste.</p>
                  <p className="text-sm">Dokonči svůj první Focus blok a vypěstuj svou první květinu!</p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-6 items-end justify-start pt-4">
                  {sessions.map((sess, idx) => (
                    <div 
                      key={sess.id || idx} 
                      className="text-5xl animate-in fade-in zoom-in duration-500 delay-75 hover:scale-125 transition-transform cursor-pointer relative group" 
                      title={`${sess.plantName} (#${sessions.length - idx})`}
                    >
                      <span>{sess.plantType}</span>
                      
                      {/* Floating tooltip on hover */}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:flex flex-col items-center w-48 bg-white border border-gray-100 p-3 rounded-xl shadow-xl z-20 text-[#1E1B18] text-xs space-y-1">
                        <div className="font-black text-gray-800 text-sm flex items-center gap-1.5">
                          <span>{sess.plantType}</span>
                          <span>{sess.plantName}</span>
                        </div>
                        <div className="text-gray-400 font-bold text-[10px]">
                          {sess.completedAt?.toDate().toLocaleDateString('cs-CZ')} v {sess.completedAt?.toDate().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div className="text-green-600 font-bold">
                          Délka: {Math.round(sess.duration / 60)} min
                        </div>
                        {sess.todoTitle && (
                          <div className="text-[10px] text-gray-500 font-medium truncate w-full text-center">
                            Úkol: {sess.todoTitle}
                          </div>
                        )}
                        {sess.tag && (
                          <div className="px-2 py-0.5 bg-pink-50 text-[#B80053] rounded-full text-[9px] font-bold">
                            #{sess.tag}
                          </div>
                        )}
                        <div className="w-2 h-2 bg-white border-b border-r border-gray-150 rotate-45 -mb-4 mt-1" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Dekorativní prvky na pozadí */}
            <div className="absolute -bottom-10 -right-10 text-9xl opacity-20 filter blur-sm">🌳</div>
            <div className="absolute top-10 -left-10 text-8xl opacity-20 filter blur-sm">🌻</div>
          </div>

          {/* HISTORICAL FOCUS LOG TABLE */}
          {sessions.length > 0 && (
            <Card className="rounded-[2.5rem] border-none shadow-md bg-white p-6">
              <div className="flex items-center gap-3 mb-6">
                <Calendar size={20} className="text-green-500" />
                <h4 className="font-sans font-black text-xl text-gray-900">Historie soustředění</h4>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-gray-600">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs text-gray-400 font-black uppercase tracking-wider pb-3">
                      <th className="pb-3 pl-2">Květina</th>
                      <th className="pb-3">Úkol / Projekt</th>
                      <th className="pb-3">Předmět</th>
                      <th className="pb-3">Doba</th>
                      <th className="pb-3 pr-2 text-right">Dokončeno</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.slice(0, 5).map((sess, idx) => (
                      <tr key={sess.id || idx} className="border-b border-gray-50/50 hover:bg-gray-50/30 transition-colors">
                        <td className="py-3 pl-2 font-bold flex items-center gap-2 text-gray-900">
                          <span className="text-xl">{sess.plantType}</span>
                          <span>{sess.plantName}</span>
                        </td>
                        <td className="py-3 text-xs font-semibold max-w-[150px] truncate">
                          {sess.todoTitle || <span className="text-gray-300">- bez úkolu -</span>}
                        </td>
                        <td className="py-3">
                          {sess.tag ? (
                            <span className="px-2.5 py-1 bg-pink-50 text-[#B80053] rounded-full text-[10px] font-black uppercase tracking-wider">
                              {sess.tag}
                            </span>
                          ) : (
                            <span className="text-gray-300 font-bold text-xs">-</span>
                          )}
                        </td>
                        <td className="py-3 font-bold text-green-600">
                          {Math.round(sess.duration / 60)} min
                        </td>
                        <td className="py-3 pr-2 text-right text-xs font-bold text-gray-400">
                          {sess.completedAt?.toDate().toLocaleDateString('cs-CZ')} v {sess.completedAt?.toDate().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {sessions.length > 5 && (
                  <p className="text-center text-xs text-gray-400 font-bold mt-4">
                    Zobrazeno posledních 5 z {sessions.length} dokončených relací
                  </p>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>

      <section className="bg-[#FAF7F0] rounded-[3rem] p-12 text-[#1E1B18] text-center space-y-8 relative overflow-hidden mt-12 border border-[#E6E0D4] w-full">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/40 rounded-full -mr-32 -mt-32 blur-3xl" />
        <div className="relative z-10 space-y-4">
          <h2 className="text-4xl font-display font-bold">Nevíš si rady s výběrem?</h2>
          <p className="text-gray-600 text-xl max-w-xl mx-auto">Napiš nám a rádi ti poradíme, jak nejlépe zvýšit svou produktivitu.</p>
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
