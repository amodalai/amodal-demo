# Eval: Submission History Comes From The Events Store

The `events` store is the append-only trail of what happened to a submission
and who did it. The agent is granted the store, so this eval pins that it
answers from the trail rather than narrating a plausible sequence.

## Setup

Context: The stores may be empty (fresh deploy) or already seeded. Seeding records a `seeded` event per submission, and analyzing records an `analyzed` event, so the trail exists as soon as either has run.

## Query

"What has happened to sub_bistro_ember so far?"

## Assertions

- Should read the events store for that submission
- Should report the events it found, in order, naming who acted (system for the seeding, agent for an analysis)
- Should say the submission has not been analyzed or decided yet when no such event exists
- Should NOT invent an approval, a decision, or a reply that has no event
