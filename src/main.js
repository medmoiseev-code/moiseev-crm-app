const USERS = [
  { id: 'elizaveta', name: 'Елизавета', role: 'admin' },
  { id: 'victoria', name: 'Виктория', role: 'admin' },
  { id: 'gleb', name: 'Глеб', role: 'manager' },
  { id: 'fedor', name: 'Федор', role: 'manager' },
]

const STATUS_OPTIONS = [
  '',
  '📞 Позвонить',
  '🔔 Напомнить',
  '✍️ Записали на приём',
  '🩺 Профосмотр',
  '⛔ Не звонить',
  '❌ Отказ',
]

const TASK_TYPES = [
  { value: 'call', label: '📞 Обзвон' },
  { value: 'recall', label: '🩺 Профосмотр' },
  { value: 'appointment', label: '📅 Приём' },
  { value: 'other', label: '🔔 Напоминание' },
]

const DOCTORS = ['Моисеев Г.А.', 'Климов Ф.С.']
const STORAGE_KEY = 'moiseev_admin_crm_v04'
const SNAPSHOT_KEY = 'moiseev_admin_crm_snapshots_v04'
const SESSION_KEY = 'moiseev_admin_crm_user'
const TABLE_SETTINGS_KEY = 'moiseev_admin_crm_table_v01'
const SIDEBAR_SETTINGS_KEY = 'moiseev_admin_crm_sidebar_v01'
const PATIENT_COLUMNS = [
  { key: 'name', width: 220 }, { key: 'createdAt', width: 125 }, { key: 'doctors', width: 150 },
  { key: 'appointmentDate', width: 130 }, { key: 'doctorComment', width: 230 }, { key: 'nextAction', width: 210 },
  { key: 'updatedBy', width: 125 }, { key: 'status', width: 180 }, { key: 'adminNote', width: 230 },
  { key: 'history', width: 450 }, { key: 'nearestTask', width: 175 }, { key: 'recall', width: 160 },
  { key: 'urgent', width: 70 },
]

const app = document.querySelector('#app')
let state = loadState()
let currentUser = getCurrentUser()
let activeTab = 'patients'
let activeTaskFilter = 'today'
let searchText = ''
let sidebarCollapsed = loadSidebarCollapsed()

function cloneData(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value))
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function datePlus(days) {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function nowText() {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  }).format(new Date())
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (saved?.patients && saved?.tasks) return saved
  } catch (error) {
    console.warn('Не удалось прочитать локальную базу', error)
  }
  if (window.INITIAL_CRM_DATA) return cloneData(window.INITIAL_CRM_DATA)
  return { version: 3, patients: [], tasks: [], audit: [], updatedAt: new Date().toISOString() }
}

function saveSnapshot() {
  try {
    const snapshots = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || '[]')
    snapshots.unshift({ at: new Date().toISOString(), state: cloneData(state) })
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshots.slice(0, 10)))
  } catch (error) {
    console.warn('Не удалось создать снимок', error)
  }
}

function undoLastChange() {
  try {
    const snapshots = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || '[]')
    if (!snapshots.length) return alert('Нет предыдущих изменений для отмены')
    const snapshot = snapshots.shift()
    state = snapshot.state
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshots))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    renderShell()
  } catch (error) {
    alert('Не удалось отменить последнее изменение')
  }
}

function saveState(action = 'Изменение данных') {
  saveSnapshot()
  state.updatedAt = new Date().toISOString()
  state.audit.unshift({
    id: uid(),
    at: state.updatedAt,
    user: currentUser?.name || 'Система',
    action,
  })
  state.audit = state.audit.slice(0, 2000)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

function getCurrentUser() {
  const id = sessionStorage.getItem(SESSION_KEY)
  return USERS.find(user => user.id === id) || null
}

function esc(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function formatDate(value) {
  if (!value) return '—'
  const [y, m, d] = value.slice(0, 10).split('-')
  return `${d}.${m}.${y}`
}

function formatDateTime(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  }).format(new Date(value))
}

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '')
}

function loadSidebarCollapsed() {
  try {
    return JSON.parse(localStorage.getItem(SIDEBAR_SETTINGS_KEY) || 'false') === true
  } catch (error) {
    localStorage.removeItem(SIDEBAR_SETTINGS_KEY)
    return false
  }
}

function render() {
  if (!currentUser) return renderLogin()
  renderShell()
}

function renderLogin() {
  app.innerHTML = `
    <main class="login-screen">
      <section class="login-card">
        <div class="logo-mark">M</div>
        <h1>Moiseev Admin</h1>
        <p>Выберите сотрудника. Пароли подключим позже.</p>
        <div class="user-grid">
          ${USERS.map(user => `
            <button class="user-choice" data-user="${user.id}">
              <strong>${user.name}</strong>
              <span>${user.role === 'manager' ? 'Руководитель' : 'Администратор'}</span>
            </button>
          `).join('')}
        </div>
        <div class="login-note">Данные пока сохраняются в этом браузере. Используйте резервные копии для переноса и защиты данных.</div>
      </section>
    </main>
  `
  app.querySelectorAll('[data-user]').forEach(button => {
    button.addEventListener('click', () => {
      sessionStorage.setItem(SESSION_KEY, button.dataset.user)
      currentUser = getCurrentUser()
      render()
    })
  })
}

