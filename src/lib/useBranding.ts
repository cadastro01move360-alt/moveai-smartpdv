import {
  useCallback,
  useEffect,
  useState,
} from "react"
import { supabase } from "./supabase"

export type OrganizationBranding = {
  organization_id: string | null
  display_name: string
  logo_url: string
  banner_url: string
  primary_color: string
  secondary_color: string
  accent_color: string
  sidebar_color: string
  show_powered_by: boolean
}

export const defaultBranding: OrganizationBranding = {
  organization_id: null,
  display_name: "",
  logo_url: "",
  banner_url: "",
  primary_color: "#C90D23",
  secondary_color: "#17181D",
  accent_color: "#E21B36",
  sidebar_color: "#15161A",
  show_powered_by: true,
}

export function useBranding(
  organizationId?: string | null,
) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [branding, setBranding] =
    useState<OrganizationBranding>(defaultBranding)

  const refresh = useCallback(async () => {
    if (!supabase || !organizationId) {
      setBranding(defaultBranding)
      setLoading(false)
      return
    }

    setLoading(true)
    setError("")

    const { data, error: queryError } = await supabase
      .from("organization_branding")
      .select(
        "organization_id,display_name,logo_url,banner_url,primary_color,secondary_color,accent_color,sidebar_color,show_powered_by",
      )
      .eq("organization_id", organizationId)
      .maybeSingle()

    if (queryError) {
      setError(queryError.message)
      setLoading(false)
      return
    }

    setBranding({
      ...defaultBranding,
      ...(data || {}),
      organization_id: organizationId,
    })

    setLoading(false)
  }, [organizationId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function save(
    patch: Partial<OrganizationBranding>,
  ) {
    if (!supabase || !organizationId) {
      return {
        error: "Organização não identificada.",
      }
    }

    const next = {
      ...branding,
      ...patch,
      organization_id: organizationId,
    }

    const { error: saveError } = await supabase
      .from("organization_branding")
      .upsert(
        {
          organization_id: organizationId,
          display_name:
            next.display_name.trim() || null,
          logo_url: next.logo_url || null,
          banner_url: next.banner_url || null,
          primary_color: next.primary_color,
          secondary_color: next.secondary_color,
          accent_color: next.accent_color,
          sidebar_color: next.sidebar_color,
          show_powered_by: next.show_powered_by,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "organization_id",
        },
      )

    if (saveError) {
      return { error: saveError.message }
    }

    setBranding(next)
    return { error: "" }
  }

  async function uploadAsset(
    kind: "logo" | "banner",
    file: File,
  ) {
    if (!supabase || !organizationId) {
      return {
        url: "",
        error: "Organização não identificada.",
      }
    }

    const ext =
      file.name.split(".").pop()?.toLowerCase() ||
      "png"

    const path =
      `${organizationId}/${kind}-${Date.now()}.${ext}`

    const { error: uploadError } =
      await supabase.storage
        .from("branding")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
        })

    if (uploadError) {
      return {
        url: "",
        error: uploadError.message,
      }
    }

    const { data } = supabase.storage
      .from("branding")
      .getPublicUrl(path)

    return {
      url: data.publicUrl,
      error: "",
    }
  }

  return {
    loading,
    error,
    branding,
    setBranding,
    refresh,
    save,
    uploadAsset,
  }
}
