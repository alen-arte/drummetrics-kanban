'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

const ESTADOS = ['Pendiente', 'En Proceso', 'Listo para revisión', 'Completada']
const PRIOS = ['Alta', 'Media', 'Baja']
const PERSONAS = ['Alén', 'John', 'Sin asignar']
const COLORES = {
  Alta: 'bg-red-100 text-red-700', Media: 'bg-amber-100 text-amber-700', Baja: 'bg-green-100 text-green-700',
  Pendiente: 'bg-slate-100 text-slate-700', 'En Proceso': 'bg-blue-100 text-blue-700',
  'Listo para revisión': 'bg-purple-100 text-purple-700', Completada: 'bg-emerald-100 text-emerald-700',
  'Alén': 'bg-sky-100 text-sky-700', John: 'bg-orange-100 text-orange-700', 'Sin asignar': 'bg-slate-100 text-slate-500',
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
const lb = v => L[v] || v // los valores en la base siguen en español; solo se traduce lo que se ve
const vacia = { titulo: '', modulo: '', estado: 'Pendiente', prioridad: 'Media', responsable: 'Sin asignar', depende_de: [], notas: '' }
const FILTROS = [['todas', 'All'], ['Alén', 'Alén'], ['John', 'John'], ['alta', 'High priority'], ['bloq', 'Blocked']]

const COL_ESTADO = {
  Pendiente: { dot: 'bg-slate-400', bar: 'border-t-slate-400', head: 'text-slate-700' },
  'En Proceso': { dot: 'bg-blue-500', bar: 'border-t-blue-500', head: 'text-blue-800' },
  'Listo para revisión': { dot: 'bg-violet-500', bar: 'border-t-violet-500', head: 'text-violet-800' },
  Completada: { dot: 'bg-emerald-500', bar: 'border-t-emerald-500', head: 'text-emerald-800' },
}
const PRIO_BORDER = { Alta: 'border-l-red-500', Media: 'border-l-amber-400', Baja: 'border-l-emerald-400' }

export default function Page() {
  const [tareas, setTareas] = useState([])
  const [filtro, setFiltro] = useState('todas')
  const [edit, setEdit] = useState(null)
  const [err, setErr] = useState(null)
  const [orden, setOrden] = useState({}) // orden por columna
  const [sobre, setSobre] = useState(null) // tarjeta sobre la que se arrastra
  const [abierta, setAbierta] = useState(null) // tarjeta expandida

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
    setTareas(ts => ts.map(t => t.id === id ? { ...t, [campo]: valor } : t)) // optimista
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
    // limpiar referencias en otras tareas
    await Promise.all(tareas.filter(t => t.depende_de?.includes(edit.id))
      .map(t => supabase.from('tareas').update({ depende_de: t.depende_de.filter(x => x !== edit.id) }).eq('id', t.id)))
    setEdit(null); cargar()
  }

  const hechas = tareas.filter(t => t.estado === 'Completada').length
  const pct = tareas.length ? Math.round((hechas / tareas.length) * 100) : 0

  return (
    <main className="mx-auto max-w-[88rem] px-4 pb-10 pt-6 sm:px-6">
      <header className="sticky top-0 z-20 -mx-4 mb-6 border-b border-slate-200/60 bg-[var(--bg-page)]/85 px-4 py-4 backdrop-blur-md sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-lg shadow-md shadow-indigo-600/25" aria-hidden>🥁</span>
              <div>
                <h1 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">DrumMetrics</h1>
                <p className="text-xs font-medium text-slate-500">Shared task board</p>
              </div>
            </div>
            <div className="mt-3 max-w-xs">
              <div className="mb-1 flex justify-between text-xs font-medium text-slate-500">
                <span>{hechas} of {tareas.length} completed</span>
                <span>{pct}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-200/80">
                <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-500" style={{ width: `${pct}%` }} />
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
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          <span aria-hidden>⚠</span>
          <span>{err}</span>
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {ESTADOS.map(estado => {
          const col = COL_ESTADO[estado]
          const lista = ordenar(visibles.filter(t => t.estado === estado), orden[estado])
          return (
          <section key={estado}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { const id = e.dataTransfer.getData('id'); if (id) soltar(id, estado, null) }}
            className={`flex min-h-[14rem] flex-col rounded-2xl border border-slate-200/80 border-t-[3px] bg-white/70 p-3 shadow-sm backdrop-blur-sm ${col.bar}`}>
            <div className="mb-3 flex items-center gap-2 px-0.5">
              <span className={`h-2 w-2 shrink-0 rounded-full ${col.dot}`} aria-hidden />
              <h2 className={`text-sm font-semibold ${col.head}`}>
                {lb(estado)}
                <span className="ml-1.5 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-500">{lista.length}</span>
              </h2>
              <select value={orden[estado] || 'prio'} onChange={e => setOrden({ ...orden, [estado]: e.target.value })}
                title="Sort column" aria-label={`Sort ${lb(estado)} column`}
                className="ml-auto max-w-[7.5rem] truncate rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
                <option value="prio">Priority</option>
                <option value="resp">Assignee</option>
                <option value="custom">Custom order</option>
              </select>
            </div>
            <div className="flex flex-1 flex-col gap-2">
              {lista.length === 0 && (
                <p className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 py-8 text-center text-xs text-slate-400">
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
                    className={`group cursor-pointer rounded-xl border border-slate-100 border-l-[3px] bg-white p-3 shadow-sm transition hover:border-slate-200 hover:shadow-md ${PRIO_BORDER[t.prioridad] || 'border-l-slate-300'} ${bl.length ? 'ring-2 ring-red-200/80' : ''}${sobre === t.id ? ' ring-2 ring-indigo-400 ring-offset-1' : ''}`}>
                    {bl.length > 0 && (
                      <p className="mb-2 flex items-start gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-800">
                        <span aria-hidden>🔒</span>
                        <span>Blocked by: {bl.map(b => b.titulo).join(', ')}</span>
                      </p>
                    )}
                    <div className="flex items-start gap-2">
                      <span draggable title="Drag to move" onClick={e => e.stopPropagation()}
                        onDragEnd={() => setSobre(null)}
                        onDragStart={e => { e.dataTransfer.setData('id', t.id); e.dataTransfer.setDragImage(e.currentTarget.closest('article'), 12, 12) }}
                        className="cursor-grab select-none rounded p-0.5 text-slate-300 transition group-hover:text-slate-400 active:cursor-grabbing">⠿</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold leading-snug text-slate-900">{t.titulo}</p>
                        {t.modulo && <p className="mt-0.5 text-xs text-slate-500">{t.modulo}</p>}
                      </div>
                      <button type="button" title="Edit task" onClick={e => { e.stopPropagation(); setEdit(t) }}
                        className="rounded-lg p-1.5 text-sm opacity-60 transition hover:bg-slate-100 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30">✏️</button>
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
                      <Chip valor={t.prioridad} opciones={PRIOS} onPick={v => cambiar(t.id, 'prioridad', v)} />
                      <Chip valor={t.responsable} opciones={PERSONAS} onPick={v => cambiar(t.id, 'responsable', v)} />
                      <Chip valor={t.estado} opciones={ESTADOS} onPick={v => cambiar(t.id, 'estado', v)} />
                    </div>
                    {abierta === t.id && (
                      <p className="mt-2.5 whitespace-pre-wrap border-t border-slate-100 pt-2.5 text-xs leading-relaxed text-slate-600">
                        {t.notas || <span className="italic text-slate-400">No description</span>}
                      </p>
                    )}
                  </article>
                )
              })}
            </div>
          </section>
        )})}
      </div>

      {edit && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={() => setEdit(null)} role="dialog" aria-modal="true">
          <div className="max-h-[min(90vh,40rem)] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold tracking-tight text-slate-900">{edit.id ? 'Edit task' : 'New task'}</h2>
            <Campo label="Title / Feature">
              <input autoFocus value={edit.titulo} onChange={e => setEdit({ ...edit, titulo: e.target.value })} className="inp" />
            </Campo>
            <Campo label="Module">
              <input list="modulos" value={edit.modulo} onChange={e => setEdit({ ...edit, modulo: e.target.value })} className="inp" />
              <datalist id="modulos">{[...new Set(tareas.map(t => t.modulo).filter(Boolean))].map(m => <option key={m} value={m} />)}</datalist>
            </Campo>
            <div className="grid grid-cols-3 gap-2">
              {[['Status', 'estado', ESTADOS], ['Priority', 'prioridad', PRIOS], ['Assignee', 'responsable', PERSONAS]].map(([l, k, ops]) => (
                <Campo key={k} label={l}>
                  <select value={edit[k]} onChange={e => setEdit({ ...edit, [k]: e.target.value })} className="inp">
                    {ops.map(o => <option key={o} value={o}>{lb(o)}</option>)}
                  </select>
                </Campo>
              ))}
            </div>
            <Campo label="Depends on (must be completed first)">
              <div className="max-h-32 space-y-1 overflow-y-auto rounded border border-slate-200 p-2 text-sm">
                {tareas.filter(t => t.id !== edit.id).map(t => (
                  <label key={t.id} className="flex items-center gap-2">
                    <input type="checkbox" checked={edit.depende_de.includes(t.id)}
                      onChange={e => setEdit({ ...edit, depende_de: e.target.checked ? [...edit.depende_de, t.id] : edit.depende_de.filter(x => x !== t.id) })} />
                    {t.titulo}
                  </label>
                ))}
              </div>
            </Campo>
            <Campo label="Notes / Description">
              <textarea rows={4} value={edit.notas} onChange={e => setEdit({ ...edit, notas: e.target.value })} className="inp" />
            </Campo>
            <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              {edit.id && (
                <button type="button" onClick={borrar} className="rounded-lg px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500/30">
                  Delete
                </button>
              )}
              <button type="button" onClick={() => setEdit(null)} className="btn-ghost ml-auto">Cancel</button>
              <button type="button" onClick={guardar} className="btn-primary">Save</button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function Campo({ label, children }) {
  return <label className="block text-xs font-medium text-slate-600">{label}<div className="mt-1">{children}</div></label>
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
      <button type="button" onClick={() => setOpen(!open)} className={`rounded-md px-2 py-0.5 font-medium ring-1 ring-black/5 transition hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 ${COLORES[valor]}`}>{lb(valor)} ▾</button>
      {open && (
        <ul className="absolute left-0 z-40 mt-1 flex w-max flex-col gap-0.5 rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
          {opciones.map(o => (
            <li key={o}>
              <button onClick={() => { setOpen(false); if (o !== valor) onPick(o) }}
                className={`w-full rounded px-2 py-1 text-left hover:brightness-95 ${COLORES[o]} ${o === valor ? 'ring-2 ring-slate-400' : ''}`}>
                {lb(o)}{o === valor ? ' ✓' : ''}
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  )
}