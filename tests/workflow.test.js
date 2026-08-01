import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  applyDecisionOutcome, applyTaskOutcome, createWorkflowTask, ensureTreatmentCoverage, ensureWaitlistTask, finalizePatientAsDoNotContact,
  migrateBusinessState, prepareImportedState, validateBusinessState, validateFutureDateTime,
} from '../src/workflow.js'
import { createInitialState } from '../src/initial-data.js'

const NOW = '2030-01-01T09:00:00.000Z'
const actor = { id:'admin', name:'Администратор', now:NOW }
const patient = (overrides = {}) => ({ id:'p1', name:'Тестовый Пациент', status:'🆕 Новый', doctors:['Врач'], history:[], ...overrides })
const task = (overrides = {}) => ({ id:'t1', patientId:'p1', type:'call', title:'Позвонить', dueDate:'2030-01-02', dueAt:'2030-01-02T10:00:00', status:'active', workflowType:'call', workflowId:'call:w1', sourceEntityType:'task', sourceEntityId:'t1', idempotencyKey:'source:t1', ...overrides })
const base = (overrides = {}) => ({ patients:[patient()], tasks:[task()], waitlist:[], audit:[], ...overrides })
const decisionData = (overrides = {}) => ({ subject:'имплантации', reasonCode:'cost', reason:'Обдумывает стоимость', dueDate:'2030-01-03', dueTime:'12:00', assignee:'Администратор', doctor:'Врач', service:'Имплантация', comment:'Перезвонить после расчёта', ...overrides })
const expect = value => ({
  toBe:expected => assert.equal(value,expected),
  toHaveLength:expected => assert.equal(value.length,expected),
  toMatchObject:expected => Object.entries(expected).forEach(([key,item]) => assert.deepEqual(value[key],item)),
  toThrow:pattern => assert.throws(value,pattern),
})

