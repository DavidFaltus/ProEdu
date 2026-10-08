import React, { useState } from 'react';
import { MessageSquare, Send, CheckCircle2, Clock, User, ChevronDown, ChevronUp, Sparkles, Check, ArrowRight } from 'lucide-react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Textarea } from '../ui/textarea';
import { toast } from 'sonner';
import { QuestionInquiry, replyToInquiry } from '../../services/inquiryService';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../lib/utils';

interface TeacherInquiriesOverviewProps {
  inquiries: QuestionInquiry[];
  onRefresh: () => Promise<void>;
  onNavigateToTab?: (tab: string) => void;
}

export default function TeacherInquiriesOverview({
  inquiries,
  onRefresh,
  onNavigateToTab
}: TeacherInquiriesOverviewProps) {
  const { user, profile } = useAuth();
  const [isExpanded, setIsExpanded] = useState(false);
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);

  if (!inquiries || inquiries.length === 0) {
    return null;
  }

  // Sort: pending first, then newest createdAt desc
  const sortedInquiries = [...inquiries].sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (b.status === 'pending' && a.status !== 'pending') return 1;
    const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
    const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
    return timeB - timeA;
  });

  const pendingCount = inquiries.filter(i => i.status === 'pending').length;
  const primaryInquiry = sortedInquiries[0];
  const remainingInquiries = sortedInquiries.slice(1);

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
      toast.success('Odpověď byla úspěšně odeslána studentovi.');
      setEditingReplyId(null);
      await onRefresh();
    } catch (err: any) {
      console.error('Error sending reply:', err);
      toast.error('Chyba při odesílání odpovědi: ' + err.message);
    } finally {
      setSubmittingId(null);
    }
  };

  const renderInquiryCard = (inquiry: QuestionInquiry, isPrimary = false) => {
    const isAnswered = inquiry.status === 'answered';
    const isEditing = editingReplyId === inquiry.id;

    return (
      <div
        key={inquiry.id}
        className={cn(
          "rounded-3xl p-5 sm:p-6 transition-all border space-y-4",
          !isAnswered
            ? "border-amber-300 bg-amber-50/40 shadow-xs"
            : isPrimary
            ? "border-gray-200/80 bg-white shadow-xs"
            : "border-gray-200/60 bg-[#FAF7F0]/40 hover:border-gray-300"
        )}
      >
        {/* Header of single inquiry card */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-3 py-1 rounded-full text-xs font-black bg-white text-gray-800 border border-gray-200 shadow-2xs flex items-center gap-1.5">
              <User size={13} className="text-gray-400" />
              <span>{inquiry.studentName || 'Student'}</span>
            </span>

            <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white/80 border border-gray-200 text-gray-600">
              {inquiry.topic || 'Procvičování'}
            </span>

            <span className="text-xs text-gray-400 font-semibold flex items-center gap-1">
              <Clock size={12} />
              {formatDate(inquiry.createdAt)}
            </span>
          </div>

          <div>
            {!isAnswered ? (
              <span className="px-3 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-900 flex items-center gap-1.5 shadow-2xs animate-pulse">
                <Clock size={13} /> Čeká na tvou odpověď
              </span>
            ) : (
              <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 flex items-center gap-1.5 shadow-2xs">
                <CheckCircle2 size={13} /> Zodpovězeno
              </span>
            )}
          </div>
        </div>

        {/* Student Question Text */}
        <div className="bg-[#FAF7F0] rounded-2xl p-4 border border-gray-200/60 space-y-1">
          <span className="text-[11px] font-black uppercase tracking-wider text-gray-400 block">
            Dotaz studenta:
          </span>
          <p className="text-sm font-semibold text-gray-800 whitespace-pre-wrap leading-relaxed">
            {inquiry.comment}
          </p>
        </div>

        {/* Reply Section */}
        {isAnswered && !isEditing ? (
          <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
                <Sparkles size={14} className="text-emerald-600" />
                <span>Tvoje odpověď</span>
                {inquiry.repliedAt && (
                  <span className="text-emerald-700/70 font-medium lowercase">
                    ({formatDate(inquiry.repliedAt)})
                  </span>
                )}
              </span>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditingReplyId(inquiry.id);
                  setReplyTexts(prev => ({ ...prev, [inquiry.id]: inquiry.reply || '' }));
                }}
                className="h-7 text-xs font-bold text-emerald-800 hover:text-emerald-900 hover:bg-emerald-100 rounded-lg cursor-pointer"
              >
                Upravit
              </Button>
            </div>

            <p className="text-sm font-medium text-emerald-950 whitespace-pre-wrap leading-relaxed bg-white/80 p-3 rounded-xl border border-emerald-100">
              {inquiry.reply}
            </p>
          </div>
        ) : (
          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-gray-700 block">
                {isEditing ? 'Upravit odpověď studentovi:' : 'Napsat odpověď studentovi:'}
              </span>
              <Textarea
                placeholder="Napiš studentovi vysvětlení, radu nebo postup..."
                value={replyTexts[inquiry.id] || ''}
                onChange={(e) => setReplyTexts(prev => ({ ...prev, [inquiry.id]: e.target.value }))}
                className="min-h-[85px] text-sm rounded-xl bg-white border-gray-200 focus:border-amber-400 resize-y"
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              {isEditing && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingReplyId(null)}
                  className="rounded-xl font-bold text-xs h-9 cursor-pointer"
                >
                  Zrušit
                </Button>
              )}

              <Button
                size="sm"
                disabled={submittingId === inquiry.id}
                onClick={() => handleSendReply(inquiry)}
                className="rounded-xl bg-[#1E1B18] hover:bg-black text-white font-bold text-xs h-9 px-4 flex items-center gap-1.5 cursor-pointer shadow-sm transition-transform hover:scale-[1.02]"
              >
                <Send size={13} />
                <span>{submittingId === inquiry.id ? 'Odesílám...' : isEditing ? 'Uložit změnu' : 'Odeslat odpověď'}</span>
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <Card className="rounded-[2.5rem] border-none shadow-xl bg-white p-6 sm:p-8 space-y-6 w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shadow-inner">
            <MessageSquare size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-sans font-black text-2xl text-[#1E1B18]">
                Dotaz od studenta
              </h3>
              {pendingCount > 0 && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-500 text-white animate-pulse">
                  K vyřízení ({pendingCount})
                </span>
              )}
            </div>
            <p className="text-gray-400 text-xs font-semibold">
              {inquiries.length > 1
                ? 'Zobrazuje se nejnovější dotaz. Další můžeš rozbalit níže.'
                : 'Otázka od studenta z procvičování k vyřízení'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {onNavigateToTab && (
            <button
              onClick={() => onNavigateToTab('inquiries')}
              className="text-xs font-bold text-brand-blue hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>Všechny dotazy</span>
              <ArrowRight size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Primary single inquiry */}
      <div className="space-y-4">
        {renderInquiryCard(primaryInquiry, true)}
      </div>

      {/* Expand/Collapse Toggle inside card */}
      {remainingInquiries.length > 0 && (
        <div className="space-y-4 pt-1">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full py-3.5 px-5 rounded-2xl bg-[#FAF7F0] hover:bg-amber-50/80 border border-amber-200/80 text-amber-950 font-bold text-xs sm:text-sm flex items-center justify-between transition-all hover:shadow-xs cursor-pointer group"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center group-hover:scale-105 transition-transform">
                <MessageSquare size={16} />
              </div>
              <span className="font-black text-[#1E1B18] group-hover:text-amber-950">
                {isExpanded
                  ? 'Sbalit na 1 dotaz'
                  : `Zobrazit další dotazy od studentů (${remainingInquiries.length})`}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {!isExpanded && pendingCount > (primaryInquiry.status === 'pending' ? 1 : 0) && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-rose-500 text-white">
                  K vyřízení
                </span>
              )}
              <div className="w-7 h-7 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-700 shadow-2xs group-hover:border-amber-300">
                {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </div>
            </div>
          </button>

          {isExpanded && (
            <div className="space-y-4 pt-2 border-t border-gray-100 animate-in fade-in slide-in-from-top-2 duration-300">
              {remainingInquiries.map((inquiry) => renderInquiryCard(inquiry, false))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
