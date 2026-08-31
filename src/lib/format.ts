export const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export const numberBR = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 })
export const dateBR = (value?: string | null) => value ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date(value)) : '—'
