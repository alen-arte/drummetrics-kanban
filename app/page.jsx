'use client'
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAutoAnimate } from '@formkit/auto-animate/react'

const ESTADOS = ['Pendiente', 'En Proceso', 'Listo para revisión', 'Completada']
const PRIOS = ['Alta', 'Media', 'Baja']
const PERSONAS = ['Alén', 'John', 'Sin asignar']

const COLORES = {
  Alta: 'bg-red-950/60 text-red-400 border border-red-500/50 shadow-[0_0_10px_#ef444433]',
  Media: 'bg-amber-950/60 text-amber-400 border border-amber-500/50 shadow-[0_0_10px_#f59e0b33]',
  Baja: 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/50 shadow-[0_0_10px_#10b98133]',
  Pendiente: 'bg-slate-900/60 text-slate-400 border border-slate-700/50',
  'En Proceso': 'bg-cyan-950/60 text-cyan-400 border border-cyan-500/50 shadow-[0_0_10px_#06b6d433]',
  'Listo para revisión': 'bg-purple-950/60 text-purple-400 border border-purple-500/50 shadow-[0_0_10px_#a855f733]',
  Completada: 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/50 shadow-[0_0_10px_#10b98133]',
  'Alén': 'bg-slate-800/60 text-slate-300 border border-sky-700/60 shadow-none',
  John: 'bg-zinc-800/60 text-zinc-300 border border-fuchsia-700/60 shadow-none',
  'Sin asignar': 'bg-slate-900/30 text-slate-500 border border-slate-700 border-dashed',
}

const RP = { Alta: 0, Media: 1, Baja: 2 }
const RR = { 'Alén': 0, John: 1, 'Sin asignar': 2 }
const ordenar = (arr, modo = 'prio') => {
  const pos = (a, b) => (a.posicion ?? 0) - (b.posicion ?? 0)
  const f = modo === 'resp' ? (a, b) => {
    const respA = a.responsable?.[0] || 'Sin asignar'
    const respB = b.responsable?.[0] || 'Sin asignar'
    return RR[respA] - RR[respB] || RP[a.prioridad] - RP[b.prioridad] || pos(a, b)
  }
    : modo === 'custom' ? pos
      : (a, b) => RP[a.prioridad] - RP[b.prioridad] || pos(a, b)
  return [...arr].sort(f)
}
const L = { Pendiente: 'To-do', 'En Proceso': 'In progress', 'Listo para revisión': 'Ready for review', Completada: 'Done', Alta: 'High', Media: 'Medium', Baja: 'Low', 'Sin asignar': 'Unassigned', 'Alén': 'Alén', 'John': 'John' }
const lb = v => L[v] || v
const vacia = { titulo: '', modulo: '', estado: 'Pendiente', prioridad: 'Media', responsable: ['Sin asignar'], depende_de: [], notas: '', subtareas: [] }
const COL_ESTADO = {
  Pendiente: { dot: 'bg-slate-400 shadow-[0_0_8px_#94a3b8]', bar: 'border-t-slate-500/50', head: 'text-slate-300' },
  'En Proceso': { dot: 'bg-cyan-400 shadow-[0_0_8px_#22d3ee]', bar: 'border-t-cyan-500/70 shadow-[0_-5px_15px_#06b6d420]', head: 'text-cyan-300' },
  'Listo para revisión': { dot: 'bg-purple-400 shadow-[0_0_8px_#c084fc]', bar: 'border-t-purple-500/70 shadow-[0_-5px_15px_#a855f720]', head: 'text-purple-300' },
  Completada: { dot: 'bg-emerald-400 shadow-[0_0_8px_#34d399]', bar: 'border-t-emerald-500/70 shadow-[0_-5px_15px_#10b98120]', head: 'text-emerald-300' },
}

export default function Page() {
  const [tareas, setTareas] = useState([])
  const [edit, setEdit] = useState(null)
  const [err, setErr] = useState(null)
  const [orden, setOrden] = useState({})
  const [sobre, setSobre] = useState(null)
  const [abierta, setAbierta] = useState(null)
  const [cerrando, setCerrando] = useState(null)
  const [soltado, setSoltado] = useState(null)
  const [hoveredCard, setHoveredCard] = useState(null)
  const [showDeps, setShowDeps] = useState(false)

  const hist = useRef([])
  const redo = useRef([])

  const [fResp, setFResp] = useState([])
  const [fPrio, setFPrio] = useState([])
  const [fBloq, setFBloq] = useState([])

  const [listRef1] = useAutoAnimate({ duration: 250 })
  const [listRef2] = useAutoAnimate({ duration: 250 })
  const [listRef3] = useAutoAnimate({ duration: 250 })
  const [listRef4] = useAutoAnimate({ duration: 250 })
  const animRefs = { 'Pendiente': listRef1, 'En Proceso': listRef2, 'Listo para revisión': listRef3, 'Completada': listRef4 }

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('tareas').select('*').order('created_at')
    if (error) setErr(error.message)
    else { setErr(null); setTareas(data) }
  }, [])

  useEffect(() => {
    cargar()
    let timer
    const ch = supabase.channel('tareas-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tareas' }, () => { clearTimeout(timer); timer = setTimeout(cargar, 150) })
      .subscribe()
    return () => { clearTimeout(timer); supabase.removeChannel(ch) }
  }, [cargar])

  const registrarAccion = (tipo, anterior, nuevo) => {
    hist.current.push({ tipo, anterior, nuevo })
    if (hist.current.length > 5) hist.current.shift()
    redo.current = []
  }

  // Motor de Undo/Redo y Escape Unificado
  useEffect(() => {
    const onKey = async (e) => {
      if (e.key === 'Escape') {
        if (edit) {
          setEdit(null); setShowDeps(false);
        } else if (abierta) {
          cerrarTarjeta(abierta);
        }
        return;
      }
      if (!edit && e.ctrlKey && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          const accion = redo.current.pop()
          if (!accion) return
          hist.current.push(accion)
          if (accion.tipo === 'update') await supabase.from('tareas').update(accion.nuevo).eq('id', accion.nuevo.id)
          cargar()
        } else {
          const accion = hist.current.pop()
          if (!accion) return
          redo.current.push(accion)
          if (accion.tipo === 'update') await supabase.from('tareas').update(accion.anterior).eq('id', accion.anterior.id)
          cargar()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [edit, abierta, cargar])

  // Detector de clic afuera para condensar la tarjeta
  useEffect(() => {
    if (!abierta) return;
    const handleClickOutside = (e) => {
      // Si el clic es dentro de una tarjeta, un modal, o los filtros, lo ignoramos
      if (e.target.closest('article') || e.target.closest('[role="dialog"]') || e.target.closest('.filter-pill')) return;
      cerrarTarjeta(abierta);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [abierta]);

  const cerrarTarjeta = (idCierre) => {
    if (!idCierre) return;
    setCerrando(idCierre);
    setTimeout(() => {
      setAbierta(null);
      setCerrando(null);
    }, 400); // El número se ajusta solo acá
  };

  const toggleTarjeta = (id) => {
    if (abierta === id) {
      cerrarTarjeta(id);
    } else {
      if (abierta) cerrarTarjeta(abierta);
      setAbierta(id);
    }
  }

  const porId = useMemo(() => Object.fromEntries(tareas.map(t => [t.id, t])), [tareas])
  const bloqueos = t => (t.depende_de || []).map(id => porId[id]).filter(d => d && d.estado !== 'Completada')

  const visibles = tareas.filter(t => {
    const resp = t.responsable || []
    const matchResp = fResp.length === 0 || fResp.some(r => resp.includes(r))
    const matchPrio = fPrio.length === 0 || fPrio.includes(t.prioridad)
    const isBlocked = bloqueos(t).length > 0 && t.estado !== 'Completada'
    const matchBloq = fBloq.length === 0 || (fBloq.includes('Blocked') && isBlocked) || (fBloq.includes('Available') && !isBlocked)
    return matchResp && matchPrio && matchBloq
  })

  const dependenciasResaltadas = useMemo(() => {
    const activa = abierta || hoveredCard;
    return activa ? (porId[activa]?.depende_de || []) : [];
  }, [abierta, hoveredCard, porId])

  const cambiar = async (id, campo, valor) => {
    const anterior = { ...porId[id] }
    setTareas(ts => ts.map(t => t.id === id ? { ...t, [campo]: valor } : t))
    registrarAccion('update', anterior, { ...anterior, [campo]: valor })
    const { error } = await supabase.from('tareas').update({ [campo]: valor }).eq('id', id)
    if (error) { setErr(error.message); cargar() }
  }

  const toggleResponsable = (id, actualArr, valorAAlternar) => {
    let nuevo = [...(actualArr || [])]
    if (valorAAlternar === 'Sin asignar') nuevo = ['Sin asignar']
    else {
      nuevo = nuevo.filter(r => r !== 'Sin asignar')
      if (nuevo.includes(valorAAlternar)) nuevo = nuevo.filter(r => r !== valorAAlternar)
      else nuevo.push(valorAAlternar)
      if (nuevo.length === 0) nuevo = ['Sin asignar']
    }
    cambiar(id, 'responsable', nuevo)
  }

  const soltar = async (id, estado, antesDe) => {
    if (antesDe === id) return
    const anterior = { ...porId[id] }
    const col = ordenar(tareas.filter(t => t.estado === estado && t.id !== id), orden[estado])
    let i = antesDe ? col.findIndex(t => t.id === antesDe) : col.length
    if (i < 0) i = col.length
    col.splice(i, 0, porId[id])

    const cambios = col.map((t, k) => ({ id: t.id, estado, posicion: k + 1 }))
    const reales = cambios.filter(c => porId[c.id].posicion !== c.posicion || porId[c.id].estado !== c.estado)

    setTareas(ts => ts.map(t => { const c = cambios.find(x => x.id === t.id); return c ? { ...t, ...c } : t }))
    setOrden(o => ({ ...o, [estado]: 'custom' }))
    setSoltado(id)
    setTimeout(() => setSoltado(null), 600)

    const dataNueva = cambios.find(c => c.id === id)
    if (dataNueva) registrarAccion('update', anterior, { ...anterior, ...dataNueva })

    const res = await Promise.all(reales.map(c => supabase.from('tareas').update({ estado: c.estado, posicion: c.posicion }).eq('id', c.id)))
    if (res.find(r => r.error)) cargar()
  }

  const guardar = async () => {
    const { id, created_at, posicion, ...campos } = edit
    if (!campos.titulo.trim()) return
    const anterior = id ? { ...porId[id] } : null

    if (id) {
      registrarAccion('update', anterior, edit)
      await supabase.from('tareas').update(campos).eq('id', id)
    } else {
      await supabase.from('tareas').insert(campos)
    }
    setEdit(null); setShowDeps(false); cargar()
  }

  const borrar = async () => {
    if (!confirm('Are you sure you want to delete this task?')) return
    await supabase.from('tareas').delete().eq('id', edit.id)
    await Promise.all(tareas.filter(t => t.depende_de?.includes(edit.id))
      .map(t => supabase.from('tareas').update({ depende_de: t.depende_de.filter(x => x !== edit.id) }).eq('id', t.id)))
    setEdit(null); setShowDeps(false); cargar()
  }

  const addSubtarea = () => setEdit({ ...edit, subtareas: [...(edit.subtareas || []), { id: Date.now(), txt: '', req: 'Alén', hecha: false }] })

  const hechas = tareas.filter(t => t.estado === 'Completada').length
  const pct = tareas.length ? Math.round((hechas / tareas.length) * 100) : 0

  return (
    <main className="mx-auto max-w-[90rem] px-4 pb-12 pt-4 sm:px-6 min-h-screen">
      <style>{`
        @keyframes ripple-wave { 0% { transform: translate(-50%, -50%) scale(0); opacity: 0.8; } 100% { transform: translate(-50%, -50%) scale(2.5); opacity: 0; } }
        @keyframes ripple-wave-reverse { 0% { transform: translate(-50%, -50%) scale(2.5); opacity: 0; } 50% { opacity: 0.3; } 100% { transform: translate(-50%, -50%) scale(0); opacity: 0; } }
        .animate-ripple { animation: ripple-wave 0.4s ease-out forwards; }
        .animate-ripple-reverse { animation: ripple-wave-reverse 0.4s ease-in forwards; }
      `}</style>

      {/* HEADER con Barra de Progreso Restaurada */}
      <header className="relative z-[70] mx-auto mb-10 max-w-7xl rounded-2xl border border-cyan-500/30 bg-slate-900/40 px-6 py-5 backdrop-blur-xl shadow-[0_0_30px_#06b6d415]">
        <div className="flex flex-wrap items-center gap-6">
          <div className="min-w-0 flex-1 flex items-center gap-4">
            <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-cyan-500/50 shadow-[0_0_20px_#06b6d440] overflow-hidden">
              <img src="/logo.jpg" alt="Logo" className="h-full w-full object-cover" />
              <div className="absolute -inset-0.5 rounded-xl border border-cyan-400/30 blur-sm mix-blend-screen pointer-events-none"></div>
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyan-100 to-cyan-400">DRUMMETRICS</h1>
              <p className="text-[10px] font-mono tracking-[0.2em] text-cyan-500 uppercase mt-1">Shared Task Board</p>
            </div>
          </div>
          <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto sm:justify-end">
            <div className="flex gap-2 p-1.5 rounded-xl bg-slate-950/50 border border-cyan-900/50 backdrop-blur-md">
              <FiltroMultiple label="Assignee" opciones={PERSONAS} seleccionados={fResp} setSeleccionados={setFResp} />
              <FiltroMultiple label="Priority" opciones={PRIOS} seleccionados={fPrio} setSeleccionados={setFPrio} />
              <FiltroMultiple label="Status" opciones={['Blocked', 'Available']} seleccionados={fBloq} setSeleccionados={setFBloq} />
            </div>
            <button type="button" onClick={() => setEdit({ ...vacia })} className="btn-primary ml-2 shrink-0">+ NEW TASK</button>
          </div>
        </div>

        {/* Restauración de la Barra de Progreso General */}
        <div className="mt-5 border-t border-cyan-900/50 pt-4">
          <div className="flex items-center gap-4">
            <span className="text-xs font-mono text-cyan-400/80">{hechas} / {tareas.length}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-950/80 border border-slate-800">
              <div className="relative h-full rounded-full bg-gradient-to-r from-cyan-600 to-cyan-300 transition-all duration-500 shadow-[0_0_10px_#22d3ee]" style={{ width: `${pct}%` }}>
                <div className="absolute inset-0 bg-white/20 w-full animate-[shimmer_2s_infinite]"></div>
              </div>
            </div>
            <span className="text-xs font-bold text-cyan-300 drop-shadow-[0_0_5px_#22d3ee]">{pct}%</span>
          </div>
        </div>
      </header>

      {/* KANBAN BOARD */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {ESTADOS.map(estado => {
          const col = COL_ESTADO[estado]
          const lista = ordenar(visibles.filter(t => t.estado === estado), orden[estado])
          return (
            <section key={estado}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { const id = e.dataTransfer.getData('id'); if (id) soltar(id, estado, null) }}
              className={`flex min-h-[25rem] flex-col rounded-2xl border border-cyan-500/20 bg-slate-900/20 p-3 shadow-[0_0_20px_rgba(0,0,0,0.5)] backdrop-blur-xl border-t-[4px] transition-all ${col.bar}`}>
              {/* Restauración del Botón Sort */}
              <div className="mb-5 flex items-center gap-3 px-2 pt-2">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${col.dot}`} aria-hidden />
                <h2 className={`text-xs font-bold tracking-widest ${col.head}`}>
                  {lb(estado).toUpperCase()}
                </h2>
                <span className="ml-1 rounded-md bg-slate-950/60 border border-cyan-900/50 px-2 py-0.5 text-xs font-mono text-cyan-400 shadow-inner">{lista.length}</span>  <div className="ml-auto relative flex items-center bg-transparent text-cyan-500/60 hover:text-cyan-300 transition-colors">
                  <span className="mr-1 text-[10px]" aria-hidden>⇅</span>
                  <select value={orden[estado] || 'prio'} onChange={e => setOrden({ ...orden, [estado]: e.target.value })} className="w-auto cursor-pointer appearance-none bg-transparent text-xs font-semibold focus:outline-none pr-3">
                    <option className="bg-slate-900" value="prio">Priority</option>
                    <option className="bg-slate-900" value="resp">Assignee</option>
                    <option className="bg-slate-900" value="custom">Custom</option>
                  </select>
                </div>
              </div>

              <div ref={animRefs[estado]} className="flex flex-1 flex-col gap-3 relative min-h-[100px]">
                {lista.map(t => {
                  const bl = t.estado !== 'Completada' ? bloqueos(t) : []
                  const subs = t.subtareas || []
                  const subHechas = subs.filter(s => s.hecha).length
                  const isHighlighted = dependenciasResaltadas.includes(t.id)
                  const isDimmed = dependenciasResaltadas.length > 0 && abierta !== t.id && hoveredCard !== t.id && !isHighlighted

                  // ACÁ ESTABA EL ERROR: Separamos el estado de Clic del estado de Hover
                  const isClicked = abierta === t.id;
                  const isCardExpanded = abierta === t.id || hoveredCard === t.id;

                  return (
                    <article key={t.id}
                      onMouseEnter={() => setHoveredCard(t.id)} onMouseLeave={() => setHoveredCard(null)}
                      onDragOver={e => { e.preventDefault(); const y = e.clientY - e.currentTarget.getBoundingClientRect().top; setSobre(y < e.currentTarget.getBoundingClientRect().height / 2 ? t.id : (lista[lista.findIndex(x => x.id === t.id) + 1]?.id || `col_${estado}`)) }}
                      onDragLeave={() => setSobre(null)}
                      onDrop={e => { e.preventDefault(); e.stopPropagation(); setSobre(null); const id = e.dataTransfer.getData('id'); if (id) soltar(id, estado, sobre === `col_${estado}` ? null : sobre) }}
                      onClick={() => toggleTarjeta(t.id)}
                      onDragStart={e => { e.currentTarget.style.opacity = '0.3'; e.dataTransfer.setData('id', t.id) }}
                      onDragEnd={e => { e.currentTarget.style.opacity = ''; setSobre(null) }}
                      style={{ borderLeftStyle: bl.length > 0 && !isHighlighted ? 'dashed' : 'solid' }}
                      className={`relative group cursor-pointer rounded-xl border border-l-[4px] p-4 backdrop-blur-md transition-colors transition-shadow duration-500 ease-out                      ${t.prioridad === 'Alta' ? 'border-l-red-500' : t.prioridad === 'Media' ? 'border-l-amber-500' : 'border-l-emerald-500'} 
                      ${isHighlighted ? 'ring-2 ring-orange-500 bg-orange-950/20' : ''}
                      ${sobre === t.id ? 'z-40 brightness-110' : 'z-10 hover:z-30 hover:-translate-y-1'}
                      ${isDimmed ? 'opacity-30 grayscale-[50%]' : 'opacity-100'}
                      ${isCardExpanded && !isHighlighted ? 'border-t-cyan-400 border-r-cyan-400 border-b-cyan-400 bg-cyan-950/40 shadow-[0_0_20px_rgba(6,182,212,0.15)]' : 'border-t-transparent border-r-transparent border-b-transparent bg-slate-950/60'}`}
                    >
                      {/* Animación del clic y la condensación */}
                      <div className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none z-0">
                        {isClicked && <span className="absolute top-1/2 left-1/2 w-[150%] aspect-square bg-cyan-400/20 rounded-full animate-ripple transform -translate-x-1/2 -translate-y-1/2"></span>}
                        {cerrando === t.id && <span className="absolute top-1/2 left-1/2 w-[150%] aspect-square bg-cyan-400/20 rounded-full animate-ripple-reverse transform -translate-x-1/2 -translate-y-1/2"></span>}
                      </div>

                      <div className="relative z-10">
                        {/* Línea de drag and drop */}
                        {sobre === t.id && <div className="absolute -top-[14px] left-0 right-0 h-[3px] rounded-full bg-cyan-400 shadow-[0_0_15px_#22d3ee] z-[60] pointer-events-none"></div>}

                        {/* NUEVO CANDADO EXPANDIBLE (SE ILUMINA EN NARANJA) */}
                        {bl.length > 0 && (
                          <div className="mb-3">
                            <div className={`relative inline-flex items-center h-6 px-1.5 rounded-full transition-all duration-300 ease-out ${isCardExpanded ? 'w-auto px-2.5 bg-orange-950/20 border border-orange-500/50 shadow-[0_0_12px_rgba(249,115,22,0.3)]' : 'bg-slate-900/60 border border-slate-700/50'}`}>
                              <span className={`shrink-0 flex items-center justify-center transition-colors duration-300 ${isCardExpanded ? 'text-orange-500 drop-shadow-[0_0_5px_rgba(249,115,22,0.6)]' : 'text-slate-500'}`}>
                                <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3"><path fillRule="evenodd" d="M12 1.5a5.25 5.25 0 00-5.25 5.25v3a3 3 0 00-3 3v6.75a3 3 0 003 3h10.5a3 3 0 003-3v-6.75a3 3 0 00-3-3v-3c0-2.9-2.35-5.25-5.25-5.25zm3.75 8.25v-3a3.75 3.75 0 10-7.5 0v3h7.5z" clipRule="evenodd" /></svg>
                              </span>
                              <span className={`overflow-hidden whitespace-nowrap transition-all duration-300 ease-out font-bold tracking-wider text-slate-300 text-[10px] ${isCardExpanded ? 'max-w-[200px] opacity-100 ml-1.5' : 'max-w-0 opacity-0 ml-0'}`}>
                                BLOCKED BY: {bl.map(b => b.titulo).join(', ')}
                              </span>
                            </div>
                          </div>
                        )}

                        <div className="flex items-start gap-3">
                          <span draggable title="Drag to move" onClick={e => e.stopPropagation()} onDragEnd={() => setSobre(null)} onDragStart={e => e.dataTransfer.setData('id', t.id)} className="mt-0.5 cursor-grab select-none text-slate-600 hover:text-cyan-400">⠿</span>
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm font-semibold transition-colors duration-300 ${bl.length > 0 ? 'text-slate-400 group-hover:text-slate-200' : 'text-slate-100 group-hover:text-cyan-50'}`}>{t.titulo}</p>
                            {subs.length > 0 && <p className="mt-1.5 text-[9px] font-mono tracking-widest text-cyan-400 uppercase">Subtasks: {subHechas}/{subs.length}</p>}
                          </div>

                          {/* LÁPIZ NARANJA: Brilla únicamente si isCardExpanded es true (Hover o Clic) */}
                          <button type="button" onClick={e => { e.stopPropagation(); setEdit(t) }}
                            className={`rounded-lg p-1.5 text-sm transition-all duration-300 hover:bg-orange-950/40 hover:scale-110 ${isCardExpanded ? 'opacity-100 drop-shadow-[0_0_5px_rgba(249,115,22,0.6)]' : 'opacity-30'}`}>
                            ✏️
                          </button>
                        </div>

                        <div className="mt-4 flex w-full items-center">
                          <Chip valor={t.prioridad} opciones={PRIOS} onPick={v => cambiar(t.id, 'prioridad', v)} isExpanded={isCardExpanded} />
                          <div className="ml-auto flex gap-1">
                            {(t.responsable || ['Sin asignar']).map(r => (
                              <Chip key={r} valor={r} opciones={PERSONAS} onPick={v => toggleResponsable(t.id, t.responsable, v)} tipo="responsable" />
                            ))}
                          </div>
                        </div>

                        {isCardExpanded && (
                          <div className="mt-4 border-t border-cyan-900/30 pt-3">
                            <div className="text-xs text-slate-300 font-light">
                              {t.notas ? <p className="whitespace-pre-wrap leading-relaxed">{t.notas}</p> : <span className="italic text-slate-600">No details provided.</span>}
                            </div>

                            {subs.length > 0 && (
                              <ul className="mt-3 space-y-1.5 border-t border-cyan-900/20 pt-3">
                                {subs.map(s => (
                                  <li key={s.id} className="flex items-start gap-2 text-[11px] font-medium">
                                    <span className={`shrink-0 mt-0.5 ${s.hecha ? 'text-emerald-400 drop-shadow-[0_0_3px_#34d399]' : 'text-slate-600'}`}>
                                      {s.hecha ? '✓' : '○'}
                                    </span>
                                    <span className={`flex-1 ${s.hecha ? 'line-through opacity-50 text-slate-400' : 'text-slate-200'}`}>
                                      {s.txt} <span className="opacity-50 font-mono tracking-widest ml-1 text-[9px]">[{s.req.charAt(0)}]</span>
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>
                    </article>
                  )
                })}
                {sobre === `col_${estado}` && <div className="h-[3px] mt-2 rounded-full bg-cyan-400 shadow-[0_0_15px_#22d3ee] pointer-events-none"></div>}
              </div>
            </section>
          )
        })}
      </div>

      {edit && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-xl" onClick={() => { setEdit(null); setShowDeps(false) }}>
          <div className="relative flex flex-col w-full max-w-2xl max-h-[90vh] rounded-2xl border border-cyan-500/40 bg-slate-900/95 shadow-[0_0_40px_rgba(6,182,212,0.2)]" onClick={e => e.stopPropagation()}>
            <div className="shrink-0 p-6 border-b border-cyan-900/50">
              <h2 className="text-xl font-bold tracking-widest text-cyan-100">{edit.id ? 'UPDATE_MODULE' : 'INITIALIZE_TASK'}</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-cyan-900 scrollbar-track-transparent">
              <Campo label="DESIGNATION">
                <input autoFocus value={edit.titulo} onChange={e => setEdit({ ...edit, titulo: e.target.value })} className="inp text-lg font-bold" />
              </Campo>
              <div className="grid grid-cols-3 gap-4">
                <Campo label="STATUS">
                  <select value={edit.estado} onChange={e => setEdit({ ...edit, estado: e.target.value })} className="inp">{ESTADOS.map(o => <option key={o} value={o}>{lb(o)}</option>)}</select>
                </Campo>
                <Campo label="PRIORITY">
                  <select value={edit.prioridad} onChange={e => setEdit({ ...edit, prioridad: e.target.value })} className="inp">{PRIOS.map(o => <option key={o} value={o}>{lb(o)}</option>)}</select>
                </Campo>
                <Campo label="MODULE">
                  <input list="modulos" value={edit.modulo} onChange={e => setEdit({ ...edit, modulo: e.target.value })} className="inp" />
                  <datalist id="modulos">{[...new Set(tareas.map(t => t.modulo).filter(Boolean))].map(m => <option key={m} value={m} />)}</datalist>
                </Campo>
              </div>
              <Campo label="PARAMETERS / DESCRIPTION">
                <textarea rows={3} value={edit.notas} onChange={e => setEdit({ ...edit, notas: e.target.value })} className="inp resize-y text-slate-300" placeholder="Enter task details..." />
              </Campo>
              <div className="space-y-2">
                <label className="flex items-center justify-between text-[10px] font-mono tracking-widest text-cyan-500/80 border-b border-cyan-900/30 pb-2">
                  SUBTASKS CHECKLIST
                  <button type="button" onClick={addSubtarea} className="text-cyan-400 hover:text-cyan-200">+ ADD</button>
                </label>
                {(edit.subtareas || []).map((st, idx) => (
                  <div key={st.id} className="flex items-center gap-2 bg-slate-950/50 p-2 rounded-lg border border-cyan-900/30">
                    <input type="checkbox" checked={st.hecha} onChange={e => { const copy = [...edit.subtareas]; copy[idx].hecha = e.target.checked; setEdit({ ...edit, subtareas: copy }) }} className="rounded border-cyan-700 bg-slate-900 text-cyan-500" />
                    <input value={st.txt} onChange={e => { const copy = [...edit.subtareas]; copy[idx].txt = e.target.value; setEdit({ ...edit, subtareas: copy }) }} className="flex-1 bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-600" placeholder="Task item..." />
                    <select value={st.req} onChange={e => { const copy = [...edit.subtareas]; copy[idx].req = e.target.value; setEdit({ ...edit, subtareas: copy }) }} className="bg-slate-900 border border-slate-700 text-xs rounded p-1 text-slate-400 outline-none">
                      <option value="Alén">A</option><option value="John">J</option>
                    </select>
                    <button type="button" onClick={() => { const copy = edit.subtareas.filter((_, i) => i !== idx); setEdit({ ...edit, subtareas: copy }) }} className="text-red-500/50 hover:text-red-400 px-1">✕</button>
                  </div>
                ))}
              </div>
              <div className="space-y-2 pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-[10px] font-mono tracking-widest text-cyan-500/80">
                  <input type="checkbox" checked={showDeps} onChange={e => setShowDeps(e.target.checked)} className="rounded border-cyan-700 bg-slate-900 text-cyan-500" />
                  LINK DEPENDENCIES
                </label>
                {showDeps && (
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-cyan-900/50 bg-slate-950/50 p-2 text-sm shadow-inner mt-2">
                    {tareas.filter(t => t.id !== edit.id).map(t => (
                      <label key={t.id} className="flex items-center gap-3 p-1.5 rounded hover:bg-cyan-950/40 cursor-pointer text-slate-300">
                        <input type="checkbox" checked={edit.depende_de.includes(t.id)}
                          onChange={e => setEdit({ ...edit, depende_de: e.target.checked ? [...edit.depende_de, t.id] : edit.depende_de.filter(x => x !== t.id) })}
                          className="rounded border-cyan-700 bg-slate-900 text-cyan-500" />
                        <span className="truncate">{t.titulo}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="shrink-0 flex gap-2 border-t border-cyan-900/50 p-6 bg-slate-900/95 rounded-b-2xl">
              {edit.id && (
                <button type="button" onClick={borrar} className="rounded-lg px-4 py-2 text-sm font-bold tracking-wide text-red-400 bg-red-950/40 border border-red-500/30 hover:bg-red-900/60 transition">
                  DELETE
                </button>
              )}
              <div className="ml-auto flex gap-3">
                <button type="button" onClick={() => { setEdit(null); setShowDeps(false) }} className="btn-ghost text-slate-300 hover:text-white">CANCEL</button>
                <button type="button" onClick={guardar} className="btn-primary">SAVE</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function Campo({ label, children }) {
  return <label className="block text-[10px] font-mono tracking-widest text-cyan-500/80 mb-1.5">{label}<div className="mt-1.5 font-sans">{children}</div></label>
}

function FiltroMultiple({ label, opciones, seleccionados, setSeleccionados }) {
  const [isHovered, setIsHovered] = useState(false)
  const [isClicked, setIsClicked] = useState(false)
  const ref = useRef(null)
  const open = isHovered || isClicked;

  useEffect(() => {
    if (!open) return
    const cerrar = e => { if (!ref.current?.contains(e.target)) { setIsClicked(false); setIsHovered(false) } }
    document.addEventListener('mousedown', cerrar)
    return () => document.removeEventListener('mousedown', cerrar)
  }, [open])

  const toggleOption = (opcion) => {
    if (seleccionados.includes(opcion)) setSeleccionados(seleccionados.filter(item => item !== opcion))
    else setSeleccionados([...seleccionados, opcion])
  }

  const activos = seleccionados.length > 0;
  return (
    <div ref={ref} className="relative" onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      <button type="button" onClick={() => setIsClicked(!isClicked)} className={`filter-pill ${activos ? 'filter-pill-active' : 'filter-pill-idle'}`}>
        {label} {activos && <span className="ml-1 rounded-full bg-cyan-400 text-slate-900 px-1.5 py-0.5 text-[9px]">{seleccionados.length}</span>}
        <span className="ml-1 text-[10px]">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-2 z-[60] w-48 rounded-xl border border-cyan-500/30 bg-slate-900/95 p-2 shadow-[0_0_20px_rgba(6,182,212,0.3)] backdrop-blur-xl">
          <button onClick={() => setSeleccionados([])} className={`w-full text-left px-3 py-1.5 rounded-md text-xs font-semibold mb-1 transition-colors ${!activos ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:bg-slate-800'}`}>All (Clear filter)</button>
          <div className="h-px bg-slate-700/50 my-1"></div>
          {opciones.map(o => {
            const isActive = seleccionados.includes(o);
            return (
              <label key={o} className="flex items-center gap-3 px-3 py-1.5 rounded-md hover:bg-slate-800 cursor-pointer text-xs text-slate-200 transition-colors group">
                <input type="checkbox" className="hidden" checked={isActive} onChange={() => toggleOption(o)} />
                <div className={`w-3 h-3 shrink-0 rounded-full border transition-all duration-300 flex items-center justify-center ${isActive ? 'bg-cyan-500/20 border-cyan-400 shadow-[0_0_8px_#22d3ee]' : 'bg-slate-900 border-slate-600 group-hover:border-cyan-700'}`}>
                  {isActive && <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full shadow-[0_0_5px_#22d3ee]"></div>}
                </div>
                {lb(o)}
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Chip({ valor, opciones, onPick, tipo, isExpanded }) {
  const [isHovered, setIsHovered] = useState(false)
  const [isClicked, setIsClicked] = useState(false)
  const ref = useRef(null)
  const open = isHovered || isClicked;

  useEffect(() => {
    if (!open) return
    const cerrar = e => { if (!ref.current?.contains(e.target)) { setIsClicked(false); setIsHovered(false) } }
    document.addEventListener('mousedown', cerrar)
    return () => document.removeEventListener('mousedown', cerrar)
  }, [open])

  if (tipo === 'responsable') {
    return (
      <div ref={ref} className="relative z-50 inline-block" onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)} onClick={e => e.stopPropagation()}>
        <button type="button" onClick={() => setIsClicked(!isClicked)} className={`rounded-md px-2.5 py-1 text-[10px] font-bold tracking-wider transition-all hover:brightness-125 focus:outline-none ${COLORES[valor]}`}>
          {lb(valor).toUpperCase()}
        </button>
        {open && (
          <ul className="absolute right-0 mt-2 flex w-max flex-col gap-1 rounded-xl border border-cyan-500/30 bg-slate-900/95 p-2 shadow-[0_0_20px_rgba(6,182,212,0.3)] backdrop-blur-xl z-[999]">
            {opciones.map(o => (
              <li key={o}>
                <button onClick={() => { setIsClicked(false); setIsHovered(false); onPick(o) }} className={`w-full rounded-md px-3 py-1.5 text-left text-[10px] font-bold tracking-wide transition-all hover:brightness-125 ${COLORES[o]} ${o === valor ? 'ring-1 ring-cyan-400 scale-105' : 'border-transparent'}`}>
                  {lb(o).toUpperCase()}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  const dotColor = valor === 'Alta' ? 'bg-red-500 shadow-[0_0_8px_#ef4444]' : valor === 'Media' ? 'bg-amber-500 shadow-[0_0_8px_#f59e0b]' : 'bg-emerald-500 shadow-[0_0_8px_#10b981]'

  return (
    <div ref={ref} className="relative z-50 inline-block" onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)} onClick={e => e.stopPropagation()}>
      <button type="button" onClick={() => setIsClicked(!isClicked)} className={`relative flex items-center h-6 px-1.5 rounded-full transition-all duration-300 ease-out focus:outline-none ${isExpanded ? 'w-auto px-2.5 border border-cyan-400/50 bg-slate-900/90 shadow-[0_0_12px_rgba(6,182,212,0.3)]' : 'bg-slate-900/60 border border-cyan-500/20'}`}>
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 transition-transform duration-300 ${isExpanded ? 'scale-95' : ''} ${dotColor}`} />
        <span className={`overflow-hidden whitespace-nowrap transition-all duration-300 ease-out font-bold tracking-wider text-slate-200 text-[10px] ${isExpanded ? 'max-w-[100px] opacity-100 ml-1.5' : 'max-w-0 opacity-0 ml-0'}`}>
          {lb(valor).toUpperCase()}
        </span>
      </button>
      {open && (
        <ul className="absolute left-0 mt-2 flex w-max flex-col gap-1 rounded-xl border border-cyan-500/30 bg-slate-900/95 p-2 shadow-[0_0_20px_rgba(6,182,212,0.3)] backdrop-blur-xl z-[999]">
          {opciones.map(o => (
            <li key={o}>
              <button onClick={() => { setIsClicked(false); setIsHovered(false); if (o !== valor) onPick(o) }} className={`w-full rounded-md px-3 py-1.5 text-left text-[10px] font-bold tracking-wide transition-all hover:brightness-125 ${COLORES[o]} ${o === valor ? 'ring-1 ring-cyan-400 scale-105' : 'border-transparent'}`}>
                {lb(o).toUpperCase()}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}