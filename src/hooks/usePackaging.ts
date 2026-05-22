'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export interface PackagingArtwork {
  id: string
  kind: string
  caption: string | null
  fileName: string
  storagePath: string
  mimeType: string | null
  extractedPlates: {
    inks?: string[]
    finishes?: string[]
    dielines?: string[]
  } | null
  mismatchedMaterialIds: string[]
  extractedAt: string | null
}

export interface PackagingComponent {
  id: string
  slug: string
  displayName: string
  style: string
  pageOrder: number
  included: boolean
  specs: Record<string, string>
  packingSteps: Array<{ step?: string; instruction: string; fileName?: string }>
  supplierPdfUrl: string | null
  artworks: PackagingArtwork[]
}

export interface PackagingPacket {
  id: string
  name: string
  stage: string
  variant: string | null
  status: string
  projectInfo: Record<string, string> | null
  creativeIntentPdfUrl: string | null
  documentDraft: unknown
  project: { id: string; displayName: string; productSlug: string }
  components: PackagingComponent[]
  createdAt: string
  updatedAt: string
}

export interface PackagingMaterial {
  id: string
  kind: string
  code: string
  name: string
  description: string | null
  approvalStatus: string
  attributes: Record<string, unknown>
}

const keys = {
  packets: ['packaging', 'packets'] as const,
  packet: (id: string) => ['packaging', 'packet', id] as const,
  materials: ['packaging', 'materials'] as const,
  projects: ['packaging', 'projects'] as const,
}

export function usePackagingPackets() {
  return useQuery({
    queryKey: keys.packets,
    queryFn: async () => {
      const res = await fetch('/api/packaging/packets')
      if (!res.ok) throw new Error('Failed to load packets')
      const data = await res.json()
      return data.packets as PackagingPacket[]
    },
  })
}

export function usePackagingPacket(packetId: string | null) {
  return useQuery({
    queryKey: keys.packet(packetId ?? ''),
    queryFn: async () => {
      const res = await fetch(`/api/packaging/packets/${packetId}`)
      if (!res.ok) throw new Error('Failed to load packet')
      const data = await res.json()
      return data.packet as PackagingPacket
    },
    enabled: !!packetId,
  })
}

export function usePackagingMaterials() {
  return useQuery({
    queryKey: keys.materials,
    queryFn: async () => {
      const res = await fetch('/api/packaging/materials')
      if (!res.ok) throw new Error('Failed to load materials')
      const data = await res.json()
      return data.materials as PackagingMaterial[]
    },
  })
}

export function useImportPackagingWorkbook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await fetch('/api/packaging/import', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || data.message || 'Import failed')
      return data as { packet: PackagingPacket }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.packets })
    },
  })
}

export function useUploadPackagingArtwork(packetId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: {
      componentSlug: string
      kind: string
      file: File
    }) => {
      const signRes = await fetch(`/api/packaging/packets/${packetId}/artwork/signed-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          componentSlug: args.componentSlug,
          kind: args.kind,
          fileName: args.file.name,
        }),
      })
      const signData = await signRes.json()
      if (!signRes.ok) throw new Error(signData.error || 'Signed upload failed')

      const uploadRes = await fetch(signData.signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': args.file.type || 'application/octet-stream' },
        body: args.file,
      })
      if (!uploadRes.ok) throw new Error('Direct upload failed')

      const regRes = await fetch(`/api/packaging/packets/${packetId}/artwork`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          componentSlug: args.componentSlug,
          kind: args.kind,
          storagePath: signData.storagePath,
          fileName: args.file.name,
          mimeType: args.file.type,
          byteSize: args.file.size,
        }),
      })
      const regData = await regRes.json()
      if (!regRes.ok) throw new Error(regData.error || 'Register artwork failed')
      return regData
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.packet(packetId) })
    },
  })
}

export function useGenerateSupplierPdf() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (componentId: string) => {
      const res = await fetch(`/api/packaging/components/${componentId}/supplier-pdf`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || data.error || 'Supplier PDF failed')
      return data
    },
    onSuccess: (data) => {
      if (data.packet?.id) qc.invalidateQueries({ queryKey: keys.packet(data.packet.id) })
    },
  })
}

export function useGenerateCreativeIntentPdf() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (packetId: string) => {
      const res = await fetch(`/api/packaging/packets/${packetId}/creative-intent-pdf`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || data.error || 'Creative Intent PDF failed')
      return data
    },
    onSuccess: (_data, packetId) => {
      qc.invalidateQueries({ queryKey: keys.packet(packetId) })
      qc.invalidateQueries({ queryKey: keys.packets })
    },
  })
}

export function useUpdateComponentSpecs(packetId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { componentId: string; specs: Record<string, string> }) => {
      const res = await fetch(`/api/packaging/components/${args.componentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specs: args.specs }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Update failed')
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.packet(packetId) }),
  })
}

export function useCreatePackagingMaterial() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: {
      kind: string
      code: string
      name: string
      description?: string
      attributes?: Record<string, unknown>
    }) => {
      const res = await fetch('/api/packaging/materials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Create failed')
      return data.material as PackagingMaterial
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.materials }),
  })
}
