import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import { CheckCircle2, ArrowLeft, Clock, Send } from 'lucide-react';
import { MathRenderer } from '../components/common/MathRenderer';

interface AssignedTestQuestion {
  id?: string;
  question?: string;
  text?: string;
  type?: string;
  options?: string[];
  hint?: string;
}

interface AssignedTestDoc {
  id: string;
  title?: string;
  testTitle?: string;
  description?: string;
  status?: string;
  questions?: AssignedTestQuestion[];
  answers?: Record<string, string>;
}

export default function TestTaker() {
  const { id, testId } = useParams<{ id?: string; testId?: string }>();
  const resolvedTestId = testId || id || '';
  const { user, openAuthModal } = useAuth();
  const navigate = useNavigate();

  const [testDoc, setTestDoc] = useState<AssignedTestDoc | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedAtMsRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!user || !resolvedTestId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    async function loadTest() {
      setLoading(true);
      setError(null);
      try {
        const token = await user!.getIdToken();
        const res = await fetch(`/api/assigned-tests/${encodeURIComponent(resolvedTestId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || 'Nepodařilo se načíst zadaný test.');
        }
        if (!cancelled && data.test) {
          setTestDoc(data.test);
          if (data.test.answers && typeof data.test.answers === 'object') {
            setAnswers(data.test.answers);
          }
          startedAtMsRef.current = Date.now();
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Test se nepodařilo načíst.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadTest();
    return () => {
      cancelled = true;
    };
  }, [user, resolvedTestId]);

  if (!user) {
    return (
      <div className="max-w-xl mx-auto py-12 sm:py-16 text-center space-y-4">
        <h1 className="text-2xl font-bold text-gray-800">Přihlas se pro zobrazení testu</h1>
        <p className="text-sm text-gray-500">Testy jsou dostupné pouze přihlášeným studentům.</p>
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testDoc || submitting) return;

    setSubmitting(true);
    try {
      const token = await user.getIdToken();
      const timeSpentSeconds = Math.max(1, Math.round((Date.now() - startedAtMsRef.current) / 1000));
      const res = await fetch(`/api/assigned-tests/${encodeURIComponent(resolvedTestId)}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ answers, timeSpentSeconds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Nepodařilo se odevzdat test.');
      }
      toast.success('Test byl úspěšně odevzdán!');
      navigate(`/review/${encodeURIComponent(resolvedTestId)}`);
    } catch (err: any) {
      toast.error(err?.message || 'Nepodařilo se odevzdat test.');
    } finally {
      setSubmitting(false);
    }
  };

  const questions = Array.isArray(testDoc?.questions) ? testDoc!.questions! : [];
  const isCompleted = testDoc?.status === 'submitted' || testDoc?.status === 'graded';
  const answeredCount = questions.reduce((count, q, idx) => {
    const qKey = q.id || String(idx);
    return count + ((answers[qKey] ?? '').trim().length > 0 ? 1 : 0);
  }, 0);

  return (
    <div className="max-w-3xl mx-auto space-y-5 sm:space-y-6 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/practice" className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-600 hover:text-black shrink-0">
          <ArrowLeft size={16} />
          Zpět na procvičování
        </Link>
        {isCompleted && (
          <Link to={`/review/${encodeURIComponent(resolvedTestId)}`} className="shrink-0">
            <Button variant="outline" className="rounded-xl font-bold text-xs cursor-pointer">
              Zobrazit vyhodnocení
            </Button>
          </Link>
        )}
      </div>

      {loading ? (
        <Card className="rounded-3xl border-gray-200">
          <CardContent className="py-12 text-center text-gray-500 font-bold text-sm">
            Načítání zadaného testu...
          </CardContent>
        </Card>
      ) : error || !testDoc ? (
        <Card className="rounded-3xl border-gray-200">
          <CardHeader>
            <CardTitle className="text-xl font-bold text-gray-800">Test: {resolvedTestId}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-gray-600">
            <p>{error || 'Tento test nebyl nalezen.'}</p>
            <p>Pro spuštění procvičování přejdi do sekce Procvičování nebo na svůj přehled.</p>
          </CardContent>
        </Card>
      ) : isCompleted ? (
        <Card className="rounded-3xl border-emerald-200 bg-emerald-50/40">
          <CardContent className="py-10 text-center space-y-4">
            <CheckCircle2 className="mx-auto text-emerald-600" size={40} />
            <h2 className="text-2xl font-bold text-gray-900">
              {testDoc.title || testDoc.testTitle || 'Přiřazený test'}
            </h2>
            <p className="text-sm text-gray-600">Tento test již byl odevzdán.</p>
            <Link to={`/review/${encodeURIComponent(resolvedTestId)}`}>
              <Button className="rounded-xl bg-[#1E1B18] text-white font-bold text-xs px-6 cursor-pointer">
                Přejít na vyhodnocení testu
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-6">
          <Card className="rounded-2xl sm:rounded-3xl border-gray-200 shadow-xs">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <CardTitle className="text-xl sm:text-2xl font-bold text-gray-900 min-w-0 break-words">
                  {testDoc.title || testDoc.testTitle || 'Přiřazený test'}
                </CardTitle>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-800 bg-blue-50 px-3 py-1 rounded-full shrink-0">
                    Zodpovězeno {answeredCount} / {questions.length}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 px-3 py-1 rounded-full shrink-0">
                    <Clock size={13} /> {questions.length} otázek
                  </span>
                </div>
              </div>
              {testDoc.description && (
                <div className="text-sm text-gray-500 mt-1 break-words">
                  <MathRenderer content={testDoc.description} />
                </div>
              )}
            </CardHeader>
          </Card>

          {questions.length === 0 ? (
            <Card className="rounded-2xl sm:rounded-3xl border-gray-200">
              <CardContent className="py-8 text-center text-sm text-gray-500">
                Tento test zatím neobsahuje žádné otázky.
              </CardContent>
            </Card>
          ) : (
            questions.map((q, idx) => {
              const qKey = q.id || String(idx);
              const qText = q.question || q.text || `Otázka č. ${idx + 1}`;
              const hasOptions = Array.isArray(q.options) && q.options.length > 0;
              const currentVal = answers[qKey] ?? '';

              return (
                <Card key={qKey} className="rounded-2xl sm:rounded-3xl border-gray-200 shadow-xs">
                  <CardHeader className="pb-3">
                    <span className="text-xs font-black uppercase tracking-wider text-gray-400">
                      Otázka {idx + 1} z {questions.length}
                    </span>
                    <CardTitle className="text-base sm:text-lg font-bold text-gray-900 leading-snug mt-1 min-w-0 max-w-full overflow-x-auto break-words">
                      <MathRenderer content={qText} />
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {hasOptions ? (
                      <div className="grid gap-2">
                        {q.options!.map((opt, optIdx) => {
                          const selected = currentVal === opt;
                          return (
                            <button
                              key={optIdx}
                              type="button"
                              onClick={() => setAnswers((prev) => ({ ...prev, [qKey]: opt }))}
                              className={`w-full text-left px-3.5 sm:px-4 py-3 rounded-xl sm:rounded-2xl border text-sm font-medium transition-all cursor-pointer min-w-0 max-w-full overflow-x-auto ${
                                selected
                                  ? 'border-black bg-gray-900 text-white font-bold'
                                  : 'border-gray-200 bg-white hover:border-gray-400 text-gray-800'
                              }`}
                            >
                              <MathRenderer content={opt} inline />
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <Input
                        value={currentVal}
                        onChange={(e) => setAnswers((prev) => ({ ...prev, [qKey]: e.target.value }))}
                        placeholder="Zadej svou odpověď..."
                        className="h-12 text-base rounded-xl"
                      />
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}

          {questions.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="text-xs font-bold text-gray-500 text-center sm:text-left">
                Zodpovězeno {answeredCount} z {questions.length} otázek
              </span>
              <Button
                type="submit"
                disabled={submitting}
                className="w-full sm:w-auto justify-center rounded-2xl bg-[#1E1B18] text-white font-bold text-sm h-12 px-8 flex items-center gap-2 cursor-pointer"
              >
                <Send size={16} />
                {submitting ? 'Odevzdávám...' : 'Odevzdat test'}
              </Button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
