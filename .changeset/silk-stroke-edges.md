---
"pixi-silk": patch
---

Stroked paths shade every pixel once in the hard cases too. A long translucent path that crosses itself far along its length no longer blends twice where it overlaps: each chunk of a path also checks the segments of other chunks near it. Fold-backs on chunk boundaries keep exact coverage. Square dash caps that run through a round corner keep the corner round.
