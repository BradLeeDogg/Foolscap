import type { ProjectType } from '@shared/types'
import { OVERLAY_LABELS, type StructureOverlay } from '@shared/api'

/** A node in a starter-template tree. Documents may carry placeholder body text. */
export interface TemplateNode {
  type: 'folder' | 'document'
  title: string
  synopsis?: string
  isSpecial?: boolean
  /** Placeholder paragraphs for documents (kept light — fully editable). */
  body?: string[]
  children?: TemplateNode[]
}

/** Journalism types ship with the fact-check workflow enabled. */
export function factCheckDefault(type: ProjectType): boolean {
  return type === 'journalism-short' || type === 'journalism-long'
}

function sheet(title: string, fields: string[]): TemplateNode {
  return { type: 'document', title, body: fields }
}

export const STRUCTURE_BEATS: Record<StructureOverlay, Array<[string, string]>> = {
  'three-act': [
    ['Act I — Setup', 'Establish the ordinary world, the protagonist, and the stakes.'],
    ['Inciting Incident', 'The event that disrupts the status quo and starts the story.'],
    ['Plot Point 1', 'The protagonist commits; we cross into Act II.'],
    ['Act II — Rising Action', 'Escalating obstacles; the protagonist adapts.'],
    ['Midpoint', 'A reversal or revelation that raises the stakes.'],
    ['Plot Point 2', 'The lowest point; everything seems lost.'],
    ['Act III — Climax', 'The final confrontation and its resolution.'],
    ['Resolution', 'The new normal; threads tie off.']
  ],
  'seven-point': [
    ['Hook', 'The starting state, opposite of the resolution.'],
    ['Plot Turn 1', 'The call to adventure; move toward the midpoint.'],
    ['Pinch Point 1', 'Apply pressure; reveal the antagonistic force.'],
    ['Midpoint', 'Shift from reaction to action.'],
    ['Pinch Point 2', 'Greater pressure; things look dire.'],
    ['Plot Turn 2', 'The protagonist gets the final piece they need.'],
    ['Resolution', 'The payoff; the opposite of the hook.']
  ],
  'heros-journey': [
    ['Ordinary World', 'Life before the adventure.'],
    ['Call to Adventure', 'The challenge presents itself.'],
    ['Refusal of the Call', 'Hesitation and fear.'],
    ['Meeting the Mentor', 'Guidance and gifts.'],
    ['Crossing the Threshold', 'Commitment to the journey.'],
    ['Tests, Allies, Enemies', 'Learning the rules of the new world.'],
    ['Approach', 'Preparing for the central ordeal.'],
    ['The Ordeal', 'The greatest fear; a brush with death.'],
    ['Reward', 'Seizing the prize.'],
    ['The Road Back', 'Driven to complete the journey.'],
    ['Resurrection', 'The final test; transformation.'],
    ['Return with the Elixir', 'Home, changed, with something to share.']
  ],
  'save-the-cat': [
    ['Opening Image', 'A snapshot of the world before.'],
    ['Theme Stated', 'What the story is really about.'],
    ['Set-Up', 'Introduce the world and what needs fixing.'],
    ['Catalyst', 'The life-changing event.'],
    ['Debate', 'Should they go?'],
    ['Break into Two', 'The choice to enter the new world.'],
    ['B Story', 'The secondary, often relational, thread.'],
    ['Fun and Games', 'The promise of the premise.'],
    ['Midpoint', 'A false victory or false defeat.'],
    ['Bad Guys Close In', 'Pressure mounts within and without.'],
    ['All Is Lost', 'The lowest point.'],
    ['Dark Night of the Soul', 'The darkest hour before the dawn.'],
    ['Break into Three', 'The solution emerges.'],
    ['Finale', 'Applying the lesson; the climax.'],
    ['Final Image', 'The opposite of the opening image.']
  ],
  'nf-narrative': [
    ['Opening Scene', 'Drop the reader into a vivid, concrete moment.'],
    ['The Question', 'The driving question or tension the book pursues.'],
    ['Background & Stakes', 'What the reader must know, and why it matters.'],
    ['Rising Complication', 'Developments that deepen the problem.'],
    ['Turning Point', 'The pivotal discovery or shift.'],
    ['Climax', 'The decisive moment everything has built toward.'],
    ['Resolution', 'How it settles.'],
    ['Takeaway', 'What it all means for the reader.']
  ],
  'nf-argument': [
    ['Thesis', 'The central claim, in one sentence.'],
    ['Why Now', 'The urgency — why this argument, this moment.'],
    ['The Problem', 'The status quo or assumption you are challenging.'],
    ['Evidence & Cases', 'Data, stories, and examples that carry the claim.'],
    ['Counterarguments', 'Steelman the other side, then answer it.'],
    ['Synthesis', 'Bring the threads into a coherent whole.'],
    ['Call to Action', 'What the reader should now do or believe.']
  ],
  'nf-prescriptive': [
    ['The Promise', 'The transformation the book offers.'],
    ['The Problem', "What is keeping the reader stuck."],
    ['The Framework', 'Your core model or guiding principles.'],
    ['The Steps', 'The method, broken into ordered moves.'],
    ['Examples', 'Worked cases that prove the method.'],
    ['Pitfalls', 'Common mistakes and how to avoid them.'],
    ['Action Plan', "The reader's concrete next steps."]
  ],
  'news-inverted-pyramid': [
    ['Lede', 'The who/what/when/where/why in a sentence or two.'],
    ['Key Details', 'The most newsworthy facts, in order.'],
    ['Context', 'Background that frames the news.'],
    ['Supporting Quotes', 'Attribution and reaction.'],
    ['Minor Details', 'Least essential material — safe to cut from the bottom.']
  ],
  'feature-anatomy': [
    ['Lede', 'A scene or anecdote that pulls the reader in.'],
    ['Nut Graf', 'Why this story, why now — the point of it.'],
    ['Context', 'Background and stakes.'],
    ['Body', 'The reporting, in scenes or movements.'],
    ['Voices', 'Key quotes and characters.'],
    ['Counterpoint', 'Tension, complication, the other view.'],
    ['Kicker', 'A closing line that resonates.']
  ],
  'diss-standard': [
    ['Abstract', 'A concise summary of the whole.'],
    ['Introduction', 'Problem, aims, and significance.'],
    ['Literature Review', "What is known, and the gap you fill."],
    ['Methodology', 'How you investigated.'],
    ['Results', 'What you found.'],
    ['Discussion', 'What it means; limitations.'],
    ['Conclusion', 'Contributions and future work.'],
    ['References', 'Works cited.'],
    ['Appendices', 'Supplementary material.']
  ],
  'diss-imrad': [
    ['Introduction', 'Question and rationale.'],
    ['Methods', 'Design and procedure.'],
    ['Results', 'Findings, without interpretation.'],
    ['Discussion', 'Interpretation and implications.'],
    ['References', 'Works cited.']
  ],
  'tech-user-guide': [
    ['Overview', "What this product does and who it's for."],
    ['Prerequisites', 'What the reader needs before starting.'],
    ['Getting Started', 'Install, set up, and first run.'],
    ['Core Tasks', 'The main things users do, step by step.'],
    ['Reference', 'Settings, options, and specifications.'],
    ['Troubleshooting', 'Common problems and fixes.'],
    ['FAQ', 'Frequently asked questions.'],
    ['Glossary', 'Key terms defined.']
  ],
  'tech-api': [
    ['Overview', 'What the API does; base URL and core concepts.'],
    ['Authentication', 'Keys, tokens, and scopes.'],
    ['Quickstart', 'A minimal working request.'],
    ['Endpoints', 'Routes, methods, and parameters.'],
    ['Responses', 'Schemas and example payloads.'],
    ['Errors', 'Status codes and messages.'],
    ['Rate Limits', 'Quotas and throttling.'],
    ['Changelog', 'Versioned changes.']
  ],
  'tech-tutorial': [
    ['Goal', 'What the reader will build or learn.'],
    ['Prerequisites', 'Required tools and knowledge.'],
    ['Steps', 'Ordered, do-this-now instructions.'],
    ['Verify', 'Confirm it worked.'],
    ['Recap', 'What was covered.'],
    ['Next Steps', 'Where to go from here.']
  ],
  'sop-standard': [
    ['Purpose', 'Why this procedure exists.'],
    ['Scope', 'What and whom it applies to.'],
    ['Responsibilities', 'Who does what.'],
    ['Definitions', 'Terms and acronyms.'],
    ['Materials & Equipment', 'What is required to perform it.'],
    ['Procedure', 'Numbered, sequential steps.'],
    ['Safety & Compliance', 'Hazards, PPE, and regulations.'],
    ['References', 'Related documents and standards.'],
    ['Revision History', 'Version, date, author, change.']
  ],
  'sop-checklist': [
    ['Purpose', 'What this checklist ensures.'],
    ['When to Use', 'Trigger or frequency.'],
    ['Pre-Checks', 'Conditions to confirm first.'],
    ['Steps', 'Check-off actions, in order.'],
    ['Sign-off', 'Who verifies and approves.'],
    ['Escalation', 'What to do if a step fails.']
  ],
  'essay-5-paragraph': [
    ['Introduction', 'Hook, context, and a clear thesis statement.'],
    ['Body Paragraph 1', 'First supporting point with evidence.'],
    ['Body Paragraph 2', 'Second supporting point with evidence.'],
    ['Body Paragraph 3', 'Third supporting point with evidence.'],
    ['Conclusion', 'Restate the thesis, synthesize, closing thought.']
  ],
  'essay-argumentative': [
    ['Introduction & Thesis', 'Issue, stance, and claim.'],
    ['Background', 'Context the reader needs.'],
    ['Argument 1', 'Strongest reason with evidence.'],
    ['Argument 2', 'Second reason with evidence.'],
    ['Counterargument & Rebuttal', 'Opposing view, then your response.'],
    ['Conclusion', 'Reaffirm the claim and its significance.']
  ],
  'essay-compare': [
    ['Introduction', 'Subjects and the basis for comparison; thesis.'],
    ['Subject A', 'Key points about the first subject.'],
    ['Subject B', 'Key points about the second subject.'],
    ['Comparison & Analysis', 'Similarities, differences, and what they mean.'],
    ['Conclusion', 'Synthesis and takeaway.']
  ],
  'paper-research': [
    ['Introduction', 'Topic, significance, and research question.'],
    ['Literature Review', 'What prior work has established.'],
    ['Methods', 'How the work was done.'],
    ['Results', 'What was found.'],
    ['Discussion', 'Interpretation and implications.'],
    ['Conclusion', 'Summary and future directions.'],
    ['References', 'Sources cited.']
  ],
  'paper-lit-review': [
    ['Introduction', 'Scope and purpose of the review.'],
    ['Themes & Trends', 'Group the literature by theme.'],
    ['Synthesis', 'How the sources relate and build.'],
    ['Gaps & Questions', 'What remains unresolved.'],
    ['Conclusion', 'Summary and direction for new work.']
  ],
  'thesis-standard': [
    ['Abstract', 'One-paragraph summary of the whole.'],
    ['Introduction', 'Problem, aims, and significance.'],
    ['Literature Review', 'Prior work and theoretical frame.'],
    ['Methodology', 'Design, data, and procedure.'],
    ['Results', 'Findings.'],
    ['Discussion', 'Interpretation and limitations.'],
    ['Conclusion', 'Contributions and future work.'],
    ['Bibliography', 'Works cited.']
  ]
}

