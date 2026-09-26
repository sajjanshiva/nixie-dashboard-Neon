import React from "react";
import Modal from "./Modal.jsx";

// Shared receipt image viewer — used by both the staff Reimbursements
// page and the admin Approvals page, so a receipt always opens in the
// same in-dashboard popup (with the existing Modal's built-in X to
// close) instead of a separate browser tab.
export default function ReceiptModal({ url, onClose }) {
  return (
    <Modal open={!!url} onClose={onClose} wide>
      <div className="flex h-full items-center justify-center bg-slate-50 p-4 dark:bg-black/20">
        {url && (
          <img
            src={url}
            alt="Receipt"
            className="max-h-full max-w-full rounded-lg object-contain shadow-sm"
          />
        )}
      </div>
    </Modal>
  );
}