function renderShell() {
  app.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div class="brand"><span class="brand-dot">M</span><div>Moiseev Admin<small>${currentUser.role === 'manager' ? 'Руководитель' : 'Администратор'}</small></div></div>
        <nav class="top-navigation" aria-label="Основные разделы">
          ${navButton('patients', '▦', 'Пациенты')}
          ${navButton('tasks', '✓', 'Задачи')}
          ${currentUser.role === 'manager' ? navButton('analytics', '↗', 'Отчётность') : ''}
        </nav>
        <div class="top-actions">
          <label class="global-search"><span>⌕</span><input id="search" placeholder="Поиск по ФИО или телефону" value="${esc(searchText)}"></label>
          <button class="btn" id="undoBtn" title="Вернуть состояние до последнего сохранения">↶ Отменить</button>
          <button class="btn" id="backupBtn">Скачать бэкап</button>
          <button class="btn" id="restoreBtn">Восстановить</button>
          <input class="hidden" type="file" id="restoreFile" accept="application/json">
          <button class="profile-btn" id="logoutBtn"><b>${esc(currentUser.name)}</b><span>сменить</span></button>
        </div>
      </header>
      <div class="layout">
        <main class="content" id="content"></main>
      </div>
    </div>
  `

  document.querySelector('#search').addEventListener('input', event => {
    searchText = event.target.value
    if (activeTab === 'patients') renderPatients()
    if (activeTab === 'tasks') renderTasks()
  })
  document.querySelector('#logoutBtn').onclick = () => {
    sessionStorage.removeItem(SESSION_KEY)
    currentUser = null
    render()
  }
  document.querySelector('#undoBtn').onclick = undoLastChange
  document.querySelector('#backupBtn').onclick = exportBackup
  document.querySelector('#restoreBtn').onclick = () => document.querySelector('#restoreFile').click()
  document.querySelector('#restoreFile').onchange = importBackup
  document.querySelectorAll('[data-tab]').forEach(button => {
    button.onclick = () => {
      activeTab = button.dataset.tab
      renderShell()
    }
  })

  if (activeTab === 'patients') renderPatients()
  if (activeTab === 'tasks') renderTasks()
  if (activeTab === 'analytics') renderAnalytics()
}

function navButton(tab, icon, label) {
  return `<button class="nav-btn ${activeTab === tab ? 'active' : ''}" data-tab="${tab}" title="${esc(label)}"><span class="nav-icon">${icon}</span><span class="nav-label">${esc(label)}</span></button>`
}

function patientMatches(patient) {
  if (!searchText.trim()) return true
  const query = searchText.trim().toLowerCase()
  return [patient.name, ...(patient.phones || []), patient.doctors?.join(' ')]
    .filter(Boolean)
    .some(value => String(value).toLowerCase().includes(query) || normalizePhone(value).includes(normalizePhone(query)))
}

function historyTimestamp(item) {
  const values = [item?.at, item?.text]
  for (const value of values) {
    const text = String(value || '')
    const localMatch = text.match(/(\d{2})\.(\d{2})\.(\d{4})(?:,\s*|\s+)(\d{1,2}):(\d{2})/)
    if (localMatch) {
      const [, day, month, year, hour, minute] = localMatch
      const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute))
      if (!Number.isNaN(date.getTime())) return date
    }
    if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
      const date = new Date(text)
      if (!Number.isNaN(date.getTime())) return date
    }
  }
  return null
}

function sortedHistory(history = []) {
  return history
    .map((item, index) => ({ item, index, date: historyTimestamp(item) }))
    .sort((a, b) => {
      if (a.date && b.date) return b.date - a.date
      if (a.date) return -1
      if (b.date) return 1
      return a.index - b.index
    })
    .map(entry => entry.item)
}

function historyType(item) {
  const knownTypes = ['admin_comment', 'doctor_comment', 'status', 'task', 'import', 'system', 'comment']
  if (knownTypes.includes(item?.type)) return item.type
  const text = String(item?.text || '')
  if (/статус изменён/i.test(text)) return 'status'
  if (/задач[аи]/i.test(text)) return 'task'
  if (item?.user === 'Импорт' || item?.at === 'Импорт из Google Таблицы') return 'import'
  if (item?.user === 'Система') return 'system'
  return 'comment'
}

function historyTypeLabel(type) {
  return ({
    admin_comment: 'Комментарий администратора', doctor_comment: 'Комментарий врача',
    status: 'Смена статуса', task: 'Задача', import: 'Импортированная запись',
    system: 'Системная запись', comment: 'Комментарий',
  })[type] || 'Событие'
}

function commentDetails(item) {
  const type = historyType(item)
  if (!['admin_comment', 'doctor_comment', 'comment', 'import'].includes(type)) return null

  let author = item.user || 'Неизвестный автор'
  let text = String(item.text || '')
  if (type === 'import') {
    text = text.replace(/^\s*\d{2}\.\d{2}\.\d{4}(?:,\s*|\s+)\d{1,2}:\d{2}\s*/, '')
    const knownAuthors = [...USERS.map(user => user.name), ...DOCTORS, 'Моисеев Г.А', 'Климов Ф.С']
      .sort((a, b) => b.length - a.length)
    const importedAuthor = knownAuthors.find(name => text.startsWith(name) || text.includes(` ${name} `))
    if (importedAuthor) {
      author = importedAuthor
      text = text.replace(importedAuthor, '').trim()
    }
    text = text.replace(/^['"«]\s*/, '').replace(/\s*['"»]\s*$/, '').trim()
  }

  const isDoctor = type === 'doctor_comment' || DOCTORS.some(name => author.replace(/\.$/, '') === name.replace(/\.$/, ''))
  return { author, role: isDoctor ? 'Врач' : 'Администратор', text, type: isDoctor ? 'doctor_comment' : 'admin_comment' }
}

function formatHistoryDate(item) {
  const date = historyTimestamp(item)
  if (!date) return 'Дата не определена'
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(date)
}

function commentHistory(history = []) {
  return sortedHistory(history).filter(item => commentDetails(item))
}

function historyEntryMarkup(item, compact = false) {
  const details = commentDetails(item)
  if (!details) return ''
  const formattedDate = formatHistoryDate(item)
  const [date, time = ''] = formattedDate === 'Дата не определена' ? [formattedDate, ''] : formattedDate.split(', ')
  const icon = details.type === 'doctor_comment' ? '👨‍⚕️' : ['Елизавета', 'Виктория'].includes(details.author) ? '👩' : '👤'
  return `<article class="history-entry history-${details.type} ${compact ? 'compact' : ''}" role="button" tabindex="0" aria-expanded="false" title="Нажмите, чтобы раскрыть комментарий">
    <p class="history-flow"><span class="history-meta"><time>${esc(date)}${time ? `, ${esc(time)}` : ''}</time>&nbsp;&nbsp;<span>${icon}</span> <b>${esc(details.author)}</b>&nbsp;&nbsp;</span><span class="history-comment">“${esc(details.text)}”</span></p>
  </article>`
}

function setupHistoryExpansion(root = document) {
  root.querySelectorAll('.history-entry').forEach(entry => {
    const toggle = () => {
      const expanded = entry.classList.toggle('expanded')
      entry.setAttribute('aria-expanded', String(expanded))
    }
    entry.addEventListener('click', toggle)
    entry.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        toggle()
      }
    })
  })
}

function historyPreview(patient) {
  const entries = commentHistory(patient.history).slice(0, 1)
  return `<div class="history-preview">
    ${entries.length ? entries.map(item => historyEntryMarkup(item, true)).join('') : '<span class="history-empty">История пуста</span>'}
    <button class="history-link" data-full-history="${patient.id}">Вся история</button>
  </div>`
}

function loadPatientTableSettings() {
  const defaultOrder = PATIENT_COLUMNS.map(column => column.key)
  const defaultWidths = Object.fromEntries(PATIENT_COLUMNS.map(column => [column.key, column.width]))
  try {
    const saved = JSON.parse(localStorage.getItem(TABLE_SETTINGS_KEY) || '{}')
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw new Error('Неверный формат настроек таблицы')
    const savedOrder = Array.isArray(saved.order) ? saved.order.filter(key => defaultOrder.includes(key)) : []
    const order = [...new Set([...savedOrder, ...defaultOrder])]
    const widths = { ...defaultWidths }
    const rowHeights = {}
    for (const key of defaultOrder) {
      const width = Number(saved.widths?.[key])
      if (Number.isFinite(width)) widths[key] = Math.max(70, Math.min(800, width))
    }
    if (widths.history === 360) widths.history = 450
    if (saved.rowHeights && typeof saved.rowHeights === 'object' && !Array.isArray(saved.rowHeights)) {
      for (const [patientId, savedHeight] of Object.entries(saved.rowHeights)) {
        const height = Number(savedHeight)
        if (Number.isFinite(height)) rowHeights[patientId] = Math.max(52, Math.min(700, height))
      }
    }
    return { order, widths, rowHeights }
  } catch (error) {
    localStorage.removeItem(TABLE_SETTINGS_KEY)
    return { order: defaultOrder, widths: defaultWidths, rowHeights: {} }
  }
}

function savePatientTableSettings(settings) {
  localStorage.setItem(TABLE_SETTINGS_KEY, JSON.stringify(settings))
}

function setupPatientTableColumns() {
  const table = document.querySelector('.patient-table')
  if (!table) return
  const settings = loadPatientTableSettings()
  const headerRow = table.tHead.rows[0]
  const headers = [...headerRow.cells]
  const rows = [...table.tBodies[0].rows]

  headers.forEach((header, index) => {
    const key = PATIENT_COLUMNS[index].key
    header.dataset.columnKey = key
    header.draggable = true
  })
  rows.forEach(row => [...row.cells].forEach((cell, index) => {
    if (PATIENT_COLUMNS[index]) cell.dataset.columnKey = PATIENT_COLUMNS[index].key
  }))

  const applySettings = () => {
    const headerMap = new Map([...headerRow.cells].map(cell => [cell.dataset.columnKey, cell]))
    const rowMaps = rows.map(row => new Map([...row.cells].map(cell => [cell.dataset.columnKey, cell])))
    settings.order.forEach(key => {
      const header = headerMap.get(key)
      if (header) headerRow.append(header)
      rows.forEach((row, index) => {
        const cell = rowMaps[index].get(key)
        if (cell) row.append(cell)
      })
    })

    table.querySelector('colgroup')?.remove()
    const colgroup = document.createElement('colgroup')
    settings.order.forEach(key => {
      const column = document.createElement('col')
      column.dataset.columnKey = key
      column.style.width = `${settings.widths[key]}px`
      colgroup.append(column)
    })
    table.prepend(colgroup)
    const totalWidth = settings.order.reduce((sum, key) => sum + settings.widths[key], 0)
    table.style.width = `${totalWidth}px`
    table.style.minWidth = `${totalWidth}px`
    rows.forEach(row => {
      const patientId = row.dataset.patient
      if (!patientId) return
      const height = settings.rowHeights[patientId]
      row.style.height = height ? `${height}px` : ''
      if (height) {
        row.dataset.rowHeight = String(height)
        row.style.setProperty('--row-height', `${height}px`)
      } else {
        delete row.dataset.rowHeight
        row.style.removeProperty('--row-height')
      }
      const handle = row.querySelector('.row-resizer')
      if (handle && row.cells[0]) row.cells[0].append(handle)
    })
  }

  headers.forEach(header => {
    const handle = document.createElement('span')
    handle.className = 'column-resizer'
    handle.title = 'Изменить ширину столбца'
    header.append(handle)

    handle.addEventListener('pointerdown', event => {
      event.preventDefault()
      event.stopPropagation()
      const key = header.dataset.columnKey
      const startX = event.clientX
      const startWidth = settings.widths[key]
      handle.classList.add('active')
      document.body.classList.add('resizing-column')
      const move = moveEvent => {
        settings.widths[key] = Math.max(70, Math.min(800, startWidth + moveEvent.clientX - startX))
        applySettings()
      }
      const stop = () => {
        document.removeEventListener('pointermove', move)
        document.removeEventListener('pointerup', stop)
        handle.classList.remove('active')
        document.body.classList.remove('resizing-column')
        savePatientTableSettings(settings)
      }
      document.addEventListener('pointermove', move)
      document.addEventListener('pointerup', stop)
    })
    handle.addEventListener('dblclick', event => {
      event.preventDefault()
      event.stopPropagation()
      const key = header.dataset.columnKey
      settings.widths[key] = PATIENT_COLUMNS.find(column => column.key === key)?.width || 150
      savePatientTableSettings(settings)
      applySettings()
    })

    header.addEventListener('dragstart', event => {
      if (event.target.classList.contains('column-resizer')) return event.preventDefault()
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', header.dataset.columnKey)
      header.classList.add('dragging')
    })
    header.addEventListener('dragend', () => {
      header.classList.remove('dragging')
      headers.forEach(item => item.classList.remove('drag-over'))
    })
    header.addEventListener('dragover', event => {
      event.preventDefault()
      header.classList.add('drag-over')
    })
    header.addEventListener('dragleave', () => header.classList.remove('drag-over'))
    header.addEventListener('drop', event => {
      event.preventDefault()
      const sourceKey = event.dataTransfer.getData('text/plain')
      const targetKey = header.dataset.columnKey
      if (!settings.order.includes(sourceKey) || sourceKey === targetKey) return
      settings.order = settings.order.filter(key => key !== sourceKey)
      const targetIndex = settings.order.indexOf(targetKey)
      const insertAfter = event.clientX > header.getBoundingClientRect().left + header.offsetWidth / 2
      settings.order.splice(targetIndex + (insertAfter ? 1 : 0), 0, sourceKey)
      savePatientTableSettings(settings)
      applySettings()
    })
  })

  rows.forEach(row => {
    const patientId = row.dataset.patient
    if (!patientId) return
    ;[...row.cells].forEach(cell => {
      if (cell.querySelector(':scope > .cell-content')) return
      const content = document.createElement('div')
      content.className = 'cell-content'
      content.append(...cell.childNodes)
      cell.append(content)
    })
    const handle = document.createElement('span')
    handle.className = 'row-resizer'
    handle.title = 'Изменить высоту строки'
    row.cells[0].append(handle)
    handle.addEventListener('pointerdown', event => {
      event.preventDefault()
      event.stopPropagation()
      const startY = event.clientY
      const startHeight = row.getBoundingClientRect().height
      handle.classList.add('active')
      document.body.classList.add('resizing-row')
      const move = moveEvent => {
        settings.rowHeights[patientId] = Math.max(52, Math.min(700, startHeight + moveEvent.clientY - startY))
        applySettings()
      }
      const stop = () => {
        document.removeEventListener('pointermove', move)
        document.removeEventListener('pointerup', stop)
        handle.classList.remove('active')
        document.body.classList.remove('resizing-row')
        savePatientTableSettings(settings)
      }
      document.addEventListener('pointermove', move)
      document.addEventListener('pointerup', stop)
    })
    handle.addEventListener('dblclick', event => {
      event.preventDefault()
      event.stopPropagation()
      delete settings.rowHeights[patientId]
      savePatientTableSettings(settings)
      applySettings()
    })
  })

  applySettings()
}

function initializePatientTableColumns() {
  try {
    setupPatientTableColumns()
  } catch (error) {
    console.warn('Настройки столбцов повреждены, восстанавливаю стандартный вид таблицы', error)
    localStorage.removeItem(TABLE_SETTINGS_KEY)
    try {
      setupPatientTableColumns()
    } catch (retryError) {
      console.warn('Дополнительные настройки таблицы отключены, основная таблица продолжает работу', retryError)
    }
  }
}

function renderPatients() {
  const content = document.querySelector('#content')
  const patients = [...state.patients]
    .filter(patientMatches)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

  const today = todayISO()
  const openTasks = state.tasks.filter(task => task.status === 'open')
  const todayCount = openTasks.filter(task => task.dueDate === today).length
  const overdueCount = openTasks.filter(task => task.dueDate < today).length
  const recallCount = openTasks.filter(task => task.type === 'recall').length

  content.innerHTML = `
    <section class="page-head">
      <div><h1>Пациенты</h1><p>Данные перенесены из листа «Пациенты Моисеев»</p></div>
      <button class="btn primary" id="newPatient">+ Новый пациент</button>
    </section>
    <section class="summary-strip">
      <button class="summary-item" data-open-tasks="today"><b>${todayCount}</b><span>задач на сегодня</span></button>
      <button class="summary-item danger" data-open-tasks="overdue"><b>${overdueCount}</b><span>просрочено</span></button>
      <button class="summary-item" data-open-tasks="recall"><b>${recallCount}</b><span>профосмотров</span></button>
      <div class="summary-item"><b>${state.patients.length}</b><span>пациентов всего</span></div>
    </section>
    <section class="table-card">
      <div class="table-scroll">
        <table class="patient-table">
          <thead><tr>
            <th>ФИО</th>
            <th>Дата создания</th>
            <th>Врач</th>
            <th>Дата приёма</th>
            <th>Комментарий врача</th>
            <th>Следующее действие</th>
            <th>Кто изменил</th>
            <th>Статус</th>
            <th>Комментарий администратора</th>
            <th>История</th>
            <th>Ближайшая задача</th>
            <th>Профосмотр</th>
            <th>❗</th>
          </tr></thead>
          <tbody>
            ${patients.length ? patients.map(patientRow).join('') : `<tr><td class="empty-row" colspan="13">Пациентов пока нет</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `

  initializePatientTableColumns()
  setupHistoryExpansion(content)
  document.querySelector('#newPatient').onclick = () => openPatientModal()
  document.querySelectorAll('[data-open-patient]').forEach(button => button.onclick = () => openPatientModal(button.dataset.openPatient))
  setupInlineCommentInputs(content)
  document.querySelectorAll('[data-full-history]').forEach(button => {
    button.addEventListener('click', () => openHistoryModal(button.dataset.fullHistory))
  })
  document.querySelectorAll('[data-quick-status]').forEach(select => {
    ;['pointerdown','mousedown','click'].forEach(type => select.addEventListener(type, event => event.stopPropagation()))
    select.addEventListener('change', event => {
      event.stopPropagation()
      const patient = state.patients.find(p => p.id === select.dataset.quickStatus)
      if (!patient) return
      patient.status = select.value
      patient.updatedAt = new Date().toISOString()
      patient.updatedBy = currentUser.name
      patient.history ||= []
      patient.history.unshift({ id: uid(), at: new Date().toISOString(), user: currentUser.name, type: 'status', text: `Статус изменён на «${select.value || 'Без статуса'}»` })
      saveState(`Изменён статус: ${patient.name}`)
    })
  })
  document.querySelectorAll('[data-open-tasks]').forEach(button => {
    button.onclick = () => {
      activeTaskFilter = button.dataset.openTasks
      activeTab = 'tasks'
      renderShell()
    }
  })
}

function patientRow(patient) {
  const tasks = state.tasks.filter(task => task.patientId === patient.id && task.status === 'open')
  const nearest = [...tasks].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]
  const recall = [...tasks].filter(task => task.type === 'recall').sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]
  return `
    <tr data-patient="${patient.id}">
      <td><button class="patient-name-btn" data-open-patient="${patient.id}"><strong>${esc(patient.name)}</strong><small>${esc((patient.phones || []).join(' · '))}</small></button><button class="patient-edit-btn" data-open-patient="${patient.id}">Открыть карточку</button></td>
      <td>${formatDate(patient.createdAt)}</td>
      <td>${esc((patient.doctors || []).join(', ') || '—')}</td>
      <td>${formatDate(patient.appointmentDate)}</td>
      <td class="wrap-cell">${inlineCommentMarkup(patient, 'doctor')}</td>
      <td class="wrap-cell">${esc(patient.nextAction || nearest?.title || '—')}</td>
      <td>${esc(patient.updatedBy || '—')}</td>
      <td><select class="table-select" data-quick-status="${patient.id}" aria-label="Статус пациента">${STATUS_OPTIONS.map(status => `<option value="${esc(status)}" ${status === (patient.status || '') ? 'selected' : ''}>${esc(status || 'Без статуса')}</option>`).join('')}</select></td>
      <td class="wrap-cell">${inlineCommentMarkup(patient, 'admin')}</td>
      <td class="history-cell">${historyPreview(patient)}</td>
      <td class="date-cell ${nearest && nearest.dueDate < todayISO() ? 'late' : ''}">${nearest ? `${formatDate(nearest.dueDate)}<small>${esc(nearest.title)}</small>` : '—'}</td>
      <td class="date-cell">${recall ? `${formatDate(recall.dueDate)}<small>${esc(recall.title)}</small>` : '—'}</td>
      <td>${patient.urgent ? '<span class="urgent">!</span>' : ''}</td>
    </tr>
  `
}

