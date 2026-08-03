'use client'

/**
 * Client data layer for Packaging Studio. TanStack Query keys are namespaced
 * under `['packaging', …]`; mutations invalidate the packet graph because a
 * spec edit, an upload and a generate run all change the same aggregate.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

// ── Types (mirror `src/lib/packaging/serialize.ts`) ─────────────────────────

export interface PackagingComponentType {
  id: string
  code: string | null
  slug: string
  displayName: string
  description: string | null
  printed: boolean
  defaultInCreativeIntent: boolean
  sortOrder: number
  active: boolean
  inUse?: boolean
}

export interface PackagingArtwork {
  id: string
  kind: string
  fileName: string
  storagePath: string
  mimeType: string | null
  byteSize: number | null
  pageCount: number | null
  aiCompatible: boolean | null
  extractedAt: string | null
  downloadUrl: string | null
  createdAt: string
}

export interface PackagingPackStep {
  id: string
  stepNumber: number
  instruction: string
  imagePath: string | null
  imageFileName: string | null
  imageUrl: string | null
}

export interface PackagingComponent {
  id: string
  componentTypeId: string
  slug: string
  code: string | null
  displayName: string
  printed: boolean
  includeInCreativeIntent: boolean
  pageOrder: number
  material: string | null
  printingMethod: string | null
  coatingMsdsRef: string | null
  paperThickness: string | null
  drawingPartNumber: string | null
  approvalStatus: string
  engineerNotes: string | null
  inks: string[]
  finishes: string[]
  structuralPlates: string[]
  printPartNumber: string | null
  platesSyncedAt: string | null
  supplierPdfUrl: string | null
  supplierPdfGeneratedAt: string | null
  supplierPdfError: string | null
  artworks: PackagingArtwork[]
  packSteps: PackagingPackStep[]
}

export interface PackagingProject {
  id: string
  name: string
  slug: string
  productType: string | null
  productFamily: string | null
  supplier: string | null
  internalRef: string | null
  fileLocationUrl: string | null
  packagingDesignerName: string | null
  graphicDesignerName: string | null
  packagingEngineerName: string | null
  notes: string | null
  updatedAt: string
}

export interface PackagingPacketSummary {
  id: string
  stage: string
  variant: string
  skuCode?: string | null
  status: string
  componentCount: number
  updatedAt: string
}

export interface PackagingProjectWithPackets extends PackagingProject {
  packets: PackagingPacketSummary[]
}

export interface PackagingPacket {
  id: string
  projectId: string
  stage: string
  variant: string
  skuCode: string | null
  artworkDate: string | null
  status: string
  creativeIntentPdfUrl: string | null
  creativeIntentPdfGeneratedAt: string | null
  pdfError: string | null
  lastExportedAt: string | null
  updatedAt: string
  project: PackagingProject
  components: PackagingComponent[]
  overview: PackagingArtwork | null
}

export interface ComponentReadiness {
  componentId: string
  displayName: string
  includedInCreativeIntent: boolean
  printed: boolean
  hasArtwork: boolean
  artworkCompatible: boolean
  hasMockup: boolean
  missingSpecs: string[]
  expectsSupplierPdf: boolean
}

export interface PacketReadiness {
  components: ComponentReadiness[]
  hasOverview: boolean
  warnings: string[]
  canGenerate: boolean
}

export interface SupplierPdfOutcome {
  componentId: string
  displayName: string
  status: 'generated' | 'skipped' | 'failed'
  reason?: string
  path?: string
  pageCount?: number
}

export interface GenerateResponse {
  supplierPdfs: SupplierPdfOutcome[]
  creativeIntent: { status: 'generated' | 'failed'; path?: string; reason?: string }
  readiness: PacketReadiness
  packet: PackagingPacket
}

export type ArtworkKind = 'editable_ai' | 'mockup' | 'overview' | 'step_image'

// ── Fetch helper ────────────────────────────────────────────────────────────

/** Throws an Error carrying the envelope's `error`/`message` plus any extras
 *  (e.g. the 409 `wouldLose` list) so callers can branch on them. */
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...init?.headers } : init?.headers,
  })
  const payload = await res.json().catch(() => null)
  if (!res.ok) {
    const message =
      payload?.message ?? payload?.error ?? `Request failed with status ${res.status}`
    const error = new Error(message) as Error & { status?: number; payload?: unknown }
    error.status = res.status
    error.payload = payload
    throw error
  }
  return payload as T
}

