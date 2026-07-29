export const TASK_STATUS_ACTIVE = 'active'
export const TASK_STATUS_COMPLETED = 'completed'
export const TASK_STATUS_CANCELLED = 'cancelled'
export const DO_NOT_CONTACT_STATUS = '🚫 Не звонить'
export const DECISION_OUTCOME = 'decision_not_made'
export const DECISION_REASON_CODES = new Set([
  'cost', 'family', 'timing', 'second_opinion', 'fear', 'plan', 'opportunity', 'questions', 'other',
])

export const KNOWN_PATIENT_STATUSES = new Set([
  '🆕 Новый', '📅 Записан на приём', '🦷 На лечении', '✅ Лечение завершено',
  '🔄 Профосмотр', '❌ Отказ', DO_NOT_CONTACT_STATUS,
])

export const KNOWN_TASK_TYPES = new Set([
  'contact', 'internal',
  'call', 'write', 'appointment', 'invite_checkup', 'decision', 'reminder', 'documents',
  'postop_control', 'implant_check', 'request_image', 'waitlist', 'control', 'other',
])

const clone = value => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value))
const makeId = () => globalThis.crypto?.randomUUID?.() || `wf-${Date.now()}-${Math.random().toString(16).slice(2)}`
const taskActive = task => task?.status === TASK_STATUS_ACTIVE || task?.status === 'open'
const isoDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
const isoTime = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''))
const cleanTitle = value => String(value || '').replace(/^\s*[^\p{L}\p{N}]+\s*/u, '').trim()
const LEGACY_PATIENT_STATUS_MAP = new Map([
  ['', '🆕 Новый'],
  ['📞 Позвонить', '🆕 Новый'],
  ['🔔 Напомнить', '🆕 Новый'],
  ['Позвонить', '🆕 Новый'],
  ['Напомнить', '🆕 Новый'],
  ['✍️ Записали на приём', '📅 Записан на приём'],
  ['🩺 Профосмотр', '🔄 Профосмотр'],
  ['Пригласить на профосмотр', '🔄 Профосмотр'],
  ['🦷 Лечится', '🦷 На лечении'],
  ['Лечится', '🦷 На лечении'],
  ['Начато лечение', '🦷 На лечении'],
  ['⛔ Не звонить', DO_NOT_CONTACT_STATUS],
])

export function validateFutureDateTime(date, time, options = {}) {
  if (!isoDate(date)) return { valid:false, error:'Укажите корректную дату' }
  if (options.requireTime !== false && !isoTime(time)) return { valid:false, error:'Укажите корректное время' }
  const effectiveTime = isoTime(time) ? time : options.defaultTime
  if (!effectiveTime || !isoTime(effectiveTime)) return { valid:false, error:'Для события не определено время' }
  const timestamp = new Date(`${date}T${effectiveTime}:00`).getTime()
  if (!Number.isFinite(timestamp)) return { valid:false, error:'Некорректные дата и время' }
  const now = options.now ? new Date(options.now).getTime() : Date.now()
  if (!options.allowPast && timestamp <= now) return { valid:false, error:'Дата и время должны быть в будущем' }
  return { valid:true, date, time:effectiveTime, dueAt:`${date}T${effectiveTime}:00` }
}

export function workflowMeta(spec) {
  const sourceEntityType = spec.sourceEntityType || spec.workflowType || 'task'
  const sourceEntityId = spec.sourceEntityId || spec.waitlistEntryId || spec.appointmentId || spec.parentTaskId || spec.patientId
  const workflowType = spec.workflowType || sourceEntityType
  const workflowId = spec.workflowId || `${workflowType}:${sourceEntityId}`
  return { workflowType, workflowId, sourceEntityType, sourceEntityId }
}

