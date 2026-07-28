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

const WAITLIST_DEMO = [
  ['Иванов Сергей Петрович','+7 900 000-00-01','Имплантация',90,'Моисеев Глеб','Виктория','high',['any_day'],'Как можно раньше','Готов приехать в течение часа.'],
  ['Петров Алексей Игоревич','+7 900 000-00-02','Удаление',60,'Климов Федор','Елизавета','medium',['evening'],'После 18:00','Звонить при освобождении окна после 18:00.'],
  ['Соколова Марина Андреевна','+7 900 000-00-03','Консультация',30,'','Виктория','low',['any_day'],'Любое время','Позвонить заранее.'],
  ['Кузнецов Андрей Олегович','+7 900 000-00-04','Синус-лифтинг',120,'Моисеев Глеб','Елизавета','high',['day'],'Только пятница','Готов приехать в любой момент.'],
  ['Орлова Светлана Викторовна','+7 900 000-00-05','Пластика',90,'Моисеев Глеб','Виктория','medium',['morning'],'До 12:00','Нужен один сопровождающий.'],
  ['Смирнов Денис Александрович','+7 900 000-00-06','Имплантация',60,'Климов Федор','Елизавета','high',['asap'],'Как можно раньше','Освободилось окно — звонить первым.'],
  ['Николаева Анна Сергеевна','+7 900 000-00-07','Гигиена',60,'','Виктория','low',['day'],'После 16:00','Не может по понедельникам.'],
  ['Егоров Павел Михайлович','+7 900 000-00-08','Удаление',45,'Климов Федор','Елизавета','medium',['any_day'],'Любое время','Желательно на этой неделе.'],
  ['Фролова Ирина Дмитриевна','+7 900 000-00-09','Консультация',30,'Моисеев Глеб','Виктория','medium',['morning'],'Будни','Только будни.'],
  ['Васильев Максим Романович','+7 900 000-00-10','Имплантация',120,'Моисеев Глеб','Елизавета','high',['any_day'],'Любой день','Если появится окно — звонить сразу.'],
]

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

  const waitlistPatients = WAITLIST_DEMO.map((item, index) => ({
    id:`waitlist-patient-${index + 1}`, name:item[0], phones:[item[1]], doctors:item[4] ? [item[4]] : [], birthDate:'', appointmentDate:'', appointmentAt:null,
    doctorComment:'', specialNote:'', status:'🤔 Думает', adminNote:item[9], urgent:false,
    createdAt:`2026-07-${String(15 + index).padStart(2,'0')}T10:00:00`, updatedAt:`2026-07-${String(15 + index).padStart(2,'0')}T10:00:00`, updatedBy:item[5], externalId:null, history:[],
  }))
  patients.push(...waitlistPatients)

  const tasks = sourceData.patients.flatMap((patient, index) => {
    const patientId = `moiseev-${patient.importId || `row-${index + 1}`}`
    return [taskItem(patient, patientId, 'call'), taskItem(patient, patientId, 'preventive')].filter(Boolean)
  })

  const waitlist = WAITLIST_DEMO.map((item, index) => ({
    id:`waitlist-demo-${index + 1}`, patientId:`waitlist-patient-${index + 1}`, treatment:item[2], customTreatment:'', durationMinutes:item[3], doctor:item[4], administrator:item[5],
    priority:item[6], preferences:item[7], preferenceText:item[8], comment:item[9], status:'active', addedAt:`2026-07-${String(15 + index).padStart(2,'0')}T10:00:00`, addedBy:item[5], demo:true,
  }))

  return {
    version: 4,
    patients,
    tasks,
    waitlist,
    audit: [{
      id: 'moiseev-initial-import',
      at: sourceData.exportedAt || new Date().toISOString(),
      user: 'Система',
      action: `Первоначально импортировано пациентов: ${patients.length}`,
    }],
    updatedAt: sourceData.exportedAt || new Date().toISOString(),
  }
}
