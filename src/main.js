import { createInitialState } from './initial-data.js'
import { worktime, worktimeCloudEnabled, activeShift, startShift, endShift, durationMinutes, durationSeconds, requestCorrection, reviewCorrection, setHourlyRate, syncWorktime, refreshWorktime } from './worktime.js'
import { THEMES, defaultUserSettings, loadUserSettings, saveUserSettings, loadSystemSettings, saveSystemSettings, applyUserSettings } from './settings.js'

const USERS = [
  { id: 'elizaveta', name: 'Елизавета', role: 'admin' },
  { id: 'victoria', name: 'Виктория', role: 'admin' },
  { id: 'gleb', name: 'Глеб', role: 'manager' },
  { id: 'fedor', name: 'Федор', role: 'manager' },
]

const STATUS_OPTIONS = [
  '🆕 Новый',
  '🤔 Думает',
  '📅 Записан на приём',
  '🦷 На лечении',
  '✅ Лечение завершено',
  '🔄 Профосмотр',
  '❌ Отказ',
  '🚫 Не звонить',
]

const TASK_TYPES = [
  { value: 'call', label: '📞 Позвонить' },
  { value: 'write', label: '💬 Написать' },
  { value: 'appointment', label: '📅 Записать на приём' },
  { value: 'invite_checkup', label: '🦷 Пригласить на профосмотр' },
  { value: 'decision', label: '⏳ Уточнить решение' },
  { value: 'reminder', label: '🔔 Напомнить' },
  { value: 'documents', label: '📄 Отправить документы' },
  { value: 'postop_control', label: '🪡 Контроль после операции' },
  { value: 'implant_check', label: '🦷 Осмотр импланта' },
  { value: 'request_image', label: '📷 Запросить снимок' },
  { value: 'other', label: 'Другое' },
]

const PATIENT_ACTIONS = [
  { value:'call', label:'📞 Позвонить' }, { value:'reminder', label:'🔔 Напомнить' },
  { value:'thinking', label:'🤔 Пациент думает' }, { value:'appointment', label:'📅 Записать на приём' },
  { value:'treatment', label:'🦷 Начать лечение' }, { value:'treatment_completed', label:'✅ Завершить лечение' },
  { value:'invite_checkup', label:'🔄 Пригласить на профосмотр' },
  { value:'refusal', label:'❌ Отказ' }, { value:'do_not_call', label:'🚫 Не звонить' },
  { value:'simple_comment', label:'💬 Просто комментарий' },
]

const REFUSAL_REASONS = [
  { value:'expensive', label:'Дорого', option:'💰 Дорого' },
  { value:'other_clinic', label:'Лечится в другой клинике', option:'🏥 Лечится в другой клинике' },
  { value:'other_doctor', label:'Выбрал другого врача', option:'👨‍⚕️ Выбрал другого врача' },
  { value:'thinking', label:'Решил пока подумать', option:'🤔 Решил пока подумать' },
  { value:'no_finances', label:'Нет финансовой возможности', option:'💳 Нет финансовой возможности' },
  { value:'fear', label:'Боится лечения / операции', option:'😨 Боится лечения / операции' },
  { value:'no_time', label:'Нет времени сейчас', option:'📅 Нет времени сейчас' },
  { value:'moved', label:'Переезд / уехал в другой город', option:'🌍 Переезд / уехал в другой город' },
  { value:'lost_contact', label:'Перестал выходить на связь', option:'📞 Перестал выходить на связь' },
  { value:'other', label:'Другая причина', option:'❓ Другая причина' },
]

const DOCTORS = ['Моисеев Г.А.', 'Климов Ф.С.']
const STORAGE_KEY = 'moiseev_admin_crm_v04'
const SNAPSHOT_KEY = 'moiseev_admin_crm_snapshots_v04'
const SESSION_KEY = 'moiseev_admin_crm_user'
const TABLE_SETTINGS_KEY = 'moiseev_admin_crm_table_v01'
const SIDEBAR_SETTINGS_KEY = 'moiseev_admin_crm_sidebar_v01'
const PATIENT_COLUMNS = [
  { key: 'name', width: 220 }, { key: 'addTask', width: 105 }, { key: 'createdAt', width: 125 }, { key: 'doctors', width: 150 },
  { key: 'appointmentDate', width: 130 },
  { key: 'status', width: 190 }, { key: 'adminNote', width: 285 },
  { key: 'history', width: 470 },
]

const app = document.querySelector('#app')
let state = loadState()
let currentUser = getCurrentUser()
let activeTab = 'patients'
let activeTaskFilter = 'today'
let searchText = ''
let patientFilters = { name: '', doctor: '', status: '', group: 'all', taskDue: 'all' }
let sidebarCollapsed = loadSidebarCollapsed()
let shiftTimer = null
let worktimeLoaded = false
let userSettings = currentUser ? loadUserSettings(currentUser.id) : defaultUserSettings()
let settingsTab = 'appearance'

function cloneData(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value))
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function todayISO() {
  return localDatePlus(0)
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
    if (Array.isArray(saved?.patients) && saved.patients.length > 0) {
      const loaded = {
        ...saved,
        tasks: Array.isArray(saved.tasks) ? saved.tasks : [],
        audit: Array.isArray(saved.audit) ? saved.audit : [],
      }
      loaded.patients.forEach(patient => { patient.status = normalizePatientStatus(patient.status) })
      if (migrateLegacyPatientDates(loaded)) localStorage.setItem(STORAGE_KEY, JSON.stringify(loaded))
      return loaded
    }
    if (Array.isArray(saved?.patients) && saved.patients.length === 0) {
      const initialState = normalizedInitialState()
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initialState))
      return initialState
    }
  } catch (error) {
    console.warn('Не удалось прочитать локальную базу', error)
  }
  const initialState = normalizedInitialState()
  localStorage.setItem(STORAGE_KEY, JSON.stringify(initialState))
  return initialState
}

function migrateLegacyPatientDates(data) {
  let changed = false
  data.patients.forEach(patient => {
    const legacy = [
      { field:'nextCallDate', type:'call', title:'📞 Позвонить' },
      { field:'nextPreventiveCheckDate', type:'invite_checkup', title:'🦷 Профосмотр' },
    ]
    legacy.forEach(({ field, type, title }) => {
      const dueDate = patient[field]
      if (dueDate && !data.tasks.some(task => task.patientId === patient.id && task.type === type && isTaskActive(task))) {
        data.tasks.push({ id:`${patient.id}-legacy-${type}`, patientId:patient.id, type, title, dueDate, dueAt:`${dueDate}T10:00:00`, comment:'', note:'', assignee:patient.updatedBy || '', status:'active', completedAt:null, createdAt:patient.updatedAt || new Date().toISOString(), createdBy:'Миграция' })
      }
      if (Object.prototype.hasOwnProperty.call(patient, field)) { delete patient[field]; changed = true }
    })
  })
  data.tasks.forEach(task => {
    if (task.dueDate && !task.dueAt) {
      task.dueAt = `${task.dueDate}T10:00:00`
      changed = true
    }
  })
  return changed
}

function normalizedInitialState() {
  const initialState = createInitialState()
  initialState.patients?.forEach(patient => { patient.status = normalizePatientStatus(patient.status) })
  initialState.tasks?.forEach(task => { if (task.dueDate && !task.dueAt) task.dueAt = `${task.dueDate}T10:00:00` })
  return initialState
}

function normalizePatientStatus(status) {
  const map = {
    '': '🆕 Новый', '📞 Позвонить': '🤔 Думает', '🔔 Напомнить': '🤔 Думает',
    '✍️ Записали на приём': '📅 Записан на приём', '🩺 Профосмотр': '🔄 Профосмотр',
    '⛔ Не звонить': '🚫 Не звонить', 'Позвонить': '🤔 Думает', '🤔 Думает / принимает решение': '🤔 Думает',
    'Напомнить': '🤔 Думает', 'Пригласить на профосмотр': '🔄 Профосмотр',
    '🦷 Лечится': '🦷 На лечении', 'Лечится': '🦷 На лечении', 'Начато лечение': '🦷 На лечении',
  }
  return map[status ?? ''] || (STATUS_OPTIONS.includes(status) ? status : '🆕 Новый')
}

function localDatePlus(days) {
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function matchesDateFilter(value, filter) {
  if (filter === 'all') return true
  if (filter === 'has') return Boolean(value)
  if (filter === 'none') return !value
  if (!value) return false
  const today = localDatePlus(0)
  if (filter === 'today') return value === today
  if (filter === 'tomorrow') return value === localDatePlus(1)
  if (filter === 'overdue') return value < today
  if (filter === 'week') {
    const day = new Date().getDay() || 7
    return value >= today && value <= localDatePlus(7 - day)
  }
  return true
}

function isTaskActive(task) {
  return task?.status === 'active' || task?.status === 'open'
}

function isTaskCompleted(task) {
  return task?.status === 'completed' || task?.status === 'done'
}

function isTaskOverdue(task) {
  if (!isTaskActive(task)) return false
  if (task.dueAt) return new Date(task.dueAt).getTime() < Date.now()
  return Boolean(task.dueDate) && task.dueDate < todayISO()
}

function isCheckupTaskType(type) {
  return ['invite_checkup', 'recall', 'Пригласить на профосмотр', '🦷 Пригласить на профосмотр'].includes(type)
}

function isCallTaskType(type) {
  return ['call', 'decision', 'reminder', 'Позвонить', 'Уточнить решение', 'Напомнить'].includes(type)
}

function taskTypeDisplay(task) {
  const label = TASK_TYPES.find(item => item.value === task?.type)?.label || task?.title || 'Задача'
  if (task?.type !== 'reminder') return label
  return `${label} · ${task.reminderTarget === 'doctor' ? 'Доктору' : 'Пациенту'}`
}

function getUpcomingActiveTasks(tasks = state.tasks) {
  const tomorrow = localDatePlus(1)
  return tasks.filter(task => isTaskActive(task) && Boolean(task.dueDate) && task.dueDate > tomorrow)
}

function parseManualDate(value) {
  const text = String(value || '').trim()
  if (!text) return { iso: '', formatted: '' }
  const match = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (!match) return { error: 'Введите дату в формате ДД.ММ.ГГГГ' }
  const day = Number(match[1]), month = Number(match[2]), year = Number(match[3])
  const date = new Date(year, month - 1, day, 12)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return { error: 'Указана несуществующая дата' }
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return { iso, formatted: `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}` }
}

function localDateTimeValue(date = new Date()) {
  const pad = value => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function formatTaskDue(task) {
  if (!task?.dueAt) return formatDate(task?.dueDate)
  const [date, time = ''] = task.dueAt.split('T')
  return `${date === todayISO() ? 'Сегодня' : formatDate(date)}, ${time.slice(0, 5)}`
}

function taskDueSortValue(task) {
  return task.dueAt || `${task.dueDate || '9999-12-31'}T23:59:59`
}

function nearestActiveTask(patientId) {
  return state.tasks
    .filter(task => task.patientId === patientId && isTaskActive(task))
    .sort((a, b) => taskDueSortValue(a).localeCompare(taskDueSortValue(b)))[0] || null
}

function compactTaskDue(task) {
  if (!task?.dueDate) return 'без даты'
  const suffix = task.dueAt?.slice(11, 16)
  if (task.dueDate === todayISO()) return `сегодня${suffix ? `, ${suffix}` : ''}`
  if (task.dueDate === localDatePlus(1)) return `завтра${suffix ? `, ${suffix}` : ''}`
  return `${formatDate(task.dueDate)}${suffix ? `, ${suffix}` : ''}`
}

function compactTaskLabel(task) {
  const labels = { call:'📞 Позвонить', reminder:'🔔 Напомнить', invite_checkup:'🦷 Профосмотр', appointment:'📅 Записать на приём' }
  const fallback = labels[task?.type] || TASK_TYPES.find(item => item.value === task?.type)?.label || 'Задача'
  const title = String(task?.title || '').trim()
  if (!title) return fallback
  if (/^[^\p{L}\p{N}]/u.test(title)) return title
  const icon = fallback.match(/^\S+/)?.[0] || ''
  return `${icon} ${title}`.trim()
}

function patientStageTaskMarkup(patient) {
  const task = nearestActiveTask(patient.id)
  const taskLine = task ? `<button type="button" class="patient-next-task ${isTaskOverdue(task) ? 'overdue' : ''}" data-next-patient-task="${task.id}" title="${esc(task.comment || task.note || task.title || compactTaskLabel(task))}"><span>${esc(compactTaskLabel(task))}</span> · <time>${esc(compactTaskDue(task))}</time></button>` : ''
  return `<span class="status-chip patient-stage">${esc(normalizePatientStatus(patient.status))}</span>${taskLine}`
}

function isValidTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''))
}

function normalizeManualTime(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return ''
  const normalized = `${String(Number(match[1])).padStart(2, '0')}:${match[2]}`
  return isValidTime(normalized) ? normalized : ''
}

const MANUAL_TIME_OPTIONS = Array.from({ length: 49 }, (_, index) => {
  const minutes = 8 * 60 + index * 15
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
})

function manualDateMarkup(prefix, label, isoValue = '') {
  return `<label class="field"><span>${label}</span><div class="result-date-row"><input type="text" id="${prefix}DateText" value="${isoValue ? formatDate(isoValue) : ''}" placeholder="ДД.ММ.ГГГГ" inputmode="numeric" maxlength="10"><button class="btn" type="button" id="${prefix}DateCalendar" title="Выбрать дату">📅</button><input class="date-picker-proxy" type="date" id="${prefix}Date" value="${isoValue}" tabindex="-1" aria-hidden="true"></div><small class="form-error" id="${prefix}DateError"></small></label>`
}

function manualTimeMarkup(prefix, label, value = '') {
  return `<label class="field"><span>${label}</span><div class="time-picker-combo" id="${prefix}TimeCombo"><div class="time-picker-input"><input type="text" id="${prefix}Time" value="${value}" placeholder="ЧЧ:ММ" inputmode="numeric" maxlength="5" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${prefix}TimeOptions"><button class="time-picker-button" type="button" id="${prefix}TimeListButton" title="Открыть список времени" aria-label="Открыть список времени">🕐</button></div><div class="time-picker-options hidden" id="${prefix}TimeOptions" role="listbox">${MANUAL_TIME_OPTIONS.map(time => `<button type="button" role="option" data-time-option="${time}">${time}</button>`).join('')}</div></div><small class="form-error" id="${prefix}TimeError"></small></label>`
}

function setupManualDate(root, prefix, onChange = () => {}) {
  const textInput = root.querySelector(`#${prefix}DateText`)
  const picker = root.querySelector(`#${prefix}Date`)
  const calendar = root.querySelector(`#${prefix}DateCalendar`)
  const error = root.querySelector(`#${prefix}DateError`)
  if (!textInput || !picker) return
  calendar.onclick = () => { try { picker.showPicker() } catch { picker.click() } }
  picker.onchange = () => { textInput.value = picker.value ? formatDate(picker.value) : ''; error.textContent = ''; onChange(picker.value) }
  textInput.oninput = () => { error.textContent = ''; onChange('') }
  textInput.onblur = () => {
    const parsed = parseManualDate(textInput.value)
    error.textContent = parsed.error || ''
    if (!parsed.error) { textInput.value = parsed.formatted; picker.value = parsed.iso; onChange(parsed.iso) }
  }
}

function readManualDate(root, prefix, required = true) {
  const input = root.querySelector(`#${prefix}DateText`)
  const error = root.querySelector(`#${prefix}DateError`)
  const parsed = parseManualDate(input?.value)
  if (parsed.error || (required && !parsed.iso)) {
    if (error) error.textContent = parsed.error || 'Укажите дату'
    return null
  }
  if (input) input.value = parsed.formatted
  const picker = root.querySelector(`#${prefix}Date`)
  if (picker) picker.value = parsed.iso
  return parsed.iso
}

function setupManualTime(root, prefix) {
  const input = root.querySelector(`#${prefix}Time`)
  const error = root.querySelector(`#${prefix}TimeError`)
  const listButton = root.querySelector(`#${prefix}TimeListButton`)
  const combo = root.querySelector(`#${prefix}TimeCombo`)
  const options = root.querySelector(`#${prefix}TimeOptions`)
  if (!input) return
  const optionButtons = [...(options?.querySelectorAll('[data-time-option]') || [])]
  const closeList = () => { options?.classList.add('hidden'); input.setAttribute('aria-expanded', 'false') }
  const openList = (showAll = true) => {
    optionButtons.forEach(button => button.classList.toggle('hidden', !showAll && !button.dataset.timeOption.startsWith(input.value.trim())))
    options?.classList.remove('hidden')
    input.setAttribute('aria-expanded', 'true')
    input.focus()
  }
  const toggleFullList = event => {
    event.preventDefault()
    const wasOpen = options && !options.classList.contains('hidden')
    if (wasOpen) closeList()
    else openList(true)
  }
  if (listButton) listButton.onclick = toggleFullList
  optionButtons.forEach(button => {
    button.onmousedown = event => event.preventDefault()
    button.onclick = () => { input.value = button.dataset.timeOption; if (error) error.textContent = ''; closeList(); input.focus() }
  })
  input.oninput = () => { if (error) error.textContent = ''; openList(false) }
  input.onblur = () => {
    if (!input.value.trim()) return
    const normalized = normalizeManualTime(input.value)
    if (error) error.textContent = normalized ? '' : 'Введите время в формате ЧЧ:ММ'
    if (normalized) input.value = normalized
  }
  input.onkeydown = event => { if (event.key === 'Escape') closeList() }
  root.addEventListener('click', event => { if (combo && !combo.contains(event.target)) closeList() })
}

function readManualTime(root, prefix, required = true) {
  const input = root.querySelector(`#${prefix}Time`)
  const error = root.querySelector(`#${prefix}TimeError`)
  const normalized = normalizeManualTime(input?.value)
  if (!normalized && (required || input?.value.trim())) {
    if (error) error.textContent = 'Введите время в формате ЧЧ:ММ'
    return null
  }
  if (input) input.value = normalized
  return normalized
}

function appointmentConfirmationDeadline(appointmentDate) {
  if (!appointmentDate) return { dueDate:'', dueAt:null }
  const [year, month, day] = appointmentDate.split('-').map(Number)
  const previous = new Date(year, month - 1, day, 12)
  previous.setDate(previous.getDate() - 1)
  const candidate = `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}-${String(previous.getDate()).padStart(2, '0')}`
  const today = todayISO()
  const dueDate = candidate < today ? today : candidate
  const defaultDueAt = `${dueDate}T10:00:00`
  return { dueDate, dueAt: new Date(defaultDueAt) <= new Date() ? localDateTimeValue(new Date()) : defaultDueAt }
}

function createHistoryEntry(actionType, text, details = {}) {
  return {
    id: uid(),
    createdAt: new Date().toISOString(),
    authorId: currentUser?.id || null,
    authorName: currentUser?.name || 'Система',
    authorRole: currentUser?.role === 'admin' ? 'administrator' : (currentUser?.role || 'system'),
    actionType,
    text,
    ...details,
  }
}

function cleanTaskLabel(value = '') {
  return String(value).replace(/^\s*[📞🦷📅🔔💬✅✍️⏳🆕🤔🔄❌🚫📄🪡📷]+\s*/u, '').trim()
}

