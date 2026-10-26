# AI provenance is recorded by convention, not enforced

In artifact mode, an AI writes to the database with the user's identity, so the platform cannot distinguish AI writes from user writes. The `source`, `model` and changelog fields are filled in by convention, stated in the schema document and in the Project instructions. This is enough for personal use but is not an audit trail. Readers must not treat these fields as proof.
