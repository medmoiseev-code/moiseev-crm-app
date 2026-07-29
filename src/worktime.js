import { storageKey } from './storage.js'

const CACHE_KEY = storageKey('moiseev_worktime_offline_v01')
const apiUrl = import.meta.env.VITE_SUPABASE_URL || ''
const apiKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const worktimeCloudEnabled = Boolean(apiUrl && apiKey)

function readCache() {
  try {
    const value = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')
    return { shifts: value.shifts || [], requests: value.requests || [], rates: value.rates || {}, audit: value.audit || [] }
  } catch {
    return { shifts: [], requests: [], rates: {}, audit: [] }
  }
}

export let worktime = readCache()

function persist() {
  localStorage.setItem(CACHE_KEY, JSON.stringify(worktime))
}

function headers(prefer = '') {
  return { apikey: apiKey, Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Prefer: prefer }
}

async function rest(path, options = {}) {
  if (!worktimeCloudEnabled) throw new Error('Supabase не настроен')
  const response = await fetch(`${apiUrl}/rest/v1/${path}`, { ...options, headers: { ...headers(options.prefer), ...(options.headers || {}) } })
  if (!response.ok) throw new Error(await response.text())
  return response.status === 204 ? null : response.json()
}

export function durationMinutes(shift, until = new Date()) {
  const end = shift.endAt ? new Date(shift.endAt) : until
  return Math.max(0, Math.floor((end - new Date(shift.startAt)) / 60000))
}

export function durationSeconds(shift, until = Date.now()) {
  const startedAt = new Date(shift.shiftStartedAt || shift.startAt).getTime()
  const endAt = shift.endAt ? new Date(shift.endAt).getTime() : (until instanceof Date ? until.getTime() : Number(until))
  if (!Number.isFinite(startedAt) || !Number.isFinite(endAt)) return 0
  return Math.max(0, Math.floor((endAt - startedAt) / 1000))
}

export function activeShift(userId) {
  return worktime.shifts.find(shift => shift.userId === userId && (shift.status === 'active' || (!shift.status && shift.shiftActive === true))) || null
}

export function startShift(user) {
  if (worktime.shifts.some(shift => shift.userId === user.id && ['active', 'needs_review'].includes(shift.status))) throw new Error('Предыдущая смена ещё активна или ожидает проверки')
  const now = new Date().toISOString()
  const offline = !navigator.onLine
  const shift = {
    id: crypto.randomUUID(), userId: user.id, userName: user.name, workDate: now.slice(0, 10),
    startAt: now, endAt: null, workedMinutes: null, status: 'active', createdAt: now, updatedAt: now,
    shiftActive: true, shiftStartedAt: now,
    startedOffline: offline, endedOffline: false, syncStatus: 'pending', deviceId: getDeviceId(),
  }
  worktime.shifts.push(shift); persist(); syncWorktime()
  return shift
}

export function endShift(userId) {
  const shift = activeShift(userId)
  if (!shift) throw new Error('Активная смена не найдена')
  const now = new Date().toISOString()
  shift.endAt = now
  shift.workedSeconds = durationSeconds(shift, new Date(now))
  shift.workedMinutes = durationMinutes(shift, new Date(now))
  shift.status = 'completed'
  shift.shiftActive = false
  shift.shiftStartedAt = null
  shift.updatedAt = now
  shift.endedOffline = !navigator.onLine
  shift.syncStatus = 'pending'
  persist(); syncWorktime()
  return shift
}

export function requestCorrection(user, shift, requestedEndAt, reason) {
  const now = new Date().toISOString()
  shift.status = 'needs_review'; shift.shiftActive = false; shift.syncStatus = 'pending'; shift.updatedAt = now
  const request = { id: crypto.randomUUID(), shiftId: shift.id, requestedEndAt, reason, requestedBy: user.id, requestedByName: user.name, requestedAt: now, status: 'pending' }
  worktime.requests.push(request); persist(); syncWorktime()
  return request
}

export function reviewCorrection(requestId, manager, approved) {
  const request = worktime.requests.find(item => item.id === requestId)
  if (!request || request.status !== 'pending') return
  const shift = worktime.shifts.find(item => item.id === request.shiftId)
  request.status = approved ? 'approved' : 'rejected'; request.reviewedBy = manager.id; request.reviewedAt = new Date().toISOString(); request.syncStatus = 'pending'
  if (approved && shift) {
    worktime.audit.push({ id:crypto.randomUUID(),shiftId:shift.id,oldStartAt:shift.startAt,oldEndAt:shift.endAt,newStartAt:shift.startAt,newEndAt:request.requestedEndAt,reason:request.reason,requestedBy:request.requestedBy,approvedBy:manager.id,approvedAt:new Date().toISOString(),syncStatus:'pending' })
    shift.endAt = request.requestedEndAt; shift.workedSeconds = durationSeconds(shift, new Date(request.requestedEndAt)); shift.workedMinutes = durationMinutes(shift, new Date(request.requestedEndAt)); shift.status = 'completed'; shift.shiftActive = false; shift.shiftStartedAt = null; shift.syncStatus = 'pending'
  }
  if (!approved && shift) { shift.status = 'active'; shift.shiftActive = true; shift.shiftStartedAt ||= shift.startAt; shift.syncStatus = 'pending' }
  persist(); syncWorktime()
}

