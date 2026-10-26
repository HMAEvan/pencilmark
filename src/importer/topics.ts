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

/** Every Track and Topic in Storage as a path, each Track followed depth-first by its Topics in order. */
export async function topicPaths(storage: Storage): Promise<string[]> {
  const tracks = await storage.query<Track>("tracks");
  const topics = await storage.query<Topic>("topics");
  tracks.sort((a, b) => a.title.localeCompare(b.title));
  const paths: string[] = [];
  const walk = (trackId: string, parentId: string | undefined, prefix: string) => {
    const children = topics.filter((t) => t.trackId === trackId && t.parentId === parentId).sort((a, b) => a.order - b.order);
    for (const topic of children) {
      const path = `${prefix} / ${topic.title}`;
      paths.push(path);
      walk(trackId, topic.id, path);
    }
  };
  for (const track of tracks) {
    paths.push(track.title);
    walk(track.id, undefined, track.title);
  }
  return paths;
}
