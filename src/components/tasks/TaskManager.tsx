import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, Circle, Clock, Plus, X, Edit2, Trash2, 
  AlertCircle, Calendar as CalendarIcon, User, StickyNote, Save
} from 'lucide-react';
import { collection, onSnapshot, addDoc, query, orderBy, doc, updateDoc, deleteDoc, setDoc, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';
import { formatCurrency, cn } from '../../lib/utils';

interface Task {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  assignee: string;
  status: 'pending' | 'completed';
  completedAt?: string;
  createdAt: string;
}

export default function TaskManager() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [noteContent, setNoteContent] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    dueDate: new Date().toISOString().slice(0, 16),
    assignee: 'General'
  });

  useEffect(() => {
    const q = query(collection(db, 'tasks'), orderBy('dueDate', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() } as Task)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'tasks'));

    // Fetch notes
    const fetchNote = async () => {
      try {
        const noteDoc = await getDoc(doc(db, 'settings', 'notes'));
        if (noteDoc.exists()) {
          setNoteContent(noteDoc.data().content || '');
        }
      } catch (err) {
        console.error('Error fetching note:', err);
      }
    };
    fetchNote();

    return () => unsub();
  }, []);

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const taskData = {
        ...formData,
        status: 'pending',
        updatedAt: new Date().toISOString()
      };

      if (isEditMode && editingId) {
        await updateDoc(doc(db, 'tasks', editingId), taskData);
      } else {
        await addDoc(collection(db, 'tasks'), {
          ...taskData,
          createdAt: new Date().toISOString()
        });
      }
      handleCloseModal();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'tasks');
    }
  };

  const toggleTaskStatus = async (task: Task) => {
    try {
      const newStatus = task.status === 'pending' ? 'completed' : 'pending';
      await updateDoc(doc(db, 'tasks', task.id), {
        status: newStatus,
        completedAt: newStatus === 'completed' ? new Date().toISOString() : null
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'tasks');
    }
  };

  const handleEdit = (task: Task) => {
    setFormData({
      title: task.title,
      description: task.description,
      dueDate: task.dueDate,
      assignee: task.assignee
    });
    setEditingId(task.id);
    setIsEditMode(true);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Seguro que deseas eliminar esta tarea?')) return;
    try {
      await deleteDoc(doc(db, 'tasks', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'tasks');
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setIsEditMode(false);
    setEditingId(null);
    setFormData({
      title: '',
      description: '',
      dueDate: new Date().toISOString().slice(0, 16),
      assignee: 'General'
    });
  };

  const handleSaveNote = async () => {
    setIsSavingNote(true);
    try {
      await setDoc(doc(db, 'settings', 'notes'), {
        content: noteContent,
        updatedAt: new Date().toISOString()
      });
      // Optional: show a small toast or success indicator
    } catch (err) {
      console.error('Error saving note:', err);
    } finally {
      setIsSavingNote(false);
    }
  };

  const getTaskStatusInfo = (dueDate: string, status: string) => {
    if (status === 'completed') return { color: 'bg-emerald-50 text-emerald-600', label: 'Completada', dot: 'bg-emerald-500' };
    
    const now = new Date();
    const due = new Date(dueDate);
    const diffHours = (due.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (diffHours < 0) return { color: 'bg-rose-50 text-rose-600', label: 'Vencida', dot: 'bg-rose-500' };
    if (diffHours < 24) return { color: 'bg-amber-50 text-amber-600', label: 'Próxima', dot: 'bg-amber-500' };
    return { color: 'bg-slate-50 text-slate-600', label: 'A tiempo', dot: 'bg-slate-400' };
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tight">Gestión de Tareas</h2>
          <p className="text-slate-500 font-medium">Asignación, seguimiento y bloc de notas compartido.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-slate-900 hover:bg-black text-white px-8 py-4 rounded-2xl font-black flex items-center gap-2 shadow-xl transition-all active:scale-95 uppercase text-xs tracking-widest shrink-0"
        >
          <Plus className="w-5 h-5" />
          Nueva Tarea
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Task List */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-black text-slate-900 uppercase text-sm tracking-widest flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Pendientes y Seguimiento
              </h3>
              <span className="px-4 py-1 bg-white border border-slate-200 rounded-full text-[10px] font-black text-slate-500">
                {tasks.filter(t => t.status === 'pending').length} ACTIVAS
              </span>
            </div>

            <div className="flex-1 overflow-y-auto max-h-[700px] min-h-0 p-4 space-y-3 custom-scrollbar">
              {tasks.length === 0 ? (
                <div className="p-20 text-center">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 className="w-8 h-8 text-slate-200" />
                  </div>
                  <p className="text-slate-400 font-bold">No hay tareas pendientes</p>
                </div>
              ) : (
                tasks.map(task => {
                  const statusInfo = getTaskStatusInfo(task.dueDate, task.status);
                  return (
                    <motion.div 
                      layout
                      key={task.id} 
                      className={cn(
                        "p-6 rounded-3xl border transition-all group relative overflow-hidden",
                        task.status === 'completed' ? "bg-slate-50 border-transparent opacity-60" : "bg-white border-slate-100 hover:border-blue-200 hover:shadow-md"
                      )}
                    >
                      <div className="flex items-start gap-4">
                        <button 
                          onClick={() => toggleTaskStatus(task)}
                          className={cn(
                            "mt-1 p-2 rounded-xl transition-all",
                            task.status === 'completed' ? "bg-emerald-500 text-white" : "bg-slate-50 text-slate-300 hover:text-emerald-500 hover:bg-emerald-50"
                          )}
                        >
                          {task.status === 'completed' ? <CheckCircle2 className="w-6 h-6" /> : <Circle className="w-6 h-6" />}
                        </button>

                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-3">
                            <h4 className={cn("text-lg font-black tracking-tight", task.status === 'completed' ? "line-through text-slate-400" : "text-slate-900")}>
                              {task.title}
                            </h4>
                            <span className={cn("px-3 py-1 rounded-full text-[9px] font-black uppercase flex items-center gap-1", statusInfo.color)}>
                              <span className={cn("w-1.5 h-1.5 rounded-full", statusInfo.dot)} />
                              {statusInfo.label}
                            </span>
                          </div>
                          
                          {task.description && (
                            <p className="text-sm text-slate-500 font-medium line-clamp-2">{task.description}</p>
                          )}

                          <div className="flex flex-wrap items-center gap-4 pt-3">
                            <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase">
                              <CalendarIcon className="w-3.5 h-3.5" />
                              {new Date(task.dueDate).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] font-black text-blue-500 uppercase bg-blue-50 px-3 py-1 rounded-full">
                              <User className="w-3.5 h-3.5" />
                              {task.assignee}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => handleEdit(task)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(task.id)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {/* Notepad */}
        <div className="space-y-6">
          <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full min-h-[400px]">
            <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-black text-slate-900 uppercase text-sm tracking-widest flex items-center gap-2">
                <StickyNote className="w-4 h-4 text-blue-500" /> Bloc de Notas
              </h3>
              <button 
                onClick={handleSaveNote}
                disabled={isSavingNote}
                className="p-2 hover:bg-white rounded-xl transition-all text-blue-600 disabled:opacity-50"
              >
                <Save className={cn("w-5 h-5", isSavingNote && "animate-pulse")} />
              </button>
            </div>
            <div className="flex-1 p-6 flex flex-col">
              <textarea 
                value={noteContent}
                onChange={e => setNoteContent(e.target.value)}
                placeholder="Escribe notas importantes para el equipo aquí..."
                className="flex-1 w-full text-slate-700 font-medium text-sm border-none focus:ring-0 resize-none custom-scrollbar p-2"
                onBlur={handleSaveNote}
              />
              <div className="pt-4 border-t border-slate-50 text-[9px] font-black text-slate-400 uppercase tracking-widest flex justify-between items-center">
                <span>Guardado automático al salir</span>
                <span>Compartido con todos</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Task Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={handleCloseModal}>
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }} 
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-[3rem] shadow-2xl w-full max-w-lg relative z-10 flex flex-col max-h-[90vh] overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-10 pb-4 border-b border-slate-50 shrink-0">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-2xl font-black tracking-tight uppercase leading-none">{isEditMode ? 'Actualizar' : 'Nueva'} <span className="text-blue-600">Tarea</span></h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2 px-1">Organización y cumplimiento</p>
                  </div>
                  <button onClick={handleCloseModal} className="p-3 hover:bg-slate-100 rounded-2xl transition-all"><X className="w-6 h-6 text-slate-400" /></button>
                </div>
              </div>
              
              <form onSubmit={handleSaveTask} className="flex-1 overflow-y-auto p-10 pt-6 space-y-6">
                <Input 
                  label="Título de la Tarea" 
                  value={formData.title} 
                  onChange={(v:any) => setFormData({...formData, title: v})} 
                  required 
                />
                
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Vencimiento (Día y Hora)</label>
                  <input 
                    type="datetime-local" 
                    value={formData.dueDate} 
                    onChange={e => setFormData({...formData, dueDate: e.target.value})}
                    required
                    className="w-full px-5 py-4 bg-slate-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-blue-600 transition-all font-bold text-sm outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Asignar a:</label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-slate-100 p-1 rounded-2xl">
                    {['General', 'Mauricio', 'Silvia', 'Alexis'].map(p => (
                      <button 
                        key={p} 
                        type="button" 
                        onClick={() => setFormData({...formData, assignee: p})} 
                        className={cn(
                          "py-2 rounded-xl text-[10px] font-black transition-all uppercase tracking-tighter",
                          formData.assignee === p ? "bg-white shadow-sm text-blue-600" : "text-slate-400 hover:text-slate-600"
                        )}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Instrucciones / Descripción</label>
                  <textarea 
                    rows={3}
                    value={formData.description}
                    onChange={e => setFormData({...formData, description: e.target.value})}
                    placeholder="Detalla lo que se debe hacer..."
                    className="w-full px-5 py-4 bg-slate-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-blue-600 transition-all font-bold text-sm outline-none resize-none"
                  />
                </div>
                
                <button 
                  type="submit"
                  className="w-full bg-slate-900 hover:bg-black text-white font-black py-6 rounded-[2rem] shadow-2xl mt-4 active:scale-95 transition-all uppercase tracking-[0.2em] text-xs"
                >
                  {isEditMode ? 'Actualizar Tarea' : 'Crear Tarea'}
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
    <div className="space-y-2">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">{label}</label>
      <input 
        type={type} 
        value={value} 
        onChange={e => onChange(e.target.value)}
        required={required}
        className="w-full px-5 py-4 bg-slate-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-blue-600 transition-all font-bold text-sm outline-none"
      />
    </div>
  );
}
