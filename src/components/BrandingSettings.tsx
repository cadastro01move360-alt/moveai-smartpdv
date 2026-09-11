import {
  useEffect,
  useState,
  type FormEvent,
} from "react"
import { useBranding } from "../lib/useBranding"
import {
  ErrorBanner,
  Field,
  FormActions,
} from "./OperationalUI"

export function BrandingSettings({
  organizationId,
  isAdmin,
}: {
  organizationId: string
  isAdmin: boolean
}) {
  const brand = useBranding(organizationId)

  const [displayName, setDisplayName] =
    useState("")
  const [primary, setPrimary] =
    useState("#C90D23")
  const [secondary, setSecondary] =
    useState("#17181D")
  const [accent, setAccent] =
    useState("#E21B36")
  const [sidebar, setSidebar] =
    useState("#15161A")
  const [poweredBy, setPoweredBy] =
    useState(true)
  const [saving, setSaving] =
    useState(false)
  const [uploading, setUploading] =
    useState("")
  const [error, setError] =
    useState("")
  const [success, setSuccess] =
    useState("")

  useEffect(() => {
    setDisplayName(
      brand.branding.display_name || "",
    )
    setPrimary(brand.branding.primary_color)
    setSecondary(
      brand.branding.secondary_color,
    )
    setAccent(brand.branding.accent_color)
    setSidebar(brand.branding.sidebar_color)
    setPoweredBy(
      brand.branding.show_powered_by,
    )
  }, [brand.branding])

  async function saveBranding(
    event: FormEvent,
  ) {
    event.preventDefault()

    if (!isAdmin) return

    setSaving(true)
    setError("")
    setSuccess("")

    const result = await brand.save({
      display_name: displayName,
      primary_color: primary,
      secondary_color: secondary,
      accent_color: accent,
      sidebar_color: sidebar,
      show_powered_by: poweredBy,
    })

    if (result.error) {
      setError(result.error)
    } else {
      setSuccess(
        "Identidade visual atualizada.",
      )
    }

    setSaving(false)
  }

  async function upload(
    kind: "logo" | "banner",
    file?: File,
  ) {
    if (!file || !isAdmin) return

    if (file.size > 5 * 1024 * 1024) {
      setError(
        "A imagem deve ter no máximo 5 MB.",
      )
      return
    }

    setUploading(kind)
    setError("")
    setSuccess("")

    const result =
      await brand.uploadAsset(kind, file)

    if (result.error) {
      setError(result.error)
      setUploading("")
      return
    }

    const saveResult = await brand.save(
      kind === "logo"
        ? { logo_url: result.url }
        : { banner_url: result.url },
    )

    if (saveResult.error) {
      setError(saveResult.error)
    } else {
      setSuccess(
        kind === "logo"
          ? "Logotipo atualizado."
          : "Banner atualizado.",
      )
    }

    setUploading("")
  }

  const previewStyle = {
    backgroundImage: brand.branding.banner_url
      ? `url("${brand.branding.banner_url}")`
      : "linear-gradient(120deg, #17181D, #401018)",
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Identidade visual</h3>
        <p>
          Personalize marca, banner e esquema de cores.
        </p>
      </div>

      <ErrorBanner
        message={error || brand.error}
      />

      {success && (
        <div
          style={{
            padding: 10,
            marginBottom: 12,
          }}
        >
          <strong>{success}</strong>
        </div>
      )}

      <div
        className="branding-preview"
        style={previewStyle}
      >
        <div className="branding-preview-content">
          <img
            className="branding-preview-logo"
            src={
              brand.branding.logo_url ||
              "/move360-logo.png"
            }
            alt="Logo"
          />

          <div>
            <strong>
              {displayName ||
                "Nome da sua empresa"}
            </strong>
            <div>
              Prévia da identidade do sistema
            </div>
          </div>
        </div>
      </div>

      <form
        onSubmit={saveBranding}
        style={{ marginTop: 16 }}
      >
        <Field
          label="Nome exibido no sistema"
          hint="Pode ser diferente da razão social."
        >
          <input
            value={displayName}
            onChange={(event) =>
              setDisplayName(event.target.value)
            }
            disabled={!isAdmin}
            placeholder="Ex.: Minha Confeitaria"
          />
        </Field>

        <Field
          label="Logotipo"
          hint="PNG, JPG, WEBP ou SVG. Até 5 MB."
        >
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            disabled={
              !isAdmin ||
              uploading === "logo"
            }
            onChange={(event) =>
              void upload(
                "logo",
                event.target.files?.[0],
              )
            }
          />
        </Field>

        <Field
          label="Banner"
          hint="Usado na capa da Visão Geral."
        >
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={
              !isAdmin ||
              uploading === "banner"
            }
            onChange={(event) =>
              void upload(
                "banner",
                event.target.files?.[0],
              )
            }
          />
        </Field>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(2, minmax(0, 1fr))",
            gap: 12,
          }}
        >
          <Field label="Cor principal">
            <input
              type="color"
              value={primary}
              disabled={!isAdmin}
              onChange={(event) =>
                setPrimary(event.target.value)
              }
            />
          </Field>

          <Field label="Cor secundária">
            <input
              type="color"
              value={secondary}
              disabled={!isAdmin}
              onChange={(event) =>
                setSecondary(
                  event.target.value,
                )
              }
            />
          </Field>

          <Field label="Cor de destaque">
            <input
              type="color"
              value={accent}
              disabled={!isAdmin}
              onChange={(event) =>
                setAccent(event.target.value)
              }
            />
          </Field>

          <Field label="Cor do menu lateral">
            <input
              type="color"
              value={sidebar}
              disabled={!isAdmin}
              onChange={(event) =>
                setSidebar(event.target.value)
              }
            />
          </Field>
        </div>

        <label
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            marginTop: 12,
          }}
        >
          <input
            type="checkbox"
            checked={poweredBy}
            disabled={!isAdmin}
            onChange={(event) =>
              setPoweredBy(
                event.target.checked,
              )
            }
          />
          Exibir “by Move360”
        </label>

        <FormActions>
          <button
            className="primary"
            type="submit"
            disabled={!isAdmin || saving}
          >
            {saving
              ? "Salvando..."
              : "Salvar identidade visual"}
          </button>
        </FormActions>
      </form>
    </div>
  )
}
