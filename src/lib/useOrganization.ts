import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

export type Organization = { id: string; name: string }
export type Membership = { organization_id: string; user_id: string; role: string }
export type Unit = { id: string; name: string; symbol: string; dimension: string }
export type StockLocation = { id: string; name: string }

export function useOrganization() {
  const [loading, setLoading] = useState(true)
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [membership, setMembership] = useState<Membership | null>(null)
  const [units, setUnits] = useState<Unit[]>([])
  const [locations, setLocations] = useState<StockLocation[]>([])
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    if (!supabase) { setLoading(false); return }
    setLoading(true)
    setError('')

    const { data: auth } = await supabase.auth.getUser()
    const user = auth.user
    if (!user) { setLoading(false); return }

    const { data: memberData, error: memberError } = await supabase
      .from('organization_members')
      .select('organization_id,user_id,role')
      .eq('user_id', user.id)
      .eq('active', true)
      .limit(1)
      .maybeSingle()

    if (memberError) {
      setError(memberError.message)
      setLoading(false)
      return
    }

    if (!memberData) {
      setOrganization(null)
      setMembership(null)
      setUnits([])
      setLocations([])
      setLoading(false)
      return
    }

    const orgId = memberData.organization_id
    const [orgResult, unitResult, locationResult] = await Promise.all([
      supabase.from('organizations').select('id,name').eq('id', orgId).single(),
      supabase.from('units').select('id,name,symbol,dimension').eq('organization_id', orgId).eq('active', true).order('name'),
      supabase.from('stock_locations').select('id,name').eq('organization_id', orgId).eq('active', true).order('name'),
    ])

    if (orgResult.error) setError(orgResult.error.message)
    setOrganization(orgResult.data ?? null)
    setMembership(memberData)
    setUnits(unitResult.data ?? [])
    setLocations(locationResult.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  async function bootstrap(name: string) {
    if (!supabase) return { error: 'Supabase não configurado.' }
    const clean = name.trim()
    if (!clean) return { error: 'Informe o nome da empresa.' }
    const { error: rpcError } = await supabase.rpc('bootstrap_organization', { p_name: clean })
    if (rpcError) return { error: rpcError.message }
    await refresh()
    return { error: '' }
  }

  return { loading, organization, membership, units, locations, error, refresh, bootstrap }
}
