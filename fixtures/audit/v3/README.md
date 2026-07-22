# Audit v3 conformance fixtures

Schema version 1 is the compact repository authority transformed by `compact-recipes-v1` from the final pure-conformance spike at commit `af5bd6e009b9f6be83a39a289cd539a2457abf7e`, tree `db9c02ce16a29e2eb439d34190084b83d0a1b5a3`.

Source SHA-256: schema `1a25827315717792ee5e50fb28602dc25ec4a2972f9d7e70436e6e57a4fba949`; canonical `df3c6253f1c94640fced3bd8b24f04db0a0d1d1c4b87e9ae6ad89b30d8465bec`; rejections `7ab613f367119118976c5529616cbc9b0022e2ef61409785eed9d037c2001155`; frames `25cfbb1c507276bf13f97367db3908b7467895dbfa7cdbeb0280b158e6662d83`; result authority `d2808ae2218d3c4090794fe67ec91883b16027c33ec6023a6f850ee66b6988ba`.

Rows are exactly ordered `V001`-`V012`, `R001`-`R028`, `F001`-`F024` (12 + 28 + 24 = 64). Small vectors retain exact hexadecimal bytes. Scale vectors use bounded deterministic recipes and record exact length, SHA-256, prefix, and suffix.

Compact SHA-256: schema `74c3f4900d00fe3f0642a973beed5ac1235230552136b6095294467fc1ca3e84`; canonical `f0e32ecd332c36e49061383c8e424d00ecbbdd58c2d18d258f2063679abc7fac`; rejections `c84c85146e03029a405aa7aa1dadd0a6d7211c05e4446a0a918a32e7a497e5d1`; frames `94e71dd3237d28f23fc1978cc55ab3a9d86101d321e8d494a515987c0a569372`.

The Node and Dart test-local loaders validate structure and materialization only. They intentionally do not implement canonicalization or OFA3 framing.
