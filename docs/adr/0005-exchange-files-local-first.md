# Exchange files are the primary integration with AIs; local mode comes first

Any AI, in any chat window, can produce a Question pack and read a Digest as plain text or a file, with no API key or connector. The local mode (IndexedDB, served from GitHub Pages) is built first, and the artifact and API modes come later on top of the same exchange formats. Core code reaches storage only through a storage interface, so no single platform owns the data.
