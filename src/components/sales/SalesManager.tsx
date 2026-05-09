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
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState<any | null>(null);
  const [saleType, setSaleType] = useState<'menudeo' | 'mayoreo'>('menudeo');
  const [wholesaleThreshold, setWholesaleThreshold] = useState(10);

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
      if (docSnap.exists()) {
        setKmCost(docSnap.data().kmCost || 0);
        setWholesaleThreshold(docSnap.data().wholesaleThreshold || 10);
      }
    };
    fetchConfig();
  }, []);

  const subtotal = newSale.items.reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0);
  const totalQuantity = newSale.items.reduce((sum: number, item: any) => sum + item.quantity, 0);
  const shippingCost = (newSale.deliveryKm || 0) * kmCost;
  const totalSale = subtotal + shippingCost;

  const applyPricingRules = (items: any[], type: 'menudeo' | 'mayoreo') => {
    return items.map(item => {
      const prod = products.find(p => p.id === item.productId);
      if (!prod) return item;
      return {
        ...item,
        price: type === 'mayoreo' ? prod.priceWholesale : prod.priceRetail
      };
    });
  };

  const addItemToSale = (productId: string) => {
    const prod = products.find(p => p.id === productId);
    if (!prod) return;
    
    let updatedItems = [...newSale.items];
    const existingIndex = updatedItems.findIndex((i: any) => i.productId === productId);
    
    if (existingIndex > -1) {
      updatedItems[existingIndex] = { 
        ...updatedItems[existingIndex], 
        quantity: updatedItems[existingIndex].quantity + 1 
      };
    } else {
      updatedItems.push({ 
        productId, 
        flavor: prod.flavor, 
        quantity: 1, 
        price: saleType === 'mayoreo' ? prod.priceWholesale : prod.priceRetail 
      });
    }

    // Auto-detect type
    const newTotalQty = updatedItems.reduce((sum, i) => sum + i.quantity, 0);
    const newType = newTotalQty >= wholesaleThreshold ? 'mayoreo' : 'menudeo';
    
    if (newType !== saleType) {
      setSaleType(newType);
      updatedItems = applyPricingRules(updatedItems, newType);
    } else {
      // Even if type didn't change, ensure the added item has the correct price relative to current type
      updatedItems = applyPricingRules(updatedItems, saleType);
    }

    setNewSale({ ...newSale, items: updatedItems });
  };

  const removeItemFromSale = (productId: string) => {
    let updatedItems = newSale.items.filter((i: any) => i.productId !== productId);
    
    const newTotalQty = updatedItems.reduce((sum, i) => sum + i.quantity, 0);
    const newType = newTotalQty >= wholesaleThreshold ? 'mayoreo' : 'menudeo';
    
    if (newType !== saleType) {
      setSaleType(newType);
      updatedItems = applyPricingRules(updatedItems, newType);
    }

    setNewSale({ ...newSale, items: updatedItems });
  };

  const updateItemQuantity = (productId: string, delta: number) => {
    let updatedItems = newSale.items.map((i: any) => 
      i.productId === productId 
        ? { ...i, quantity: Math.max(1, i.quantity + delta) } 
        : i
    );

    const newTotalQty = updatedItems.reduce((sum, i) => sum + i.quantity, 0);
    const newType = newTotalQty >= wholesaleThreshold ? 'mayoreo' : 'menudeo';
    
    if (newType !== saleType) {
      setSaleType(newType);
      updatedItems = applyPricingRules(updatedItems, newType);
    } else {
      updatedItems = applyPricingRules(updatedItems, saleType);
    }

    setNewSale({ ...newSale, items: updatedItems });
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
      console.error("Sale Error:", err);
      const isStockError = err.message?.includes('insuficiente') || err.message?.includes('no existe');
      alert(isStockError ? `❌ Error: ${err.message}` : "❌ Error al procesar la venta. Verifique los datos y el inventario.");
      handleFirestoreError(err, OperationType.WRITE, 'sales/transaction');
    }
  };

  const generatePDF = (sale: any) => {
    const doc = new jsPDF();
    const primaryColor = [37, 99, 235]; // Blue 600
    const secondaryColor = [100, 116, 139]; // Slate 500

    // Header Background
    doc.setFillColor(30, 41, 59); // Slate 900
    doc.rect(0, 0, 210, 40, 'F');

    // Business Name
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text('FÁBRICA DE BOLIS ADONAÍ', 20, 20);

    // Address & Info
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('C. Soplete 2739, Álamo Industrial', 20, 28);
    doc.text('Guadalajara, Jalisco | Tel: (33) XXXX-XXXX', 20, 33);

    // Receipt Title & Meta
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('NOTA DE REMISIÓN', 20, 55);

    doc.setFontSize(9);
    doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    doc.text(`Folio: #${sale.id.slice(-6).toUpperCase()}`, 150, 55);
    doc.text(`Fecha: ${formatDate(sale.date)}`, 150, 60);

    // Client Info Box
    doc.setDrawColor(226, 232, 240); // Slate 200
    doc.setFillColor(248, 250, 252); // Slate 50
    doc.roundedRect(20, 65, 170, 25, 3, 3, 'FD');

    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.text('CLIENTE:', 25, 75);
    doc.setFont('helvetica', 'normal');
    const customerLabel = sale.customerName?.toUpperCase() || 'PÚBLICO GENERAL';
    doc.text(customerLabel, 45, 75);

    doc.setFont('helvetica', 'bold');
    doc.text('TELÉFONO:', 25, 82);
    doc.setFont('helvetica', 'normal');
    doc.text(sale.customerPhone || 'SIN REGISTRO', 48, 82);

    doc.setFont('helvetica', 'bold');
    doc.text('MÉTODO:', 120, 75);
    doc.setFont('helvetica', 'normal');
    doc.text((sale.paymentMethod || 'efectivo').toUpperCase(), 140, 75);

    doc.setFont('helvetica', 'bold');
    doc.text('ESTADO:', 120, 82);
    doc.setFont('helvetica', 'normal');
    doc.text((sale.status || 'pagado').toUpperCase(), 140, 82);

    // Table
    autoTable(doc, {
      startY: 100,
      head: [['PRODUCTO', 'CANTIDAD', 'PRECIO UNIT.', 'SUBTOTAL']],
      body: sale.items.map((i: any) => [
        i.flavor.toUpperCase(), 
        i.quantity, 
        formatCurrency(i.price), 
        formatCurrency(i.price * i.quantity)
      ]),
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: 255,
        fontSize: 10,
        fontStyle: 'bold',
        halign: 'center'
      },
      bodyStyles: {
        fontSize: 9,
        textColor: [30, 41, 59],
        halign: 'center'
      },
      columnStyles: {
        0: { halign: 'left', fontStyle: 'bold' },
        3: { halign: 'right', fontStyle: 'bold' }
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      }
    });

    let finalY = (doc as any).lastAutoTable.finalY + 10;

    // Totals Section
    doc.setDrawColor(226, 232, 240);
    doc.line(130, finalY, 190, finalY);
    finalY += 7;

    doc.setFontSize(10);
    doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    doc.text('SUBTOTAL:', 130, finalY);
    doc.setTextColor(30, 41, 59);
    doc.text(formatCurrency(sale.subtotal), 190, finalY, { align: 'right' });
    
    finalY += 7;
    if (sale.shippingCost > 0) {
      doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
      doc.text(`ENVÍO:`, 130, finalY);
      doc.setTextColor(30, 41, 59);
      doc.text(formatCurrency(sale.shippingCost), 190, finalY, { align: 'right' });
      finalY += 7;
    }

    doc.setFillColor(30, 41, 59);
    doc.rect(130, finalY, 60, 10, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('TOTAL:', 135, finalY + 7);
    doc.text(formatCurrency(sale.total), 188, finalY + 7, { align: 'right' });

    // Footer
    doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.text('¡Gracias por su preferencia!', 105, 280, { align: 'center' });
    doc.text('Este documento es un comprobante de venta interna.', 105, 285, { align: 'center' });

    doc.save(`Nota_Venta_${sale.id.slice(-5).toUpperCase()}.pdf`);
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

  const handleUpdateSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSale) return;

    try {
      await runTransaction(db, async (transaction) => {
        const saleRef = doc(db, 'sales', selectedSale.id);
        const originalSaleDoc = await transaction.get(saleRef);
        if (!originalSaleDoc.exists()) throw new Error("La venta no existe");
        const originalSale = originalSaleDoc.data();

        // 1. HANDLE CUSTOMER BALANCE CHANGES
        // If customer changed, or status changed from paid to pending/scheduled, or total changed
        const oldTotal = originalSale.total || 0;
        const newTotal = selectedSale.total || 0;
        const oldCustomerId = originalSale.customerId;
        const newCustomerId = selectedSale.customerId;
        const oldStatus = originalSale.status;
        const newStatus = selectedSale.status;

        // Revert old customer balance if it was affecting it
        if ((oldStatus === 'pending' || oldStatus === 'scheduled') && oldCustomerId) {
          const oldCustRef = doc(db, 'customers', oldCustomerId);
          const oldCustDoc = await transaction.get(oldCustRef);
          if (oldCustDoc.exists()) {
            transaction.update(oldCustRef, { balance: Math.max(0, (oldCustDoc.data().balance || 0) - oldTotal) });
          }
        }

        // Apply new customer balance if it should affect it
        if ((newStatus === 'pending' || newStatus === 'scheduled') && newCustomerId) {
          const newCustRef = doc(db, 'customers', newCustomerId);
          const newCustDoc = await transaction.get(newCustRef);
          if (newCustDoc.exists()) {
            transaction.update(newCustRef, { balance: (newCustDoc.data().balance || 0) + newTotal });
          }
        }

        // 2. FIND NEW CUSTOMER NAME IF CHANGED
        let newCustomerName = originalSale.customerName;
        let newCustomerPhone = originalSale.customerPhone;
        if (newCustomerId !== oldCustomerId) {
          if (newCustomerId) {
            const cust = customers.find(c => c.id === newCustomerId);
            newCustomerName = cust?.name || 'Venta de Mostrador';
            newCustomerPhone = cust?.phone || '';
          } else {
            newCustomerName = 'Venta de Mostrador';
            newCustomerPhone = '';
          }
        }

        // 3. UPDATE SALE
        transaction.update(saleRef, {
          customerId: newCustomerId,
          customerName: newCustomerName,
          customerPhone: newCustomerPhone,
          paymentMethod: selectedSale.paymentMethod,
          status: newStatus,
          deliveryDate: selectedSale.deliveryDate || '',
          deliveryTime: selectedSale.deliveryTime || '',
          deliveryAddress: selectedSale.deliveryAddress || '',
          updatedAt: new Date().toISOString()
        });
      });

      setIsEditModalOpen(false);
      setSelectedSale(null);
      alert('Venta actualizada correctamente');
    } catch (err: any) {
      alert(`Error al actualizar venta: ${err.message}`);
      handleFirestoreError(err, OperationType.WRITE, `sales/${selectedSale.id}`);
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
                <tr 
                  key={sale.id} 
                  className="hover:bg-gray-50 cursor-pointer transition-colors group"
                  onClick={() => {
                    setSelectedSale({ ...sale });
                    setIsEditModalOpen(true);
                  }}
                >
                  <td className="px-6 py-4">
                    <p className="font-bold text-gray-900 group-hover:text-blue-600">#{sale.id.slice(-5)}</p>
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
                  <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
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
        {isEditModalOpen && selectedSale && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} 
              onClick={() => { setIsEditModalOpen(false); setSelectedSale(null); }} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden relative z-10 flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold">Detalle de Venta #{selectedSale.id.slice(-6).toUpperCase()}</h3>
                  <p className="text-xs text-gray-400 font-medium">Realizada el {formatDate(selectedSale.date)}</p>
                </div>
                <button onClick={() => { setIsEditModalOpen(false); setSelectedSale(null); }} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                  <Plus className="w-5 h-5 rotate-45 text-gray-400" />
                </button>
              </div>

              <form onSubmit={handleUpdateSale} className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
                    <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Total de Venta</p>
                    <p className="text-2xl font-black text-blue-700">{formatCurrency(selectedSale.total)}</p>
                    <p className="text-[10px] font-bold text-blue-500 mt-1 uppercase">{selectedSale.items?.length || 0} productos registrados</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Tipo de Precio</p>
                    <p className="text-xl font-bold text-slate-700 capitalize">{selectedSale.type || 'menudeo'}</p>
                    <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase">Basado en volumen de compra</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-black text-gray-400 uppercase text-[10px] tracking-widest border-b border-gray-50 pb-2">Información del Cliente y Pago</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">Cliente Asignado</label>
                      <select 
                        value={selectedSale.customerId || ''} 
                        onChange={e => setSelectedSale({...selectedSale, customerId: e.target.value})}
                        className="w-full bg-gray-50 rounded-xl border border-transparent text-sm font-semibold p-3 focus:bg-white focus:ring-2 focus:ring-blue-600 transition-all"
                      >
                        <option value="">Público General</option>
                        {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">Estado de la Venta</label>
                      <select 
                        value={selectedSale.status} 
                        onChange={e => setSelectedSale({...selectedSale, status: e.target.value})}
                        className="w-full bg-gray-50 rounded-xl border border-transparent text-sm font-semibold p-3 focus:bg-white focus:ring-2 focus:ring-blue-600 transition-all"
                      >
                        <option value="paid">Pagado</option>
                        <option value="pending">Pendiente (Fiado)</option>
                        <option value="scheduled">Agendado (Pedido)</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">Método de Pago</label>
                      <select 
                        value={selectedSale.paymentMethod} 
                        onChange={e => setSelectedSale({...selectedSale, paymentMethod: e.target.value})}
                        className="w-full bg-gray-50 rounded-xl border border-transparent text-sm font-semibold p-3 focus:bg-white focus:ring-2 focus:ring-blue-600 transition-all"
                      >
                        <option value="efectivo">Efectivo</option>
                        <option value="tarjeta">Tarjeta / Transferencia</option>
                      </select>
                    </div>
                  </div>
                </div>

                {(selectedSale.status === 'scheduled' || (selectedSale.deliveryDate && selectedSale.status !== 'paid')) && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-4 pt-4">
                    <h4 className="font-black text-amber-500 uppercase text-[10px] tracking-widest border-b border-amber-50 pb-2">Datos de Entrega</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-amber-600 uppercase">Fecha de Entrega</label>
                        <input 
                          type="date"
                          value={selectedSale.deliveryDate || ''}
                          onChange={e => setSelectedSale({...selectedSale, deliveryDate: e.target.value})}
                          className="w-full bg-amber-50/50 rounded-xl border border-transparent text-sm font-semibold p-3 focus:bg-white focus:ring-2 focus:ring-amber-500 transition-all"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-amber-600 uppercase">Horario Estimado</label>
                        <input 
                          type="text"
                          value={selectedSale.deliveryTime || ''}
                          onChange={e => setSelectedSale({...selectedSale, deliveryTime: e.target.value})}
                          className="w-full bg-amber-50/50 rounded-xl border border-transparent text-sm font-semibold p-3 focus:bg-white focus:ring-2 focus:ring-amber-500 transition-all"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-amber-600 uppercase">Dirección</label>
                      <textarea 
                        rows={2}
                        value={selectedSale.deliveryAddress || ''}
                        onChange={e => setSelectedSale({...selectedSale, deliveryAddress: e.target.value})}
                        className="w-full bg-amber-50/50 rounded-xl border border-transparent text-sm font-semibold p-3 focus:bg-white focus:ring-2 focus:ring-amber-500 transition-all resize-none"
                      />
                    </div>
                  </motion.div>
                )}

                <div className="space-y-3">
                  <h4 className="font-black text-gray-400 uppercase text-[10px] tracking-widest border-b border-gray-50 pb-2">Artículos de la Venta</h4>
                  <div className="space-y-2">
                    {selectedSale.items?.map((item: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                        <div>
                          <p className="font-bold text-sm text-gray-800">{item.flavor}</p>
                          <p className="text-[10px] text-gray-400 font-bold uppercase">{item.quantity} unidades × {formatCurrency(item.price)}</p>
                        </div>
                        <p className="font-black text-blue-600">{formatCurrency(item.price * item.quantity)}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-gray-900 rounded-2xl p-6 text-white flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Comprobado</p>
                    <p className="text-3xl font-black">{formatCurrency(selectedSale.total)}</p>
                  </div>
                  <button 
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-8 py-3 rounded-xl transition-all shadow-lg active:scale-95"
                  >
                    Guardar Cambios
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

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
                      <div className={cn(
                        "px-4 py-1.5 rounded-lg text-[10px] font-black transition-all capitalize flex items-center gap-2",
                        saleType === 'mayoreo' ? "bg-amber-100 text-amber-700 shadow-sm" : "bg-blue-100 text-blue-700 shadow-sm"
                      )}>
                        {saleType === 'mayoreo' ? <TrendingUp className="w-3 h-3" /> : <User className="w-3 h-3" />}
                        MODO {saleType.toUpperCase()} {saleType === 'mayoreo' ? '(MAYOREO)' : '(DETALLE)'}
                      </div>
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
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-black text-gray-500 uppercase text-[10px] tracking-widest">Carrito de Venta</h4>
                    <div className="flex items-center gap-2">
                       <span className="text-[10px] font-black text-slate-400 uppercase">{totalQuantity} piezas</span>
                       {totalQuantity < wholesaleThreshold && (
                         <span className="text-[9px] font-bold text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                           {wholesaleThreshold - totalQuantity} para Mayoreo
                         </span>
                       )}
                    </div>
                  </div>
                  <div className="space-y-3">
                    {newSale.items.map((item: any) => {
                      const prod = products.find(p => p.id === item.productId);
                      const isShort = prod && prod.stock < item.quantity;
                      return (
                        <div key={item.productId} className={cn(
                          "bg-white p-3 rounded-xl border transition-all group",
                          isShort ? "border-rose-200 bg-rose-50/30" : "border-gray-100"
                        )}>
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <p className={cn("font-bold text-sm leading-tight", isShort ? "text-rose-700" : "text-gray-800")}>
                                {item.flavor}
                              </p>
                              <div className="flex items-center gap-2">
                                <p className="text-[10px] text-gray-400 font-bold uppercase">{formatCurrency(item.price)} c/u</p>
                                {isShort && (
                                  <span className="text-[9px] font-black text-rose-500 uppercase flex items-center gap-1">
                                    <AlertCircle className="w-2.5 h-2.5" /> Stock Insuficiente ({prod?.stock || 0})
                                  </span>
                                )}
                              </div>
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
                              <span className={cn("text-xs font-black w-6 text-center", isShort ? "text-rose-600" : "text-slate-900")}>
                                {item.quantity}
                              </span>
                              <button 
                                onClick={() => updateItemQuantity(item.productId, 1)}
                                className="p-1 hover:bg-white rounded shadow-sm text-gray-500 transition-all"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                            <span className={cn("font-black text-sm", isShort ? "text-rose-600" : "text-blue-600")}>
                              {formatCurrency(item.price * item.quantity)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
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