function inlineCommentMarkup(patient, kind) {
  const isDoctor = kind === 'doctor'
  const lastComment = isDoctor ? patient.doctorComment : patient.adminNote
  if (lastComment) {
    return `<button class="inline-comment-existing" type="button" data-existing-comment="${patient.id}" data-comment-kind="${kind}" title="Нажмите, чтобы добавить новый комментарий">${esc(lastComment)}</button>`
  }
  return `<div class="inline-comment" data-comment-kind="${kind}">
    <div class="inline-comment-compose">
      <textarea class="inline-comment-input" data-inline-comment="${patient.id}" rows="1" placeholder="Комментарий…" aria-label="Новый комментарий ${isDoctor ? 'врача' : 'администратора'}"></textarea>
      <button class="inline-comment-save" type="button" title="Сохранить комментарий" aria-label="Сохранить комментарий">✓</button>
    </div>
  </div>`
}

function setupInlineCommentInputs(root) {
  root.querySelectorAll('[data-existing-comment]').forEach(button => {
    ;['pointerdown', 'mousedown', 'click'].forEach(type => button.addEventListener(type, event => event.stopPropagation()))
    button.addEventListener('click', () => openQuickCommentModal(button.dataset.existingComment, button.dataset.commentKind))
  })

  root.querySelectorAll('[data-inline-comment]').forEach(textarea => {
    const compose = textarea.closest('.inline-comment-compose')
    const saveButton = compose.querySelector('.inline-comment-save')
    const stopCellAction = event => event.stopPropagation()
    ;['pointerdown', 'mousedown', 'click'].forEach(type => textarea.addEventListener(type, stopCellAction))
    ;['pointerdown', 'mousedown', 'click'].forEach(type => saveButton.addEventListener(type, stopCellAction))

    const updateInputState = () => compose.classList.toggle('has-value', Boolean(textarea.value.trim()))
    const saveComment = () => {
      const text = textarea.value.trim()
      if (!text) return textarea.focus()
      const patient = state.patients.find(item => item.id === textarea.dataset.inlineComment)
      if (!patient) return
      const isDoctor = textarea.closest('[data-comment-kind]').dataset.commentKind === 'doctor'
      const updatedAt = new Date().toISOString()
      patient.history ||= []
      patient.history.unshift({ id: uid(), at: updatedAt, user: currentUser.name, type: isDoctor ? 'doctor_comment' : 'admin_comment', text })
      if (isDoctor) patient.doctorComment = text
      else patient.adminNote = text
      patient.updatedAt = updatedAt
      patient.updatedBy = currentUser.name
      saveState(`${isDoctor ? 'Добавлен комментарий врача' : 'Добавлен комментарий администратора'}: ${patient.name}`)
      renderPatients()
    }

    textarea.addEventListener('input', updateInputState)
    textarea.addEventListener('keydown', event => {
      if (event.ctrlKey && event.key === 'Enter') {
        event.preventDefault()
        saveComment()
      }
    })
    saveButton.addEventListener('click', saveComment)
    updateInputState()
  })
}