export const packagingKeys = {
  componentTypes: (includeInactive = false) =>
    ['packaging', 'component-types', includeInactive] as const,
  projects: () => ['packaging', 'projects'] as const,
  packet: (id: string | null) => ['packaging', 'packet', id] as const,
}

// ── Queries ─────────────────────────────────────────────────────────────────

export function usePackagingComponentTypes(includeInactive = false) {
  return useQuery({
    queryKey: packagingKeys.componentTypes(includeInactive),
    queryFn: () =>
      request<{ componentTypes: PackagingComponentType[] }>(
        `/api/packaging/component-types${includeInactive ? '?includeInactive=true' : ''}`
      ).then((r) => r.componentTypes),
    staleTime: 5 * 60 * 1000, // the catalogue changes rarely
  })
}

export function usePackagingProjects() {
  return useQuery({
    queryKey: packagingKeys.projects(),
    queryFn: () =>
      request<{ projects: PackagingProjectWithPackets[] }>('/api/packaging/projects').then(
        (r) => r.projects
      ),
  })
}

export function usePackagingPacket(packetId: string | null) {
  return useQuery({
    queryKey: packagingKeys.packet(packetId),
    enabled: Boolean(packetId),
    queryFn: () =>
      request<{ packet: PackagingPacket; readiness: PacketReadiness; canWrite: boolean }>(
        `/api/packaging/packets/${packetId}`
      ),
  })
}

// ── Mutations ───────────────────────────────────────────────────────────────

export function useCreatePackagingProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<PackagingProject> & { name: string }) =>
      request<{ project: PackagingProject }>('/api/packaging/projects', {
        method: 'POST',
        body: JSON.stringify(body),
      }).then((r) => r.project),
    onSuccess: () => qc.invalidateQueries({ queryKey: packagingKeys.projects() }),
  })
}

export function useUpdatePackagingProject(projectId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<PackagingProject>) =>
      request<{ project: PackagingProject }>(`/api/packaging/projects/${projectId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }).then((r) => r.project),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: packagingKeys.projects() })
      qc.invalidateQueries({ queryKey: ['packaging', 'packet'] })
    },
  })
}

export function useCreatePackagingPacket() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { projectId: string; stage: string; variant: string; skuCode?: string | null }) =>
      request<{ packet: PackagingPacketSummary & { projectId: string } }>(
        '/api/packaging/packets',
        { method: 'POST', body: JSON.stringify(body) }
      ).then((r) => r.packet),
    onSuccess: () => qc.invalidateQueries({ queryKey: packagingKeys.projects() }),
  })
}

export function useUpdatePackagingPacket(packetId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { skuCode?: string | null; artworkDate?: string | null }) =>
      request<{ packet: PackagingPacket }>(`/api/packaging/packets/${packetId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }).then((r) => r.packet),
    onSuccess: () => qc.invalidateQueries({ queryKey: packagingKeys.packet(packetId) }),
  })
}

export function useSyncPacketComponents(packetId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { componentTypeIds: string[]; force?: boolean }) =>
      request<{ packet: PackagingPacket; added: number; removed: number }>(
        `/api/packaging/packets/${packetId}/components`,
        { method: 'PUT', body: JSON.stringify(body) }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: packagingKeys.packet(packetId) })
      qc.invalidateQueries({ queryKey: packagingKeys.projects() })
    },
  })
}

