# Fact-check of `samples/general-science.json`

Checked on 2026-10-30 by an independent agent (read-only, at an introductory level): the marked answer, each Rationale, Misconception, Hint and Explanation of all 10 Questions. The Question pack is kept exactly as Claude Opus 5.5 generated it.

**Result: no wrong answers. Six minor wording or accuracy issues.**

1. q1, Explanation: "making ice about 9% less dense than liquid water (roughly 0.92 versus 1.00 g/cm³)". The figures contradict each other: 0.92 vs 1.00 is about 8% lower density (0.917 vs 0.9998, about 8.3%). The 9% figure is the volume expansion on freezing.
2. q3, Explanation: "Because ice is less dense, it floats and expands as it forms." The causality is backwards: water expands when it freezes, and that is why ice is less dense.
3. q4, `opt_10`: the Rationale says it "might come from halving the time", the Misconception says "Guessing that a lap's halfway point determines the answer". The two disagree (10 m/s is 400 ÷ 40), and the Misconception is vague.
4. q8, `opt_full_virus` Rationale ("vaccines use forms that can't cause serious illness") and hint 1 ("without the ability to cause serious disease"): overstated. Live attenuated vaccines such as MMR, which the pack cites for `opt_weakened`, can rarely cause serious illness, mainly in immunocompromised people.
5. q9, Explanation: "Most vaccines, such as mRNA or protein vaccines, contain no live virus at all, so they cannot cause the infection." Inconsistent with q8, where MMR is a live weakened virus; "most vaccines" is loose, and in a live vaccine a mild reaction can come from the weakened virus itself.
6. q10, hint 2: "The answer is about the virus changing, not the immune system weakening." Slightly misleading: waning antibody levels are a secondary reason for annual flu vaccination.

Q2, Q5, Q6 and Q7 had no problems. All `{{opt:...}}` references point at the intended Options.

The Showcase script uses issue 5 as the learner's Appeal on q9.