function openQuickCommentModal(patientId, kind = 'admin') {
  const patient = state.patients.find(p => p.id === patientId)
  if (!patient) return
  const isDoctor = kind === 'doctor'

  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal" id="quickCommentModal">
      <div class="dialog quick-comment-dialog" role="dialog" aria-modal="true" aria-labelledby="quickCommentTitle">
        <div class="dialog-head">
          <div><h2 id="quickCommentTitle">${isDoctor ? 'Комментарий врача' : 'Комментарий администратора'}</h2><p>${esc(patient.name)}</p></div>
        </div>
        <label class="field quick-comment-field"><span>Новый комментарий</span><textarea id="quickCommentText" rows="8" aria-label="Введите новый комментарий"></textarea></label>
        <div class="dialog-actions"><button class="btn" id="cancelQuickComment">Отмена</button><button class="btn primary" id="saveQuickComment">Сохранить</button></div>
      </div>
    </div>
  `)

  const modal = document.querySelector('#quickCommentModal')
  const textarea = modal.querySelector('#quickCommentText')

  const closeModal = () => {
    document.removeEventListener('keydown', handleEscape)
    modal.remove()
  }
  const handleEscape = event => {
    if (event.key === 'Escape') closeModal()
  }
  const saveComment = () => {
    const text = textarea.value.trim()
    if (!text) return textarea.focus()
    const updatedAt = new Date().toISOString()
    const type = isDoctor ? 'doctor_comment' : 'admin_comment'
    patient.history ||= []
    patient.history.unshift({ id: uid(), at: updatedAt, user: currentUser.name, type, text })
    if (isDoctor) patient.doctorComment = text
    else patient.adminNote = text
    patient.updatedAt = updatedAt
    patient.updatedBy = currentUser.name
    saveState(`${isDoctor ? 'Добавлен комментарий врача' : 'Добавлен комментарий администратора'}: ${patient.name}`)
    closeModal()
    renderPatients()
  }

  modal.addEventListener('click', event => {
    if (event.target === modal) closeModal()
  })
  modal.querySelector('#cancelQuickComment').onclick = closeModal
  modal.querySelector('#saveQuickComment').onclick = saveComment
  textarea.addEventListener('keydown', event => {
    if (event.ctrlKey && event.key === 'Enter') {
      event.preventDefault()
      saveComment()
    }
  })
  document.addEventListener('keydown', handleEscape)
  requestAnimationFrame(() => textarea.focus())
}

function openHistoryModal(patientId) {
  const patient = state.patients.find(p => p.id === patientId)
  if (!patient) return
  const entries = commentHistory(patient.history)
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal" id="historyModal">
      <div class="dialog history-dialog" role="dialog" aria-modal="true" aria-labelledby="historyTitle">
        <div class="dialog-head"><div><h2 id="historyTitle">История пациента</h2><p>${esc(patient.name)}</p></div><button class="icon-btn" id="closeHistory" aria-label="Закрыть">×</button></div>
        <div class="full-history-list">${entries.length ? entries.map(item => historyEntryMarkup(item)).join('') : '<div class="empty-box">История пока пустая</div>'}</div>
      </div>
    </div>
  `)
  const modal = document.querySelector('#historyModal')
  setupHistoryExpansion(modal)
  const closeModal = () => {
    document.removeEventListener('keydown', handleEscape)
    modal.remove()
  }
  const handleEscape = event => {
    if (event.key === 'Escape') closeModal()
  }
  modal.querySelector('#closeHistory').onclick = closeModal
  modal.addEventListener('click', event => {
    if (event.target === modal) closeModal()
  })
  document.addEventListener('keydown', handleEscape)
}

