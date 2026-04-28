import React, { useState, useEffect } from 'react';
import { 
  DollarSign, TrendingUp, TrendingDown, Plus, 
  Calendar, CreditCard, PieChart, Info, Trash2, Edit2, X
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
    linkedIngredientId: '' 
  });

  useEffect(() => {
    onSnapshot(query(collection(db, 'expenses'), orderBy('date', 'desc')), snap => setExpenses(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
    onSnapshot(collection(db, 'ingredients'), snap => setIngredients(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
    onSnapshot(collection(db, 'sales'), snap => setSales(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isEditMode && editingId) {
        await updateDoc(doc(db, 'expenses', editingId), {
          ...formData,
          amount: Number(formData.amount),
          updatedAt: new Date().toISOString()
        });
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
          // Register Expense
          const expRef = doc(collection(db, 'expenses'));
          const expenseData: any = { 
            ...formData, 
            amount: Number(formData.amount),
            createdAt: new Date().toISOString()
          };
          transaction.set(expRef, expenseData);

          // Update Inventory if linked and valid
          if (ingDoc && ingDoc.exists() && (formData as any).quantityBought) {
            const currentStock = Number(ingDoc.data().stock || 0);
            const addedStock = Number((formData as any).quantityBought || 0);
            transaction.update(ingRef!, { stock: currentStock + addedStock });
          }
        });
        alert('Gasto registrado e inventario actualizado.');
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
      linkedIngredientId: exp.linkedIngredientId || ''
    });
    setEditingId(exp.id);
    setIsEditMode(true);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Seguro que deseas eliminar este gasto? No se revertirá el stock si fue una compra de insumos.')) return;
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
      linkedIngredientId: '' 
    });
  };

  const totalSales = sales.reduce((sum, s) => sum + (s.total || 0), 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const netUtility = totalSales - totalExpenses;
  const margin = totalSales > 0 ? (netUtility / totalSales) * 100 : 0;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Egresos & Gastos</h2>
          <p className="text-gray-500">Gestión de costos fijos y variables.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Registrar Gasto
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
           <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
             <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
               <h3 className="font-bold text-gray-900">Historial de Gastos</h3>
               <span className="text-sm font-bold text-red-500">Total: {formatCurrency(totalExpenses)}</span>
             </div>
             <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-400 text-xs uppercase tracking-wider">
                      <th className="px-6 py-4">Fecha</th>
                      <th className="px-6 py-4">Descripción</th>
                      <th className="px-6 py-4">Tipo</th>
                      <th className="px-6 py-4">Monto</th>
                      <th className="px-6 py-4">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {expenses.map(exp => (
                      <tr key={exp.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-gray-500">{formatDate(exp.date)}</td>
                        <td className="px-6 py-4 font-bold text-gray-900">{exp.description}</td>
                        <td className="px-6 py-4 capitalize">
                          <span className={cn(
                            "px-2 py-1 rounded-lg text-[10px] font-bold uppercase",
                            exp.type === 'fixed' ? "bg-blue-50 text-blue-600" : "bg-orange-50 text-orange-600"
                          )}>{exp.type}</span>
                        </td>
                        <td className="px-6 py-4 font-black text-red-500">{formatCurrency(exp.amount)}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => handleEdit(exp)} className="p-2 text-gray-300 hover:text-blue-600 hover:bg-white rounded-lg transition-colors">
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDelete(exp.id)} className="p-2 text-gray-300 hover:text-red-500 hover:bg-white rounded-lg transition-colors">
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

        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
            <h3 className="font-bold text-gray-900 mb-4">Calculadora de Utilidad</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Ingresos Totales (Ventas)</span>
                <span className="text-green-600 font-bold">{formatCurrency(totalSales)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Gastos Registrados</span>
                <span className="text-red-500 font-bold">-{formatCurrency(totalExpenses)}</span>
              </div>
              <div className="pt-4 border-t border-gray-100 flex justify-between items-end">
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase">Utilidad Real</p>
                  <p className={cn("text-2xl font-black", netUtility >= 0 ? "text-blue-600" : "text-red-600")}>
                    {formatCurrency(netUtility)}
                  </p>
                </div>
                <div className={cn(
                  "px-2 py-1 rounded-lg text-[10px] font-black mb-1",
                  margin >= 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                )}>
                  MARGEN {margin.toFixed(0)}%
                </div>
              </div>
            </div>
          </div>

          <div className="bg-blue-600 p-6 rounded-3xl text-white shadow-xl">
             <div className="flex items-center gap-3 mb-4">
               <Info className="w-6 h-6 opacity-80" />
               <h3 className="font-bold">Nota de Arquitectura</h3>
             </div>
             <p className="text-sm text-blue-100 leading-relaxed">
               La utilidad real se calcula deduciendo el costo dinámico de ingredientes consumidos y los gastos fijos prorrateados según volumen de producción.
             </p>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div onClick={handleCloseModal} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-[2.5rem] shadow-2xl p-10 w-full max-w-lg relative z-10"
          >
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-3xl font-black tracking-tight">{isEditMode ? 'Editar' : 'Registrar'} <span className="text-rose-600">Egreso</span></h3>
              <button onClick={handleCloseModal} className="p-2 hover:bg-slate-100 rounded-full"><X className="w-6 h-6" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input label="Descripción" value={formData.description} onChange={(v:any) => setFormData({...formData, description: v})} required />
              <Input label="Monto total ($)" type="number" value={formData.amount} onChange={(v:any) => setFormData({...formData, amount: v})} required />
              
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Tipo de Gasto</label>
                <div className="flex p-1 bg-slate-100 rounded-2xl">
                  {['fixed', 'variable'].map(t => (
                    <button key={t} type="button" onClick={() => setFormData({...formData, type: t as any})} className={cn(
                      "flex-1 py-3 rounded-xl text-xs font-bold transition-all capitalize",
                      formData.type === t ? "bg-white shadow-sm text-blue-600" : "text-slate-500"
                    )}>{t === 'fixed' ? 'Fijo' : 'Insumos/Variable'}</button>
                  ))}
                </div>
              </div>

              {formData.type === 'variable' && (
                <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Vincular a Insumo (Incrementa Stock)</label>
                  <select 
                    value={formData.linkedIngredientId} 
                    onChange={e => setFormData({...formData, linkedIngredientId: e.target.value})}
                    className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl font-bold text-sm"
                  >
                    <option value="">Ninguno</option>
                    {ingredients.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                  </select>
                  {formData.linkedIngredientId && (
                     <Input 
                      label="Cantidad comprada (se sumará al stock)" 
                      type="number" 
                      onChange={(v:any) => setFormData({...formData, quantityBought: Number(v)})} 
                     />
                  )}
                </div>
              )}

              <Input label="Fecha del Gasto" type="date" value={formData.date} onChange={(v:any) => setFormData({...formData, date: v})} />
              
              <button className="w-full bg-rose-600 text-white font-black py-5 rounded-3xl shadow-xl shadow-rose-200 mt-4 active:scale-95 transition-all uppercase tracking-widest">
                {isEditMode ? 'Actualizar Movimiento' : 'Registrar Movimiento'}
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
    <div className="space-y-1">
      <label className="text-xs font-bold text-gray-500 uppercase ml-1">{label}</label>
      <input 
        type={type} 
        value={value} 
        onChange={e => onChange(e.target.value)}
        required={required}
        className="w-full px-4 py-2.5 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-red-600 transition-all font-medium font-bold"
      />
    </div>
  );
}
