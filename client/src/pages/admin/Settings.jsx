import React, { useEffect, useState } from "react";
import { Clock, MapPin, Save } from "lucide-react";
import { getSettings, updateSettings } from "../../lib/api.js";
import toast from "react-hot-toast";

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [officeStartTime, setOfficeStartTime] = useState("09:30");
  const [officeEndTime, setOfficeEndTime]     = useState("17:00");
  const [lat, setLat]         = useState("");
  const [lng, setLng]         = useState("");
  const [radius, setRadius]   = useState(120);

  useEffect(() => {
    getSettings()
      .then((s) => {
        if (!s) return;
        setOfficeStartTime(s.officeStartTime || "09:30");
        setOfficeEndTime(s.officeEndTime || "17:00");
        setLat(s.officeLocation?.lat ?? "");
        setLng(s.officeLocation?.lng ?? "");
        setRadius(s.officeLocation?.radius_meters ?? 120);
      })
      .catch((err) => {
        console.warn("Could not load settings from server, using defaults:", err);
      })
      .finally(() => setLoading(false));
  }, []);

  function useMyLocation() {
    if (!navigator.geolocation) {
      toast.error("Location isn't available on this device/browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        toast.success("Filled in current location — review before saving.");
      },
      () => toast.error("Couldn't get your location.")
    );
  }

  async function handleSave() {
    if (!lat || !lng) {
      toast.error("Office latitude and longitude are required.");
      return;
    }
    setSaving(true);
    try {
      await updateSettings({
        officeStartTime,
        officeEndTime,
        officeLocation: { lat: Number(lat), lng: Number(lng), radius_meters: Number(radius) },
      });
      toast.success("Settings saved");
    } catch (e) {
      toast.error(e.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="px-4 py-5 md:px-6 md:py-6 text-[13px] text-slate-400">Loading settings…</div>;
  }

  return (
    <div className="px-4 py-5 md:px-6 md:py-6 space-y-5 max-w-xl">
      {/* Office Hours */}
      <div className="card p-5 dark:bg-[#1A1D27]">
        <div className="mb-4 flex items-center gap-2">
          <Clock size={16} className="text-accent" />
          <p className="text-[13.5px] font-bold text-slate-800 dark:text-slate-100">Office Hours</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-[11.5px] font-medium text-slate-500 dark:text-slate-400">
              Start Time
            </label>
            <input
              type="time"
              value={officeStartTime}
              onChange={(e) => setOfficeStartTime(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[11.5px] font-medium text-slate-500 dark:text-slate-400">
              End Time
            </label>
            <input
              type="time"
              value={officeEndTime}
              onChange={(e) => setOfficeEndTime(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
            />
          </div>
        </div>
        <p className="mt-3 text-[11.5px] text-slate-400">
          Check-ins after Start Time are marked "Late". Any work done past End Time counts as overtime, and
          checking out at or after End Time locks further check-ins until the next day.
        </p>
      </div>

      {/* Office Location */}
      <div className="card p-5 dark:bg-[#1A1D27]">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin size={16} className="text-accent" />
            <p className="text-[13.5px] font-bold text-slate-800 dark:text-slate-100">Office Location</p>
          </div>
          <button
            onClick={useMyLocation}
            className="text-[11.5px] font-medium text-accent hover:underline"
          >
            Use my current location
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-[11.5px] font-medium text-slate-500 dark:text-slate-400">
              Latitude
            </label>
            <input
              type="number"
              step="any"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              placeholder="12.9716"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[11.5px] font-medium text-slate-500 dark:text-slate-400">
              Longitude
            </label>
            <input
              type="number"
              step="any"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              placeholder="77.5946"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
            />
          </div>
        </div>
        <div className="mt-4">
          <label className="mb-1.5 block text-[11.5px] font-medium text-slate-500 dark:text-slate-400">
            Check-in Radius (meters)
          </label>
          <input
            type="number"
            value={radius}
            onChange={(e) => setRadius(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
          />
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-[13.5px] font-bold text-white shadow-lg shadow-accent/25 transition hover:bg-accent-dark disabled:opacity-50"
      >
        <Save size={15} />
        {saving ? "Saving…" : "Save Settings"}
      </button>
    </div>
  );
}