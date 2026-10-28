import { describe, expect, it, vi } from 'vitest';
import type { Task } from '../../types/task';
import type { Note } from '../../types/note';
import type { OvertimeEntry } from '../../types/overtime';
import { handleMcpMessage, SUPPORTED_PROTOCOL_VERSIONS, type McpContext } from './protocol';
import { LOGDAY_TOOLS, type LogdayToolDeps } from './tools';
import { DEFAULT_PORT, generateToken, readMcpSettings, setupCommands, statusFromStartError } from './model';

function task(over: Partial<Task>): Task {
  return {
    id: 'x', title: 'Tarea', status: 'todo', tags: [], project: 'inbox',
    created: '2026-10-01T12:00:00.000Z', linked_paths: [], content: '', filePath: '/d/x.md',
    ...over,
  };
}

const TASKS = [
  task({ id: 'a', title: 'Revisar PR', project: 'work', tags: ['github'], created: '2026-10-02T12:00:00.000Z' }),
  task({ id: 'b', title: 'Comprar pan', project: 'inbox', status: 'done', completedAt: '2026-10-03T10:00:00.000Z' }),
  task({ id: 'c', title: 'API', project: 'work/api', taskCode: 'FEAT-01', created: '2026-10-05', content: '# Notas' }),
];

const note = (over: Partial<Note>): Note => ({
  id: 'n', title: 'Nota', folder: '', tags: [], created: '2026-10-01T12:00:00.000Z', updated: '2026-10-01T12:00:00.000Z',
  pinned: false, content: '', filePath: '/d/n.md', ...over,
});

const NOTES = [
  note({ id: 'n1', title: 'Reunión SAHI', folder: 'fcv', tags: ['sahi'], updated: '2026-10-20T12:00:00.000Z', content: 'Acordamos revisar el módulo de contingencia offline con la DSI.' }),
  note({ id: 'n2', title: 'Ideas', folder: 'fcv/ideas', updated: '2026-10-25T12:00:00.000Z' }),
  note({ id: 'n3', title: 'Personal', folder: '', pinned: true, updated: '2026-09-01T12:00:00.000Z' }),
];

const OVERTIME: OvertimeEntry[] = [
  { id: 'o2', fecha: '2026-10-15', solicitadaPor: 'DSI', actividad: 'Despliegue', observaciones: '', horaInicio: '18:00', horaFinal: '22:00',
    totalHoras: 4, extrasDiurnas: 3, extrasNocturnas: 1, extrasDiurnasFestivas: 0, extrasNocturnasFestivas: 0 },
  { id: 'o1', fecha: '2026-10-05', solicitadaPor: 'DSI', actividad: 'Soporte', observaciones: 'Festivo', horaInicio: '08:00', horaFinal: '10:30',
    totalHoras: 2.5, extrasDiurnas: 0, extrasNocturnas: 0, extrasDiurnasFestivas: 2.5, extrasNocturnasFestivas: 0 },
];

function makeDeps(over: Partial<LogdayToolDeps> = {}) {
  const dailies: Record<string, string> = { '2026-10-28': '- Daily de hoy' };
  const deps: LogdayToolDeps = {
    listProjects: async () => ['inbox', 'work', 'work/api'],
    readAllTasks: async () => TASKS,
    createTask: vi.fn(async (input) => task({ id: 'new', ...input })),
    updateTask: vi.fn(async (next) => next),
    readDaily: async (date) => dailies[date] ?? '',
    saveDaily: vi.fn(async (date, text) => { dailies[date] = text; return text; }),
    today: () => '2026-10-28',
    listNoteFolders: async () => ['fcv', 'fcv/ideas'],
    readAllNotes: async () => NOTES,
    createNote: vi.fn(async (input) => note({ id: 'new', ...input })),
    readOvertime: async (month) => (month === '2026-10' ? OVERTIME : []),
    ...over,
  };
  return deps;
}

function makeCtx(over: Partial<McpContext> = {}, allowWrites = false): McpContext {
  return { tools: LOGDAY_TOOLS, deps: makeDeps(), allowWrites: () => allowWrites, serverVersion: '1.0.8', ...over };
}

const rpc = (method: string, params?: unknown, id: number | null = 1) =>
  JSON.stringify({ jsonrpc: '2.0', ...(id === null ? {} : { id }), method, ...(params ? { params } : {}) });

