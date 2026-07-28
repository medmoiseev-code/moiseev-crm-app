const DAY_MS = 24 * 60 * 60 * 1000

function localDate(offset = 0) {
  const date = new Date(Date.now() + offset * DAY_MS)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function at(date, time) {
  return `${date}T${time}:00`
}

const DEMO_PATIENTS = [
  ['demo-01','Иван Тестов (демо)','+7 000 000-00-01','🦷 На лечении','Имплантация'],
  ['demo-02','Анна Примерова (демо)','+7 000 000-00-02','🤔 Думает','Удаление'],
  ['demo-03','Сергей Учебный (демо)','+7 000 000-00-03','📅 Записан на приём','Консультация'],
  ['demo-04','Марина Макетова (демо)','+7 000 000-00-04','🆕 Новый','Синус-лифтинг'],
  ['demo-05','Алексей Демонстрационный','+7 000 000-00-05','🦷 На лечении','Пластика'],
  ['demo-06','Ольга Тестовая (демо)','+7 000 000-00-06','🤔 Думает','Имплантация'],
  ['demo-07','Павел Примерный (демо)','+7 000 000-00-07','🔄 Профосмотр','Гигиена'],
  ['demo-08','Ирина Учебная (демо)','+7 000 000-00-08','🆕 Новый','Удаление'],
  ['demo-09','Денис Макетов (демо)','+7 000 000-00-09','📅 Записан на приём','Консультация'],
  ['demo-10','Светлана Тестовая (демо)','+7 000 000-00-10','🤔 Думает','Имплантация'],
  ['demo-11','Максим Примеров (демо)','+7 000 000-00-11','✅ Лечение завершено','Ортопедия'],
  ['demo-12','Елена Учебная (демо)','+7 000 000-00-12','🆕 Новый','Консультация'],
]

function demoPatient([id, name, phone, status], index) {
  const createdAt = at(localDate(-20 + index), '09:00')
  return {
    id, name, phones:[phone], doctors:[index % 2 ? 'Климов Ф.С.' : 'Моисеев Г.А.'], birthDate:'',
    appointmentDate:status === '📅 Записан на приём' ? localDate(3 + index % 3) : '', appointmentAt:null,
    doctorComment:index % 3 === 0 ? 'Учебный комментарий врача. Не содержит реальных медицинских данных.' : '',
    specialNote:index === 1 ? 'Тестовое особое примечание.' : '', status,
    adminNote:index % 2 === 0 ? 'Демонстрационный комментарий администратора.' : 'Тестовая запись для показа интерфейса.',
    urgent:false, createdAt, updatedAt:createdAt, updatedBy:'Демо-администратор', externalId:null,
    history:[
      { id:`${id}-history-1`, at:createdAt, user:'Демо-администратор', type:'system', text:'Создана демонстрационная карточка пациента.' },
      { id:`${id}-history-2`, at:at(localDate(-2), '12:00'), user:'Демо-администратор', type:'admin_comment', text:'Добавлен тестовый комментарий для демонстрации истории.' },
    ],
  }
}

function task(id, patientId, type, title, dueDate, time, status = 'active', comment = 'Демонстрационная задача') {
  const createdAt = at(localDate(-5), '10:00')
  return {
    id, patientId, type, title, dueDate, dueAt:at(dueDate, time), assignee:'Елизавета', note:comment, comment,
    status, completedAt:status === 'completed' ? at(localDate(-1), '16:00') : null,
    createdAt, createdBy:'Демо-администратор', updatedAt:createdAt, updatedBy:'Демо-администратор',
    history:[{ id:`${id}-history`, at:createdAt, author:'Демо-администратор', action:'created', text:'Создана тестовая задача.' }],
  }
}

export function createInitialState() {
  const patients = DEMO_PATIENTS.map(demoPatient)
  const tasks = [
    task('task-today-1','demo-01','call','📞 Подтвердить запись',localDate(0),'10:00'),
    task('task-today-2','demo-02','write','💬 Написать пациенту',localDate(0),'14:30'),
    task('task-today-3','demo-03','reminder','🔔 Напомнить пациенту',localDate(0),'17:00'),
    task('task-tomorrow-1','demo-04','call','📞 Позвонить пациенту',localDate(1),'09:30'),
    task('task-tomorrow-2','demo-05','reminder','🔔 Напомнить доктору',localDate(1),'13:00'),
    task('task-future-1','demo-06','invite_checkup','🦷 Пригласить на профосмотр',localDate(5),'11:00'),
    task('task-future-2','demo-07','request_image','📷 Запросить снимок',localDate(8),'15:00'),
    task('task-overdue-1','demo-08','call','📞 Уточнить решение',localDate(-2),'12:00'),
    task('task-overdue-2','demo-09','documents','📄 Отправить документы',localDate(-1),'16:30'),
    task('task-completed-1','demo-10','call','📞 Первый контакт',localDate(-3),'10:00','completed','Тестовый звонок выполнен.'),
    task('task-completed-2','demo-11','reminder','🔔 Напоминание',localDate(-2),'11:30','completed','Тестовое напоминание выполнено.'),
  ]
  const priorities = ['high','medium','low','high','medium','high','low','medium','medium','high']
  const preferences = ['Любой день','Только вечер','Любое время','Только пятница','Утро','Любой день','После 16:00','Любое время','Утро','Любой день']
  const comments = ['Готов приехать в течение часа.','После 18:00.','Позвонить заранее.','Готов приехать в любой момент.','Нужен сопровождающий.','При появлении окна звонить первым.','Не может по понедельникам.','Желательно на этой неделе.','Только будни.','Если появится окно — звонить сразу.']
  const waitlist = DEMO_PATIENTS.slice(0,10).map(([patientId,,, , treatment], index) => ({
    id:`waitlist-demo-${index + 1}`, patientId, doctor:index % 2 ? 'Климов Ф.С.' : 'Моисеев Г.А.', treatment,
    customTreatment:'', durationMinutes:[90,60,30,120,90,60,60,45,30,120][index], preferences:[],
    preferenceText:preferences[index], comment:comments[index], priority:priorities[index], status:'active',
    addedAt:at(localDate(-10 + index),'10:00'), addedBy:'Демо-администратор', demo:true,
  }))
  return {
    version:4, demo:true, waitlistDemoSeeded:true, patients, tasks, waitlist,
    audit:[{ id:'demo-initial-state', at:new Date().toISOString(), user:'Система', action:'Созданы исходные демонстрационные данные' }],
    updatedAt:new Date().toISOString(),
  }
}
