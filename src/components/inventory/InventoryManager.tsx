import React, { useState, useEffect } from 'react';
import { 
  Package, Plus, Search, Filter, AlertTriangle, 
  ArrowRight, MoreVertical, Edit2, Trash2, Scale,
  TrendingUp, ArrowUpRight
} from 'lucide-react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { cn, formatCurrency } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

type Unit = 'kg' | 'g' | 'l' | 'ml' | 'unit';

interface Ingredient {
  id: string;
  name: string;
  stock: number;
  unit: Unit;
  costPerUnit: number;
  reorderPoint: number;
}

interface Product {
  id: string;
  flavor: string;
  stock: number;
  priceWholesale: number;
  priceRetail: number;
  reorderPoint?: number;
}

export default function InventoryManager() {
  const [activeSubTab, setActiveSubTab] = useState<'ingredients' | 'finished'>('ingredients');
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Form State
  const [formData, setFormData] = useState<Partial<Ingredient & Product>>({
    name: '', flavor: '', stock: 0, unit: 'kg', costPerUnit: 0, reorderPoint: 0, priceWholesale: 0, priceRetail: 0
  });

  useEffect(() => {
    const qI = query(collection(db, 'ingredients'), orderBy('name'));
    const unsubI = onSnapshot(qI, (snap) => {
      setIngredients(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ingredient)));
    }, err => handleFirestoreError(err, OperationType.LIST, 'ingredients'));

    const qP = query(collection(db, 'products'), orderBy('flavor'));
    const unsubP = onSnapshot(qP, (snap) => {
      setProducts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
    }, err => handleFirestoreError(err, OperationType.LIST, 'products'));

    return () => { unsubI(); unsubP(); };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const collectionName = activeSubTab === 'ingredients' ? 'ingredients' : 'products';
    try {
      const data = {
        ...formData,
        updatedAt: new Date().toISOString()
      };

      if (isEditMode && editingId) {
        await updateDoc(doc(db, collectionName, editingId), data);
      } else {
        await addDoc(collection(db, collectionName), data);
      }
      
      handleCloseModal();
    } catch (err) {
      handleFirestoreError(err, isEditMode ? OperationType.UPDATE : OperationType.CREATE, collectionName);
    }
  };

  const handleEdit = (item: any) => {
    setFormData(item);
    setEditingId(item.id);
    setIsEditMode(true);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setIsEditMode(false);
    setEditingId(null);
    setFormData({ name: '', flavor: '', stock: 0, unit: 'kg', costPerUnit: 0, reorderPoint: 0, priceWholesale: 0, priceRetail: 0 });
  };

  const deleteItem = async (id: string, coll: string) => {
    if (!confirm('¿Seguro que deseas eliminar este item?')) return;
    try {
      await deleteDoc(doc(db, coll, id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, coll);
    }
  };

  const filteredIngredients = ingredients.filter(i => i.name.toLowerCase().includes(searchTerm.toLowerCase()));
  const filteredProducts = products.filter(p => p.flavor.toLowerCase().includes(searchTerm.toLowerCase()));

  // Calculate totals
  const totalIngredientsValue = ingredients.reduce((sum, item) => sum + (item.stock * item.costPerUnit), 0);
  const totalProductsWholesale = products.reduce((sum, item) => sum + (item.stock * item.priceWholesale), 0);
  const totalProductsRetail = products.reduce((sum, item) => sum + (item.stock * item.priceRetail), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Inventario</h2>
          <p className="text-gray-500">Control de insumos y productos terminados.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2 shadow-lg hover:shadow-xl transition-all"
        >
          <Plus className="w-5 h-5" />
          Nuevo Item
        </button>
      </div>

      {/* Capital Summary Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900 p-6 rounded-3xl text-white shadow-xl">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">Inversión en Insumos</p>
          <div className="flex items-center justify-between">
            <p className="text-2xl font-black">{formatCurrency(totalIngredientsValue)}</p>
            <div className="p-2 bg-white/5 rounded-xl border border-white/10">
              <Scale className="w-5 h-5 text-blue-400" />
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-white/5 flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase">Basado en costo unitario</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">Valor Total Mayoreo</p>
          <div className="flex items-center justify-between">
            <p className="text-2xl font-black text-slate-900">{formatCurrency(totalProductsWholesale)}</p>
            <div className="p-2 bg-blue-50 rounded-xl">
              <Package className="w-5 h-5 text-blue-600" />
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-2 text-blue-600">
            <TrendingUp className="w-3 h-3" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Potencial Mayorista</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">Valor Total Menudeo</p>
          <div className="flex items-center justify-between">
            <p className="text-2xl font-black text-slate-900">{formatCurrency(totalProductsRetail)}</p>
            <div className="p-2 bg-emerald-50 rounded-xl">
              <ArrowUpRight className="w-5 h-5 text-emerald-600" />
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-2 text-emerald-600">
            <TrendingUp className="w-3 h-3" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Potencial Público Final</span>
          </div>
        </div>
      </div>

      {/* Internal Tabs */}
      <div className="flex p-1 bg-gray-100 rounded-2xl w-fit">
        <button 
          onClick={() => setActiveSubTab('ingredients')}
          className={cn(
            "px-6 py-2 rounded-xl text-sm font-semibold transition-all",
            activeSubTab === 'ingredients' ? "bg-white shadow-sm text-blue-600" : "text-gray-500 hover:text-gray-700"
          )}
        >
          Insumos (Materia Prima)
        </button>
        <button 
          onClick={() => setActiveSubTab('finished')}
          className={cn(
            "px-6 py-2 rounded-xl text-sm font-semibold transition-all",
            activeSubTab === 'finished' ? "bg-white shadow-sm text-blue-600" : "text-gray-500 hover:text-gray-700"
          )}
        >
          Productos Terminados
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="p-4 border-b border-gray-100 flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input 
              type="text" 
              placeholder="Buscar por nombre..." 
              className="w-full pl-10 pr-4 py-2 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-blue-500 transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button className="p-2 text-gray-400 hover:bg-gray-50 rounded-lg"><Filter className="w-5 h-5" /></button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-gray-400 text-xs uppercase tracking-wider">
                <th className="px-6 py-4 font-semibold">Nombre / Sabor</th>
                <th className="px-6 py-4 font-semibold">Stock</th>
                <th className="px-6 py-4 font-semibold">Unidad</th>
                {activeSubTab === 'ingredients' ? (
                  <>
                    <th className="px-6 py-4 font-semibold">Costo Unit.</th>
                    <th className="px-6 py-4 font-semibold">Estado</th>
                  </>
                ) : (
                  <>
                    <th className="px-6 py-4 font-semibold">P. Mayoreo</th>
                    <th className="px-6 py-4 font-semibold">P. Menudeo</th>
                    <th className="px-6 py-4 font-semibold">Estado</th>
                  </>
                )}
                <th className="px-6 py-4 font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-gray-50">
              {activeSubTab === 'ingredients' ? filteredIngredients.map(item => (
                <InventoryRow 
                  key={item.id} 
                  name={item.name} 
                  stock={item.stock} 
                  unit={item.unit} 
                  priceLabel={formatCurrency(item.costPerUnit)}
                  status={item.stock <= item.reorderPoint ? 'low' : 'ok'}
                  onEdit={() => handleEdit(item)}
                  onDelete={() => deleteItem(item.id, 'ingredients')}
                />
              )) : filteredProducts.map(item => (
                <InventoryRow 
                  key={item.id} 
                  name={item.flavor} 
                  stock={item.stock} 
                  unit="unidades" 
                  priceLabel={formatCurrency(item.priceWholesale)}
                  secondaryPrice={formatCurrency(item.priceRetail)}
                  status={item.stock <= (item.reorderPoint || 0) ? 'low' : 'ok'}
                  onEdit={() => handleEdit(item)}
                  onDelete={() => deleteItem(item.id, 'products')}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal - Simplified */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden relative z-10"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-xl font-bold">{isEditMode ? 'Editar' : 'Nuevo'} {activeSubTab === 'ingredients' ? 'Insumo' : 'Producto'}</h3>
                <button onClick={handleCloseModal} className="p-2 hover:bg-gray-100 rounded-full"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {activeSubTab === 'ingredients' ? (
                  <>
                    <Input label="Nombre del Insumo" value={formData.name} onChange={v => setFormData({...formData, name: v})} required />
                    <div className="grid grid-cols-2 gap-4">
                      <Input label="Stock Actual" type="number" value={formData.stock} onChange={v => setFormData({...formData, stock: Number(v)})} required />
                      <Select label="Unidad" value={formData.unit} onChange={v => setFormData({...formData, unit: v as Unit})} options={['kg', 'g', 'l', 'ml', 'unit']} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <Input label="Costo por Unidad" type="number" value={formData.costPerUnit} onChange={v => setFormData({...formData, costPerUnit: Number(v)})} required />
                      <Input label="Punto de Reorden" type="number" value={formData.reorderPoint} onChange={v => setFormData({...formData, reorderPoint: Number(v)})} />
                    </div>
                  </>
                ) : (
                  <>
                    <Input label="Sabor" value={formData.flavor} onChange={v => setFormData({...formData, flavor: v})} required />
                    <div className="grid grid-cols-2 gap-4">
                      <Input label="Stock Inicial" type="number" value={formData.stock} onChange={v => setFormData({...formData, stock: Number(v)})} required />
                      <Input label="Punto de Reorden" type="number" value={formData.reorderPoint} onChange={v => setFormData({...formData, reorderPoint: Number(v)})} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <Input label="Precio Mayoreo" type="number" value={formData.priceWholesale} onChange={v => setFormData({...formData, priceWholesale: Number(v)})} required />
                      <Input label="Precio Menudeo" type="number" value={formData.priceRetail} onChange={v => setFormData({...formData, priceRetail: Number(v)})} required />
                    </div>
                  </>
                )}
                <button className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl mt-4">
                  {isEditMode ? 'Actualizar Cambios' : 'Guardar Item'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function InventoryRow({ name, stock, unit, priceLabel, secondaryPrice, status, onEdit, onDelete }: any) {
  return (
    <tr className="group hover:bg-gray-50 transition-colors">
      <td className="px-6 py-4 font-semibold text-gray-900">{name}</td>
      <td className="px-6 py-4">{stock}</td>
      <td className="px-6 py-4 text-gray-500 lowercase">{unit}</td>
      <td className="px-6 py-4 font-medium text-gray-900">{priceLabel}</td>
      {secondaryPrice && <td className="px-6 py-4 font-medium text-gray-900">{secondaryPrice}</td>}
      {status && (
        <td className="px-6 py-4">
          <span className={cn(
            "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
            status === 'low' ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"
          )}>
            {status === 'low' ? 'Bajo' : 'Suficiente'}
          </span>
        </td>
      )}
      <td className="px-6 py-4">
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onEdit} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-white rounded-lg"><Edit2 className="w-4 h-4" /></button>
          <button onClick={onDelete} className="p-2 text-gray-400 hover:text-red-600 hover:bg-white rounded-lg"><Trash2 className="w-4 h-4" /></button>
        </div>
      </td>
    </tr>
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
        className="w-full px-4 py-2.5 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-blue-600 transition-all font-medium"
      />
    </div>
  );
}

function Select({ label, value, onChange, options }: any) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-bold text-gray-500 uppercase ml-1">{label}</label>
      <select 
        value={value} 
        onChange={e => onChange(e.target.value)}
        className="w-full px-4 py-2.5 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-blue-600 transition-all font-medium"
      >
        {options.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    </div>
  );
}

function X({ className }: { className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>;
}
