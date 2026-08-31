import type { ReactNode } from 'react'

export function PageHeader({title, description, action}:{title:string;description:string;action?:ReactNode}) {
  return <div className="page-header"><div><h2>{title}</h2><p>{description}</p></div>{action}</div>
}

export function EmptyState({title, description, action}:{title:string;description:string;action?:ReactNode}) {
  return <div className="empty"><div className="empty-icon">＋</div><h3>{title}</h3><p>{description}</p>{action}</div>
}

export function StatCard({label, value, helper}:{label:string;value:string;helper?:string}) {
  return <div className="stat-card"><span>{label}</span><strong>{value}</strong>{helper && <small>{helper}</small>}</div>
}

export function Badge({children, tone='neutral'}:{children:ReactNode;tone?:'neutral'|'success'|'warning'|'danger'}) {
  return <span className={`badge ${tone}`}>{children}</span>
}