function taskHistoryText(type, title, dueDate, comment = '') {
  const label = cleanTaskLabel(title || TASK_TYPES.find(item => item.value === type)?.label || 'Задача')
  const dateText = dueDate ? ` на ${formatDate(dueDate)}` : ''
  const commentText = comment ? `. ${comment.replace(/[.\s]+$/, '')}.` : '.'
  return `${label}${dateText}${commentText}`
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
  userSettings = loadUserSettings(currentUser.id)
  applyUserSettings(userSettings)
  renderShell()
}

function renderLogin() {
  stopShiftTimer()
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
      userSettings = loadUserSettings(currentUser.id)
      applyUserSettings(userSettings)
      render()
    })
  })
}

function renderShell() {
  app.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <nav class="top-navigation" aria-label="Основные разделы">
          ${navButton('patients', '▦', 'Пациенты')}
          ${navButton('tasks', '✓', 'Задачи')}
          ${navButton('worktime', '◷', currentUser.role === 'manager' ? 'Учёт рабочего времени' : 'Моё рабочее время')}
          ${currentUser.role === 'manager' ? navButton('analytics', '↗', 'Отчётность') : ''}
          ${navButton('settings', '⚙', 'Настройки')}
        </nav>
        <div class="top-actions">
          <button class="btn" id="undoBtn" title="Вернуть состояние до последнего сохранения">↶ Отменить</button>
          <button class="btn" id="backupBtn">Скачать бэкап</button>
          <button class="btn" id="restoreBtn">Восстановить</button>
          <input class="hidden" type="file" id="restoreFile" accept="application/json">
          ${userWorkBlockMarkup()}
        </div>
      </header>
      <div class="layout">
        <main class="content" id="content"></main>
      </div>
    </div>
  `

  setupShiftWidget()
  setupUserMenu()
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
  if (activeTab === 'worktime') renderWorktime()
  if (activeTab === 'settings') renderSettings()
}

function userWorkBlockMarkup() {
  const shiftControls = currentUser.role === 'admin' ? shiftWidgetMarkup() : ''
  return `<div class="user-work-block"><span class="user-work-name">${currentUser.role === 'admin' ? '🟢' : '👤'} ${esc(currentUser.name)}</span>${shiftControls}<button class="user-menu-toggle" id="userMenuToggle" aria-label="Открыть меню пользователя" aria-expanded="false">▼</button><div class="user-menu hidden" id="userMenu"><button data-user-action="switch">Сменить пользователя</button><button data-user-action="worktime">${currentUser.role === 'manager' ? 'Учёт рабочего времени' : 'Моё рабочее время'}</button><button data-user-action="logout">Выйти</button></div></div>`
}

function shiftWidgetMarkup() {
  const shift = activeShift(currentUser.id)
  const review = worktime.shifts.find(item => item.userId === currentUser.id && item.status === 'needs_review')
  if (review) return `<div class="shift-widget warning"><span>Смена ожидает проверки</span><button class="btn" data-open-worktime>Подробнее</button></div>`
  if (!shift) return `<div class="shift-widget"><button class="btn shift-action-btn shift-start-btn" id="startShiftBtn">▶ Начать смену</button></div>`
  if (shift.workDate !== todayISO()) return `<div class="shift-widget warning"><span>Смена ${formatDate(shift.workDate)} не завершена</span><button class="btn" id="fixShiftBtn">Запросить исправление</button></div>`
  return `<div class="shift-widget active"><b class="shift-timer" id="shiftElapsed">⏱ ${formatTimer(durationSeconds(shift))}</b><button class="btn shift-action-btn shift-end-btn" id="endShiftBtn">⏹ Закончить смену</button></div>`
}

function setupUserMenu() {
  const toggle = document.querySelector('#userMenuToggle')
  const menu = document.querySelector('#userMenu')
  toggle.onclick = event => {
    event.stopPropagation()
    const hidden = menu.classList.toggle('hidden')
    toggle.setAttribute('aria-expanded', String(!hidden))
    if (!hidden) setTimeout(() => document.addEventListener('click', () => { menu.classList.add('hidden'); toggle.setAttribute('aria-expanded', 'false') }, { once: true }), 0)
  }
  menu.onclick = event => event.stopPropagation()
  menu.querySelector('[data-user-action="worktime"]').onclick = () => { activeTab = 'worktime'; renderShell() }
  menu.querySelector('[data-user-action="switch"]').onclick = () => exitCurrentUser()
  menu.querySelector('[data-user-action="logout"]').onclick = () => exitCurrentUser()
}

function exitCurrentUser() {
  const shift = activeShift(currentUser.id)
  if (shift) {
    if (!confirm('У вас активна рабочая смена. Закончить её перед выходом?')) return
    endShift(currentUser.id)
  }
  sessionStorage.removeItem(SESSION_KEY)
  currentUser = null
  render()
}

function setupShiftWidget() {
  stopShiftTimer()
  if (currentUser.role !== 'admin') return
  document.querySelector('#startShiftBtn')?.addEventListener('click', () => {
    const stale = worktime.shifts.find(shift => shift.userId === currentUser.id && shift.status === 'active' && shift.workDate !== todayISO())
    if (stale) return openCorrectionRequest(stale)
    try { startShift(currentUser); renderShell() } catch (error) { alert(error.message) }
  })
  document.querySelector('#fixShiftBtn')?.addEventListener('click', () => openCorrectionRequest(activeShift(currentUser.id)))
  document.querySelector('[data-open-worktime]')?.addEventListener('click', () => { activeTab = 'worktime'; renderShell() })
  document.querySelector('#endShiftBtn')?.addEventListener('click', () => {
    openEndShiftDialog()
  })
  const updateShiftTimer = () => {
    const target = document.querySelector('#shiftElapsed')
    const shift = activeShift(currentUser.id)
    if (!target || !shift) return
    target.textContent = `⏱ ${formatTimer(durationSeconds(shift, Date.now()))}`
  }
  if (activeShift(currentUser.id)) {
    updateShiftTimer()
    shiftTimer = setInterval(updateShiftTimer, 1000)
  }
}

function stopShiftTimer() {
  if (shiftTimer !== null) clearInterval(shiftTimer)
  shiftTimer = null
}

function formatClock(value) { return value ? new Intl.DateTimeFormat('ru-RU', { hour:'2-digit', minute:'2-digit' }).format(new Date(value)) : '—' }
function formatDuration(minutes) { return `${Math.floor(minutes / 60)} ч ${String(minutes % 60).padStart(2, '0')} мин` }
function formatTimer(seconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const remainingSeconds = safeSeconds % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
}

function openEndShiftDialog() {
  const shift = activeShift(currentUser.id)
  if (!shift) return
  document.body.insertAdjacentHTML('beforeend', `<div class="modal" id="endShiftModal"><div class="dialog end-shift-dialog" role="dialog" aria-modal="true" aria-labelledby="endShiftTitle">
    <div class="dialog-head"><div><h2 id="endShiftTitle">Завершить рабочую смену?</h2><p>Смена начата в ${formatClock(shift.startAt)}.<br>Текущее отработанное время: ${formatDuration(durationMinutes(shift))}.</p></div></div>
    <div class="dialog-actions"><button class="btn" id="cancelEndShift">Отмена</button><button class="btn danger-confirm" id="confirmEndShift">Да, закончить смену</button></div>
  </div></div>`)
  const modal = document.querySelector('#endShiftModal')
  const cancel = modal.querySelector('#cancelEndShift')
  const close = () => modal.remove()
  cancel.onclick = close
  modal.addEventListener('click', event => { if (event.target === modal) close() })
  modal.querySelector('#confirmEndShift').onclick = () => {
    stopShiftTimer()
    const completed = endShift(currentUser.id)
    const total = formatDuration(completed.workedMinutes)
    close(); renderShell(); showToast(`Смена завершена. Отработано: ${total}.`)
  }
  requestAnimationFrame(() => cancel.focus())
}

function showToast(message) {
  if (userSettings?.notifications?.toast === false) return
  document.querySelector('.crm-toast')?.remove()
  document.body.insertAdjacentHTML('beforeend', `<div class="crm-toast" role="status">${esc(message)}</div>`)
  const toast = document.querySelector('.crm-toast')
  setTimeout(() => toast?.classList.add('visible'), 20)
  setTimeout(() => toast?.remove(), 3500)
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

function specialNoteBadge(patient, className = '') {
  const note = String(patient?.specialNote || '').trim()
  if (!note) return ''
  return `<span class="special-note-badge ${className}" tabindex="0" role="button" data-special-note-badge aria-label="Особое примечание: ${esc(note)}"><span aria-hidden="true">!</span><span class="special-note-tooltip" role="tooltip">${esc(note)}</span></span>`
}

function patientMatchesFilters(patient) {
  const name = patientFilters.name.trim().toLowerCase()
  const activeTasks = state.tasks.filter(task => task.patientId === patient.id && isTaskActive(task))
  const matchesTaskDue = patientFilters.taskDue === 'all'
    || (patientFilters.taskDue === 'today' && activeTasks.some(task => task.dueDate === localDatePlus(0)))
    || (patientFilters.taskDue === 'upcoming' && getUpcomingActiveTasks(activeTasks).length > 0)
  return (!name || String(patient.name || '').toLowerCase().includes(name))
    && (!patientFilters.doctor || (patient.doctors || []).includes(patientFilters.doctor))
    && (!patientFilters.status || patient.status === patientFilters.status)
    && patientMatchesGroup(patient, patientFilters.group)
    && matchesTaskDue
}

function patientMatchesGroup(patient, group = 'all') {
  const status = normalizePatientStatus(patient.status)
  if (group === 'all') return true
  if (group === 'active') return !['❌ Отказ', '🚫 Не звонить', '✅ Лечение завершено'].includes(status)
  if (group === 'booked') return status === '📅 Записан на приём'
  if (group === 'treatment') return status === '🦷 На лечении'
  if (group === 'checkup') return status === '🔄 Профосмотр' || state.tasks.some(task => task.patientId === patient.id && isCheckupTaskType(task.type) && isTaskActive(task))
  if (group === 'refusal') return status === '❌ Отказ'
  if (group === 'do_not_call') return status === '🚫 Не звонить'
  if (group === 'completed') return status === '✅ Лечение завершено'
  return true
}

function historyTimestamp(item) {
  const values = [item?.timestamp, item?.createdAt, item?.at, item?.text]
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
  const knownTypes = ['admin_comment', 'doctor_comment', 'special_note', 'status', 'action', 'task', 'task_completed', 'task_processed', 'import', 'system', 'comment']
  if (knownTypes.includes(item?.actionType)) return item.actionType
  if (knownTypes.includes(item?.type)) return item.type
  const text = String(item?.text || '')
  if (/статус изменён/i.test(text)) return 'status'
  if (/задач[аи]/i.test(text)) return 'task'
  if (item?.user === 'Импорт' || item?.at === 'Импорт из Google Таблицы') return 'import'
  if (item?.user === 'Система') return 'system'
  return 'comment'
}

function normalizeHistoryText(text, type) {
  let value = String(text || '').trim()
  if (/^(?:создана карточка пациента|изменены данные пациента|комментарий изменён|автоматически создана задача.*|служебная задача.*|системное напоминание.*)$/i.test(value)) return ''
  value = value.replace(/\s*Автоматически создана задача подтверждения записи на \d{1,2}\.\d{1,2}\.\d{4}\.?/gi, '').trim()
  value = value
    .replace(/^статус изменён(?:\s+на)?\s*/i, '')
    .replace(/^(?:создана|изменена|обновлена)\s+задача\s*/i, '')
    .replace(/^выполнена\s+задача\s*/i, '')
    .replace(/[«»]/g, '')
    .trim()
  if (type === 'system' && /^дата обзвона:\s*/i.test(value)) value = value.replace(/^дата обзвона:\s*/i, 'Позвонить ')
  if (type === 'system' && /^дата профосмотра:\s*/i.test(value)) value = value.replace(/^дата профосмотра:\s*/i, 'Профосмотр ')
  return cleanTaskLabel(value)
}

function historyActionIcon(item, type, text) {
  if (item?.actionIcon) return item.actionIcon
  if (type === 'special_note') return '🚨'
  if (type === 'task_completed' || /выполнена\s+задача/i.test(String(item?.text || '')) || item?.taskStatus === 'completed') return '✅'
  const source = `${item?.taskType || ''} ${item?.title || ''} ${text}`.toLowerCase()
  if (isCheckupTaskType(item?.taskType) || /профосмотр/.test(source)) return '🦷'
  if (item?.taskType === 'appointment' || /при[её]м|запис/.test(source)) return '📅'
  if (item?.taskType === 'reminder' || /напом/.test(source)) return '🔔'
  if (item?.taskType === 'documents' || /документ/.test(source)) return '📄'
  if (item?.taskType === 'postop_control' || /операц/.test(source)) return '🪡'
  if (item?.taskType === 'request_image' || /снимок/.test(source)) return '📷'
  if (isCallTaskType(item?.taskType) || /позвон|обзвон|перезвон|дозвон/.test(source) || type === 'task_processed') return '📞'
  return '💬'
}

function historyTypeLabel(type) {
  return ({
    admin_comment: 'Примечание', doctor_comment: 'Комментарий врача',
    special_note: 'Особое примечание',
    status: 'Смена статуса', task: 'Задача', task_processed: 'Обработка задачи', import: 'Импортированная запись',
    system: 'Системная запись', comment: 'Комментарий',
  })[type] || 'Событие'
}

function commentDetails(item) {
  const type = historyType(item)

  if (type === 'special_note') {
    return { author:item.authorName || item.user || 'Неизвестный автор', role:item.authorRole === 'manager' ? 'Руководитель' : item.authorRole === 'doctor' ? 'Врач' : 'Администратор', text:String(item.text || 'Особое примечание изменено.'), type, icon:'!' }
  }

  if (type === 'task_processed') {
    const resultText = item.resultLabel || item.result || 'Задача обработана'
    const dueText = item.newDueAt ? (String(item.newDueAt).includes('T') ? `${formatDate(String(item.newDueAt).slice(0,10))}, ${String(item.newDueAt).slice(11,16)}` : formatDate(item.newDueAt)) : ''
    const statusText = item.patientStatus ? `Статус: «${item.patientStatus}».` : ''
    const appointmentText = item.appointmentAt ? `Приём: ${formatDate(String(item.appointmentAt).slice(0,10))}, ${String(item.appointmentAt).slice(11,16)}.` : ''
    const actionText = [resultText, item.delayLabel && dueText ? `${item.delayLabel} — ${dueText}.` : '', statusText, appointmentText, item.refusalReason ? `Причина отказа: ${item.refusalReason}.` : '', item.userComment || ''].filter(Boolean).join(' ')
    return { author:item.authorName || 'Неизвестный автор', role:item.authorRole === 'doctor' ? 'Врач' : 'Администратор', text:actionText, type:'task_processed', icon:historyActionIcon(item, type, actionText) }
  }

  let author = item.authorName || item.user || 'Неизвестный автор'
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

  text = normalizeHistoryText(text, type)
  if (!text) return null
  const isDoctor = item.authorRole === 'doctor' || type === 'doctor_comment' || DOCTORS.some(name => author.replace(/\.$/, '') === name.replace(/\.$/, ''))
  const displayType = isDoctor ? 'doctor_comment' : ['admin_comment', 'comment', 'import'].includes(type) ? 'admin_comment' : type
  return { author, role: isDoctor ? 'Врач' : 'Администратор', text, type: displayType, icon: historyActionIcon(item, type, text) }
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
  return `<article class="history-entry history-${details.type} ${compact ? 'compact' : ''}" role="button" tabindex="0" aria-expanded="false" title="Нажмите, чтобы раскрыть комментарий">
    <p class="history-flow"><span class="history-meta"><time>${esc(date)}${time ? `, ${esc(time)}` : ''}</time>&nbsp;&nbsp;<span class="history-action-icon" aria-hidden="true">${esc(details.icon || '💬')}</span> <b>${esc(details.author)}</b></span>${details.text ? ` <span class="history-comment">${esc(details.text)}</span>` : ''}</p>
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
  const entries = commentHistory(patient.history)
  return `<div class="history-preview"><div class="patient-history-preview ${entries.length > 4 ? 'has-more' : ''}">
    ${entries.length ? entries.slice(0, 4).map(historyPreviewLineMarkup).join('') : '<span class="history-empty">История пуста</span>'}
  </div>${entries.length > 4 ? '<span class="history-expand-hint" aria-hidden="true">↗</span>' : ''}</div>`
}

