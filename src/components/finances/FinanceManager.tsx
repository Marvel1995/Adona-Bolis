import React, { useState, useEffect } from 'react';
import { 
  DollarSign, TrendingUp, TrendingDown, Plus, 
  Calendar, CreditCard, PieChart, Info, Trash2, Edit2, X,
  AlertTriangle, AlertCircle
} from 'lucide-react';
import { collection, onSnapshot, addDoc, query, orderBy, getDocs, runTransaction, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { cn, formatCurrency, formatDate } from '../../lib/utils';
import { motion } from 'motion/react';

export default function FinanceManager() {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ 
    description: '', 
    amount: 0, 
    type: 'fixed', 
    date: new Date().toISOString().split('T')[0],
    linkedIngredientId: '',
    contributor: 'Negocio',
    isInvestmentWithdrawal: false
  });

  useEffect(() => {
    onSnapshot(query(collection(db, 'expenses'), orderBy('date', 'desc')), snap => setExpenses(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
    onSnapshot(collection(db, 'ingredients'), snap => setIngredients(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
    onSnapshot(collection(db, 'sales'), snap => setSales(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const finalData = {
        ...formData,
        amount: Number(formData.amount),
        updatedAt: new Date().toISOString()
      };

      if (isEditMode && editingId) {
        await updateDoc(doc(db, 'expenses', editingId), finalData);
        alert('Gasto actualizado.');
      } else {
        await runTransaction(db, async (transaction) => {
          // 1. PRE-FETCH INGREDIENT IF LINKED (READ)
          let ingDoc = null;
          let ingRef = null;
          if (formData.type === 'variable' && formData.linkedIngredientId) {
            ingRef = doc(db, 'ingredients', formData.linkedIngredientId);
            ingDoc = await transaction.get(ingRef);
          }

          // 2. PERFORM WRITES
          const expRef = doc(collection(db, 'expenses'));
          transaction.set(expRef, {
            ...finalData,
            createdAt: new Date().toISOString()
          });

          // Update Inventory if linked and valid
          if (ingDoc && ingDoc.exists() && (formData as any).quantityBought) {
            const currentStock = Number(ingDoc.data().stock || 0);
            const addedStock = Number((formData as any).quantityBought || 0);
            transaction.update(ingRef!, { stock: currentStock + addedStock });
          }
        });
        alert('Gasto registrado exitosamente.');
      }
      handleCloseModal();
    } catch (err) {
      handleFirestoreError(err, isEditMode ? OperationType.UPDATE : OperationType.CREATE, 'expenses');
    }
  };

  const handleEdit = (exp: any) => {
    setFormData({
      description: exp.description || '',
      amount: exp.amount || 0,
      type: exp.type || 'fixed',
      date: exp.date || new Date().toISOString().split('T')[0],
      linkedIngredientId: exp.linkedIngredientId || '',
      contributor: exp.contributor || 'Negocio',
      isInvestmentWithdrawal: exp.isInvestmentWithdrawal || false
    });
    setEditingId(exp.id);
    setIsEditMode(true);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Seguro que deseas eliminar este gasto?')) return;
    try {
      await deleteDoc(doc(db, 'expenses', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'expenses');
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setIsEditMode(false);
    setEditingId(null);
    setFormData({ 
      description: '', 
      amount: 0, 
      type: 'fixed', 
      date: new Date().toISOString().split('T')[0], 
      linkedIngredientId: '',
      contributor: 'Negocio',
      isInvestmentWithdrawal: false
    });
  };

  const totalSales = sales.reduce((sum, s) => sum + (s.total || 0), 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const netUtility = totalSales - totalExpenses;
  const margin = totalSales > 0 ? (netUtility / totalSales) * 100 : 0;

  // Partner calculations
  const partners = ['Mauricio', 'Silvia', 'Alexis'];
  const partnerBalances = partners.map(p => ({
    name: p,
    contribution: expenses.filter(e => e.contributor === p && !e.isInvestmentWithdrawal).reduce((sum, e) => sum + e.amount, 0),
    withdrawal: expenses.filter(e => e.contributor === p && e.isInvestmentWithdrawal).reduce((sum, e) => sum + e.amount, 0),
  }));

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tight">Finanzas y Socios</h2>
          <p className="text-slate-500 font-medium">Gestión de capital, egresos y retiros de inversión.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-slate-900 hover:bg-black text-white px-8 py-4 rounded-2xl font-black flex items-center gap-2 shadow-xl transition-all active:scale-95 uppercase text-xs tracking-widest"
        >
          <Plus className="w-5 h-5" />
          Nuevo Movimiento
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
           {/* Resumen por Socios */}
           <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
             {partnerBalances.map(pb => (
               <div key={pb.name} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden group">
                 <div className="flex justify-between items-start mb-4">
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl group-hover:scale-110 transition-transform">
                      <TrendingUp className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Saldo Socio</span>
                 </div>
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-blue-600">{pb.name}</p>
                 <p className="text-xl font-black text-slate-900">{formatCurrency(pb.contribution - pb.withdrawal)}</p>
                 <div className="mt-4 pt-4 border-t border-slate-50 flex justify-between items-center text-[10px] font-bold">
                    <span className="text-emerald-600">APORTES: {formatCurrency(pb.contribution)}</span>
                    <span className="text-rose-600">RETIROS: {formatCurrency(pb.withdrawal)}</span>
                 </div>
               </div>
             ))}
           </div>

           <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
             <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
               <h3 className="font-black text-slate-900 uppercase text-sm tracking-widest flex items-center gap-2">
                 <Calendar className="w-4 h-4 text-rose-500" /> Historial Financiero
               </h3>
               <span className="px-4 py-1 bg-white border border-slate-200 rounded-full text-xs font-black text-rose-600">TOTAL EGRESOS: {formatCurrency(totalExpenses)}</span>
             </div>
             <div className="overflow-x-auto overflow-y-auto max-h-[600px] min-h-0">
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="bg-slate-50 text-slate-400 text-[10px] uppercase font-black tracking-widest">
                      <th className="px-8 py-4">Fecha</th>
                      <th className="px-8 py-4">Descripción</th>
                      <th className="px-8 py-4">Realizado Por</th>
                      <th className="px-8 py-4">Tipo</th>
                      <th className="px-8 py-4">Monto</th>
                      <th className="px-8 py-4">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {expenses.map(exp => (
                      <tr 
                        key={exp.id} 
                        onClick={() => handleEdit(exp)}
                        className="hover:bg-slate-50 group transition-colors cursor-pointer"
                      >
                        <td className="px-8 py-5 text-xs font-bold text-slate-500">{formatDate(exp.date)}</td>
                        <td className="px-8 py-5">
                          <p className="font-bold text-slate-900">{exp.description}</p>
                          {exp.isInvestmentWithdrawal && <span className="text-[9px] font-black text-rose-600 uppercase italic">Retiro de Inversión</span>}
                        </td>
                        <td className="px-8 py-5">
                           <span className={cn(
                             "px-3 py-1 rounded-full text-[9px] font-black uppercase",
                             exp.contributor === 'Negocio' ? "bg-slate-100 text-slate-600" : "bg-blue-100 text-blue-700"
                           )}>
                             {exp.contributor}
                           </span>
                        </td>
                        <td className="px-8 py-5">
                          <span className={cn(
                            "px-3 py-1 rounded-full text-[9px] font-black uppercase",
                            exp.type === 'fixed' ? "bg-indigo-50 text-indigo-600" : 
                            exp.type === 'variable' ? "bg-amber-50 text-amber-600" :
                            "bg-rose-50 text-rose-600"
                          )}>
                            {exp.type === 'fixed' ? 'Fijo' : exp.type === 'variable' ? 'Insumos' : 'Retiro'}
                          </span>
                        </td>
                        <td className="px-8 py-5 font-black text-rose-600">{formatCurrency(exp.amount)}</td>
                        <td className="px-8 py-5" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                            <button onClick={() => handleEdit(exp)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-white border hover:border-blue-100 rounded-xl transition-all">
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDelete(exp.id)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-white border hover:border-rose-100 rounded-xl transition-all">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
             </div>
           </div>
        </div>

        <div className="space-y-8">
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50 rounded-full -mr-16 -mt-16 opacity-50" />
            <h3 className="font-black text-slate-900 uppercase text-xs tracking-widest mb-6 flex items-center gap-2 relative">
              <PieChart className="w-4 h-4 text-blue-600" /> Calculadora de Utilidad
            </h3>
            <div className="space-y-6 relative">
              <div className="flex justify-between items-center group">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ingresos Totales</span>
                <span className="text-lg font-black text-emerald-600">{formatCurrency(totalSales)}</span>
              </div>
              <div className="flex justify-between items-center group">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Egresos Totales</span>
                <span className="text-lg font-black text-rose-600">-{formatCurrency(totalExpenses)}</span>
              </div>
              <div className="pt-6 border-t border-slate-100 flex justify-between items-end">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Utilidad Neta</p>
                  <p className={cn("text-3xl font-black", netUtility >= 0 ? "text-blue-600" : "text-rose-600")}>
                    {formatCurrency(netUtility)}
                  </p>
                </div>
                <div className={cn(
                  "px-3 py-1.5 rounded-xl text-[10px] font-black mb-1 flex items-center gap-1 shadow-sm",
                  margin >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                )}>
                  {margin >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {margin.toFixed(0)}% MARGEN
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden">
             <div className="absolute bottom-0 right-0 w-40 h-40 bg-white/5 rounded-full -mb-20 -mr-20" />
             <div className="flex items-center gap-3 mb-6 relative">
               <div className="p-2 bg-white/10 rounded-xl">
                 <Info className="w-5 h-5 text-blue-300" />
               </div>
               <h3 className="font-black text-xs uppercase tracking-widest">Información Estratégica</h3>
             </div>
             <p className="text-sm text-slate-400 font-medium leading-relaxed relative">
               Los egresos realizados por socios generan un saldo a favor. Los retiros de inversión se contabilizan por separado pero afectan la utilidad neta operativa del negocio.
             </p>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={handleCloseModal}>
          <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }}
            className="bg-white rounded-[3rem] shadow-2xl w-full max-w-lg relative z-10 flex flex-col max-h-[90vh] overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-10 pb-4 border-b border-slate-50 shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-black tracking-tight uppercase leading-none">{isEditMode ? 'Actualizar' : 'Registrar'} <span className="text-rose-600">Movimiento</span></h3>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2 px-1">Control de capital y gastos</p>
                </div>
                <button onClick={handleCloseModal} className="p-3 hover:bg-slate-100 rounded-2xl transition-all"><X className="w-6 h-6 text-slate-400" /></button>
              </div>
            </div>
            
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-10 pt-6 space-y-6">
              <Input label="Descripción del Gasto" value={formData.description} onChange={(v:any) => setFormData({...formData, description: v})} required />
              
              <div className="grid grid-cols-2 gap-4">
                <Input label="Monto total ($)" type="number" value={formData.amount} onChange={(v:any) => setFormData({...formData, amount: v})} required />
                <Input label="Fecha" type="date" value={formData.date} onChange={(v:any) => setFormData({...formData, date: v})} />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Quién realizó el gasto?</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-slate-100 p-1 rounded-2xl">
                  {['Negocio', 'Mauricio', 'Silvia', 'Alexis'].map(p => (
                    <button key={p} type="button" onClick={() => setFormData({...formData, contributor: p})} className={cn(
                      "py-2 rounded-xl text-[10px] font-black transition-all uppercase tracking-tighter",
                      formData.contributor === p ? "bg-white shadow-sm text-blue-600" : "text-slate-400 hover:text-slate-600"
                    )}>{p}</button>
                  ))}
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Tipo de Movimiento</label>
                <div className="flex p-1 bg-slate-100 rounded-2xl">
                  {['fixed', 'variable', 'withdrawal'].map(t => (
                    <button key={t} type="button" onClick={() => setFormData({...formData, type: t as any, isInvestmentWithdrawal: t === 'withdrawal'})} className={cn(
                      "flex-1 py-3 rounded-xl text-[10px] font-black transition-all uppercase tracking-widest",
                      formData.type === t ? "bg-white shadow-sm text-blue-600" : "text-slate-400"
                    )}>{t === 'fixed' ? 'Fijo' : t === 'variable' ? 'Insumos' : 'Retiro Inv.'}</button>
                  ))}
                </div>
              </div>

              {formData.type === 'variable' && (
                <div className="space-y-2 animate-in slide-in-from-top-2 duration-300 bg-slate-50 p-6 rounded-3xl border border-slate-100">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Vincular a Insumo</label>
                  <select 
                    value={formData.linkedIngredientId} 
                    onChange={e => setFormData({...formData, linkedIngredientId: e.target.value})}
                    className="w-full px-5 py-4 bg-white border-2 border-transparent rounded-2xl font-bold text-sm focus:border-blue-600 transition-all outline-none"
                  >
                    <option value="">No vincular</option>
                    {ingredients.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                  </select>
                  {formData.linkedIngredientId && (
                     <div className="mt-4">
                       <Input 
                        label="Cantidad comprada" 
                        type="number" 
                        onChange={(v:any) => setFormData({...formData, quantityBought: Number(v)})} 
                       />
                     </div>
                  )}
                </div>
              )}

              {formData.type === 'withdrawal' && formData.contributor === 'Negocio' && (
                <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-2">
                   <AlertCircle className="w-4 h-4 text-rose-500" />
                   <p className="text-[10px] font-bold text-rose-700 uppercase">Debes seleccionar el socio que retira la inversión.</p>
                </div>
              )}
              
              <button 
                disabled={formData.type === 'withdrawal' && formData.contributor === 'Negocio'}
                className="w-full bg-slate-900 hover:bg-black disabled:bg-slate-300 text-white font-black py-6 rounded-[2rem] shadow-2xl mt-4 active:scale-95 transition-all uppercase tracking-[0.2em] text-xs"
              >
                {isEditMode ? 'Actualizar Movimiento' : 'Confirmar Registro'}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function Input({ label, type = 'text', value, onChange, required }: any) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">{label}</label>
      <input 
        type={type} 
        value={value} 
        onChange={e => onChange(e.target.value)}
        required={required}
        className="w-full px-5 py-4 bg-slate-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-rose-600 transition-all font-bold text-sm outline-none"
      />
    </div>
  );
}

