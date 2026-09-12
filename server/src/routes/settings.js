import { Router } from "express";
import { getSetting, setSetting } from "../lib/settings.js";

const router = Router();

// GET /api/settings — anyone logged in can read (staff needs to know
// office hours too, even though only admin can edit).
router.get("/", async (req, res) => {
  try {
    const [officeStartTime, officeEndTime, officeLocation] = await Promise.all([
      getSetting("office_start_time"),
      getSetting("office_end_time"),
      getSetting("office_location"),
    ]);
    res.json({
      officeStartTime: officeStartTime || "09:30",
      officeEndTime: officeEndTime || "17:00",
      // FIX #5: no more fake { lat: 0, lng: 0 } fallback here — a
      // genuinely unconfigured office location is now reported as
      // `null`, so the Settings page shows empty fields (it already
      // handles this gracefully via `s.officeLocation?.lat ?? ""`) and
      // check-in gives a clear "not set up yet" message instead of
      // comparing everyone's GPS against a bogus location.
      officeLocation: officeLocation || null,
    });
  } catch (err) {
    console.error("[settings route] GET / error:", err);
    res.json({
      officeStartTime: "09:30",
      officeEndTime: "17:00",
      officeLocation: null,
    });
  }
});

// PUT /api/settings — admin only. Body: any subset of
// { officeStartTime, officeEndTime, officeLocation }
router.put("/", async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ message: "Admin only" });

  const { officeStartTime, officeEndTime, officeLocation } = req.body || {};
  try {
    if (officeStartTime) await setSetting("office_start_time", officeStartTime);
    if (officeEndTime) await setSetting("office_end_time", officeEndTime);
    if (officeLocation) await setSetting("office_location", officeLocation);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;