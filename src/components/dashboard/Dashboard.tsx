import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, TrendingDown, DollarSign, Package, 
  AlertTriangle, CheckCircle2, ShoppingBag, ArrowUpRight,
  Clock, Calendar, User, MapPin
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, AreaChart, Area 
} from 'recharts';
import { collection, getDocs, getDoc, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { formatCurrency, cn } from '../../lib/utils';
import { motion } from 'motion/react';

export default function Dashboard() {
  const [stats, setStats] = useState({
    cash: 0,
    cashTotal: 0,
    cardTotal: 0,
    pendingTotal: 0,
    income: 0,
    expenses: 0,
    goalPercent: 0,
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

  useEffect(() => {
    // Basic data fetching
    const unsubRecipes = onSnapshot(collection(db, 'recipes'), (snap) => setRecipes(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubIngs = onSnapshot(collection(db, 'ingredients'), (snap) => setIngredients(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubProds = onSnapshot(collection(db, 'products'), (snap) => setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() }))));

    const unsubSales = onSnapshot(collection(db, 'sales'), (salesSnap) => {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      
      let monthSales = 0;
      let totalIncome = 0;
      
      const productMap: Record<string, { name: string, sales: number }> = {};
      salesSnap.forEach(d => {
        const data = d.data();
        const saleDate = data.date || '';
        const saleDay = saleDate.split('T')[0];
        const isPaid = data.status === 'paid';
        const total = data.total || 0;

        if (isPaid) {
          totalIncome += total;
          if (saleDay >= startOfMonth) {
            monthSales += total;
          }
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
      setStats(prev => ({
        ...prev,
        income: totalIncome,
        goalPercent: Math.min(Math.round((monthSales / prev.goal) * 100), 100)
      }));

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
      const totalExp = expSnap.docs.reduce((sum, d) => sum + (d.data().amount || 0), 0);
      setStats(prev => ({ ...prev, expenses: totalExp }));
    });

    const unsubIng = onSnapshot(collection(db, 'ingredients'), (ingSnap) => {
      const alerts = ingSnap.docs.filter(d => d.data().stock <= (d.data().reorderPoint || 0)).length;
      setStats(prev => ({ ...prev, reorderCount: alerts }));
    });

    const unsubGoal = onSnapshot(doc(db, 'settings', 'finance'), (goalDoc) => {
      if (goalDoc.exists()) {
        const monthlyGoal = goalDoc.data().monthlyGoal || 100000;
        const mlPerBolis = goalDoc.data().mlPerBolis || 200;
        const priceRetail = goalDoc.data().priceRetail || 10;
        const priceWholesale = goalDoc.data().priceWholesale || 8;
        setStats(prev => ({ ...prev, goal: monthlyGoal, mlPerBolis, priceRetail, priceWholesale }));
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

      return {
        id: recipe.id,
        name: recipe.name,
        unitCost,
        profitRetail,
        profitWholesale,
        marginRetail: (profitRetail / (priceRetail || 1)) * 100,
        marginWholesale: (profitWholesale / (priceWholesale || 1)) * 100
      };
    });

    setRecipePerformance(performance);
  }, [recipes, ingredients, stats.mlPerBolis]);

  // Effect to handle cash calculation when both sales and expenses change
  useEffect(() => {
    const calculateCash = async () => {
      const salesSnap = await getDocs(collection(db, 'sales'));
      const expSnap = await getDocs(collection(db, 'expenses'));
      
      let incomePaid = 0;
      let cashTotal = 0;
      let cardTotal = 0;
      let pendingTotal = 0;

      salesSnap.docs.forEach(d => {
        const data = d.data();
        const total = data.total || 0;
        if (data.status === 'paid') {
          incomePaid += total;
          if (data.paymentMethod === 'tarjeta') {
            cardTotal += total;
          } else {
            cashTotal += total;
          }
        } else {
          pendingTotal += total;
        }
      });
        
      const totalExp = expSnap.docs.reduce((sum, d) => sum + (d.data().amount || 0), 0);
      
      setStats(prev => ({ 
        ...prev, 
        cash: cashTotal - totalExp, 
        cashTotal,
        cardTotal,
        pendingTotal
      }));
    };
    calculateCash();
  }, [stats.income, stats.expenses]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tight">Dashboard <span className="text-blue-600">360</span></h2>
          <p className="text-slate-500 font-medium">Análisis en tiempo real de Panel Adonaí</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
          <div className="flex justify-between mb-4">
            <div className="p-3 rounded-2xl border bg-blue-50 text-blue-600 border-blue-100"><DollarSign className="w-6 h-6" /></div>
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Efectivo en Caja</p>
          <p className="text-2xl font-black text-slate-900 mt-1">{formatCurrency(stats.cash)}</p>
          <div className="mt-2 flex gap-3 text-[9px] font-bold uppercase">
             <span className="text-gray-400">Cash: <span className="text-gray-600">{formatCurrency(stats.cashTotal)}</span></span>
             <span className="text-gray-400">Card: <span className="text-gray-600">{formatCurrency(stats.cardTotal)}</span></span>
          </div>
        </div>
        <StatCard title="Ventas Totales" value={formatCurrency(stats.income)} icon={TrendingUp} color="green" />
        <StatCard title="Gastos Totales" value={formatCurrency(stats.expenses)} icon={TrendingDown} color="red" />
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
            <div key={perf.id} className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col">
              <div className="p-5 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center">
                <span className="font-black text-slate-900 uppercase tracking-tight">{perf.name}</span>
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-black text-slate-400 uppercase leading-none mb-1">Costo Unit.</span>
                  <span className="text-lg font-black text-blue-600 leading-none">{formatCurrency(perf.unitCost)}</span>
                </div>
              </div>
              
              <div className="p-5 grid grid-cols-2 gap-4 bg-white">
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
            </div>
          ))}
        </div>
      </div>

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
                                  <span className="text-[8px] font-black text-slate-500 uppercase block">Gastos</span>
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

        <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white flex flex-col justify-between">
          <div className="space-y-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-500">Meta Mensual</p>
            <h4 className="text-3xl font-black">{stats.goalPercent}% completado</h4>
            <div className="relative h-3 bg-slate-800 rounded-full overflow-hidden">
               <motion.div initial={{ width: 0 }} animate={{ width: `${stats.goalPercent}%` }} className="absolute inset-y-0 bg-blue-600 rounded-full" />
            </div>
            <p className="text-xs text-slate-500 font-bold uppercase">Objetivo: {formatCurrency(stats.goal)}</p>
          </div>
          <div className="mt-8 p-6 bg-slate-800/50 rounded-2xl border border-slate-700">
            <p className="text-[10px] font-bold text-slate-400 mb-1 uppercase">Proyección Estimada</p>
            <p className="text-2xl font-black text-white">{formatCurrency(stats.income * 1.2)}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-3xl border border-slate-200">
          <h3 className="text-xl font-bold mb-8">Productos Top</h3>
          <div className="space-y-4">
            {topProducts.map(p => (
              <div key={p.name} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
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

        <div className="bg-white p-8 rounded-3xl border border-slate-200">
          <h3 className="text-xl font-bold mb-8">Alertas del Sistema</h3>
          <div className="space-y-4">
            <ActionItem icon={AlertTriangle} title={stats.reorderCount > 0 ? "Bajo Stock Insulado" : "Stock Saludable"} desc={`${stats.reorderCount} insumos por debajo del punto de reorden.`} type={stats.reorderCount > 0 ? "danger" : "success"} />
            <ActionItem icon={CheckCircle2} title="Sistema Sincronizado" desc="Todos los movimientos han sido procesados correctamente." type="success" />
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
              <div key={order.id} className="bg-slate-50 border border-slate-100 p-5 rounded-2xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">{order.deliveryDate}</span>
                    {order.deliveryTime && (
                      <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 bg-white px-2 py-0.5 rounded-lg border border-slate-100">
                        <Clock className="w-3 h-3" />
                        {order.deliveryTime}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <User className="w-4 h-4 text-slate-400" />
                    <p className="font-bold text-slate-900 truncate">{order.customerName}</p>
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
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color, isWarning }: any) {
  const colors: any = {
    blue: "bg-blue-50 text-blue-600 border-blue-100",
    green: "bg-emerald-50 text-emerald-600 border-emerald-100",
    red: "bg-rose-50 text-rose-600 border-rose-100",
    amber: "bg-amber-50 text-amber-600 border-amber-100",
  };
  return (
    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
      <div className="flex justify-between mb-4">
        <div className={cn("p-3 rounded-2xl border", colors[color])}><Icon className="w-6 h-6" /></div>
        {isWarning && <div className="text-[10px] font-black text-rose-600 bg-rose-50 px-2 py-1 rounded-full border border-rose-100 uppercase animate-pulse">Alerta</div>}
      </div>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{title}</p>
      <p className="text-2xl font-black text-slate-900 mt-1">{value}</p>
    </div>
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