export function createWorkflowTask(draft, patient, spec, actor = {}) {
  if (!patient || !spec?.type || !spec?.dueDate) throw new Error('Для следующего действия не определены пациент, тип или дата')
  const validation = validateFutureDateTime(spec.dueDate, spec.dueTime || spec.dueAt?.slice(11,16), { now:actor.now, allowPast:Boolean(spec.allowPast), defaultTime:'10:00' })
  if (!validation.valid) throw new Error(validation.error)
  const meta = workflowMeta({ ...spec, patientId:patient.id })
  const idempotencyKey = spec.idempotencyKey || `${meta.workflowId}:${spec.type}:${validation.dueAt}:${cleanTitle(spec.title)}`
  const existing = draft.tasks.find(task => taskActive(task) && task.idempotencyKey === idempotencyKey)
  if (existing) return existing
  const now = actor.now || new Date().toISOString()
  const task = {
    id:makeId(), patientId:patient.id, type:spec.type, title:spec.title, dueDate:spec.dueDate, dueAt:validation.dueAt,
    assignee:spec.assignee || actor.name || '', note:spec.comment || '', comment:spec.comment || '',
    status:TASK_STATUS_ACTIVE, completedAt:null, createdAt:now, createdBy:actor.name || 'Система',
    workflowId:meta.workflowId, workflowType:meta.workflowType, parentTaskId:spec.parentTaskId || null,
    sourceEntityType:meta.sourceEntityType, sourceEntityId:meta.sourceEntityId, idempotencyKey,
    ...(spec.waitlistEntryId ? { waitlistEntryId:spec.waitlistEntryId } : {}),
    ...(spec.appointmentId ? { appointmentId:spec.appointmentId } : {}),
  }
  draft.tasks.push(task)
  return task
}

export function ensureWaitlistTask(draft, waitlistEntryId, actor = {}, schedule = {}) {
  const entry = draft.waitlist.find(item => item.id === waitlistEntryId && item.status !== 'removed')
  if (!entry) throw new Error('Активная запись листа ожидания не найдена')
  const patient = draft.patients.find(item => item.id === entry.patientId)
  if (!patient) throw new Error('Пациент записи ожидания не найден')
  const workflowId = `waitlist:${entry.id}`
  const linked = draft.tasks.filter(task => taskActive(task) && task.type === 'waitlist' && task.waitlistEntryId === entry.id)
  if (linked.length) {
    linked.slice(1).forEach(task => { task.status = TASK_STATUS_CANCELLED; task.updatedAt = actor.now || new Date().toISOString() })
    return linked[0]
  }
  const baseTime = actor.now ? new Date(actor.now).getTime() : Date.now()
  const date = schedule.dueDate || new Date(baseTime + 86400000).toISOString().slice(0,10)
  return createWorkflowTask(draft, patient, {
    type:'waitlist', title:'⏳ Лист ожидания', dueDate:date, dueTime:schedule.dueTime || '10:00',
    comment:entry.comment || '', waitlistEntryId:entry.id, sourceEntityType:'waitlist', sourceEntityId:entry.id,
    workflowType:'waitlist', workflowId, idempotencyKey:`waitlist-system:${entry.id}`,
  }, actor)
}

export function finalizePatientAsDoNotContact(draft, patientId, reason, actor = {}) {
  if (!String(reason || '').trim()) throw new Error('Укажите причину «Не звонить»')
  const patient = draft.patients.find(item => item.id === patientId)
  if (!patient) throw new Error('Пациент не найден')
  const now = actor.now || new Date().toISOString()
  patient.status = DO_NOT_CONTACT_STATUS
  patient.doNotContactReason = String(reason).trim()
  patient.adminNote = String(reason).trim()
  patient.updatedAt = now
  patient.updatedBy = actor.name || 'Система'
  draft.tasks.filter(task => task.patientId === patientId && taskActive(task)).forEach(task => {
    task.status = TASK_STATUS_CANCELLED; task.completedAt = now; task.completedBy = actor.name || 'Система'; task.lastResult = 'Не звонить'
  })
  draft.waitlist.filter(entry => entry.patientId === patientId && entry.status !== 'removed').forEach(entry => {
    entry.status = 'removed'; entry.removedAt = now; entry.removedBy = actor.name || 'Система'; entry.removalReason = 'Не звонить'
  })
  patient.history ||= []
  patient.history.unshift({ id:makeId(), createdAt:now, authorId:actor.id || null, authorName:actor.name || 'Система', actionType:'do_not_contact', text:`Не звонить. Причина: ${String(reason).trim()}.` })
  return patient
}

