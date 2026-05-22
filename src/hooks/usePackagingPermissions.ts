'use client'

import { useProfile } from '@/hooks/useProfile'

export function usePackagingPermissions() {
  const { data: profile, isLoading } = useProfile()
  const isAdmin = profile?.role === 'admin'
  const packagingAccess = (profile as { packagingAccess?: boolean } | undefined)?.packagingAccess === true
  const packagingEngineerRole =
    (profile as { packagingEngineerRole?: boolean } | undefined)?.packagingEngineerRole === true

  return {
    isLoading,
    canRead: !!profile,
    canWrite: isAdmin || packagingAccess,
    canManageMaterials: isAdmin || packagingEngineerRole,
    isAdmin,
  }
}
