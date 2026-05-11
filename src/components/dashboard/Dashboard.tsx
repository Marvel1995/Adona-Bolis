import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, TrendingDown, DollarSign, Package, 
  AlertTriangle, CheckCircle2, ShoppingBag, ArrowUpRight,
  Clock, Calendar, User, MapPin, X, PieChart as PieChartIcon
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, AreaChart, Area,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { collection, getDocs, getDoc, doc, onSnapshot, runTransaction, query, addDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { formatCurrency, cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#06b6d4'];

export default function Dashboard() {
  const [stats, setStats] = useState({
    cash: 0,
    cashTotal: 0,
    cardTotal: 0,
    pendingTotal: 0,
    income: 0,
    expenses: 0,
    goalPercent: 0,
    breakEvenTarget: 0,
    breakEvenPercent: 0,
    monthIncome: 0,
    reorderCount: 0,
    goal: 100000,
    mlPerBolis: 200,
    priceRetail: 10,
    priceWholesale: 8,
    avgUnitCost: 0,
    avgPrice: 0,
    avgProfitRetail: 0,
    avgProfitWholesale: 0,
    avgMarginRetail: 0,
    avgMarginWholesale: 0
  });

  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [scheduledOrders, setScheduledOrders] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [recipePerformance, setRecipePerformance] = useState<any[]>([]);
  const [timeRange, setTimeRange] = useState<'7d' | '1m' | '3m' | '1y'>('7d');
  const [selectedRecipe, setSelectedRecipe] = useState<any | null>(null);
  const [isSalesDetailModalOpen, setIsSalesDetailModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCashOutModalOpen, setIsCashOutModalOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState<any | null>(null);
  const [cashOutData, setCashOutData] = useState({
    actualCash: 0,
    nextDayFund: 0,
    notes: ''
  });
  const [todaySummary, setTodaySummary] = useState({
    cashSales: 0,
    cardSales: 0,
    expenses: 0,
    expectedCash: 0
  });
  const [salesDetailRange, setSalesDetailRange] = useState<'week' | 'month' | 'year'>('week');
  const [salesDetailChartData, setSalesDetailChartData] = useState<any[]>([]);
  const [allSales, setAllSales] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);

  const handleUpdateSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSale) return;

    try {
      await runTransaction(db, async (transaction) => {
        const saleRef = doc(db, 'sales', selectedSale.id);
        const originalSaleDoc = await transaction.get(saleRef);
        if (!originalSaleDoc.exists()) throw new Error("La venta no existe");
        const originalSale = originalSaleDoc.data();

        const oldTotal = originalSale.total || 0;
        const newTotal = selectedSale.total || 0;
        const oldCustomerId = originalSale.customerId;
        const newCustomerId = selectedSale.customerId;
        const oldStatus = originalSale.status;
        const newStatus = selectedSale.status;

        // 1. PERFORM ALL READS FIRST
        let oldCustDoc = null;
        let newCustDoc = null;
        const oldCustRef = oldCustomerId ? doc(db, 'customers', oldCustomerId) : null;
        const newCustRef = newCustomerId ? doc(db, 'customers', newCustomerId) : null;

        // Condition to check if old status was balance-affecting
        const wasAffectingBalance = oldStatus === 'pending' || oldStatus === 'scheduled';
        // Condition to check if new status is balance-affecting
        const willAffectBalance = newStatus === 'pending' || newStatus === 'scheduled';

        if (wasAffectingBalance && oldCustRef) {
          oldCustDoc = await transaction.get(oldCustRef);
        }

        if (willAffectBalance && newCustRef) {
          if (newCustRef.id === oldCustRef?.id) {
            newCustDoc = oldCustDoc;
          } else {
            newCustDoc = await transaction.get(newCustRef);
          }
        }

        // 2. PERFORM ALL WRITES SECOND
        if (oldCustRef?.id === newCustRef?.id && oldCustRef) {
          // Same customer logic
          if (oldCustDoc?.exists()) {
            const currentBalance = oldCustDoc.data()?.balance || 0;
            let finalBalance = currentBalance;
            if (wasAffectingBalance) finalBalance -= oldTotal;
            if (willAffectBalance) finalBalance += newTotal;
            transaction.update(oldCustRef, { balance: Math.max(0, finalBalance) });
          }
        } else {
          // Different customers logic
          if (wasAffectingBalance && oldCustRef && oldCustDoc?.exists()) {
            const currentBalance = oldCustDoc.data()?.balance || 0;
            transaction.update(oldCustRef, { balance: Math.max(0, currentBalance - oldTotal) });
          }
          if (willAffectBalance && newCustRef && newCustDoc?.exists()) {
            const currentBalance = newCustDoc.data()?.balance || 0;
            transaction.update(newCustRef, { balance: currentBalance + newTotal });
          }
        }

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

  useEffect(() => {
    if (allSales.length === 0) return;

    const processSalesDetail = () => {
      const now = new Date();
      const data: any[] = [];
      const daysAbbr = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
      const monthsAbbr = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

      if (salesDetailRange === 'week') {
        // Last 7 days
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dateStr = d.toISOString().split('T')[0];
          data.push({ 
            name: daysAbbr[d.getDay()], 
            dateStr, 
            piezas: 0,
            fullLabel: d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
          });
        }
      } else if (salesDetailRange === 'month') {
        // Last 30 days
        for (let i = 29; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dateStr = d.toISOString().split('T')[0];
          data.push({ 
            name: d.getDate().toString(), 
            dateStr, 
            piezas: 0,
            fullLabel: d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
          });
        }
      } else if (salesDetailRange === 'year') {
        // Last 12 months
        for (let i = 11; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          data.push({ 
            name: monthsAbbr[d.getMonth()], 
            monthKey, 
            piezas: 0,
            fullLabel: d.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
          });
        }
      }

      allSales.forEach(sale => {
        const saleDate = new Date(sale.date);
        const dateStr = sale.date?.split('T')[0];
        const monthKey = sale.date?.substring(0, 7);
        const piezas = sale.items?.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0) || 0;

        if (salesDetailRange === 'year') {
          const match = data.find(d => d.monthKey === monthKey);
          if (match) match.piezas += piezas;
        } else {
          const match = data.find(d => d.dateStr === dateStr);
          if (match) match.piezas += piezas;
        }
      });

      setSalesDetailChartData(data);
    };

    processSalesDetail();
  }, [allSales, salesDetailRange]);

  useEffect(() => {
    // Basic data fetching
    const unsubRecipes = onSnapshot(collection(db, 'recipes'), (snap) => setRecipes(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubIngs = onSnapshot(collection(db, 'ingredients'), (snap) => setIngredients(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubCusts = onSnapshot(collection(db, 'customers'), (snap) => setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubProds = onSnapshot(collection(db, 'products'), (snap) => setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() }))));

    const unsubSales = onSnapshot(collection(db, 'sales'), (salesSnap) => {
      const salesData = salesSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
      setAllSales(salesData);
      
      const now = new Date();
      const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      
      let monthSales = 0;
      let totalSalesVolume = 0;
      
      const productMap: Record<string, { name: string, sales: number }> = {};
      salesSnap.forEach(d => {
        const data = d.data();
        const saleDate = data.date || '';
        const saleDay = saleDate.split('T')[0];
        const total = data.total || 0;

        // stats.income will now represent total volume
        totalSalesVolume += total;

        if (saleDay >= startOfMonth) {
          monthSales += total;
        }

        data.items?.forEach((item: any) => {
          if (!productMap[item.productId]) productMap[item.productId] = { name: item.flavor, sales: 0 };
          productMap[item.productId].sales += item.quantity;
        });
      });

      const sortedProducts = Object.values(productMap)
        .sort((a, b) => b.sales - a.sales)
        .slice(0, 4)
        .map(p => ({ ...p, growth: Math.floor(Math.random() * 20) }));
      
      setTopProducts(sortedProducts);
      
      const scheduled = salesSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((s: any) => s.status === 'scheduled')
        .sort((a: any, b: any) => (a.deliveryDate || '').localeCompare(b.deliveryDate || ''))
        .slice(0, 5);
      
      setScheduledOrders(scheduled);
      
      // Update stats related to sales
      let cashTotal = 0;
      let cardTotal = 0;
      let pendingTotal = 0;

      salesData.forEach(sale => {
        const total = sale.total || 0;
        if (sale.status === 'paid') {
          if (sale.paymentMethod === 'tarjeta') {
            cardTotal += total;
          } else {
            cashTotal += total;
          }
        } else {
          pendingTotal += total;
        }
      });

      setStats(prev => {
        const goalPercent = prev.goal > 0 ? Math.min(Math.round((monthSales / prev.goal) * 100), 100) : 0;
        const breakEvenPercent = prev.breakEvenTarget > 0 ? Math.min(Math.round((monthSales / prev.breakEvenTarget) * 100), 100) : 0;
        
        return {
          ...prev,
          income: totalSalesVolume,
          monthIncome: monthSales,
          cashTotal,
          cardTotal,
          pendingTotal,
          cash: cashTotal - prev.expenses,
          goalPercent,
          breakEvenPercent
        };
      });

      // Update chart with cumulative balance
      const getTimeRangeConfig = () => {
        const now = new Date();
        switch(timeRange) {
          case '1m': return { days: 30, interval: 1, label: 'Mensual' };
          case '3m': return { days: 90, interval: 2, label: 'Trimestral' };
          case '1y': return { days: 365, interval: 30, label: 'Anual' };
          default: return { days: 7, interval: 1, label: 'Semanal' };
        }
      };

      const config = getTimeRangeConfig();
      const rangeData: any[] = [];
      const daysAbbr = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
      const monthsAbbr = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

      for (let i = config.days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        
        // Label logic
        let name = '';
        if (timeRange === '1y') {
          name = monthsAbbr[d.getMonth()];
          // Only push if it's a new month or first element
          if (rangeData.length === 0 || rangeData[rangeData.length - 1].name !== name) {
            rangeData.push({ name, dateStr, ingresos: 0, gastos: 0, balance: 0, fullDate: dateStr });
          }
        } else {
          name = timeRange === '7d' ? daysAbbr[d.getDay()] : d.getDate().toString();
          rangeData.push({ name, dateStr, ingresos: 0, gastos: 0, balance: 0, fullDate: dateStr });
        }
      }

      salesSnap.forEach(doc => {
        const d = doc.data();
        const date = (d.date || '').split('T')[0];
        const isPaid = d.status === 'paid';
        if (!isPaid) return;

        if (timeRange === '1y') {
          const monthName = monthsAbbr[new Date(date + 'T00:00:00').getMonth()];
          const match = rangeData.find(rd => rd.name === monthName);
          if (match) match.ingresos += (d.total || 0);
        } else {
          const match = rangeData.find(rd => rd.dateStr === date);
          if (match) match.ingresos += (d.total || 0);
        }
      });

      getDocs(collection(db, 'expenses')).then(expSnap => {
        expSnap.forEach(doc => {
          const d = doc.data();
          const date = (d.date || '').split('T')[0];
          
          if (timeRange === '1y') {
            const monthName = monthsAbbr[new Date(date + 'T00:00:00').getMonth()];
            const match = rangeData.find(rd => rd.name === monthName);
            if (match) match.gastos += (d.amount || 0);
          } else {
            const match = rangeData.find(rd => rd.dateStr === date);
            if (match) match.gastos += (d.amount || 0);
          }
        });

        let runningBalance = 0;
        const finalChartData = rangeData.map(day => {
          runningBalance += (day.ingresos - day.gastos);
          return { ...day, balance: runningBalance };
        });
        
        setChartData(finalChartData);
      });
    });

    const unsubExp = onSnapshot(collection(db, 'expenses'), (expSnap) => {
      const expensesData = expSnap.docs.map(d => d.data() as any);
      const totalExp = expensesData.reduce((sum, d) => sum + (d.amount || 0), 0);
      
      // Only expenses paid by the business ("Negocio") should reduce the cash drawer
      const businessPaidExpenses = expensesData
        .filter(d => !d.contributor || d.contributor === 'Negocio')
        .reduce((sum, d) => sum + (d.amount || 0), 0);

      // Calculate break-even target: expenses from LAST month
      const now = new Date();
      const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      
      const lastMonthTotal = expensesData.reduce((sum, d) => {
        const date = new Date(d.date || '');
        if (date >= firstOfLastMonth && date <= lastOfLastMonth) {
          return sum + (d.amount || 0);
        }
        return sum;
      }, 0);

      setStats(prev => ({ 
        ...prev, 
        expenses: totalExp, 
        cash: prev.cashTotal - businessPaidExpenses,
        breakEvenTarget: lastMonthTotal,
        breakEvenPercent: lastMonthTotal > 0 ? Math.min(Math.round((prev.monthIncome / lastMonthTotal) * 100), 100) : 0
      }));
    });

    const unsubIng = onSnapshot(collection(db, 'ingredients'), (ingSnap) => {
      const alerts = ingSnap.docs.filter(d => d.data().stock <= (d.data().reorderPoint || 0)).length;
      setStats(prev => ({ ...prev, reorderCount: alerts }));
    });

    const unsubGoal = onSnapshot(doc(db, 'settings', 'finance'), (goalDoc) => {
      if (goalDoc.exists()) {
        const data = goalDoc.data();
        const monthlyGoal = data.monthlyGoal || 100000;
        const mlPerBolis = data.mlPerBolis || 200;
        const priceRetail = data.priceRetail || 10;
        const priceWholesale = data.priceWholesale || 8;
        
        setStats(prev => ({ 
          ...prev, 
          goal: monthlyGoal, 
          mlPerBolis, 
          priceRetail, 
          priceWholesale,
          goalPercent: monthlyGoal > 0 ? Math.min(Math.round((prev.monthIncome / monthlyGoal) * 100), 100) : 0
        }));
      }
    });

    return () => {
      unsubSales();
      unsubExp();
      unsubIng();
      unsubGoal();
      unsubRecipes();
      unsubIngs();
      unsubProds();
    };
  }, [timeRange]);

  useEffect(() => {
    if (recipes.length === 0 || ingredients.length === 0) return;

    const performance = recipes.map(recipe => {
      // Cost per Liter for THIS recipe
      const totalCost = recipe.ingredients.reduce((sum: number, ri: any) => {
        const ing = ingredients.find(i => i.id === ri.ingredientId);
        return sum + (ing ? ing.costPerUnit * ri.quantity : 0);
      }, 0);
      
      const costPerLiter = totalCost / (recipe.yieldLitros || 1);
      const unitCost = (costPerLiter / 1000) * stats.mlPerBolis;

      // Profit using individual recipe prices
      const priceRetail = recipe.priceRetail || 10;
      const priceWholesale = recipe.priceWholesale || 8;

      const profitRetail = priceRetail - unitCost;
      const profitWholesale = priceWholesale - unitCost;

      // Breakdown data for the pie chart
      const breakdown = recipe.ingredients.map((ri: any) => {
        const ing = ingredients.find(i => i.id === ri.ingredientId);
        const cost = ing ? ing.costPerUnit * ri.quantity : 0;
        const unitCostPart = (cost / (recipe.yieldLitros || 1) / 1000) * stats.mlPerBolis;
        return {
          name: ing?.name || 'Otro',
          value: unitCostPart,
          originalIng: ing
        };
      }).filter((item: any) => item.value > 0);

      return {
        id: recipe.id,
        name: recipe.name,
        unitCost,
        profitRetail,
        profitWholesale,
        marginRetail: (profitRetail / (priceRetail || 1)) * 100,
        marginWholesale: (profitWholesale / (priceWholesale || 1)) * 100,
        breakdown
      };
    });

    setRecipePerformance(performance);
  }, [recipes, ingredients, stats.mlPerBolis]);

  useEffect(() => {
    // Calculate today's summary for cash out
    const calculateTodaySummary = () => {
      const today = new Date().toISOString().split('T')[0];
      let cashSales = 0;
      let cardSales = 0;
      let expenses = 0;

      allSales.forEach(sale => {
        if (sale.date?.split('T')[0] === today && sale.status === 'paid') {
          if (sale.paymentMethod === 'tarjeta') {
            cardSales += sale.total || 0;
          } else {
            cashSales += sale.total || 0;
          }
        }
      });

      // We need expenses for today too
      getDocs(query(collection(db, 'expenses'))).then(snap => {
        let totalExpenses = 0;
        let businessExpenses = 0;
        snap.docs.forEach(d => {
          const data = d.data() as any;
          if (data.date?.split('T')[0] === today) {
            totalExpenses += data.amount || 0;
            if (!data.contributor || data.contributor === 'Negocio') {
              businessExpenses += data.amount || 0;
            }
          }
        });
        setTodaySummary({
          cashSales,
          cardSales,
          expenses: totalExpenses,
          expectedCash: cashSales - businessExpenses
        });
        setCashOutData(prev => ({ ...prev, actualCash: cashSales - businessExpenses }));
      });
    };

    if (allSales.length > 0) {
      calculateTodaySummary();
    }
  }, [allSales, isCashOutModalOpen]);

  const handleSaveCashOut = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const cashOut = {
        date: new Date().toISOString(),
        ...todaySummary,
        ...cashOutData,
        difference: cashOutData.actualCash - todaySummary.expectedCash,
        withdrawal: Math.max(0, cashOutData.actualCash - cashOutData.nextDayFund)
      };

      await addDoc(collection(db, 'cash_outs'), cashOut);
      alert('Corte de caja guardado exitosamente');
      setIsCashOutModalOpen(false);
    } catch (err: any) {
      alert(`Error al guardar corte: ${err.message}`);
      handleFirestoreError(err, OperationType.WRITE, 'cash_outs');
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tight">Dashboard <span className="text-blue-600">360</span></h2>
          <p className="text-slate-500 font-medium">Análisis en tiempo real de Panel Adonaí</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 group">
          <div className="flex justify-between mb-4">
            <div className="p-3 rounded-2xl border bg-blue-50 text-blue-600 border-blue-100"><DollarSign className="w-6 h-6" /></div>
            <button 
              onClick={() => setIsCashOutModalOpen(true)}
              className="text-[10px] font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-100 hover:bg-blue-600 hover:text-white transition-all active:scale-95"
            >
              REALIZAR CORTE
            </button>
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Efectivo en Caja</p>
          <p className="text-2xl font-black text-slate-900 mt-1">{formatCurrency(stats.cash)}</p>
          <div className="mt-2 flex gap-3 text-[9px] font-bold uppercase">
             <span className="text-gray-400">Cash: <span className="text-gray-600">{formatCurrency(stats.cashTotal)}</span></span>
             <span className="text-gray-400">Card: <span className="text-gray-600">{formatCurrency(stats.cardTotal)}</span></span>
          </div>
        </div>
        <StatCard 
          title="Ventas Totales" 
          value={formatCurrency(stats.income)} 
          icon={TrendingUp} 
          color="green" 
          onClick={() => setIsSalesDetailModalOpen(true)}
        />
        <StatCard title="Egresos Totales" value={formatCurrency(stats.expenses)} icon={TrendingDown} color="red" />
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
          <div className="flex justify-between mb-4">
            <div className="p-3 rounded-2xl border bg-rose-50 text-rose-600 border-rose-100"><AlertTriangle className="w-6 h-6" /></div>
            {stats.pendingTotal > 0 && <div className="text-[10px] font-black text-rose-600 bg-rose-50 px-2 py-1 rounded-full border border-rose-100 uppercase">Cobro Pend.</div>}
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cuentas por Cobrar</p>
          <p className="text-2xl font-black text-slate-900 mt-1">{formatCurrency(stats.pendingTotal)}</p>
          <p className="text-[9px] font-bold text-slate-400 uppercase mt-2">Ventas pendientes de pago</p>
        </div>
      </div>

      {/* Sección Rentabilidad por Receta */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="font-black text-xl text-slate-900 uppercase tracking-tight flex items-center gap-2">
            <Package className="w-6 h-6 text-blue-600" />
            Análisis por Sabor
          </h3>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-100 px-3 py-1 rounded-full">
            Unitario ({stats.mlPerBolis}ml)
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {recipePerformance.map((perf) => (
            <button 
              key={perf.id} 
              onClick={() => setSelectedRecipe(perf)}
              className="group bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col text-left transition-all hover:shadow-xl hover:border-blue-200 hover:-translate-y-1 active:scale-95"
            >
              <div className="p-5 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center transition-colors group-hover:bg-blue-50/50">
                <div className="flex items-center gap-2">
                   <div className="p-2 bg-blue-100 rounded-lg text-blue-600 hidden group-hover:block animate-in fade-in zoom-in duration-300">
                     <PieChartIcon className="w-4 h-4" />
                   </div>
                   <span className="font-black text-slate-900 uppercase tracking-tight">{perf.name}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-black text-slate-400 uppercase leading-none mb-1">Costo Unit.</span>
                  <span className="text-lg font-black text-blue-600 leading-none">{formatCurrency(perf.unitCost)}</span>
                </div>
              </div>
              
              <div className="p-5 grid grid-cols-2 gap-4 bg-white flex-1">
                <div className="space-y-1">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Gan. Menudeo</p>
                  <p className="text-xl font-black text-emerald-600 leading-none">{formatCurrency(perf.profitRetail)}</p>
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    <p className="text-[10px] font-bold text-emerald-500">{perf.marginRetail.toFixed(0)}% Margen</p>
                  </div>
                </div>
                
                <div className="space-y-1">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Gan. Mayoreo</p>
                  <p className="text-xl font-black text-indigo-600 leading-none">{formatCurrency(perf.profitWholesale)}</p>
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                    <p className="text-[10px] font-bold text-indigo-500">{perf.marginWholesale.toFixed(0)}% Margen</p>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Modal Desglose de Costo */}
      {selectedRecipe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setSelectedRecipe(null)}>
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-[2.5rem] w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
              <div>
                <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-3 py-1 rounded-full mb-2 inline-block">Análisis Proyección</span>
                <h3 className="text-2xl font-black text-slate-900 uppercase leading-none">Análisis: {selectedRecipe.name}</h3>
              </div>
              <button 
                onClick={() => setSelectedRecipe(null)}
                className="p-3 bg-white border border-slate-200 rounded-2xl text-slate-400 hover:text-slate-900 transition-all hover:shadow-md"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 min-h-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-8">
                <div className="flex flex-col justify-center">
                  <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={selectedRecipe.breakdown}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                          animationDuration={1500}
                        >
                          {selectedRecipe.breakdown.map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip 
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              return (
                                <div className="bg-slate-900 text-white p-3 rounded-xl border border-slate-800 shadow-xl text-xs font-bold leading-tight text-center">
                                  <p className="text-blue-400 mb-1 uppercase tracking-tight">{payload[0].name}</p>
                                  <p className="text-lg">{formatCurrency(payload[0].value as number)}</p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-4 flex flex-wrap justify-center gap-3">
                    {selectedRecipe.breakdown.map((item: any, index: number) => (
                      <div key={item.name} className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                        <span className="text-[10px] font-black text-slate-500 uppercase">{item.name}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-6">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Estructura de Costo Unitario</p>
                    <div className="space-y-3">
                      {selectedRecipe.breakdown.map((item: any, index: number) => (
                        <div key={item.name} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100/50">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs" style={{ backgroundColor: `${COLORS[index % COLORS.length]}15`, color: COLORS[index % COLORS.length] }}>
                              {Math.round((item.value / selectedRecipe.unitCost) * 100)}%
                            </div>
                            <div>
                              <p className="text-xs font-black text-slate-800 uppercase leading-none mb-1">{item.name}</p>
                              <p className="text-[9px] font-bold text-slate-400 uppercase">Gasto Insumo</p>
                            </div>
                          </div>
                          <span className="text-sm font-black text-slate-700">{formatCurrency(item.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-6 border-t border-slate-100">
                    <div className="flex justify-between items-end">
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Costo Total Producción</p>
                        <p className="text-3xl font-black text-blue-600 leading-none">{formatCurrency(selectedRecipe.unitCost)}</p>
                      </div>
                      <div className="bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-xl border border-emerald-100 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" />
                        <span className="text-xs font-black uppercase">Rentable</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 text-center">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Cálculos de proyección para {stats.mlPerBolis}ml estándar</p>
              </div>
            </div>
            
            <div className="p-4 bg-slate-900 text-white text-center shrink-0">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Sistema BoliControl Pro © v2.0</p>
            </div>
          </motion.div>
        </div>
      )}

      {/* Modal Editar Pedido */}
      <AnimatePresence>
        {isEditModalOpen && selectedSale && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => { setIsEditModalOpen(false); setSelectedSale(null); }}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-[2.5rem] w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-3 py-1 rounded-full">Gestión de Pedido</span>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-100 px-3 py-1 rounded-full">Logística</span>
                  </div>
                  <h3 className="text-2xl font-black text-slate-900 uppercase leading-none">Modificar Entrega</h3>
                </div>
                <button 
                  onClick={() => { setIsEditModalOpen(false); setSelectedSale(null); }}
                  className="p-3 bg-white border border-slate-200 rounded-2xl text-slate-400 hover:text-slate-900 transition-all hover:shadow-md"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleUpdateSale} className="flex-1 overflow-y-auto p-8 space-y-8 min-h-0">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100">
                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">Cliente</p>
                    <p className="text-xl font-black text-blue-700 truncate">{selectedSale.customerName}</p>
                  </div>
                  <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Monto del Pedido</p>
                    <p className="text-xl font-black text-slate-700">{formatCurrency(selectedSale.total)}</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <h4 className="font-black text-slate-400 uppercase text-[10px] tracking-widest border-b border-slate-50 pb-2 flex items-center gap-2">
                    <Clock className="w-3 h-3" /> Datos de Entrega
                  </h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Fecha de Entrega</label>
                      <input 
                        type="date"
                        required
                        value={selectedSale.deliveryDate || ''}
                        onChange={e => setSelectedSale({...selectedSale, deliveryDate: e.target.value})}
                        className="w-full bg-slate-50 rounded-2xl border-2 border-transparent text-sm font-bold p-4 focus:bg-white focus:border-blue-600 transition-all outline-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Horario de Entrega</label>
                      <input 
                        type="text"
                        placeholder="Ej: 10:00 AM - 12:00 PM"
                        value={selectedSale.deliveryTime || ''}
                        onChange={e => setSelectedSale({...selectedSale, deliveryTime: e.target.value})}
                        className="w-full bg-slate-50 rounded-2xl border-2 border-transparent text-sm font-bold p-4 focus:bg-white focus:border-blue-600 transition-all outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-1 block">Dirección de Entrega</label>
                    <div className="relative">
                      <MapPin className="absolute left-4 top-5 text-slate-300 w-5 h-5" />
                      <textarea 
                        rows={3}
                        value={selectedSale.deliveryAddress || ''}
                        onChange={e => setSelectedSale({...selectedSale, deliveryAddress: e.target.value})}
                        className="w-full bg-slate-50 rounded-2xl border-2 border-transparent text-sm font-bold p-4 pl-12 focus:bg-white focus:border-blue-600 transition-all outline-none resize-none"
                        placeholder="Ingresa la dirección completa..."
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Estado del Pedido</label>
                    <select 
                      value={selectedSale.status} 
                      onChange={e => setSelectedSale({...selectedSale, status: e.target.value})}
                      className="w-full bg-slate-50 rounded-2xl border-2 border-transparent text-sm font-bold p-4 focus:bg-white focus:border-blue-600 transition-all outline-none"
                    >
                      <option value="scheduled">Agendado (Pedido)</option>
                      <option value="paid">Pagado (Entregado)</option>
                      <option value="pending">Pendiente (Sin pagar)</option>
                      <option value="cancelled">Cancelado</option>
                    </select>
                  </div>
                </div>

                <div className="pt-4">
                  <button 
                    type="submit"
                    className="w-full bg-slate-900 hover:bg-black text-white font-black py-5 rounded-2xl transition-all shadow-xl active:scale-95 flex items-center justify-center gap-3 uppercase text-xs tracking-[0.2em]"
                  >
                    Actualizar Pedido <TrendingUp className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
 
      {/* Modal Corte de Caja */}
      <AnimatePresence>
        {isCashOutModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setIsCashOutModalOpen(false)}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-[2.5rem] w-full max-w-xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 px-3 py-1 rounded-full">Cierre Diario</span>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-100 px-3 py-1 rounded-full">{new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })}</span>
                  </div>
                  <h3 className="text-2xl font-black text-slate-900 uppercase leading-none">Corte de Caja</h3>
                </div>
                <button 
                  onClick={() => setIsCashOutModalOpen(false)}
                  className="p-3 bg-white border border-slate-200 rounded-2xl text-slate-400 hover:text-slate-900 transition-all hover:shadow-md"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleSaveCashOut} className="flex-1 overflow-y-auto p-8 space-y-8 min-h-0">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Ventas Efectivo</p>
                    <p className="text-xl font-black text-slate-900">{formatCurrency(todaySummary.cashSales)}</p>
                  </div>
                  <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Gastos Hoy</p>
                    <p className="text-xl font-black text-rose-600">-{formatCurrency(todaySummary.expenses)}</p>
                  </div>
                </div>

                <div className="p-6 bg-blue-600 rounded-[2rem] text-white shadow-xl shadow-blue-100 flex justify-between items-center">
                  <div>
                    <p className="text-[10px] font-black text-blue-200 uppercase tracking-widest mb-1">Efectivo Esperado</p>
                    <p className="text-3xl font-black">{formatCurrency(todaySummary.expectedCash)}</p>
                  </div>
                  <CheckCircle2 className="w-10 h-10 text-blue-300 opacity-50" />
                </div>

                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Efectivo Real en Caja</label>
                      <input 
                        type="number"
                        required
                        value={cashOutData.actualCash || ''}
                        onChange={e => setCashOutData({...cashOutData, actualCash: Number(e.target.value)})}
                        placeholder="Monto contado..."
                        className="w-full bg-slate-50 rounded-2xl border-2 border-transparent text-lg font-black p-4 focus:bg-white focus:border-blue-600 transition-all outline-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Fondo para Mañana</label>
                      <input 
                        type="number"
                        required
                        value={cashOutData.nextDayFund || ''}
                        onChange={e => setCashOutData({...cashOutData, nextDayFund: Number(e.target.value)})}
                        placeholder="Cambio que se queda..."
                        className="w-full bg-slate-50 rounded-2xl border-2 border-transparent text-lg font-black p-4 focus:bg-white focus:border-emerald-600 transition-all outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Notas del Cierre</label>
                    <textarea 
                      rows={2}
                      value={cashOutData.notes}
                      onChange={e => setCashOutData({...cashOutData, notes: e.target.value})}
                      className="w-full bg-slate-50 rounded-2xl border-2 border-transparent text-sm font-bold p-4 focus:bg-white focus:border-blue-600 transition-all outline-none resize-none"
                      placeholder="Alguna observación sobre el dinero..."
                    />
                  </div>

                  {cashOutData.actualCash !== todaySummary.expectedCash && (
                    <div className={cn(
                      "p-4 rounded-2xl border flex items-center gap-3",
                      cashOutData.actualCash > todaySummary.expectedCash ? "bg-emerald-50 border-emerald-100 text-emerald-700" : "bg-rose-50 border-rose-100 text-rose-700"
                    )}>
                      <AlertTriangle className="w-5 h-5" />
                      <p className="text-xs font-bold uppercase tracking-tight">
                        Diferencia detectada: {formatCurrency(Math.abs(cashOutData.actualCash - todaySummary.expectedCash))} 
                        {cashOutData.actualCash > todaySummary.expectedCash ? " (Sobrante)" : " (Faltante)"}
                      </p>
                    </div>
                  )}

                  <div className="p-6 bg-slate-900 rounded-[2rem] text-white flex justify-between items-center">
                    <div>
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Retiro Sugerido</p>
                      <p className="text-2xl font-black">{formatCurrency(Math.max(0, cashOutData.actualCash - cashOutData.nextDayFund))}</p>
                    </div>
                    <TrendingDown className="w-8 h-8 text-slate-700" />
                  </div>
                </div>

                <div className="pt-4">
                  <button 
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-5 rounded-[1.5rem] shadow-xl shadow-blue-100 transition-all active:scale-95 flex items-center justify-center gap-3 uppercase text-xs tracking-widest"
                  >
                    Guardar y Cerrar Jornada <CheckCircle2 className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Detalle de Ventas (Piezas) */}
      {isSalesDetailModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setIsSalesDetailModalOpen(false)}>
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-[2.5rem] w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 px-3 py-1 rounded-full">Análisis de Volumen</span>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-100 px-3 py-1 rounded-full">Piezas Vendidas</span>
                </div>
                <h3 className="text-2xl font-black text-slate-900 uppercase leading-none">Detalle de Ventas Totales</h3>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl">
                  {(['week', 'month', 'year'] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => setSalesDetailRange(r)}
                      className={cn(
                        "px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all",
                        salesDetailRange === r 
                          ? "bg-white text-emerald-600 shadow-sm" 
                          : "text-slate-500 hover:text-slate-700"
                      )}
                    >
                      {r === 'week' ? 'Semana' : r === 'month' ? 'Mes' : 'Año'}
                    </button>
                  ))}
                </div>
                <button 
                  onClick={() => setIsSalesDetailModalOpen(false)}
                  className="p-3 bg-white border border-slate-200 rounded-2xl text-slate-400 hover:text-slate-900 transition-all hover:shadow-md"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 min-h-0">
              <div className="mb-8 grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-emerald-50 p-6 rounded-3xl border border-emerald-100">
                  <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Total de Piezas</p>
                  <p className="text-3xl font-black text-emerald-700">
                    {salesDetailChartData.reduce((sum, d) => sum + d.piezas, 0)}
                  </p>
                  <p className="text-[10px] font-bold text-emerald-500 mt-1 uppercase tracking-tight">Periodo seleccionado</p>
                </div>
                <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100">
                  <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">Promedio por {salesDetailRange === 'year' ? 'Mes' : 'Día'}</p>
                  <p className="text-3xl font-black text-blue-700">
                    {Math.round(salesDetailChartData.reduce((sum, d) => sum + d.piezas, 0) / salesDetailChartData.length)}
                  </p>
                  <p className="text-[10px] font-bold text-blue-500 mt-1 uppercase tracking-tight">Ritmo de venta actual</p>
                </div>
                <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 text-white">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Pico Registrado</p>
                  <p className="text-xl font-black text-white truncate uppercase">
                    {(() => {
                      const max = [...salesDetailChartData].sort((a, b) => b.piezas - a.piezas)[0];
                      return max?.piezas > 0 ? `${max.name} (${max.piezas} pz)` : 'Sin datos';
                    })()}
                  </p>
                  <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-tight">Pico de demanda</p>
                </div>
              </div>

              <div className="h-[400px] w-full bg-slate-50/50 rounded-[2rem] p-8 border border-slate-100">
                {salesDetailChartData.length > 0 && (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={salesDetailChartData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis 
                        dataKey="name" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#64748b', fontSize: 11, fontWeight: 700 }}
                        dy={10}
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#64748b', fontSize: 11, fontWeight: 700 }}
                      />
                      <Tooltip 
                        cursor={{ fill: '#f1f5f9', radius: 12 }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            const isMax = data.piezas === Math.max(...salesDetailChartData.map(d => d.piezas));
                            return (
                              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-2xl">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 border-b border-white/5 pb-2">
                                  {data.fullLabel}
                                </p>
                                <div className="flex items-center justify-between gap-8">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase">Unidades Vendidas</span>
                                  <span className={cn("text-xl font-black", isMax ? "text-emerald-400" : "text-white")}>
                                    {data.piezas} <span className="text-[10px] uppercase">pz</span>
                                  </span>
                                </div>
                                {isMax && (
                                  <div className="mt-2 flex items-center gap-2 text-[8px] font-black text-emerald-400 uppercase bg-emerald-400/10 px-2 py-1 rounded-lg">
                                    <TrendingUp className="w-3 h-3" /> Pico de Venta
                                  </div>
                                )}
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar 
                        dataKey="piezas" 
                        fill="#10b981" 
                        radius={[10, 10, 10, 10]} 
                        barSize={salesDetailRange === 'month' ? 12 : 40}
                        animationDuration={1500}
                      >
                        {salesDetailChartData.map((entry, index) => {
                          const isMax = entry.piezas === Math.max(...salesDetailChartData.map(d => d.piezas)) && entry.piezas > 0;
                          return <Cell key={`cell-${index}`} fill={isMax ? '#059669' : '#10b981'} fillOpacity={isMax ? 1 : 0.7} />;
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="p-4 bg-slate-900 text-white text-center shrink-0">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Análisis de Volumen de Distribución • Panel Adonaí</p>
            </div>
          </motion.div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white p-8 rounded-3xl border border-slate-200 min-h-[450px] shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
            <div>
              <h3 className="font-black text-xl text-slate-900 tracking-tight uppercase">Rendimiento Financiero</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Balance acumulado del periodo seleccionado</p>
            </div>
            <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl">
              {(['7d', '1m', '3m', '1y'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setTimeRange(r)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all",
                    timeRange === r 
                      ? "bg-white text-blue-600 shadow-sm" 
                      : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  {r === '7d' ? '7D' : r === '1m' ? '1M' : r === '3m' ? '3M' : '1A'}
                </button>
              ))}
            </div>
          </div>
          
          <div className="h-[350px] w-full relative" style={{ minWidth: 0 }}>
            {chartData.length > 0 && (
              <ResponsiveContainer width="100%" height="100%" minHeight={100} minWidth={0}>
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={(chartData[chartData.length - 1]?.balance || 0) >= 0 ? "#10b981" : "#f43f5e"} stopOpacity={0.15}/>
                      <stop offset="95%" stopColor={(chartData[chartData.length - 1]?.balance || 0) >= 0 ? "#10b981" : "#f43f5e"} stopOpacity={0.01}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}}
                    dy={10}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}}
                    tickFormatter={(value) => `$${value}`}
                  />
                  <Tooltip 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        const isPositive = data.balance >= 0;
                        return (
                          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-2xl backdrop-blur-md bg-opacity-95">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 border-b border-white/5 pb-2">
                              {data.fullDate || data.dateStr}
                            </p>
                            <div className="space-y-3">
                              <div className="flex items-center justify-between gap-8">
                                <span className="text-[10px] font-bold text-slate-400 uppercase">Balance Neto</span>
                                <span className={cn("text-lg font-black", isPositive ? "text-emerald-400" : "text-rose-400")}>
                                  {formatCurrency(data.balance)}
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/5">
                                <div>
                                  <span className="text-[8px] font-black text-slate-500 uppercase block">Ingresos</span>
                                  <span className="text-[10px] font-bold text-emerald-300">+{formatCurrency(data.ingresos)}</span>
                                </div>
                                <div>
                                  <span className="text-[8px] font-black text-slate-500 uppercase block">Egresos</span>
                                  <span className="text-[10px] font-bold text-rose-300">-{formatCurrency(data.gastos)}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                    cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '4 4' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="balance" 
                    stroke={(chartData[chartData.length - 1]?.balance || 0) >= 0 ? "#10b981" : "#f43f5e"} 
                    strokeWidth={4} 
                    fillOpacity={1} 
                    fill="url(#colorBalance)" 
                    activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2, fill: (chartData[chartData.length - 1]?.balance || 0) >= 0 ? "#10b981" : "#f43f5e" }}
                    animationDuration={1500} 
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white flex flex-col gap-8">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-500">Meta Mensual</p>
              <span className="text-[10px] font-bold text-slate-500 uppercase">{formatCurrency(stats.monthIncome)} / {formatCurrency(stats.goal)}</span>
            </div>
            <h4 className="text-3xl font-black">{stats.goalPercent}% completado</h4>
            <div className="relative h-3 bg-slate-800 rounded-full overflow-hidden">
               <motion.div initial={{ width: 0 }} animate={{ width: `${stats.goalPercent}%` }} className="absolute inset-y-0 bg-blue-600 rounded-full" />
            </div>
          </div>

          <div className="space-y-6 pt-8 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Punto de Equilibrio</p>
              <span className="text-[10px] font-bold text-slate-500 uppercase">{formatCurrency(stats.monthIncome)} / {formatCurrency(stats.breakEvenTarget)}</span>
            </div>
            <div className="flex items-end justify-between">
              <h4 className="text-3xl font-black">{stats.breakEvenPercent}%</h4>
              <div className={cn(
                "px-2 py-1 rounded-lg text-[9px] font-black uppercase",
                stats.breakEvenPercent >= 100 ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"
              )}>
                {stats.breakEvenPercent >= 100 ? "¡LIBRE DE GASTOS!" : "EN PROGRESO"}
              </div>
            </div>
            <div className="relative h-3 bg-slate-800 rounded-full overflow-hidden">
               <motion.div initial={{ width: 0 }} animate={{ width: `${stats.breakEvenPercent}%` }} className="absolute inset-y-0 bg-emerald-500 rounded-full" />
            </div>
            <p className="text-[9px] text-slate-500 font-bold uppercase leading-relaxed">
              Basado en egresos del mes anterior: <span className="text-slate-300">{formatCurrency(stats.breakEvenTarget)}</span>
            </p>
          </div>
          
          <div className="mt-auto p-6 bg-slate-800/50 rounded-2xl border border-slate-700">
            <p className="text-[10px] font-bold text-slate-400 mb-1 uppercase">Proyección de Ingresos</p>
            <p className="text-2xl font-black text-white">{formatCurrency(stats.income * 1.2)}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
          <h3 className="text-xl font-bold mb-8">Productos Top</h3>
          <div className="space-y-4">
            {topProducts.map(p => (
              <div key={p.name} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl transition-all hover:bg-slate-100">
                <div className="flex items-center gap-4">
                   <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center font-bold text-slate-900 shadow-sm uppercase">{p.name.charAt(0)}</div>
                   <div>
                     <p className="font-bold text-sm text-slate-900">{p.name}</p>
                     <p className="text-xs text-slate-400">{p.sales} unidades</p>
                   </div>
                </div>
                <div className="text-emerald-500 font-black text-sm">+{p.growth}%</div>
              </div>
            ))}
            {topProducts.length === 0 && <p className="text-center py-10 text-slate-400 uppercase text-xs font-bold">Sin datos de ventas</p>}
          </div>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
          <h3 className="text-xl font-bold mb-8">Alertas del Sistema</h3>
          <div className="space-y-4">
            <ActionItem icon={AlertTriangle} title={stats.reorderCount > 0 ? "Bajo Stock Insulado" : "Stock Saludable"} desc={`${stats.reorderCount} insumos por debajo del punto de reorden.`} type={stats.reorderCount > 0 ? "danger" : "success"} />
            <ActionItem icon={CheckCircle2} title="Sistema Sincronizado" desc="Todos los movimientos han sido procesados correctamente." type="success" />
            <div className="p-6 bg-blue-50 rounded-2xl border border-blue-100 flex flex-col gap-2 mt-4">
              <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Consejo del Día</span>
              <p className="text-[11px] font-bold text-blue-800 leading-relaxed italic">
                "Mantén un seguimiento cercano de los egresos fijos para asegurar que el punto de equilibrio se alcance en la primera quincena."
              </p>
            </div>
          </div>
        </div>
      </div>

      {scheduledOrders.length > 0 && (
        <div className="bg-white p-8 rounded-3xl border border-slate-200">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <Calendar className="w-6 h-6 text-amber-500" />
              Próximos Pedidos Agendados
            </h3>
            <span className="bg-amber-100 text-amber-600 px-3 py-1 rounded-full text-[10px] font-black uppercase">
              {scheduledOrders.length} Pendientes
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {scheduledOrders.map((order) => (
              <button 
                key={order.id} 
                onClick={() => {
                  setSelectedSale({ ...order }); // Clone object to avoid direct state mutation
                  setIsEditModalOpen(true);
                }}
                className="group bg-slate-50 border border-slate-100 p-5 rounded-2xl flex flex-col justify-between text-left transition-all hover:bg-white hover:border-blue-200 hover:shadow-xl hover:-translate-y-1 active:scale-95"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">{order.deliveryDate}</span>
                    {order.deliveryTime && (
                      <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 bg-white px-2 py-0.5 rounded-lg border border-slate-100 group-hover:bg-amber-50 group-hover:text-amber-600 group-hover:border-amber-100 transition-colors">
                        <Clock className="w-3 h-3" />
                        {order.deliveryTime}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <User className="w-4 h-4 text-slate-400" />
                    <p className="font-bold text-slate-900 truncate group-hover:text-blue-600">{order.customerName}</p>
                  </div>
                  <div className="flex items-start gap-2 mb-4">
                    <MapPin className="w-4 h-4 text-slate-300 mt-0.5" />
                    <p className="text-xs text-slate-500 line-clamp-2">{order.deliveryAddress || 'Sin dirección registrada'}</p>
                  </div>
                </div>
                <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
                   <div className="text-[10px] font-black text-slate-400 uppercase">Total Pedido</div>
                   <div className="font-black text-slate-900">{formatCurrency(order.total)}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color, isWarning, onClick }: any) {
  const colors: any = {
    blue: "bg-blue-50 text-blue-600 border-blue-100",
    green: "bg-emerald-50 text-emerald-600 border-emerald-100",
    red: "bg-rose-50 text-rose-600 border-rose-100",
    amber: "bg-amber-50 text-amber-600 border-amber-100",
  };
  return (
    <button 
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "bg-white p-6 rounded-3xl shadow-sm border border-slate-200 text-left transition-all",
        onClick ? "hover:shadow-xl hover:border-blue-200 hover:-translate-y-1 active:scale-95" : ""
      )}
    >
      <div className="flex justify-between mb-4">
        <div className={cn("p-3 rounded-2xl border", colors[color])}><Icon className="w-6 h-6" /></div>
        {isWarning && <div className="text-[10px] font-black text-rose-600 bg-rose-50 px-2 py-1 rounded-full border border-rose-100 uppercase animate-pulse">Alerta</div>}
      </div>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{title}</p>
      <p className="text-2xl font-black text-slate-900 mt-1">{value}</p>
    </button>
  );
}

function ActionItem({ icon: Icon, title, desc, type }: any) {
  const styles: any = {
    danger: "bg-rose-50 text-rose-600 border-rose-100",
    success: "bg-emerald-50 text-emerald-600 border-emerald-100",
  };
  return (
    <div className={cn("p-4 rounded-2xl border flex gap-4", styles[type])}>
      <Icon className="w-5 h-5 shrink-0" />
      <div>
        <p className="font-bold text-sm">{title}</p>
        <p className="text-xs opacity-70">{desc}</p>
      </div>
    </div>
  );
}
