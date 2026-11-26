import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authenticate } from "../../middleware/authenticate.js";
import { validateBody } from "../../middleware/validate.js";
import { createOrganizationController, loginController, logoutAllController, logoutController, meController, refreshController, registerController } from "./auth.controller.js";
import { createOrganizationSchema, loginSchema, registerSchema } from "./auth.schemas.js";

export const authRouter = Router();
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false, message: { success: false, error: { message: "Too many authentication attempts. Try again later." } } });

authRouter.post("/register", authLimiter, validateBody(registerSchema), registerController);
authRouter.post("/login", authLimiter, validateBody(loginSchema), loginController);
authRouter.post("/refresh", authLimiter, refreshController);
authRouter.post("/logout", logoutController);
authRouter.post("/logout-all", authenticate, logoutAllController);
authRouter.get("/me", authenticate, meController);
authRouter.post("/organizations", authenticate, validateBody(createOrganizationSchema), createOrganizationController);
