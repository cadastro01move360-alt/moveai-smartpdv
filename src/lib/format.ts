export const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export const numberBR = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 })

export const dateBR = (value?: string | null) => {
  if (!value) return '—'
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-')
    return `${day}/${month}/${year}`
  }
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date(value))
}
