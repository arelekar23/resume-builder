import { createContext, useContext } from "react";

export interface TagContextValue {
  // Every tag in use with how many bullets carry it, most-used first.
  tagCounts: [string, number][];
  focusTag: string | null;
  setFocusTag: (t: string | null) => void;
}

export const TagContext = createContext<TagContextValue>({
  tagCounts: [],
  focusTag: null,
  setFocusTag: () => {},
});

export function useBulletTags() {
  return useContext(TagContext);
}
