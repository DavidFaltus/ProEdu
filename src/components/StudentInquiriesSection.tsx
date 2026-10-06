import React, { useState, useMemo, useRef } from 'react';
import { 
  MessageSquare, 
  CheckCircle2, 
  Clock, 
  Check, 
  ChevronDown, 
  ChevronUp, 
  HelpCircle, 
  BookOpen, 
  Lightbulb, 
  Sparkles,
  ExternalLink,
  Info
} from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { QuestionInquiry } from '../services/inquiryService';
import { getQuestionById } from '../services/practiceService';
import { PracticeQuestion } from '../types';
import { sanitizeSvg } from '../utils/pdfToSvg';
import { useNavigate } from 'react-router-dom';

interface StudentInquiriesSectionProps {
  inquiries: QuestionInquiry[];
  onMarkAsRead: (inquiryId: string) => Promise<void>;
  formatDate: (val: any) => string;
}

export default function StudentInquiriesSection({
  inquiries,
  onMarkAsRead,
  formatDate
}: StudentInquiriesSectionProps) {
  const navigate = useNavigate();
  const sectionRef = useRef<HTMLDivElement>(null);

  // Expanded state: false = show only 1 inquiry; true = expand full standalone section
  const [isExpanded, setIsExpanded] = useState(false);

  // Active filter when expanded: 'all' | 'answered' | 'pending' | 'unread'
  const [activeFilter, setActiveFilter] = useState<'all' | 'answered' | 'pending' | 'unread'>('all');

  // Cache for loaded question details (PracticeQuestion)
  const [questionDetailsCache, setQuestionDetailsCache] = useState<Record<string, PracticeQuestion | null>>({});
  const [loadingQuestionMap, setLoadingQuestionMap] = useState<Record<string, boolean>>({});
  
  // Toggled state for showing question details per inquiry
  const [showDetailsMap, setShowDetailsMap] = useState<Record<string, boolean>>({});

  // Sort inquiries: unread answered inquiries first, then newest createdAt desc
  const sortedInquiries = useMemo(() => {
    return [...inquiries].sort((a, b) => {
      const aUnread = a.status === 'answered' && !a.isReadByStudent;
      const bUnread = b.status === 'answered' && !b.isReadByStudent;
      if (aUnread && !bUnread) return -1;
      if (!aUnread && bUnread) return 1;

      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
      return timeB - timeA;
    });
  }, [inquiries]);

  const primaryInquiry = sortedInquiries[0];
  const unreadCount = useMemo(() => inquiries.filter(i => i.status === 'answered' && !i.isReadByStudent).length, [inquiries]);
  const answeredCount = useMemo(() => inquiries.filter(i => i.status === 'answered').length, [inquiries]);
  const pendingCount = useMemo(() => inquiries.filter(i => i.status === 'pending').length, [inquiries]);

  // Filtered inquiries for expanded section
  const filteredInquiries = useMemo(() => {
    if (activeFilter === 'answered') return sortedInquiries.filter(i => i.status === 'answered');
    if (activeFilter === 'pending') return sortedInquiries.filter(i => i.status === 'pending');
    if (activeFilter === 'unread') return sortedInquiries.filter(i => i.status === 'answered' && !i.isReadByStudent);
    return sortedInquiries;
  }, [sortedInquiries, activeFilter]);

  // Fetch question details on-demand
  const handleToggleQuestionDetails = async (inquiryId: string, questionId: string) => {
    const isCurrentlyShown = !!showDetailsMap[inquiryId];
    setShowDetailsMap(prev => ({ ...prev, [inquiryId]: !isCurrentlyShown }));

    if (!isCurrentlyShown && questionId && questionId !== 'general' && questionId !== 'question' && questionDetailsCache[questionId] === undefined) {
      setLoadingQuestionMap(prev => ({ ...prev, [questionId]: true }));
      try {
        const details = await getQuestionById(questionId);
        setQuestionDetailsCache(prev => ({ ...prev, [questionId]: details }));
      } catch (err) {
        console.error('Failed to load question details:', err);
        setQuestionDetailsCache(prev => ({ ...prev, [questionId]: null }));
      } finally {
        setLoadingQuestionMap(prev => ({ ...prev, [questionId]: false }));
      }
    }
  };

  if (!inquiries || inquiries.length === 0 || !primaryInquiry) {
    return null;
  }

  // Render an inquiry card (used for both single preview and in the full section)
  const renderInquiryCard = (inquiry: QuestionInquiry, isHighlighted = false) => {
    const isAnswered = inquiry.status === 'answered';
    const isUnread = isAnswered && !inquiry.isReadByStudent;
    const isDetailsOpen = !!showDetailsMap[inquiry.id];
    const qDetails = inquiry.questionId ? questionDetailsCache[inquiry.questionId] : null;
    const isLoadingDetails = inquiry.questionId ? !!loadingQuestionMap[inquiry.questionId] : false;

    return (
      <div
        key={inquiry.id}
        className={`p-5 sm:p-7 rounded-[2rem] border transition-all space-y-4 ${
          isUnread
            ? 'border-amber-300 bg-amber-50/40 shadow-sm'
            : isHighlighted
              ? 'border-amber-200/90 bg-white shadow-xs'
              : 'border-gray-200/70 bg-[#FAF7F0]/40'
        }`}
      >
        {/* Card Header: Topic & Date & Status */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-3 py-1 rounded-full text-xs font-black bg-white text-gray-800 border border-gray-200 shadow-2xs">
              {inquiry.topic || 'Procvičování'}
            </span>
            <span className="text-xs text-gray-400 font-semibold flex items-center gap-1">
              <Clock size={12} />
              {formatDate(inquiry.createdAt)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isAnswered ? (
              <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 flex items-center gap-1.5 shadow-2xs">
                <CheckCircle2 size={13} /> Zodpovězeno
              </span>
            ) : (
              <span className="px-3 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-900 flex items-center gap-1.5 shadow-2xs">
                <Clock size={13} /> Čeká na odpověď lektora
              </span>
            )}

            {isUnread && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-rose-500 text-white animate-pulse">
                Nová odpověď
              </span>
            )}
          </div>
        </div>

        {/* Question Details Section (Úloha a podrobnosti o otázce na kterou se uživatel ptal) */}
        <div className="bg-white rounded-2xl border border-gray-200/70 p-4 sm:p-5 space-y-3 shadow-2xs">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-gray-500">
              <HelpCircle size={15} className="text-amber-600" />
              <span className="text-[11px] font-black uppercase tracking-wider">Otázka / Zadání úlohy</span>
            </div>

            {/* Toggle question details button */}
            <button
              onClick={() => handleToggleQuestionDetails(inquiry.id, inquiry.questionId)}
              className="text-xs font-bold text-amber-700 hover:text-amber-900 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>{isDetailsOpen ? 'Skrýt podrobnosti úlohy' : 'Podrobnosti o otázce'}</span>
              {isDetailsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>

          <p className="text-sm font-bold text-gray-900 leading-relaxed whitespace-pre-wrap">
            {inquiry.questionText || 'Zadání nebylo zadáno'}
          </p>

          {/* Expanded Question Details */}
          {isDetailsOpen && (
            <div className="mt-3 pt-3 border-t border-gray-100 space-y-3 text-xs">
              {isLoadingDetails && (
                <div className="flex items-center gap-2 text-gray-400 py-1 font-semibold">
                  <div className="w-3.5 h-3.5 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
                  <span>Načítání podrobností o otázce...</span>
                </div>
              )}

              {qDetails ? (
                <div className="space-y-3 bg-[#FAF7F0] p-3.5 rounded-xl border border-gray-200/60">
                  {/* Optional Image or SVG */}
                  {qDetails.svgContent ? (
                    <div 
                      className="p-3 bg-white rounded-xl border border-gray-200 flex justify-center [&>svg]:max-h-56 [&>svg]:w-full [&>svg]:h-auto"
                      dangerouslySetInnerHTML={{ __html: sanitizeSvg(qDetails.svgContent) }}
                    />
                  ) : qDetails.imageUrl ? (
                    <div className="p-2 bg-white rounded-xl border border-gray-200 flex justify-center">
                      <img
                        src={qDetails.imageUrl}
                        alt="Obrázek k úloze"
                        className="max-h-48 rounded-lg object-contain cursor-pointer hover:scale-[1.01] transition-transform"
                        onClick={() => window.open(qDetails.imageUrl, '_blank')}
                        title="Kliknutím otevřete v plné velikosti"
                      />
                    </div>
                  ) : null}

                  {/* Options if choice */}
                  {qDetails.type === 'choice' && qDetails.options && qDetails.options.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="font-bold text-gray-500 block uppercase tracking-wider text-[10px]">
                        Možnosti odpovědí:
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {qDetails.options.map((opt, idx) => {
                          const isCorrect = opt === qDetails.correctAnswer;
                          return (
                            <div
                              key={idx}
                              className={`p-2.5 rounded-lg border flex items-center gap-2 ${
                                isCorrect
                                  ? 'bg-emerald-50 border-emerald-300 font-bold text-emerald-950'
                                  : 'bg-white border-gray-200 text-gray-700'
                              }`}
                            >
                              <span className="w-5 h-5 rounded-md bg-gray-100 flex items-center justify-center font-black text-[10px] text-gray-600 shrink-0">
                                {String.fromCharCode(65 + idx)}
                              </span>
                              <span className="truncate flex-1">{opt}</span>
                              {isCorrect && (
                                <span className="text-[10px] bg-emerald-600 text-white font-bold px-1.5 py-0.5 rounded shrink-0">
                                  Správně
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Correct answer (if open question or not highlighted yet) */}
                  {qDetails.correctAnswer && qDetails.type !== 'choice' && (
                    <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-950">
                      <span className="font-bold block text-[10px] uppercase tracking-wider text-emerald-800">
                        Správné řešení:
                      </span>
                      <span className="font-bold">{qDetails.correctAnswer}</span>
                    </div>
                  )}

                  {/* Hint */}
                  {qDetails.hint && (
                    <div className="flex items-start gap-2 text-amber-900 bg-amber-50/70 p-2.5 rounded-lg border border-amber-200/60">
                      <Lightbulb size={14} className="shrink-0 mt-0.5 text-amber-600" />
                      <div>
                        <span className="font-bold block text-[10px] uppercase tracking-wider text-amber-800">Nápověda:</span>
                        <span>{qDetails.hint}</span>
                      </div>
                    </div>
                  )}

                  {/* Explanation */}
                  {qDetails.explanation && (
                    <div className="flex items-start gap-2 text-blue-950 bg-blue-50/70 p-2.5 rounded-lg border border-blue-200/60">
                      <Info size={14} className="shrink-0 mt-0.5 text-blue-600" />
                      <div>
                        <span className="font-bold block text-[10px] uppercase tracking-wider text-blue-800">Vysvětlení úlohy:</span>
                        <span>{qDetails.explanation}</span>
                      </div>
                    </div>
                  )}

                  {/* Difficulty & Practice link */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-gray-200/60 text-[11px]">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 font-semibold">Obtížnost:</span>
                      <span className="font-bold text-gray-700 bg-white px-2 py-0.5 rounded border border-gray-200">
                        {qDetails.difficulty || 'Střední'}
                      </span>
                    </div>

                    {qDetails.subtopicId && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => navigate(`/practice/session/${qDetails.subtopicId}`)}
                        className="h-7 text-xs font-bold text-brand-blue hover:text-blue-800 hover:bg-blue-50 rounded-lg flex items-center gap-1 cursor-pointer px-2"
                      >
                        <span>Procvičit téma</span>
                        <ExternalLink size={12} />
                      </Button>
                    )}
                  </div>
                </div>
              ) : !isLoadingDetails ? (
                <div className="p-3 bg-gray-50 rounded-xl text-gray-500 text-xs flex items-center justify-between gap-2">
                  <span>Tato otázka byla položena k úloze z procvičování: <strong>{inquiry.topic || 'Obecné'}</strong>.</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate('/practice')}
                    className="h-7 text-xs font-bold rounded-lg cursor-pointer"
                  >
                    Katalog témat
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Student's Question / Comment */}
        <div className="bg-[#FAF7F0] rounded-2xl p-4 sm:p-5 border border-gray-200/60 space-y-1">
          <span className="text-[11px] font-black uppercase tracking-wider text-gray-400 block">
            Tvůj dotaz pro lektora:
          </span>
          <p className="text-sm font-semibold text-gray-800 whitespace-pre-wrap leading-relaxed">
            {inquiry.comment}
          </p>
        </div>

        {/* Teacher Reply */}
        {isAnswered ? (
          <div className="bg-emerald-50/90 border border-emerald-200 rounded-2xl p-4 sm:p-5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
                <Sparkles size={14} className="text-emerald-600" />
                <span>Odpověď od {inquiry.repliedByName || 'lektora'}</span>
                {inquiry.repliedAt && (
                  <span className="text-emerald-700/70 font-medium lowercase">
                    ({formatDate(inquiry.repliedAt)})
                  </span>
                )}
              </span>

              {isUnread ? (
                <Button
                  size="sm"
                  onClick={() => onMarkAsRead(inquiry.id)}
                  className="h-8 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Check size={14} />
                  <span>Označit jako přečtené</span>
                </Button>
              ) : (
                <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                  <Check size={14} /> Přečteno
                </span>
              )}
            </div>

            <p className="text-sm font-medium text-emerald-950 whitespace-pre-wrap leading-relaxed bg-white/70 p-3.5 rounded-xl border border-emerald-100">
              {inquiry.reply}
            </p>
          </div>
        ) : (
          <div className="bg-amber-50/60 border border-amber-200/60 rounded-2xl p-4 text-xs font-medium text-amber-900 flex items-center gap-2.5">
            <Clock size={16} className="text-amber-600 shrink-0" />
            <span>Tvůj dotaz byl předán lektorovi. Jakmile lektor připraví odpověď, upozornění se ti zobrazí zde na nástěnce.</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div ref={sectionRef} className="space-y-6">
      {/* MAIN SINGLE INQUIRY CARD: On the main page, only 1 question is displayed by default */}
      <Card className="rounded-[2.5rem] border-none shadow-md bg-white p-6 sm:p-8 space-y-6">
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shadow-inner">
              <MessageSquare size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-sans font-black text-2xl text-[#1E1B18]">
                  {inquiries.length > 1 ? 'Nejnovější dotaz a odpověď od lektora' : 'Dotaz a odpověď od lektora'}
                </h3>
                {unreadCount > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-500 text-white animate-pulse">
                    Nové odpovědi
                  </span>
                )}
              </div>
              <p className="text-gray-400 text-xs font-semibold">
                {inquiries.length > 1 
                  ? 'Zobrazuje se 1 nejnovější dotaz. Další dotazy můžeš rozkliknout níže.' 
                  : 'Tvoje otázka k úloze z procvičování a odpověď učitele'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="text-xs font-bold text-gray-500 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-200/60">
              Celkem dotazů: {inquiries.length}
            </span>
          </div>
        </div>

        {/* Display only the SINGLE primary inquiry */}
        <div className="space-y-4">
          {renderInquiryCard(primaryInquiry, true)}
        </div>

        {/* Action button under the section: if user has more than 1 inquiry, expands full standalone section */}
        {inquiries.length > 1 && (
          <div className="pt-2">
            <button
              onClick={() => {
                const nextState = !isExpanded;
                setIsExpanded(nextState);
                if (!nextState && sectionRef.current) {
                  sectionRef.current.scrollIntoView({ behavior: 'smooth' });
                }
              }}
              className="w-full py-4 px-6 rounded-2xl bg-[#FAF7F0] hover:bg-amber-50/80 border border-amber-200/80 text-amber-950 font-bold text-sm flex items-center justify-between transition-all hover:shadow-md cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <MessageSquare size={18} />
                </div>
                <div className="text-left">
                  <p className="text-sm font-black text-[#1E1B18] group-hover:text-amber-950">
                    {isExpanded 
                      ? 'Sbalit sekci všech dotazů' 
                      : `Rozbalit všechny dotazy a odpovědi (${inquiries.length})`}
                  </p>
                  <p className="text-xs text-gray-500 font-semibold">
                    {isExpanded
                      ? 'Zobrazit na nástěnce pouze 1 hlavní dotaz'
                      : `Máš ještě ${inquiries.length - 1} ${inquiries.length - 1 === 1 ? 'další dotaz' : inquiries.length - 1 < 5 ? 'další dotazy' : 'dalších dotazů'} na svém profilu s podrobnostmi`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {!isExpanded && unreadCount > 0 && (
                  <span className="px-2.5 py-1 rounded-full text-xs font-black bg-rose-500 text-white">
                    {unreadCount} {unreadCount === 1 ? 'nová' : 'nové'}
                  </span>
                )}
                <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-700 shadow-2xs group-hover:border-amber-300">
                  {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
              </div>
            </button>
          </div>
        )}
      </Card>

      {/* FULL STANDALONE SECTION WITH ALL INQUIRIES: Revealed when user clicks the button under the section */}
      {isExpanded && inquiries.length > 1 && (
        <Card className="rounded-[2.5rem] border-2 border-amber-200 shadow-xl bg-white p-6 sm:p-8 space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
          {/* Header of standalone section */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-md">
                <BookOpen size={22} />
              </div>
              <div>
                <h3 className="font-sans font-black text-2xl text-[#1E1B18]">
                  Všechny dotazy a odpovědi od lektora
                </h3>
                <p className="text-gray-500 text-xs sm:text-sm font-medium">
                  Kompletní přehled otázek k úlohám, odpovědí lektora a podrobností o zadání
                </p>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsExpanded(false);
                sectionRef.current?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="rounded-xl font-bold h-9 px-4 text-xs border-gray-200 hover:bg-gray-100 self-start sm:self-auto cursor-pointer"
            >
              <span>Sbalit sekci</span>
              <ChevronUp size={14} className="ml-1" />
            </Button>
          </div>

          {/* Filter Tabs */}
          <div className="flex flex-wrap gap-2 p-1.5 bg-[#FAF7F0] rounded-2xl border border-gray-200/60 w-fit">
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-4 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                activeFilter === 'all'
                  ? 'bg-white text-[#1E1B18] shadow-xs'
                  : 'text-gray-600 hover:text-black'
              }`}
            >
              Všechny ({inquiries.length})
            </button>

            {unreadCount > 0 && (
              <button
                onClick={() => setActiveFilter('unread')}
                className={`px-4 py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeFilter === 'unread'
                    ? 'bg-rose-500 text-white shadow-xs'
                    : 'text-rose-600 hover:bg-rose-50'
                }`}
              >
                <span>Nové odpovědi</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-white/20">
                  {unreadCount}
                </span>
              </button>
            )}

            <button
              onClick={() => setActiveFilter('answered')}
              className={`px-4 py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer ${
                activeFilter === 'answered'
                  ? 'bg-white text-emerald-800 shadow-xs'
                  : 'text-gray-600 hover:text-emerald-700'
              }`}
            >
              <span>Zodpovězené ({answeredCount})</span>
            </button>

            <button
              onClick={() => setActiveFilter('pending')}
              className={`px-4 py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer ${
                activeFilter === 'pending'
                  ? 'bg-white text-amber-800 shadow-xs'
                  : 'text-gray-600 hover:text-amber-800'
              }`}
            >
              <span>Čekající na odpověď ({pendingCount})</span>
            </button>
          </div>

          {/* List of all filtered inquiries */}
          <div className="space-y-4">
            {filteredInquiries.length === 0 ? (
              <div className="p-8 text-center text-gray-400 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                <p className="font-bold text-sm">V tomto filtru nemáš žádné dotazy.</p>
              </div>
            ) : (
              filteredInquiries.map((inquiry) => renderInquiryCard(inquiry))
            )}
          </div>

          {/* Bottom collapse button */}
          <div className="pt-4 border-t border-gray-100 flex items-center justify-between flex-wrap gap-3">
            <p className="text-xs text-gray-400 font-semibold">
              Zobrazeno {filteredInquiries.length} z celkem {inquiries.length} dotazů na tvém profilu
            </p>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsExpanded(false);
                sectionRef.current?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="rounded-xl font-bold h-9 px-4 text-xs border-amber-300 text-amber-900 hover:bg-amber-50 cursor-pointer"
            >
              <span>Sbalit sekci (zobrazit pouze 1 dotaz)</span>
              <ChevronUp size={14} className="ml-1" />
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
