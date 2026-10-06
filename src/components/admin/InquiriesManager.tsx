import React, { useState, useEffect } from 'react';
import { MessageSquare, Send, CheckCircle2, Clock, User, BookOpen, RefreshCw, Edit3 } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Textarea } from '../ui/textarea';
import { toast } from 'sonner';
import { getAllInquiries, replyToInquiry, QuestionInquiry } from '../../services/inquiryService';
import { useAuth } from '../../context/AuthContext';

export default function InquiriesManager() {
  const { user, profile } = useAuth();
  const [inquiries, setInquiries] = useState<QuestionInquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pending' | 'answered'>('pending');

  // Per-inquiry reply text state
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);

  const fetchInquiries = async () => {
    setLoading(true);
    try {
      const data = await getAllInquiries();
      setInquiries(data);
    } catch (err) {
      console.error('Error fetching inquiries:', err);
      toast.error('Nepodařilo se načíst dotazy studentů');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInquiries();
  }, []);

  const pendingInquiries = inquiries.filter(i => i.status === 'pending');
  const answeredInquiries = inquiries.filter(i => i.status === 'answered');

  const handleSendReply = async (inquiry: QuestionInquiry) => {
    const text = replyTexts[inquiry.id]?.trim();
    if (!text) {
      toast.error('Prosím zadejte text odpovědi.');
      return;
    }

    if (!user) {
      toast.error('Nejste přihlášen.');
      return;
    }

    setSubmittingId(inquiry.id);
    try {
      const teacherName = profile?.name || user.displayName || user.email || 'Lektor';
      await replyToInquiry(inquiry.id, text, user.uid, teacherName);
      toast.success('Odpověď byla úspěšně odeslána studentovi');
      setEditingReplyId(null);
      await fetchInquiries();
    } catch (err: any) {
      console.error('Error sending reply:', err);
      toast.error(err?.message || 'Chyba při odesílání odpovědi');
    } finally {
      setSubmittingId(null);
    }
  };

  const formatDate = (val: any) => {
    if (!val) return '';
    try {
      const date = val.toDate ? val.toDate() : new Date(val.seconds ? val.seconds * 1000 : val);
      return date.toLocaleDateString('cs-CZ', {
        day: 'numeric',
        month: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
        <div>
          <h2 className="text-2xl font-display font-black text-[#1E1B18] flex items-center gap-2.5">
            <MessageSquare className="text-amber-600" size={26} />
            Dotazy studentů z procvičování
          </h2>
          <p className="text-sm text-gray-500 font-medium mt-1">
            Zde můžete reagovat na otázky a nejasnosti, které studenti odeslali během procvičování.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchInquiries}
            disabled={loading}
            className="rounded-xl font-bold flex items-center gap-2 cursor-pointer h-10 px-4"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            <span>Obnovit</span>
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 p-1.5 bg-gray-100 rounded-2xl w-fit">
        <button
          onClick={() => setActiveTab('pending')}
          className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'pending'
              ? 'bg-white text-[#1E1B18] shadow-sm'
              : 'text-gray-600 hover:text-[#1E1B18]'
          }`}
        >
          <Clock size={16} className={activeTab === 'pending' ? 'text-amber-600' : 'text-gray-400'} />
          <span>Čekající na odpověď</span>
          {pendingInquiries.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-black bg-amber-100 text-amber-900 ml-1">
              {pendingInquiries.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('answered')}
          className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'answered'
              ? 'bg-white text-[#1E1B18] shadow-sm'
              : 'text-gray-600 hover:text-[#1E1B18]'
          }`}
        >
          <CheckCircle2 size={16} className={activeTab === 'answered' ? 'text-emerald-600' : 'text-gray-400'} />
          <span>Zodpovězené</span>
          {answeredInquiries.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-black bg-gray-200 text-gray-700 ml-1">
              {answeredInquiries.length}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-10 h-10 border-4 border-[#1E1B18] border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 font-bold text-sm">Načítání dotazů...</p>
        </div>
      ) : activeTab === 'pending' ? (
        pendingInquiries.length === 0 ? (
          <Card className="rounded-[2rem] border-none shadow-sm bg-white p-12 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto text-2xl mb-3">
              🎉
            </div>
            <h3 className="text-xl font-display font-black text-[#1E1B18]">Žádné nevyřízené dotazy</h3>
            <p className="text-gray-500 text-sm mt-1 max-w-md mx-auto">
              Všechny studentské dotazy z procvičování byly zodpovězeny. Skvělá práce!
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {pendingInquiries.map((inquiry) => (
              <Card key={inquiry.id} className="rounded-[2rem] border-none shadow-sm bg-white p-6 sm:p-7 space-y-4">
                {/* Inquiry Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold text-sm">
                      <User size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-gray-900 text-base">{inquiry.studentName || 'Student'}</h4>
                        {inquiry.senderRole === 'teacher' && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-800 border border-purple-200">
                            Učitel / Test
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 font-semibold">{formatDate(inquiry.createdAt)}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200/60 flex items-center gap-1.5">
                      <BookOpen size={12} /> {inquiry.topic || 'Procvičování'}
                    </span>
                    <span className="px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-amber-100 text-amber-900">
                      Čeká na odpověď
                    </span>
                  </div>
                </div>

                {/* Question Context */}
                <div className="bg-[#FAF7F0] p-4 rounded-2xl border border-gray-200/60 space-y-1">
                  <div className="text-[11px] font-black uppercase tracking-wider text-gray-400">
                    Úloha k procvičování
                  </div>
                  <p className="text-sm font-semibold text-gray-800">
                    {inquiry.questionText}
                  </p>
                </div>

                {/* Student's Question / Comment */}
                <div className="bg-amber-50/70 p-4 rounded-2xl border border-amber-200/60 space-y-1">
                  <div className="text-[11px] font-black uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
                    <MessageSquare size={13} /> Dotaz studenta
                  </div>
                  <p className="text-sm font-medium text-amber-950 whitespace-pre-wrap leading-relaxed">
                    {inquiry.comment}
                  </p>
                </div>

                {/* Teacher Reply Form */}
                <div className="pt-2 space-y-3">
                  <label className="block text-xs font-black uppercase tracking-wider text-gray-500">
                    Tvoje odpověď pro studenta
                  </label>
                  <Textarea
                    placeholder="Vysvětli studentovi postup, doporuč správný směr nebo odpověz na jeho dotaz..."
                    value={replyTexts[inquiry.id] ?? ''}
                    onChange={(e) => setReplyTexts(prev => ({ ...prev, [inquiry.id]: e.target.value }))}
                    className="min-h-[100px] rounded-2xl border-gray-200 focus:border-[#1E1B18] bg-gray-50/60 p-4 text-sm"
                  />
                  <div className="flex justify-end">
                    <Button
                      onClick={() => handleSendReply(inquiry)}
                      disabled={submittingId === inquiry.id || !replyTexts[inquiry.id]?.trim()}
                      className="rounded-xl bg-[#1E1B18] hover:bg-[#332f2b] text-white font-bold h-11 px-6 flex items-center gap-2 cursor-pointer shadow-md disabled:opacity-40"
                    >
                      <Send size={15} />
                      <span>{submittingId === inquiry.id ? 'Odesílání...' : 'Odeslat odpověď'}</span>
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )
      ) : (
        answeredInquiries.length === 0 ? (
          <Card className="rounded-[2rem] border-none shadow-sm bg-white p-12 text-center">
            <div className="w-14 h-14 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center mx-auto text-2xl mb-3">
              📭
            </div>
            <h3 className="text-xl font-display font-black text-[#1E1B18]">Zatím žádné zodpovězené dotazy</h3>
            <p className="text-gray-500 text-sm mt-1 max-w-md mx-auto">
              Jakmile odpovíte na dotaz studenta, archivuje se v této záložce.
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {answeredInquiries.map((inquiry) => {
              const isEditing = editingReplyId === inquiry.id;

              return (
                <Card key={inquiry.id} className="rounded-[2rem] border-none shadow-sm bg-white p-6 sm:p-7 space-y-4">
                  {/* Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-sm">
                        <CheckCircle2 size={18} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-gray-900 text-base">{inquiry.studentName || 'Student'}</h4>
                          {inquiry.senderRole === 'teacher' && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-800 border border-purple-200">
                              Učitel / Test
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 font-semibold">{formatDate(inquiry.createdAt)}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-700 flex items-center gap-1.5">
                        <BookOpen size={12} /> {inquiry.topic || 'Procvičování'}
                      </span>
                      <span className="px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-100 text-emerald-800">
                        Zodpovězeno
                      </span>
                    </div>
                  </div>

                  {/* Question Context */}
                  <div className="bg-[#FAF7F0] p-4 rounded-2xl border border-gray-200/60 space-y-1">
                    <div className="text-[11px] font-black uppercase tracking-wider text-gray-400">
                      Úloha k procvičování
                    </div>
                    <p className="text-sm font-semibold text-gray-800">
                      {inquiry.questionText}
                    </p>
                  </div>

                  {/* Student Comment */}
                  <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200/60 space-y-1">
                    <div className="text-[11px] font-black uppercase tracking-wider text-gray-500">
                      Dotaz studenta:
                    </div>
                    <p className="text-sm font-medium text-gray-800 whitespace-pre-wrap">
                      {inquiry.comment}
                    </p>
                  </div>

                  {/* Teacher Reply */}
                  {!isEditing ? (
                    <div className="bg-emerald-50/60 p-4 rounded-2xl border border-emerald-200/70 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-[11px] font-black uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                          <span>Odpověď lektora ({inquiry.repliedByName || 'Lektor'})</span>
                          {inquiry.repliedAt && (
                            <span className="text-gray-400 font-normal">
                              • {formatDate(inquiry.repliedAt)}
                            </span>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingReplyId(inquiry.id);
                            setReplyTexts(prev => ({ ...prev, [inquiry.id]: inquiry.reply || '' }));
                          }}
                          className="h-7 text-xs font-bold text-gray-600 hover:text-black flex items-center gap-1 rounded-lg"
                        >
                          <Edit3 size={13} />
                          <span>Upravit odpověď</span>
                        </Button>
                      </div>
                      <p className="text-sm font-medium text-emerald-950 whitespace-pre-wrap leading-relaxed">
                        {inquiry.reply}
                      </p>
                    </div>
                  ) : (
                    <div className="pt-2 space-y-3">
                      <label className="block text-xs font-black uppercase tracking-wider text-gray-500">
                        Upravit odpověď pro studenta
                      </label>
                      <Textarea
                        value={replyTexts[inquiry.id] ?? inquiry.reply ?? ''}
                        onChange={(e) => setReplyTexts(prev => ({ ...prev, [inquiry.id]: e.target.value }))}
                        className="min-h-[100px] rounded-2xl border-gray-200 focus:border-[#1E1B18] bg-white p-4 text-sm"
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingReplyId(null)}
                          className="rounded-xl font-bold h-10 px-4"
                        >
                          Zrušit
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleSendReply(inquiry)}
                          disabled={submittingId === inquiry.id || !replyTexts[inquiry.id]?.trim()}
                          className="rounded-xl bg-[#1E1B18] hover:bg-[#332f2b] text-white font-bold h-10 px-5 flex items-center gap-2 cursor-pointer shadow-md"
                        >
                          <Send size={14} />
                          <span>{submittingId === inquiry.id ? 'Ukládání...' : 'Uložit změny'}</span>
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
