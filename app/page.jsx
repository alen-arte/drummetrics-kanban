'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

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
  const f = modo === 'resp' ? (a, b) => RR[a.responsable] - RR[b.responsable] || RP[a.prioridad] - RP[b.prioridad] || pos(a, b)
    : modo === 'custom' ? pos
      : (a, b) => RP[a.prioridad] - RP[b.prioridad] || pos(a, b)
  return [...arr].sort(f)
}
const L = { Pendiente: 'To-do', 'En Proceso': 'In progress', 'Listo para revisión': 'Ready for review', Completada: 'Done', Alta: 'High', Media: 'Medium', Baja: 'Low', 'Sin asignar': 'Unassigned' }
const lb = v => L[v] || v
const vacia = { titulo: '', modulo: '', estado: 'Pendiente', prioridad: 'Media', responsable: 'Sin asignar', depende_de: [], notas: '' }

const COL_ESTADO = {
  Pendiente: { dot: 'bg-slate-400 shadow-[0_0_8px_#94a3b8]', bar: 'border-t-slate-500/50', head: 'text-slate-300' },
  'En Proceso': { dot: 'bg-cyan-400 shadow-[0_0_8px_#22d3ee]', bar: 'border-t-cyan-500/70 shadow-[0_-5px_15px_#06b6d420]', head: 'text-cyan-300' },
  'Listo para revisión': { dot: 'bg-purple-400 shadow-[0_0_8px_#c084fc]', bar: 'border-t-purple-500/70 shadow-[0_-5px_15px_#a855f720]', head: 'text-purple-300' },
  Completada: { dot: 'bg-emerald-400 shadow-[0_0_8px_#34d399]', bar: 'border-t-emerald-500/70 shadow-[0_-5px_15px_#10b98120]', head: 'text-emerald-300' },
}
const PRIO_BORDER = { Alta: 'border-l-red-500 shadow-[-2px_0_8px_#ef444440]', Media: 'border-l-amber-500 shadow-[-2px_0_8px_#f59e0b40]', Baja: 'border-l-emerald-500 shadow-[-2px_0_8px_#10b98140]' }

