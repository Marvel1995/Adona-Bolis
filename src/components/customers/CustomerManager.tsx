import React, { useState, useEffect } from 'react';
import { Users, Plus, Search, Phone, Mail, UserPlus, X, Edit2, Trash2, MessageSquare, History, Target, ShieldAlert, CheckCircle2, AlertCircle, Clock, ExternalLink } from 'lucide-react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, orderBy, where, Timestamp, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { cn, formatCurrency } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export default function CustomerManager() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const [customerSales, setCustomerSales] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [formData, setFormData] = useState({ 
    name: '', 
    phone: '', 
    email: '', 
    type: 'retail', 
    balance: 0,
    status: 'lead',
    source: '',
    address: ''
  });

  const statuses = [
    { id: 'lead', label: 'Lead', color: 'bg-blue-100 text-blue-700', icon: Target },
    { id: 'prospect', label: 'Prospecto', color: 'bg-amber-100 text-amber-700', icon: Clock },
    { id: 'active', label: 'Activo', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
    { id: 'inactive', label: 'Inactivo', color: 'bg-slate-100 text-slate-700', icon: History },
    { id: 'blocked', label: 'Bloqueado', color: 'bg-rose-100 text-rose-700', icon: ShieldAlert },
  ];

  useEffect(() => {
    onSnapshot(query(collection(db, 'customers'), orderBy('name')), snap => {
      setCustomers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
  }, []);

  const fetchCustomerHistory = async (customerId: string) => {
    const q = query(
      collection(db, 'sales'), 
      where('customerId', '==', customerId),
      orderBy('date', 'desc')
    );
    const snap = await getDocs(q);
    setCustomerSales(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = {
        ...formData,
        lastInteraction: new Date().toISOString()
      };

      if (isEditMode && editingId) {
        await updateDoc(doc(db, 'customers', editingId), data);
      } else {
        await addDoc(collection(db, 'customers'), {
          ...data,
          createdAt: new Date().toISOString()
        });
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
      balance: customer.balance || 0,
      status: customer.status || 'lead',
      source: customer.source || '',
      address: customer.address || ''
    });
    setEditingId(customer.id);
    setIsEditMode(true);
    setIsModalOpen(true);
  };

  const handleOpenDetail = (customer: any) => {
    setSelectedCustomer(customer);
    fetchCustomerHistory(customer.id);
    setIsDetailModalOpen(true);
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
    setFormData({ 
      name: '', 
      phone: '', 
      email: '', 
      type: 'retail', 
      balance: 0,
      status: 'lead',
      source: '',
      address: ''
    });
  };

  const filtered = customers.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         c.phone?.includes(searchTerm);
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            CRM <span className="text-blue-600">Clientes</span>
          </h2>
          <p className="text-slate-500 font-medium">Gestión avanzada de prospectos y relaciones comerciales.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-2xl font-bold flex items-center gap-2 shadow-lg shadow-blue-200 transition-all active:scale-95"
        >
          <UserPlus className="w-5 h-5" />
          Añadir a Pipeline
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {statuses.map(s => {
          const count = customers.filter(c => c.status === s.id).length;
          return (
            <button 
              key={s.id}
              onClick={() => setStatusFilter(statusFilter === s.id ? 'all' : s.id)}
              className={cn(
                "p-4 rounded-2xl border transition-all text-left group",
                statusFilter === s.id ? "bg-white border-blue-600 shadow-xl -translate-y-1" : "bg-white border-slate-100 hover:border-blue-200 hover:shadow-md",
                count === 0 && "opacity-50"
              )}
            >
              <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center mb-3 group-hover:scale-110 transition-transform", s.color)}>
                <s.icon className="w-4 h-4" />
              </div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">{s.label}</p>
              <p className="text-xl font-black text-slate-900">{count}</p>
            </button>
          );
        })}
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input 
              type="text" 
              placeholder="Buscar por nombre o teléfono..." 
              className="w-full pl-12 pr-4 py-3 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-blue-600 text-sm font-semibold"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 text-slate-400 text-[10px] uppercase font-black tracking-widest">
                <th className="px-8 py-4">Status / Cliente</th>
                <th className="px-8 py-4">Contacto</th>
                <th className="px-8 py-4">Tipo / Origen</th>
                <th className="px-8 py-4">Saldo</th>
                <th className="px-8 py-4">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(customer => {
                const s = statuses.find(st => st.id === (customer.status || 'lead')) || statuses[0];
                return (
                  <tr key={customer.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-3">
                        <div className={cn("w-2 h-2 rounded-full", s.color.split(' ')[0].replace('bg-', 'bg-'))} />
                        <div>
                          <button 
                            onClick={() => handleOpenDetail(customer)}
                            className="font-bold text-slate-900 hover:text-blue-600 transition-colors text-left block"
                          >
                            {customer.name}
                          </button>
                          <span className={cn("text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-tighter", s.color)}>
                            {s.label}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2 text-xs text-slate-600">
                          <Phone className="w-3 h-3" /> {customer.phone || '—'}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <Mail className="w-3 h-3" /> {customer.email || '—'}
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="space-y-1">
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[9px] font-black uppercase inline-block",
                          customer.type === 'wholesale' ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                        )}>
                          {customer.type === 'wholesale' ? 'Mayoreo' : 'Menudeo'}
                        </span>
                        {customer.source && (
                          <p className="text-[9px] font-bold text-slate-400 uppercase ml-1 italic">{customer.source}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-8 py-5 text-right md:text-left">
                      <p className={cn(
                        "font-black text-sm",
                        customer.balance > 0 ? "text-rose-600" : "text-emerald-600"
                      )}>
                        {formatCurrency(customer.balance || 0)}
                      </p>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <button 
                          onClick={() => handleOpenDetail(customer)} 
                          className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
                          title="Ver Detalle CRM"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleEdit(customer)} 
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDelete(customer.id)} 
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && <div className="p-20 text-center text-slate-300 font-bold uppercase tracking-widest">No se encontraron clientes en este pipeline</div>}
        </div>
      </div>

      {/* Modal Detalle CRM (Prospecto/Cliente) */}
      <AnimatePresence>
        {isDetailModalOpen && selectedCustomer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div onClick={() => setIsDetailModalOpen(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" />
            <motion.div 
              initial={{ opacity: 0, y: 50, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 50, scale: 0.95 }}
              className="bg-white rounded-[3rem] w-full max-w-5xl max-h-[90vh] shadow-2xl relative z-10 flex flex-col md:flex-row overflow-hidden border border-white/20"
            >
              {/* Sidebar Info */}
              <div className="w-full md:w-80 bg-slate-50 border-r border-slate-100 p-8 flex flex-col shrink-0 overflow-y-auto">
                <div className="mb-8">
                  <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center mb-4",
                    statuses.find(s => s.id === (selectedCustomer.status || 'lead'))?.color
                  )}>
                    <Users className="w-6 h-6" />
                  </div>
                  <h3 className="text-2xl font-black text-slate-900 leading-tight mb-2">{selectedCustomer.name}</h3>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-white px-3 py-1 rounded-full w-fit border border-slate-100 shadow-sm">
                    {statuses.find(s => s.id === (selectedCustomer.status || 'lead'))?.label}
                  </p>
                </div>

                <div className="space-y-6">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Contacto</p>
                    <div className="bg-white p-4 rounded-2xl border border-slate-100 space-y-3">
                      <div className="flex items-center gap-3 text-sm font-bold text-slate-700">
                        <Phone className="w-4 h-4 text-blue-500" /> {selectedCustomer.phone || 'Sin WhatsApp'}
                      </div>
                      <div className="flex items-center gap-3 text-sm font-bold text-slate-700 break-all">
                        <Mail className="w-4 h-4 text-emerald-500" /> {selectedCustomer.email || 'Sin correo'}
                      </div>
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Dirección</p>
                    <div className="bg-white p-4 rounded-2xl border border-slate-100 text-xs font-bold text-slate-600">
                      {selectedCustomer.address || 'No especificada'}
                    </div>
                  </div>

                  <div className="bg-blue-600 rounded-3xl p-6 text-white shadow-xl shadow-blue-100">
                    <p className="text-[10px] font-black text-blue-200 uppercase tracking-widest mb-1">Balance Actual</p>
                    <p className="text-2xl font-black">{formatCurrency(selectedCustomer.balance || 0)}</p>
                  </div>
                </div>
              </div>

              {/* Main Content History */}
              <div className="flex-1 p-10 overflow-y-auto custom-scrollbar">
                <div className="flex items-center justify-between mb-8">
                  <h4 className="text-xl font-black text-slate-900 uppercase">Historial de Relación</h4>
                  <button 
                    onClick={() => setIsDetailModalOpen(false)}
                    className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="space-y-10">
                  {/* Pipeline Status */}
                  <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 relative">
                     <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Pipeline Status</p>
                     <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
                       {statuses.map((s, idx) => {
                         const isActive = selectedCustomer.status === s.id;
                         return (
                           <React.Fragment key={s.id}>
                             <div className={cn(
                               "px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all whitespace-nowrap",
                               isActive ? "bg-blue-600 text-white shadow-lg scale-105" : "bg-white text-slate-400 border border-slate-100 opacity-60"
                             )}>
                               {s.label}
                             </div>
                             {idx < statuses.length - 1 && <div className="w-4 h-[1px] bg-slate-200 shrink-0" />}
                           </React.Fragment>
                         );
                       })}
                     </div>
                  </div>

                  {/* Orders History */}
                  <section className="space-y-4">
                    <h5 className="flex items-center gap-2 font-black text-slate-400 text-xs uppercase tracking-widest">
                       <History className="w-4 h-4" /> Compras Recientes ({customerSales.length})
                    </h5>
                    {customerSales.length > 0 ? (
                      <div className="space-y-3">
                        {customerSales.map(sale => (
                          <div key={sale.id} className="bg-white border border-slate-100 p-5 rounded-2xl flex items-center justify-between hover:shadow-md transition-shadow">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                                <Plus className="w-5 h-5 text-emerald-600" />
                              </div>
                              <div>
                                <p className="font-bold text-slate-900">{formatCurrency(sale.total)}</p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">{new Date(sale.date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                              </div>
                            </div>
                            <span className={cn(
                              "text-[9px] font-black px-3 py-1 rounded-full uppercase",
                              sale.status === 'paid' ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"
                            )}>
                              {sale.status === 'paid' ? 'Pagado' : 'Pendiente'}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-12 text-center bg-slate-50 border border-dashed border-slate-200 rounded-3xl">
                        <p className="text-[10px] font-black text-slate-400 uppercase">Sin compras registradas aún</p>
                      </div>
                    )}
                  </section>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div onClick={handleCloseModal} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2.5rem] p-10 w-full max-w-2xl relative z-10 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar"
            >
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-3xl font-black tracking-tight uppercase leading-none">{isEditMode ? 'Actualizar' : 'Añadir a'} <span className="text-blue-600">Pipeline</span></h3>
                  <p className="text-xs font-bold text-slate-400 mt-2 uppercase tracking-widest">Información clave para seguimiento comercial</p>
                </div>
                <button onClick={handleCloseModal} className="p-4 hover:bg-slate-100 rounded-2xl transition-colors"><X className="w-6 h-6 text-slate-400" /></button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-8">
                <div className="space-y-6">
                  <Input label="Nombre o Razón Social" value={formData.name} onChange={(v:any) => setFormData({...formData, name: v})} required />
                  
                  <div className="grid grid-cols-2 gap-4">
                    <Input label="Teléfono (WhatsApp)" value={formData.phone} onChange={(v:any) => setFormData({...formData, phone: v})} />
                    <Input label="Correo Electrónico" type="email" value={formData.email} onChange={(v:any) => setFormData({...formData, email: v})} />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Status CRM</label>
                       <select 
                         value={formData.status}
                         onChange={e => setFormData({...formData, status: e.target.value})}
                         className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-600 transition-all font-bold text-sm"
                       >
                         {statuses.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                       </select>
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Canal Origen</label>
                       <input 
                         placeholder="Ej: Facebook, Referido..."
                         value={formData.source}
                         onChange={e => setFormData({...formData, source: e.target.value})}
                         className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-600 transition-all font-bold text-sm"
                       />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Nivel de Precios</label>
                    <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-2xl">
                      <button type="button" onClick={() => setFormData({...formData, type: 'retail'})} className={cn(
                        "py-3 rounded-xl text-xs font-black transition-all uppercase tracking-widest",
                        formData.type === 'retail' ? "bg-white shadow-sm text-blue-600" : "text-slate-500"
                      )}>Menudeo</button>
                      <button type="button" onClick={() => setFormData({...formData, type: 'wholesale'})} className={cn(
                        "py-3 rounded-xl text-xs font-black transition-all uppercase tracking-widest",
                        formData.type === 'wholesale' ? "bg-white shadow-sm text-blue-600" : "text-slate-500"
                      )}>Mayoreo</button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Dirección / Notas</label>
                    <textarea 
                      rows={3}
                      value={formData.address}
                      onChange={e => setFormData({...formData, address: e.target.value})}
                      className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-600 transition-all font-bold text-sm resize-none"
                      placeholder="Dirección completa o notas relevantes del prospecto..."
                    />
                  </div>
                </div>

                <div className="pt-4">
                  <button className="w-full bg-slate-900 hover:bg-black text-white font-black py-6 rounded-[2rem] shadow-2xl transition-all uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-3 active:scale-95">
                    {isEditMode ? 'Confirmar Cambios' : 'Añadir a Pipeline'} <Plus className="w-4 h-4" />
                  </button>
                </div>
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
