import React, { useState, useEffect } from 'react';
import { Settings, Save, Users, Shield, Target, Plus, Trash2 } from 'lucide-react';
import { collection, onSnapshot, doc, updateDoc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { cn } from '../../lib/utils';

export default function SettingsManager() {
  const [users, setUsers] = useState<any[]>([]);
  const [goal, setGoal] = useState<number>(100000);
  const [kmCost, setKmCost] = useState<number>(0);
  const [mlPerBolis, setMlPerBolis] = useState<number>(200);
  const [isSaving, setIsSaving] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('sales');

  useEffect(() => {
    onSnapshot(collection(db, 'users'), snap => {
      setUsers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const fetchGoal = async () => {
      const docSnap = await getDoc(doc(db, 'settings', 'finance'));
      if (docSnap.exists()) {
        setGoal(docSnap.data().monthlyGoal || 100000);
        setKmCost(docSnap.data().kmCost || 0);
        setMlPerBolis(docSnap.data().mlPerBolis || 200);
      }
    };
    fetchGoal();
  }, []);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail) return;
    try {
      // Use email as ID (sanitized) or just add to collection
      await setDoc(doc(db, 'users', newEmail.replace(/\./g, '_')), {
        email: newEmail,
        role: newRole,
        name: newEmail.split('@')[0],
        authorizedAt: new Date().toISOString()
      });
      setNewEmail('');
      alert('Usuario autorizado correctamente');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'users');
    }
  };

  const handleUpdateRole = async (userId: string, newRole: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), { role: newRole });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'users');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('¿Seguro que deseas revocar el acceso a este usuario?')) return;
    try {
      await deleteDoc(doc(db, 'users', userId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'users');
    }
  };

  const handleSaveGoal = async () => {
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'finance'), { 
        monthlyGoal: Number(goal),
        kmCost: Number(kmCost),
        mlPerBolis: Number(mlPerBolis)
      }, { merge: true });
      alert('Configuración guardada correctamente');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="space-y-1">
        <h2 className="text-4xl font-black text-slate-900 tracking-tight">Configuración</h2>
        <p className="text-slate-500 font-medium">Control de usuarios por correo, roles y metas mensuales.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Finance Settings */}
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 space-y-6">
          <div className="flex items-center gap-4 mb-2">
            <div className="p-3 bg-blue-50 rounded-2xl text-blue-600">
              <Target className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-slate-900">Configuración Financiera</h3>
          </div>
          
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">Meta Mensual (Pesos)</label>
              <input 
                type="number"
                value={goal}
                onChange={(e) => setGoal(Number(e.target.value))}
                className="w-full text-2xl font-black p-4 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-blue-600 transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">Costo por KM (Logística)</label>
              <div className="relative">
                <input 
                  type="number"
                  value={kmCost}
                  onChange={(e) => setKmCost(Number(e.target.value))}
                  className="w-full text-2xl font-black p-4 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-blue-600 transition-all pl-10"
                />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">Contenido por Bolis (ml)</label>
              <div className="relative">
                <input 
                  type="number"
                  value={mlPerBolis}
                  onChange={(e) => setMlPerBolis(Number(e.target.value))}
                  className="w-full text-2xl font-black p-4 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-blue-600 transition-all pr-10"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">ml</span>
              </div>
            </div>

            <button 
              onClick={handleSaveGoal}
              disabled={isSaving}
              className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl shadow-lg hover:shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <Save className="w-5 h-5" />
              {isSaving ? "Guardando..." : "Guardar Cambios"}
            </button>
          </div>
        </div>

        {/* User Management */}
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-4 mb-8">
            <div className="p-3 bg-slate-100 rounded-2xl text-slate-600">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-slate-900">Personal del Panel</h3>
          </div>

          <form onSubmit={handleAddUser} className="mb-8 p-4 bg-slate-50 rounded-2xl border border-dashed border-slate-300 space-y-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Autorizar Nuevo Correo</p>
            <div className="flex gap-2">
              <input 
                type="email" 
                placeholder="correo@ejemplo.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="flex-1 px-4 py-2 bg-white rounded-xl border-slate-200 text-sm font-bold focus:ring-blue-600"
              />
              <select 
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className="bg-white border-slate-200 rounded-xl text-xs font-bold p-2 focus:ring-blue-600"
              >
                <option value="sales">Ventas</option>
                <option value="production">Producción</option>
                <option value="admin">Admin</option>
              </select>
              <button className="bg-blue-600 text-white p-2 rounded-xl hover:bg-blue-700 transition-colors">
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </form>

          <div className="space-y-4 overflow-y-auto max-h-[300px] pr-2 custom-scrollbar">
            {users.map(u => (
              <div key={u.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-600/10 rounded-full flex items-center justify-center font-bold text-blue-600 text-sm">
                    {u.name?.charAt(0) || u.email?.charAt(0)}
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 text-sm">{u.name || "Usuario"}</p>
                    <p className="text-[10px] text-slate-400 font-mono">{u.email}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <select 
                    value={u.role}
                    onChange={(e) => handleUpdateRole(u.id, e.target.value)}
                    className="bg-white border-slate-200 rounded-xl text-xs font-bold p-2 focus:ring-blue-600"
                  >
                    <option value="sales">Ventas</option>
                    <option value="production">Producción</option>
                    <option value="admin">Administrador</option>
                  </select>
                  <button 
                    onClick={() => handleDeleteUser(u.id)}
                    className="p-2 text-slate-300 hover:text-rose-600 hover:bg-white rounded-xl transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
