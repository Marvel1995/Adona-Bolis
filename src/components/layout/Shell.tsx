import React, { useState, useEffect } from 'react';
import { 
  Menu, X, Home, Package, ShoppingCart, 
  Users, DollarSign, Settings as SettingsIcon, LogOut, ChevronRight,
  Layers, ClipboardList, LayoutDashboard, Truck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db } from '../../lib/firebase';
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, onSnapshot, collection } from 'firebase/firestore';
import { cn } from '../../lib/utils';

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  role?: string[];
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard 360', icon: LayoutDashboard },
  { id: 'production', label: 'Producción', icon: Layers, role: ['admin', 'production'] },
  { id: 'recipes', label: 'Recetario', icon: ClipboardList, role: ['admin', 'production'] },
  { id: 'inventory', label: 'Inventario', icon: Package, role: ['admin', 'production', 'sales'] },
  { id: 'sales', label: 'Ventas', icon: ShoppingCart, role: ['admin', 'sales'] },
  { id: 'orders', label: 'Pedidos', icon: Truck, role: ['admin', 'sales', 'production'] },
  { id: 'customers', label: 'Clientes', icon: Users, role: ['admin', 'sales'] },
  { id: 'finances', label: 'Gastos Fijos', icon: DollarSign, role: ['admin'] },
  { id: 'settings', label: 'Configuración', icon: SettingsIcon, role: ['admin'] },
];

const ADMIN_EMAIL = 'hernandezalexis997@gmail.com';