async function call(ctx: McpContext, name: string, args: Record<string, unknown> = {}) {
  const res = JSON.parse((await handleMcpMessage(rpc('tools/call', { name, arguments: args }), ctx))!);
  const { content, isError } = res.result;
  return { isError: !!isError, text: content[0].text as string, data: isError ? null : JSON.parse(content[0].text) };
}

describe('protocolo MCP', () => {
  it('initialize negocia la versión (R17)', async () => {
    const ctx = makeCtx();
    const same = JSON.parse((await handleMcpMessage(rpc('initialize', { protocolVersion: '2025-03-26' }), ctx))!);
    expect(same.result.protocolVersion).toBe('2025-03-26');
    expect(same.result.serverInfo).toEqual({ name: 'logday', version: '1.0.8' });
    expect(same.result.capabilities.tools).toBeTruthy();
    const other = JSON.parse((await handleMcpMessage(rpc('initialize', { protocolVersion: '1999-01-01' }), ctx))!);
    expect(other.result.protocolVersion).toBe(SUPPORTED_PROTOCOL_VERSIONS[0]);
  });

  it('las notificaciones no llevan respuesta (R16)', async () => {
    expect(await handleMcpMessage(rpc('notifications/initialized', undefined, null), makeCtx())).toBeNull();
  });

  it('ping, método desconocido y errores JSON-RPC', async () => {
    const ctx = makeCtx();
    expect(JSON.parse((await handleMcpMessage(rpc('ping'), ctx))!).result).toEqual({});
    expect(JSON.parse((await handleMcpMessage(rpc('resources/list'), ctx))!).error.code).toBe(-32601);
    expect(JSON.parse((await handleMcpMessage('{no es json', ctx))!).error.code).toBe(-32700);
    expect(JSON.parse((await handleMcpMessage('[]', ctx))!).error.code).toBe(-32600);
    expect(JSON.parse((await handleMcpMessage('{"id":3,"method":"ping"}', ctx))!).error).toMatchObject({ code: -32600 });
    expect(JSON.parse((await handleMcpMessage(rpc('tools/call', { name: 'nope' }), ctx))!).error.code).toBe(-32602);
  });

  it('sin "Permitir cambios" solo se listan las de lectura (R12)', async () => {
    const names = async (allow: boolean) =>
      JSON.parse((await handleMcpMessage(rpc('tools/list'), makeCtx({}, allow)))!).result.tools.map((t: { name: string }) => t.name);
    expect(await names(false)).toEqual([
      'list_projects', 'list_tasks', 'get_task', 'get_daily', 'list_note_folders', 'list_notes', 'get_note', 'get_overtime',
    ]);
    expect(await names(true)).toEqual(expect.arrayContaining(['create_note', 'create_task', 'update_task', 'append_to_daily']));
  });

  it('llamar una de escritura sin permiso da error y no escribe (R12)', async () => {
    const ctx = makeCtx();
    const res = await call(ctx, 'create_task', { title: 'Hola' });
    expect(res.isError).toBe(true);
    expect(ctx.deps.createTask).not.toHaveBeenCalled();
  });

  it('un error inesperado de la herramienta llega como isError, no tumba el servidor', async () => {
    const ctx = makeCtx({ deps: makeDeps({ readAllTasks: async () => { throw new Error('disco'); } }) });
    const res = await call(ctx, 'list_tasks');
    expect(res).toMatchObject({ isError: true });
    expect(res.text).toContain('disco');
  });
});

