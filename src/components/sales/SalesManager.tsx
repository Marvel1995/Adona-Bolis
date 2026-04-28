import React, { useState, useEffect } from 'react';
import { 
  ShoppingCart, Plus, Minus, Search, User, CreditCard, 
  FileText, Download, TrendingUp, AlertCircle, Trash2,
  Clock, MapPin
} from 'lucide-react';
import { collection, onSnapshot, addDoc, query, orderBy, doc, increment, runTransaction, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { cn, formatCurrency, formatDate } from '../../lib/utils';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { motion, AnimatePresence } from 'motion/react';

export default function SalesManager() {
  const [sales, setSales] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saleType, setSaleType] = useState<'menudeo' | 'mayoreo'>('menudeo');

  // New Sale State
  const [newSale, setNewSale] = useState<any>({
    customerId: '',
    items: [], // [{ productId, flavor, quantity, price }]
    status: 'paid',
    paymentMethod: 'efectivo',
    deliveryKm: 0,
    deliveryDate: new Date().toISOString().split('T')[0],
    deliveryTime: '',
    deliveryAddress: ''
  });
  const [kmCost, setKmCost] = useState(0);

  useEffect(() => {
    onSnapshot(query(collection(db, 'sales'), orderBy('date', 'desc')), snap => setSales(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
    onSnapshot(collection(db, 'products'), snap => setProducts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
    onSnapshot(collection(db, 'customers'), snap => setCustomers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
    
    const fetchConfig = async () => {
      const docSnap = await getDoc(doc(db, 'settings', 'finance'));
      if (docSnap.exists()) setKmCost(docSnap.data().kmCost || 0);
    };
    fetchConfig();
  }, []);

  const subtotal = newSale.items.reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0);
  const shippingCost = (newSale.deliveryKm || 0) * kmCost;
  const totalSale = subtotal + shippingCost;

  const addItemToSale = (productId: string) => {
    const prod = products.find(p => p.id === productId);
    if (!prod) return;
    const price = saleType === 'mayoreo' ? prod.priceWholesale : prod.priceRetail;
    const existing = newSale.items.find((i: any) => i.productId === productId);
    
    if (existing) {
      const newItems = newSale.items.map((i: any) => 
        i.productId === productId ? { ...i, quantity: i.quantity + 1 } : i
      );
      setNewSale({ ...newSale, items: newItems });
    } else {
      setNewSale({ ...newSale, items: [...newSale.items, { productId, flavor: prod.flavor, quantity: 1, price }] });
    }
  };

  const removeItemFromSale = (productId: string) => {
    setNewSale({ ...newSale, items: newSale.items.filter((i: any) => i.productId !== productId) });
  };

  const updateItemQuantity = (productId: string, delta: number) => {
    setNewSale({
      ...newSale,
      items: newSale.items.map((i: any) => 
        i.productId === productId 
          ? { ...i, quantity: Math.max(1, i.quantity + delta) } 
          : i
      )
    });
  };

  const handleSubmit = async () => {
    if (newSale.items.length === 0) return alert('La venta está vacía');
    if (newSale.status === 'scheduled' && !newSale.customerId) return alert('Para agendar es obligatorio asignar un cliente');
    if (newSale.status === 'scheduled' && (!newSale.deliveryTime || !newSale.deliveryAddress)) return alert('Para agendar ingresa horario y dirección');
    
    const customer = customers.find(c => c.id === newSale.customerId);
    
    // Aggregate items by productId to avoid duplicate reads/writes
    const aggregatedItems = newSale.items.reduce((acc: any, item: any) => {
      if (!acc[item.productId]) {
        acc[item.productId] = { ...item };
      } else {
        acc[item.productId].quantity += item.quantity;
      }
      return acc;
    }, {});
    const uniqueItems = Object.values(aggregatedItems);

    try {
      await runTransaction(db, async (transaction) => {
        // 1. PERFORM ALL READS FIRST
        const productData = [];
        for (const item of uniqueItems as any[]) {
          const prodRef = doc(db, 'products', item.productId);
          const prodDoc = await transaction.get(prodRef);
          if (!prodDoc.exists()) throw new Error(`Producto ${item.flavor} no existe`);
          productData.push({ ref: prodRef, doc: prodDoc, item });
        }

        let customerRef = null;
        let customerDoc = null;
        if (newSale.customerId) {
          customerRef = doc(db, 'customers', newSale.customerId);
          customerDoc = await transaction.get(customerRef);
        }

        // 2. VALIDATE AND PERFORM WRITES
        for (const data of productData) {
          const currentStock = Number(data.doc.data()?.stock || 0);
          if (currentStock < data.item.quantity) {
            throw new Error(`Stock insuficiente de ${data.item.flavor} (Disponible: ${currentStock}, Requerido: ${data.item.quantity})`);
          }
          transaction.update(data.ref, { stock: currentStock - data.item.quantity });
        }

        // Update customer balance if pending or scheduled
        if ((newSale.status === 'pending' || newSale.status === 'scheduled') && customerRef && customerDoc?.exists()) {
          const currentBalance = Number(customerDoc.data()?.balance || 0);
          transaction.update(customerRef, { balance: currentBalance + totalSale });
        }

        // Register sale log
        const saleRef = doc(collection(db, 'sales'));
        transaction.set(saleRef, {
          ...newSale,
          customerName: customer?.name || 'Venta de Mostrador',
          customerPhone: customer?.phone || '',
          subtotal: subtotal,
          shippingCost: shippingCost,
          total: totalSale,
          type: saleType,
          date: new Date().toISOString()
        });
      });

      setIsModalOpen(false);
      setNewSale({ 
        customerId: '', 
        items: [], 
        status: 'paid', 
        paymentMethod: 'efectivo', 
        deliveryKm: 0,
        deliveryDate: new Date().toISOString().split('T')[0],
        deliveryTime: '',
        deliveryAddress: ''
      });
      alert('Operación registrada con éxito.');
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, 'sales/transaction');
    }
  };

  const generatePDF = (sale: any) => {
    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.text('BoliControl Pro - Nota de Venta', 20, 20);
    doc.setFontSize(12);
    doc.text(`Cliente: ${sale.customerName}`, 20, 35);
    doc.text(`Fecha: ${formatDate(sale.date)}`, 20, 42);
    doc.text(`Estado: ${sale.status.toUpperCase()}`, 20, 49);

    autoTable(doc, {
      startY: 60,
      head: [['Producto', 'Cant.', 'Precio Unit.', 'Subtotal']],
      body: sale.items.map((i: any) => [i.flavor, i.quantity, formatCurrency(i.price), formatCurrency(i.price * i.quantity)]),
    });

    let finalY = (doc as any).lastAutoTable.finalY + 5;
    
    if (sale.shippingCost > 0) {
      doc.setFontSize(10);
      doc.text(`Subtotal: ${formatCurrency(sale.subtotal)}`, 140, finalY);
      finalY += 7;
      doc.text(`Envío (${sale.deliveryKm} km): ${formatCurrency(sale.shippingCost)}`, 140, finalY);
      finalY += 10;
    } else {
      finalY += 5;
    }

    doc.setFontSize(16);
    doc.text(`Total: ${formatCurrency(sale.total)}`, 140, finalY);

    doc.save(`Venta_${sale.id.slice(-5)}.pdf`);
  };

  const handleDeleteSale = async (sale: any) => {
    if (!confirm('¿Estás seguro de eliminar esta venta? El stock de los productos será devuelto al inventario.')) return;

    try {
      await runTransaction(db, async (transaction) => {
        // 1. ALL READS FIRST
        const productSnapshots = [];
        // Aggregate items by productId to minimize reads
        const aggregated = sale.items.reduce((acc: any, item: any) => {
          if (!acc[item.productId]) acc[item.productId] = { ...item };
          else acc[item.productId].quantity += item.quantity;
          return acc;
        }, {});
        const uniqueItems = Object.values(aggregated);

        for (const item of uniqueItems as any[]) {
          const prodRef = doc(db, 'products', item.productId);
          const prodDoc = await transaction.get(prodRef);
          productSnapshots.push({ ref: prodRef, doc: prodDoc, quantity: item.quantity });
        }

        let customerRef = null;
        let customerDoc = null;
        if ((sale.status === 'pending' || sale.status === 'scheduled') && sale.customerId) {
          customerRef = doc(db, 'customers', sale.customerId);
          customerDoc = await transaction.get(customerRef);
        }

        // 2. ALL WRITES SECOND
        for (const snap of productSnapshots) {
          if (snap.doc.exists()) {
            const currentStock = Number(snap.doc.data().stock || 0);
            transaction.update(snap.ref, { stock: currentStock + snap.quantity });
          }
        }

        if (customerRef && customerDoc?.exists()) {
          const currentBalance = Number(customerDoc.data().balance || 0);
          transaction.update(customerRef, { balance: Math.max(0, currentBalance - sale.total) });
        }

        const saleRef = doc(db, 'sales', sale.id);
        transaction.delete(saleRef);
      });
      alert('Venta eliminada y stock restaurado correctamente.');
    } catch (err: any) {
      alert(`Error al eliminar venta: ${err.message || 'Error desconocido'}`);
      handleFirestoreError(err, OperationType.DELETE, `sales/${sale.id}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Ventas</h2>
          <p className="text-gray-500">Gestión de transacciones y notas de venta.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Nueva Venta
        </button>
      </div>

      {/* Sales List */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 text-gray-400 text-xs uppercase tracking-wider">
                <th className="px-6 py-4">ID / Fecha</th>
                <th className="px-6 py-4">Cliente</th>
                <th className="px-6 py-4">Monto / Pago</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 text-sm">
              {sales.map(sale => (
                <tr key={sale.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <p className="font-bold text-gray-900">#{sale.id.slice(-5)}</p>
                    <p className="text-xs text-gray-400">{formatDate(sale.date)}</p>
                  </td>
                  <td className="px-6 py-4 font-semibold text-gray-800">{sale.customerName}</td>
                  <td className="px-6 py-4">
                    <p className="font-bold text-gray-900">{formatCurrency(sale.total)}</p>
                    <p className="text-[10px] font-bold text-gray-400 uppercase">{sale.paymentMethod || 'efectivo'}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
                      sale.status === 'paid' ? "bg-green-50 text-green-600" : 
                      sale.status === 'scheduled' ? "bg-amber-50 text-amber-600" : 
                      "bg-red-50 text-red-600"
                    )}>
                      {sale.status === 'paid' ? 'Pagado' : sale.status === 'scheduled' ? 'Agendado' : 'Pendiente'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button onClick={() => generatePDF(sale)} title="Descargar PDF" className="p-2 text-gray-400 hover:text-blue-600 hover:bg-white rounded-lg transition-colors">
                        <Download className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDeleteSale(sale)} title="Eliminar Venta" className="p-2 text-gray-400 hover:text-rose-600 hover:bg-white rounded-lg transition-colors">
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
              className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden relative z-10 flex flex-col md:flex-row h-[85vh]"
            >
              {/* Product Selection Side */}
              <div className="flex-1 p-6 border-r border-gray-100 flex flex-col overflow-hidden">
                 <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold">Nueva Venta</h3>
                    <div className="flex p-1 bg-gray-100 rounded-xl">
                      {['menudeo', 'mayoreo'].map(t => (
                        <button key={t} onClick={() => setSaleType(t as any)} className={cn(
                          "px-4 py-1.5 rounded-lg text-xs font-bold transition-all capitalize",
                          saleType === t ? "bg-white shadow-sm text-blue-600" : "text-gray-500"
                        )}>{t}</button>
                      ))}
                    </div>
                 </div>

                 <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input type="text" placeholder="Buscar producto..." className="w-full pl-9 pr-4 py-2 bg-gray-50 rounded-xl border-none text-sm" />
                 </div>

                 <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-3 pr-2">
                    {products.map(p => (
                      <button 
                        key={p.id}
                        onClick={() => addItemToSale(p.id)}
                        className="p-4 bg-gray-50 rounded-2xl hover:bg-white hover:shadow-md border border-transparent hover:border-gray-100 transition-all text-left"
                      >
                        <p className="font-bold text-gray-800 line-clamp-1">{p.flavor}</p>
                        <p className="text-xs text-gray-500 mb-1">{p.stock} pz disponibles</p>
                        <p className="text-blue-600 font-bold">{formatCurrency(saleType === 'mayoreo' ? p.priceWholesale : p.priceRetail)}</p>
                      </button>
                    ))}
                 </div>
              </div>

              {/* Cart Side */}
              <div className="w-full md:w-96 bg-gray-50 p-6 flex flex-col overflow-y-auto border-l border-gray-100">
                <div className="mb-6">
                  <h4 className="font-bold text-gray-500 uppercase text-[10px] tracking-widest mb-4">Carrito de Venta</h4>
                  <div className="space-y-3">
                    {newSale.items.map((item: any) => (
                      <div key={item.productId} className="bg-white p-3 rounded-xl border border-gray-100 group">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="font-bold text-sm text-gray-800 leading-tight">{item.flavor}</p>
                            <p className="text-[10px] text-gray-400 font-bold uppercase">{formatCurrency(item.price)} c/u</p>
                          </div>
                          <button 
                            onClick={() => removeItemFromSale(item.productId)}
                            className="p-1 text-slate-300 hover:text-rose-600 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-1">
                            <button 
                              onClick={() => updateItemQuantity(item.productId, -1)}
                              className="p-1 hover:bg-white rounded shadow-sm text-gray-500 transition-all"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="text-xs font-black w-6 text-center">{item.quantity}</span>
                            <button 
                              onClick={() => updateItemQuantity(item.productId, 1)}
                              className="p-1 hover:bg-white rounded shadow-sm text-gray-500 transition-all"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                          <span className="font-black text-sm text-blue-600">{formatCurrency(item.price * item.quantity)}</span>
                        </div>
                      </div>
                    ))}
                    {newSale.items.length === 0 && <p className="text-center text-gray-400 text-xs py-10 italic">Aucún producto seleccionado</p>}
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-gray-200">
                  <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-3">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo de Orden</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button 
                        onClick={() => setNewSale({...newSale, status: 'paid'})} 
                        className={cn(
                          "py-3 rounded-xl text-xs font-bold border transition-all flex flex-col items-center gap-1",
                          newSale.status !== 'scheduled' ? "bg-blue-600 border-blue-600 text-white shadow-md" : "bg-white border-slate-200 text-slate-400 hover:border-blue-200"
                        )}
                      >
                        <CreditCard className="w-4 h-4" />
                        Venta Inmediata
                      </button>
                      <button 
                        onClick={() => setNewSale({...newSale, status: 'scheduled', paymentMethod: 'pendiente'})} 
                        className={cn(
                          "py-3 rounded-xl text-xs font-bold border transition-all flex flex-col items-center gap-1",
                          newSale.status === 'scheduled' ? "bg-amber-500 border-amber-500 text-white shadow-md" : "bg-white border-slate-200 text-slate-400 hover:border-amber-200"
                        )}
                      >
                        <Clock className="w-4 h-4" />
                        Agendar Pedido
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <div className="space-y-1">
                      <label className={cn("text-[10px] font-bold uppercase", newSale.status === 'scheduled' ? "text-amber-600" : "text-gray-400")}>
                        Cliente {newSale.status === 'scheduled' && <span className="text-red-500">*</span>}
                      </label>
                      <select 
                        value={newSale.customerId} 
                        onChange={e => setNewSale({...newSale, customerId: e.target.value})}
                        className="w-full bg-white rounded-xl border border-gray-200 text-xs font-semibold p-3 focus:ring-2 focus:ring-blue-600 transition-all"
                      >
                        <option value="">{newSale.status === 'scheduled' ? 'Seleccionar Cliente...' : 'Venta General'}</option>
                        {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>

                    {newSale.status !== 'scheduled' ? (
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Método de Pago</label>
                        <div className="grid grid-cols-3 gap-2">
                          <button 
                            onClick={() => setNewSale({...newSale, status: 'paid', paymentMethod: 'efectivo'})} 
                            className={cn(
                              "py-2 rounded-xl text-[10px] font-bold border transition-all",
                              newSale.status === 'paid' && newSale.paymentMethod === 'efectivo' ? "bg-white border-green-200 text-green-600 shadow-sm" : "border-gray-200 text-gray-400 hover:bg-white"
                            )}
                          >Efectivo</button>
                          <button 
                            onClick={() => setNewSale({...newSale, status: 'paid', paymentMethod: 'tarjeta'})} 
                            className={cn(
                              "py-2 rounded-xl text-[10px] font-bold border transition-all",
                              newSale.status === 'paid' && newSale.paymentMethod === 'tarjeta' ? "bg-white border-blue-200 text-blue-600 shadow-sm" : "border-gray-200 text-gray-400 hover:bg-white"
                            )}
                          >Tarjeta</button>
                          <button 
                            onClick={() => setNewSale({...newSale, status: 'pending', paymentMethod: 'pendiente'})} 
                            className={cn(
                              "py-2 rounded-xl text-[10px] font-bold border transition-all",
                              newSale.status === 'pending' ? "bg-white border-red-200 text-red-600 shadow-sm" : "border-gray-200 text-gray-400 hover:bg-white"
                            )}
                          >Fiado</button>
                        </div>
                      </div>
                    ) : (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3 bg-amber-50/50 p-4 rounded-2xl border border-amber-100">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-amber-600 uppercase">Fecha <span className="text-red-500">*</span></label>
                            <input 
                              type="date"
                              value={newSale.deliveryDate}
                              onChange={e => setNewSale({...newSale, deliveryDate: e.target.value})}
                              className="w-full bg-white rounded-lg border border-amber-100 text-xs font-semibold p-2"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-amber-600 uppercase">Horario <span className="text-red-500">*</span></label>
                            <input 
                              type="text"
                              placeholder="Ej: 3:00 PM"
                              value={newSale.deliveryTime}
                              onChange={e => setNewSale({...newSale, deliveryTime: e.target.value})}
                              className="w-full bg-white rounded-lg border border-amber-100 text-xs font-semibold p-2"
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-amber-600 uppercase">Dirección de Entrega <span className="text-red-500">*</span></label>
                          <textarea 
                            placeholder="Calle, número, colonia..."
                            rows={2}
                            value={newSale.deliveryAddress}
                            onChange={e => setNewSale({...newSale, deliveryAddress: e.target.value})}
                            className="w-full bg-white rounded-lg border border-amber-100 text-xs font-semibold p-2 resize-none"
                          />
                        </div>
                      </motion.div>
                    )}

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">Km Entrega (Opcional)</label>
                      <input 
                        type="number"
                        placeholder="0 km"
                        value={newSale.deliveryKm || ''}
                        onChange={e => setNewSale({...newSale, deliveryKm: Number(e.target.value)})}
                        className="w-full bg-white rounded-xl border border-gray-200 text-xs font-semibold p-2.5"
                      />
                    </div>
                  </div>

                  <div className="pt-2">
                    <div className="space-y-1 border-b border-gray-200 pb-2 mb-2">
                      <div className="flex justify-between text-gray-400 text-[10px] font-bold uppercase">
                        <span>Subtotal</span>
                        <span>{formatCurrency(subtotal)}</span>
                      </div>
                      {shippingCost > 0 && (
                        <div className="flex justify-between text-emerald-600 text-[10px] font-bold uppercase">
                          <span>Envío ({newSale.deliveryKm} km)</span>
                          <span>{formatCurrency(shippingCost)}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex justify-between items-baseline">
                      <span className="text-[10px] font-bold text-gray-400 uppercase">Total</span>
                      <p className="text-3xl font-black text-gray-900">{formatCurrency(totalSale)}</p>
                    </div>
                  </div>

                  <button 
                    onClick={handleSubmit}
                    className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl shadow-lg hover:shadow-xl active:scale-95 transition-all text-sm"
                  >
                    Confirmar Venta
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
