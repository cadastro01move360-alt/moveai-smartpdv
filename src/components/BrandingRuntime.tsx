import { useEffect } from "react"
import type { OrganizationBranding } from "../lib/useBranding"
import "./branding.css"

function safeColor(
  value: string,
  fallback: string,
) {
  return /^#[0-9A-Fa-f]{6}$/.test(value)
    ? value
    : fallback
}

export function BrandingRuntime({
  branding,
}: {
  branding: OrganizationBranding
}) {
  useEffect(() => {
    const root = document.documentElement

    root.style.setProperty(
      "--brand-primary",
      safeColor(
        branding.primary_color,
        "#C90D23",
      ),
    )

    root.style.setProperty(
      "--brand-secondary",
      safeColor(
        branding.secondary_color,
        "#17181D",
      ),
    )

    root.style.setProperty(
      "--brand-accent",
      safeColor(
        branding.accent_color,
        "#E21B36",
      ),
    )

    root.style.setProperty(
      "--brand-sidebar",
      safeColor(
        branding.sidebar_color,
        "#15161A",
      ),
    )

    const banner =
      branding.banner_url
        ? `url("${branding.banner_url.replace(/"/g, '\\"')}")`
        : "none"

    root.style.setProperty(
      "--brand-banner-image",
      banner,
    )
  }, [branding])

  return null
}
