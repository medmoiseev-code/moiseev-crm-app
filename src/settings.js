export const USER_SETTINGS_VERSION = 1
export const SYSTEM_SETTINGS_KEY = 'crm:systemSettings'

export const THEMES = {
  moiseev: { name: 'Moiseev Default', bg:'#0b0f16', surface:'#131a24', secondary:'#0f151e', border:'#273142', text:'#e7edf7', muted:'#8f9db3', primary:'#6c8cff', hover:'#86a0ff', success:'#46d39a', warning:'#f2b84b', danger:'#ff6673', rowHover:'#172131', selected:'#1b2742' },
  stomx: { name:'STOMX', bg:'#151617', surface:'#1d1f20', secondary:'#242627', border:'#363839', text:'#e5e5e5', muted:'#8e9499', primary:'#c98222', hover:'#de972f', success:'#36725a', warning:'#c98222', danger:'#8c2020', rowHover:'#292b2c', selected:'#33291d' },
  carbon: { name:'Carbon', bg:'#111315', surface:'#1a1d20', secondary:'#22262a', border:'#343a40', text:'#edf0f2', muted:'#98a0a7', primary:'#9aa4ae', hover:'#b5bec6', success:'#4aa17a', warning:'#c9a34a', danger:'#d65c67', rowHover:'#252a2e', selected:'#30363b' },
  midnight: { name:'Midnight', bg:'#080d1a', surface:'#111a2d', secondary:'#172238', border:'#293854', text:'#e7edfa', muted:'#91a0bc', primary:'#547ee8', hover:'#7196f0', success:'#3eaa82', warning:'#d0a748', danger:'#df6270', rowHover:'#182641', selected:'#1e3154' },
  graphite: { name:'Graphite', bg:'#171719', surface:'#222225', secondary:'#29292d', border:'#3b3b41', text:'#ececef', muted:'#a0a0a8', primary:'#7f8491', hover:'#999eaa', success:'#4c9874', warning:'#bd984b', danger:'#c95864', rowHover:'#2e2e33', selected:'#383840' },
  forest: { name:'Forest', bg:'#0c1512', surface:'#14211c', secondary:'#1a2a23', border:'#294137', text:'#e4eee9', muted:'#91a69c', primary:'#3f9871', hover:'#55af87', success:'#54b88b', warning:'#c5a04a', danger:'#d05b65', rowHover:'#1d3028', selected:'#214032' },
  slate: { name:'Slate', bg:'#11161d', surface:'#19212b', secondary:'#202a36', border:'#334151', text:'#e6ebf1', muted:'#94a1b1', primary:'#6687ad', hover:'#7f9cbd', success:'#4ba17d', warning:'#c7a24d', danger:'#d45e69', rowHover:'#24303e', selected:'#293b50' },
  ivory: { name:'Ivory', bg:'#eeeae1', surface:'#fffdf8', secondary:'#f6f1e8', border:'#d7d0c4', text:'#302e2a', muted:'#777168', primary:'#76634e', hover:'#8e765c', success:'#3f8065', warning:'#a77825', danger:'#b44850', rowHover:'#f3eee5', selected:'#e7ddcf' },
  arctic: { name:'Arctic', bg:'#edf3f7', surface:'#ffffff', secondary:'#f3f7fa', border:'#ccd9e2', text:'#263541', muted:'#718493', primary:'#3e7fa8', hover:'#5595bc', success:'#37866c', warning:'#a8792d', danger:'#b94e5b', rowHover:'#edf5fa', selected:'#dcecf5' },
  ocean: { name:'Ocean', bg:'#07171d', surface:'#0d252e', secondary:'#12313c', border:'#22505e', text:'#e2f0f3', muted:'#88a8b1', primary:'#2489a4', hover:'#35a2bd', success:'#3aa17e', warning:'#c69c43', danger:'#d35c68', rowHover:'#123642', selected:'#164352' },
}

