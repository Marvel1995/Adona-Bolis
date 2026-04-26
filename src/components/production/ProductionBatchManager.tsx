import React, { useState, useEffect } from 'react';
import { 
  Package, Plus, Layers, User, Calendar, 
  ArrowRight, Info, AlertCircle, CheckCircle2, FlaskConical, Trash2
} from 'lucide-react';
import { collection, onSnapshot, addDoc, doc, updateDoc, increment, getDoc, runTransaction, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { cn, formatCurrency, formatDate } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export default function ProductionBatchManager() {
  const [batches, setBatches] = useState<any[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [step, setStep] = useState(1);

  // Form State
  const [formData, setFormData] = useState<any>({
    recipeId: '',
    litersProduced: 0,
    responsible: '',
    finishedProducts: [] // [{ productId, quantity }]
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    onSnapshot(collection(db, 'productions'), snap => setBatches(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
    onSnapshot(collection(db, 'recipes'), snap => setRecipes(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
    onSnapshot(collection(db, 'products'), snap => setProducts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
    onSnapshot(collection(db, 'ingredients'), snap => setIngredients(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
  }, []);

  const selectedRecipe = recipes.find(r => r.id === formData.recipeId);
  
  const calculateScaling = (recipe: any, liters: number) => {
    if (!recipe || !liters) return [];
    return recipe.ingredients.map((ing: any) => ({
      ...ing,
      scaledQuantity: (ing.quantity / recipe.yieldLitros) * liters,
      name: ingredients.find(i => i.id === ing.ingredientId)?.name || 'Desconocido',
      unit: ingredients.find(i => i.id === ing.ingredientId)?.unit || ''
    }));
  };

  const scaledIngredients = calculateScaling(selectedRecipe, formData.litersProduced);

  const handleSubmit = async () => {
    if (formData.finishedProducts.length === 0) {
      alert('Debes registrar al menos un producto terminado.');
      return;
    }

    // 1. Aggregate scaled ingredients to avoid duplicate IDs
    const aggregatedIngredients = scaledIngredients.reduce((acc: any, ing: any) => {
      if (!acc[ing.ingredientId]) {
        acc[ing.ingredientId] = { ...ing };
      } else {
        acc[ing.ingredientId].scaledQuantity += ing.scaledQuantity;
      }
      return acc;
    }, {});
    const uniqueIngredients = Object.values(aggregatedIngredients);

    // 2. Aggregate finished products to avoid duplicate IDs
    const aggregatedProducts = formData.finishedProducts.reduce((acc: any, fp: any) => {
      if (!acc[fp.productId]) {
        acc[fp.productId] = { ...fp };
      } else {
        acc[fp.productId].quantity += fp.quantity;
      }
      return acc;
    }, {});
    const uniqueProducts = Object.values(aggregatedProducts);

    setIsSubmitting(true);
    try {
      await runTransaction(db, async (transaction) => {
        // 1. PERFORM ALL READS FIRST
        const ingredientDocs = [];
        for (const item of uniqueIngredients as any[]) {
          const ingRef = doc(db, 'ingredients', item.ingredientId);
          const ingDoc = await transaction.get(ingRef);
          if (!ingDoc.exists()) throw new Error(`Ingrediente ${item.name} no existe`);
          ingredientDocs.push({ ref: ingRef, doc: ingDoc, scaled: item });
        }

        const productDocs = [];
        for (const item of uniqueProducts as any[]) {
          const prodRef = doc(db, 'products', item.productId);
          const prodDoc = await transaction.get(prodRef);
          productDocs.push({ ref: prodRef, doc: prodDoc, fp: item });
        }

        // 2. VALIDATE AND PERFORM WRITES
        for (const item of ingredientDocs) {
          const currentStock = Number(item.doc.data()?.stock || 0);
          const quantityToSubtract = Number(item.scaled.scaledQuantity.toFixed(4));
          
          if (currentStock < quantityToSubtract) {
            throw new Error(`Stock insuficiente de ${item.scaled.name} (Disponible: ${currentStock}, Requerido: ${quantityToSubtract})`);
          }
          
          transaction.update(item.ref, { stock: Number((currentStock - quantityToSubtract).toFixed(4)) });
        }

        for (const item of productDocs) {
          const currentStock = Number(item.doc.data()?.stock || 0);
          transaction.update(item.ref, { stock: currentStock + Number(item.fp.quantity) });
        }

        // 3. Register production log
        const prodLogRef = doc(collection(db, 'productions'));
        transaction.set(prodLogRef, {
          ...formData,
          recipeName: selectedRecipe.name,
          date: new Date().toISOString(),
          status: 'completed',
          ingredientsUsed: uniqueIngredients.map((s: any) => ({
            ingredientId: s.ingredientId,
            name: s.name,
            quantity: Number(s.scaledQuantity.toFixed(4))
          }))
        });
      });

      setIsModalOpen(false);
      setStep(1);
      setFormData({ recipeId: '', litersProduced: 0, responsible: '', finishedProducts: [] });
      alert('¡Lote completado con éxito! El inventario ha sido actualizado.');
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, 'production/batch');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Seguro que deseas eliminar este registro de producción? Nota: Esto NO revertirá automáticamente los cambios en el inventario.')) return;
    try {
      await deleteDoc(doc(db, 'productions', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'productions');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Lotes de Producción</h2>
          <p className="text-gray-500">Registro de mezclas completadas y producto terminado.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2"
        >
          <FlaskConical className="w-5 h-5" />
          Registrar Producción
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 text-gray-400 text-xs uppercase tracking-wider">
                <th className="px-6 py-4">Fecha / Lote</th>
                <th className="px-6 py-4">Receta</th>
                <th className="px-6 py-4">Producción</th>
                <th className="px-6 py-4">Responsable</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {batches.map(batch => (
                <tr key={batch.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <p className="font-bold text-gray-900">#{batch.id.slice(-5)}</p>
                    <p className="text-xs text-gray-500">{formatDate(batch.date)}</p>
                  </td>
                  <td className="px-6 py-4 font-semibold">{batch.recipeName}</td>
                  <td className="px-6 py-4">
                    <span className="font-bold text-blue-600">{batch.litersProduced} L</span>
                  </td>
                  <td className="px-6 py-4 text-gray-600">{batch.responsible}</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-green-50 text-green-600 rounded-full text-[10px] font-bold uppercase tracking-tight">Completado</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                       <Info className="w-4 h-4 text-gray-400 cursor-pointer" />
                       <button onClick={() => handleDelete(batch.id)} className="p-2 text-gray-300 hover:text-red-500 rounded-lg transition-colors">
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

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} 
              onClick={() => setIsModalOpen(false)} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden relative z-10 flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-xl font-bold">Producción Paso {step} de 2</h3>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-full"><Plus className="w-5 h-5 rotate-45" /></button>
              </div>

              <div className="p-8 flex-1 overflow-y-auto">
                {step === 1 ? (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-gray-500 uppercase">Seleccionar Receta</label>
                        <select 
                          className="w-full p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-blue-600 font-semibold"
                          value={formData.recipeId}
                          onChange={e => setFormData({...formData, recipeId: e.target.value})}
                        >
                          <option value="">Buscar receta...</option>
                          {recipes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-gray-500 uppercase">Litros a Producir</label>
                        <input 
                          type="number" step="0.001" 
                          className="w-full p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-blue-600 font-semibold text-2xl"
                          value={formData.litersProduced}
                          onChange={e => setFormData({...formData, litersProduced: Number(e.target.value)})}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-bold text-gray-500 uppercase">Responsable de Mezcla</label>
                      <input 
                        className="w-full p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-blue-600 font-semibold"
                        value={formData.responsible}
                        onChange={e => setFormData({...formData, responsible: e.target.value})}
                        placeholder="Ej: Juan Pérez"
                      />
                    </div>

                    {selectedRecipe && (
                      <div className="bg-blue-50 rounded-3xl p-6 border border-blue-100">
                        <h4 className="font-bold text-blue-900 mb-4 flex items-center gap-2">
                          <Layers className="w-5 h-5" /> Insumos Requeridos (Escalados)
                        </h4>
                        <div className="space-y-3">
                          {scaledIngredients.map((si: any, idx: number) => (
                            <div key={idx} className="flex justify-between items-center text-sm">
                              <span className="text-blue-800 font-medium">{si.name}</span>
                              <span className="font-bold text-blue-900">{si.scaledQuantity.toFixed(3)} {si.unit}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <button 
                      disabled={!formData.recipeId || !formData.litersProduced}
                      onClick={() => setStep(2)}
                      className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl shadow-lg hover:shadow-xl disabled:bg-gray-200 transition-all flex items-center justify-center gap-2"
                    >
                      Siguiente Paso <ArrowRight className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="bg-green-50 p-6 rounded-3xl border border-green-100 flex items-center gap-4">
                      <CheckCircle2 className="w-10 h-10 text-green-600" />
                      <div>
                        <h4 className="font-bold text-green-900">Mezcla Preparada</h4>
                        <p className="text-sm text-green-800">Ahora registra cuántos productos terminados se obtuvieron de este lote.</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h4 className="font-bold text-gray-900 uppercase text-xs tracking-widest pl-2">Distribución por Sabores</h4>
                      {products.map(prod => (
                        <div key={prod.id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-colors">
                          <div className="flex-1">
                            <p className="font-bold text-gray-800">{prod.flavor}</p>
                            <p className="text-xs text-gray-500">Stock actual: {prod.stock}</p>
                          </div>
                          <div className="w-32">
                            <input 
                              type="number" 
                              placeholder="Cant."
                              className="w-full bg-white border-none rounded-xl focus:ring-2 focus:ring-blue-600 text-center font-bold py-2"
                              onChange={e => {
                                const newFP = [...formData.finishedProducts].filter(f => f.productId !== prod.id);
                                if (Number(e.target.value) > 0) {
                                  newFP.push({ productId: prod.id, quantity: Number(e.target.value) });
                                }
                                setFormData({...formData, finishedProducts: newFP});
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-4">
                      <button onClick={() => setStep(1)} className="flex-1 border-2 border-gray-200 text-gray-600 font-bold py-4 rounded-2xl hover:bg-gray-50">Regresar</button>
                      <button 
                        onClick={handleSubmit} 
                        disabled={isSubmitting}
                        className={cn(
                          "flex-[2] text-white font-bold py-4 rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2",
                          isSubmitting ? "bg-blue-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 active:scale-95"
                        )}
                      >
                        {isSubmitting ? (
                          <>
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Procesando...
                          </>
                        ) : (
                          "Completar Lote"
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