function historyPreviewLineMarkup(item) {
  const details = commentDetails(item)
  if (!details) return ''
  return `<span class="patient-history-line"><time>${esc(formatHistoryDate(item))}</time> <span class="history-action-icon" aria-hidden="true">${esc(details.icon || '💬')}</span> <b>${esc(details.author)}</b>${details.text ? ` <span>${esc(details.text)}</span>` : ''}</span>`
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
    const hiddenColumns = new Set(userSettings.table.hiddenColumns || [])
    ;[...headerRow.cells].forEach(cell => { cell.style.display = hiddenColumns.has(cell.dataset.columnKey) ? 'none' : '' })
    rows.forEach(row => [...row.cells].forEach(cell => { cell.style.display = hiddenColumns.has(cell.dataset.columnKey) ? 'none' : '' }))

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
    .filter(patientMatchesFilters)
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))

  const today = todayISO()
  const tomorrow = localDatePlus(1)
  const openTasks = state.tasks.filter(isTaskActive)
  const todayCount = openTasks.filter(task => task.dueDate === today).length
  const tomorrowCount = openTasks.filter(task => task.dueDate === tomorrow).length
  const upcomingCount = getUpcomingActiveTasks().length
  const overdueCount = openTasks.filter(isTaskOverdue).length

  content.innerHTML = `
    <section class="patients-toolbar">
      <button class="btn primary" id="newPatient">+ Новый пациент</button>
    </section>
    <section class="summary-strip">
      <button class="summary-item task-summary-tab task-tab-today" data-open-tasks="today"><span>🟠 Задачи сегодня <b>(${todayCount})</b></span></button>
      <button class="summary-item task-summary-tab task-tab-tomorrow" data-open-tasks="tomorrow"><span>🟡 Задачи завтра <b>(${tomorrowCount})</b></span></button>
      <button class="summary-item task-summary-tab task-tab-upcoming" data-open-tasks="upcoming"><span>🟢 Будущие задачи <b>(${upcomingCount})</b></span></button>
      <button class="summary-item task-summary-tab task-tab-overdue" data-open-tasks="overdue"><span>🔴 Просроченные задачи <b>(${overdueCount})</b></span></button>
    </section>
    ${patientGroupFilterMarkup()}
    ${patientFilterMarkup(patients.length)}
    <section class="table-card">
      <div class="table-scroll">
        <table class="patient-table">
          <thead><tr>
            <th>ФИО</th>
            <th>+ Задача</th>
            <th>Дата создания</th>
            <th>Врач</th>
            <th>Дата приёма</th>
            <th>Статус</th>
            <th>Примечание</th>
            <th>История</th>
          </tr></thead>
          <tbody>
            ${patients.length ? patients.map(patientRow).join('') : `<tr><td class="empty-row" colspan="8">${patientFilters.taskDue === 'upcoming' ? 'Нет запланированных задач начиная с послезавтра' : 'По выбранным фильтрам пациентов не найдено'}</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `

  initializePatientTableColumns()
  setupHistoryExpansion(content)
  document.querySelector('#newPatient').onclick = () => openPatientModal()
  setupPatientFilters(content)
  document.querySelectorAll('[data-patient-tasks]').forEach(button => {
    button.onclick = event => {
      event.preventDefault()
      event.stopPropagation()
      const patientId = button.dataset.patientTasks
      try {
        openTaskDrawer(patientId)
      } catch (error) {
        console.error('Не удалось открыть список задач пациента', error)
        document.querySelector('#taskDrawerOverlay')?.remove()
        openTaskModal(null, patientId)
      }
    }
  })
  document.querySelectorAll('[data-open-patient]').forEach(button => button.onclick = event => {
    event.preventDefault()
    event.stopPropagation()
    openPatientModal(button.dataset.openPatient)
  })
  setupInlineCommentInputs(content)
  document.querySelectorAll('[data-full-history]').forEach(button => {
    button.addEventListener('click', event => {
      event.preventDefault()
      event.stopPropagation()
      openHistoryModal(button.dataset.fullHistory)
    })
    button.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      event.stopPropagation()
      openHistoryModal(button.dataset.fullHistory)
    })
  })
  document.querySelectorAll('[data-action-menu-toggle]').forEach(toggle => {
    toggle.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation()
      const menu = toggle.parentElement.querySelector('[data-action-menu]')
      document.querySelectorAll('[data-action-menu]').forEach(other => { if (other !== menu) other.classList.add('hidden') })
      const opened = menu.classList.toggle('hidden') === false
      toggle.setAttribute('aria-expanded', String(opened))
      if (opened) setTimeout(() => document.addEventListener('click', () => { menu.classList.add('hidden'); toggle.setAttribute('aria-expanded', 'false') }, { once:true }), 0)
    })
  })
  document.querySelectorAll('[data-next-patient-task]').forEach(button => button.addEventListener('click', event => {
    event.preventDefault()
    event.stopPropagation()
    openCallResultModal(button.dataset.nextPatientTask)
  }))
  document.querySelectorAll('[data-patient-action]').forEach(button => {
    button.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation()
      button.closest('[data-action-menu]')?.classList.add('hidden')
      openPatientActionModal(button.dataset.patientId, button.dataset.patientAction)
    })
  })
  document.querySelectorAll('[data-open-tasks]').forEach(button => {
    button.onclick = () => {
      activeTaskFilter = button.dataset.openTasks
      activeTab = 'tasks'
      try { renderShell() } catch (error) {
        console.error('Не удалось открыть раздел задач', error)
        activeTab = 'patients'
        renderShell()
        showToast('Не удалось открыть список задач. Проверьте повреждённые записи в бэкапе.')
      }
    }
  })
}

function patientGroupFilterMarkup() {
  const groups = [['all','Все пациенты'],['active','Активные'],['booked','Записаны'],['treatment','Лечатся'],['checkup','Профосмотр'],['refusal','Отказы'],['do_not_call','Не звонить'],['completed','Завершённые']]
  return `<nav class="patient-group-filters" aria-label="Группы пациентов">${groups.map(([value,label]) => `<button class="filter-btn ${patientFilters.group === value ? 'active' : ''}" data-patient-group="${value}">${label}</button>`).join('')}</nav>`
}

function patientFilterMarkup(found) {
  const doctors = [...new Set(state.patients.flatMap(patient => patient.doctors || []))].sort()
  return `<section class="patient-filters">
    <input data-patient-filter="name" value="${esc(patientFilters.name)}" placeholder="Поиск по ФИО">
    <select data-patient-filter="doctor"><option value="">Все врачи</option>${doctors.map(value => `<option ${patientFilters.doctor === value ? 'selected' : ''}>${esc(value)}</option>`).join('')}</select>
    <select data-patient-filter="status"><option value="">Все статусы</option>${STATUS_OPTIONS.filter(Boolean).map(value => `<option ${patientFilters.status === value ? 'selected' : ''}>${esc(value)}</option>`).join('')}</select>
    <button class="btn compact" id="resetPatientFilters">Сбросить фильтры</button>
    <strong class="filter-count">Найдено: ${found}${patientFilters.taskDue === 'upcoming' ? ' · будущие задачи' : ''}</strong>
  </section>`
}

function setupPatientFilters(root) {
  root.querySelectorAll('[data-patient-group]').forEach(button => button.addEventListener('click', () => {
    patientFilters.group = button.dataset.patientGroup
    renderPatients()
  }))
  root.querySelectorAll('[data-patient-filter]').forEach(control => {
    ;['pointerdown', 'mousedown', 'click'].forEach(type => control.addEventListener(type, event => event.stopPropagation()))
    control.addEventListener(control.tagName === 'INPUT' ? 'input' : 'change', () => {
      patientFilters[control.dataset.patientFilter] = control.value
      const key = control.dataset.patientFilter
      const caret = control.selectionStart
      renderPatients()
      if (control.tagName === 'INPUT') {
        const replacement = document.querySelector(`[data-patient-filter="${key}"]`)
        replacement?.focus()
        replacement?.setSelectionRange(caret, caret)
      }
    })
  })
  document.querySelector('[data-open-checkups]')?.addEventListener('click', () => { patientFilters.group = 'checkup'; patientFilters.taskDue = 'all'; renderPatients() })
  root.querySelector('#resetPatientFilters').onclick = () => {
    patientFilters = { name: '', doctor: '', status: '', group: 'all', taskDue: 'all' }
    renderPatients()
  }
}

function dateInputMarkup(patient, field) {
  const value = patient[field] || ''
  const stateClass = !value ? 'empty' : value < localDatePlus(0) ? 'overdue' : value === localDatePlus(0) ? 'today' : 'future'
  const label = field === 'nextCallDate' ? 'дату обзвона' : 'дату профосмотра'
  return `<div class="inline-date manual-date ${stateClass}" data-date-component="${field}">
    <input type="text" value="${value ? formatDate(value) : ''}" data-manual-patient-date="${patient.id}" data-date-field="${field}" placeholder="ДД.ММ.ГГГГ" inputmode="numeric" maxlength="10" aria-label="Изменить ${label}">
    <button type="button" data-open-date-picker title="Выбрать дату" aria-label="Выбрать ${label} в календаре">📅</button>
    <input class="date-picker-proxy" type="date" value="${value}" data-date-picker="${patient.id}-${field}" tabindex="-1" aria-hidden="true">
    <button type="button" data-clear-date title="Очистить дату">×</button>
    <small class="date-input-error" aria-live="polite"></small>
  </div>`
}

function setupPatientDates(root) {
  const savePatientDate = (patientId, field, value) => {
    const patient = state.patients.find(item => item.id === patientId)
    if (!patient || (patient[field] || '') === value) return false
    patient[field] = value
    patient.updatedAt = new Date().toISOString()
    patient.updatedBy = currentUser.name
    patient.history ||= []
    const dateLabel = field === 'nextCallDate' ? 'Дата обзвона' : 'Дата профосмотра'
    patient.history.unshift(createHistoryEntry('system', `${dateLabel}: ${value ? formatDate(value) : 'очищена'}`))
    saveState(`Изменена дата: ${patient.name}`)
    renderPatients()
    return true
  }

  root.querySelectorAll('[data-patient-date]').forEach(input => {
    const stop = event => event.stopPropagation()
    ;['pointerdown', 'mousedown', 'click'].forEach(type => input.addEventListener(type, stop))
    input.addEventListener('change', event => {
      event.stopPropagation()
      savePatientDate(input.dataset.patientDate, input.dataset.dateField, input.value)
    })
    const clear = input.parentElement.querySelector('[data-clear-date]')
    ;['pointerdown', 'mousedown', 'click'].forEach(type => clear.addEventListener(type, stop))
    clear.onclick = () => { input.value = ''; input.dispatchEvent(new Event('change', { bubbles: true })) }
  })
  root.querySelectorAll('[data-manual-patient-date]').forEach(input => {
    const wrapper = input.closest('.manual-date')
    const picker = wrapper.querySelector('[data-date-picker]')
    const pickerButton = wrapper.querySelector('[data-open-date-picker]')
    const clear = wrapper.querySelector('[data-clear-date]')
    const error = wrapper.querySelector('.date-input-error')
    const stop = event => event.stopPropagation()
    ;[input, pickerButton, clear].forEach(control => {
      ;['pointerdown', 'mousedown', 'click'].forEach(type => control.addEventListener(type, stop))
    })
    ;[pickerButton, clear].forEach(button => button.addEventListener('mousedown', event => event.preventDefault()))
    const showError = message => {
      wrapper.classList.toggle('invalid', Boolean(message))
      error.textContent = message || ''
      input.setAttribute('aria-invalid', String(Boolean(message)))
    }
    const commit = () => {
      const parsed = parseManualDate(input.value)
      if (parsed.error) return showError(parsed.error)
      showError('')
      input.value = parsed.formatted
      picker.value = parsed.iso
      savePatientDate(input.dataset.manualPatientDate, input.dataset.dateField, parsed.iso)
    }
    input.addEventListener('input', () => showError(''))
    input.addEventListener('blur', commit)
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault()
        input.blur()
      }
    })
    pickerButton.addEventListener('click', () => {
      try { picker.showPicker() } catch { picker.click() }
    })
    picker.addEventListener('change', event => {
      event.stopPropagation()
      if (!picker.value) return
      showError('')
      input.value = formatDate(picker.value)
      savePatientDate(input.dataset.manualPatientDate, input.dataset.dateField, picker.value)
    })
    clear.addEventListener('click', () => {
      input.value = ''
      picker.value = ''
      showError('')
      savePatientDate(input.dataset.manualPatientDate, input.dataset.dateField, '')
    })
  })
  document.querySelector('[data-open-checkups]')?.addEventListener('click', () => {
    patientFilters.preventiveDate = 'has'
    patientFilters.taskDue = 'all'
    renderPatients()
  })
}

function patientRow(patient) {
  const tasks = state.tasks.filter(task => task.patientId === patient.id && isTaskActive(task))
  return `
    <tr data-patient="${patient.id}">
      <td><button type="button" class="patient-name-btn" data-open-patient="${patient.id}"><strong>${esc(patient.name)} ${specialNoteBadge(patient)}</strong><small>${esc((patient.phones || []).join(' · '))}</small></button><button type="button" class="patient-edit-btn" data-open-patient="${patient.id}">Открыть карточку</button></td>
      <td><button class="btn primary row-task-btn" data-patient-tasks="${patient.id}">${tasks.length ? `Задача · ${tasks.length}` : '+ Задача'}</button></td>
      <td>${formatDate(patient.createdAt)}</td>
      <td>${esc((patient.doctors || []).join(', ') || '—')}</td>
      <td>${formatDate(patient.appointmentDate)}</td>
      <td class="patient-action-cell">${patientStageTaskMarkup(patient)}<div class="patient-action-menu-wrap"><button type="button" class="btn patient-action-button" data-action-menu-toggle aria-expanded="false">➕ Новое действие</button><div class="patient-action-menu hidden" data-action-menu>${PATIENT_ACTIONS.map(action => `<button type="button" data-patient-action="${action.value}" data-patient-id="${patient.id}">${action.label}</button>`).join('')}</div></div></td>
      <td class="wrap-cell comment-cell" data-comment-cell="${patient.id}" data-comment-kind="admin">${inlineCommentMarkup(patient, 'admin')}</td>
      <td class="history-cell" data-full-history="${patient.id}" tabindex="0" title="Открыть всю историю" aria-label="Открыть всю историю пациента ${esc(patient.name)}">${historyPreview(patient)}</td>
    </tr>
  `
}

function inlineCommentMarkup(patient, kind) {
  const isDoctor = kind === 'doctor'
  const lastComment = isDoctor ? patient.doctorComment : patient.adminNote
  return `<button class="inline-comment-existing ${lastComment ? '' : 'empty'}" type="button" data-existing-comment="${patient.id}" data-comment-kind="${kind}" title="Открыть ${isDoctor ? 'комментарий врача' : 'примечание'}">${lastComment ? esc(lastComment) : isDoctor ? 'Добавить комментарий…' : 'Добавить примечание…'}</button>`
}

function setupInlineCommentInputs(root) {
  root.querySelectorAll('[data-comment-cell]').forEach(cell => {
    ;['pointerdown', 'mousedown'].forEach(type => cell.addEventListener(type, event => event.stopPropagation()))
    cell.addEventListener('click', event => {
      event.stopPropagation()
      if (event.target.closest('[data-existing-comment]')) return
      openQuickCommentModal(cell.dataset.commentCell, cell.dataset.commentKind)
    })
  })

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
      patient.history.unshift(createHistoryEntry(isDoctor ? 'doctor_comment' : 'admin_comment', text))
      if (isDoctor) patient.doctorComment = text
      else patient.adminNote = text
      patient.updatedAt = updatedAt
      patient.updatedBy = currentUser.name
      saveState(`${isDoctor ? 'Добавлен комментарий врача' : 'Добавлено примечание'}: ${patient.name}`)
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
          <div><h2 id="quickCommentTitle">${isDoctor ? 'Комментарий врача' : 'Примечание'}</h2><p>${esc(patient.name)}</p></div>
        </div>
        <label class="field quick-comment-field"><span>${isDoctor ? 'Комментарий врача' : 'Примечание'}</span><textarea id="quickCommentText" rows="8" aria-label="${isDoctor ? 'Введите комментарий' : 'Введите примечание'}">${esc(isDoctor ? patient.doctorComment || '' : patient.adminNote || '')}</textarea></label>
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
    patient.history.unshift(createHistoryEntry(type, text))
    if (isDoctor) patient.doctorComment = text
    else patient.adminNote = text
    patient.updatedAt = updatedAt
    patient.updatedBy = currentUser.name
    saveState(`${isDoctor ? 'Добавлен комментарий врача' : 'Добавлено примечание'}: ${patient.name}`)
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

function specialNoteCardMarkup(patient, savedPatient) {
  const note = String(patient.specialNote || '').trim()
  if (!savedPatient) return `<section class="special-note-card"><div class="special-note-heading"><strong>${specialNoteBadge({ specialNote:'Особое примечание' }, 'static')} Особое примечание</strong></div><small>Сначала сохраните карточку пациента, затем добавьте особое примечание.</small></section>`
  if (!note) return `<section class="special-note-card"><button type="button" class="special-note-add" data-edit-special-note="${patient.id}">+ Добавить особое примечание</button></section>`
  return `<section class="special-note-card has-note"><div class="special-note-heading"><strong>${specialNoteBadge(patient, 'static')} Особое примечание</strong><span>${esc(patient.specialNoteUpdatedBy || '')}</span></div><p data-clamped-content>${esc(note)}</p><div class="special-note-actions"><button type="button" class="btn" data-toggle-clamped>Развернуть</button><button type="button" class="btn" data-edit-special-note="${patient.id}">Редактировать</button><button type="button" class="btn danger-text" data-delete-special-note="${patient.id}">Удалить</button></div></section>`
}

function openSpecialNoteModal(patientId) {
  const patient = state.patients.find(item => item.id === patientId)
  if (!patient) return
  const previous = String(patient.specialNote || '').trim()
  document.querySelector('#specialNoteModal')?.remove()
  document.body.insertAdjacentHTML('beforeend', `<div class="modal" id="specialNoteModal"><div class="dialog special-note-dialog" role="dialog" aria-modal="true" aria-labelledby="specialNoteDialogTitle"><div class="dialog-head"><div><h2 id="specialNoteDialogTitle"><span class="special-note-badge static"><span>!</span></span> Особое примечание</h2><p>${esc(patient.name)}</p></div><button class="icon-btn" data-close-special-note>×</button></div><label class="field special-note-editor"><span>Особое примечание</span><textarea id="specialNoteText" maxlength="200" rows="5">${esc(previous)}</textarea><small><span id="specialNoteEditCounter">${previous.length}</span>/200 · Только короткая важная информация</small></label><div class="dialog-actions"><button class="btn" data-close-special-note>Отмена</button><button class="btn primary" id="saveSpecialNote">Сохранить</button></div></div></div>`)
  const modal = document.querySelector('#specialNoteModal')
  const textarea = modal.querySelector('#specialNoteText')
  textarea.addEventListener('input', () => { modal.querySelector('#specialNoteEditCounter').textContent = textarea.value.length })
  modal.querySelectorAll('[data-close-special-note]').forEach(button => button.onclick = () => modal.remove())
  modal.addEventListener('click', event => { if (event.target === modal) modal.remove() })
  modal.querySelector('#saveSpecialNote').onclick = () => {
    const next = textarea.value.trim()
    if (!next) return alert('Введите особое примечание или используйте действие «Удалить» в карточке пациента')
    if (next.length > 200) return alert('Особое примечание не может быть длиннее 200 символов')
    if (next === previous) return modal.remove()
    updateSpecialNote(patient, next)
    modal.remove(); document.querySelector('#patientModal')?.remove(); openPatientModal(patient.id)
  }
  textarea.focus()
}

function updateSpecialNote(patient, nextValue) {
  const previous = String(patient.specialNote || '').trim()
  const next = String(nextValue || '').trim()
  if (previous === next) return
  const verb = !previous ? 'Добавлено' : !next ? 'Удалено' : 'Изменено'
  patient.specialNote = next
  patient.specialNoteUpdatedBy = currentUser.name
  patient.specialNoteUpdatedAt = new Date().toISOString()
  patient.updatedAt = patient.specialNoteUpdatedAt
  patient.updatedBy = currentUser.name
  patient.history ||= []
  patient.history.unshift(createHistoryEntry('special_note', `${verb} особое примечание${verb === 'Добавлено' ? `: «${next}».` : '.'}`, { actionIcon:'!', oldValue:previous, newValue:next }))
  saveState(`${verb} особое примечание: ${patient.name}`)
}

function compactPatientTaskMarkup(task) {
  const overdue = isTaskOverdue(task)
  const comment = String(task.comment || task.note || '').trim()
  return `<article class="compact-patient-task ${overdue ? 'overdue' : ''}"><div class="compact-task-main"><strong>${esc(compactTaskLabel(task))}</strong><time>${esc(formatTaskDue(task))}</time>${comment ? `<p>${esc(comment)}</p>` : ''}</div><div class="compact-task-actions">${isTaskActive(task) ? `<button type="button" class="btn primary" data-card-process-task="${task.id}">Выполнить</button>` : ''}<button type="button" class="btn" data-edit-task="${task.id}">Изменить</button></div></article>`
}

function openPatientModal(patientId = null) {
  const original = state.patients.find(p => p.id === patientId)
  const patient = original ? cloneData(original) : {
    id: uid(), name: '', phones: [''], doctors: ['Моисеев Г.А.'], appointmentDate: '',
    doctorComment: '', specialNote: '', status: '🆕 Новый', adminNote: '', urgent: false,
    createdAt: todayISO(), updatedAt: new Date().toISOString(), updatedBy: currentUser.name,
    history: [], externalId: null,
  }
  const patientTasks = state.tasks
    .filter(task => task.patientId === patient.id)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const activePatientTasks = patientTasks.filter(isTaskActive)
  const completedPatientTasks = patientTasks.filter(isTaskCompleted)
  const nearestTask = activePatientTasks[0] || null
  const patientHistory = commentHistory(patient.history)

  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal" id="patientModal">
      <div class="dialog wide-dialog patient-card-dialog">
        <div class="dialog-head">
          <div><h2>${original ? 'Карточка пациента' : 'Новый пациент'}</h2><p class="patient-card-name">${original ? `${esc(patient.name)} ${specialNoteBadge(patient)}` : 'Заполните данные пациента'}</p></div>
          <button class="icon-btn" data-close>×</button>
        </div>
        <div class="patient-summary-grid">
          <section><label class="field"><span>ФИО</span><input id="pName" value="${esc(patient.name)}" placeholder="Фамилия Имя Отчество"></label><label class="field"><span>Телефон</span><input id="pPhone1" value="${esc(patient.phones?.[0] || '')}"></label><label class="field"><span>Дополнительный телефон</span><input id="pPhone2" value="${esc(patient.phones?.[1] || '')}"></label><label class="field"><span>Врач</span><input id="pDoctors" value="${esc((patient.doctors || []).join(', '))}" placeholder="Можно указать нескольких через запятую"></label></section>
          <section><label class="field"><span>Этап пациента</span><input id="pStatus" value="${esc(normalizePatientStatus(patient.status))}" readonly title="Статус изменяется через мастер действий в таблице"></label><div class="patient-summary-item"><span>Ближайшая активная задача</span><b>${nearestTask ? esc(compactTaskLabel(nearestTask)) : '—'}</b><small>${nearestTask ? esc(formatTaskDue(nearestTask)) : 'Нет активных задач'}</small></div><div class="patient-appointment-fields">${manualDateMarkup('pAppointment', 'Дата приёма', patient.appointmentDate || '')}${manualTimeMarkup('pAppointment', 'Время приёма', patient.appointmentAt?.slice(11, 16) || (patient.appointmentDate ? '10:00' : ''))}</div><div class="patient-summary-item"><span>Дата создания пациента</span><b>${formatDate(patient.createdAt)}</b></div></section>
        </div>
        <section class="patient-card-section active-tasks-section"><div class="compact-section-head"><h3>Активные задачи · ${activePatientTasks.length}</h3><button class="btn" id="addTaskBtn">+ Задача</button></div><div class="compact-task-list">${activePatientTasks.length ? activePatientTasks.slice(0,3).map(compactPatientTaskMarkup).join('') : '<div class="compact-empty">Активных задач нет</div>'}</div>${activePatientTasks.length > 3 ? `<details class="more-patient-tasks"><summary>Показать все · ${activePatientTasks.length}</summary><div class="compact-task-list">${activePatientTasks.slice(3).map(compactPatientTaskMarkup).join('')}</div></details>` : ''}</section>
        <section class="patient-card-section compact-comment-section"><div class="compact-section-head"><h3>Примечание</h3><button type="button" class="text-action" data-toggle-admin-comment>+ Добавить примечание</button></div><div class="clamped-text ${patient.adminNote ? '' : 'empty'}">${patient.adminNote ? esc(patient.adminNote) : 'Примечаний пока нет'}</div><label class="field hidden" data-admin-editor><textarea id="pNewNote" placeholder="Новое примечание"></textarea></label><button type="button" class="text-action all-comments-link" data-open-comments-history>Все примечания</button></section>
        ${specialNoteCardMarkup(patient, original)}
        <details class="patient-card-section completed-tasks-section"><summary>Выполненные задачи · ${completedPatientTasks.length}</summary><div class="compact-task-list">${completedPatientTasks.length ? completedPatientTasks.map(compactPatientTaskMarkup).join('') : '<div class="compact-empty">Выполненных задач нет</div>'}</div></details>
        <section class="patient-card-section compact-history-section"><div class="compact-section-head"><h3>История · ${patientHistory.length} записей</h3><button type="button" class="text-action" data-open-full-history>Открыть всю историю</button></div><div class="history-list">${patientHistory.length ? patientHistory.slice(0,4).map(item => historyEntryMarkup(item, true)).join('') : '<div class="compact-empty">История пока пустая</div>'}</div></section>
        <div class="dialog-actions"><button class="btn" data-close>Отмена</button><button class="btn primary" id="savePatient">Сохранить</button></div>
      </div>
    </div>
  `)

  const modal = document.querySelector('#patientModal')
  setupManualDate(modal, 'pAppointment')
  setupManualTime(modal, 'pAppointment')
  setupHistoryExpansion(modal)
  modal.querySelectorAll('select, input, textarea, button').forEach(control => {
    ;['pointerdown','mousedown','click'].forEach(type => control.addEventListener(type, event => event.stopPropagation()))
  })
  modal.querySelectorAll('[data-close]').forEach(button => button.onclick = () => modal.remove())
  modal.querySelector('#addTaskBtn').onclick = () => openTaskModal(null, patient.id)
  modal.querySelectorAll('[data-edit-task]').forEach(button => button.onclick = () => openTaskModal(button.dataset.editTask, patient.id))
  modal.querySelectorAll('[data-card-process-task]').forEach(button => button.onclick = () => openCallResultModal(button.dataset.cardProcessTask, { drawerPatientId:patient.id }))
  modal.querySelector('[data-toggle-admin-comment]')?.addEventListener('click', event => {
    const editor = modal.querySelector('[data-admin-editor]')
    editor.classList.toggle('hidden')
    event.currentTarget.textContent = editor.classList.contains('hidden') ? '+ Добавить комментарий' : 'Свернуть'
    if (!editor.classList.contains('hidden')) editor.querySelector('textarea').focus()
  })
  modal.querySelectorAll('[data-open-comments-history],[data-open-full-history]').forEach(button => button.onclick = () => openHistoryModal(patient.id))
  modal.querySelectorAll('[data-toggle-clamped]').forEach(button => button.onclick = () => {
    const section = button.closest('.patient-card-section,.special-note-card')
    section.classList.toggle('content-expanded')
    button.textContent = section.classList.contains('content-expanded') ? 'Свернуть' : 'Развернуть'
  })
  modal.querySelector('[data-edit-special-note]')?.addEventListener('click', () => openSpecialNoteModal(patient.id))
  modal.querySelector('[data-delete-special-note]')?.addEventListener('click', () => {
    if (!confirm('Удалить особое примечание?')) return
    updateSpecialNote(original, '')
    modal.remove(); openPatientModal(patient.id)
  })
  modal.querySelector('#savePatient').onclick = () => {
    const name = modal.querySelector('#pName').value.trim()
    if (!name) return alert('Укажите ФИО пациента')
    const phone1 = modal.querySelector('#pPhone1').value.trim()
    const duplicate = state.patients.find(p => p.id !== patient.id && (p.name || '').trim().toLowerCase() === name.toLowerCase())
    if (duplicate && !confirm(`Пациент «${duplicate.name}» уже есть в базе. Всё равно сохранить ещё одну карточку?`)) return
    const note = modal.querySelector('#pNewNote').value.trim()
    const appointmentDate = readManualDate(modal, 'pAppointment', false)
    if (appointmentDate === null) return
    const appointmentTime = appointmentDate ? readManualTime(modal, 'pAppointment') : readManualTime(modal, 'pAppointment', false)
    if (appointmentTime === null) return
    const previousData = original ? JSON.stringify({ name: patient.name, phones: patient.phones, doctors: patient.doctors, appointmentDate: patient.appointmentDate, status: patient.status }) : null
    patient.name = name
    patient.phones = [phone1, modal.querySelector('#pPhone2').value.trim()].filter(Boolean)
    patient.doctors = modal.querySelector('#pDoctors').value.split(',').map(v => v.trim()).filter(Boolean)
    patient.appointmentDate = appointmentDate
    patient.appointmentAt = appointmentDate ? `${appointmentDate}T${appointmentTime}:00` : null
    patient.status = modal.querySelector('#pStatus').value
    patient.updatedAt = new Date().toISOString()
    patient.updatedBy = currentUser.name
    patient.history ||= []
    if (note) {
      patient.adminNote = note
      patient.history.unshift(createHistoryEntry('admin_comment', note))
    }
    const currentData = JSON.stringify({ name: patient.name, phones: patient.phones, doctors: patient.doctors, appointmentDate: patient.appointmentDate, status: patient.status })
    if (!original) patient.history.unshift(createHistoryEntry('system', 'Создана карточка пациента'))
    else if (previousData !== currentData) patient.history.unshift(createHistoryEntry('system', 'Изменены данные пациента'))
    if (original) Object.assign(original, patient)
    else state.patients.push(patient)
    saveState(original ? `Изменена карточка: ${patient.name}` : `Создан пациент: ${patient.name}`)
    modal.remove()
    renderPatients()
  }
}