describe('workflow core', () => {
  it('rejects past date and time', () => expect(validateFutureDateTime('2029-12-31','10:00',{ now:NOW }).valid).toBe(false))
  it('accepts a future date and time', () => expect(validateFutureDateTime('2030-01-02','10:00',{ now:NOW }).valid).toBe(true))

  it('does not duplicate an idempotent task', () => {
    const state = base({ tasks:[] })
    const spec = { type:'call', title:'Перезвонить', dueDate:'2030-01-02', dueTime:'10:00', workflowId:'call:w1', workflowType:'call', sourceEntityId:'t1', idempotencyKey:'call:p1:2030-01-02T10:00' }
    createWorkflowTask(state, state.patients[0], spec, actor)
    createWorkflowTask(state, state.patients[0], spec, actor)
    expect(state.tasks).toHaveLength(1)
  })

  it('keeps treatment relation and detects an active treatment without a task', () => {
    const state = base({ patients:[patient({ treatments:[{ id:'tr1',name:'Имплантация',stage:'Ожидание КТ',status:'active' }] })], tasks:[] })
    expect(validateBusinessState(state,{ now:NOW }).errors.some(item => item.code === 'treatment_without_action')).toBe(true)
    const created = createWorkflowTask(state,state.patients[0],{ type:'contact',title:'Связаться',dueDate:'2030-01-02',dueTime:'10:00',treatmentId:'tr1' },actor)
    expect(created.treatmentId).toBe('tr1')
    expect(validateBusinessState(state,{ now:NOW }).errors.some(item => item.code === 'treatment_without_action')).toBe(false)
  })

  it('inherits treatment when creating the next workflow task', () => {
    const state = base({ patients:[patient({ treatments:[{ id:'tr1',name:'Терапия',status:'active' }] })], tasks:[task({ treatmentId:'tr1' })] })
    const next = createWorkflowTask(state,state.patients[0],{ type:'contact',title:'Следующий контакт',dueDate:'2030-01-03',dueTime:'10:00',parentTaskId:'t1' },actor)
    expect(next.treatmentId).toBe('tr1')
  })

  it('automatically restores coverage for every active treatment line', () => {
    const state = base({ patients:[patient({ treatments:[{ id:'tr1',name:'Терапия',status:'active' },{ id:'tr2',name:'Ортопедия',status:'waiting' }] })], tasks:[] })
    const created = ensureTreatmentCoverage(state,actor)
    expect(created).toHaveLength(2)
    expect(validateBusinessState(state,{ now:NOW }).errors.some(item => item.code === 'treatment_without_action')).toBe(false)
  })

  it('does not allow an active task to remain without its own line', () => {
    const state = base({ tasks:[task({ treatmentId:null,scope:null })] })
    expect(validateBusinessState(state,{ now:NOW }).errors.some(item => item.code === 'task_without_scope')).toBe(true)
    ensureTreatmentCoverage(state,actor)
    expect(validateBusinessState(state,{ now:NOW }).errors.some(item => item.code === 'task_without_scope')).toBe(false)
    expect(Boolean(state.tasks[0].treatmentId)).toBe(true)
  })

  it('rolls back when outcome has no related continuation', () => {
    const state = base()
    expect(() => applyTaskOutcome({ state, taskId:'t1', outcome:'completed', actor, reducer:() => {} })).toThrow(/следующее действие/)
    expect(state.tasks[0].status).toBe('active')
  })

  it('no contact closes current task and creates a related callback', () => {
    const state = base()
    const result = applyTaskOutcome({ state, taskId:'t1', outcome:'no_contact', actor, reducer:({ draft,task:source,patient:p }) => {
      createWorkflowTask(draft,p,{ type:'call',title:'Перезвонить',dueDate:'2030-01-03',dueTime:'10:00',workflowId:source.workflowId,workflowType:source.workflowType,parentTaskId:source.id,sourceEntityId:source.sourceEntityId,idempotencyKey:'callback:t1' },actor)
    } })
    expect(result.state.tasks.find(item => item.id === 't1').status).toBe('completed')
    expect(result.state.tasks.find(item => item.parentTaskId === 't1')?.type).toBe('call')
  })

  it('decision outcome keeps patient stage and creates decision task', () => {
    const state = base()
    const result = applyTaskOutcome({ state, taskId:'t1', outcome:'decision', actor, reducer:({ draft,task:source,patient:p }) => {
      createWorkflowTask(draft,p,{ type:'decision',title:'Уточнить решение',dueDate:'2030-01-03',dueTime:'11:00',workflowId:source.workflowId,workflowType:source.workflowType,parentTaskId:source.id,sourceEntityId:source.sourceEntityId,idempotencyKey:'decision:t1' },actor)
    } })
    expect(result.state.patients[0].status).toBe('🆕 Новый')
    expect(result.state.tasks.some(item => item.type === 'decision' && item.status === 'active')).toBe(true)
  })

  it('appointment confirmation is created once', () => {
    const state = base({ tasks:[] })
    const spec = { type:'call',title:'Подтвердить приём',dueDate:'2030-01-02',dueTime:'10:00',workflowType:'appointment',workflowId:'appointment:a1',sourceEntityType:'appointment',sourceEntityId:'a1',appointmentId:'a1',idempotencyKey:'appointment-confirmation:a1' }
    createWorkflowTask(state,state.patients[0],spec,actor); createWorkflowTask(state,state.patients[0],spec,actor)
    expect(state.tasks).toHaveLength(1)
  })

  it('confirmed appointment creates result-control task', () => {
    const state = base({ patients:[patient({ status:'📅 Записан на приём', appointmentDate:'2030-01-03', appointmentId:'a1' })], tasks:[task({ workflowType:'appointment',workflowId:'appointment:a1',sourceEntityType:'appointment',sourceEntityId:'a1' })] })
    const result = applyTaskOutcome({ state,taskId:'t1',outcome:'confirmed',actor,reducer:({draft,task:source,patient:p}) => createWorkflowTask(draft,p,{type:'control',title:'Результат приёма',dueDate:'2030-01-03',dueTime:'12:00',workflowType:'appointment',workflowId:source.workflowId,parentTaskId:source.id,sourceEntityType:'appointment',sourceEntityId:'a1',idempotencyKey:'appointment-result:a1'},actor) })
    expect(result.state.tasks.some(item => item.idempotencyKey === 'appointment-result:a1')).toBe(true)
  })

  it('do not contact closes tasks and waitlist', () => {
    const state = base({ waitlist:[{ id:'w1',patientId:'p1',status:'active' }] })
    finalizePatientAsDoNotContact(state,'p1','Просьба пациента',actor)
    expect(state.patients[0].status).toBe('🚫 Не звонить')
    expect(state.patients[0].adminNote).toBe('Просьба пациента')
    expect(state.tasks.every(item => item.status === 'cancelled')).toBe(true)
    expect(state.waitlist[0].status).toBe('removed')
  })

  it('waitlist task keeps all relation fields', () => {
    const state = base({ tasks:[], waitlist:[{ id:'w1',patientId:'p1',status:'active',comment:'Ожидает окно' }] })
    const created = ensureWaitlistTask(state,'w1',actor,{dueDate:'2030-01-02',dueTime:'10:00'})
    expect(created).toMatchObject({ waitlistEntryId:'w1',sourceEntityType:'waitlist',sourceEntityId:'w1',workflowType:'waitlist',workflowId:'waitlist:w1' })
  })

  it('creates a waitlist task even when the patient already has an appointment', () => {
    const state = base({ patients:[patient({ appointmentDate:'2030-01-05', appointmentAt:'2030-01-05T12:00:00' })], tasks:[], waitlist:[{ id:'w1',patientId:'p1',status:'active',comment:'Ожидает другое направление' }] })
    const created = ensureWaitlistTask(state,'w1',actor,{dueDate:'2030-01-02',dueTime:'10:00'})
    expect(created).toMatchObject({ type:'waitlist',waitlistEntryId:'w1',status:'active' })
    expect(Boolean(created.treatmentId)).toBe(true)
    expect(state.patients[0].treatments.some(item => item.id === created.treatmentId && item.kind === 'waitlist')).toBe(true)
  })

  it('repeated waitlist migration does not duplicate tasks or audit', () => {
    const initial = base({ tasks:[], waitlist:[{ id:'w1',patientId:'p1',status:'active' }] })
    const once = migrateBusinessState(initial,actor).state
    const twice = migrateBusinessState(once,actor).state
    expect(twice.tasks.filter(item => item.waitlistEntryId === 'w1')).toHaveLength(1)
    expect(twice.audit.filter(item => item.action === 'business-state-migration-v1')).toHaveLength(1)
  })

  it('does not duplicate waitlist control when a linked callback is active', () => {
    const state = base({ patients:[patient({ treatments:[{ id:'tr1',kind:'waitlist',name:'Лист ожидания',status:'active' }] })], waitlist:[{ id:'w1',patientId:'p1',status:'active',treatment:'Консультация' }], tasks:[task({ id:'callback1',type:'call',title:'Повторный звонок',waitlistEntryId:'w1',workflowId:'waitlist:w1',treatmentId:'tr1' })] })
    const linkedTask = ensureWaitlistTask(state,'w1',actor)
    expect(linkedTask.id).toBe('callback1')
    expect(state.tasks).toHaveLength(1)
  })

  for (const status of ['🆕 Новый','🦷 На лечении','📅 Записан на приём']) {
    it(`${status} remains unchanged when decision is not made`, () => {
      const state = base({ patients:[patient({ status, ...(status === '📅 Записан на приём' ? { appointmentDate:'2030-01-05' } : {}) })] })
      const result = applyDecisionOutcome({ state,taskId:'t1',formData:decisionData({ subject:status === '📅 Записан на приём' ? 'дополнительной услуге' : 'имплантации' }),actor })
      expect(result.state.patients[0].status).toBe(status)
    })
  }
  it('creates one linked decision task with context', () => {
    const result = applyDecisionOutcome({state:base(),taskId:'t1',formData:decisionData(),actor})
    const next = result.state.tasks.find(item => item.type === 'decision')
    expect(next).toMatchObject({parentTaskId:'t1',workflowId:'call:w1',assignee:'Администратор',decisionSubject:'имплантации'})
  })
  it('requires decision date', () => expect(() => applyDecisionOutcome({state:base(),taskId:'t1',formData:decisionData({dueDate:''}),actor})).toThrow(/дат/iu))
  it('requires decision time', () => expect(() => applyDecisionOutcome({state:base(),taskId:'t1',formData:decisionData({dueTime:''}),actor})).toThrow(/врем/iu))
  it('requires decision reason', () => expect(() => applyDecisionOutcome({state:base(),taskId:'t1',formData:decisionData({reasonCode:'',reason:''}),actor})).toThrow(/причин/iu))
  it('rejects past decision schedule', () => expect(() => applyDecisionOutcome({state:base(),taskId:'t1',formData:decisionData({dueDate:'2029-12-31'}),actor})).toThrow(/будущ/iu))
  it('repeated decision submission does not create a duplicate', () => {
    const once = applyDecisionOutcome({state:base(),taskId:'t1',formData:decisionData(),actor}).state
    expect(() => applyDecisionOutcome({state:once,taskId:'t1',formData:decisionData(),actor})).toThrow(/активн/iu)
    expect(once.tasks.filter(item => item.type === 'decision' && item.status === 'active')).toHaveLength(1)
  })
  it('contact later creates call rather than decision', () => {
    const state = base(); const source = state.tasks[0]; const p = state.patients[0]
    createWorkflowTask(state,p,{type:'call',title:'Перезвонить',dueDate:'2030-01-03',dueTime:'12:00',workflowId:source.workflowId,parentTaskId:source.id,sourceEntityId:source.id,idempotencyKey:'later:t1'},actor)
    expect(state.tasks.some(item => item.type === 'decision')).toBe(false)
  })
  it('waitlist workflow is not replaced with decision', () => {
    const state = base({tasks:[],waitlist:[{id:'w1',patientId:'p1',status:'active'}]}); ensureWaitlistTask(state,'w1',actor,{dueDate:'2030-01-03',dueTime:'12:00'})
    expect(state.tasks[0].type).toBe('waitlist'); expect(state.tasks.some(item => item.type === 'decision')).toBe(false)
  })
  it('do not contact creates no decision task', () => {
    const state = base(); finalizePatientAsDoNotContact(state,'p1','Просьба пациента',actor)
    expect(state.tasks.some(item => item.type === 'decision')).toBe(false)
  })
  it('STATUS_OPTIONS does not contain the removed stage', () => {
    const source = readFileSync(new URL('../src/main.js',import.meta.url),'utf8')
    const statusBlock = source.match(/const STATUS_OPTIONS = \[([\s\S]*?)\n\]/)?.[1] || ''
    expect(statusBlock.includes('Думает')).toBe(false)
  })
  it('validator reports an unassigned decision task', () => {
    const state = base({tasks:[task({type:'decision',assignee:'',parentTaskId:'source'})]})
    expect(validateBusinessState(state,{now:NOW}).errors.some(item => item.code === 'decision_without_assignee')).toBe(true)
  })
  it('validator reports a decision task without source relation', () => {
    const state = base({tasks:[task({type:'decision',assignee:'Администратор',parentTaskId:null})]})
    expect(validateBusinessState(state,{now:NOW}).errors.some(item => item.code === 'decision_broken_workflow')).toBe(true)
  })
  it('validator reports duplicate active decisions in one workflow', () => {
    const first = task({id:'d1',type:'decision',assignee:'Администратор',parentTaskId:'t1'})
    const second = task({id:'d2',type:'decision',assignee:'Администратор',parentTaskId:'t1'})
    expect(validateBusinessState(base({tasks:[first,second]}),{now:NOW}).errors.some(item => item.code === 'duplicate_decision')).toBe(true)
  })
  it('validator reports a decision result without its next task', () => {
    const p = patient({history:[{actionType:'decision_not_made',taskId:'t1',createdTaskId:'missing',stageBefore:'🆕 Новый',stageAfter:'🆕 Новый'}]})
    expect(validateBusinessState(base({patients:[p]}),{now:NOW}).errors.some(item => item.code === 'decision_result_without_task')).toBe(true)
  })
  it('validator reports a stage changed by decision outcome', () => {
    const p = patient({history:[{actionType:'decision_not_made',taskId:'t1',createdTaskId:'d1',stageBefore:'🆕 Новый',stageAfter:'🦷 На лечении'}]})
    const d = task({id:'d1',type:'decision',assignee:'Администратор',parentTaskId:'t1'})
    expect(validateBusinessState(base({patients:[p],tasks:[d]}),{now:NOW}).errors.some(item => item.code === 'decision_changed_stage')).toBe(true)
  })
  it('requires decision subject and assignee', () => {
    expect(() => applyDecisionOutcome({state:base(),taskId:'t1',formData:decisionData({subject:''}),actor})).toThrow(/вопрос/iu)
    expect(() => applyDecisionOutcome({state:base(),taskId:'t1',formData:decisionData({assignee:''}),actor})).toThrow(/ответствен/iu)
  })

  it('creates legacy control for non-final patient without work', () => {
    const migrated = migrateBusinessState(base({tasks:[]}),actor).state
    expect(migrated.tasks.some(item => item.type === 'control' && item.idempotencyKey === 'migration-control:p1')).toBe(true)
  })

  it('does not create legacy control for do-not-contact patient', () => {
    const migrated = migrateBusinessState(base({patients:[patient({status:'🚫 Не звонить'})],tasks:[]}),actor).state
    expect(migrated.tasks).toHaveLength(0)
  })
  it('migration closes active work for do-not-contact patient', () => {
    const migrated = migrateBusinessState(base({patients:[patient({status:'🚫 Не звонить'})]}),actor).state
    expect(migrated.tasks[0].status).toBe('cancelled')
  })
  it('migration does not keep booked stage without appointment date', () => {
    const migrated = migrateBusinessState(base({patients:[patient({status:'📅 Записан на приём'})],tasks:[]}),actor).state
    expect(migrated.patients[0].status).toBe('🆕 Новый')
    expect(migrated.tasks.some(item => item.type === 'control')).toBe(true)
  })

  it('validator catches booked patient without date', () => expect(validateBusinessState(base({patients:[patient({status:'📅 Записан на приём'})]}),{now:NOW}).errors.some(item => item.code === 'booked_without_date')).toBe(true))
  it('validator catches orphan task', () => expect(validateBusinessState(base({patients:[]}),{now:NOW}).errors.some(item => item.code === 'orphan_task')).toBe(true))
  it('validator catches active waitlist without task', () => expect(validateBusinessState(base({waitlist:[{id:'w1',patientId:'p1',status:'active'}]}),{now:NOW}).errors.some(item => item.code === 'waitlist_without_task')).toBe(true))
  it('validator catches waitlist task without relation', () => expect(validateBusinessState(base({tasks:[task({type:'waitlist'})]}),{now:NOW}).errors.some(item => item.code === 'broken_waitlist_task')).toBe(true))
  it('validator catches open task status', () => expect(validateBusinessState(base({tasks:[task({status:'open'})]}),{now:NOW}).warnings.some(item => item.code === 'legacy_open_status')).toBe(true))
  it('validator accepts a consistent migrated state without critical errors', () => {
    const migrated = migrateBusinessState(base({tasks:[]}),actor).state
    expect(validateBusinessState(migrated,{now:NOW}).errors).toHaveLength(0)
  })
  it('actual demo data has no critical business errors after migration', () => {
    const migrated = migrateBusinessState(createInitialState(),actor).state
    expect(validateBusinessState(migrated,{now:NOW}).errors).toHaveLength(0)
  })
  it('rejects backup with unsupported schema', () => expect(() => prepareImportedState({version:99,patients:[],tasks:[]},actor)).toThrow(/верс/))
  it('rejects backup with orphan task as critical', () => {
    const prepared = prepareImportedState({version:4,patients:[],tasks:[task()],waitlist:[],audit:[]},actor)
    expect(prepared.critical.some(item => item.code === 'orphan_task')).toBe(true)
  })
})