function overlayFolder(overlay: StructureOverlay): TemplateNode {
  return {
    type: 'folder',
    title: `Outline — ${OVERLAY_LABELS[overlay]}`,
    synopsis: 'Structural placeholders. Keep, rearrange, or discard.',
    children: STRUCTURE_BEATS[overlay].map(([title, synopsis]) => ({
      type: 'document',
      title,
      synopsis
    }))
  }
}

function novelTemplate(novella: boolean): TemplateNode[] {
  const nodes: TemplateNode[] = [
    {
      type: 'folder',
      title: 'Manuscript',
      isSpecial: true,
      synopsis: 'The draft itself. Compile pulls from here, in order.',
      children: [
        {
          type: 'folder',
          title: 'Chapter One',
          children: [{ type: 'document', title: 'Scene', synopsis: 'Opening scene.' }]
        }
      ]
    },
    {
      type: 'folder',
      title: 'Characters',
      children: [
        sheet('Protagonist', ['Name:', 'Role:', 'Wants:', 'Needs:', 'Flaw:', 'Arc:'])
      ]
    },
    {
      type: 'folder',
      title: 'Settings',
      children: [sheet('Setting', ['Place:', 'Time period:', 'Mood:', 'Sensory details:'])]
    },
    { type: 'document', title: 'Timeline', synopsis: 'Chronology of events.' },
    { type: 'folder', title: 'Research', synopsis: 'Captured sources and notes.' }
  ]
  if (!novella) {
    // Full novels get a notes doc for series/worldbuilding scope.
    nodes.push({ type: 'document', title: 'Notes', body: [''] })
  }
  return nodes
}