function dateAfterMonths(months) {
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  date.setMonth(date.getMonth() + months)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function createActionTask(patient, { type, title, dueDate, dueAt = null, comment = '', reminderTarget = null }, createdAt) {
  const historyItem = { id:uid(), at:createdAt, author:currentUser.name, action:'created', text:taskHistoryText(type, title, dueDate, comment) }
  const task = {
    id:uid(), patientId:patient.id, type, title, dueDate, dueAt:dueAt || (dueDate ? `${dueDate}T10:00:00` : null), comment, note:comment,
    assignee:currentUser.name, reminderTarget, status:'active', completedAt:null,
    createdAt, createdBy:currentUser.name, updatedAt:createdAt, updatedBy:currentUser.name,
    history:[historyItem],
  }
  state.tasks.push(task)
  return task
}

function completePatientTasks(patientId, predicate, completedAt, reason) {
  state.tasks.filter(task => task.patientId === patientId && isTaskActive(task) && predicate(task)).forEach(task => {
    task.status = 'completed'
    task.completedAt = completedAt
    task.completedBy = currentUser.name
    task.updatedAt = completedAt
    task.updatedBy = currentUser.name
    task.lastResult = reason
    task.history ||= []
    task.history.push({ id:uid(), at:completedAt, author:currentUser.name, action:'completed', text:reason })
  })
}

function openPatientActionModal(patientId, action) {
  document.querySelector('#patientActionModal')?.remove()
  const patient = state.patients.find(item => item.id === patientId)
  const definition = PATIENT_ACTIONS.find(item => item.value === action)
  if (!patient || !definition) return
  const needsDate = ['call','reminder','thinking','invite_checkup','appointment'].includes(action)
  const needsTime = needsDate
  const needsDoctor = action === 'appointment'
  const completedTreatment = action === 'treatment_completed'
  document.body.insertAdjacentHTML('beforeend', `<div class="modal" id="patientActionModal"><div class="dialog patient-action-dialog" role="dialog" aria-modal="true" aria-labelledby="patientActionTitle">
    <div class="dialog-head"><div><h2 id="patientActionTitle">${esc(definition.label)}</h2><p>${esc(patient.name)} · текущий статус: ${esc(normalizePatientStatus(patient.status))}</p></div><button class="icon-btn" data-close-action>×</button></div>
    <div class="patient-action-form">
      ${needsDate ? manualDateMarkup('action', action === 'appointment' ? 'Дата приёма' : action === 'thinking' ? 'Дата следующего звонка' : 'Дата задачи', action === 'invite_checkup' ? dateAfterMonths(6) : localDatePlus(1)) : ''}
      ${needsTime ? manualTimeMarkup('action', action === 'appointment' ? 'Время приёма' : 'Время', action === 'call' ? '12:00' : '10:00') : ''}
      ${needsDoctor ? `<label class="field"><span>Врач</span><select id="actionDoctor"><option value="">Не указан</option>${DOCTORS.map(doctor => `<option>${esc(doctor)}</option>`).join('')}</select></label>` : ''}
      ${action === 'appointment' ? `<section class="appointment-confirmation span-2"><label class="check-field"><input type="checkbox" id="actionCreateConfirmation" checked> Создать задачу подтверждения записи</label><p>Дата выполнения задачи: <strong id="actionConfirmationDate">${formatDate(appointmentConfirmationDeadline(localDatePlus(1)).dueDate)}</strong></p><label class="field"><span>Комментарий задачи</span><textarea id="actionConfirmationComment">Подтвердить приём</textarea></label></section>` : ''}
      ${action === 'refusal' ? `<label class="field span-2"><span>Причина отказа</span><select id="actionRefusalReason"><option value="">Выберите причину</option>${REFUSAL_REASONS.map(item => `<option value="${item.value}">${item.option}</option>`).join('')}</select><small class="form-error" id="actionRefusalReasonError"></small></label><label class="field span-2 hidden" id="actionOtherReasonField"><span>Описание причины</span><textarea id="actionOtherReason" placeholder="Опишите другую причину"></textarea><small class="form-error" id="actionOtherReasonError"></small></label>` : action === 'do_not_call' ? `<label class="field span-2"><span>Причина</span><input id="actionReason" placeholder="Укажите причину"></label>` : ''}
      ${completedTreatment ? `<label class="check-field span-2 action-checkup-offer"><input type="checkbox" id="actionCreateCheckup" checked> Создать задачу «Профосмотр через 6 месяцев»</label><div id="actionCheckupDateField" class="custom-datetime-grid">${manualDateMarkup('actionCheckup', 'Дата профосмотра', dateAfterMonths(6))}${manualTimeMarkup('actionCheckup', 'Время профосмотра', '10:00')}</div>` : ''}
      ${action === 'treatment' ? `<label class="check-field span-2 action-control-offer"><input type="checkbox" id="actionCreateControl"> Создать контрольную задачу</label><div class="hidden custom-datetime-grid" id="actionControlDateField">${manualDateMarkup('actionControl', 'Дата контроля', localDatePlus(7))}${manualTimeMarkup('actionControl', 'Время контроля', '10:00')}</div>` : ''}
      <label class="field span-2"><span>Комментарий</span><textarea id="actionComment" placeholder="Необязательно"></textarea></label>
    </div>
    <div class="dialog-actions"><button class="btn" data-close-action>Отмена</button><button class="btn primary" id="savePatientAction">Сохранить</button></div>
  </div></div>`)
  const modal = document.querySelector('#patientActionModal')
  const close = () => modal.remove()
  modal.querySelectorAll('[data-close-action]').forEach(button => button.onclick = close)
  modal.addEventListener('click', event => { if (event.target === modal) close() })
  modal.querySelector('#actionCreateCheckup')?.addEventListener('change', event => modal.querySelector('#actionCheckupDateField').classList.toggle('hidden', !event.target.checked))
  modal.querySelector('#actionCreateControl')?.addEventListener('change', event => modal.querySelector('#actionControlDateField').classList.toggle('hidden', !event.target.checked))
  modal.querySelector('#actionRefusalReason')?.addEventListener('change', event => {
    modal.querySelector('#actionOtherReasonField').classList.toggle('hidden', event.target.value !== 'other')
    modal.querySelector('#actionRefusalReasonError').textContent = ''
  })
  modal.querySelector('#actionOtherReason')?.addEventListener('input', () => { modal.querySelector('#actionOtherReasonError').textContent = '' })
  if (needsDate) setupAppointmentActionFields(modal)
  if (needsTime) setupManualTime(modal, 'action')
  if (completedTreatment) { setupManualDate(modal, 'actionCheckup'); setupManualTime(modal, 'actionCheckup') }
  if (action === 'treatment') { setupManualDate(modal, 'actionControl'); setupManualTime(modal, 'actionControl') }
  modal.querySelector('#savePatientAction').onclick = () => savePatientAction(patient, action, modal)
  requestAnimationFrame(() => modal.querySelector('input:not([type="checkbox"]), textarea')?.focus())
}

function setupAppointmentActionFields(modal) {
  const textInput = modal.querySelector('#actionDateText')
  const picker = modal.querySelector('#actionDate')
  const calendar = modal.querySelector('#actionDateCalendar')
  const error = modal.querySelector('#actionDateError')
  const confirmation = modal.querySelector('#actionCreateConfirmation')
  const confirmationDate = modal.querySelector('#actionConfirmationDate')
  const refreshConfirmationDate = () => {
    if (confirmationDate) confirmationDate.textContent = picker.value ? formatDate(appointmentConfirmationDeadline(picker.value).dueDate) : '—'
  }
  const commitManualDate = () => {
    const parsed = parseManualDate(textInput.value)
    error.textContent = parsed.error || ''
    if (parsed.error || !parsed.iso) return false
    textInput.value = parsed.formatted
    picker.value = parsed.iso
    refreshConfirmationDate()
    return true
  }
  textInput.addEventListener('input', () => { error.textContent = '' })
  textInput.addEventListener('blur', commitManualDate)
  textInput.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); commitManualDate() } })
  calendar.onclick = () => { try { picker.showPicker() } catch { picker.click() } }
  picker.onchange = () => { textInput.value = picker.value ? formatDate(picker.value) : ''; error.textContent = ''; refreshConfirmationDate() }
  if (confirmation) confirmation.onchange = () => modal.querySelector('#actionConfirmationComment').closest('.field').classList.toggle('hidden', !confirmation.checked)
}

