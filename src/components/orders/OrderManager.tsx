import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, doc, updateDoc, orderBy, runTransaction } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { formatCurrency } from '../../lib/utils';
import { 
  Calendar, 
  Clock, 
  MapPin, 
  CheckCircle2, 
  AlertCircle, 
  ChevronRight,
  Package,
  User,
  Truck
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface Order {
  id: string;
  customerName: string;
  customerPhone?: string;
  items: any[];
  total: number;
  deliveryDate: string;
  deliveryTime?: string;
  deliveryAddress?: string;
  status: 'scheduled' | 'paid' | 'delivered';
  paymentMethod: string;
}

export default function OrderManager() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'sales'), 
      where('status', '==', 'scheduled'),
      orderBy('deliveryDate', 'asc')
    );

    const unsub = onSnapshot(q, (snap) => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() } as Order)));
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const getStatusColor = (deliveryDate: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const delivery = new Date(deliveryDate);
    delivery.setHours(24, 0, 0, 0); // End of that day

    const diffTime = delivery.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return 'red'; // Today or overdue
    if (diffDays <= 2) return 'amber'; // Near
    return 'emerald'; // Relaxed
  };

  const handleConfirmDelivery = async (order: Order) => {
    try {
      await runTransaction(db, async (transaction) => {
        const saleRef = doc(db, 'sales', order.id);
        const saleDoc = await transaction.get(saleRef);
        
        if (!saleDoc.exists()) return;

        const customerId = saleDoc.data().customerId;
        let customerDoc = null;
        let customerRef = null;

        if (customerId) {
          customerRef = doc(db, 'customers', customerId);
          customerDoc = await transaction.get(customerRef);
        }

        // --- ALL READS COMPLETED ABOVE ---
        // --- ALL WRITES START BELOW ---

        // Update the sale status
        transaction.update(saleRef, {
          status: 'paid',
          paymentMethod: 'efectivo',
          date: new Date().toISOString()
        });

        // If it was scheduled and had a customer, decrease their balance
        if (customerRef && customerDoc?.exists()) {
          const currentBalance = Number(customerDoc.data().balance || 0);
          const saleTotal = Number(saleDoc.data().total || 0);
          transaction.update(customerRef, { balance: Math.max(0, currentBalance - saleTotal) });
        }
      });
      alert('Entrega confirmada y saldo actualizado.');
    } catch (error) {
      console.error(error);
      alert('Error al confirmar entrega');
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64">Cargando pedidos...</div>;

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tight">Calendario de Entregas</h2>
          <p className="text-slate-400 font-bold text-sm tracking-wide mt-1">PROGRAMA Y GESTIONA TUS PRODUCTOS</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {orders.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-slate-100 rounded-[2.5rem] p-12 text-center">
            <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center mx-auto mb-4">
              <Calendar className="w-10 h-10 text-slate-200" />
            </div>
            <p className="text-slate-400 font-black uppercase tracking-widest text-xs">No hay entregas programadas</p>
          </div>
        ) : (
          orders.map((order) => {
            const color = getStatusColor(order.deliveryDate);
            const colorClasses = {
              red: 'border-red-100 bg-red-50/50 text-red-600 icon-bg-red-500',
              amber: 'border-amber-100 bg-amber-50/50 text-amber-600 icon-bg-amber-500',
              emerald: 'border-emerald-100 bg-emerald-50/50 text-emerald-600 icon-bg-emerald-500'
            }[color];

            const iconBg = {
              red: 'bg-red-500',
              amber: 'bg-amber-500',
              emerald: 'bg-emerald-500'
            }[color];

            return (
              <div key={order.id} className={cn("bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm transition-all hover:shadow-md", color && `border-l-8 ${color === 'red' ? 'border-l-red-500' : color === 'amber' ? 'border-l-amber-500' : 'border-l-emerald-500'}`)}>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="flex items-center gap-5">
                    <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-lg", iconBg)}>
                      <Truck className="w-7 h-7" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Entrega Programada</span>
                        <span className={cn("text-[9px] font-black uppercase px-2 py-0.5 rounded-md", 
                          color === 'red' ? 'bg-red-100 text-red-600' : color === 'amber' ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'
                        )}>
                          {color === 'red' ? 'Urgente / Hoy' : color === 'amber' ? 'Próximo' : 'Normal'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-2xl font-black text-slate-900 leading-none">{order.deliveryDate}</p>
                        {order.deliveryTime && (
                          <div className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded-lg">
                            <Clock className="w-3 h-3 text-slate-500" />
                            <span className="text-xs font-bold text-slate-700">{order.deliveryTime}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 mt-3">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-slate-400" />
                          <span className="text-sm font-black text-slate-800">{order.customerName}</span>
                          {order.customerPhone && <span className="text-xs font-bold text-slate-400">({order.customerPhone})</span>}
                        </div>
                        {order.deliveryAddress && (
                          <div className="flex items-start gap-2">
                            <MapPin className="w-4 h-4 text-rose-400 mt-0.5" />
                            <span className="text-xs font-medium text-slate-500 max-w-[200px]">{order.deliveryAddress}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 md:px-8 border-l border-r border-slate-50">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Detalle del Pedido</p>
                    <div className="space-y-2">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-slate-50/50 p-2 rounded-xl border border-slate-100">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-blue-100 rounded-lg flex items-center justify-center">
                               <Package className="w-3 h-3 text-blue-600" />
                            </div>
                            <span className="text-xs font-bold text-slate-700">{item.flavor}</span>
                          </div>
                          <span className="text-xs font-black text-blue-600">x{item.quantity}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total</p>
                      <p className="text-2xl font-black text-slate-900">{formatCurrency(order.total)}</p>
                    </div>
                    <button 
                      onClick={() => handleConfirmDelivery(order)}
                      className="bg-blue-600 text-white p-4 rounded-2xl shadow-lg shadow-blue-100 hover:scale-105 active:scale-95 transition-all group"
                    >
                      <CheckCircle2 className="w-7 h-7" />
                      <span className="sr-only">Confirmar Entrega</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
