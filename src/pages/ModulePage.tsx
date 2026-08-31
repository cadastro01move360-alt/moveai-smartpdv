import { PageHeader, EmptyState } from '../components/UI'

export default function ModulePage({title, description, cta}:{title:string;description:string;cta:string}){
  return <><PageHeader title={title} description={description} action={<button className="primary">{cta}</button>}/><div className="panel"><EmptyState title={`Nenhum registro em ${title.toLowerCase()}`} description="Os dados aparecerão aqui quando forem criados no banco conectado." action={<button className="secondary">{cta}</button>}/></div></>
}
