import React, { useState, useEffect } from 'react';
import { Order } from '../../types';
import { getAllOrders, confirmOrderManual, deleteOrder } from '../../services/orderService';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../ui/dialog';
import { 
  CreditCard, 
  QrCode, 
  CheckCircle2, 
  Clock, 
  Search, 
  RefreshCw, 
  User, 
  Mail, 
  MapPin, 
  Calendar,
  Trash2,
  AlertTriangle,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';

export default function OrdersManager() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'paid'>('all');
  const [confirmingOrderId, setConfirmingOrderId] = useState<string | null>(null);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const data = await getAllOrders();
      setOrders(data);
    } catch (err: any) {
      console.error('Failed to load orders:', err);
      toast.error(err.message || 'Nepodařilo se načíst objednávky.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const handleConfirmOrder = async (orderId?: string) => {
    if (!orderId) return;
    setConfirmingOrderId(orderId);
    try {
      const res = await confirmOrderManual(orderId);
      toast.success(res.message);
      // Aktualizovat lokální stav
      setOrders(prev => prev.map(o => (o.id === orderId || (o as any).orderId === orderId) ? { ...o, status: 'paid', paidAt: new Date().toISOString() } : o));
    } catch (err: any) {
      console.error('Failed to confirm order:', err);
      toast.error(err.message || 'Nepodařilo se potvrdit platbu.');
    } finally {
      setConfirmingOrderId(null);
    }
  };

  const confirmDeleteOrder = async () => {
    if (!orderToDelete) return;
    const orderId = (orderToDelete as any).orderId || orderToDelete.id;
    if (!orderId) return;

    setDeletingOrderId(orderId);
    try {
      const res = await deleteOrder(orderId);
      toast.success(res.message);
      setOrders(prev => prev.filter(o => o.id !== orderId && (o as any).orderId !== orderId));
      setOrderToDelete(null);
    } catch (err: any) {
      console.error('Failed to delete order:', err);
      toast.error(err.message || 'Nepodařilo se smazat objednávku.');
    } finally {
      setDeletingOrderId(null);
    }
  };

  const filteredOrders = orders.filter(order => {
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    const q = searchTerm.toLowerCase().trim();
    const matchesSearch = !q ||
      order.clientName?.toLowerCase().includes(q) ||
      order.invoiceEmail?.toLowerCase().includes(q) ||
      order.variableSymbol?.toLowerCase().includes(q) ||
      order.billingAddress?.city?.toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header a Filtry */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">
            Správa objednávek a předplatného
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 font-medium">
            Přehled plateb přes QR kód a platební bránu Comgate
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchOrders}
            disabled={loading}
            className="rounded-xl border-gray-200 text-xs font-bold gap-1.5"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Obnovit</span>
          </Button>
        </div>
      </div>

      {/* Ovládací panel - Hledání a Záložky stavů */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-gray-100 shadow-xs">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Hledat podle jména, e-mailu, VS nebo města..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-gray-200 bg-[#FAF7F0]/50 focus:bg-white focus:outline-hidden"
          />
        </div>

        <div className="flex items-center gap-1.5 self-start md:self-auto bg-[#FAF7F0] p-1 rounded-xl border border-gray-200 text-xs font-bold">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              statusFilter === 'all' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            Všechny ({orders.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('pending')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              statusFilter === 'pending' ? 'bg-white text-amber-900 shadow-xs' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            Čekající na platbu ({orders.filter(o => o.status === 'pending').length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('paid')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              statusFilter === 'paid' ? 'bg-white text-emerald-900 shadow-xs' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            Zaplacené ({orders.filter(o => o.status === 'paid').length})
          </button>
        </div>
      </div>

      {/* Seznam objednávek */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(n => (
            <div key={n} className="h-28 rounded-2xl bg-gray-100 animate-pulse border border-gray-200" />
          ))}
        </div>
      ) : filteredOrders.length === 0 ? (
        <Card className="p-8 text-center rounded-2xl border-dashed border-2 border-gray-200 bg-white">
          <p className="text-gray-500 font-bold text-sm">
            {searchTerm ? 'Nebyly nalezeny žádné odpovídající objednávky.' : 'Zatím zde nejsou žádné objednávky.'}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map(order => {
            const currentOrderId = (order as any).orderId || order.id;
            const isPending = order.status === 'pending';
            const isPaid = order.status === 'paid';
            const isQr = order.paymentMethod === 'qr_bank_transfer';

            return (
              <Card
                key={currentOrderId}
                className="p-4 sm:p-5 rounded-2xl border border-gray-200/80 bg-white shadow-xs hover:border-gray-300 transition-all flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4"
              >
                {/* Detaily klienta a objednávky */}
                <div className="space-y-2 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-black text-xs text-gray-900 bg-gray-100 px-2 py-0.5 rounded-md">
                      VS: {order.variableSymbol}
                    </span>

                    {isPaid ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                        <CheckCircle2 size={12} />
                        <span>Zaplaceno</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
                        <Clock size={12} />
                        <span>Čeká na úhradu</span>
                      </span>
                    )}

                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-gray-600 bg-[#FAF7F0] border border-gray-200 px-2 py-0.5 rounded-md">
                      {isQr ? <QrCode size={12} /> : <CreditCard size={12} />}
                      <span>{isQr ? 'QR Převod' : 'Comgate'}</span>
                    </span>

                    {order.newsletterConsent && (
                      <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
                        Newsletter
                      </span>
                    )}
                  </div>

                  <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2 text-xs pt-1">
                    <div className="flex items-center gap-1.5 text-gray-800 font-bold truncate">
                      <User size={13} className="text-gray-400 shrink-0" />
                      <span className="truncate">{order.clientName}</span>
                    </div>

                    <div className="flex items-center gap-1.5 text-gray-600 truncate">
                      <Mail size={13} className="text-gray-400 shrink-0" />
                      <span className="truncate">{order.invoiceEmail}</span>
                    </div>

                    <div className="flex items-center gap-1.5 text-gray-600 truncate">
                      <MapPin size={13} className="text-gray-400 shrink-0" />
                      <span className="truncate">
                        {order.billingAddress?.street}, {order.billingAddress?.city} ({order.billingAddress?.zip})
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-[11px] text-gray-400 font-medium">
                    <span className="flex items-center gap-1">
                      <Calendar size={11} />
                      Vytvořeno: {order.createdAt ? new Date(order.createdAt).toLocaleString('cs-CZ') : '—'}
                    </span>
                    {order.paidAt && (
                      <span className="text-emerald-600 font-bold">
                        Zaplaceno: {new Date(order.paidAt).toLocaleString('cs-CZ')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Částka a Akce */}
                <div className="flex items-center gap-4 self-end lg:self-center shrink-0">
                  <div className="text-right">
                    <div className="text-xl font-display font-black text-[#B80053]">
                      {order.amount || 99} Kč
                    </div>
                    <div className="text-[10px] text-gray-400 font-semibold uppercase">
                      ProEdu Premium
                    </div>
                  </div>

                  {isPending && (
                    <Button
                      size="sm"
                      onClick={() => handleConfirmOrder(currentOrderId)}
                      disabled={confirmingOrderId === currentOrderId || deletingOrderId === currentOrderId}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 px-3 rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5"
                    >
                      <CheckCircle2 size={14} />
                      <span>{confirmingOrderId === currentOrderId ? 'Aktivuji...' : 'Potvrdit platbu'}</span>
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setOrderToDelete(order)}
                    disabled={deletingOrderId === currentOrderId || confirmingOrderId === currentOrderId}
                    title="Smazat objednávku"
                    className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 font-bold text-xs h-9 px-2.5 rounded-xl cursor-pointer flex items-center gap-1"
                  >
                    <Trash2 size={14} />
                    <span className="hidden sm:inline">
                      {deletingOrderId === currentOrderId ? 'Mažu...' : 'Smazat'}
                    </span>
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* POTVRZOVACÍ MODÁL PRO SMAZÁNÍ OBJEDNÁVKY */}
      <Dialog open={!!orderToDelete} onOpenChange={open => { if (!open && !deletingOrderId) setOrderToDelete(null); }}>
        <DialogContent className="sm:max-w-md rounded-[2rem] p-6 sm:p-8 bg-white border border-gray-100 shadow-2xl space-y-5">
          <div className="space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mb-2">
              <AlertTriangle size={24} />
            </div>
            <DialogTitle className="text-xl sm:text-2xl font-sans font-black text-gray-900">
              Smazat objednávku?
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-gray-600 leading-relaxed">
              Opravdu chceš trvale odstranit tento záznam o platbě / objednávce z přehledu? Tuto akci nelze vrátit zpět.
            </DialogDescription>
          </div>

          {orderToDelete && (
            <div className="bg-[#FAF7F0] rounded-2xl p-4 border border-[#E6E0D4] space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-500 font-bold">Variabilní symbol:</span>
                <span className="font-mono font-black text-gray-900">{orderToDelete.variableSymbol}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-500 font-bold">Klient:</span>
                <span className="font-bold text-gray-900 truncate">{orderToDelete.clientName}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-500 font-bold">Částka:</span>
                <span className="font-black text-[#B80053]">{orderToDelete.amount || 99} Kč</span>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
            <Button
              type="button"
              variant="outline"
              disabled={!!deletingOrderId}
              onClick={() => setOrderToDelete(null)}
              className="flex-1 rounded-xl h-11 border-gray-200 text-gray-700 font-bold text-xs cursor-pointer"
            >
              Zrušit
            </Button>
            <Button
              type="button"
              disabled={!!deletingOrderId}
              onClick={confirmDeleteOrder}
              className="flex-1 rounded-xl h-11 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs shadow-md shadow-rose-100 cursor-pointer flex items-center justify-center gap-2"
            >
              {deletingOrderId ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  <span>Mažu objednávku...</span>
                </>
              ) : (
                <>
                  <Trash2 size={15} />
                  <span>Ano, smazat platbu</span>
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
