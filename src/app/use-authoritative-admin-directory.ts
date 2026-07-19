"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AuthoritativeDirectoryUser = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  effectiveRoles: string[];
  departmentId: string | null;
};

type DirectoryPayload = {
  users?: AuthoritativeDirectoryUser[];
  nextCursor?: string | null;
  error?: { message?: string };
};

export function useAuthoritativeAdminDirectory() {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AuthoritativeDirectoryUser[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const requestSequence = useRef(0);

  const loadPage = useCallback(
    async ({ cursor, append }: { cursor?: string; append: boolean }) => {
      const sequence = ++requestSequence.current;
      setIsLoading(true);
      setError("");
      const parameters = new URLSearchParams({ query: query.trim(), limit: "50" });
      if (cursor) parameters.set("cursor", cursor);

      try {
        const response = await fetch(`/api/directory?${parameters}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as DirectoryPayload;
        if (!response.ok) {
          throw new Error(payload.error?.message || "Unable to load the directory.");
        }
        if (sequence !== requestSequence.current) return;
        const page = payload.users || [];
        setUsers((current) => {
          if (!append) return page;
          const byId = new Map(current.map((user) => [user.id, user]));
          page.forEach((user) => byId.set(user.id, user));
          return Array.from(byId.values());
        });
        setNextCursor(payload.nextCursor || null);
      } catch (loadError) {
        if (sequence !== requestSequence.current) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load the directory.",
        );
      } finally {
        if (sequence === requestSequence.current) setIsLoading(false);
      }
    },
    [query],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPage({ append: false });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [loadPage]);

  return {
    query,
    setQuery,
    users,
    nextCursor,
    isLoading,
    error,
    loadNextPage: () =>
      nextCursor ? loadPage({ cursor: nextCursor, append: true }) : Promise.resolve(),
    retry: () => loadPage({ append: false }),
  };
}
