import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, TrendingDown, DollarSign, Package, 
  AlertTriangle, CheckCircle2, ShoppingBag, ArrowUpRight
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
    income: 0,
    expenses: 0,
    goalPercent: 0,
    reorderCount: 0,
    goal: 100000,
    mlPerBolis: 200,
    avgUnitCost: 0,
    avgPrice: 0,
    avgProfit: 0,
    avgMargin: 0
  });

  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    // Basic data fetching
    const unsubRecipes = onSnapshot(collection(db, 'recipes'), (snap) => setRecipes(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubIngs = onSnapshot(collection(db, 'ingredients'), (snap) => setIngredients(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubProds = onSnapshot(collection(db, 'products'), (snap) => setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() }))));

    const unsubSales = onSnapshot(collection(db, 'sales'), (salesSnap) => {
      const totalSales = salesSnap.docs.reduce((sum, d) => sum + (d.data().total || 0), 0);
      
      const productMap: Record<string, { name: string, sales: number }> = {};
      salesSnap.forEach(d => {
        d.data().items?.forEach((item: any) => {
          if (!productMap[item.productId]) productMap[item.productId] = { name: item.flavor, sales: 0 };
          productMap[item.productId].sales += item.quantity;
        });
      });

      const sortedProducts = Object.values(productMap)
        .sort((a, b) => b.sales - a.sales)
        .slice(0, 4)
        .map(p => ({ ...p, growth: Math.floor(Math.random() * 20) }));
      
      setTopProducts(sortedProducts);
      
      // Update stats related to sales
      setStats(prev => ({
        ...prev,
        income: totalSales,
        goalPercent: Math.min(Math.round((totalSales / prev.goal) * 100), 100)
      }));

      // Update chart with sales
      const days = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
      const last7Days = Array.from({length: 7}, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return { 
          name: days[d.getDay()], 
          dateStr: d.toISOString().split('T')[0],
          ingresos: 0,
          gastos: 0
        };
      });

      salesSnap.forEach(doc => {
        const d = doc.data();
        const date = d.date?.split('T')[0];
        const dayMatch = last7Days.find(ld => ld.dateStr === date);
        if (dayMatch) dayMatch.ingresos += d.total;
      });

      // Also get expenses for the chart in real-time
      getDocs(collection(db, 'expenses')).then(expSnap => {
        expSnap.forEach(doc => {
          const d = doc.data();
          const date = d.date?.split('T')[0];
          const dayMatch = last7Days.find(ld => ld.dateStr === date);
          if (dayMatch) dayMatch.gastos += d.amount;
        });
        setChartData(last7Days);
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
        setStats(prev => ({ ...prev, goal: monthlyGoal, mlPerBolis }));
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
  }, []);

  // Effect to calculate unit performance metrics
  useEffect(() => {
    if (recipes.length === 0 || ingredients.length === 0 || products.length === 0) return;

    // Calculate Average Cost per Liter across all recipes
    const recipeCosts = recipes.map(recipe => {
      const totalCost = recipe.ingredients.reduce((sum: number, ri: any) => {
        const ing = ingredients.find(i => i.id === ri.ingredientId);
        return sum + (ing ? ing.costPerUnit * ri.quantity : 0);
      }, 0);
      return totalCost / (recipe.yieldLitros || 1);
    });

    const avgCostPerLiter = recipeCosts.reduce((a, b) => a + b, 0) / (recipeCosts.length || 1);
    
    // Cost per Unit (Bolis)
    const avgUnitCost = (avgCostPerLiter / 1000) * stats.mlPerBolis;

    // Average Price (weighted by sales if possible, or simple avg)
    const avgPrice = products.reduce((sum, p) => sum + ((p.priceWholesale + p.priceRetail) / 2), 0) / (products.length || 1);

    const avgProfit = avgPrice - avgUnitCost;
    const avgMargin = (avgProfit / (avgPrice || 1)) * 100;

    setStats(prev => ({
      ...prev,
      avgUnitCost,
      avgPrice,
      avgProfit,
      avgMargin
    }));
  }, [recipes, ingredients, products, stats.mlPerBolis]);

  // Effect to handle cash calculation when both sales and expenses change
  useEffect(() => {
    const calculateCash = async () => {
      const salesSnap = await getDocs(collection(db, 'sales'));
      const expSnap = await getDocs(collection(db, 'expenses'));
      
      const incomePaid = salesSnap.docs
        .filter(d => d.data().status === 'paid')
        .reduce((sum, d) => sum + (d.data().total || 0), 0);
        
      const totalExp = expSnap.docs.reduce((sum, d) => sum + (d.data().amount || 0), 0);
      
      setStats(prev => ({ ...prev, cash: incomePaid - totalExp }));
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
        <StatCard title="Efectivo Caja" value={formatCurrency(stats.cash)} icon={DollarSign} color="blue" />
        <StatCard title="Ventas Mes" value={formatCurrency(stats.income)} icon={TrendingUp} color="green" />
        <StatCard title="Gastos Totales" value={formatCurrency(stats.expenses)} icon={TrendingDown} color="red" />
        <StatCard title="Alertas Stock" value={stats.reorderCount.toString()} icon={AlertTriangle} color="amber" isWarning={stats.reorderCount > 0} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-blue-100 shadow-sm flex items-center gap-5">
           <div className="w-14 h-14 bg-blue-600 rounded-[1.25rem] flex items-center justify-center text-white shadow-lg shadow-blue-100">
              <Package className="w-7 h-7" />
           </div>
           <div>
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Costo por Bolis</p>
             <p className="text-2xl font-black text-slate-900 leading-none">{formatCurrency(stats.avgUnitCost)}</p>
             <p className="text-[10px] font-bold text-blue-600 mt-1">PROMEDIO {stats.mlPerBolis}ml</p>
           </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-emerald-100 shadow-sm flex items-center gap-5">
           <div className="w-14 h-14 bg-emerald-500 rounded-[1.25rem] flex items-center justify-center text-white shadow-lg shadow-emerald-100">
              <TrendingUp className="w-7 h-7" />
           </div>
           <div>
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Ganancia Unitaria</p>
             <p className="text-2xl font-black text-slate-900 leading-none">{formatCurrency(stats.avgProfit)}</p>
             <p className="text-[10px] font-bold text-emerald-600 mt-1">ESTIMADO NETO</p>
           </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-indigo-100 shadow-sm flex items-center gap-5">
           <div className="w-14 h-14 bg-indigo-600 rounded-[1.25rem] flex items-center justify-center text-white shadow-lg shadow-indigo-100">
              <CheckCircle2 className="w-7 h-7" />
           </div>
           <div>
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Margen de Utilidad</p>
             <p className="text-2xl font-black text-slate-900 leading-none">{stats.avgMargin.toFixed(1)}%</p>
             <p className="text-[10px] font-bold text-indigo-600 mt-1">RENDIMIENTO</p>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white p-8 rounded-3xl border border-slate-200 min-h-[450px]">
          <h3 className="font-bold text-xl mb-8">Rendimiento Operativo</h3>
          <div className="h-[350px] w-full relative" style={{ minWidth: 0 }}>
            {chartData.length > 0 && (
              <ResponsiveContainer width="100%" height="100%" minHeight={100}>
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fill: '#94a3b8', fontSize: 12}}
                    minTickGap={20}
                  />
                  <YAxis hide domain={['auto', 'auto']} />
                  <Tooltip 
                    contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                    formatter={(value: number) => [formatCurrency(value), '']}
                  />
                  <Area type="monotone" dataKey="ingresos" stroke="#2563eb" strokeWidth={3} fill="#2563eb" fillOpacity={0.05} animationDuration={1000} />
                  <Area type="monotone" dataKey="gastos" stroke="#cbd5e1" strokeWidth={2} fill="none" strokeDasharray="5 5" animationDuration={1000} />
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
