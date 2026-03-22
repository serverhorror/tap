## User

[@system-design.md](file:///home/serverhorror/src/take_a_pick/spec/system-design.md) This is the system design for a project I want to create, read the document and let me know if there is anything that is missing before you start implementing.

Here is some addition information about the project:

1. RNG - Advice: prefer `Math.random()` (simple) -- there is no for cryptographic requirements.
2. Duplicates - Advice: identical names should be deduplicated automatically
3. Audio - Advice: prefer synthesized ticks + a small fanfare sample
4. Accessibility strictness - Advice: ARIA support and reduced-motion as minimal
5. Max names - Advice: no maximum, but the expectation is fewer than 25 names for good UX.