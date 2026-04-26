import React, { useState, useEffect } from 'react';
import { 
  ClipboardList, Plus, Trash2, Save, Scale, 
  Calculator, Droplet, Milk, Info
} from 'lucide-react';
import { collection, onSnapshot, addDoc, query, orderBy, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { cn, formatCurrency } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export default function RecipeManager() {
  const [recipes, setRecipes] = useState<any[]>([]);
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<any>({
    name: '',
    baseType: 'agua',
    ingredients: [{ ingredientId: '', quantity: 0 }],
    yieldLitros: 1
  });

  useEffect(() => {
    const unsubR = onSnapshot(query(collection(db, 'recipes'), orderBy('name')), (snap) => {
      setRecipes(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubI = onSnapshot(collection(db, 'ingredients'), (snap) => {
      setIngredients(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => { unsubR(); unsubI(); };
  }, []);

  const addIngredientField = () => {
    setFormData({ ...formData, ingredients: [...formData.ingredients, { ingredientId: '', quantity: 0 }] });
  };

  const removeIngredientField = (index: number) => {
    const newIngs = formData.ingredients.filter((_: any, i: number) => i !== index);
    setFormData({ ...formData, ingredients: newIngs });
  };

  const updateIngredientField = (index: number, field: string, value: any) => {
    const newIngs = [...formData.ingredients];
    newIngs[index][field] = value;
    setFormData({ ...formData, ingredients: newIngs });
  };

  const calculateCost = (recipe: any) => {
    return recipe.ingredients.reduce((total: number, ri: any) => {
      const ing = ingredients.find(i => i.id === ri.ingredientId);
      return total + (ing ? ing.costPerUnit * ri.quantity : 0);
    }, 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isEditMode && editingId) {
        await updateDoc(doc(db, 'recipes', editingId), {
          ...formData,
          updatedAt: new Date().toISOString()
        });
      } else {
        await addDoc(collection(db, 'recipes'), {
          ...formData,
          createdAt: new Date().toISOString()
        });
      }
      handleCloseModal();
    } catch (err) {
      handleFirestoreError(err, isEditMode ? OperationType.UPDATE : OperationType.CREATE, 'recipes');
    }
  };

  const handleEdit = (recipe: any) => {
    setFormData(recipe);
    setEditingId(recipe.id);
    setIsEditMode(true);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Seguro que deseas eliminar esta receta?')) return;
    try {
      await deleteDoc(doc(db, 'recipes', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'recipes');
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setIsEditMode(false);
    setEditingId(null);
    setFormData({ name: '', baseType: 'agua', ingredients: [{ ingredientId: '', quantity: 0 }], yieldLitros: 1 });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Recetas</h2>
          <p className="text-gray-500">Gestión de fórmulas dinámicas y costos base.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Nueva Receta
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {recipes.map(recipe => (
          <motion.div 
            key={recipe.id} layout
            className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "p-3 rounded-2xl",
                  recipe.baseType === 'agua' ? "bg-blue-50 text-blue-600" : "bg-orange-50 text-orange-600"
                )}>
                  {recipe.baseType === 'agua' ? <Droplet /> : <Milk />}
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-lg leading-none">{recipe.name}</h3>
                  <p className="text-xs text-gray-500 mt-1 uppercase font-bold tracking-tighter">Base {recipe.baseType}</p>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Rendimiento:</span>
                <span className="font-bold">{recipe.yieldLitros} Litros</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Ingredientes:</span>
                <span className="font-bold">{recipe.ingredients.length}</span>
              </div>
              <div className="pt-2 border-t border-gray-200 mt-2 flex justify-between items-center">
                <span className="text-xs font-bold text-gray-400 uppercase">Costo Base</span>
                <span className="text-lg font-bold text-blue-600">{formatCurrency(calculateCost(recipe))}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <button 
                onClick={() => handleEdit(recipe)}
                className="flex-1 py-2 bg-gray-50 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-100 transition-colors"
              >
                Editar
              </button>
              <button 
                onClick={() => handleDelete(recipe.id)}
                className="px-4 py-2 bg-red-50 text-red-600 rounded-xl text-sm font-bold hover:bg-red-100 transition-colors flex items-center justify-center"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} 
              onClick={() => setIsModalOpen(false)} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden relative z-10 flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between shrink-0">
                <h3 className="text-xl font-bold">{isEditMode ? 'Editar' : 'Crear'} Receta Dinámica</h3>
                <button onClick={handleCloseModal} className="p-2 hover:bg-gray-100 rounded-full"><Plus className="w-5 h-5 rotate-45" /></button>
              </div>
              
              <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input label="Nombre de la Receta" value={formData.name} onChange={(v:any) => setFormData({...formData, name: v})} required />
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 uppercase ml-1">Base</label>
                    <div className="flex p-1 bg-gray-100 rounded-xl">
                      {['agua', 'leche'].map(b => (
                        <button key={b} type="button" onClick={() => setFormData({...formData, baseType: b})} className={cn(
                          "flex-1 py-1.5 rounded-lg text-sm font-bold transition-all capitalize",
                          formData.baseType === b ? "bg-white shadow-sm text-blue-600" : "text-gray-500"
                        )}>{b}</button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-gray-900 border-l-4 border-blue-600 pl-3">Ingredientes</h4>
                    <button type="button" onClick={addIngredientField} className="text-blue-600 font-bold text-xs flex items-center gap-1 hover:underline">
                      <Plus className="w-3 h-3" /> Añadir Otro
                    </button>
                  </div>
                  
                  {formData.ingredients.map((field: any, idx: number) => (
                    <div key={idx} className="flex gap-3 items-end bg-gray-50 p-3 rounded-2xl border border-gray-100">
                      <div className="flex-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Insumo</label>
                        <select 
                          value={field.ingredientId} 
                          onChange={e => updateIngredientField(idx, 'ingredientId', e.target.value)}
                          className="w-full bg-transparent border-none p-0 focus:ring-0 font-semibold"
                        >
                          <option value="">Seleccionar...</option>
                          {ingredients.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                        </select>
                      </div>
                      <div className="w-24">
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Cant.</label>
                        <input 
                          type="number" step="0.001" value={field.quantity} 
                          onChange={e => updateIngredientField(idx, 'quantity', Number(e.target.value))}
                          className="w-full bg-transparent border-none p-0 focus:ring-0 font-semibold"
                        />
                      </div>
                      <button type="button" onClick={() => removeIngredientField(idx)} className="p-2 text-red-400 hover:bg-red-50 rounded-lg">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="bg-blue-50/50 p-6 rounded-2xl border border-blue-100 space-y-4">
                   <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <Input 
                          label="Rendimiento Total (Litros)" 
                          type="number" 
                          value={formData.yieldLitros} 
                          onChange={(v:any) => setFormData({...formData, yieldLitros: Number(v)})} 
                        />
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold text-gray-400 uppercase">Costo Estimado</p>
                        <p className="text-2xl font-bold text-blue-600">{formatCurrency(calculateCost(formData))}</p>
                      </div>
                   </div>
                </div>

                <button className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl shadow-lg hover:shadow-xl active:scale-[0.98] transition-all">
                  {isEditMode ? 'Actualizar Receta' : 'Guardar Receta'}
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
