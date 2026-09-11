import { Router } from "express";
import { getImageKitAuthParams } from "../lib/imagekit.js";

const router = Router();

// GET /api/imagekit-auth
// Returns a short-lived signature the frontend uses to upload a receipt
// image directly to ImageKit, without the private key ever leaving the
// server.
router.get("/", (req, res) => {
  res.json(getImageKitAuthParams());
});

export default router;
