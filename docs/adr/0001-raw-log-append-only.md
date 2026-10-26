# The Raw log is one append-only stream, chunked only by the save mechanism

Each Session keeps a single time-ordered Raw log of everything the user did. It is chunked only by when the page saves: a chunk is sealed when the page is hidden or closed, or when it reaches a size limit. Phase changes are ordinary events in the stream, not chunk boundaries. Sealed chunks are never modified, and each chunk carries a hash of itself and of the previous chunk so that tampering or corruption is detectable. Any rule can be re-derived from the full stream, so the log itself holds no rules.

Exporting an Answer pack also seals the chunk, so the pack holds everything done up to the download; the next chunk starts at once, and nothing sealed is rewritten.

## Considered Options

- **Chunk by Phase, by Visit, or by Question**: rejected. Each already applies an interpretation, so the log stops being raw.
- **Many fixed-interval chunks**: rejected because of document count and noise.
- **Write once at submission**: rejected. Losing the whole Session when the OS kills the app is unacceptable.