function savePatientAction(patient, action, modal) {
  const needsDate = ['call','reminder','thinking','invite_checkup','appointment'].includes(action)
  const needsTime = needsDate
  let date = needsDate ? readManualDate(modal, 'action') : ''
  let time = needsTime ? readManualTime(modal, 'action') : ''
  const doctor = modal.querySelector('#actionDoctor')?.value || ''
  const reason = modal.querySelector('#actionReason')?.value.trim() || ''
  const refusalReasonCode = modal.querySelector('#actionRefusalReason')?.value || ''
  const refusalReason = REFUSAL_REASONS.find(item => item.value === refusalReasonCode)
  const refusalReasonDetails = modal.querySelector('#actionOtherReason')?.value.trim() || ''
  const comment = modal.querySelector('#actionComment').value.trim()
  if (needsDate && !date) return
  if (needsTime && !time) return
  if (action === 'refusal' && !refusalReason) { modal.querySelector('#actionRefusalReasonError').textContent = 'Выберите причину отказа'; return }
  if (action === 'refusal' && refusalReasonCode === 'other' && !refusalReasonDetails) { modal.querySelector('#actionOtherReasonError').textContent = 'Опишите другую причину'; return }
  if (action === 'do_not_call' && !reason) return alert('Укажите причину')
  const controlDate = action === 'treatment' && modal.querySelector('#actionCreateControl')?.checked ? readManualDate(modal, 'actionControl') : ''
  const controlTime = action === 'treatment' && modal.querySelector('#actionCreateControl')?.checked ? readManualTime(modal, 'actionControl') : ''
  if (action === 'treatment' && modal.querySelector('#actionCreateControl')?.checked && (!controlDate || !controlTime)) return
  const checkupDate = action === 'treatment_completed' && modal.querySelector('#actionCreateCheckup')?.checked ? readManualDate(modal, 'actionCheckup') : ''
  const checkupTime = action === 'treatment_completed' && modal.querySelector('#actionCreateCheckup')?.checked ? readManualTime(modal, 'actionCheckup') : ''
  if (action === 'treatment_completed' && modal.querySelector('#actionCreateCheckup')?.checked && (!checkupDate || !checkupTime)) return
  const now = new Date().toISOString()
  let text = ''
  let icon = '💬'
  if (action === 'call') {
    createActionTask(patient, { type:'call', title:'📞 Позвонить', dueDate:date, dueAt:`${date}T${time}:00`, comment }, now)
    icon = '📞'; text = `Позвонить ${formatDate(date)} в ${time}${comment ? `. ${comment}` : ''}.`
  } else if (action === 'reminder') {
    createActionTask(patient, { type:'reminder', title:'🔔 Напомнить', dueDate:date, dueAt:`${date}T${time}:00`, comment, reminderTarget:'patient' }, now)
    icon = '🔔'; text = `Напомнить ${formatDate(date)} в ${time}${comment ? `. ${comment}` : ''}.`
  } else if (action === 'invite_checkup') {
    createActionTask(patient, { type:'invite_checkup', title:'🦷 Пригласить на профосмотр', dueDate:date, dueAt:`${date}T${time}:00`, comment }, now)
    icon = '🔄'; text = `Пригласить на профосмотр на ${formatDate(date)} в ${time}${comment ? `. ${comment}` : ''}.`
  } else if (action === 'thinking') {
    patient.status = '🤔 Думает'
    createActionTask(patient, { type:'call', title:'📞 Позвонить', dueDate:date, dueAt:`${date}T${time}:00`, comment }, now)
    icon = '🤔'; text = `Пациент думает. Позвонить ${formatDate(date)} в ${time}${comment ? `. ${comment}` : ''}.`
  } else if (action === 'appointment') {
    patient.status = '📅 Записан на приём'; patient.appointmentDate = date; patient.appointmentAt = `${date}T${time}:00`
    if (doctor && !patient.doctors?.includes(doctor)) patient.doctors = [...(patient.doctors || []), doctor]
    completePatientTasks(patient.id, task => isCallTaskType(task.type), now, 'Пациент записан на приём')
    icon = '📅'; text = `Записан на приём ${formatDate(date)} в ${time}${doctor ? `, врач ${doctor}` : ''}${comment ? `. ${comment}` : ''}.`
    if (modal.querySelector('#actionCreateConfirmation').checked) {
      const deadline = appointmentConfirmationDeadline(date)
      const confirmationComment = modal.querySelector('#actionConfirmationComment').value.trim() || 'Подтвердить приём'
      createActionTask(patient, { type:'call', title:'📞 Подтвердить приём', dueDate:deadline.dueDate, dueAt:deadline.dueAt, comment:confirmationComment }, now)
    }
  } else if (action === 'refusal') {
    patient.status = '❌ Отказ'; completePatientTasks(patient.id, () => true, now, 'Отказ пациента')
    patient.refusalReason = refusalReason.value
    patient.refusalReasonLabel = refusalReason.label
    patient.refusalReasonDetails = refusalReasonDetails
    patient.refusalRecordedAt = now
    icon = '❌'; text = `Отказ. Причина: ${refusalReason.label}${refusalReasonDetails ? `. ${refusalReasonDetails}` : ''}.${comment ? ` Комментарий: ${comment.replace(/[.\s]+$/, '')}.` : ''}`
  } else if (action === 'do_not_call') {
    patient.status = '🚫 Не звонить'; completePatientTasks(patient.id, () => true, now, 'Не звонить')
    icon = '🚫'; text = `Не звонить. Причина: ${reason}${comment ? `. ${comment}` : ''}.`
  } else if (action === 'simple_comment') {
    if (!comment) return alert('Введите комментарий')
    icon = '💬'; text = comment.replace(/[.\s]+$/, '') + '.'
  } else {
    const statuses = { treatment:'🦷 На лечении', treatment_completed:'✅ Лечение завершено' }
    patient.status = statuses[action] || patient.status
    icon = ({treatment:'🦷',treatment_completed:'✅'})[action] || '💬'
    text = `${cleanTaskLabel(patient.status)}${comment ? `. ${comment}` : ''}.`
    if (action === 'treatment') {
      completePatientTasks(patient.id, () => true, now, 'Лечение начато')
      if (modal.querySelector('#actionCreateControl')?.checked) {
        createActionTask(patient, { type:'postop_control', title:'🪡 Контроль после начала лечения', dueDate:controlDate, dueAt:`${controlDate}T${controlTime}:00`, comment:comment || 'Контроль после начала лечения' }, now)
        text += ` Контроль назначен на ${formatDate(controlDate)} в ${controlTime}.`
      }
    }
    if (action === 'treatment_completed' && modal.querySelector('#actionCreateCheckup')?.checked) {
      createActionTask(patient, { type:'invite_checkup', title:'🦷 Пригласить на профосмотр', dueDate:checkupDate, dueAt:`${checkupDate}T${checkupTime}:00`, comment:'Профосмотр после завершения лечения' }, now)
      text += ` Профосмотр назначен на ${formatDate(checkupDate)} в ${checkupTime}.`
    }
  }
  if (comment && action !== 'simple_comment') patient.adminNote = comment
  patient.updatedAt = now; patient.updatedBy = currentUser.name; patient.history ||= []
  patient.history.unshift(createHistoryEntry('action', text, { actionIcon:icon, action }))
  saveState(`${definitionForAction(action)}: ${patient.name}`)
  modal.remove(); renderPatients(); showToast('Действие сохранено.')
}

function definitionForAction(action) {
  return PATIENT_ACTIONS.find(item => item.value === action)?.label || 'Действие'
}

function openTaskDrawer(patientId, showForm = false) {
  document.querySelector('#taskDrawerOverlay')?.remove()
  const patient = state.patients.find(item => item.id === patientId)
  if (!patient) return
  const activeTasks = state.tasks.filter(task => task.patientId === patientId && isTaskActive(task))
  const formVisible = showForm || activeTasks.length === 0
  document.body.insertAdjacentHTML('beforeend', `<div class="drawer-overlay" id="taskDrawerOverlay">
    <aside class="task-drawer" role="dialog" aria-modal="true" aria-labelledby="taskDrawerTitle">
      <div class="drawer-head"><div><h2 id="taskDrawerTitle">${esc(patient.name)} ${specialNoteBadge(patient)}</h2><p>Задачи пациента</p></div><button class="icon-btn" data-close-drawer>×</button></div>
      ${formVisible ? taskDrawerForm(patient) : `<button class="btn primary drawer-add" id="drawerAddTask">+ Добавить задачу</button>${taskDrawerList(activeTasks)}`}
    </aside>
  </div>`)
  const overlay = document.querySelector('#taskDrawerOverlay')
  const handleEscape = event => {
    if (event.key === 'Escape') close()
  }
  const close = () => {
    document.removeEventListener('keydown', handleEscape)
    overlay.remove()
  }
  document.addEventListener('keydown', handleEscape)
  overlay.querySelector('[data-close-drawer]').onclick = close
  overlay.addEventListener('click', event => { if (event.target === overlay) close() })
  overlay.querySelector('#drawerAddTask')?.addEventListener('click', () => openTaskDrawer(patientId, true))
  overlay.querySelector('#cancelDrawerTask')?.addEventListener('click', () => activeTasks.length ? openTaskDrawer(patientId) : close())
  const drawerType = overlay.querySelector('#drawerTaskType')
  const drawerRecipient = overlay.querySelector('#drawerReminderRecipient')
  const updateDrawerRecipient = () => drawerRecipient?.classList.toggle('hidden', drawerType?.value !== 'reminder')
  drawerType?.addEventListener('change', updateDrawerRecipient)
  updateDrawerRecipient()
  if (overlay.querySelector('#drawerTaskDateText')) setupManualDate(overlay, 'drawerTask')
  if (overlay.querySelector('#drawerTaskTime')) setupManualTime(overlay, 'drawerTask')
  overlay.querySelectorAll('[data-process-task]').forEach(button => button.onclick = event => {
    event.stopPropagation()
    openCallResultModal(button.dataset.processTask, { drawerPatientId: patientId })
  })
  overlay.querySelector('#saveDrawerTask')?.addEventListener('click', () => {
    const type = overlay.querySelector('#drawerTaskType').value
    const dueDate = readManualDate(overlay, 'drawerTask')
    const dueTime = readManualTime(overlay, 'drawerTask')
    if (!dueDate || !dueTime) return
    const typeLabel = TASK_TYPES.find(item => item.value === type)?.label || 'Задача'
    const comment = overlay.querySelector('#drawerTaskComment').value.trim()
    const createdAt = new Date().toISOString()
    const task = {
      id: uid(), patientId, type, title: typeLabel, dueDate, dueAt:dueTime ? `${dueDate}T${dueTime}:00` : null, comment, note: comment,
      assignee: overlay.querySelector('#drawerTaskAssignee').value, reminderTarget: type === 'reminder' ? overlay.querySelector('#drawerReminderTarget').value : null,
      status: 'active', completedAt: null, createdAt, createdBy: currentUser.name,
      history: [{ id:uid(), at:createdAt, author:currentUser.name, action:'created', text:taskHistoryText(type, typeLabel, dueDate, comment) }],
    }
    state.tasks.push(task)
    patient.updatedAt = createdAt
    patient.updatedBy = currentUser.name
    patient.history ||= []
    patient.history.unshift(createHistoryEntry('task', taskHistoryText(type, typeLabel, dueDate, comment), { taskType: type }))
    saveState(`Создана задача: ${typeLabel}`)
    renderPatients()
    openTaskDrawer(patientId)
  })
}

function taskDrawerForm(patient) {
  return `<div class="drawer-form">
    <label class="field"><span>Тип задачи</span><select id="drawerTaskType">${TASK_TYPES.map(item => `<option value="${item.value}">${item.label}</option>`).join('')}</select></label>
    <label class="field hidden" id="drawerReminderRecipient"><span>Кому напомнить</span><select id="drawerReminderTarget"><option value="patient">Пациенту</option><option value="doctor">Доктору</option></select></label>
    ${manualDateMarkup('drawerTask', 'Дата выполнения', localDatePlus(0))}
    ${manualTimeMarkup('drawerTask', 'Время выполнения', '10:00')}
    <label class="field"><span>Комментарий</span><textarea id="drawerTaskComment" placeholder="Необязательно"></textarea></label>
    <label class="field"><span>Ответственный администратор</span><select id="drawerTaskAssignee">${USERS.filter(user => user.role === 'admin').map((user, index) => `<option ${user.name === (currentUser.role === 'admin' ? currentUser.name : '') || (currentUser.role !== 'admin' && index === 0) ? 'selected' : ''}>${user.name}</option>`).join('')}</select></label>
    <div class="dialog-actions"><button class="btn" id="cancelDrawerTask">Отмена</button><button class="btn primary" id="saveDrawerTask">Сохранить</button></div>
  </div>`
}

function taskDrawerList(tasks) {
  return `<div class="drawer-task-list">${tasks.map(task => `<article class="drawer-task">
    <div><strong>${esc(taskTypeDisplay(task))}</strong><time class="${task.dueDate < localDatePlus(0) ? 'late' : ''}">${formatTaskDue(task)}</time></div>
    <small>${esc(task.assignee || 'Без ответственного')}</small>
    ${(task.comment || task.note) ? `<p>${esc(task.comment || task.note)}</p>` : ''}
    <button class="process-task-btn" type="button" data-process-task="${task.id}" title="Указать результат звонка">☎ Обработать</button>
  </article>`).join('')}</div>`
}

function taskCard(task) {
  const type = taskTypeDisplay(task)
  return `<button class="patient-task ${task.status}" data-edit-task="${task.id}"><span>${type}</span><strong>${esc(task.title)}</strong><time>${formatTaskDue(task)}</time><small>${esc(task.assignee || 'Без ответственного')} · ${isTaskCompleted(task) ? 'Выполнена' : task.status === 'cancelled' ? 'Отменена' : 'Активна'}</small></button>`
}

function openUpcomingTasksModal() {
  document.querySelector('#upcomingTasksModal')?.remove()
  const tasks = [...getUpcomingActiveTasks()].sort((a, b) => taskDueSortValue(a).localeCompare(taskDueSortValue(b)))
  document.body.insertAdjacentHTML('beforeend', `<div class="modal" id="upcomingTasksModal"><div class="dialog upcoming-tasks-dialog" role="dialog" aria-modal="true" aria-labelledby="upcomingTasksTitle">
    <div class="dialog-head"><div><h2 id="upcomingTasksTitle">📆 Будущие задачи</h2><p>Активные задачи начиная с послезавтра · ${tasks.length}</p></div><button class="icon-btn" data-close-upcoming>×</button></div>
    <div class="modal-task-list">${tasks.length ? tasks.map(task => {
      const patient = state.patients.find(item => item.id === task.patientId)
      const type = taskTypeDisplay(task)
      return `<article class="modal-task-row"><button class="modal-task-patient" data-upcoming-patient="${task.patientId}"><b>${esc(patient?.name || 'Пациент удалён')} ${specialNoteBadge(patient)}</b><span>${esc(patient?.phones?.[0] || '')}</span></button><div><b>${esc(type)}</b><span>${formatTaskDue(task)}</span>${(task.comment || task.note) ? `<p>${esc(task.comment || task.note)}</p>` : ''}</div><button class="process-task-btn" data-process-task="${task.id}" title="Указать результат звонка">☎ Обработать</button></article>`
    }).join('') : '<div class="empty-box large">Будущих задач нет</div>'}</div>
  </div></div>`)
  const modal = document.querySelector('#upcomingTasksModal')
  const close = () => modal.remove()
  modal.querySelector('[data-close-upcoming]').onclick = close
  modal.addEventListener('click', event => { if (event.target === modal) close() })
  modal.querySelectorAll('[data-process-task]').forEach(button => button.onclick = () => openCallResultModal(button.dataset.processTask, { taskListModal: 'upcoming' }))
  modal.querySelectorAll('[data-upcoming-patient]').forEach(button => button.onclick = () => { close(); openPatientModal(button.dataset.upcomingPatient) })
}

function renderTasks() {
  const content = document.querySelector('#content')
  const today = todayISO()
  const tomorrow = localDatePlus(1)
  const activeTasks = state.tasks.filter(isTaskActive)
  const taskCounts = {
    today:activeTasks.filter(task => task.dueDate === today).length,
    tomorrow:activeTasks.filter(task => task.dueDate === tomorrow).length,
    upcoming:activeTasks.filter(task => task.dueDate > tomorrow).length,
    overdue:activeTasks.filter(isTaskOverdue).length,
  }
  const filtered = state.tasks.filter(task => {
    const patient = state.patients.find(p => p.id === task.patientId)
    if (searchText && !patientMatches(patient || {})) return false
    if (activeTaskFilter === 'today') return isTaskActive(task) && task.dueDate === today
    if (activeTaskFilter === 'tomorrow') return isTaskActive(task) && task.dueDate === tomorrow
    if (activeTaskFilter === 'overdue') return isTaskOverdue(task)
    if (activeTaskFilter === 'upcoming') return isTaskActive(task) && task.dueDate > tomorrow
    if (activeTaskFilter === 'recall') return isTaskActive(task) && isCheckupTaskType(task.type)
    if (activeTaskFilter === 'done') return isTaskCompleted(task)
    return true
  }).sort((a, b) => taskDueSortValue(a).localeCompare(taskDueSortValue(b)))

  content.innerHTML = `
    <section class="page-head"><div><h1>Задачи</h1><p>У пациента может быть любое количество независимых дат</p></div><button class="btn primary" id="newTask">+ Новая задача</button></section>
    <div class="filter-tabs">
      ${taskFilterButton('today', `🟠 Задачи сегодня (${taskCounts.today})`)}${taskFilterButton('tomorrow', `🟡 Задачи завтра (${taskCounts.tomorrow})`)}${taskFilterButton('upcoming', `🟢 Будущие задачи (${taskCounts.upcoming})`)}${taskFilterButton('overdue', `🔴 Просроченные задачи (${taskCounts.overdue})`)}${taskFilterButton('recall', 'Профосмотры')}${taskFilterButton('done', 'Выполненные')}${taskFilterButton('all', 'Все')}
    </div>
    <section class="task-list">
      ${filtered.length ? filtered.map(taskRow).join('') : '<div class="empty-box large">В этой группе задач нет</div>'}
    </section>
  `
  document.querySelector('#newTask').onclick = () => openTaskModal()
  document.querySelectorAll('[data-filter]').forEach(button => button.onclick = () => { activeTaskFilter = button.dataset.filter; renderTasks() })
  document.querySelectorAll('[data-task]').forEach(row => row.onclick = () => openTaskModal(row.dataset.task))
  document.querySelectorAll('[data-process-task]').forEach(button => {
    button.onclick = event => {
      event.stopPropagation()
      openCallResultModal(button.dataset.processTask)
    }
  })
}

function taskFilterButton(value, label) {
  return `<button class="filter-btn ${activeTaskFilter === value ? 'active' : ''}" data-filter="${value}">${label}</button>`
}

function taskRow(task) {
  const patient = state.patients.find(p => p.id === task.patientId)
  const overdue = isTaskOverdue(task)
  return `<article class="task-row ${overdue ? 'overdue' : ''}" data-task="${task.id}">
    <div class="task-date"><b>${task.dueAt ? task.dueAt.slice(11, 16) : formatDate(task.dueDate).slice(0, 5)}</b><span>${task.dueAt && task.dueDate === todayISO() ? 'сегодня' : formatDate(task.dueDate)}</span></div>
    <div class="task-main"><span>${esc(taskTypeDisplay(task))}</span><strong>${esc(task.title)}</strong><small>${esc(task.note || '')}</small></div>
    <div class="task-patient"><b>${esc(patient?.name || 'Пациент удалён')} ${specialNoteBadge(patient)}</b><span>${esc(patient?.phones?.[0] || '')}</span></div>
    <div class="task-owner"><b>${esc(task.assignee || '—')}</b><span>${isTaskActive(task) ? 'Активна' : isTaskCompleted(task) ? 'Выполнена' : 'Отменена'}</span></div>
    ${isTaskActive(task) ? `<button class="process-task-btn" data-process-task="${task.id}" title="Указать результат звонка">☎ Обработать</button>` : `<div class="task-result"><b>${formatDateTime(task.completedAt)}</b><span>${esc(task.completedBy || '—')}</span>${task.lastResult ? `<small>${esc(task.lastResult)}</small>` : ''}${task.lastResultComment ? `<small>${esc(task.lastResultComment)}</small>` : ''}</div>`}
  </article>`
}

function isAppointmentConfirmationTask(task) {
  return task?.type === 'call' && /подтвердить\s+при[её]м/i.test(cleanTaskLabel(task.title || ''))
}

function completeTaskRecord(task, completedAt, result, comment = '') {
  task.status = 'completed'
  task.completedAt = completedAt
  task.completedBy = currentUser.name
  task.updatedAt = completedAt
  task.updatedBy = currentUser.name
  task.lastResult = result
  task.lastResultComment = comment
  task.history ||= []
  task.history.push({ id:uid(), at:completedAt, author:currentUser.name, action:'completed', text:[result, comment].filter(Boolean).join('. ') })
}

