import {
  useCallback,
  useEffect,
  useState,
} from "react"
import { supabase } from "./supabase"

export function usePlatformAdmin() {
  const [loading, setLoading] = useState(true)
  const [isPlatformAdmin, setIsPlatformAdmin] =
    useState(false)

  const refresh = useCallback(async () => {
    if (!supabase) {
      setLoading(false)
      return
    }

    const { data: auth } =
      await supabase.auth.getUser()

    if (!auth.user) {
      setIsPlatformAdmin(false)
      setLoading(false)
      return
    }

    const { data, error } = await supabase.rpc(
      "is_platform_admin",
    )

    setIsPlatformAdmin(
      !error && data === true,
    )
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    loading,
    isPlatformAdmin,
    refresh,
  }
}