export function useUpdatePacketComponent(packetId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ componentId, ...body }: { componentId: string } & Record<string, unknown>) =>
      request(`/api/packaging/packets/${packetId}/components/${componentId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: packagingKeys.packet(packetId) }),
  })
}

/**
 * Three-step upload: ask for a signed URL, PUT the bytes straight to Supabase
 * (a 300 MB .ai must never pass through a route handler), then register the
 * file so the server can read plates out of it.
 */
export function useUploadPackagingArtwork(packetId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: {
      file: File
      kind: ArtworkKind
      packetComponentId?: string | null
    }) => {
      const signed = await request<{
        path: string
        token: string
        signedUrl: string
        nameWarnings: string[]
      }>(`/api/packaging/packets/${packetId}/artwork/signed-upload`, {
        method: 'POST',
        body: JSON.stringify({
          kind: args.kind,
          fileName: args.file.name,
          packetComponentId: args.packetComponentId ?? null,
        }),
      })

      const put = await fetch(signed.signedUrl, {
        method: 'PUT',
        body: args.file,
        headers: { 'Content-Type': args.file.type || 'application/octet-stream' },
      })
      if (!put.ok) throw new Error(`Upload to storage failed (${put.status})`)

      const registered = await request<{
        artwork: { id: string; aiCompatible: boolean | null; pageCount: number | null }
        plates: { inks: string[]; finishes: string[]; structural: string[] } | null
        printPartNumber: string | null
        warning: string | null
      }>(`/api/packaging/packets/${packetId}/artwork`, {
        method: 'POST',
        body: JSON.stringify({
          kind: args.kind,
          fileName: args.file.name,
          storagePath: signed.path,
          mimeType: args.file.type || null,
          byteSize: args.file.size,
          packetComponentId: args.packetComponentId ?? null,
        }),
      })

      return { ...registered, nameWarnings: signed.nameWarnings }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: packagingKeys.packet(packetId) }),
  })
}

export function useDeletePackagingArtwork(packetId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (artworkId: string) =>
      request(`/api/packaging/artworks/${artworkId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: packagingKeys.packet(packetId) }),
  })
}

export function useGeneratePacketOutputs(packetId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      request<GenerateResponse>(`/api/packaging/packets/${packetId}/generate`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: packagingKeys.packet(packetId) }),
  })
}

/**
 * Pack-instruction step images are not artwork rows — they belong to a step, so
 * they only need the signed upload; the returned storage path is saved with the
 * step itself via the steps PUT.
 */
export function useUploadStepImage(packetId: string | null) {
  return useMutation({
    mutationFn: async (args: { file: File; packetComponentId: string }) => {
      const signed = await request<{ path: string; signedUrl: string }>(
        `/api/packaging/packets/${packetId}/artwork/signed-upload`,
        {
          method: 'POST',
          body: JSON.stringify({
            kind: 'step_image',
            fileName: args.file.name,
            packetComponentId: args.packetComponentId,
          }),
        }
      )
      const put = await fetch(signed.signedUrl, {
        method: 'PUT',
        body: args.file,
        headers: { 'Content-Type': args.file.type || 'application/octet-stream' },
      })
      if (!put.ok) throw new Error(`Upload to storage failed (${put.status})`)
      return { path: signed.path, fileName: args.file.name }
    },
  })
}

export function useReparseArtwork(packetId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (artworkId: string) =>
      request<{ plates: { inks: string[]; finishes: string[]; structural: string[] } }>(
        `/api/packaging/artworks/${artworkId}/reparse`,
        { method: 'POST' }
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: packagingKeys.packet(packetId) }),
  })
}

export function useUpdatePackSteps(packetId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      componentId,
      steps,
    }: {
      componentId: string
      steps: Array<{ instruction: string; imagePath?: string | null; imageFileName?: string | null }>
    }) =>
      request<{ steps: PackagingPackStep[] }>(
        `/api/packaging/packets/${packetId}/components/${componentId}/steps`,
        { method: 'PUT', body: JSON.stringify({ steps }) }
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: packagingKeys.packet(packetId) }),
  })
}

// ── Workbook round trip ─────────────────────────────────────────────────────

export interface WorkbookDiffEntry {
  componentSlug: string | null
  field: string
  sheetValue: string | null
  dbValue: string | null
  action:
    | 'apply'
    | 'unchanged'
    | 'machine-skip'
    | 'missing-tab-keep'
    | 'add-component'
    | 'unknown-component'
  note?: string
}