function openAppointmentConfirmationResult(task, patient, options = {}) {
  const appointmentDate = patient.appointmentAt?.slice(0, 10) || patient.appointmentDate || localDatePlus(1)
  const appointmentTime = patient.appointmentAt?.slice(11, 16) || '10:00'
  document.body.insertAdjacentHTML('beforeend', `<div class="modal" id="appointmentConfirmationResult"><div class="dialog call-result-dialog confirmation-result-dialog" role="dialog" aria-modal="true" aria-labelledby="confirmationResultTitle">
    <div class="dialog-head"><div><h2 id="confirmationResultTitle">Подтвердить приём</h2><p>${esc(patient.name)} · приём ${formatDate(appointmentDate)} в ${appointmentTime}</p></div><button class="icon-btn" data-close-confirmation-result>×</button></div>
    <section><h3 class="call-result-step">Удалось дозвониться?</h3><div class="call-result-options"><label><input type="radio" name="confirmationReached" value="yes"> <span>Да</span></label><label><input type="radio" name="confirmationReached" value="no"> <span>Нет</span></label></div></section>
    <section class="hidden" id="confirmationNoContact"><h3 class="call-result-step">Когда позвонить снова?</h3><div class="custom-datetime-grid">${manualDateMarkup('confirmationCall', 'Дата следующего звонка', localDatePlus(1))}${manualTimeMarkup('confirmationCall', 'Время следующего звонка', '10:00')}</div><label class="field"><span>Комментарий</span><textarea id="confirmationNoComment" placeholder="Необязательно"></textarea></label></section>
    <section class="hidden" id="confirmationReached"><h3 class="call-result-step">Подтвердил запись?</h3><div class="call-result-options"><label><input type="radio" name="appointmentConfirmed" value="yes" checked> <span>Да, запись подтверждена</span></label><label><input type="radio" name="appointmentConfirmed" value="no"> <span>Нет, требуется изменить запись</span></label></div><div class="hidden" id="confirmationReschedule"><div class="custom-datetime-grid">${manualDateMarkup('confirmationAppointment', 'Новая дата приёма', appointmentDate)}${manualTimeMarkup('confirmationAppointment', 'Новое время', appointmentTime)}</div><label class="field"><span>Комментарий</span><textarea id="confirmationMoveComment" placeholder="Например: просил перенести на 15 минут позже"></textarea></label></div></section>
    <div class="dialog-actions"><button class="btn" data-close-confirmation-result>Отмена</button><button class="btn primary" id="saveConfirmationResult" disabled>Сохранить</button></div>
  </div></div>`)
  const modal = document.querySelector('#appointmentConfirmationResult')
  const close = () => modal.remove()
  modal.querySelectorAll('[data-close-confirmation-result]').forEach(button => button.onclick = close)
  modal.addEventListener('click', event => { if (event.target === modal) close() })
  setupManualDate(modal, 'confirmationCall')
  setupManualTime(modal, 'confirmationCall')
  setupManualDate(modal, 'confirmationAppointment')
  setupManualTime(modal, 'confirmationAppointment')
  const saveButton = modal.querySelector('#saveConfirmationResult')
  modal.querySelectorAll('[name="confirmationReached"]').forEach(radio => radio.onchange = () => {
    const reached = radio.value === 'yes'
    modal.querySelector('#confirmationReached').classList.toggle('hidden', !reached)
    modal.querySelector('#confirmationNoContact').classList.toggle('hidden', reached)
    saveButton.disabled = false
  })
  modal.querySelectorAll('[name="appointmentConfirmed"]').forEach(radio => radio.onchange = () => modal.querySelector('#confirmationReschedule').classList.toggle('hidden', radio.value !== 'no'))
  saveButton.onclick = () => {
    const reached = modal.querySelector('[name="confirmationReached"]:checked')?.value
    if (!reached) return
    const now = new Date().toISOString()
    patient.history ||= []
    if (reached === 'no') {
      const dueDate = readManualDate(modal, 'confirmationCall')
      const dueTime = readManualTime(modal, 'confirmationCall')
      if (!dueDate || !dueTime) return
      const comment = modal.querySelector('#confirmationNoComment').value.trim()
      completeTaskRecord(task, now, 'Не дозвонились', comment)
      createActionTask(patient, { type:'call', title:'📞 Позвонить', dueDate, dueAt:`${dueDate}T${dueTime}:00`, comment }, now)
      if (comment) patient.adminNote = comment
      patient.history.unshift(createHistoryEntry('action', `Не дозвонились. Позвонить ${formatDate(dueDate)} в ${dueTime}${comment ? `. ${comment}` : ''}.`, { actionIcon:'📞', taskType:'call' }))
    } else {
      const confirmed = modal.querySelector('[name="appointmentConfirmed"]:checked')?.value !== 'no'
      if (confirmed) {
        completeTaskRecord(task, now, 'Приём подтверждён')
        patient.history.unshift(createHistoryEntry('action', `Подтвердила приём на ${formatDate(appointmentDate)} в ${appointmentTime}.`, { actionIcon:'📞', taskType:'call' }))
      } else {
        const newDate = readManualDate(modal, 'confirmationAppointment')
        const newTime = readManualTime(modal, 'confirmationAppointment')
        if (!newDate || !newTime) return
        const comment = modal.querySelector('#confirmationMoveComment').value.trim()
        completeTaskRecord(task, now, 'Приём перенесён', comment)
        if (comment) patient.adminNote = comment
        patient.appointmentDate = newDate
        patient.appointmentAt = `${newDate}T${newTime}:00`
        const historyText = `Подтвердила разговор. Приём перенесён с ${formatDate(appointmentDate)} ${appointmentTime} на ${formatDate(newDate)} ${newTime}${comment ? `. ${comment}` : ''}.`
        patient.history.unshift(createHistoryEntry('action', historyText, { actionIcon:'📞', taskType:'call' }))
        if (newDate > todayISO()) {
          const deadline = appointmentConfirmationDeadline(newDate)
          const duplicate = state.tasks.some(item => item.patientId === patient.id && isTaskActive(item) && isAppointmentConfirmationTask(item) && item.dueDate === deadline.dueDate)
          if (!duplicate) createActionTask(patient, { type:'call', title:'📞 Подтвердить приём', dueDate:deadline.dueDate, dueAt:deadline.dueAt, comment:'Подтвердить приём' }, now)
        }
      }
    }
    patient.status = '📅 Записан на приём'
    patient.updatedAt = now
    patient.updatedBy = currentUser.name
    saveState(`Обработано подтверждение приёма: ${patient.name}`)
    modal.remove()
    finishCallResult(options)
    showToast('Результат подтверждения сохранён.')
  }
}

function openCallResultModal(taskId, options = {}) {
  document.querySelector('#callResultModal')?.remove()
  const task = state.tasks.find(item => item.id === taskId)
  const patient = state.patients.find(item => item.id === task?.patientId)
  if (!task || !patient || !isTaskActive(task)) return
  if (isAppointmentConfirmationTask(task)) return openAppointmentConfirmationResult(task, patient, options)
  document.body.insertAdjacentHTML('beforeend', `<div class="modal" id="callResultModal"><div class="dialog call-result-dialog" role="dialog" aria-modal="true" aria-labelledby="callResultTitle">
    <div class="dialog-head"><div><h2 id="callResultTitle">Результат задачи</h2><p>${esc(patient.name)} · ${esc(task.title)} · срок ${formatTaskDue(task)}</p></div><button class="icon-btn" data-close-result>×</button></div>
    <h3 class="call-result-step">1. Что произошло?</h3><div class="call-result-options">
      <label><input type="radio" name="callResult" value="completed"> <span>Дозвонились — задача выполнена</span></label>
      <label><input type="radio" name="callResult" value="no_contact"> <span>Не дозвонились</span></label>
      <label><input type="radio" name="callResult" value="requested"> <span>Пациент попросил перезвонить</span></label>
      <label><input type="radio" name="callResult" value="unavailable"> <span>Номер недоступен / выключен</span></label>
      <label><input type="radio" name="callResult" value="rejected"> <span>Сбросил звонок</span></label>
      <label><input type="radio" name="callResult" value="messenger"> <span>Связались в мессенджере</span></label>
    </div>
    <section class="followup-section hidden" id="followupSection"><h3 class="call-result-step">2. Когда связаться повторно?</h3><div class="followup-buttons">
      <button type="button" data-followup="minutes:15">Через 15 минут</button><button type="button" data-followup="minutes:30">Через 30 минут</button><button type="button" data-followup="minutes:60">Через 1 час</button><button type="button" data-followup="later">Сегодня позже</button><button type="button" data-followup="tomorrow">Завтра</button><button type="button" data-followup="days:3">Через 3 дня</button><button type="button" data-followup="custom">Выбрать дату и время</button>
    </div>
    <div class="today-later-options hidden" id="todayLaterOptions"><button type="button" data-later="minutes:120">Через 2 часа</button><button type="button" data-later="time:15:00">15:00</button><button type="button" data-later="time:17:00">17:00</button>${manualTimeMarkup('laterManual', 'Другое время сегодня', '')}</div>
    <div class="custom-call-date hidden" id="customCallDate"><div class="custom-datetime-grid">${manualDateMarkup('callResult', 'Дата', '')}${manualTimeMarkup('callResult', 'Время', '10:00')}</div></div>
    <div class="selected-followup" id="selectedFollowup"></div></section>
    <section class="contact-outcome hidden" id="contactOutcome"><h3 class="call-result-step">2. Чем завершился разговор?</h3><label class="field"><span>Итог разговора</span><select id="contactOutcomeStatus"><option value="">Выберите результат</option><option value="appointment">📅 Записан на приём</option><option value="reminder">🔔 Создать напоминание</option><option value="thinking">🤔 Думает</option><option value="treatment">🦷 На лечении</option><option value="treatment_completed">✅ Лечение завершено</option><option value="checkup_status">🔄 Профосмотр</option><option value="refusal">❌ Отказ</option><option value="do_not_call">🚫 Не звонить</option><option value="other">Другое</option></select></label>
      <div class="outcome-extra hidden" id="appointmentOutcome"><div class="custom-datetime-grid">${manualDateMarkup('outcomeAppointment', 'Дата приёма', '')}${manualTimeMarkup('outcomeAppointment', 'Время приёма', '10:00')}</div><label class="field"><span>Врач</span><select id="outcomeDoctor">${DOCTORS.map(doctor => `<option>${esc(doctor)}</option>`).join('')}</select></label></div>
      <div class="outcome-extra hidden" id="reminderOutcome"><div class="custom-datetime-grid">${manualDateMarkup('outcomeReminder', 'Дата напоминания', '')}${manualTimeMarkup('outcomeReminder', 'Время', '10:00')}</div><label class="field"><span>Кому</span><select id="outcomeReminderTarget"><option value="patient">Пациенту</option><option value="doctor">Доктору</option></select></label><label class="field"><span>Текст напоминания</span><textarea id="outcomeReminderText"></textarea></label></div>
      <div class="outcome-extra hidden" id="refusalOutcome"><label class="field"><span>Причина отказа</span><select id="outcomeRefusalReason"><option value="">Выберите причину</option>${REFUSAL_REASONS.map(item => `<option value="${item.value}">${item.option}</option>`).join('')}</select></label><label class="field hidden" id="outcomeOtherRefusalField"><span>Описание причины</span><textarea id="outcomeOtherRefusal"></textarea></label></div>
      <div class="outcome-extra hidden" id="doNotCallOutcome"><label class="field"><span>Причина</span><input id="outcomeDoNotCallReason"></label></div>
      <div class="outcome-extra hidden" id="otherOutcome"><p class="settings-note">Для варианта «Другое» примечание обязательно.</p><label class="field"><span>Что сделать с задачей</span><select id="outcomeOtherAction"><option value="finish">Завершить задачу</option><option value="repeat">Назначить повторную связь</option></select></label></div>
    </section>
    <label class="field call-result-comment"><span>Примечание</span><textarea id="callResultComment" placeholder="Например: пациент попросил позвонить после 15:00"></textarea></label>
    <div class="dialog-actions"><button class="btn" data-close-result>Отмена</button><button class="btn primary" id="saveCallResult" disabled>Сохранить результат</button></div>
  </div></div>`)
  const modal = document.querySelector('#callResultModal')
  const close = () => modal.remove()
  modal.querySelectorAll('[data-close-result]').forEach(button => button.onclick = close)
  modal.addEventListener('click', event => { if (event.target === modal) close() })
  const followupSection = modal.querySelector('#followupSection')
  const custom = modal.querySelector('#customCallDate')
  const laterOptions = modal.querySelector('#todayLaterOptions')
  const textInput = modal.querySelector('#callResultDateText')
  const picker = modal.querySelector('#callResultDate')
  const error = modal.querySelector('#callResultDateError')
  const saveButton = modal.querySelector('#saveCallResult')
  const outcomeSection = modal.querySelector('#contactOutcome')
  const outcomeStatus = modal.querySelector('#contactOutcomeStatus')
  const selectedLabel = modal.querySelector('#selectedFollowup')
  let selectedFollowup = null
  const updateSaveState = () => {
    const result = modal.querySelector('[name="callResult"]:checked')?.value
    let valid = Boolean(result)
    if (result === 'completed') {
      valid = Boolean(outcomeStatus.value)
      if (outcomeStatus.value === 'appointment') valid = Boolean(modal.querySelector('#outcomeAppointmentDate').value && modal.querySelector('#outcomeAppointmentTime').value)
      if (outcomeStatus.value === 'reminder') valid = Boolean(modal.querySelector('#outcomeReminderDate').value && modal.querySelector('#outcomeReminderTime').value && modal.querySelector('#outcomeReminderText').value.trim())
      if (outcomeStatus.value === 'other') valid = Boolean(modal.querySelector('#callResultComment').value.trim()) && (modal.querySelector('#outcomeOtherAction').value !== 'repeat' || Boolean(selectedFollowup))
    } else if (result) valid = Boolean(selectedFollowup)
    saveButton.disabled = !valid
  }
  setupManualTime(modal, 'callResult')
  setupManualTime(modal, 'laterManual')
  setupManualDate(modal, 'outcomeAppointment', updateSaveState)
  setupManualTime(modal, 'outcomeAppointment')
  setupManualDate(modal, 'outcomeReminder', updateSaveState)
  setupManualTime(modal, 'outcomeReminder')
  const selectFollowup = (dueDate, dueAt, description) => {
    selectedFollowup = { dueDate, dueAt, description }
    selectedLabel.textContent = `Выбрано: ${description}`
    modal.querySelectorAll('[data-followup],[data-later]').forEach(button => button.classList.remove('active'))
    error.textContent = ''
    updateSaveState()
  }
  modal.querySelectorAll('[name="callResult"]').forEach(radio => radio.onchange = () => {
    const completed = radio.value === 'completed'
    followupSection.classList.toggle('hidden', completed)
    outcomeSection.classList.toggle('hidden', !completed)
    if (completed) { selectedFollowup = null; selectedLabel.textContent = '' }
    updateSaveState()
  })
  const updateOutcome = () => {
    const value = outcomeStatus.value
    modal.querySelector('#appointmentOutcome').classList.toggle('hidden', value !== 'appointment')
    modal.querySelector('#reminderOutcome').classList.toggle('hidden', value !== 'reminder')
    modal.querySelector('#refusalOutcome').classList.toggle('hidden', value !== 'refusal')
    modal.querySelector('#doNotCallOutcome').classList.toggle('hidden', value !== 'do_not_call')
    modal.querySelector('#otherOutcome').classList.toggle('hidden', value !== 'other')
    const otherRepeat = value === 'other' && modal.querySelector('#outcomeOtherAction').value === 'repeat'
    followupSection.classList.toggle('hidden', !otherRepeat)
    updateSaveState()
  }
  outcomeStatus.onchange = updateOutcome
  modal.querySelector('#outcomeRefusalReason').onchange = event => modal.querySelector('#outcomeOtherRefusalField').classList.toggle('hidden', event.target.value !== 'other')
  modal.querySelector('#outcomeOtherAction').onchange = updateOutcome
  modal.querySelector('#outcomeAppointmentDate').onchange = event => { modal.querySelector('#outcomeAppointmentDateText').value = event.target.value ? formatDate(event.target.value) : ''; updateSaveState() }
  modal.querySelector('#outcomeAppointmentDateText').onblur = event => { const parsed = parseManualDate(event.target.value); if (!parsed.error && parsed.iso) { event.target.value = parsed.formatted; modal.querySelector('#outcomeAppointmentDate').value = parsed.iso } updateSaveState() }
  modal.querySelectorAll('#contactOutcome input,#contactOutcome textarea,#contactOutcome select,#callResultComment').forEach(control => control.addEventListener('input', updateSaveState))
  modal.querySelector('#callResultCalendar').onclick = () => { try { picker.showPicker() } catch { picker.click() } }
  picker.onchange = () => { textInput.value = picker.value ? formatDate(picker.value) : ''; error.textContent = '' }
  textInput.oninput = () => { error.textContent = ''; selectedFollowup = null; updateSaveState() }
  textInput.onblur = () => {
    if (!textInput.value.trim()) return
    const parsed = parseManualDate(textInput.value)
    error.textContent = parsed.error || ''
    if (!parsed.error) textInput.value = parsed.formatted
  }
  modal.querySelectorAll('[data-followup]').forEach(button => button.onclick = () => {
    const value = button.dataset.followup
    custom.classList.toggle('hidden', value !== 'custom')
    laterOptions.classList.toggle('hidden', value !== 'later')
    selectedFollowup = null
    selectedLabel.textContent = ''
    if (value.startsWith('minutes:')) {
      const date = new Date(Date.now() + Number(value.split(':')[1]) * 60000)
      selectFollowup(localDateTimeValue(date).slice(0, 10), localDateTimeValue(date), button.textContent)
      button.classList.add('active')
    } else if (value === 'tomorrow') {
      selectFollowup(localDatePlus(1), `${localDatePlus(1)}T10:00:00`, 'завтра в 10:00')
      button.classList.add('active')
    } else if (value === 'days:3') {
      selectFollowup(localDatePlus(3), `${localDatePlus(3)}T10:00:00`, 'через 3 дня в 10:00')
      button.classList.add('active')
    }
    updateSaveState()
  })
  modal.querySelectorAll('[data-later]').forEach(button => button.onclick = () => {
    const value = button.dataset.later
    if (value.startsWith('minutes:')) {
      const date = new Date(Date.now() + Number(value.split(':')[1]) * 60000)
      selectFollowup(todayISO(), localDateTimeValue(date), button.textContent)
    } else {
      const time = value.slice(5)
      const dueAt = `${todayISO()}T${time}:00`
      if (new Date(dueAt) <= new Date()) { error.textContent = 'Выберите время позже текущего'; return }
      selectFollowup(todayISO(), dueAt, `сегодня в ${time}`)
    }
    button.classList.add('active')
  })
  modal.querySelector('#laterManualTime').onchange = event => {
    if (!isValidTime(event.target.value)) { error.textContent = 'Введите время в формате ЧЧ:ММ'; return }
    const dueAt = `${todayISO()}T${event.target.value}:00`
    if (new Date(dueAt) <= new Date()) { error.textContent = 'Выберите время позже текущего'; return }
    selectFollowup(todayISO(), dueAt, `сегодня в ${event.target.value}`)
  }
  const updateCustomFollowup = () => {
    const parsed = parseManualDate(textInput.value)
    const time = modal.querySelector('#callResultTime').value
    if (parsed.error || !parsed.iso || !isValidTime(time)) { selectedFollowup = null; updateSaveState(); return }
    const dueAt = `${parsed.iso}T${time}:00`
    if (new Date(dueAt) <= new Date()) { selectedFollowup = null; error.textContent = 'Выберите будущие дату и время'; updateSaveState(); return }
    selectFollowup(parsed.iso, dueAt, `${parsed.formatted}, ${time}`)
  }
  picker.addEventListener('change', updateCustomFollowup)
  modal.querySelector('#callResultTime').onchange = updateCustomFollowup
  saveButton.onclick = () => {
    const result = modal.querySelector('[name="callResult"]:checked')?.value
    if (!result) return alert('Выберите результат звонка')
    const comment = modal.querySelector('#callResultComment').value.trim()
    if (result === 'completed' && outcomeStatus.value === 'other' && modal.querySelector('#outcomeOtherAction').value === 'repeat') {
      if (!selectedFollowup) return
      modal.remove(); applyCallResult(task, patient, 'requested', selectedFollowup, comment); finishCallResult(options); showToast(`Задача перенесена: ${selectedFollowup.description}.`); return
    }
    if (result === 'completed') {
      const outcome = collectContactOutcome(modal, outcomeStatus.value)
      if (!outcome) return
      const complete = () => {
        modal.remove()
        applyCallResult(task, patient, result, null, comment, outcome)
        finishCallResult(options)
        showToast('Задача отмечена выполненной.')
      }
      return userSettings.tasks.confirmCompletion ? openTaskCompletionConfirmation(complete) : complete()
    }
    if (!selectedFollowup) return
    modal.remove()
    applyCallResult(task, patient, result, selectedFollowup, comment)
    finishCallResult(options)
    showToast(`Задача перенесена: ${selectedFollowup.description}.`)
  }
}

