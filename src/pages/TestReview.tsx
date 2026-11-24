import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { ArrowLeft, CheckCircle2, XCircle, Award } from 'lucide-react';
import { MathRenderer } from '../components/common/MathRenderer';

export default function TestReview() {
  const { id, testId } = useParams<{ id?: string; testId?: string }>();
  const resolvedTestId = testId || id || '';
  const { user, openAuthModal } = useAuth();

  const [reviewDoc, setReviewDoc] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !resolvedTestId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    async function loadReview() {
      setLoading(true);
      setError(null);
      try {
        const token = await user!.getIdToken();
        const res = await fetch(`/api/assigned-tests/${encodeURIComponent(resolvedTestId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          if (!cancelled && data.test) {
            setReviewDoc(data.test);
            setLoading(false);
            return;
          }
        }

        // Fallback to practice test results collection (`tests/{testId}`)
        const practiceSnap = await getDoc(doc(db, 'tests', resolvedTestId));
        if (practiceSnap.exists()) {
          if (!cancelled) {
            setReviewDoc({ id: practiceSnap.id, ...practiceSnap.data() });
          }
        } else if (!cancelled) {
          setError('Vyhodnocení testu nebylo nalezeno.');
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Nepodařilo se načíst vyhodnocení testu.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadReview();
    return () => {
      cancelled = true;
    };
  }, [user, resolvedTestId]);

  if (!user) {
    return (
      <div className="max-w-xl mx-auto py-12 sm:py-16 text-center space-y-4">
        <h1 className="text-2xl font-bold text-gray-800">Přihlas se pro vyhodnocení testu</h1>
        <p className="text-sm text-gray-500">Vyhodnocení testu je přístupné pouze majiteli testu.</p>
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

  const questions: any[] = Array.isArray(reviewDoc?.questions) ? reviewDoc.questions : [];
  const answersMap: Record<string, string> =
    reviewDoc?.answers && typeof reviewDoc.answers === 'object' && !Array.isArray(reviewDoc.answers)
      ? reviewDoc.answers
      : {};

  return (
    <div className="max-w-3xl mx-auto space-y-5 sm:space-y-6 pb-10">
      <div>
        <Link to="/statistics" className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-600 hover:text-black">
          <ArrowLeft size={16} />
          Zpět na statistiky
        </Link>
      </div>

      {loading ? (
        <Card className="rounded-2xl sm:rounded-3xl border-gray-200">
          <CardContent className="py-12 text-center text-gray-500 font-bold text-sm">
            Načítání vyhodnocení testu...
          </CardContent>
        </Card>
      ) : error || !reviewDoc ? (
        <Card className="rounded-2xl sm:rounded-3xl border-gray-200">
          <CardHeader>
            <CardTitle className="text-xl font-bold text-gray-800 break-words">Vyhodnocení: {resolvedTestId}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-gray-600">
            <p>{error || 'Detailní přehled svých odevzdaných testů najdeš v sekci Statistiky.'}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="rounded-2xl sm:rounded-3xl border-gray-200 shadow-xs">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="text-xl sm:text-2xl font-bold text-gray-900 min-w-0 break-words">
                  {reviewDoc.title || reviewDoc.testTitle || `Vyhodnocení: ${resolvedTestId}`}
                </CardTitle>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {reviewDoc.grade !== undefined && reviewDoc.grade !== null && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-black shrink-0">
                      <Award size={14} /> Známka: {reviewDoc.grade}
                    </span>
                  )}
                  {typeof reviewDoc.score === 'number' && (
                    <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-900 text-xs font-black shrink-0">
                      Skóre: {reviewDoc.score} / {reviewDoc.maxScore ?? reviewDoc.totalQuestions ?? questions.length}
                    </span>
                  )}
                </div>
              </div>
              {reviewDoc.feedback && (
                <div className="mt-3 p-3.5 sm:p-4 rounded-2xl bg-blue-50/70 border border-blue-200 text-sm text-gray-800 break-words overflow-x-auto">
                  <span className="font-bold block text-xs uppercase tracking-wider text-blue-800 mb-1">
                    Hodnocení učitele
                  </span>
                  <MathRenderer content={String(reviewDoc.feedback)} />
                </div>
              )}
            </CardHeader>
          </Card>

          <div className="space-y-4">
            {questions.map((q, idx) => {
              const qKey = q?.id || String(idx);
              const qText = q?.question || q?.text || `Otázka č. ${idx + 1}`;
              const userAns = q?.userAnswer ?? answersMap[qKey] ?? answersMap[String(idx)] ?? '';
              const correctAns = q?.correctAnswer;
              const isCorrect =
                typeof q?.isCorrect === 'boolean'
                  ? q.isCorrect
                  : typeof correctAns === 'string' && correctAns.length > 0
                  ? String(userAns).trim().toLowerCase() === correctAns.trim().toLowerCase()
                  : undefined;

              return (
                <Card key={qKey} className="rounded-2xl sm:rounded-3xl border-gray-200 shadow-xs">
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-black uppercase tracking-wider text-gray-400">
                        Otázka {idx + 1}
                      </span>
                      {isCorrect !== undefined && (
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full shrink-0 ${
                            isCorrect ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          {isCorrect ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                          {isCorrect ? 'Správně' : 'Chyba'}
                        </span>
                      )}
                    </div>
                    <CardTitle className="text-base font-bold text-gray-900 mt-1 min-w-0 max-w-full break-words overflow-x-auto">
                      <MathRenderer content={qText} />
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="text-gray-700 break-words overflow-x-auto">
                      <span className="font-bold">Tvoje odpověď:</span>{' '}
                      {userAns ? (
                        <MathRenderer content={String(userAns)} inline />
                      ) : (
                        <span className="italic text-gray-400">Nezodpovězeno</span>
                      )}
                    </div>
                    {correctAns !== undefined && (
                      <div className="text-emerald-800 break-words overflow-x-auto">
                        <span className="font-bold">Správná odpověď:</span>{' '}
                        <MathRenderer content={String(correctAns)} inline />
                      </div>
                    )}
                    {q?.explanation && (
                      <div className="text-xs sm:text-sm text-gray-600 bg-gray-50 p-3 rounded-xl border border-gray-100 mt-2 break-words overflow-x-auto">
                        <span className="font-bold block mb-1">Vysvětlení:</span>
                        <MathRenderer content={String(q.explanation)} />
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