export function setHourlyRate(userId, value) {
  worktime.rates[userId] = Math.max(0, Number(value) || 0); persist(); syncWorktime()
}

export async function syncWorktime() {
  if (!worktimeCloudEnabled || !navigator.onLine) return false
  try {
    const shifts = worktime.shifts.filter(item => item.syncStatus !== 'synchronized')
    if (shifts.length) await rest('work_shifts?on_conflict=id', { method: 'POST', prefer: 'resolution=merge-duplicates', body: JSON.stringify(shifts.map(toShiftRow)) })
    const requests = worktime.requests.filter(item => item.syncStatus !== 'synchronized')
    if (requests.length) await rest('work_time_correction_requests?on_conflict=id', { method: 'POST', prefer: 'resolution=merge-duplicates', body: JSON.stringify(requests.map(toRequestRow)) })
    const audit = worktime.audit.filter(item => item.syncStatus !== 'synchronized')
    if (audit.length) await rest('work_time_audit?on_conflict=id', { method: 'POST', prefer: 'resolution=merge-duplicates', body: JSON.stringify(audit.map(toAuditRow)) })
    const rates = Object.entries(worktime.rates).map(([userId, hourlyRate]) => ({ user_id: userId, hourly_rate: hourlyRate, updated_at: new Date().toISOString() }))
    if (rates.length) await rest('work_hourly_rates?on_conflict=user_id', { method: 'POST', prefer: 'resolution=merge-duplicates', body: JSON.stringify(rates) })
    shifts.forEach(item => item.syncStatus = 'synchronized'); requests.forEach(item => item.syncStatus = 'synchronized'); audit.forEach(item => item.syncStatus = 'synchronized'); persist()
    return true
  } catch (error) {
    console.warn('Учёт времени ожидает синхронизации', error)
    return false
  }
}

export async function refreshWorktime() {
  if (!worktimeCloudEnabled || !navigator.onLine) return worktime
  try {
    const [shiftRows, requestRows, rateRows] = await Promise.all([
      rest('work_shifts?select=*'), rest('work_time_correction_requests?select=*'), rest('work_hourly_rates?select=*'),
    ])
    const pendingShifts = worktime.shifts.filter(item => item.syncStatus !== 'synchronized')
    const pendingRequests = worktime.requests.filter(item => item.syncStatus !== 'synchronized')
    worktime.shifts = mergeById(shiftRows.map(fromShiftRow), pendingShifts)
    worktime.requests = mergeById(requestRows.map(fromRequestRow), pendingRequests)
    worktime.rates = Object.fromEntries(rateRows.map(row => [row.user_id, Number(row.hourly_rate)]))
    persist()
  } catch (error) { console.warn('Не удалось загрузить рабочее время', error) }
  return worktime
}

function toShiftRow(item) {
  return { id:item.id,user_id:item.userId,user_name:item.userName,work_date:item.workDate,start_at:item.startAt,end_at:item.endAt,worked_minutes:item.workedMinutes,status:item.status,created_at:item.createdAt,updated_at:item.updatedAt,started_offline:item.startedOffline,ended_offline:item.endedOffline,sync_status:'synchronized',device_id:item.deviceId }
}
function toRequestRow(item) {
  return { id:item.id,shift_id:item.shiftId,requested_end_at:item.requestedEndAt,reason:item.reason,requested_by:item.requestedBy,requested_at:item.requestedAt,status:item.status,reviewed_by:item.reviewedBy||null,reviewed_at:item.reviewedAt||null }
}
function toAuditRow(item) { return { id:item.id,shift_id:item.shiftId,old_start_at:item.oldStartAt,old_end_at:item.oldEndAt,new_start_at:item.newStartAt,new_end_at:item.newEndAt,reason:item.reason,requested_by:item.requestedBy,approved_by:item.approvedBy,approved_at:item.approvedAt } }
function fromShiftRow(row) { return { id:row.id,userId:row.user_id,userName:row.user_name,workDate:row.work_date,startAt:row.start_at,endAt:row.end_at,workedMinutes:row.worked_minutes,status:row.status,createdAt:row.created_at,updatedAt:row.updated_at,startedOffline:row.started_offline,endedOffline:row.ended_offline,syncStatus:'synchronized',deviceId:row.device_id } }
function fromRequestRow(row) { return { id:row.id,shiftId:row.shift_id,requestedEndAt:row.requested_end_at,reason:row.reason,requestedBy:row.requested_by,requestedAt:row.requested_at,status:row.status,reviewedBy:row.reviewed_by,reviewedAt:row.reviewed_at,syncStatus:'synchronized' } }
function mergeById(serverItems, pendingItems) { const map = new Map(serverItems.map(item => [item.id, item])); pendingItems.forEach(item => map.set(item.id, item)); return [...map.values()] }
function getDeviceId() {
  const deviceKey = storageKey('moiseev_device_id')
  let id = localStorage.getItem(deviceKey)
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(deviceKey, id) }
  return id
}

window.addEventListener('online', syncWorktime)