function openTaskCompletionConfirmation(onConfirm) {
  document.querySelector('#taskCompletionConfirm')?.remove()
  document.body.insertAdjacentHTML('beforeend', `<div class="modal" id="taskCompletionConfirm"><div class="dialog confirmation-dialog" role="alertdialog" aria-modal="true" aria-labelledby="taskConfirmTitle"><div class="dialog-head"><div><h2 id="taskConfirmTitle">Отметить задачу выполненной?</h2><p>После подтверждения задача перейдёт в список выполненных.</p></div></div><div class="dialog-actions"><button class="btn" id="cancelTaskCompletion">Отмена</button><button class="btn danger-confirm" id="confirmTaskCompletion">Да, задача выполнена</button></div></div></div>`)
  const confirmation = document.querySelector('#taskCompletionConfirm')
  const cancel = confirmation.querySelector('#cancelTaskCompletion')
  cancel.onclick = () => confirmation.remove()
  confirmation.querySelector('#confirmTaskCompletion').onclick = () => { confirmation.remove(); onConfirm() }
  cancel.focus()
}

function collectContactOutcome(modal, status) {
  if (!status) return null
  if (status === 'appointment') {
    const appointmentDate = readManualDate(modal, 'outcomeAppointment')
    const appointmentTime = readManualTime(modal, 'outcomeAppointment')
    if (!appointmentDate || !appointmentTime) return null
    return { status, patientStatus:'📅 Записан на приём', appointmentDate, appointmentTime, doctor:modal.querySelector('#outcomeDoctor').value }
  }
  if (status === 'reminder') {
    const reminderDate = readManualDate(modal, 'outcomeReminder')
    const reminderTime = readManualTime(modal, 'outcomeReminder')
    if (!reminderDate || !reminderTime) return null
    return { status, reminderDate, reminderTime, reminderTarget:modal.querySelector('#outcomeReminderTarget').value, reminderText:modal.querySelector('#outcomeReminderText').value.trim() }
  }
  if (status === 'refusal') {
    const refusalReasonCode = modal.querySelector('#outcomeRefusalReason').value
    const refusalReason = REFUSAL_REASONS.find(item => item.value === refusalReasonCode)
    const refusalReasonDetails = modal.querySelector('#outcomeOtherRefusal').value.trim()
    if (!refusalReason || (refusalReasonCode === 'other' && !refusalReasonDetails)) { alert(refusalReason ? 'Опишите другую причину' : 'Выберите причину отказа'); return null }
    return { status, patientStatus:'❌ Отказ', refusalReason:refusalReason.label, refusalReasonCode, refusalReasonDetails }
  }
  if (status === 'do_not_call') return { status, patientStatus:'🚫 Не звонить', refusalReason:modal.querySelector('#outcomeDoNotCallReason').value.trim() }
  const statuses = { thinking:'🤔 Думает', treatment:'🦷 На лечении', treatment_completed:'✅ Лечение завершено', checkup_status:'🔄 Профосмотр' }
  if (statuses[status]) return { status, patientStatus:statuses[status] }
  if (status === 'other') return { status:'Другое' }
  return { status }
}

function applyCallResult(task, patient, result, followup, comment, outcome = null) {
  const attemptedAt = new Date().toISOString()
  const previousDueDate = task.dueDate || ''
  const previousDueAt = task.dueAt || null
  const resultLabels = { completed: 'Дозвонились', no_contact: 'Не дозвонились', requested: 'Пациент попросил перезвонить', unavailable: 'Номер недоступен / выключен', rejected: 'Сбросил звонок', messenger: 'Связались в мессенджере' }
  const resultLabel = resultLabels[result] || 'Результат звонка'
  task.contactAttempts ||= []
  task.contactAttempts.push({ id: uid(), attemptedAt, attemptedBy: currentUser.name, result: resultLabel, previousDueDate, previousDueAt, newDueDate: followup?.dueDate || null, newDueAt: followup?.dueAt || null, comment })
  task.lastResult = resultLabel
  task.lastResultComment = comment
  task.updatedAt = attemptedAt
  task.updatedBy = currentUser.name
  patient.history ||= []
  if (comment) {
    patient.adminNote = comment
  }
  if (result === 'completed') {
    task.status = 'completed'
    task.completedAt = attemptedAt
    task.completedBy = currentUser.name
    if (outcome?.patientStatus) patient.status = outcome.patientStatus
    if (outcome?.appointmentDate) {
      patient.appointmentDate = outcome.appointmentDate
      patient.appointmentAt = `${outcome.appointmentDate}T${outcome.appointmentTime}:00`
      if (outcome.doctor && !patient.doctors?.includes(outcome.doctor)) patient.doctors = [...(patient.doctors || []), outcome.doctor]
    }
    if (outcome?.status === 'reminder') {
      const dueAt = `${outcome.reminderDate}T${outcome.reminderTime}:00`
      const duplicate = state.tasks.some(item => item.patientId === patient.id && item.type === 'reminder' && isTaskActive(item) && item.dueAt === dueAt && item.reminderTarget === outcome.reminderTarget && (item.note || '') === outcome.reminderText)
      if (!duplicate) state.tasks.push({ id:uid(), patientId:patient.id, type:'reminder', title:'🔔 Напомнить', dueDate:outcome.reminderDate, dueAt, reminderTarget:outcome.reminderTarget, note:outcome.reminderText, comment:outcome.reminderText, assignee:currentUser.name, status:'active', completedAt:null, createdAt:attemptedAt, createdBy:currentUser.name })
    }
    if (outcome?.status === 'refusal') {
      patient.refusalReason = outcome.refusalReasonCode
      patient.refusalReasonLabel = outcome.refusalReason
      patient.refusalReasonDetails = outcome.refusalReasonDetails || ''
      patient.refusalRecordedAt = attemptedAt
      completePatientTasks(patient.id, () => true, attemptedAt, 'Отказ пациента')
    }
    if (outcome?.status === 'do_not_call') {
      completePatientTasks(patient.id, item => isCallTaskType(item.type), attemptedAt, 'Не звонить')
    }
  } else {
    task.status = 'active'
    task.completedAt = null
    task.completedBy = null
    task.dueDate = followup.dueDate
    task.dueAt = followup.dueAt || null
  }
  patient.history.unshift({
    id:uid(), patientId:patient.id, taskId:task.id, timestamp:attemptedAt, createdAt:attemptedAt,
    authorId:currentUser.id, authorName:currentUser.name, authorRole:currentUser.role === 'admin' ? 'administrator' : currentUser.role,
    actionType:'task_processed', userComment:comment, result, resultLabel,
    previousDueAt:previousDueAt || previousDueDate || null,
    newDueAt:followup?.dueAt || followup?.dueDate || (outcome?.reminderDate ? `${outcome.reminderDate}T${outcome.reminderTime}:00` : null),
    delayLabel:followup?.description || (outcome?.status === 'reminder' ? 'Новое напоминание' : ''), taskStatus:task.status, patientStatus:outcome?.patientStatus || '',
    appointmentAt:patient.appointmentAt || null, outcome, refusalReason:outcome?.refusalReason ? `${outcome.refusalReason}${outcome.refusalReasonDetails ? `. ${outcome.refusalReasonDetails}` : ''}` : '',
  })
  task.history ||= []
  task.history.push({ id:uid(), at:attemptedAt, author:currentUser.name, action:task.status === 'completed' ? 'completed' : 'rescheduled', text:[resultLabel, followup?.description || '', comment].filter(Boolean).join('. ') })
  patient.updatedAt = attemptedAt
  patient.updatedBy = currentUser.name
  saveState(result === 'completed' ? `Выполнена задача: ${task.title}` : `Перенесена задача: ${task.title}`)
}

function finishCallResult(options) {
  document.querySelector('#taskDrawerOverlay')?.remove()
  document.querySelector('#upcomingTasksModal')?.remove()
  refreshCurrentView()
  if (options.drawerPatientId) openTaskDrawer(options.drawerPatientId)
  if (options.taskListModal === 'upcoming') openUpcomingTasksModal()
}

