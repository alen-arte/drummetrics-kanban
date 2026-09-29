'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

const ESTADOS = ['Pendiente', 'En Proceso', 'Listo para revisión', 'Completada']
const PRIOS = ['Alta', 'Media', 'Baja']
const PERSONAS = ['Alén', 'John', 'Sin asignar']

// NUEVOS COLORES: Estilo Cyberpunk / Oscuro
const COLORES = {
  Alta: 'bg-red-950/50 text-red-400 border border-red-500/30',
  Media: 'bg-amber-950/50 text-amber-400 border border-amber-500/30',
  Baja: 'bg-emerald-950/50 text-emerald-400 border border-emerald-500/30',
  Pendiente: 'bg-zinc-900/50 text-zinc-400 border border-zinc-700',
  'En Proceso': 'bg-blue-950/50 text-blue-400 border border-blue-500/30',
  'Listo para revisión': 'bg-purple-950/50 text-purple-400 border border-purple-500/30',
  Completada: 'bg-emerald-950/50 text-emerald-400 border border-emerald-500/30',
  'Alén': 'bg-cyan-950/50 text-cyan-400 border border-cyan-500/30',
  John: 'bg-orange-950/50 text-orange-400 border border-orange-500/30',
  'Sin asignar': 'bg-zinc-900/50 text-zinc-500 border border-zinc-800',
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
const L = { Pendiente: 'To do', 'En Proceso': 'In progress', 'Listo para revisión': 'Ready for review', Completada: 'Done', Alta: 'High', Media: 'Medium', Baja: 'Low', 'Sin asignar': 'Unassigned' }
const lb = v => L[v] || v
const vacia = { titulo: '', modulo: '', estado: 'Pendiente', prioridad: 'Media', responsable: 'Sin asignar', depende_de: [], notas: '' }
const FILTROS = [['todas', 'All'], ['Alén', 'Alén'], ['John', 'John'], ['alta', 'High priority'], ['bloq', 'Blocked']]

// COLORES PARA LAS COLUMNAS Y BORDES LATERALES
const COL_ESTADO = {
  Pendiente: { dot: 'bg-zinc-500 shadow-[0_0_8px_rgba(113,113,122,0.8)]', bar: 'border-t-zinc-600', head: 'text-zinc-300' },
  'En Proceso': { dot: 'bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]', bar: 'border-t-blue-500/50', head: 'text-blue-300' },
  'Listo para revisión': { dot: 'bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.8)]', bar: 'border-t-purple-500/50', head: 'text-purple-300' },
  Completada: { dot: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]', bar: 'border-t-emerald-500/50', head: 'text-emerald-300' },
}
const PRIO_BORDER = { Alta: 'border-l-red-500', Media: 'border-l-amber-500', Baja: 'border-l-emerald-500' }

export default function Page() {
  const [tareas, setTareas] = useState([])
  const [filtro, setFiltro] = useState('todas')
  const [edit, setEdit] = useState(null)
  const [err, setErr] = useState(null)
  const [orden, setOrden] = useState({})
  const [sobre, setSobre] = useState(null)
  const [abierta, setAbierta] = useState(null)

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

  const visibles = tareas.filter(t =>
    filtro === 'todas' ? true :
      filtro === 'alta' ? t.prioridad === 'Alta' :
        filtro === 'bloq' ? bloqueos(t).length > 0 && t.estado !== 'Completada' :
          t.responsable === filtro)

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
    <main className="mx-auto max-w-[88rem] px-4 pb-10 pt-6 sm:px-6 min-h-screen">
      {/* Header modificado con desenfoque y tema oscuro */}
      <header className="sticky top-0 z-20 -mx-4 mb-6 border-b border-zinc-800/60 bg-[#09090b]/70 px-4 py-4 backdrop-blur-xl sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-900 to-zinc-900 border border-indigo-500/30 text-lg shadow-[0_0_15px_rgba(99,102,241,0.2)]" aria-hidden>🥁</span>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-zinc-100 sm:text-2xl">DrumMetrics</h1>
                <p className="text-xs font-medium text-zinc-400">Shared task board</p>
              </div>
            </div>
            <div className="mt-4 max-w-xs">
              <div className="mb-1 flex justify-between text-xs font-medium text-zinc-400">
                <span>{hechas} of {tareas.length} completed</span>
                <span className="text-indigo-400">{pct}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-all duration-500 shadow-[0_0_10px_rgba(45,212,191,0.5)]" style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto sm:justify-end">
            {FILTROS.map(([k, l]) => (
              <button key={k} type="button" onClick={() => setFiltro(k)}
                className={`filter-pill ${filtro === k ? 'filter-pill-active' : 'filter-pill-idle'}`}>
                {k === 'alta' && <span className="mr-1 text-red-500">●</span>}
                {k === 'bloq' && <span className="mr-1">🔒</span>}
                {l}
              </button>
            ))}
            <button type="button" onClick={() => setEdit({ ...vacia })} className="btn-primary shrink-0">+ New task</button>
          </div>
        </div>
      </header>

      {err && (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-400 backdrop-blur-md" role="alert">
          <span aria-hidden>⚠</span>
          <span>{err}</span>
        </p>
      )}

      {/* Tablero Kanban */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {ESTADOS.map(estado => {
          const col = COL_ESTADO[estado]
          const lista = ordenar(visibles.filter(t => t.estado === estado), orden[estado])
          return (
            <section key={estado}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { const id = e.dataTransfer.getData('id'); if (id) soltar(id, estado, null) }}
              className={`flex min-h-[20rem] flex-col rounded-2xl border border-zinc-800/80 border-t-[3px] bg-zinc-900/20 p-3 shadow-lg backdrop-blur-sm ${col.bar}`}>

              {/* Cabecera de Columna */}
              <div className="mb-4 flex items-center gap-2 px-1">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${col.dot}`} aria-hidden />
                <h2 className={`text-sm font-semibold tracking-wide ${col.head}`}>
                  {lb(estado).toUpperCase()}
                  <span className="ml-2 rounded-md bg-zinc-800/80 border border-zinc-700 px-1.5 py-0.5 text-xs font-normal text-zinc-400">{lista.length}</span>
                </h2>
                <select value={orden[estado] || 'prio'} onChange={e => setOrden({ ...orden, [estado]: e.target.value })}
                  title="Sort column" aria-label={`Sort ${lb(estado)} column`}
                  className="ml-auto max-w-[7.5rem] truncate rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50">
                  <option value="prio">Priority</option>
                  <option value="resp">Assignee</option>
                  <option value="custom">Custom order</option>
                </select>
              </div>

              {/* Lista de Tareas */}
              <div className="flex flex-1 flex-col gap-3">
                {lista.length === 0 && (
                  <p className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-zinc-700/50 py-8 text-center text-xs text-zinc-500">
                    Drop tasks here
                  </p>
                )}
                {lista.map(t => {
                  const bl = t.estado !== 'Completada' ? bloqueos(t) : []
                  return (
                    <article key={t.id}
                      onDragOver={e => { e.preventDefault(); setSobre(t.id) }}
                      onDragLeave={() => setSobre(null)}
                      onDrop={e => { e.preventDefault(); e.stopPropagation(); setSobre(null); const id = e.dataTransfer.getData('id'); if (id) soltar(id, estado, t.id) }}
                      onClick={() => setAbierta(abierta === t.id ? null : t.id)}
                      className={`group cursor-pointer rounded-xl border border-zinc-800 border-l-[3px] bg-zinc-900/80 p-3.5 shadow-md transition-all duration-200 hover:border-zinc-600 hover:-translate-y-0.5 hover:shadow-lg hover:bg-zinc-800/90 ${PRIO_BORDER[t.prioridad] || 'border-l-zinc-600'} ${bl.length ? 'ring-1 ring-red-500/50 bg-red-950/10' : ''}${sobre === t.id ? ' ring-2 ring-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.3)]' : ''}`}>

                      {bl.length > 0 && (
                        <p className="mb-3 flex items-start gap-2 rounded-lg bg-red-950/40 border border-red-900/50 px-2.5 py-1.5 text-xs font-medium text-red-400">
                          <span aria-hidden>🔒</span>
                          <span>Blocked by: {bl.map(b => b.titulo).join(', ')}</span>
                        </p>
                      )}

                      <div className="flex items-start gap-2.5">
                        <span draggable title="Drag to move" onClick={e => e.stopPropagation()}
                          onDragEnd={() => setSobre(null)}
                          onDragStart={e => { e.dataTransfer.setData('id', t.id); e.dataTransfer.setDragImage(e.currentTarget.closest('article'), 12, 12) }}
                          className="mt-0.5 cursor-grab select-none rounded p-0.5 text-zinc-600 transition group-hover:text-zinc-400 active:cursor-grabbing">⠿</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium leading-snug text-zinc-200">{t.titulo}</p>
                          {t.modulo && <p className="mt-1 text-[11px] font-mono text-zinc-500 tracking-wide">{t.modulo.toUpperCase()}</p>}
                        </div>
                        <button type="button" title="Edit task" onClick={e => { e.stopPropagation(); setEdit(t) }}
                          className="rounded-lg p-1.5 text-sm text-zinc-500 opacity-0 transition-all group-hover:opacity-100 hover:bg-zinc-700 hover:text-zinc-300 focus:opacity-100">✏️</button>
                      </div>

                      <div className="mt-3.5 flex flex-wrap items-center gap-2 text-xs">
                        <Chip valor={t.prioridad} opciones={PRIOS} onPick={v => cambiar(t.id, 'prioridad', v)} />
                        <Chip valor={t.responsable} opciones={PERSONAS} onPick={v => cambiar(t.id, 'responsable', v)} />
                        {/* Estado quitado del chip en la tarjeta porque ya está en la columna, hace ruido visual */}
                      </div>

                      {abierta === t.id && (
                        <div className="mt-3.5 border-t border-zinc-800 pt-3 text-xs text-zinc-400">
                          {t.notas ? (
                            <p className="whitespace-pre-wrap leading-relaxed">{t.notas}</p>
                          ) : (
                            <span className="italic text-zinc-600">No description provided.</span>
                          )}
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>

      {/* Modal de Edición (Tema Oscuro) */}
      {edit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setEdit(null)} role="dialog" aria-modal="true">
          <div className="max-h-[min(90vh,40rem)] w-full max-w-lg space-y-5 overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold tracking-tight text-zinc-100">{edit.id ? 'Edit task' : 'New task'}</h2>

            <Campo label="Title / Feature">
              <input autoFocus value={edit.titulo} onChange={e => setEdit({ ...edit, titulo: e.target.value })} className="inp" />
            </Campo>

            <Campo label="Module (Component or Area)">
              <input list="modulos" value={edit.modulo} onChange={e => setEdit({ ...edit, modulo: e.target.value })} className="inp" />
              <datalist id="modulos">{[...new Set(tareas.map(t => t.modulo).filter(Boolean))].map(m => <option key={m} value={m} />)}</datalist>
            </Campo>

            <div className="grid grid-cols-3 gap-3">
              {[['Status', 'estado', ESTADOS], ['Priority', 'prioridad', PRIOS], ['Assignee', 'responsable', PERSONAS]].map(([l, k, ops]) => (
                <Campo key={k} label={l}>
                  <select value={edit[k]} onChange={e => setEdit({ ...edit, [k]: e.target.value })} className="inp">
                    {ops.map(o => <option key={o} value={o}>{lb(o)}</option>)}
                  </select>
                </Campo>
              ))}
            </div>

            <Campo label="Dependencies (must be completed first)">
              <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900/50 p-2 text-sm">
                {tareas.filter(t => t.id !== edit.id).map(t => (
                  <label key={t.id} className="flex items-center gap-2.5 p-1 rounded hover:bg-zinc-800 cursor-pointer transition-colors text-zinc-300">
                    <input type="checkbox" checked={edit.depende_de.includes(t.id)}
                      className="rounded border-zinc-700 bg-zinc-950 text-indigo-500 focus:ring-indigo-500/50"
                      onChange={e => setEdit({ ...edit, depende_de: e.target.checked ? [...edit.depende_de, t.id] : edit.depende_de.filter(x => x !== t.id) })} />
                    <span className="truncate">{t.titulo}</span>
                  </label>
                ))}
                {tareas.filter(t => t.id !== edit.id).length === 0 && (
                  <span className="text-zinc-500 italic px-1">No other tasks available.</span>
                )}
              </div>
            </Campo>

            <Campo label="Notes / Description">
              <textarea rows={4} value={edit.notas} onChange={e => setEdit({ ...edit, notas: e.target.value })} className="inp resize-y" />
            </Campo>

            <div className="flex flex-wrap gap-2 border-t border-zinc-800 pt-5 mt-2">
              {edit.id && (
                <button type="button" onClick={borrar} className="rounded-lg px-4 py-2 text-sm font-medium text-red-400 bg-red-950/30 border border-red-900/50 transition hover:bg-red-900/50 hover:text-red-300 focus:outline-none focus:ring-2 focus:ring-red-500/50">
                  Delete Task
                </button>
              )}
              <div className="ml-auto flex gap-2">
                <button type="button" onClick={() => setEdit(null)} className="btn-ghost">Cancel</button>
                <button type="button" onClick={guardar} className="btn-primary">Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function Campo({ label, children }) {
  return <label className="block text-xs font-semibold text-zinc-400 mb-1">{label}<div className="mt-1.5 font-normal">{children}</div></label>
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
    <span ref={ref} className="relative" onClick={e => e.stopPropagation()}>
      <button type="button" onClick={() => setOpen(!open)} className={`rounded-md px-2 py-1 text-[11px] font-medium transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 ${COLORES[valor]}`}>
        {lb(valor)} ▾
      </button>
      {open && (
        <ul className="absolute left-0 z-40 mt-1.5 flex w-max flex-col gap-1 rounded-xl border border-zinc-700 bg-zinc-900 p-1.5 shadow-xl shadow-black/50 backdrop-blur-md">
          {opciones.map(o => (
            <li key={o}>
              <button onClick={() => { setOpen(false); if (o !== valor) onPick(o) }}
                className={`w-full rounded-md px-2.5 py-1.5 text-left text-[11px] transition hover:brightness-125 ${COLORES[o]} ${o === valor ? 'ring-1 ring-zinc-500' : ''}`}>
                {lb(o)}{o === valor ? ' ✓' : ''}
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  )
}