describe('herramientas (R10, R11, R15)', () => {
  it('list_tasks filtra por proyecto (con subproyectos), estado y texto', async () => {
    const ctx = makeCtx();
    expect((await call(ctx, 'list_tasks', { project: 'work' })).data.tasks.map((t: Task) => t.id)).toEqual(['c', 'a']);
    expect((await call(ctx, 'list_tasks', { status: 'done' })).data.tasks.map((t: Task) => t.id)).toEqual(['b']);
    expect((await call(ctx, 'list_tasks', { query: 'feat' })).data.tasks.map((t: Task) => t.id)).toEqual(['c']);
    expect((await call(ctx, 'list_tasks', { query: 'GITHUB' })).data.tasks.map((t: Task) => t.id)).toEqual(['a']);
    const limited = (await call(ctx, 'list_tasks', { limit: 1 })).data;
    expect(limited).toMatchObject({ total: 3 });
    expect(limited.tasks).toHaveLength(1);
    // Sin contenido ni ruta de archivo en la lista.
    expect(limited.tasks[0]).not.toHaveProperty('content');
    expect(limited.tasks[0]).not.toHaveProperty('filePath');
  });

  it('valida argumentos y proyectos', async () => {
    const ctx = makeCtx({}, true);
    expect((await call(ctx, 'list_tasks', { project: 'nope' })).text).toContain('does not exist');
    expect((await call(ctx, 'list_tasks', { status: 'hecha' })).isError).toBe(true);
    expect((await call(ctx, 'get_task', { id: 'zzz' })).text).toContain('does not exist');
    expect((await call(ctx, 'get_daily', { date: '2026-02-30' })).isError).toBe(true);
    expect((await call(ctx, 'create_task', { title: '  ' })).isError).toBe(true);
    expect((await call(ctx, 'create_task', { title: 'x', tags: 'a' })).isError).toBe(true);
    expect((await call(ctx, 'update_task', { id: 'a' })).text).toContain('Nothing to update');
    expect(ctx.deps.createTask).not.toHaveBeenCalled();
    expect(ctx.deps.updateTask).not.toHaveBeenCalled();
  });

  it('get_task trae el contenido y get_daily usa hoy por defecto', async () => {
    const ctx = makeCtx();
    expect((await call(ctx, 'get_task', { id: 'c' })).data).toMatchObject({ id: 'c', content: '# Notas', taskCode: 'FEAT-01' });
    expect((await call(ctx, 'get_daily')).data).toEqual({ date: '2026-10-28', text: '- Daily de hoy' });
    expect((await call(ctx, 'get_daily', { date: '2026-10-01' })).data.text).toBe('');
  });

  it('create_task usa inbox por defecto y la acción del store (R14)', async () => {
    const ctx = makeCtx({}, true);
    await call(ctx, 'create_task', { title: ' Nueva ', tags: ['a', ' '], due: '2026-11-01' });
    expect(ctx.deps.createTask).toHaveBeenCalledWith({
      title: 'Nueva', project: 'inbox', content: '', due: '2026-11-01', tags: ['a'], status: 'todo',
    });
  });

  it('update_task cambia solo lo pedido y pasa la tarea previa', async () => {
    const ctx = makeCtx({}, true);
    await call(ctx, 'update_task', { id: 'a', status: 'done' });
    const [next, prev] = (ctx.deps.updateTask as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(prev).toBe(TASKS[0]);
    expect(next).toEqual({ ...TASKS[0], status: 'done' });

    const withDue = { ...TASKS[0], due: '2026-11-01' };
    const ctx2 = makeCtx({ deps: makeDeps({ readAllTasks: async () => [withDue] }) }, true);
    await call(ctx2, 'update_task', { id: 'a', due: null });
    expect((ctx2.deps.updateTask as ReturnType<typeof vi.fn>).mock.calls[0][0]).not.toHaveProperty('due');
  });

  it('update_task rechazado por el store es un error de herramienta', async () => {
    const ctx = makeCtx({ deps: makeDeps({ updateTask: async () => undefined }) }, true);
    expect((await call(ctx, 'update_task', { id: 'a', title: 'x' })).isError).toBe(true);
  });

  it('append_to_daily agrega una línea al final', async () => {
    const ctx = makeCtx({}, true);
    expect((await call(ctx, 'append_to_daily', { text: '- Revisé el PR\n' })).data.text).toBe('- Daily de hoy\n- Revisé el PR');
    expect(ctx.deps.saveDaily).toHaveBeenCalledWith('2026-10-28', '- Daily de hoy\n- Revisé el PR', '- Daily de hoy');
    expect((await call(ctx, 'append_to_daily', { text: 'Primera', date: '2026-10-01' })).data.text).toBe('Primera');
  });
});

describe('notas y horas extra (segunda parte)', () => {
  it('list_notes: fijadas primero, por carpeta con subcarpetas, y "" = sin carpeta', async () => {
    const ctx = makeCtx();
    expect((await call(ctx, 'list_notes')).data.notes.map((n: Note) => n.id)).toEqual(['n3', 'n2', 'n1']);
    expect((await call(ctx, 'list_notes', { folder: 'fcv' })).data.notes.map((n: Note) => n.id)).toEqual(['n2', 'n1']);
    expect((await call(ctx, 'list_notes', { folder: '' })).data.notes.map((n: Note) => n.id)).toEqual(['n3']);
    expect((await call(ctx, 'list_notes', { folder: 'nope' })).text).toContain('does not exist');
    // Sin contenido en la lista.
    expect((await call(ctx, 'list_notes')).data.notes[0]).not.toHaveProperty('content');
  });

  it('list_notes busca en título, etiquetas y contenido, con un trozo del contenido', async () => {
    const ctx = makeCtx();
    const res = (await call(ctx, 'list_notes', { query: 'CONTINGENCIA' })).data;
    expect(res.notes.map((n: Note) => n.id)).toEqual(['n1']);
    expect(res.notes[0].snippet).toContain('contingencia offline');
    expect((await call(ctx, 'list_notes', { query: 'sahi' })).data.total).toBe(1);
  });

  it('get_note trae el contenido; una que no existe es error', async () => {
    const ctx = makeCtx();
    expect((await call(ctx, 'get_note', { id: 'n1' })).data).toMatchObject({ id: 'n1', folder: 'fcv', content: expect.stringContaining('Acordamos') });
    expect((await call(ctx, 'get_note', { id: 'x' })).isError).toBe(true);
  });

  it('get_overtime: ordenadas, con totales, este mes por defecto', async () => {
    const ctx = makeCtx();
    const res = (await call(ctx, 'get_overtime')).data;
    expect(res.month).toBe('2026-10');
    expect(res.entries.map((e: { date: string }) => e.date)).toEqual(['2026-10-05', '2026-10-15']);
    expect(res.totals).toEqual({ hours: 6.5, day: 3, night: 1, holidayDay: 2.5, holidayNight: 0 });
    expect((await call(ctx, 'get_overtime', { month: '2026-09' })).data.entries).toEqual([]);
    expect((await call(ctx, 'get_overtime', { month: '2026-13' })).isError).toBe(true);
  });

  it('create_note solo con permiso, en una carpeta que exista', async () => {
    const ro = makeCtx();
    expect((await call(ro, 'create_note', { title: 'x' })).isError).toBe(true);
    expect(ro.deps.createNote).not.toHaveBeenCalled();
    const ctx = makeCtx({}, true);
    expect((await call(ctx, 'create_note', { title: 'x', folder: 'nope' })).text).toContain('does not exist');
    await call(ctx, 'create_note', { title: ' Acta ', content: '# Acta', folder: 'fcv', tags: ['dsi'] });
    expect(ctx.deps.createNote).toHaveBeenCalledWith({ title: 'Acta', content: '# Acta', folder: 'fcv', tags: ['dsi'] });
  });
});

describe('modelo', () => {
  it('lee la configuración con valores por defecto', () => {
    expect(readMcpSettings(undefined)).toEqual({ port: DEFAULT_PORT, allowWrites: false });
    expect(readMcpSettings({ port: 80, allowWrites: 'sí', hint: '' })).toEqual({ port: DEFAULT_PORT, allowWrites: false });
    expect(readMcpSettings({ port: 5000, allowWrites: true, hint: '…abcd' })).toEqual({ port: 5000, allowWrites: true, hint: '…abcd' });
  });

  it('el token son 32 bytes en hex (R6)', () => {
    expect(generateToken()).toMatch(/^[0-9a-f]{64}$/);
    expect(generateToken((b) => b.fill(255))).toBe('f'.repeat(64));
  });

  it('comandos de registro para Claude Code y Codex (R7)', () => {
    const { claudeCode, codex } = setupCommands(5000, 'tok');
    expect(claudeCode).toBe('claude mcp add --transport http logday http://127.0.0.1:5000/mcp --header "Authorization: Bearer tok"');
    expect(codex).toContain('url = "http://127.0.0.1:5000/mcp"');
    expect(codex).toContain('http_headers = { Authorization = "Bearer tok" }');
  });

  it('errores al abrir el servidor (R3)', () => {
    expect(statusFromStartError('port_in_use', 5000)).toEqual({ state: 'port_in_use', port: 5000 });
    expect(statusFromStartError('secret_not_found', 5000)).toEqual({ state: 'no_token' });
    expect(statusFromStartError(new Error('x'), 5000)).toEqual({ state: 'error', message: 'x' });
  });
});
