export const QA_MODE = new URLSearchParams(globalThis.location?.search || '').get('qa') === '1'
export const storageKey = key => QA_MODE ? `axio_qa_${key}` : key
