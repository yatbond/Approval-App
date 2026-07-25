"use client";

import { useEffect, useState } from "react";
import {
  isPublicBuildMetadata,
  resolveBuildVersionState,
  type BrowserBuildIdentity,
  type BuildVersionState,
} from "@/lib/build-version-state";

const browserBuildIdentity: BrowserBuildIdentity = {
  releaseName: process.env.NEXT_PUBLIC_APP_RELEASE_NAME || null,
  revision: process.env.NEXT_PUBLIC_APP_BUILD_GIT_SHA || null,
  artifactId: process.env.NEXT_PUBLIC_APP_BUILD_ARTIFACT_ID || null,
};

export function useBuildVersion(): BuildVersionState {
  const [state, setState] = useState<BuildVersionState>({ kind: "loading" });

  useEffect(() => {
    let disposed = false;

    async function refreshVersion() {
      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        const payload: unknown = await response.json();
        if (!response.ok || !isPublicBuildMetadata(payload)) {
          throw new Error("Build metadata response was unavailable.");
        }
        if (!disposed) {
          setState(
            resolveBuildVersionState({
              browser: browserBuildIdentity,
              server: payload,
            }),
          );
        }
      } catch {
        if (!disposed) {
          setState({ kind: "unavailable" });
        }
      }
    }

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") {
        void refreshVersion();
      }
    }

    void refreshVersion();
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  return state;
}
