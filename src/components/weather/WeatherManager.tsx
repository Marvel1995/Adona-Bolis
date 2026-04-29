import React, { useState, useEffect } from 'react';
import { Cloud, Sun, Thermometer, MapPin, TrendingUp, DollarSign, Wind, Droplets } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../../lib/utils';

export default function WeatherManager() {
  const [weather, setWeather] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('https://api.open-meteo.com/v1/forecast?latitude=20.6668&longitude=-103.3919&daily=temperature_2m_max,temperature_2m_min,weathercode,uv_index_max&timezone=auto')
      .then(res => res.json())
      .then(data => {
        if (data.daily) {
          const forecast = data.daily.time.map((t: string, i: number) => ({
            date: t,
            maxTemp: data.daily.temperature_2m_max[i],
            minTemp: data.daily.temperature_2m_min[i],
            uv: data.daily.uv_index_max[i],
            code: data.daily.weathercode[i],
            dayName: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][new Date(t + 'T00:00:00').getDay()]
          }));
          setWeather(forecast);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error("Weather error:", err);
        setLoading(false);
      });
  }, []);

  const getWeatherStrategy = (temp: number) => {
    if (temp >= 32) return {
      title: "ALTA DEMANDA",
      desc: "Excelente oportunidad para ventas masivas. Prioriza stock de sabores refrescantes (agua y cítricos).",
      color: "text-amber-600 bg-amber-50 border-amber-100"
    };
    if (temp >= 28) return {
      title: "DEMANDA ESTÁNDAR",
      desc: "Buen clima para ventas. Mantén el ritmo de producción habitual.",
      color: "text-blue-600 bg-blue-50 border-blue-100"
    };
    return {
      title: "DEMANDA MODERADA",
      desc: "Clima fresco. Enfócate en pedidos agendados y sabores cremosos.",
      color: "text-slate-600 bg-slate-50 border-slate-100"
    };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm font-black uppercase tracking-[0.2em] text-slate-400 animate-pulse">Consultando Satélite...</p>
      </div>
    );
  }

  const today = weather[0];
  const strategy = today ? getWeatherStrategy(today.maxTemp) : null;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tight">Estrategia Climática</h2>
          <p className="text-slate-500 font-medium">Pronóstico de 7 días vinculado a la proyección de ventas.</p>
        </div>
        <div className="flex items-center gap-2 bg-white px-6 py-3 rounded-2xl border border-slate-200 shadow-sm">
          <MapPin className="w-5 h-5 text-blue-600" />
          <span className="text-sm font-black uppercase tracking-widest text-slate-900">Guadalajara, Jal</span>
        </div>
      </div>

      {/* Hero Prediction */}
      {today && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 bg-slate-900 rounded-[3rem] p-10 text-white relative overflow-hidden group shadow-2xl">
            <div className="absolute top-0 right-0 p-12 opacity-10 group-hover:scale-110 transition-transform duration-700">
              <Sun className="w-64 h-64" />
            </div>
            
            <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="space-y-6">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-400">Hoy • {today.dayName.toUpperCase()}</span>
                  <h3 className="text-7xl font-black mt-2 leading-none">{today.maxTemp}°C</h3>
                  <p className="text-slate-400 font-bold mt-2 uppercase tracking-widest">Máxima Esperada</p>
                </div>
                
                <div className="flex gap-8">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-slate-500 uppercase">Mínima</p>
                    <p className="text-xl font-bold">{today.minTemp}°C</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-slate-500 uppercase">Índice UV</p>
                    <p className="text-xl font-bold">{today.uv}</p>
                  </div>
                </div>
              </div>

              <div className={cn("p-8 rounded-[2rem] border flex flex-col justify-between", strategy?.color)}>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest mb-2">Sugerencia de Negocio</p>
                  <h4 className="text-2xl font-black">{strategy?.title}</h4>
                  <p className="text-xs font-bold leading-relaxed mt-4 opacity-80">{strategy?.desc}</p>
                </div>
                <div className="mt-8 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  <span className="text-[10px] font-black uppercase">Impacto en Ventas Estimado: Alto</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-[3rem] p-10 border border-slate-100 shadow-sm flex flex-col justify-center gap-8">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-orange-50 text-orange-600 rounded-3xl">
                <Thermometer className="w-8 h-8" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Punto Crítico</p>
                <p className="text-2xl font-black text-slate-900">32.5°C</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="p-4 bg-blue-50 text-blue-600 rounded-3xl">
                <Wind className="w-8 h-8" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Humedad Promedio</p>
                <p className="text-2xl font-black text-slate-900">42%</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="p-4 bg-cyan-50 text-cyan-600 rounded-3xl">
                <Droplets className="w-8 h-8" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Precipitación</p>
                <p className="text-2xl font-black text-slate-900">0.0 mm</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Week Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {weather.slice(1).map((w, i) => (
          <div key={w.date} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm text-center space-y-4 hover:-translate-y-1 transition-transform">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">{w.dayName.slice(0, 3)}</p>
            <div className="flex justify-center">
              {w.maxTemp >= 30 ? (
                <Sun className="w-10 h-10 text-amber-500" />
              ) : (
                <Cloud className="w-10 h-10 text-blue-400" />
              )}
            </div>
            <div>
              <p className="text-xl font-black text-slate-900 leading-none">{w.maxTemp}°C</p>
              <p className="text-[9px] font-bold text-slate-400 mt-1">{w.minTemp}°C Mín</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