function shortStoryTemplate(): TemplateNode[] {
  return [
    {
      type: 'folder',
      title: 'Manuscript',
      isSpecial: true,
      children: [{ type: 'document', title: 'Story', synopsis: 'Single-arc draft.' }]
    },
    { type: 'document', title: 'Notes', body: [''] }
  ]
}

function nonfictionTemplate(): TemplateNode[] {
  return [
    {
      type: 'folder',
      title: 'Proposal',
      synopsis: 'The selling apparatus an agent or editor reads first.',
      children: [
        { type: 'document', title: 'Overview', synopsis: 'The hook and argument of the book.' },
        sheet('Author Bio', ['Why you, why now:', 'Credentials:', 'Platform:']),
        {
          type: 'document',
          title: 'Comparable Titles',
          synopsis: 'Recent comps and how yours differs.'
        },
        { type: 'document', title: 'Market & Platform', synopsis: 'Audience, reach, channels.' },
        {
          type: 'document',
          title: 'Annotated Table of Contents',
          synopsis: 'Chapter-by-chapter summary.'
        },
        { type: 'folder', title: 'Sample Chapters' }
      ]
    },
    {
      type: 'folder',
      title: 'Manuscript',
      isSpecial: true,
      children: [
        {
          type: 'folder',
          title: 'Chapter 1',
          children: [{ type: 'document', title: 'Section', synopsis: '' }]
        }
      ]
    },
    { type: 'document', title: 'Bibliography', synopsis: 'Works cited.' },
    { type: 'folder', title: 'Research' }
  ]
}

