import React, { useState, useEffect } from 'react';
import { Heart, TrendingUp, TrendingDown, CheckCircle2, History, Plus, Calendar, DollarSign } from 'lucide-react';
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { cn } from '../../lib/utils';
import { motion } from 'motion/react';

export default function TithingManager() {
  const [salesTotal, setSalesTotal] = useState(0);
  const [expensesTotal, setExpensesTotal] = useState(0);
  const [tithingHistory, setTithingHistory] = useState<any[]>([]);
  const [amountToPay, setAmountToPay] = useState('');
  const [description, setDescription] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    // Escuchar ventas para ingresos
    const unsubSales = onSnapshot(collection(db, 'sales'), (snap) => {
      const total = snap.docs.reduce((sum, doc) => sum + (doc.data().total || 0), 0);
      setSalesTotal(total);
    });

    // Escuchar gastos para egresos
    const unsubExp = onSnapshot(collection(db, 'expenses'), (snap) => {
      const total = snap.docs.reduce((sum, doc) => sum + (doc.data().amount || 0), 0);
      setExpensesTotal(total);
    });

    // Escuchar historial de diezmos
    const q = query(collection(db, 'tithing'), orderBy('date', 'desc'));
    const unsubTithing = onSnapshot(q, (snap) => {
      setTithingHistory(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubSales();
      unsubExp();
      unsubTithing();
    };
  }, []);

  const totalTithed = tithingHistory.reduce((sum, item) => sum + (item.amount || 0), 0);
  const netProfit = Math.max(0, salesTotal - expensesTotal);
  const expectedTithing = netProfit * 0.10;
  const pendingTithing = Math.max(0, expectedTithing - totalTithed);

  const handleRegisterTithing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amountToPay || parseFloat(amountToPay) <= 0) return;

    try {
      await addDoc(collection(db, 'tithing'), {
        amount: parseFloat(amountToPay),
        description: description || 'Diezmo Mensual / General',
        date: new Date().toISOString(),
        createdAt: serverTimestamp()
      });
      setAmountToPay('');
      setDescription('');
      setIsModalOpen(false);
    } catch (error) {
      console.error("Error al registrar diezmo:", error);
    }
  };

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tight">Apartado de Diezmo</h2>
          <p className="text-slate-500 font-medium">Gestión del 10% de las ganancias netas de la empresa.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-rose-600 text-white px-8 py-4 rounded-3xl font-black shadow-xl shadow-rose-200 hover:bg-rose-700 transition-all flex items-center gap-2 active:scale-95"
        >
          <Plus className="w-5 h-5" />
          Registrar Diezmo
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main calculation card */}
        <div className="lg:col-span-2 bg-white rounded-[3rem] p-10 border border-slate-100 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-12 opacity-[0.03] group-hover:scale-110 transition-transform duration-700">
            <Heart className="w-64 h-64 text-rose-600" />
          </div>
          
          <div className="relative z-10 space-y-10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Utilidad Neta (Total Histórico)</p>
                <h3 className="text-5xl font-black text-slate-900">{formatCurrency(netProfit)}</h3>
                <div className="flex items-center gap-4 pt-2">
                  <div className="flex items-center gap-1.5 text-emerald-600 text-xs font-bold">
                    <TrendingUp className="w-4 h-4" /> {formatCurrency(salesTotal)}
                  </div>
                  <div className="flex items-center gap-1.5 text-rose-500 text-xs font-bold">
                    <TrendingDown className="w-4 h-4" /> {formatCurrency(expensesTotal)}
                  </div>
                </div>
              </div>

              <div className="bg-slate-900 rounded-[2rem] p-8 text-white flex flex-col justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-rose-500 mb-2">Diezmo Esperado (10%)</p>
                  <h4 className="text-3xl font-black">{formatCurrency(expectedTithing)}</h4>
                </div>
                <div className="mt-6 flex items-center justify-between">
                   <div className="text-[10px] font-bold text-slate-500 uppercase">Ya apartado: {formatCurrency(totalTithed)}</div>
                   <div className="px-3 py-1 bg-rose-500/10 text-rose-500 rounded-full text-[9px] font-black">CALCULADO</div>
                </div>
              </div>
            </div>

            <div className="p-8 bg-rose-50 rounded-[2rem] border border-rose-100 flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="space-y-1">
                <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest">Pendiente por Apartar</p>
                <h4 className="text-4xl font-black text-rose-950">{formatCurrency(pendingTithing)}</h4>
              </div>
              <div className="flex flex-col items-end gap-2 text-right">
                <p className="text-[11px] font-bold text-rose-400 italic max-w-xs">
                  Este monto se calcula restando lo ya entregado del diezmo total proyectado.
                </p>
                {pendingTithing === 0 && (
                  <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm bg-white px-4 py-2 rounded-xl shadow-sm border border-emerald-100 animate-bounce">
                    <CheckCircle2 className="w-4 h-4" /> ¡Diezmo al día!
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Info card */}
        <div className="bg-slate-50 rounded-[3rem] p-10 flex flex-col justify-center gap-8 border border-slate-100">
           <div className="p-6 bg-white rounded-3xl shadow-sm">
              <Heart className="w-8 h-8 text-rose-600 mb-4" />
              <h5 className="font-black text-slate-900 uppercase text-xs mb-2">Propósito</h5>
              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                El diezmo es un agradecimiento por las bendiciones recibidas en la empresa. Se utiliza para fines benéficos o según se asigne en la visión del negocio.
              </p>
           </div>
           
           <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-2 h-12 bg-rose-600 rounded-full" />
                <p className="text-xs font-bold text-slate-700 leading-tight">
                  Recuerda que este cálculo es automático basado en Ventas vs Egresos actuales.
                </p>
              </div>
           </div>
        </div>
      </div>

      {/* History */}
      <div className="bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="p-3 bg-slate-900 text-white rounded-2xl">
               <History className="w-5 h-5" />
             </div>
             <h3 className="text-xl font-black text-slate-900 uppercase">Historial de Diezmos Apartados</h3>
          </div>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Histórico: {formatCurrency(totalTithed)}</span>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha</th>
                <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Descripción</th>
                <th className="px-8 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {tithingHistory.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-3">
                      <Calendar className="w-4 h-4 text-slate-400" />
                      <span className="text-sm font-bold text-slate-700">{new Date(item.date).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <span className="text-sm font-medium text-slate-500 italic">{item.description}</span>
                  </td>
                  <td className="px-8 py-5 text-right">
                    <span className="text-base font-black text-slate-900">{formatCurrency(item.amount)}</span>
                  </td>
                </tr>
              ))}
              {tithingHistory.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-8 py-20 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">
                    No hay registros de diezmos aún.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal for adding tithing */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-[2.5rem] w-full max-w-lg overflow-hidden shadow-2xl p-10"
          >
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-2xl font-black text-slate-900 uppercase">Registrar Apartado</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                <Heart className="w-6 h-6 text-slate-300 hover:text-rose-600" />
              </button>
            </div>

            <form onSubmit={handleRegisterTithing} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Monto a Apartar</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <DollarSign className="w-5 h-5 text-slate-400" />
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={amountToPay}
                    onChange={(e) => setAmountToPay(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 bg-slate-50 border-none rounded-2xl text-xl font-black text-slate-900 placeholder-slate-300 focus:ring-2 focus:ring-rose-600 transition-all"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Descripción / Concepto</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-4 py-4 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-900 placeholder-slate-300 focus:ring-2 focus:ring-rose-600 transition-all h-32 resize-none"
                  placeholder="Ej. Diezmo correspondiente al mes de Abril..."
                />
              </div>

              <div className="pt-4 flex gap-4">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-6 py-4 bg-slate-50 text-slate-500 font-black rounded-2xl hover:bg-slate-100 transition-all uppercase tracking-widest text-xs"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="flex-[2] px-6 py-4 bg-rose-600 text-white font-black rounded-2xl shadow-xl shadow-rose-200 hover:bg-rose-700 transition-all uppercase tracking-widest text-xs active:scale-95"
                >
                  Confirmar Apartado
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