export default function Shell({ children, activeTab, onTabChange }: { children: React.ReactNode, activeTab: string, onTabChange: (id: string) => void }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      try {
        if (u) {
          setUser(u);
          const userRef = doc(db, 'users', u.uid);
          
          // Determine base role
          let currentRole = u.email === ADMIN_EMAIL ? 'admin' : 'sales';

          try {
            const userDoc = await getDoc(userRef);
            if (userDoc.exists()) {
              const data = userDoc.data();
              if (u.email === ADMIN_EMAIL && data.role !== 'admin') {
                await updateDoc(userRef, { role: 'admin' });
                currentRole = 'admin';
              } else {
                currentRole = data.role || currentRole;
              }
            } else {
              await setDoc(userRef, {
                email: u.email,
                name: u.displayName,
                role: currentRole,
                createdAt: new Date().toISOString()
              });
            }
          } catch (dbError) {
            console.error("Database error during auth:", dbError);
            // Fallback to base role determined by email if DB is unreachable
          }
          
          setRole(currentRole);
        } else {
          setUser(null);
          setRole(null);
        }
      } finally {
        setLoading(false);
      }
    });
  }, []);

  const [stats, setStats] = useState({
    cajaHoy: 0,
    metaMes: 0,
    goal: 100000
  });

  useEffect(() => {
    // Only fetch if user is logged in
    if (!user) return;

    const today = new Date().toISOString().split('T')[0];
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

    // Listen to Sales for "Caja Hoy" and "Meta Mes"
    const unsubSales = onSnapshot(collection(db, 'sales'), (snap) => {
      let todayTotal = 0;
      let monthTotal = 0;

      snap.docs.forEach(doc => {
        const data = doc.data();
        const saleDate = data.date || '';
        const saleDay = saleDate.split('T')[0];
        const amount = data.total || 0;
        const isPaid = data.status === 'paid';

        if (saleDay === today && isPaid) {
          todayTotal += amount;
        }
        if (saleDay >= startOfMonth && isPaid) {
          monthTotal += amount;
        }
      });

      setStats(prev => ({
        ...prev,
        cajaHoy: todayTotal,
        metaMes: monthTotal
      }));
    });

    // Listen to Goal
    const unsubGoal = onSnapshot(doc(db, 'settings', 'finance'), (snap) => {
      if (snap.exists()) {
        setStats(prev => ({ ...prev, goal: snap.data().monthlyGoal || 100000 }));
      }
    });

    return () => {
      unsubSales();
      unsubGoal();
    };
  }, [user]);

  const login = () => {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider);
  };

  const logout = () => signOut(auth);

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 p-4 font-sans">
        <div className="bg-white p-10 rounded-2xl shadow-2xl max-w-md w-full text-center border border-slate-200">
          <div className="mb-8 bg-blue-600 w-20 h-20 rounded-2xl flex items-center justify-center mx-auto shadow-lg rotate-3">
            <span className="text-white text-4xl font-black">B</span>
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 mb-2 tracking-tight">BolisPro <span className="text-blue-600">ERP</span></h1>
          <p className="text-slate-500 mb-10 text-sm uppercase tracking-widest font-semibold font-mono">Control de Producción & Finanzas</p>
          <button 
            onClick={login}
            className="w-full flex items-center justify-center gap-3 bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 px-6 rounded-xl transition-all shadow-lg active:scale-95"
          >
            <Home className="w-5 h-5" />
            Acceder al Sistema
          </button>
        </div>
      </div>
    );
  }

  const filteredNavItems = navItems.filter(item => !item.role || (role && (role === 'admin' || item.role.includes(role || ''))));

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      {/* Dark Sidebar (Theme matching Design) */}
      <motion.aside 
        initial={false}
        animate={{ width: isSidebarOpen ? '260px' : '0px' }}
        className="bg-slate-900 text-slate-300 flex flex-col border-r border-slate-800 shadow-2xl z-30 transition-all overflow-hidden"
      >
        <div className="p-6 shrink-0">
          <div className="flex items-center space-x-3 mb-10">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-white shadow-lg">B</div>
            <span className="text-lg font-bold text-white tracking-tight">Panel <span className="text-blue-500 underline decoration-2 underline-offset-4">Adonaí</span></span>
          </div>

          <nav className="space-y-1">
            <p className="text-[10px] uppercase font-bold text-slate-500 tracking-widest mb-4 mt-2">Menú Principal</p>
            {filteredNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all group relative",
                    isActive 
                      ? "bg-blue-600 text-white font-bold shadow-md border-r-4 border-blue-400" 
                      : "hover:bg-slate-800 hover:text-white"
                  )}
                >
                  <Icon className={cn("w-5 h-5 opacity-80", isActive ? "opacity-100" : "group-hover:opacity-100")} />
                  <span className="text-sm">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto p-4 bg-slate-950/50">
          <div className="flex items-center gap-3 mb-4 p-2">
            <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full border border-slate-700" />
            <div className="overflow-hidden">
              <p className="text-xs font-bold text-white truncate">{user.displayName}</p>
              <p className="text-[10px] text-slate-500 uppercase font-mono">{role}</p>
            </div>
          </div>
          <button 
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:bg-red-600/20 hover:text-red-400 transition-all text-xs font-bold"
          >
            <LogOut className="w-4 h-4" />
            Salir del Sistema
          </button>
        </div>
      </motion.aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm z-20 shrink-0">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-slate-100 rounded-lg text-slate-500"
            >
              {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div className="h-6 w-px bg-slate-200" />
            <div className="flex flex-col">
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-tight">
                {navItems.find(i => i.id === activeTab)?.label || 'BolisPro Control'}
              </h2>
              <span className="text-[10px] text-slate-400 font-mono">USUARIO/{role?.toUpperCase()}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
             <div className="hidden lg:flex items-center gap-8">
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Caja Hoy</p>
                  <p className="text-sm font-bold text-emerald-600">{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(stats.cajaHoy)}</p>
                </div>
                <div className="h-8 w-px bg-slate-100" />
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Meta Mes</p>
                  <p className="text-sm font-bold text-slate-700">{Math.round((stats.metaMes / (stats.goal || 1)) * 100)}%</p>
                </div>
             </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
          <div className="max-w-7xl mx-auto h-full">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