function journalismShortTemplate(): TemplateNode[] {
  return [
    {
      type: 'folder',
      title: 'Story',
      isSpecial: true,
      children: [
        { type: 'document', title: 'Headline', synopsis: 'Working title.' },
        { type: 'document', title: 'Dek', synopsis: 'Subhead / standfirst.' },
        { type: 'document', title: 'Lede', synopsis: 'The opening.' },
        { type: 'document', title: 'Nut Graf', synopsis: 'Why this matters, now.' },
        { type: 'document', title: 'Body', synopsis: 'The reporting.' },
        { type: 'document', title: 'Kicker', synopsis: 'The closing line.' }
      ]
    },
    { type: 'folder', title: 'Sources', synopsis: 'Source index for fact-checking.' },
    { type: 'document', title: 'Notes', body: [''] }
  ]
}

function journalismLongTemplate(): TemplateNode[] {
  return [
    {
      type: 'folder',
      title: 'Feature',
      isSpecial: true,
      children: [
        { type: 'document', title: 'Lede', synopsis: 'Scene-setting opening.' },
        { type: 'document', title: 'Nut Graf', synopsis: 'The stakes and the argument.' },
        { type: 'document', title: 'Section', synopsis: 'A scene or movement.' },
        { type: 'document', title: 'Kicker', synopsis: 'The ending.' }
      ]
    },
    { type: 'folder', title: 'Sources', synopsis: 'Source index for fact-checking.' },
    {
      type: 'folder',
      title: 'Subjects',
      children: [sheet('Subject', ['Name:', 'Role:', 'Contact:', 'On/off record:'])]
    },
    { type: 'document', title: 'Timeline', synopsis: 'Chronology of events.' },
    { type: 'document', title: 'Notes', body: [''] }
  ]
}