export function migrateBusinessState(input, actor = {}) {
  const draft = clone(input)
  draft.tasks ||= []; draft.waitlist ||= []; draft.audit ||= []
  const now = actor.now || new Date().toISOString()
  let changed = false
  // TODO: согласовать отдельные правила миграции удалённых legacy-этапов из старых резервных копий.
  draft.tasks.forEach(task => { if (task.status === 'open') { task.status = TASK_STATUS_ACTIVE; changed = true } })
  for (const patient of draft.patients || []) {
    if (LEGACY_PATIENT_STATUS_MAP.has(patient.status ?? '')) {
      patient.status = LEGACY_PATIENT_STATUS_MAP.get(patient.status ?? '')
      changed = true
    }
    if (patient.status === '📅 Записан на приём' && !patient.appointmentDate) {
      patient.status = '🆕 Новый'
      patient.history ||= []
      patient.history.unshift({ id:makeId(), createdAt:now, authorName:actor.name || 'Система', actionType:'migration', text:'Старый этап «Записан на приём» сброшен: дата приёма отсутствовала.' })
      changed = true
    }
    if (patient.status === DO_NOT_CONTACT_STATUS) {
      draft.tasks.filter(task => task.patientId === patient.id && taskActive(task)).forEach(task => { task.status = TASK_STATUS_CANCELLED; task.completedAt = now; task.completedBy = actor.name || 'Система'; task.lastResult = 'Миграция: не звонить'; changed = true })
      draft.waitlist.filter(entry => entry.patientId === patient.id && entry.status !== 'removed').forEach(entry => { entry.status = 'removed'; entry.removedAt = now; entry.removedBy = actor.name || 'Система'; changed = true })
    }
  }
  for (const entry of draft.waitlist.filter(item => item.status !== 'removed')) {
    if (!draft.tasks.some(task => taskActive(task) && task.waitlistEntryId === entry.id && task.type === 'waitlist')) {
      ensureWaitlistTask(draft, entry.id, { ...actor, now }); changed = true
    }
  }
  for (const patient of draft.patients || []) {
    if (patient.status === DO_NOT_CONTACT_STATUS) continue
    if (!draft.tasks.some(task => task.patientId === patient.id && taskActive(task))) {
      const tomorrow = new Date(new Date(now).getTime() + 86400000).toISOString().slice(0,10)
      createWorkflowTask(draft, patient, { type:'control', title:'Уточнить дальнейшее действие', dueDate:tomorrow, dueTime:'10:00', workflowType:'legacy-control', sourceEntityType:'migration', sourceEntityId:patient.id, idempotencyKey:`migration-control:${patient.id}`, comment:'Автоматически создано при проверке старых данных: у пациента отсутствовала активная задача' }, { ...actor, now })
      changed = true
    }
  }
  if (changed && !draft.audit.some(item => item.action === 'business-state-migration-v1')) draft.audit.unshift({ id:makeId(), at:now, user:actor.name || 'Система', action:'business-state-migration-v1' })
  draft.businessMigrationVersion = Math.max(Number(draft.businessMigrationVersion) || 0, 1)
  return { state:draft, changed }
}