export const defaultUserSettings = () => ({
  version: USER_SETTINGS_VERSION,
  appearance: { theme:'moiseev', scale:100, fontSize:'standard', density:'standard', radius:'medium', shadows:'standard', animations:'full', icons:true, tooltips:true },
  table: { rowHeight:58, stickyHeader:true, hover:true, verticalBorders:false, horizontalBorders:true, striped:false, rowNumbers:false, rememberWidths:true, rememberOrder:true, rememberSort:true, rememberFilters:false, hiddenColumns:[] },
  tasks: { confirmCompletion:true, confirmDeletion:true, autoOpenNext:false, showCompleted:true, overdueFirst:true, sortByDateTime:true, showComment:true, showAuthor:true, showTransferTime:true },
  notifications: { toast:true, sound:false, newTask:false, overdue:true, before15:false, before30:false, unfinishedShift:true, counters:true, volume:'standard' },
  calendar: { firstDay:'monday', dateFormat:'long', timeFormat:'24', timeStep:15, weekends:true, highlightToday:true },
})

export const defaultSystemSettings = () => ({ version:1, clinicName:'Moiseev Admin', logo:'M', brandColor:'#6c8cff', workStart:'09:00', workEnd:'18:00', workDays:[1,2,3,4,5], holidays:[], taskTypes:[], patientStatuses:[], commentTemplates:[], taskTemplates:[], transferReasons:[], rolePermissions:{ admin:['patients','tasks','worktime'], manager:['all'] }, defaultTheme:'moiseev' })

function merge(base, saved) {
  const output = { ...base, ...(saved || {}) }
  for (const key of Object.keys(base)) if (base[key] && typeof base[key] === 'object' && !Array.isArray(base[key])) output[key] = { ...base[key], ...(saved?.[key] || {}) }
  return output
}

export function loadUserSettings(userId) {
  try {
    const saved = JSON.parse(localStorage.getItem(`crm:userSettings:${userId}`) || 'null')
    const settings = merge(defaultUserSettings(), saved)
    if (!saved) settings.appearance.theme = loadSystemSettings().defaultTheme || 'moiseev'
    return settings
  } catch { return defaultUserSettings() }
}
export function saveUserSettings(userId, settings) { localStorage.setItem(`crm:userSettings:${userId}`, JSON.stringify({ ...settings, version:USER_SETTINGS_VERSION })) }
export function loadSystemSettings() { try { return merge(defaultSystemSettings(), JSON.parse(localStorage.getItem(SYSTEM_SETTINGS_KEY) || 'null')) } catch { return defaultSystemSettings() } }
export function saveSystemSettings(settings) { localStorage.setItem(SYSTEM_SETTINGS_KEY, JSON.stringify({ ...settings, version:1 })) }

export function applyUserSettings(settings) {
  const theme = THEMES[settings?.appearance?.theme] || THEMES.moiseev
  const root = document.documentElement
  const vars = { '--color-bg':theme.bg, '--color-surface':theme.surface, '--color-surface-secondary':theme.secondary, '--color-border':theme.border, '--color-text':theme.text, '--color-text-muted':theme.muted, '--color-primary':theme.primary, '--color-primary-hover':theme.hover, '--color-success':theme.success, '--color-warning':theme.warning, '--color-danger':theme.danger, '--color-row-hover':theme.rowHover, '--color-row-selected':theme.selected, '--blue':theme.primary, '--blue-soft':theme.selected, '--line':theme.border, '--muted':theme.muted, '--text':theme.text, '--panel':theme.surface, '--green':theme.success, '--danger':theme.danger }
  Object.entries(vars).forEach(([key,value]) => root.style.setProperty(key,value))
  root.style.setProperty('--ui-scale', String((settings.appearance.scale || 100) / 100))
  root.style.setProperty('--ui-radius', settings.appearance.radius === 'minimal' ? '4px' : settings.appearance.radius === 'large' ? '16px' : '9px')
  root.style.setProperty('--ui-shadow', settings.appearance.shadows === 'none' ? 'none' : settings.appearance.shadows === 'light' ? '0 5px 18px rgba(0,0,0,.16)' : '0 14px 40px rgba(0,0,0,.30)')
  document.body.dataset.theme = Object.keys(THEMES).find(key => THEMES[key] === theme) || 'moiseev'
  document.body.dataset.density = settings.appearance.density
  document.body.dataset.fontSize = settings.appearance.fontSize
  document.body.dataset.animations = settings.appearance.animations
  document.body.classList.toggle('hide-button-icons', !settings.appearance.icons)
  document.body.classList.toggle('disable-tooltips', !settings.appearance.tooltips)
  Object.entries(settings.table || {}).forEach(([key,value]) => { if (typeof value === 'boolean') document.body.classList.toggle(`table-${key}`, value) })
  root.style.setProperty('--patient-row-height', `${settings.table.rowHeight || 58}px`)
}
