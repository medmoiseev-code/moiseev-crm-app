import sourceData from '../patients_moiseev_import (1).json'

const DOCTOR_NAMES = new Set(['Моисеев Г.А', 'Моисеев Г.А.', 'Климов Ф.С', 'Климов Ф.С.'])

function normalizeDoctor(name = '') {
  const value = String(name).trim()
  return value && !value.endsWith('.') ? `${value}.` : value
}

function normalizeStatus(status = '') {
  return String(status).replace(/^❌\s*/, '❌ ')
}

function historyItem(item, patientId, index) {
  const author = String(item.author || '').trim() || 'Импорт'
  return {
    id: `${patientId}-history-${index + 1}`,
    at: item.createdAt || '',
    user: author,
    type: DOCTOR_NAMES.has(author) ? 'doctor_comment' : 'admin_comment',
    text: String(item.comment || ''),
  }
}

function taskItem(patient, patientId, kind) {
  const preventive = kind === 'preventive'
  const dueDate = preventive ? patient.nextPreventiveCheckDate : patient.nextCallDate
  if (!dueDate) return null
  return {
    id: `${patientId}-task-${kind}`,
    patientId,
    type: preventive ? 'invite_checkup' : 'call',
    title: preventive ? 'Провести профилактический осмотр' : 'Позвонить пациенту',
    dueDate,
    assignee: patient.administrator || '',
    note: patient.adminComment || '',
    status: 'active',
    completedAt: null,
    createdAt: patient.createdAt || `${dueDate}T00:00:00`,
    createdBy: 'Импорт',
  }
}

export function createInitialState() {
  if (!Array.isArray(sourceData.patients) || sourceData.patients.length !== 83) {
    throw new Error('Файл первоначального импорта должен содержать ровно 83 пациента')
  }

  const patients = sourceData.patients.map((source, index) => {
    const patientId = `moiseev-${source.importId || `row-${index + 1}`}`
    return {
      id: patientId,
      name: source.fullName || '',
      phones: [],
      doctors: source.doctor ? [normalizeDoctor(source.doctor)] : [],
      appointmentDate: source.appointmentDate || '',
      doctorComment: source.doctorComment || '',
      specialNote: '',
      status: normalizeStatus(source.status),
      adminNote: source.adminComment || '',
      urgent: Boolean(source.urgent),
      createdAt: source.createdAt || '',
      updatedAt: source.createdAt || '',
      updatedBy: source.administrator || '',
      history: (source.history || []).map((item, historyIndex) => historyItem(item, patientId, historyIndex)),
      externalId: source.importId || null,
    }
  })

  const tasks = sourceData.patients.flatMap((patient, index) => {
    const patientId = `moiseev-${patient.importId || `row-${index + 1}`}`
    return [taskItem(patient, patientId, 'call'), taskItem(patient, patientId, 'preventive')].filter(Boolean)
  })

  return {
    version: 3,
    patients,
    tasks,
    audit: [{
      id: 'moiseev-initial-import',
      at: sourceData.exportedAt || new Date().toISOString(),
      user: 'Система',
      action: `Первоначально импортировано пациентов: ${patients.length}`,
    }],
    updatedAt: sourceData.exportedAt || new Date().toISOString(),
  }
}
