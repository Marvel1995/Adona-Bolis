import React, { useState, useEffect } from 'react';
import { Users, Plus, Search, Phone, Mail, UserPlus, X, Edit2, Trash2 } from 'lucide-react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { cn, formatCurrency } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export default function CustomerManager() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState({ name: '', phone: '', email: '', type: 'retail', balance: 0 });

  useEffect(() => {
    onSnapshot(query(collection(db, 'customers'), orderBy('name')), snap => {
      setCustomers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isEditMode && editingId) {
        await updateDoc(doc(db, 'customers', editingId), formData);
      } else {
        await addDoc(collection(db, 'customers'), formData);
      }
      handleCloseModal();
    } catch (err) {
      handleFirestoreError(err, isEditMode ? OperationType.UPDATE : OperationType.CREATE, 'customers');
    }
  };

  const handleEdit = (customer: any) => {
    setFormData({
      name: customer.name || '',
      phone: customer.phone || '',
      email: customer.email || '',
      type: customer.type || 'retail',
      balance: customer.balance || 0
    });
    setEditingId(customer.id);
    setIsEditMode(true);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Seguro que deseas eliminar este cliente?')) return;
    try {
      await deleteDoc(doc(db, 'customers', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'customers');
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setIsEditMode(false);
    setEditingId(null);
    setFormData({ name: '', phone: '', email: '', type: 'retail', balance: 0 });
  };

  const filtered = customers.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tight">Clientes</h2>
          <p className="text-slate-500 font-medium">Base de datos de compradores regulares y distribuidores.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-2xl font-bold flex items-center gap-2 shadow-lg shadow-blue-200 transition-all"
        >
          <UserPlus className="w-5 h-5" />
          Nuevo Cliente
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 relative">
          <Search className="absolute left-10 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
          <input 
            type="text" 
            placeholder="Filtrar por nombre..." 
            className="w-full pl-12 pr-4 py-3 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-blue-600 text-sm font-semibold"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 text-slate-400 text-[10px] uppercase font-black tracking-widest">
                <th className="px-8 py-4">Nombre Completo</th>
                <th className="px-8 py-4">Contacto</th>
                <th className="px-8 py-4">Tipo</th>
                <th className="px-8 py-4">Saldo Pendiente</th>
                <th className="px-8 py-4">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(customer => (
                <tr key={customer.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-8 py-5">
                    <p className="font-bold text-slate-900">{customer.name}</p>
                    <p className="text-[10px] text-slate-400 font-mono uppercase">ID/{customer.id.slice(-5)}</p>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2 text-xs text-slate-600">
                        <Phone className="w-3 h-3" /> {customer.phone || 'N/A'}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <Mail className="w-3 h-3" /> {customer.email || 'N/A'}
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <span className={cn(
                      "px-3 py-1 rounded-full text-[10px] font-black uppercase",
                      customer.type === 'wholesale' ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                    )}>
                      {customer.type === 'wholesale' ? 'Mayoreo' : 'Menudeo'}
                    </span>
                  </td>
                  <td className="px-8 py-5">
                    <p className={cn(
                      "font-black",
                      customer.balance > 0 ? "text-rose-600" : "text-emerald-600"
                    )}>
                      {formatCurrency(customer.balance || 0)}
                    </p>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleEdit(customer)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-white rounded-lg transition-colors">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(customer.id)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-white rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <div className="p-20 text-center text-slate-300 font-bold uppercase tracking-widest">No se encontraron clientes</div>}
        </div>
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div onClick={handleCloseModal} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              className="bg-white rounded-[2.5rem] p-10 w-full max-w-lg relative z-10 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-3xl font-black tracking-tight">{isEditMode ? 'Editar' : 'Nuevo'} <span className="text-blue-600">Cliente</span></h3>
                <button onClick={handleCloseModal} className="p-2 hover:bg-slate-100 rounded-full"><X /></button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <Input label="Nombre o Razón Social" value={formData.name} onChange={(v:any) => setFormData({...formData, name: v})} required />
                <div className="grid grid-cols-2 gap-4">
                  <Input label="Teléfono" value={formData.phone} onChange={(v:any) => setFormData({...formData, phone: v})} />
                  <Input label="Correo Electrónico" type="email" value={formData.email} onChange={(v:any) => setFormData({...formData, email: v})} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Tipo de Cliente</label>
                  <div className="flex p-1 bg-slate-100 rounded-2xl">
                    <button type="button" onClick={() => setFormData({...formData, type: 'retail'})} className={cn(
                      "flex-1 py-3 rounded-xl text-xs font-bold transition-all",
                      formData.type === 'retail' ? "bg-white shadow-sm text-blue-600" : "text-slate-500"
                    )}>Menudeo</button>
                    <button type="button" onClick={() => setFormData({...formData, type: 'wholesale'})} className={cn(
                      "flex-1 py-3 rounded-xl text-xs font-bold transition-all",
                      formData.type === 'wholesale' ? "bg-white shadow-sm text-blue-600" : "text-slate-500"
                    )}>Mayoreo (Diferenciados)</button>
                  </div>
                </div>
                <button className="w-full bg-blue-600 text-white font-black py-5 rounded-[1.5rem] shadow-xl shadow-blue-200 mt-4 active:scale-95 transition-all uppercase tracking-widest">
                  {isEditMode ? 'Actualizar Cliente' : 'Registrar Cliente'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Input({ label, type = 'text', value, onChange, required }: any) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">{label}</label>
      <input 
        type={type} 
        value={value} 
        onChange={e => onChange(e.target.value)}
        required={required}
        className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-600 transition-all font-bold"
      />
    </div>
  );
}