export default function Page() {
  const [tareas, setTareas] = useState([])
  const [edit, setEdit] = useState(null)
  const [err, setErr] = useState(null)
  const [orden, setOrden] = useState({})
  const [sobre, setSobre] = useState(null)
  const [abierta, setAbierta] = useState(null)
  const [soltado, setSoltado] = useState(null)
  const [hoveredCard, setHoveredCard] = useState(null)

  const [fResp, setFResp] = useState([])
  const [fPrio, setFPrio] = useState([])
  const [fBloq, setFBloq] = useState([])

  const cargar = async () => {
    const { data, error } = await supabase.from('tareas').select('*').order('created_at')
    if (error) setErr(error.message)
    else { setErr(null); setTareas(data) }
  }

  useEffect(() => {
    cargar()
    let timer
    const ch = supabase.channel('tareas-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tareas' }, () => { clearTimeout(timer); timer = setTimeout(cargar, 150) })
      .subscribe()
    return () => { clearTimeout(timer); supabase.removeChannel(ch) }
  }, [])

  useEffect(() => {
    if (!edit) return
    const onKey = e => { if (e.key === 'Escape') setEdit(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [edit])

  const porId = useMemo(() => Object.fromEntries(tareas.map(t => [t.id, t])), [tareas])
  const bloqueos = t => (t.depende_de || []).map(id => porId[id]).filter(d => d && d.estado !== 'Completada')

  const visibles = tareas.filter(t => {
    const matchResp = fResp.length === 0 || fResp.includes(t.responsable)
    const matchPrio = fPrio.length === 0 || fPrio.includes(t.prioridad)
    const isBlocked = bloqueos(t).length > 0 && t.estado !== 'Completada'
    const matchBloq = fBloq.length === 0 || (fBloq.includes('Blocked') && isBlocked) || (fBloq.includes('Available') && !isBlocked)
    return matchResp && matchPrio && matchBloq
  })

  const dependenciasResaltadas = useMemo(() => {
    const activa = abierta || hoveredCard;
    if (!activa) return [];
    return porId[activa]?.depende_de || [];
  }, [abierta, hoveredCard, porId])

  const cambiar = async (id, campo, valor) => {
    setTareas(ts => ts.map(t => t.id === id ? { ...t, [campo]: valor } : t))
    const { error } = await supabase.from('tareas').update({ [campo]: valor }).eq('id', id)
    if (error) { setErr(error.message); cargar() }
  }

  const soltar = async (id, estado, antesDe) => {
    if (antesDe === id) return
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

    const res = await Promise.all(reales.map(c => supabase.from('tareas').update({ estado: c.estado, posicion: c.posicion }).eq('id', c.id)))
    const fallo = res.find(r => r.error)
    if (fallo) { setErr(fallo.error.message); cargar() }
  }

  const guardar = async () => {
    const { id, created_at, posicion, ...campos } = edit
    if (!campos.titulo.trim()) return
    const { error } = id
      ? await supabase.from('tareas').update(campos).eq('id', id)
      : await supabase.from('tareas').insert(campos)
    if (error) return setErr(error.message)
    setEdit(null); cargar()
  }

  const borrar = async () => {
    if (!confirm('Delete this task?')) return
    await supabase.from('tareas').delete().eq('id', edit.id)
    await Promise.all(tareas.filter(t => t.depende_de?.includes(edit.id))
      .map(t => supabase.from('tareas').update({ depende_de: t.depende_de.filter(x => x !== edit.id) }).eq('id', t.id)))
    setEdit(null); cargar()
  }

  const hechas = tareas.filter(t => t.estado === 'Completada').length
  const pct = tareas.length ? Math.round((hechas / tareas.length) * 100) : 0

  return (
    <main className="mx-auto max-w-[90rem] px-4 pb-12 pt-4 sm:px-6 min-h-screen">
      <header className="relative z-[70] mx-auto mb-10 max-w-7xl rounded-2xl border border-cyan-500/30 bg-slate-900/40 px-6 py-5 backdrop-blur-xl shadow-[0_0_30px_#06b6d415]">
        <div className="flex flex-wrap items-center gap-6">
          <div className="min-w-0 flex-1 flex items-center gap-4">
            <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-cyan-500/50 shadow-[0_0_20px_#06b6d440] overflow-hidden">
              <img src="/logo.jpg" alt="DrumMetrics Logo" className="h-full w-full object-cover" />
              <div className="absolute -inset-0.5 rounded-xl border border-cyan-400/30 blur-sm mix-blend-screen pointer-events-none"></div>
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyan-100 to-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.4)]">DRUMMETRICS</h1>
              <div className="flex items-center gap-3 mt-1">
                <p className="text-[10px] font-mono tracking-[0.2em] text-cyan-500 uppercase">Shared Task Board</p>
                <div className="h-px flex-1 bg-gradient-to-r from-cyan-500/50 to-transparent min-w-[50px]"></div>
              </div>
            </div>
          </div>

          <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto sm:justify-end">
            <div className="flex gap-2 p-1.5 rounded-xl bg-slate-950/50 border border-cyan-900/50 backdrop-blur-md">
              <FiltroMultiple label="Assignee" opciones={PERSONAS} seleccionados={fResp} setSeleccionados={setFResp} />
              <FiltroMultiple label="Priority" opciones={PRIOS} seleccionados={fPrio} setSeleccionados={setFPrio} />
              <FiltroMultiple label="Status" opciones={['Blocked', 'Available']} seleccionados={fBloq} setSeleccionados={setFBloq} />
            </div>
            <button type="button" onClick={() => setEdit({ ...vacia })} className="btn-primary ml-2 shrink-0 tracking-wide">+ NEW TASK</button>
          </div>
        </div>

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

      {err && (
        <p className="mx-auto mb-6 max-w-7xl flex items-start gap-2 rounded-xl border border-red-500/50 bg-red-950/40 px-4 py-3 text-sm text-red-200 backdrop-blur-md shadow-[0_0_15px_#ef444433]" role="alert">
          <span aria-hidden>⚠</span><span>{err}</span>
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {ESTADOS.map(estado => {
          const col = COL_ESTADO[estado]
          const lista = ordenar(visibles.filter(t => t.estado === estado), orden[estado])
          return (
            <section key={estado}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { const id = e.dataTransfer.getData('id'); if (id) soltar(id, estado, null) }}
              className={`flex min-h-[25rem] flex-col rounded-2xl border border-cyan-500/20 bg-slate-900/40 p-3 shadow-[0_0_20px_rgba(0,0,0,0.5)] backdrop-blur-xl border-t-[4px] transition-all ${col.bar}`}>

              <div className="mb-5 flex items-center gap-3 px-2 pt-2">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${col.dot}`} aria-hidden />
                <h2 className={`text-xs font-bold tracking-widest ${col.head}`}>
                  {lb(estado).toUpperCase()}
                </h2>
                <span className="ml-1 rounded-md bg-slate-950/60 border border-cyan-900/50 px-2 py-0.5 text-xs font-mono text-cyan-400 shadow-inner">{lista.length}</span>

                <div className="ml-auto relative flex items-center bg-transparent text-cyan-500/60 hover:text-cyan-300 transition-colors">
                  <span className="mr-1 text-[10px]" aria-hidden>⇅</span>
                  <select value={orden[estado] || 'prio'} onChange={e => setOrden({ ...orden, [estado]: e.target.value })}
                    className="w-auto cursor-pointer appearance-none bg-transparent text-xs font-semibold focus:outline-none pr-3">
                    <option className="bg-slate-900" value="prio">Priority</option>
                    <option className="bg-slate-900" value="resp">Assignee</option>
                    <option className="bg-slate-900" value="custom">Custom</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-1 flex-col gap-3 relative">
                {lista.length === 0 && (
                  <p className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-cyan-900/40 py-8 text-center text-xs font-mono text-cyan-700/50">
                    DROP MODULE HERE
                  </p>
                )}
                {lista.map(t => {
                  const bl = t.estado !== 'Completada' ? bloqueos(t) : []
                  const isHighlighted = dependenciasResaltadas.includes(t.id)
                  const isDimmed = dependenciasResaltadas.length > 0 && t.id !== abierta && t.id !== hoveredCard && !dependenciasResaltadas.includes(t.id)
                  return (
                    <article key={t.id}
                      onMouseEnter={() => setHoveredCard(t.id)}
                      onMouseLeave={() => setHoveredCard(null)}
                      onDragOver={e => {
                        e.preventDefault();
                        const rect = e.currentTarget.getBoundingClientRect();
                        const y = e.clientY - rect.top;
                        if (y < rect.height / 2) {
                          setSobre(t.id);
                        } else {
                          const idx = lista.findIndex(x => x.id === t.id);
                          setSobre(lista[idx + 1] ? lista[idx + 1].id : `col_${estado}`);
                        }
                      }}
                      onDragLeave={() => setSobre(null)}
                      onDrop={e => { e.preventDefault(); e.stopPropagation(); setSobre(null); e.currentTarget.style.opacity = ''; const id = e.dataTransfer.getData('id'); if (id) soltar(id, estado, sobre === `col_${estado}` ? null : sobre) }} onClick={() => setAbierta(abierta === t.id ? null : t.id)}

                      onDragStart={e => {
                        e.currentTarget.style.opacity = '0.3';
                        e.dataTransfer.setData('id', t.id);
                        e.dataTransfer.setDragImage(e.currentTarget, 12, 12);
                      }}
                      onDragEnd={e => {
                        e.currentTarget.style.opacity = '';
                        setSobre(null);
                      }}

                      className={`relative group cursor-pointer rounded-xl border border-l-[4px] p-4 backdrop-blur-md transition-all duration-500 ease-out hover:border-t-cyan-400 hover:border-r-cyan-400 hover:border-b-cyan-400 hover:bg-cyan-950/40 hover:shadow-[0_0_20px_rgba(6,182,212,0.15)]                      ${PRIO_BORDER[t.prioridad] || 'border-l-slate-600'} 
                      ${isHighlighted ? 'ring-2 ring-orange-500 border-orange-500/50 bg-orange-950/20 shadow-[0_0_15px_#f9731640]' : 'border-cyan-500/20'}
                      ${bl.length && !isHighlighted ? 'ring-1 ring-red-500/50 bg-red-950/20' : ''}
                      ${soltado === t.id ? 'z-[60] scale-[1.05] -translate-y-6 bg-cyan-900/90 shadow-[0_20px_40px_rgba(34,211,238,0.4)] ring-2 ring-cyan-400' : (isHighlighted ? '' : 'bg-slate-950/60')}
                      ${sobre === t.id ? "mt-12 scale-[1.02] brightness-125 z-40 before:content-[''] before:absolute before:-top-12 before:left-0 before:right-0 before:h-12 before:bg-transparent" : 'mt-0 scale-100 hover:-translate-y-1 z-10 hover:z-30 focus-within:z-30'}
                      ${isDimmed ? 'opacity-30 grayscale-[50%]' : 'opacity-100'}`}
                    >

                      {sobre === t.id && (
                        <div className="absolute -top-1.5 left-0 right-0 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_12px_#22d3ee] z-[60]"></div>
                      )}

                      {bl.length > 0 && (
                        <p className="mb-3 flex items-start gap-2 rounded-lg bg-red-950/60 border border-red-500/30 px-2.5 py-1.5 text-[11px] font-medium text-red-300 backdrop-blur-sm">
                          <span aria-hidden>🔒</span>
                          <span>BLOCKED BY: {bl.map(b => b.titulo).join(', ')}</span>
                        </p>
                      )}

                      <div className="flex items-start gap-3">
                        <span draggable title="Drag to move" onClick={e => e.stopPropagation()}
                          onDragEnd={() => setSobre(null)}
                          onDragStart={e => { e.dataTransfer.setData('id', t.id); e.dataTransfer.setDragImage(e.currentTarget.closest('article'), 12, 12) }}
                          className="mt-0.5 cursor-grab select-none text-slate-600 transition group-hover:text-cyan-400 active:cursor-grabbing">⠿</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold leading-tight text-slate-100 drop-shadow-sm group-hover:text-cyan-50 transition-colors">{t.titulo}</p>
                          {t.modulo && <p className="mt-1.5 text-[10px] font-mono tracking-widest text-cyan-600 uppercase">{t.modulo}</p>}
                        </div>
                        <button type="button" title="Edit task" onClick={e => { e.stopPropagation(); setEdit(t) }}
                          className="rounded-lg p-1.5 text-sm text-cyan-500 opacity-30 transition-all hover:bg-cyan-950 hover:text-cyan-300 hover:shadow-[0_0_10px_#06b6d433] group-hover:opacity-100">✏️</button>
                      </div>

                      <div className="mt-4 flex w-full items-center">
                        <Chip valor={t.prioridad} opciones={PRIOS} onPick={v => cambiar(t.id, 'prioridad', v)} />
                        <div className="ml-auto">
                          <Chip valor={t.responsable} opciones={PERSONAS} onPick={v => cambiar(t.id, 'responsable', v)} />
                        </div>
                      </div>

                      {(abierta === t.id || hoveredCard === t.id) && (
                        <div className="mt-4 border-t border-cyan-900/30 pt-3 text-xs text-slate-300 font-light">
                          {t.notas ? (
                            <p className="whitespace-pre-wrap leading-relaxed">{t.notas}</p>
                          ) : (
                            <span className="italic text-slate-600">No data.</span>
                          )}
                        </div>
                      )}
                    </article>
                  )
                })}

                {sobre === `col_${estado}` && (
                  <div className="h-1.5 mt-2 rounded-full bg-cyan-400 shadow-[0_0_12px_#22d3ee] z-[60]"></div>
                )}
              </div>
            </section>
          )
        })}
      </div>

      {edit && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-xl" onClick={() => setEdit(null)} role="dialog" aria-modal="true">
          <div className="max-h-[min(90vh,40rem)] w-full max-w-lg space-y-6 overflow-y-auto rounded-2xl border border-cyan-500/40 bg-slate-900/90 p-8 shadow-[0_0_40px_rgba(6,182,212,0.2)]" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold tracking-widest text-cyan-100 drop-shadow-[0_0_5px_#22d3ee]">{edit.id ? 'UPDATE_MODULE' : 'INITIALIZE_TASK'}</h2>

            <Campo label="MODULE DESIGNATION">
              <input autoFocus value={edit.titulo} onChange={e => setEdit({ ...edit, titulo: e.target.value })} className="inp" />
            </Campo>

            <Campo label="SYSTEM COMPONENT">
              <input list="modulos" value={edit.modulo} onChange={e => setEdit({ ...edit, modulo: e.target.value })} className="inp" />
              <datalist id="modulos">{[...new Set(tareas.map(t => t.modulo).filter(Boolean))].map(m => <option key={m} value={m} />)}</datalist>
            </Campo>

            <div className="grid grid-cols-3 gap-4">
              {[['STATUS', 'estado', ESTADOS], ['PRIORITY', 'prioridad', PRIOS], ['ASSIGNEE', 'responsable', PERSONAS]].map(([l, k, ops]) => (
                <Campo key={k} label={l}>
                  <select value={edit[k]} onChange={e => setEdit({ ...edit, [k]: e.target.value })} className="inp">
                    {ops.map(o => <option key={o} value={o}>{lb(o)}</option>)}
                  </select>
                </Campo>
              ))}
            </div>

            <Campo label="REQUIRED DEPENDENCIES">
              <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-cyan-900/50 bg-slate-950/50 p-2 text-sm shadow-inner">
                {tareas.filter(t => t.id !== edit.id).map(t => (
                  <label key={t.id} className="flex items-center gap-3 p-1.5 rounded hover:bg-cyan-950/40 cursor-pointer transition-colors text-slate-300">
                    <input type="checkbox" checked={edit.depende_de.includes(t.id)}
                      className="rounded border-cyan-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500/50 focus:ring-offset-slate-900"
                      onChange={e => setEdit({ ...edit, depende_de: e.target.checked ? [...edit.depende_de, t.id] : edit.depende_de.filter(x => x !== t.id) })} />
                    <span className="truncate">{t.titulo}</span>
                  </label>
                ))}
              </div>
            </Campo>

            <Campo label="PARAMETERS / LOGS">
              <textarea rows={4} value={edit.notas} onChange={e => setEdit({ ...edit, notas: e.target.value })} className="inp resize-y" />
            </Campo>

            <div className="flex flex-wrap gap-2 border-t border-cyan-900/30 pt-6 mt-4">
              {edit.id && (
                <button type="button" onClick={borrar} className="rounded-lg px-4 py-2 text-sm font-bold tracking-wide text-red-400 bg-red-950/40 border border-red-500/30 transition hover:bg-red-900/60 hover:text-red-200 hover:shadow-[0_0_15px_#ef444440] focus:outline-none">
                  PURGE
                </button>
              )}
              <div className="ml-auto flex gap-3">
                <button type="button" onClick={() => setEdit(null)} className="btn-ghost">ABORT</button>
                <button type="button" onClick={guardar} className="btn-primary">EXECUTE</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function Campo({ label, children }) {
  return <label className="block text-[10px] font-mono tracking-widest text-cyan-500/80 mb-1.5">{label}<div className="mt-2 font-sans">{children}</div></label>
}

function FiltroMultiple({ label, opciones, seleccionados, setSeleccionados }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const cerrar = e => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', cerrar)
    return () => document.removeEventListener('mousedown', cerrar)
  }, [open])

  const toggleOption = (opcion) => {
    if (seleccionados.includes(opcion)) {
      setSeleccionados(seleccionados.filter(item => item !== opcion))
    } else {
      setSeleccionados([...seleccionados, opcion])
    }
  }

  const activos = seleccionados.length > 0;

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)}
        className={`filter-pill ${activos ? 'filter-pill-active' : 'filter-pill-idle'}`}>
        {label} {activos && <span className="ml-1 rounded-full bg-cyan-400 text-slate-900 px-1.5 py-0.5 text-[9px]">{seleccionados.length}</span>}
        <span className="ml-1 text-[10px]">▾</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 z-[60] w-48 rounded-xl border border-cyan-500/30 bg-slate-900/95 p-2 shadow-[0_0_20px_rgba(6,182,212,0.3)] backdrop-blur-xl">
          <button
            onClick={() => setSeleccionados([])}
            className={`w-full text-left px-3 py-1.5 rounded-md text-xs font-semibold mb-1 transition-colors ${!activos ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:bg-slate-800'}`}>
            All (Clear filter)
          </button>
          <div className="h-px bg-slate-700/50 my-1"></div>
          {opciones.map(o => (
            <label key={o} className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-slate-800 cursor-pointer text-xs text-slate-200 transition-colors">
              <input type="checkbox" checked={seleccionados.includes(o)} onChange={() => toggleOption(o)}
                className="rounded border-cyan-700 bg-slate-950 text-cyan-500 focus:ring-cyan-500/50" />
              {lb(o)}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

function Chip({ valor, opciones, onPick }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const cerrar = e => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', cerrar)
    return () => document.removeEventListener('mousedown', cerrar)
  }, [open])

  return (
    <div ref={ref} className="relative z-50" onClick={e => e.stopPropagation()}>
      <button type="button" onClick={() => setOpen(!open)} className={`rounded-md px-2.5 py-1 text-[10px] font-bold tracking-wider transition-all hover:brightness-125 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 ${COLORES[valor]}`}>
        {lb(valor).toUpperCase()}
      </button>
      {open && (
        <ul className="absolute left-0 mt-2 flex w-max flex-col gap-1 rounded-xl border border-cyan-500/30 bg-slate-900/95 p-2 shadow-[0_0_20px_rgba(6,182,212,0.3)] backdrop-blur-xl z-[999]">
          {opciones.map(o => (
            <li key={o}>
              <button onClick={() => { setOpen(false); if (o !== valor) onPick(o) }}
                className={`w-full rounded-md px-3 py-1.5 text-left text-[10px] font-bold tracking-wide transition-all hover:brightness-125 ${COLORES[o]} ${o === valor ? 'ring-1 ring-cyan-400 scale-105' : 'border-transparent'}`}>
                {lb(o).toUpperCase()}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}