function openTaskModal(taskId = null, presetPatientId = null) {
  const original = state.tasks.find(task => task.id === taskId)
  const task = original ? cloneData(original) : {
    id: uid(), patientId: presetPatientId || '', type: 'call', title: 'Позвонить пациенту',
    dueDate: todayISO(), assignee: currentUser.role === 'admin' ? currentUser.name : 'Елизавета',
    note: '', status: 'active', completedAt: null, createdAt: new Date().toISOString(), createdBy: currentUser.name,
  }

  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal" id="taskModal"><div class="dialog task-dialog">
      <div class="dialog-head"><div><h2>${original ? 'Редактирование задачи' : 'Новая задача'}</h2><p>Отдельная дата, не меняющая другие задачи пациента</p></div><button class="icon-btn" data-close>×</button></div>
      <div class="task-form">
        <label class="field"><span>Пациент</span><select id="tPatient"><option value="">Выберите пациента</option>${[...state.patients].sort((a,b)=>a.name.localeCompare(b.name)).map(p => `<option value="${p.id}" ${p.id === task.patientId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
        <label class="field"><span>Тип</span><select id="tType">${TASK_TYPES.map(t => `<option value="${t.value}" ${t.value === task.type ? 'selected' : ''}>${t.label}</option>`).join('')}</select></label>
        <label class="field ${task.type === 'reminder' ? '' : 'hidden'}" id="tReminderRecipient"><span>Кому напомнить</span><select id="tReminderTarget"><option value="patient" ${(task.reminderTarget || 'patient') === 'patient' ? 'selected' : ''}>Пациенту</option><option value="doctor" ${task.reminderTarget === 'doctor' ? 'selected' : ''}>Доктору</option></select></label>
        <label class="field span-2"><span>Что нужно сделать</span><input id="tTitle" value="${esc(task.title)}"></label>
        ${manualDateMarkup('t', 'Дата', task.dueDate)}
        ${manualTimeMarkup('t', 'Время', task.dueAt?.slice(11, 16) || '10:00')}
        <label class="field"><span>Ответственный</span><select id="tAssignee">${USERS.filter(u=>u.role==='admin').map(u => `<option ${u.name === task.assignee ? 'selected' : ''}>${u.name}</option>`).join('')}</select></label>
        <label class="field span-2"><span>Комментарий</span><textarea id="tNote">${esc(task.note || '')}</textarea></label>
        <label class="field"><span>Статус</span><select id="tStatus"><option value="active" ${isTaskActive(task)?'selected':''}>Активна</option><option value="completed" ${isTaskCompleted(task)?'selected':''}>Выполнена</option><option value="cancelled" ${task.status==='cancelled'?'selected':''}>Отменена</option></select></label>
      </div>
      <div class="quick-dates"><button data-plus="1">Завтра</button><button data-plus="3">Через 3 дня</button><button data-plus="7">Через неделю</button><button data-plus="180">Через полгода</button></div>
      <div class="dialog-actions"><span></span><button class="btn" data-close>Отмена</button><button class="btn primary" id="saveTask">Сохранить</button></div>
    </div></div>
  `)

  const modal = document.querySelector('#taskModal')
  modal.querySelectorAll('select, input, textarea, button').forEach(control => {
    ;['pointerdown','mousedown','click'].forEach(type => control.addEventListener(type, event => event.stopPropagation()))
  })
  modal.querySelectorAll('[data-close]').forEach(b => b.onclick = () => modal.remove())
  setupManualDate(modal, 't')
  setupManualTime(modal, 't')
  const taskType = modal.querySelector('#tType')
  const reminderRecipient = modal.querySelector('#tReminderRecipient')
  const updateReminderRecipient = () => {
    reminderRecipient.classList.toggle('hidden', taskType.value !== 'reminder')
    if (!original) {
      const titleInput = modal.querySelector('#tTitle')
      titleInput.value = TASK_TYPES.find(item => item.value === taskType.value)?.label || titleInput.value
    }
  }
  taskType.addEventListener('change', updateReminderRecipient)
  updateReminderRecipient()
  modal.querySelectorAll('[data-plus]').forEach(b => b.onclick = () => {
    const value = datePlus(Number(b.dataset.plus))
    modal.querySelector('#tDate').value = value
    modal.querySelector('#tDateText').value = formatDate(value)
    modal.querySelector('#tDateError').textContent = ''
  })
  modal.querySelector('#saveTask').onclick = () => {
    const patientId = modal.querySelector('#tPatient').value
    const title = modal.querySelector('#tTitle').value.trim()
    if (!patientId) return alert('Выберите пациента')
    if (!title) return alert('Укажите, что нужно сделать')
    const dueDate = readManualDate(modal, 't')
    const dueTime = readManualTime(modal, 't')
    if (!dueDate || !dueTime) return
    const status = modal.querySelector('#tStatus').value
    const wasCompleted = isTaskCompleted(task)
    Object.assign(task, {
      patientId,
      type: modal.querySelector('#tType').value,
      reminderTarget: modal.querySelector('#tType').value === 'reminder' ? modal.querySelector('#tReminderTarget').value : null,
      title,
      dueDate,
      dueAt: `${dueDate}T${dueTime}:00`,
      assignee: modal.querySelector('#tAssignee').value,
      note: modal.querySelector('#tNote').value.trim(),
      status,
      completedAt: status === 'completed' ? (task.completedAt || new Date().toISOString()) : null,
      completedBy: status === 'completed' ? (task.completedBy || currentUser.name) : null,
      updatedAt: new Date().toISOString(), updatedBy: currentUser.name,
    })
    task.history ||= []
    task.history.push({ id:uid(), at:task.updatedAt, author:currentUser.name, action:!wasCompleted && status === 'completed' ? 'completed' : original ? 'updated' : 'created', text:taskHistoryText(task.type, title, task.dueDate, task.note) })
    if (original) Object.assign(original, task)
    else state.tasks.push(task)
    const patient = state.patients.find(p => p.id === patientId)
    if (patient) {
      patient.history ||= []
      const completedNow = !wasCompleted && status === 'completed'
      const historyText = completedNow
        ? `${cleanTaskLabel(title)}.`
        : taskHistoryText(task.type, title, task.dueDate, task.note)
      patient.history.unshift(createHistoryEntry(completedNow ? 'task_completed' : 'task', historyText, { taskType: task.type }))
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

function openCorrectionRequest(shift) {
  const suggested = prompt(`Предыдущая смена от ${formatDate(shift.workDate)} не завершена.\nНачало: ${formatClock(shift.startAt)}.\nУкажите фактическое окончание в формате ГГГГ-ММ-ДДTЧЧ:ММ`, `${shift.workDate}T18:00`)
  if (!suggested) return
  const requestedEndAt = new Date(suggested).toISOString()
  if (new Date(requestedEndAt) <= new Date(shift.startAt)) return alert('Окончание должно быть позже начала смены')
  const reason = prompt('Укажите причину исправления')?.trim()
  if (!reason) return alert('Причина обязательна')
  requestCorrection(currentUser, shift, requestedEndAt, reason)
  alert('Запрос отправлен руководителю. Новую смену можно начать после рассмотрения.')
  renderShell()
}

function renderWorktime() {
  const content = document.querySelector('#content')
  if (!worktimeLoaded && worktimeCloudEnabled) {
    worktimeLoaded = true
    refreshWorktime().then(() => { if (activeTab === 'worktime') renderWorktime() })
  }
  const manager = currentUser.role === 'manager'
  const month = document.querySelector('#workMonth')?.value || todayISO().slice(0, 7)
  const selectedUser = document.querySelector('#workUser')?.value || ''
  const visible = worktime.shifts.filter(shift => manager || shift.userId === currentUser.id)
  const todayShifts = visible.filter(shift => shift.workDate === todayISO() && (!selectedUser || shift.userId === selectedUser))
  const monthShifts = visible.filter(shift => shift.workDate.startsWith(month) && (!selectedUser || shift.userId === selectedUser))
  const approved = monthShifts.filter(shift => shift.status === 'completed')
  const approvedMinutes = approved.reduce((sum, shift) => sum + durationMinutes(shift), 0)
  const stats = worktimeStats(monthShifts)
  const rate = selectedUser ? Number(worktime.rates[selectedUser] || 0) : 0
  content.innerHTML = `<section class="page-head"><div><h1>${manager ? 'Учёт рабочего времени' : 'Моё рабочее время'}</h1><p>${worktimeCloudEnabled ? 'Данные синхронизируются с Supabase' : '⚠ Supabase не настроен: показан локальный офлайн-кэш, не используйте его как итоговую зарплатную базу'}</p></div>${manager ? '<button class="btn" id="exportWorktime">Экспорт CSV</button>' : ''}</section>
    <section class="panel"><h2>Сегодня</h2>${worktimeRows(todayShifts, manager)}</section>
    <section class="panel worktime-month"><div class="worktime-controls"><label>Месяц <input type="month" id="workMonth" value="${month}"></label>${manager ? `<label>Сотрудник <select id="workUser"><option value="">Все сотрудники</option>${USERS.filter(user=>user.role==='admin').map(user=>`<option value="${user.id}" ${selectedUser===user.id?'selected':''}>${user.name}</option>`).join('')}</select></label>` : ''}</div>
      ${manager && !selectedUser ? worktimeEmployeeSummary(monthShifts) : worktimeRows(monthShifts, manager)}
      <div class="worktime-summary"><b>Смен: ${stats.count}</b><b>Всего: ${formatDuration(stats.total)}</b><b>Средняя смена: ${formatDuration(stats.average)}</b>${manager && selectedUser ? `<b>Самая длинная: ${formatDuration(stats.longest)}</b><b>Самая короткая: ${formatDuration(stats.shortest)}</b><label>Ставка ₽/час <input type="number" id="hourlyRate" min="0" value="${rate}"></label><b>Начислено: ${Math.round(approvedMinutes / 60 * rate).toLocaleString('ru-RU')} ₽</b>` : ''}</div>
    </section>${manager ? `${unfinishedShiftsMarkup(visible)}${correctionRequestsMarkup()}` : ''}`
  content.querySelector('#workMonth')?.addEventListener('change', renderWorktime)
  content.querySelector('#workUser')?.addEventListener('change', renderWorktime)
  content.querySelector('#hourlyRate')?.addEventListener('change', event => { setHourlyRate(selectedUser, event.target.value); renderWorktime() })
  content.querySelectorAll('[data-review]').forEach(button => button.onclick = () => { reviewCorrection(button.dataset.review, currentUser, button.dataset.decision === 'approve'); renderWorktime() })
  content.querySelector('#exportWorktime')?.addEventListener('click', () => exportWorktimeCsv(monthShifts))
}

function settingSelect(section, key, label, options) {
  const value = userSettings[section][key]
  return `<label class="setting-field"><span>${label}</span><select data-setting="${section}.${key}">${options.map(([option,labelText]) => `<option value="${option}" ${String(value) === String(option) ? 'selected' : ''}>${labelText}</option>`).join('')}</select></label>`
}

function settingCheck(section, key, label) {
  return `<label class="setting-check"><input type="checkbox" data-setting="${section}.${key}" ${userSettings[section][key] ? 'checked' : ''}><span>${label}</span></label>`
}

function renderSettings() {
  const content = document.querySelector('#content')
  const tabs = [['appearance','Внешний вид'],['table','Таблица пациентов'],['tasks','Задачи и работа'],['notifications','Уведомления'],['calendar','Календарь'],['shortcuts','Горячие клавиши'], ...(currentUser.role === 'manager' ? [['manager','Настройки руководителя']] : [])]
  if (!tabs.some(([key]) => key === settingsTab)) settingsTab = 'appearance'
  content.innerHTML = `<section class="page-head"><div><h1>⚙ Настройки</h1><p>Персональные настройки пользователя ${esc(currentUser.name)}</p></div></section><div class="settings-layout"><nav class="settings-tabs">${tabs.map(([key,label]) => `<button class="${settingsTab === key ? 'active' : ''}" data-settings-tab="${key}">${label}</button>`).join('')}</nav><section class="settings-content">${settingsPanelMarkup(settingsTab)}</section></div>`
  content.querySelectorAll('[data-settings-tab]').forEach(button => button.onclick = () => { settingsTab = button.dataset.settingsTab; renderSettings() })
  content.querySelectorAll('[data-theme]').forEach(button => button.onclick = () => {
    userSettings.appearance.theme = button.dataset.theme
    applyUserSettings(userSettings)
    renderSettings()
  })
  content.querySelectorAll('[data-setting]').forEach(control => control.onchange = () => {
    const [section,key] = control.dataset.setting.split('.')
    const value = control.type === 'checkbox' ? control.checked : (/^\d+$/.test(control.value) ? Number(control.value) : control.value)
    userSettings[section][key] = value
    applyUserSettings(userSettings)
  })
  content.querySelectorAll('[data-column-visibility]').forEach(control => control.onchange = () => {
    const key = control.dataset.columnVisibility
    userSettings.table.hiddenColumns = control.checked ? userSettings.table.hiddenColumns.filter(item => item !== key) : [...new Set([...userSettings.table.hiddenColumns, key])]
  })
  content.querySelector('#applySettings')?.addEventListener('click', () => { saveUserSettings(currentUser.id, userSettings); applyUserSettings(userSettings); showToast('Настройки сохранены.') })
  content.querySelector('#cancelSettings')?.addEventListener('click', () => { userSettings = loadUserSettings(currentUser.id); applyUserSettings(userSettings); renderSettings() })
  content.querySelector('#resetSettings')?.addEventListener('click', () => { userSettings = defaultUserSettings(); applyUserSettings(userSettings); renderSettings() })
  content.querySelector('#saveSystemSettings')?.addEventListener('click', saveManagerSettings)
  content.querySelector('#resetAllUserSettings')?.addEventListener('click', () => {
    if (!confirm('Сбросить персональные настройки всех пользователей?')) return
    USERS.forEach(user => localStorage.removeItem(`crm:userSettings:${user.id}`))
    userSettings = defaultUserSettings(); applyUserSettings(userSettings); showToast('Пользовательские настройки сброшены.')
  })
}

function settingsPanelMarkup(tab) {
  const actions = `<div class="settings-actions"><button class="btn" id="cancelSettings">Отмена</button><button class="btn" id="resetSettings">Вернуть настройки по умолчанию</button><button class="btn primary" id="applySettings">Применить</button></div>`
  if (tab === 'appearance') return `<h2>Внешний вид</h2><div class="theme-grid">${Object.entries(THEMES).map(([key,theme]) => `<button class="theme-card ${userSettings.appearance.theme === key ? 'active' : ''}" data-theme="${key}" style="--preview-bg:${theme.bg};--preview-surface:${theme.surface};--preview-primary:${theme.primary};--preview-text:${theme.text}"><b>${theme.name}</b><span class="theme-preview"><i></i><em>Кнопка</em><small>Строка таблицы</small></span>${userSettings.appearance.theme === key ? '<mark>Текущая</mark>' : ''}</button>`).join('')}</div><div class="settings-grid">${settingSelect('appearance','scale','Масштаб',[[85,'85%'],[90,'90%'],[100,'100%'],[110,'110%'],[125,'125%']])}${settingSelect('appearance','fontSize','Размер шрифта',[['small','Маленький'],['standard','Стандартный'],['large','Большой'],['xlarge','Очень большой']])}${settingSelect('appearance','density','Плотность',[['compact','Компактная'],['standard','Стандартная'],['spacious','Просторная']])}${settingSelect('appearance','radius','Скругление',[['minimal','Минимальное'],['medium','Среднее'],['large','Большое']])}${settingSelect('appearance','shadows','Тени окон',[['none','Выключены'],['light','Лёгкие'],['standard','Стандартные']])}${settingSelect('appearance','animations','Анимации',[['full','Полные'],['minimal','Минимальные'],['none','Выключены']])}</div>${settingCheck('appearance','icons','Показывать иконки в кнопках')}${settingCheck('appearance','tooltips','Подсказки при наведении')}${actions}`
  if (tab === 'table') return `<h2>Таблица пациентов</h2><div class="settings-grid">${settingSelect('table','rowHeight','Высота строки',[[48,'48 px'],[58,'58 px'],[72,'72 px'],[90,'90 px']])}</div><div class="settings-check-grid">${settingCheck('table','stickyHeader','Закрепить заголовок')}${settingCheck('table','hover','Подсвечивать строку')}${settingCheck('table','verticalBorders','Вертикальные границы')}${settingCheck('table','horizontalBorders','Горизонтальные границы')}${settingCheck('table','striped','Чередовать фон строк')}${settingCheck('table','rowNumbers','Показывать номера строк')}${settingCheck('table','rememberWidths','Запоминать ширину столбцов')}${settingCheck('table','rememberOrder','Запоминать порядок столбцов')}${settingCheck('table','rememberSort','Запоминать сортировку')}${settingCheck('table','rememberFilters','Запоминать активные фильтры')}</div><h3>Видимые столбцы</h3><div class="column-settings">${PATIENT_COLUMNS.map(column => `<label><input type="checkbox" data-column-visibility="${column.key}" ${!userSettings.table.hiddenColumns.includes(column.key) ? 'checked' : ''} ${['name','addTask'].includes(column.key) ? 'disabled' : ''}><span>${column.key}</span></label>`).join('')}</div>${actions}`
  if (tab === 'tasks') return `<h2>Задачи и работа</h2><div class="settings-check-grid">${settingCheck('tasks','confirmCompletion','Подтверждать завершение задачи')}${settingCheck('tasks','confirmDeletion','Подтверждать удаление задачи')}${settingCheck('tasks','autoOpenNext','Автоматически открывать следующую задачу')}${settingCheck('tasks','showCompleted','Показывать выполненные задачи')}${settingCheck('tasks','overdueFirst','Просроченные задачи первыми')}${settingCheck('tasks','sortByDateTime','Сортировать по дате и времени')}${settingCheck('tasks','showComment','Показывать комментарий в списке')}${settingCheck('tasks','showAuthor','Показывать автора задачи')}${settingCheck('tasks','showTransferTime','Показывать время переноса')}</div>${actions}`
  if (tab === 'notifications') return `<h2>Уведомления</h2><div class="settings-check-grid">${settingCheck('notifications','toast','Всплывающие уведомления')}${settingCheck('notifications','sound','Звуковые уведомления')}${settingCheck('notifications','newTask','Новая задача')}${settingCheck('notifications','overdue','Просроченная задача')}${settingCheck('notifications','before15','Задача через 15 минут')}${settingCheck('notifications','before30','Задача через 30 минут')}${settingCheck('notifications','unfinishedShift','Незавершённая смена')}${settingCheck('notifications','counters','Счётчики в верхних карточках')}</div>${settingSelect('notifications','volume','Громкость',[['mute','Без звука'],['quiet','Тихо'],['standard','Стандартно']])}${actions}`
  if (tab === 'calendar') return `<h2>Календарь и даты</h2><div class="settings-grid">${settingSelect('calendar','firstDay','Первый день недели',[['monday','Понедельник'],['sunday','Воскресенье']])}${settingSelect('calendar','dateFormat','Формат даты',[['long','ДД.ММ.ГГГГ'],['short','ДД.ММ.ГГ']])}${settingSelect('calendar','timeFormat','Формат времени',[['24','24 часа'],['12','12 часов']])}${settingSelect('calendar','timeStep','Шаг времени',[[15,'15 минут'],[30,'30 минут'],[60,'60 минут']])}</div>${settingCheck('calendar','weekends','Показывать выходные')}${settingCheck('calendar','highlightToday','Подсвечивать сегодняшний день')}${actions}`
  if (tab === 'shortcuts') return `<h2>Горячие клавиши</h2><div class="shortcut-list">${[['Ctrl + N','Новый пациент'],['Ctrl + F','Поиск'],['Alt + T','Задачи на сегодня'],['Alt + F','Будущие задачи'],['Esc','Закрыть модальное окно'],['Ctrl + Enter','Сохранить форму']].map(([keys,label]) => `<div><kbd>${keys}</kbd><span>${label}</span></div>`).join('')}</div>`
  if (tab === 'manager' && currentUser.role === 'manager') return managerSettingsMarkup()
  return ''
}

function managerSettingsMarkup() {
  const system = loadSystemSettings()
  const lists = [['holidays','Праздники'],['taskTypes','Дополнительные типы задач'],['patientStatuses','Дополнительные статусы пациентов'],['commentTemplates','Шаблоны комментариев'],['taskTemplates','Шаблоны задач'],['transferReasons','Причины переноса звонка']]
  return `<h2>Настройки руководителя</h2><p class="settings-note">Системные настройки применяются ко всем пользователям. Обычным администраторам этот раздел недоступен.</p>
    <div class="settings-grid"><label class="setting-field"><span>Название клиники</span><input id="systemClinicName" value="${esc(system.clinicName)}"></label><label class="setting-field"><span>Логотип</span><input id="systemLogo" value="${esc(system.logo)}"></label><label class="setting-field"><span>Основной цвет</span><input id="systemBrandColor" type="color" value="${system.brandColor}"></label><label class="setting-field"><span>Начало работы</span><input id="systemWorkStart" type="time" value="${system.workStart}"></label><label class="setting-field"><span>Окончание работы</span><input id="systemWorkEnd" type="time" value="${system.workEnd}"></label><label class="setting-field"><span>Тема новых пользователей</span><select id="systemDefaultTheme">${Object.entries(THEMES).map(([key,theme]) => `<option value="${key}" ${system.defaultTheme === key ? 'selected' : ''}>${theme.name}</option>`).join('')}</select></label></div>
    <div class="manager-settings-grid">${lists.map(([key,label]) => `<label class="setting-field"><span>${label} — по одному на строку</span><textarea data-system-list="${key}">${esc((system[key] || []).join('\n'))}</textarea></label>`).join('')}<label class="setting-field"><span>Рабочие дни (1–7)</span><input id="systemWorkDays" value="${esc((system.workDays || []).join(', '))}"></label><section><h3>Права ролей</h3><p>Администраторы: пациенты, задачи и собственное рабочее время.<br>Руководители: полный доступ.</p></section><section><h3>Ставки и учёт времени</h3><p>Ставки сотрудников редактируются в разделе «Учёт рабочего времени».</p></section><section><h3>Журнал действий</h3><p>Записей: ${state.audit.length}. Полный журнал доступен в отчётности руководителя.</p></section></div>
    <div class="settings-actions"><button class="btn danger-text" id="resetAllUserSettings">Сбросить пользовательские настройки</button><button class="btn primary" id="saveSystemSettings">Сохранить системные настройки</button></div>`
}

function saveManagerSettings() {
  if (currentUser.role !== 'manager') return
  const system = loadSystemSettings()
  Object.assign(system, { clinicName:document.querySelector('#systemClinicName').value.trim(), logo:document.querySelector('#systemLogo').value.trim(), brandColor:document.querySelector('#systemBrandColor').value, workStart:document.querySelector('#systemWorkStart').value, workEnd:document.querySelector('#systemWorkEnd').value, defaultTheme:document.querySelector('#systemDefaultTheme').value })
  system.workDays = document.querySelector('#systemWorkDays').value.split(',').map(value => Number(value.trim())).filter(value => value >= 1 && value <= 7)
  document.querySelectorAll('[data-system-list]').forEach(control => { system[control.dataset.systemList] = control.value.split('\n').map(value => value.trim()).filter(Boolean) })
  saveSystemSettings(system); showToast('Системные настройки сохранены.')
}

function worktimeStats(shifts) {
  const minutes = shifts.map(shift => durationMinutes(shift))
  const total = minutes.reduce((sum, value) => sum + value, 0)
  return { count: shifts.length, total, average: minutes.length ? Math.round(total / minutes.length) : 0, longest: minutes.length ? Math.max(...minutes) : 0, shortest: minutes.length ? Math.min(...minutes) : 0 }
}

function worktimeEmployeeSummary(shifts) {
  const rows = USERS.filter(user => user.role === 'admin').map(user => ({ user, stats: worktimeStats(shifts.filter(shift => shift.userId === user.id)) }))
  return `<div class="worktime-table"><div class="worktime-row employee-summary head"><b>Сотрудник</b><b>Количество смен</b><b>Всего часов</b><b>Средняя смена</b></div>${rows.map(({user,stats})=>`<div class="worktime-row employee-summary"><span>${esc(user.name)}</span><span>${stats.count}</span><span>${formatDuration(stats.total)}</span><span>${formatDuration(stats.average)}</span></div>`).join('')}</div>`
}

function unfinishedShiftsMarkup(shifts) {
  const unfinished = shifts.filter(shift => shift.status === 'active' || shift.status === 'needs_review')
  return `<section class="panel unfinished-panel"><h2>Незавершённые смены</h2>${unfinished.length ? worktimeRows(unfinished, true) : '<div class="empty-box success">Все смены завершены корректно</div>'}</section>`
}

function worktimeRows(shifts, manager) {
  if (!shifts.length) return '<div class="empty-box">Смен нет</div>'
  const status = shift => `${shift.status==='active'?'В смене':shift.status==='needs_review'?'На проверке':'Завершена'}${shift.startedOffline||shift.endedOffline?' · Офлайн':''}${shift.syncStatus==='pending'?' · Ожидает синхронизации':''}`
  if (!manager) return `<div class="worktime-table"><div class="worktime-row own-shifts head"><b>Дата</b><b>Начало</b><b>Окончание</b><b>Отработано</b><b>Статус</b></div>${[...shifts].sort((a,b)=>b.startAt.localeCompare(a.startAt)).map(shift=>`<div class="worktime-row own-shifts"><span>${formatDate(shift.workDate)}</span><span>${formatClock(shift.startAt)}</span><span>${formatClock(shift.endAt)}</span><span>${formatDuration(durationMinutes(shift))}</span><span>${status(shift)}</span></div>`).join('')}</div>`
  return `<div class="worktime-table"><div class="worktime-row head"><b>Сотрудник</b><b>Дата</b><b>Начало</b><b>Окончание</b><b>Время</b><b>Статус</b></div>${[...shifts].sort((a,b)=>b.startAt.localeCompare(a.startAt)).map(shift=>`<div class="worktime-row"><span>${esc(shift.userName)}</span><span>${formatDate(shift.workDate)}</span><span>${formatClock(shift.startAt)}</span><span>${formatClock(shift.endAt)}</span><span>${formatDuration(durationMinutes(shift))}</span><span>${status(shift)}</span></div>`).join('')}</div>`
}

function correctionRequestsMarkup() {
  const pending = worktime.requests.filter(request => request.status === 'pending')
  return `<section class="panel correction-panel"><h2>Запросы на исправление</h2>${pending.length ? pending.map(request=>`<article><div><b>${esc(request.requestedByName || request.requestedBy)}</b><span>${formatDateTime(request.requestedAt)}</span><p>${esc(request.reason)}</p><small>Предлагаемое окончание: ${formatDateTime(request.requestedEndAt)}</small></div><button class="btn primary" data-review="${request.id}" data-decision="approve">Одобрить</button><button class="btn" data-review="${request.id}" data-decision="reject">Отклонить</button></article>`).join('') : '<div class="empty-box">Новых запросов нет</div>'}</section>`
}

function exportWorktimeCsv(shifts) {
  const rows = [['Сотрудник','Дата','Начало','Окончание','Минуты','Статус'], ...shifts.map(shift=>[shift.userName,shift.workDate,shift.startAt,shift.endAt||'',durationMinutes(shift),shift.status])]
  const blob = new Blob(['\ufeff'+rows.map(row=>row.map(value=>`"${String(value).replaceAll('"','""')}"`).join(';')).join('\n')], {type:'text/csv;charset=utf-8'})
  const link=document.createElement('a'); link.href=URL.createObjectURL(blob); link.download=`worktime-${todayISO().slice(0,7)}.csv`; link.click(); URL.revokeObjectURL(link.href)
}

function renderAnalytics() {
  const content = document.querySelector('#content')
  if (currentUser.role !== 'manager') {
    activeTab = 'patients'; return renderPatients()
  }
  const today = todayISO()
  const monthStart = `${today.slice(0, 7)}-01`
  const monthTasks = state.tasks.filter(t => t.createdAt?.slice(0,10) >= monthStart)
  const completed = state.tasks.filter(t => isTaskCompleted(t) && t.completedAt?.slice(0,10) >= monthStart)
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

document.addEventListener('keydown', event => {
  if (!currentUser) return
  const editing = event.target instanceof Element && event.target.matches('input, textarea, select, [contenteditable="true"]')
  if (event.key === 'Escape') {
    const modal = [...document.querySelectorAll('.modal,.drawer-overlay')].pop()
    if (modal) { event.preventDefault(); modal.remove() }
    return
  }
  if (editing && !(event.ctrlKey && event.key === 'Enter')) return
  if (event.ctrlKey && event.key.toLowerCase() === 'n') { event.preventDefault(); openPatientModal() }
  if (event.ctrlKey && event.key.toLowerCase() === 'f') { event.preventDefault(); activeTab = 'patients'; renderShell(); requestAnimationFrame(() => document.querySelector('[data-patient-filter="name"]')?.focus()) }
  if (event.altKey && event.key.toLowerCase() === 't') { event.preventDefault(); activeTab = 'tasks'; activeTaskFilter = 'today'; renderShell() }
  if (event.altKey && event.key.toLowerCase() === 'f') { event.preventDefault(); openUpcomingTasksModal() }
  if (event.ctrlKey && event.key === 'Enter') document.querySelector('.modal .btn.primary:not(:disabled)')?.click()
})

document.addEventListener('click', event => {
  const badge = event.target.closest?.('[data-special-note-badge]')
  document.querySelectorAll('[data-special-note-badge].pinned').forEach(item => {
    if (item !== badge) item.classList.remove('pinned')
  })
  if (!badge) return
  event.preventDefault()
  event.stopPropagation()
  badge.classList.toggle('pinned')
}, true)

render()
