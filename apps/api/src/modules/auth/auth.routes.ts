import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authenticate } from "../../middleware/authenticate.js";
import { validateBody } from "../../middleware/validate.js";
import { createOrganizationController, listOrganizationsController, loginController, logoutAllController, logoutController, meController, refreshController, registerController, switchOrganizationController, updateProfileController, listSessionsController, revokeSessionController } from "./auth.controller.js";
import { createOrganizationSchema, loginSchema, registerSchema, switchOrganizationSchema, updateProfileSchema } from "./auth.schemas.js";

export const authRouter = Router();
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false,
  message: { success: false, error: { message: "Too many authentication attempts. Try again later." } },
});

authRouter.post("/register", authLimiter, validateBody(registerSchema), registerController);
authRouter.post("/login", authLimiter, validateBody(loginSchema), loginController);
authRouter.post("/refresh", authLimiter, refreshController);
authRouter.post("/logout", logoutController);
authRouter.post("/logout-all", authenticate, logoutAllController);
authRouter.get("/me", authenticate, meController);
authRouter.patch("/me", authenticate, validateBody(updateProfileSchema), updateProfileController);
authRouter.get("/sessions", authenticate, listSessionsController);
authRouter.delete("/sessions/:sessionId", authenticate, revokeSessionController);
authRouter.get("/organizations", authenticate, listOrganizationsController);
authRouter.post("/organizations", authenticate, validateBody(createOrganizationSchema), createOrganizationController);
authRouter.post("/switch-organization", authenticate, validateBody(switchOrganizationSchema), switchOrganizationController);
