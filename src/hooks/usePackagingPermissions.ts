'use client'

import { useProfile } from './useProfile'

/**
 * Packaging write access: admins always, otherwise the `packagingAccess` flag
 * granted from user management. Reads stay open to every authenticated
 * profile — externals need the project page and its file link.
 *
 * Role-scoped field permissions (graphic designer vs. engineer editing
 * different fields) are deliberately not modelled yet: "at the beginning,
 * everything — each one knows what they need to fill."
 */
export function usePackagingPermissions() {
  const { data: profile, isLoading } = useProfile()
  const isAdmin = profile?.role === 'admin'
  const canWrite = Boolean(isAdmin || profile?.packagingAccess)
  return { canWrite, isAdmin, isLoading }
}
