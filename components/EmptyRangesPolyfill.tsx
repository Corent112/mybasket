"use client";

import { useEffect } from "react";

export default function EmptyRangesPolyfill() {
  useEffect(() => {
    const scope = window as typeof window & { EmptyRanges?: unknown };
    if (scope.EmptyRanges) return;

    class EmptyRanges {
      readonly length = 0;
      start(_index: number): number {
        throw new DOMException("IndexSizeError", "IndexSizeError");
      }
      end(_index: number): number {
        throw new DOMException("IndexSizeError", "IndexSizeError");
      }
    }

    scope.EmptyRanges = EmptyRanges;
  }, []);

  return null;
}
