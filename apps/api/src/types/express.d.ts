import type { OrganizationRole } from "../models/membership.model.js";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        organizationId: string;
        membershipId: string;
        sessionFamilyId: string;
        role: OrganizationRole;
      };
    }
  }
}

export {};
