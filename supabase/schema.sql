create table public.tareas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  modulo text not null default '',
  estado text not null default 'Pendiente'
    check (estado in ('Pendiente','En Proceso','Listo para revisión','Completada')),
  prioridad text not null default 'Media' check (prioridad in ('Alta','Media','Baja')),
  responsable text not null default 'Sin asignar' check (responsable in ('Alén','John','Sin asignar')),
  depende_de uuid[] not null default '{}',   -- ids de tareas que deben completarse antes
  notas text not null default '',
  created_at timestamptz not null default now()
);

-- Acceso abierto con la anon key (herramienta interna de 2 personas; ver nota de seguridad)
alter table public.tareas enable row level security;
create policy "acceso abierto" on public.tareas for all using (true) with check (true);

-- Tiempo real
alter table public.tareas replica identity full;
alter publication supabase_realtime add table public.tareas;

-- Datos iniciales (de tu planilla)
insert into public.tareas (titulo, modulo, prioridad, notas) values
('Wizard de 3 Pasos (Estructura)','Challenge Mode','Alta','Flujo: 1) Requisitos (vertical, 240fps), 2) Ejercicio, 3) Subida. No depende de código.'),
('Wizard Paso 2: Glosario','Challenge Mode','Media','Solo un botón UI a recurso externo (PDF/YouTube).'),
('Wizard Paso 3: Confirmación de Baqueta','Challenge Mode','Alta','Selector simple de modelos (ej. Vic Firth MS5). Reemplaza calibración de tambor.'),
('Gesto de Disparador (Baquetas Cruzadas)','Challenge Mode','Alta','Reemplaza el botón Grabar. Depende de John. Diseñar estado visual: cruzar baquetas 2 seg.'),
('Eliminar Slider de Tambor','Practice Mirror','Alta','Limpieza directa. Da pie a la calibración por baqueta.'),
('Reducción de UI / Menús','Practice Mirror','Alta','Menús colapsables + indicador de estado compacto. Pre-requisito de Tooltips.'),
('Guía Visual de Encuadre (Overlay)','Practice Mirror','Alta','Silueta transparente para encajar parche y arco del golpe. Reemplaza regla 5-6 pies.'),
('Tooltips (Hover / Long-press)','Practice Mirror','Baja','Solo para controles visibles tras la reducción de UI.'),
('Arquitectura de 3 Modos','General UX / UI','Alta','Navegación: Practice Mirror, Challenge Mode, Instructor Mode.'),
('Memoria de Calibración (Skip)','General UX / UI','Media','Perfiles guardados ("Kit", "Desk pad") + Skip Calibration. Depende de John (detección de deriva).');

update public.tareas set depende_de = array[(select id from public.tareas where titulo='Reducción de UI / Menús')]
where titulo = 'Tooltips (Hover / Long-press)';
