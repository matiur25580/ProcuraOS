import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authenticate } from "../../middleware/authenticate.js";
import { requireTrustedOrigin } from "../../middleware/require-trusted-origin.js";
import { validateBody } from "../../middleware/validate.js";
import { createOrganizationController, listOrganizationsController, loginController, logoutAllController, logoutController, meController, refreshController, registerController, switchOrganizationController, updateProfileController, listSessionsController, revokeSessionController, verifyEmailController, forgotPasswordController, resetPasswordController, setupMfaController, enableMfaController, disableMfaController } from "./auth.controller.js";
import { createOrganizationSchema, loginSchema, registerSchema, switchOrganizationSchema, updateProfileSchema, verifyEmailSchema, forgotPasswordSchema, resetPasswordSchema, mfaEnableSchema, mfaDisableSchema } from "./auth.schemas.js";

export const authRouter = Router();
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false,
  message: { success: false, error: { message: "Too many authentication attempts. Try again later." } },
});

authRouter.post("/verify-email", authLimiter, requireTrustedOrigin, validateBody(verifyEmailSchema), verifyEmailController);
authRouter.post("/forgot-password", authLimiter, requireTrustedOrigin, validateBody(forgotPasswordSchema), forgotPasswordController);
authRouter.post("/reset-password", authLimiter, requireTrustedOrigin, validateBody(resetPasswordSchema), resetPasswordController);
authRouter.post("/register", authLimiter, requireTrustedOrigin, validateBody(registerSchema), registerController);
authRouter.post("/login", authLimiter, requireTrustedOrigin, validateBody(loginSchema), loginController);
authRouter.post("/refresh", authLimiter, requireTrustedOrigin, refreshController);
authRouter.post("/logout", requireTrustedOrigin, logoutController);
authRouter.post("/logout-all", authenticate, logoutAllController);
authRouter.get("/me", authenticate, meController);
authRouter.patch("/me", authenticate, validateBody(updateProfileSchema), updateProfileController);
authRouter.get("/sessions", authenticate, listSessionsController);
authRouter.delete("/sessions/:sessionId", authenticate, revokeSessionController);
authRouter.get("/organizations", authenticate, listOrganizationsController);
authRouter.post("/organizations", authenticate, validateBody(createOrganizationSchema), createOrganizationController);
authRouter.post("/switch-organization", authenticate, validateBody(switchOrganizationSchema), switchOrganizationController);

authRouter.post("/mfa/setup", authenticate, setupMfaController);
authRouter.post("/mfa/enable", authenticate, validateBody(mfaEnableSchema), enableMfaController);
authRouter.post("/mfa/disable", authenticate, validateBody(mfaDisableSchema), disableMfaController);