function dissertationTemplate(): TemplateNode[] {
  return [
    {
      type: 'folder',
      title: 'Front Matter',
      children: [
        { type: 'document', title: 'Abstract', synopsis: 'Concise summary.' },
        { type: 'document', title: 'Table of Contents', synopsis: 'Generated at compile.' },
        { type: 'document', title: 'List of Figures' },
        { type: 'document', title: 'List of Tables' }
      ]
    },
    {
      type: 'folder',
      title: 'Body',
      isSpecial: true,
      children: [
        { type: 'document', title: 'Introduction', synopsis: 'Problem and aims.' },
        { type: 'document', title: 'Literature Review', synopsis: 'Prior work.' },
        { type: 'document', title: 'Methodology', synopsis: 'Approach and methods.' },
        { type: 'document', title: 'Results', synopsis: 'Findings.' },
        { type: 'document', title: 'Discussion', synopsis: 'Interpretation.' },
        { type: 'document', title: 'Conclusion', synopsis: 'Contributions and future work.' }
      ]
    },
    { type: 'document', title: 'References', synopsis: 'Bibliography (citation style applied at compile).' }
  ]
}

function technicalTemplate(): TemplateNode[] {
  return [
    {
      type: 'folder',
      title: 'Documentation',
      isSpecial: true,
      synopsis: 'The deliverable. Compile pulls from here, in order.',
      children: [
        { type: 'document', title: 'Overview', synopsis: "What this covers and who it's for." },
        { type: 'document', title: 'Getting Started', synopsis: 'Install, set up, first run.' },
        {
          type: 'folder',
          title: 'Guides',
          children: [{ type: 'document', title: 'How-To', synopsis: 'A task-based guide.' }]
        },
        {
          type: 'folder',
          title: 'Reference',
          children: [{ type: 'document', title: 'Reference', synopsis: 'Options, parameters, specs.' }]
        },
        { type: 'document', title: 'Troubleshooting', synopsis: 'Common problems and fixes.' },
        { type: 'document', title: 'FAQ', synopsis: 'Frequently asked questions.' }
      ]
    },
    { type: 'document', title: 'Glossary', synopsis: 'Terms and definitions.' },
    { type: 'folder', title: 'Assets', synopsis: 'Screenshots and diagrams.' },
    { type: 'folder', title: 'Research', synopsis: 'Source material and notes.' }
  ]
}

function sopTemplate(): TemplateNode[] {
  return [
    {
      type: 'folder',
      title: 'SOP',
      isSpecial: true,
      synopsis: 'The procedure itself. Compile pulls from here, in order.',
      children: [
        sheet('Document Control', [
          'SOP number:',
          'Version:',
          'Effective date:',
          'Owner:',
          'Approved by:'
        ]),
        { type: 'document', title: 'Purpose', synopsis: 'Why this procedure exists.' },
        { type: 'document', title: 'Scope', synopsis: 'What and whom it applies to.' },
        sheet('Responsibilities', ['Role:', 'Responsibility:']),
        {
          type: 'document',
          title: 'Materials & Prerequisites',
          synopsis: 'What is needed before starting.'
        },
        {
          type: 'folder',
          title: 'Procedure',
          synopsis: 'Numbered, sequential steps.',
          children: [{ type: 'document', title: 'Step 1', synopsis: 'First action.' }]
        },
        { type: 'document', title: 'Safety & Warnings', synopsis: 'Hazards and cautions.' },
        { type: 'document', title: 'References', synopsis: 'Related documents and standards.' }
      ]
    },
    sheet('Revision History', ['Version:', 'Date:', 'Author:', 'Summary of changes:']),
    { type: 'document', title: 'Notes', body: [''] }
  ]
}

function collegeEssayTemplate(): TemplateNode[] {
  return [
    {
      type: 'folder',
      title: 'Essay',
      isSpecial: true,
      synopsis: 'The essay itself. Compile pulls from here, in order.',
      children: [
        { type: 'document', title: 'Introduction', synopsis: 'Hook, context, and thesis statement.' },
        { type: 'document', title: 'Body Paragraph 1', synopsis: 'First point with evidence.' },
        { type: 'document', title: 'Body Paragraph 2', synopsis: 'Second point with evidence.' },
        { type: 'document', title: 'Body Paragraph 3', synopsis: 'Third point with evidence.' },
        { type: 'document', title: 'Conclusion', synopsis: 'Restate the thesis and synthesize.' }
      ]
    },
    { type: 'document', title: 'Works Cited', synopsis: 'Citations (style applied at compile).' },
    { type: 'folder', title: 'Research', synopsis: 'Sources and notes.' }
  ]
}