export function validateBusinessState(state, options = {}) {
  const errors = [], warnings = []
  const patients = state.patients || [], tasks = state.tasks || [], waitlist = state.waitlist || []
  const patientIds = new Set(patients.map(item => item.id))
  const duplicateIds = values => values.filter((value,index,array) => value && array.indexOf(value) !== index)
  for (const id of new Set(duplicateIds([...patients,...tasks,...waitlist].map(item => item.id)))) errors.push({ code:'duplicate_id', message:`Дублирующийся ID: ${id}`, objectId:id })
  for (const patient of patients) {
    const active = tasks.filter(task => task.patientId === patient.id && taskActive(task))
    if (patient.status !== DO_NOT_CONTACT_STATUS && !active.length) errors.push({ code:'patient_without_action', patientId:patient.id, message:'Нефинальный пациент без активной задачи' })
    if (patient.status === '📅 Записан на приём' && !patient.appointmentDate) errors.push({ code:'booked_without_date', patientId:patient.id, message:'Записан на приём без даты' })
    if (patient.appointmentDate && !(patient.doctors || []).length) warnings.push({ code:'appointment_without_doctor', patientId:patient.id, message:'Дата приёма без врача' })
    if (patient.status === DO_NOT_CONTACT_STATUS && active.length) errors.push({ code:'dnc_with_tasks', patientId:patient.id, message:'«Не звонить» с активными задачами' })
    if (!KNOWN_PATIENT_STATUSES.has(patient.status)) errors.push({ code:'unknown_patient_status', patientId:patient.id, message:`Неизвестный этап: ${patient.status}` })
    for (const event of (patient.history || []).filter(item => item.actionType === 'decision_not_made')) {
      const continuation = tasks.find(task => task.id === event.createdTaskId && task.patientId === patient.id && task.type === 'decision')
      if (!continuation) errors.push({ code:'decision_result_without_task', patientId:patient.id, taskId:event.taskId, message:'У результата «Решение не принято» отсутствует следующая задача decision' })
      if (event.stageBefore && event.stageAfter && event.stageBefore !== event.stageAfter) errors.push({ code:'decision_changed_stage', patientId:patient.id, taskId:event.taskId, message:'Результат «Решение не принято» изменил этап пациента без отдельной причины' })
    }
  }
  for (const task of tasks) {
    if (!patientIds.has(task.patientId)) errors.push({ code:'orphan_task', taskId:task.id, message:'Задача с отсутствующим пациентом' })
    if (!KNOWN_TASK_TYPES.has(task.type)) warnings.push({ code:'unknown_task_type', taskId:task.id, message:`Неизвестный тип задачи: ${task.type}` })
    if (task.status === 'open') warnings.push({ code:'legacy_open_status', taskId:task.id, message:'Устаревший статус open' })
    if (taskActive(task) && task.dueAt && new Date(task.dueAt).getTime() < (options.now ? new Date(options.now).getTime() : Date.now())) warnings.push({ code:'overdue_task', taskId:task.id, message:'Активная задача просрочена' })
    if (task.type === 'waitlist' && (!task.waitlistEntryId || task.sourceEntityType !== 'waitlist')) errors.push({ code:'broken_waitlist_task', taskId:task.id, message:'Системная задача ожидания без связи с записью' })
    if (task.type === 'decision' && taskActive(task)) {
      const dueAt = task.dueAt || (task.dueDate ? `${task.dueDate}T${task.dueTime || '00:00'}:00` : '')
      if (!dueAt) errors.push({ code:'decision_missing_schedule', taskId:task.id, patientId:task.patientId, message:'Решение не принято, но дата следующего контакта отсутствует' })
      else if (new Date(dueAt).getTime() <= (options.now ? new Date(options.now).getTime() : Date.now())) {
        warnings.push({ code:'decision_overdue', taskId:task.id, patientId:task.patientId, message:'Срок уточнения решения просрочен' })
        errors.push({ code:'decision_not_future', taskId:task.id, patientId:task.patientId, message:'У активной задачи уточнения решения дата и время не находятся в будущем' })
      }
      if (!String(task.assignee || '').trim()) errors.push({ code:'decision_without_assignee', taskId:task.id, patientId:task.patientId, message:'У задачи уточнения решения не назначен ответственный' })
      if (!task.workflowId || !task.parentTaskId || !task.sourceEntityId) errors.push({ code:'decision_broken_workflow', taskId:task.id, patientId:task.patientId, message:'Задача уточнения решения не связана с исходным контактом' })
    }
  }
  const activeDecisions = tasks.filter(task => task.type === 'decision' && taskActive(task) && task.workflowId)
  for (const task of activeDecisions) {
    if (activeDecisions.some(other => other.id !== task.id && other.patientId === task.patientId && other.workflowId === task.workflowId)) {
      if (!errors.some(item => item.code === 'duplicate_decision' && item.workflowId === task.workflowId)) errors.push({ code:'duplicate_decision', taskId:task.id, patientId:task.patientId, workflowId:task.workflowId, message:'Есть несколько активных задач «Уточнить решение» одного workflow' })
    }
  }
  for (const entry of waitlist.filter(item => item.status !== 'removed')) {
    if (!patientIds.has(entry.patientId)) errors.push({ code:'orphan_waitlist', waitlistEntryId:entry.id, message:'Запись ожидания с отсутствующим пациентом' })
    const systemTasks = tasks.filter(task => taskActive(task) && task.type === 'waitlist' && task.waitlistEntryId === entry.id)
    if (!systemTasks.length) errors.push({ code:'waitlist_without_task', waitlistEntryId:entry.id, patientId:entry.patientId, message:'Активная запись ожидания без системной задачи' })
    if (systemTasks.length > 1) errors.push({ code:'duplicate_waitlist_task', waitlistEntryId:entry.id, message:'Несколько системных задач одной записи ожидания' })
  }
  return { errors, warnings }
}

