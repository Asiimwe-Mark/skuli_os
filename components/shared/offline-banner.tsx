"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { WifiOff } from "lucide-react";

export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    function update() {
      setOffline(typeof navigator !== "undefined" && !navigator.onLine);
    }
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return (
    <AnimatePresence>
      {offline && (
        <motion.div
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -50, opacity: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-bg-tertiary text-white text-sm font-semibold px-4 py-2.5 shadow-card"
        >
          <WifiOff className="w-4 h-4" />
          You are offline - your changes will sync automatically when you reconnect.
        </motion.div>
      )}
    </AnimatePresence>
  );
}