function academicPaperTemplate(): TemplateNode[] {
  return [
    sheet('Paper Info', ['Title:', 'Author:', 'Course:', 'Instructor:', 'Date:']),
    {
      type: 'folder',
      title: 'Paper',
      isSpecial: true,
      synopsis: 'The paper itself. Compile pulls from here, in order.',
      children: [
        { type: 'document', title: 'Abstract', synopsis: 'Concise summary (if required).' },
        { type: 'document', title: 'Introduction', synopsis: 'Topic, significance, research question.' },
        { type: 'document', title: 'Literature Review', synopsis: 'What prior work established.' },
        { type: 'document', title: 'Methods', synopsis: 'How the work was done.' },
        { type: 'document', title: 'Results', synopsis: 'What was found.' },
        { type: 'document', title: 'Discussion', synopsis: 'Interpretation and implications.' },
        { type: 'document', title: 'Conclusion', synopsis: 'Summary and future directions.' }
      ]
    },
    { type: 'document', title: 'References', synopsis: 'Citations (style applied at compile).' },
    { type: 'folder', title: 'Research', synopsis: 'Sources and notes.' }
  ]
}

function thesisTemplate(): TemplateNode[] {
  return [
    {
      type: 'folder',
      title: 'Front Matter',
      children: [
        { type: 'document', title: 'Title Page', synopsis: 'Title, author, institution, date.' },
        { type: 'document', title: 'Abstract', synopsis: 'One-paragraph summary.' },
        { type: 'document', title: 'Acknowledgments' },
        { type: 'document', title: 'Table of Contents', synopsis: 'Generated at compile.' }
      ]
    },
    {
      type: 'folder',
      title: 'Chapters',
      isSpecial: true,
      synopsis: 'The thesis body. Compile pulls from here, in order.',
      children: [
        { type: 'document', title: 'Chapter 1 — Introduction', synopsis: 'Problem, aims, significance.' },
        { type: 'document', title: 'Chapter 2 — Literature Review', synopsis: 'Prior work and framing.' },
        { type: 'document', title: 'Chapter 3 — Methodology', synopsis: 'Design, data, procedure.' },
        { type: 'document', title: 'Chapter 4 — Results', synopsis: 'Findings.' },
        { type: 'document', title: 'Chapter 5 — Discussion', synopsis: 'Interpretation and limitations.' },
        { type: 'document', title: 'Chapter 6 — Conclusion', synopsis: 'Contributions and future work.' }
      ]
    },
    { type: 'document', title: 'Bibliography', synopsis: 'Citations (style applied at compile).' },
    { type: 'folder', title: 'Research', synopsis: 'Sources and notes.' }
  ]
}

function baseTemplate(type: ProjectType): TemplateNode[] {
  switch (type) {
    case 'novel':
      return novelTemplate(false)
    case 'novella':
      return novelTemplate(true)
    case 'short-story':
      return shortStoryTemplate()
    case 'nonfiction-book':
      return nonfictionTemplate()
    case 'journalism-short':
      return journalismShortTemplate()
    case 'journalism-long':
      return journalismLongTemplate()
    case 'dissertation':
      return dissertationTemplate()
    case 'technical':
      return technicalTemplate()
    case 'sop':
      return sopTemplate()
    case 'college-essay':
      return collegeEssayTemplate()
    case 'academic-paper':
      return academicPaperTemplate()
    case 'thesis':
      return thesisTemplate()
    default:
      return shortStoryTemplate()
  }
}

export function getTemplate(type: ProjectType, overlay?: StructureOverlay | null): TemplateNode[] {
  const nodes = baseTemplate(type)
  // Drop the optional planning outline near the top, beneath the first folder.
  if (overlay && STRUCTURE_BEATS[overlay]) {
    nodes.splice(Math.min(1, nodes.length), 0, overlayFolder(overlay))
  }
  return nodes
}
