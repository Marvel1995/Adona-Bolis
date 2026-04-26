import React, { useState, useEffect } from 'react';
import { 
  ShoppingCart, Plus, Search, User, CreditCard, 
  FileText, Download, TrendingUp, AlertCircle, Trash2
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
    deliveryKm: 0
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

  const handleSubmit = async () => {
    if (newSale.items.length === 0) return alert('La venta está vacía');
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

        // Update customer balance if pending
        if (newSale.status === 'pending' && customerRef && customerDoc?.exists()) {
          const currentBalance = Number(customerDoc.data()?.balance || 0);
          transaction.update(customerRef, { balance: currentBalance + totalSale });
        }

        // Register sale log
        const saleRef = doc(collection(db, 'sales'));
        transaction.set(saleRef, {
          ...newSale,
          customerName: customer?.name || 'Venta de Mostrador',
          subtotal: subtotal,
          shippingCost: shippingCost,
          total: totalSale,
          type: saleType,
          date: new Date().toISOString()
        });
      });

      setIsModalOpen(false);
      setNewSale({ customerId: '', items: [], status: 'paid', paymentMethod: 'efectivo', deliveryKm: 0 });
      alert('Venta registrada con éxito.');
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
        if (sale.status === 'pending' && sale.customerId) {
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
                <th className="px-6 py-4">Monto</th>
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
                    <span className="font-bold text-gray-900">{formatCurrency(sale.total)}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
                      sale.status === 'paid' ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"
                    )}>
                      {sale.status === 'paid' ? 'Pagado' : 'Pendiente'}
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
              <div className="w-full md:w-80 bg-gray-50 p-6 flex flex-col">
                <div className="flex-1 overflow-y-auto mb-6">
                  <h4 className="font-bold text-gray-500 uppercase text-[10px] tracking-widest mb-4">Carrito de Venta</h4>
                  <div className="space-y-3">
                    {newSale.items.map((item: any) => (
                      <div key={item.productId} className="flex justify-between items-center group">
                        <div>
                          <p className="font-bold text-sm text-gray-800">{item.flavor}</p>
                          <p className="text-xs text-gray-400">{item.quantity} x {formatCurrency(item.price)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm">{formatCurrency(item.price * item.quantity)}</span>
                          <button onClick={() => removeItemFromSale(item.productId)} className="p-1 text-red-300 hover:text-red-600"><Trash2 className="w-3 h-3" /></button>
                        </div>
                      </div>
                    ))}
                    {newSale.items.length === 0 && <p className="text-center text-gray-400 text-xs py-10 italic">Aucún producto seleccionado</p>}
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-gray-200">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">Cliente</label>
                      <select 
                        value={newSale.customerId} 
                        onChange={e => setNewSale({...newSale, customerId: e.target.value})}
                        className="w-full bg-white rounded-lg border border-gray-200 text-xs font-semibold p-2"
                      >
                        <option value="">Venta General</option>
                        {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">Km Entrega</label>
                      <input 
                        type="number"
                        placeholder="0 km"
                        value={newSale.deliveryKm || ''}
                        onChange={e => setNewSale({...newSale, deliveryKm: Number(e.target.value)})}
                        className="w-full bg-white rounded-lg border border-gray-200 text-xs font-semibold p-2"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Estado Pago</label>
                    <div className="flex gap-2">
                      <button onClick={() => setNewSale({...newSale, status: 'paid'})} className={cn(
                        "flex-1 py-2 rounded-xl text-xs font-bold border",
                        newSale.status === 'paid' ? "bg-white border-green-200 text-green-600 shadow-sm" : "border-gray-200 text-gray-400"
                      )}>Pagado</button>
                      <button onClick={() => setNewSale({...newSale, status: 'pending'})} className={cn(
                        "flex-1 py-2 rounded-xl text-xs font-bold border",
                        newSale.status === 'pending' ? "bg-white border-red-200 text-red-600 shadow-sm" : "border-gray-200 text-gray-400"
                      )}>Fiado</button>
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
