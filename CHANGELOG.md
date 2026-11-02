# Changelog

Each merged change worth mentioning adds a line under Unreleased. At a milestone, Unreleased is renamed to the new version, tagged and published as a Release. Versions are 0.x: a minor version for a batch of features, a patch for fixes. Every merge to main still deploys to the live site.

## Unreleased

- On a phone held upright, the top bar's text and buttons are as large as the rest of the page.
- Saying a Question is faulty is now a Challenge in its own orange area below Marks and Notes, "Something's wrong with this question", with four Challenge reasons and the Challenge statement, on the Answering page and each Review page card; the Digest and grading Skill (1.6.0) check every Challenged Question first.
- "Not a problem after all" withdraws a Challenge, taking back its reasons and deleting its statement; Reinstate beside the Challenge area's header brings it back as it was, also on the Review page for a Challenge withdrawn while answering. The grading Skill (1.7.0) does not check a withdrawn Challenge.
- The general-science Showcase's Feedback is regenerated in the same claude.ai chat with grading Skill 1.7.0, so it reads the Challenge and its reasons.
- A Question pack declares its Question language, and any content block may declare another, so screen readers read each Question in its own language whatever the Interface language; the question-writing Skill (1.4.0) asks for it.

## v0.1.0

The first version good enough to show others. From Home you can open the General science Showcase and read a whole example: a scripted Session with its Answering timelines (selections, Confidence, Hints, and Notes and Challenge statements written over time), the Digest it produces, and an AI's Feedback on it, then sit the same Questions yourself. You can have an AI write a Question pack with the question-writing Skill, import it after a preview, sit a Session with Flags, Item flags, Notes and Challenges, review it on a page laid out to fit the window, and download the Digest and the grading Skill to get Feedback. Data stays on your device, or in the Artifact database when run as a claude.ai Artifact. The README opens with the problem, the live demo, a Showcases table, screenshots and a short architecture section.
