import type { Provenance, Topic, Track } from "../domain/types";
import { newId } from "../domain/ids";
import type { Storage } from "../storage/storage";
import { normaliseText } from "./normalise";

export type ResolvedPath = { trackId: string; topicId?: string };

/** "BIOL101/Genetics /  Lecture 1" → "BIOL101 / Genetics / Lecture 1". */
export function canonicalPath(path: string): string {
  return path.split("/").map(normaliseText).filter(Boolean).join(" / ");
}

/**
 * Resolves Topic paths against the Tracks and Topics in Storage. The first segment names a Track, the
 * rest a chain of Topics. Missing ones are created in memory only; `created` holds them until written.
 */
export async function topicResolver(storage: Storage, provenance: Provenance, now: Date) {
  const tracks = await storage.query<Track>("tracks");
  const topics = await storage.query<Topic>("topics");
  const created: { tracks: Track[]; topics: Topic[] } = { tracks: [], topics: [] };
  const newPaths: string[] = [];
  const same = (a: string, b: string) => normaliseText(a) === normaliseText(b);

  function resolve(path: string): ResolvedPath {
    const [trackTitle, ...topicTitles] = canonicalPath(path).split(" / ") as [string, ...string[]];
    let isNew = false;
    let track = tracks.find((t) => same(t.title, trackTitle) || (t.code !== undefined && same(t.code, trackTitle)));
    if (!track) {
      track = { ...provenance, id: newId("tr", now), kind: "domain", title: trackTitle, createdAt: now.getTime() };
      tracks.push(track);
      created.tracks.push(track);
      isNew = true;
    }
    let parentId: string | undefined;
    for (const title of topicTitles) {
      const siblings = topics.filter((t) => t.trackId === track.id && t.parentId === parentId);
      let topic = siblings.find((t) => same(t.title, title));
      if (!topic) {
        topic = { ...provenance, id: newId("tp", now), trackId: track.id, parentId, title, order: siblings.length, createdAt: now.getTime() };
        topics.push(topic);
        created.topics.push(topic);
        isNew = true;
      }
      parentId = topic.id;
    }
    if (isNew) newPaths.push(canonicalPath(path));
    return { trackId: track.id, topicId: parentId };
  }

  return { resolve, created, newPaths };
}