export function applyTaskOutcome({ state, taskId, outcome, formData = {}, actor = {}, reducer }) {
  const draft = clone(state)
  const task = draft.tasks.find(item => item.id === taskId)
  if (!task || !taskActive(task)) throw new Error('Активная задача не найдена')
  const patient = draft.patients.find(item => item.id === task.patientId)
  if (!patient) throw new Error('Пациент задачи не найден')
  const now = actor.now || new Date().toISOString()
  task.workflowType ||= task.type || 'contact'
  task.workflowId ||= `${task.workflowType}:${patient.id}:${task.id}`
  task.sourceEntityType ||= 'task'
  task.sourceEntityId ||= task.id
  const context = { draft, task, patient, outcome, formData, actor:{ ...actor, now } }
  if (outcome === 'do_not_contact') finalizePatientAsDoNotContact(draft, patient.id, formData.reason, context.actor)
  else {
    task.status = TASK_STATUS_COMPLETED; task.completedAt = now; task.completedBy = actor.name || 'Система'; task.lastResult = outcome
    if (typeof reducer !== 'function') throw new Error('Для результата не определён обработчик workflow')
    reducer(context)
  }
  const final = outcome === 'do_not_contact'
  const relatedContinuation = draft.tasks.some(item => item.patientId === patient.id && item.id !== task.id && taskActive(item) && item.workflowId && item.workflowId === task.workflowId)
  if (!final && !relatedContinuation) throw new Error('Результат не создал связанное следующее действие')
  const report = validateBusinessState(draft, { now })
  const patientErrors = report.errors.filter(item => item.patientId === patient.id || item.taskId === task.id)
  if (patientErrors.length) throw new Error(patientErrors[0].message)
  return { state:draft, taskId:task.id, patientId:patient.id, report }
}

