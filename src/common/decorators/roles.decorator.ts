import { SetMetadata } from '@nestjs/common';
import { AdminRole } from '@prisma/client';

export const ROLES_KEY = 'admin_roles';

/** Minimum admin role required (VIEWER < EDITOR < ADMIN). */
export const Roles = (...roles: AdminRole[]) => SetMetadata(ROLES_KEY, roles);