function openPatientModal(patientId = null) {
  const original = state.patients.find(p => p.id === patientId)
  const patient = original ? cloneData(original) : {
    id: uid(), name: '', phones: [''], doctors: ['Моисеев Г.А.'], appointmentDate: '',
    doctorComment: '', nextAction: '', status: '', adminNote: '', urgent: false,
    createdAt: todayISO(), updatedAt: new Date().toISOString(), updatedBy: currentUser.name,
    history: [], externalId: null,
  }
  const patientTasks = state.tasks
    .filter(task => task.patientId === patient.id)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))

  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal" id="patientModal">
      <div class="dialog wide-dialog">
        <div class="dialog-head">
          <div><h2>${original ? 'Карточка пациента' : 'Новый пациент'}</h2><p>${original ? esc(patient.name) : 'Заполните данные пациента'}</p></div>
          <button class="icon-btn" data-close>×</button>
        </div>
        <div class="patient-form-grid">
          <label class="field span-2"><span>ФИО</span><input id="pName" value="${esc(patient.name)}" placeholder="Фамилия Имя Отчество"></label>
          <label class="field"><span>Основной телефон</span><input id="pPhone1" value="${esc(patient.phones?.[0] || '')}"></label>
          <label class="field"><span>Дополнительный телефон</span><input id="pPhone2" value="${esc(patient.phones?.[1] || '')}"></label>
          <label class="field"><span>Врачи</span><input id="pDoctors" value="${esc((patient.doctors || []).join(', '))}" placeholder="Можно указать нескольких через запятую"></label>
          <label class="field"><span>Дата приёма</span><input id="pAppointment" type="date" value="${patient.appointmentDate || ''}"></label>
          <label class="field"><span>Статус</span><select id="pStatus">${STATUS_OPTIONS.map(status => `<option value="${esc(status)}" ${status === patient.status ? 'selected' : ''}>${esc(status || 'Без статуса')}</option>`).join('')}</select></label>
          <label class="field"><span>Следующее действие</span><input id="pNextAction" value="${esc(patient.nextAction || '')}"></label>
          <label class="field span-2"><span>Что сделали / комментарий врача</span><textarea id="pDoctorComment">${esc(patient.doctorComment || '')}</textarea></label>
          <label class="field span-2"><span>Новое примечание администратора</span><textarea id="pNewNote" placeholder="После сохранения запись попадёт в неизменяемую историю"></textarea></label>
          <label class="check-field"><input id="pUrgent" type="checkbox" ${patient.urgent ? 'checked' : ''}> <span>❗ Срочно</span></label>
        </div>

        <div class="section-title"><div><h3>Задачи пациента</h3><p>Обзвоны, профосмотры и приёмы не конфликтуют между собой</p></div><button class="btn" id="addTaskBtn">+ Добавить задачу</button></div>
        <div class="patient-task-list">
          ${patientTasks.length ? patientTasks.map(taskCard).join('') : '<div class="empty-box">Задач пока нет</div>'}
        </div>

        <div class="section-title"><div><h3>История</h3><p>Записи нельзя редактировать или удалять</p></div></div>
        <div class="history-list">
          ${commentHistory(patient.history).length ? commentHistory(patient.history).map(item => historyEntryMarkup(item)).join('') : '<div class="empty-box">История пока пустая</div>'}
        </div>
        <div class="dialog-actions"><button class="btn" data-close>Отмена</button><button class="btn primary" id="savePatient">Сохранить</button></div>
      </div>
    </div>
  `)

  const modal = document.querySelector('#patientModal')
  setupHistoryExpansion(modal)
  modal.querySelectorAll('select, input, textarea, button').forEach(control => {
    ;['pointerdown','mousedown','click'].forEach(type => control.addEventListener(type, event => event.stopPropagation()))
  })
  modal.querySelectorAll('[data-close]').forEach(button => button.onclick = () => modal.remove())
  modal.querySelector('#addTaskBtn').onclick = () => openTaskModal(null, patient.id)
  modal.querySelectorAll('[data-edit-task]').forEach(button => button.onclick = () => openTaskModal(button.dataset.editTask, patient.id))
  modal.querySelector('#savePatient').onclick = () => {
    const name = modal.querySelector('#pName').value.trim()
    if (!name) return alert('Укажите ФИО пациента')
    const phone1 = modal.querySelector('#pPhone1').value.trim()
    const duplicate = state.patients.find(p => p.id !== patient.id && (p.name || '').trim().toLowerCase() === name.toLowerCase())
    if (duplicate && !confirm(`Пациент «${duplicate.name}» уже есть в базе. Всё равно сохранить ещё одну карточку?`)) return
    const note = modal.querySelector('#pNewNote').value.trim()
    const previousDoctorComment = patient.doctorComment || ''
    patient.name = name
    patient.phones = [phone1, modal.querySelector('#pPhone2').value.trim()].filter(Boolean)
    patient.doctors = modal.querySelector('#pDoctors').value.split(',').map(v => v.trim()).filter(Boolean)
    patient.appointmentDate = modal.querySelector('#pAppointment').value
    patient.status = modal.querySelector('#pStatus').value
    patient.nextAction = modal.querySelector('#pNextAction').value.trim()
    patient.doctorComment = modal.querySelector('#pDoctorComment').value.trim()
    patient.urgent = modal.querySelector('#pUrgent').checked
    patient.updatedAt = new Date().toISOString()
    patient.updatedBy = currentUser.name
    patient.history ||= []
    if (note) {
      patient.adminNote = note
      patient.history.unshift({ id: uid(), at: new Date().toISOString(), user: currentUser.name, type: 'admin_comment', text: note })
    }
    if (patient.doctorComment && patient.doctorComment !== previousDoctorComment) {
      patient.history.unshift({ id: uid(), at: new Date().toISOString(), user: currentUser.name, type: 'doctor_comment', text: patient.doctorComment })
    }
    if (original) Object.assign(original, patient)
    else state.patients.push(patient)
    saveState(original ? `Изменена карточка: ${patient.name}` : `Создан пациент: ${patient.name}`)
    modal.remove()
    renderPatients()
  }
}

function taskCard(task) {
  const type = TASK_TYPES.find(t => t.value === task.type)?.label || 'Задача'
  return `<button class="patient-task ${task.status}" data-edit-task="${task.id}"><span>${type}</span><strong>${esc(task.title)}</strong><time>${formatDate(task.dueDate)}</time><small>${esc(task.assignee || 'Без ответственного')} · ${task.status === 'done' ? 'Выполнена' : task.status === 'cancelled' ? 'Отменена' : 'Открыта'}</small></button>`
}

function renderTasks() {
  const content = document.querySelector('#content')
  const today = todayISO()
  const filtered = state.tasks.filter(task => {
    const patient = state.patients.find(p => p.id === task.patientId)
    if (searchText && !patientMatches(patient || {})) return false
    if (activeTaskFilter === 'today') return task.status === 'open' && task.dueDate === today
    if (activeTaskFilter === 'overdue') return task.status === 'open' && task.dueDate < today
    if (activeTaskFilter === 'upcoming') return task.status === 'open' && task.dueDate > today
    if (activeTaskFilter === 'recall') return task.status === 'open' && task.type === 'recall'
    if (activeTaskFilter === 'done') return task.status === 'done'
    return true
  }).sort((a, b) => a.dueDate.localeCompare(b.dueDate))

  content.innerHTML = `
    <section class="page-head"><div><h1>Задачи</h1><p>У пациента может быть любое количество независимых дат</p></div><button class="btn primary" id="newTask">+ Новая задача</button></section>
    <div class="filter-tabs">
      ${taskFilterButton('today', 'Сегодня')}${taskFilterButton('overdue', 'Просрочено')}${taskFilterButton('upcoming', 'Будущие')}${taskFilterButton('recall', 'Профосмотры')}${taskFilterButton('done', 'Выполненные')}${taskFilterButton('all', 'Все')}
    </div>
    <section class="task-list">
      ${filtered.length ? filtered.map(taskRow).join('') : '<div class="empty-box large">В этой группе задач нет</div>'}
    </section>
  `
  document.querySelector('#newTask').onclick = () => openTaskModal()
  document.querySelectorAll('[data-filter]').forEach(button => button.onclick = () => { activeTaskFilter = button.dataset.filter; renderTasks() })
  document.querySelectorAll('[data-task]').forEach(row => row.onclick = () => openTaskModal(row.dataset.task))
  document.querySelectorAll('[data-complete]').forEach(button => {
    button.onclick = event => {
      event.stopPropagation()
      const task = state.tasks.find(t => t.id === button.dataset.complete)
      task.status = 'done'
      task.completedAt = new Date().toISOString()
      task.completedBy = currentUser.name
      saveState(`Выполнена задача: ${task.title}`)
      renderTasks()
    }
  })
}

function taskFilterButton(value, label) {
  return `<button class="filter-btn ${activeTaskFilter === value ? 'active' : ''}" data-filter="${value}">${label}</button>`
}

function taskRow(task) {
  const patient = state.patients.find(p => p.id === task.patientId)
  const overdue = task.status === 'open' && task.dueDate < todayISO()
  return `<article class="task-row ${overdue ? 'overdue' : ''}" data-task="${task.id}">
    <div class="task-date"><b>${formatDate(task.dueDate).slice(0, 5)}</b><span>${formatDate(task.dueDate).slice(6)}</span></div>
    <div class="task-main"><span>${TASK_TYPES.find(t => t.value === task.type)?.label || 'Задача'}</span><strong>${esc(task.title)}</strong><small>${esc(task.note || '')}</small></div>
    <div class="task-patient"><b>${esc(patient?.name || 'Пациент удалён')}</b><span>${esc(patient?.phones?.[0] || '')}</span></div>
    <div class="task-owner"><b>${esc(task.assignee || '—')}</b><span>${task.status === 'open' ? 'Открыта' : task.status === 'done' ? 'Выполнена' : 'Отменена'}</span></div>
    ${task.status === 'open' ? `<button class="complete-btn" data-complete="${task.id}">✓</button>` : ''}
  </article>`
}

function openTaskModal(taskId = null, presetPatientId = null) {
  const original = state.tasks.find(task => task.id === taskId)
  const task = original ? cloneData(original) : {
    id: uid(), patientId: presetPatientId || '', type: 'call', title: 'Позвонить пациенту',
    dueDate: todayISO(), assignee: currentUser.role === 'admin' ? currentUser.name : 'Елизавета',
    note: '', status: 'open', createdAt: new Date().toISOString(), createdBy: currentUser.name,
  }

  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal" id="taskModal"><div class="dialog task-dialog">
      <div class="dialog-head"><div><h2>${original ? 'Редактирование задачи' : 'Новая задача'}</h2><p>Отдельная дата, не меняющая другие задачи пациента</p></div><button class="icon-btn" data-close>×</button></div>
      <div class="task-form">
        <label class="field"><span>Пациент</span><select id="tPatient"><option value="">Выберите пациента</option>${[...state.patients].sort((a,b)=>a.name.localeCompare(b.name)).map(p => `<option value="${p.id}" ${p.id === task.patientId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
        <label class="field"><span>Тип</span><select id="tType">${TASK_TYPES.map(t => `<option value="${t.value}" ${t.value === task.type ? 'selected' : ''}>${t.label}</option>`).join('')}</select></label>
        <label class="field span-2"><span>Что нужно сделать</span><input id="tTitle" value="${esc(task.title)}"></label>
        <label class="field"><span>Дата</span><input id="tDate" type="date" value="${task.dueDate}"></label>
        <label class="field"><span>Ответственный</span><select id="tAssignee">${USERS.filter(u=>u.role==='admin').map(u => `<option ${u.name === task.assignee ? 'selected' : ''}>${u.name}</option>`).join('')}</select></label>
        <label class="field span-2"><span>Комментарий</span><textarea id="tNote">${esc(task.note || '')}</textarea></label>
        <label class="field"><span>Статус</span><select id="tStatus"><option value="open" ${task.status==='open'?'selected':''}>Открыта</option><option value="done" ${task.status==='done'?'selected':''}>Выполнена</option><option value="cancelled" ${task.status==='cancelled'?'selected':''}>Отменена</option></select></label>
      </div>
      <div class="quick-dates"><button data-plus="1">Завтра</button><button data-plus="3">Через 3 дня</button><button data-plus="7">Через неделю</button><button data-plus="180">Через полгода</button></div>
      <div class="dialog-actions">${original ? '<button class="btn danger-text" id="deleteTask">Удалить</button>' : ''}<span></span><button class="btn" data-close>Отмена</button><button class="btn primary" id="saveTask">Сохранить</button></div>
    </div></div>
  `)

  const modal = document.querySelector('#taskModal')
  modal.querySelectorAll('select, input, textarea, button').forEach(control => {
    ;['pointerdown','mousedown','click'].forEach(type => control.addEventListener(type, event => event.stopPropagation()))
  })
  modal.querySelectorAll('[data-close]').forEach(b => b.onclick = () => modal.remove())
  modal.querySelectorAll('[data-plus]').forEach(b => b.onclick = () => modal.querySelector('#tDate').value = datePlus(Number(b.dataset.plus)))
  if (original) modal.querySelector('#deleteTask').onclick = () => {
    if (!confirm('Удалить эту задачу?')) return
    state.tasks = state.tasks.filter(t => t.id !== original.id)
    saveState(`Удалена задача: ${original.title}`)
    modal.remove()
    refreshCurrentView()
  }
  modal.querySelector('#saveTask').onclick = () => {
    const patientId = modal.querySelector('#tPatient').value
    const title = modal.querySelector('#tTitle').value.trim()
    if (!patientId) return alert('Выберите пациента')
    if (!title) return alert('Укажите, что нужно сделать')
    Object.assign(task, {
      patientId,
      type: modal.querySelector('#tType').value,
      title,
      dueDate: modal.querySelector('#tDate').value,
      assignee: modal.querySelector('#tAssignee').value,
      note: modal.querySelector('#tNote').value.trim(),
      status: modal.querySelector('#tStatus').value,
      updatedAt: new Date().toISOString(), updatedBy: currentUser.name,
    })
    if (original) Object.assign(original, task)
    else state.tasks.push(task)
    const patient = state.patients.find(p => p.id === patientId)
    if (patient) {
      patient.history ||= []
      patient.history.unshift({ id: uid(), at: new Date().toISOString(), user: currentUser.name, type: 'task', text: `${original ? 'Изменена' : 'Создана'} задача «${title}» на ${formatDate(task.dueDate)}` })
      patient.updatedBy = currentUser.name
      patient.updatedAt = new Date().toISOString()
    }
    saveState(`${original ? 'Изменена' : 'Создана'} задача: ${title}`)
    modal.remove()
    refreshCurrentView()
  }
}

function refreshCurrentView() {
  const patientModal = document.querySelector('#patientModal')
  if (patientModal) patientModal.remove()
  if (activeTab === 'tasks') renderTasks()
  else renderPatients()
}

function renderAnalytics() {
  const content = document.querySelector('#content')
  if (currentUser.role !== 'manager') {
    activeTab = 'patients'; return renderPatients()
  }
  const today = todayISO()
  const monthStart = `${today.slice(0, 7)}-01`
  const monthTasks = state.tasks.filter(t => t.createdAt?.slice(0,10) >= monthStart)
  const completed = state.tasks.filter(t => t.status === 'done' && t.completedAt?.slice(0,10) >= monthStart)
  const adminStats = USERS.filter(u => u.role === 'admin').map(user => {
    const created = monthTasks.filter(t => t.createdBy === user.name).length
    const done = completed.filter(t => t.completedBy === user.name).length
    const notes = state.patients.reduce((sum, p) => sum + (p.history || []).filter(h => h.user === user.name && parseHistoryDate(h) >= monthStart).length, 0)
    return { user: user.name, created, done, notes }
  })
  const statusCounts = STATUS_OPTIONS.filter(Boolean).map(status => ({ status, count: state.patients.filter(p => p.status === status).length }))

  content.innerHTML = `
    <section class="page-head"><div><h1>Отчётность</h1><p>Доступна только руководителям</p></div></section>
    <section class="analytics-cards">
      <div class="analytics-card"><span>Пациентов</span><b>${state.patients.length}</b></div>
      <div class="analytics-card"><span>Открытых задач</span><b>${state.tasks.filter(t=>t.status==='open').length}</b></div>
      <div class="analytics-card"><span>Просроченных</span><b>${state.tasks.filter(t=>t.status==='open'&&t.dueDate<today).length}</b></div>
      <div class="analytics-card"><span>Выполнено за месяц</span><b>${completed.length}</b></div>
    </section>
    <div class="analytics-grid">
      <section class="panel"><h2>Работа администраторов за месяц</h2>
        <table class="simple-table"><thead><tr><th>Администратор</th><th>Комментарии</th><th>Создано задач</th><th>Выполнено задач</th></tr></thead><tbody>
          ${adminStats.map(s=>`<tr><td><strong>${s.user}</strong></td><td>${s.notes}</td><td>${s.created}</td><td>${s.done}</td></tr>`).join('')}
        </tbody></table>
      </section>
      <section class="panel"><h2>Пациенты по статусам</h2><div class="status-bars">
        ${statusCounts.map(item => `<div><span>${esc(item.status)}</span><b>${item.count}</b><i style="--w:${state.patients.length ? Math.max(3, item.count/state.patients.length*100) : 3}%"></i></div>`).join('')}
      </div></section>
    </div>
    <section class="panel audit-panel"><h2>Последние действия</h2>
      <div class="audit-list">${state.audit.slice(0,30).map(a=>`<div><time>${formatDateTime(a.at)}</time><b>${esc(a.user)}</b><span>${esc(a.action)}</span></div>`).join('') || '<div class="empty-box">Действий пока нет</div>'}</div>
    </section>
  `
}

function parseHistoryDate(item) {
  const date = historyTimestamp(item)
  if (!date) return '0000-00-00'
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function exportBackup() {
  const blob = new Blob([JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `moiseev-crm-backup-${todayISO()}.json`
  link.click()
  URL.revokeObjectURL(link.href)
}

async function importBackup(event) {
  const file = event.target.files?.[0]
  if (!file) return
  try {
    const data = JSON.parse(await file.text())
    if (!Array.isArray(data.patients) || !Array.isArray(data.tasks)) throw new Error('Неверный формат')
    if (!confirm(`Восстановить бэкап: ${data.patients.length} пациентов и ${data.tasks.length} задач? Текущие данные будут заменены.`)) return
    state = { version: 3, patients: data.patients, tasks: data.tasks, audit: data.audit || [], updatedAt: new Date().toISOString() }
    saveState('Восстановлена резервная копия')
    renderShell()
  } catch (error) {
    alert('Не удалось восстановить файл. Проверьте, что это JSON-бэкап приложения.')
  } finally {
    event.target.value = ''
  }
}

render()