export function applyDecisionOutcome({ state, taskId, formData = {}, actor = {} }) {
  const subject = String(formData.subject || '').trim()
  const reasonCode = String(formData.reasonCode || '').trim()
  const reason = String(formData.reason || '').trim()
  const otherReason = String(formData.otherReason || '').trim()
  const assignee = String(formData.assignee || '').trim()
  if (!subject) throw new Error('Укажите, по какому вопросу пациент принимает решение')
  if (!DECISION_REASON_CODES.has(reasonCode) || !reason) throw new Error('Укажите причину, почему решение пока не принято')
  if (reasonCode === 'other' && !otherReason) throw new Error('Для причины «Другое» нужен комментарий')
  if (!assignee) throw new Error('Выберите ответственного администратора')
  const schedule = validateFutureDateTime(formData.dueDate, formData.dueTime, { now:actor.now })
  if (!schedule.valid) throw new Error(schedule.error)
  const before = state.patients.find(item => item.id === state.tasks.find(task => task.id === taskId)?.patientId)?.status
  const result = applyTaskOutcome({ state, taskId, outcome:DECISION_OUTCOME, formData, actor, reducer:({ draft, task, patient, actor:effectiveActor }) => {
    const title = subject ? `Уточнить решение по ${subject}` : 'Уточнить решение'
    const decision = createWorkflowTask(draft, patient, {
      type:'decision', title, dueDate:formData.dueDate, dueTime:formData.dueTime, assignee,
      comment:[reason, otherReason, formData.comment].filter(Boolean).join('. '), workflowType:task.workflowType,
      workflowId:task.workflowId, parentTaskId:task.id, sourceEntityType:task.sourceEntityType,
      sourceEntityId:task.sourceEntityId, idempotencyKey:`decision:${task.workflowId}`,
    }, effectiveActor)
    Object.assign(decision, { decisionSubject:subject, decisionReasonCode:reasonCode, decisionReason:reason, decisionOtherReason:otherReason, decisionDoctor:String(formData.doctor || '').trim(), decisionService:String(formData.service || '').trim(), decisionComment:String(formData.comment || '').trim(), lastPatientPromise:String(formData.lastPromise || '').trim(), lastContactAt:effectiveActor.now })
    patient.history ||= []
    patient.history.unshift({ id:makeId(), createdAt:effectiveActor.now, timestamp:effectiveActor.now, authorId:actor.id || null, authorName:actor.name || assignee, actionType:'decision_not_made', taskId:task.id, createdTaskId:decision.id, stageBefore:patient.status, stageAfter:patient.status, decisionSubject:subject, decisionReason:reason, comment:String(formData.comment || '').trim(), nextContactAt:schedule.dueAt, text:`Решение не принято. Вопрос: ${subject}. Причина: ${reason}${otherReason ? `. ${otherReason}` : ''}. Следующий контакт: ${schedule.dueAt}. Создана задача «${title}».` })
  } })
  const after = result.state.patients.find(item => item.id === result.patientId)?.status
  if (before !== after) throw new Error('Результат «Решение не принято» не должен менять этап пациента')
  return result
}

export function prepareImportedState(data, actor = {}) {
  if (!data || typeof data !== 'object') throw new Error('Файл не содержит объект данных')
  if (![3,4].includes(Number(data.version))) throw new Error('Неподдерживаемая версия схемы резервной копии')
  if (!Array.isArray(data.patients) || !Array.isArray(data.tasks) || (data.waitlist != null && !Array.isArray(data.waitlist))) throw new Error('Неверная структура резервной копии')
  const candidate = clone({ ...data, waitlist:data.waitlist || [], audit:Array.isArray(data.audit) ? data.audit : [] })
  const migrated = migrateBusinessState(candidate, actor)
  const report = validateBusinessState(migrated.state, { now:actor.now })
  const criticalCodes = new Set(['duplicate_id','orphan_task','orphan_waitlist','unknown_patient_status','broken_waitlist_task','duplicate_waitlist_task','booked_without_date','dnc_with_tasks','decision_result_without_task','decision_changed_stage','decision_without_assignee','decision_broken_workflow','duplicate_decision','decision_not_future'])
  const critical = report.errors.filter(item => criticalCodes.has(item.code))
  return { state:migrated.state, report, critical, counts:{ patients:migrated.state.patients.length, tasks:migrated.state.tasks.length, waitlist:migrated.state.waitlist.length }, migrated:migrated.changed }
}
