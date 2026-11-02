/**
 * Legacy compatibility shim.
 *
 * Hub-Mind previously seeded example tasks/documents/projects/clients whenever a
 * collection was empty. That is unsafe in a real workspace: an empty query can
 * be caused by permissions, an offline/cache state, a newly created workspace,
 * or a temporary connection problem. Seeding in that situation can create fake
 * business records and make deleted records appear to return.
 *
 * Production data must be created explicitly by the user/admin flows.
 */
export async function checkAndSeedWorkspaceData(_userId: string, _userEmail: string): Promise<void> {
  return;
}
