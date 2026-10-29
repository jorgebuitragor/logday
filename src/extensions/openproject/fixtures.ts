// Respuestas con la estructura de la API v3 de OpenProject (HAL+JSON) y
// datos inventados, para las pruebas y la revisión en el navegador.

const wp = (id: number, subject: string, extra: Record<string, unknown> = {}, links: Record<string, unknown> = {}) => ({
  _type: 'WorkPackage',
  id,
  lockVersion: 3,
  subject,
  description: { format: 'markdown', raw: '', html: '' },
  startDate: null,
  dueDate: null,
  updatedAt: '2026-10-28T15:04:05.000Z',
  _links: {
    self: { href: `/api/v3/work_packages/${id}`, title: subject },
    type: { href: '/api/v3/types/1', title: 'Task' },
    status: { href: '/api/v3/statuses/7', title: 'In progress' },
    priority: { href: '/api/v3/priorities/8', title: 'Normal' },
    project: { href: '/api/v3/projects/3', title: 'SAHI Offline' },
    assignee: { href: '/api/v3/users/5', title: 'Ana Pérez' },
    ...links,
  },
  ...extra,
});

export const PAGE_1 = JSON.stringify({
  _type: 'WorkPackageCollection',
  total: 3,
  count: 2,
  pageSize: 2,
  offset: 1,
  _embedded: {
    elements: [
      wp(1234, 'Definir el módulo de admisiones', {
        description: { format: 'markdown', raw: 'Revisar con **Ana** el flujo.\n\n- paso 1\n- paso 2', html: '<p>…</p>' },
        dueDate: '2026-11-04',
      }),
      wp(1240, 'Hito: piloto en urgencias', { date: '2026-11-15' }, { type: { href: '/api/v3/types/2', title: 'Milestone' }, status: { href: '/api/v3/statuses/1', title: 'New' } }),
    ],
  },
  _links: { self: { href: '/api/v3/work_packages?offset=1&pageSize=2' } },
});

export const PAGE_2 = JSON.stringify({
  _type: 'WorkPackageCollection',
  total: 3,
  count: 1,
  pageSize: 2,
  offset: 2,
  _embedded: { elements: [wp(1251, '  ', {}, { priority: { href: '/api/v3/priorities/9', title: 'High' } })] },
});

export const ME = JSON.stringify({ _type: 'User', id: 5, name: 'Ana Pérez', login: 'aperez' });
