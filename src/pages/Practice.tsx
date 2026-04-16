import { motion } from 'motion/react';
import { BookOpen, Star, Clock, Users, GraduationCap, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { startPracticeCourse } from '../services/courseService';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { MathTopic, PracticeCourse } from '../types';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

const defaultCourses: { id: string, title: string, description: string, icon: any, duration: string, students: string, rating: number, color: string, topic: MathTopic, difficulty: string }[] = [
  {
    id: 'prep',
    title: 'Příprava na přijímačky 9. třída',
    description: 'Komplexní příprava z matematiky pro žáky 9. tříd hlásící se na SŠ.',
    icon: <GraduationCap className="text-brand-blue" size={32} />,
    duration: '12 týdnů',
    students: '1500+',
    rating: 4.9,
    color: 'bg-blue-50',
    topic: 'Aritmetika',
    difficulty: 'Středně pokročilý'
  },
  {
    id: 'maturita',
    title: 'Maturitní minimum',
    description: 'Zopakování nejdůležitějších okruhů k maturitní zkoušce z matematiky.',
    icon: <BookOpen className="text-brand-purple" size={32} />,
    duration: '8 týdnů',
    students: '800+',
    rating: 4.8,
    color: 'bg-purple-50',
    topic: 'Zlomky a procenta',
    difficulty: 'Pokročilý'
  },
  {
    id: 'geometry',
    title: 'Geometrie hravě',
    description: 'Speciální kurz zaměřený na konstrukční úlohy a prostorovou představivost.',
    icon: <Star className="text-brand-orange" size={32} />,
    duration: '4 týdny',
    students: '450+',
    rating: 5.0,
    color: 'bg-orange-50',
    topic: 'Geometrie',
    difficulty: 'Začátečník'
  }
];

export default function Practice() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [startingCourse, setStartingCourse] = useState<string | null>(null);
  const [dbCourses, setDbCourses] = useState<PracticeCourse[]>([]);
  const [filterTopic, setFilterTopic] = useState<string>('all');
  const [filterDifficulty, setFilterDifficulty] = useState<string>('all');

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'practiceCourses'), (snap) => {
      const allDbCourses = snap.docs.map(d => ({ id: d.id, ...d.data() } as PracticeCourse));
      // Only show visible courses to students (default is true if undefined)
      setDbCourses(allDbCourses.filter(c => c.isVisible !== false));
    });
    return () => unsub();
  }, []);

  const allCourses = [
    ...defaultCourses.map(c => ({ ...c, topics: [c.topic] })),
    ...dbCourses.map(c => ({
      id: c.id,
      title: c.title,
      description: c.description,
      icon: <BookOpen className={`text-${c.color && c.color.startsWith('bg-') ? c.color.replace('bg-', '').replace('-50', '') : 'blue'}-500`} size={32} />,
      duration: c.duration,
      students: 'Nové',
      rating: 5.0,
      color: c.color,
      topic: c.topic,
      topics: c.topics && c.topics.length > 0 ? c.topics : [c.topic],
      difficulty: c.difficulty
    }))
  ];

  const filteredCourses = allCourses.filter(c => {
    if (filterTopic !== 'all' && !c.topics.includes(filterTopic as any)) return false;
    if (filterDifficulty !== 'all' && c.difficulty !== filterDifficulty) return false;
    return true;
  });

  const handleStartCourse = async (courseId: string, topic: MathTopic, title: string, description: string) => {
    if (!user) {
      toast.error('Pro spuštění procvičování se musíš přihlásit.');
      navigate('/login');
      return;
    }

    setStartingCourse(courseId);
    try {
      const assignedId = await startPracticeCourse(user.uid, profile?.name || 'Student', topic, title, description);
      toast.success('Procvičování bylo úspěšně spuštěno!');
      navigate(`/test/${assignedId}`);
    } catch (error: any) {
      toast.error(error.message || 'Chyba při spouštění procvičování.');
    } finally {
      setStartingCourse(null);
    }
  };

  return (
    <div className="page-container">
      <section className="text-center space-y-6 max-w-3xl mx-auto">
        <motion.h1 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-5xl md:text-6xl font-display font-bold text-gray-900"
        >
          Naše <span className="text-brand-blue">procvičování</span>
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-xl text-gray-500 leading-relaxed"
        >
          Vyber si téma, které chceš procvičit. 
          Všechny úlohy jsou navrženy tak, aby ti pomohly k lepším výsledkům.
        </motion.p>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex flex-col sm:flex-row gap-4 justify-center mt-8 bg-white p-4 rounded-3xl shadow-sm border border-gray-100"
        >
          <div className="w-full sm:w-64">
            <Select value={filterTopic} onValueChange={setFilterTopic}>
              <SelectTrigger className="rounded-xl h-12 border-gray-100 bg-gray-50/50">
                <SelectValue placeholder="Všechny předměty" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Všechny předměty</SelectItem>
                <SelectItem value="Aritmetika">Aritmetika</SelectItem>
                <SelectItem value="Geometrie">Geometrie</SelectItem>
                <SelectItem value="Zlomky a procenta">Zlomky a procenta</SelectItem>
                <SelectItem value="Rovnice">Rovnice</SelectItem>
                <SelectItem value="Slovní úlohy">Slovní úlohy</SelectItem>
                <SelectItem value="Jednotky a měření">Jednotky a měření</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-full sm:w-64">
            <Select value={filterDifficulty} onValueChange={setFilterDifficulty}>
              <SelectTrigger className="rounded-xl h-12 border-gray-100 bg-gray-50/50">
                <SelectValue placeholder="Všechny obtížnosti" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Všechny obtížnosti</SelectItem>
                <SelectItem value="Začátečník">Začátečník</SelectItem>
                <SelectItem value="Středně pokročilý">Středně pokročilý</SelectItem>
                <SelectItem value="Pokročilý">Pokročilý</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </motion.div>
      </section>

      <div className="grid md:grid-cols-3 gap-8">
        {filteredCourses.map((course, i) => (
          <motion.div
            key={course.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 + 0.3 }}
          >
            <Card className="rounded-[2.5rem] border-none shadow-xl hover:shadow-2xl transition-all h-full flex flex-col overflow-hidden group">
              <div className={`h-3 w-full ${course.color.replace('bg-', 'bg-brand-').replace('-50', '')}`} />
              <CardHeader className="space-y-4">
                <div className="flex justify-between items-start">
                  <div className={`w-16 h-16 ${course.color} rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform`}>
                    {course.icon}
                  </div>
                  <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-bold uppercase">
                    {course.difficulty}
                  </span>
                </div>
                <CardTitle className="text-2xl font-display font-bold">{course.title}</CardTitle>
                <CardDescription className="text-gray-500 text-base">{course.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 flex-grow">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2 text-sm text-gray-400 font-bold">
                    <Clock size={16} /> {course.duration}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-400 font-bold">
                    <Users size={16} /> {course.students}
                  </div>
                </div>
                <div className="pt-6 mt-auto">
                  <Button 
                    onClick={() => handleStartCourse(course.id, course.topic, course.title, course.description)}
                    disabled={startingCourse === course.id}
                    className="w-full btn-blue rounded-xl h-12 gap-2 text-lg font-bold"
                  >
                    {startingCourse === course.id ? (
                      <Loader2 className="animate-spin" size={20} />
                    ) : (
                      <>Spustit procvičování <ArrowRight size={20} /></>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
        {filteredCourses.length === 0 && (
          <div className="col-span-full text-center py-20 bg-white/50 rounded-[3rem] border-2 border-dashed border-gray-100">
            <BookOpen size={48} className="mx-auto text-gray-200 mb-4" />
            <p className="text-gray-400 font-bold text-xl">Nenalezeny žádné kurzy pro vybrané filtry.</p>
          </div>
        )}
      </div>

      <section className="bg-brand-blue rounded-[3rem] p-12 text-white text-center space-y-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl" />
        <div className="relative z-10 space-y-4">
          <h2 className="text-4xl font-display font-bold">Nevíš si rady s výběrem?</h2>
          <p className="text-blue-100 text-xl max-w-xl mx-auto">Napiš nám a my ti rádi poradíme, které téma je pro tebe to pravé.</p>
          <div className="pt-4">
            <Link to="/contact" className="inline-flex items-center justify-center bg-white text-brand-blue px-10 h-14 rounded-2xl text-xl font-bold hover:scale-105 transition-transform shadow-xl">
              Kontaktuj nás
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
