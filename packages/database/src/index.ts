// Japan ERP Database Package
// Prisma client with multi-tenant support

import { PrismaClient } from '@prisma/client';

// Create a global Prisma client instance
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' 
      ? ['query', 'error', 'warn'] 
      : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Helper to execute queries in a tenant's schema
export async function withTenantSchema<T>(
  tenantId: string,
  callback: (client: PrismaClient) => Promise<T>
): Promise<T> {
  // Set the search_path for this tenant
  await prisma.$executeRawUnsafe(`SET search_path TO "tenant_${tenantId}", "public"`);
  
  try {
    return await callback(prisma);
  } finally {
    // Reset to public schema
    await prisma.$executeRawUnsafe(`SET search_path TO "public"`);
  }
}

// Create a new tenant schema
export async function createTenantSchema(tenantId: string): Promise<void> {
  const schemaName = `tenant_${tenantId}`;
  
  // Create schema
  await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
  
  // Clone tables from tenant template
  // This would be handled by migrations in production
  console.log(`Created tenant schema: ${schemaName}`);
}

// Delete a tenant schema (use with caution!)
export async function deleteTenantSchema(tenantId: string): Promise<void> {
  const schemaName = `tenant_${tenantId}`;
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  console.log(`Deleted tenant schema: ${schemaName}`);
}

// Re-export Prisma types
export * from '@prisma/client';
export { prisma as db };