export interface WorkbookPreview {
  fileName: string
  target: {
    packetId: string | null
    projectName?: string
    stage?: string
    variant?: string
    wouldCreate?: { projectName: string; stage: string; variant: string } | null
    note: string
  }
  diagnostics: string[]
  diff: {
    changes: WorkbookDiffEntry[]
    counts: Record<string, number>
    newComponentSlugs: string[]
    unknownComponentSlugs: string[]
    untouchedComponentSlugs: string[]
  } | null
  summary: { apply: number; componentsInSheet: number }
}

export interface WorkbookImportResult {
  result: {
    packetId: string
    created: boolean
    appliedFields: number
    addedComponents: string[]
    skippedMachineFields: number
    keptMissingTabs: string[]
    unknownComponents: string[]
  }
  diagnostics: string[]
  packet: PackagingPacket
}

/** Multipart — no JSON Content-Type, the browser sets the boundary. */
async function postForm<T>(url: string, form: FormData): Promise<T> {
  const res = await fetch(url, { method: 'POST', body: form })
  const payload = await res.json().catch(() => null)
  if (!res.ok) {
    const message = payload?.message ?? payload?.error ?? `Request failed (${res.status})`
    const error = new Error(message) as Error & { status?: number; payload?: unknown }
    error.status = res.status
    error.payload = payload
    throw error
  }
  return payload as T
}

export function usePreviewWorkbook() {
  return useMutation({
    mutationFn: ({ file, packetId }: { file: File; packetId?: string | null }) => {
      const form = new FormData()
      form.append('file', file)
      if (packetId) form.append('packetId', packetId)
      return postForm<WorkbookPreview>('/api/packaging/import/preview', form)
    },
  })
}

export function useImportWorkbook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ file, packetId }: { file: File; packetId?: string | null }) => {
      const form = new FormData()
      form.append('file', file)
      if (packetId) form.append('packetId', packetId)
      return postForm<WorkbookImportResult>('/api/packaging/import', form)
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: packagingKeys.projects() })
      qc.invalidateQueries({ queryKey: packagingKeys.packet(data.result.packetId) })
    },
  })
}

export function workbookDownloadUrl(packetId: string): string {
  return `/api/packaging/packets/${packetId}/workbook`
}

// ── Activity ────────────────────────────────────────────────────────────────

export interface PackagingActivityEntry {
  id: string
  action: string
  targetId: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
  user: { id: string; name: string; avatarUrl: string | null }
}

export function usePackagingActivity(packetId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['packaging', 'activity', packetId] as const,
    enabled: Boolean(packetId) && enabled,
    queryFn: () =>
      request<{ activity: PackagingActivityEntry[] }>(
        `/api/packaging/packets/${packetId}/activity`
      ).then((r) => r.activity),
  })
}

// ── Catalogue administration ────────────────────────────────────────────────

export function useCreateComponentType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: {
      slug: string
      displayName: string
      code?: string | null
      description?: string | null
      printed?: boolean
      defaultInCreativeIntent?: boolean
    }) =>
      request<{ componentType: PackagingComponentType }>('/api/packaging/component-types', {
        method: 'POST',
        body: JSON.stringify(body),
      }).then((r) => r.componentType),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['packaging', 'component-types'] }),
  })
}

export function useUpdateComponentType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      request<{ componentType: PackagingComponentType }>(
        `/api/packaging/component-types/${id}`,
        { method: 'PATCH', body: JSON.stringify(body) }
      ).then((r) => r.componentType),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['packaging', 'component-types'] }),
  })
}

export function useRegenerateSupplierPdf(packetId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (componentId: string) =>
      request<{ outcome: SupplierPdfOutcome }>(
        `/api/packaging/packets/${packetId}/components/${componentId}/supplier-pdf`,
        { method: 'POST' }
      ).then((r) => r.outcome),
    onSuccess: () => qc.invalidateQueries({ queryKey: packagingKeys.packet(packetId) }),
  })
}
