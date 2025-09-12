---
description: Interactive brainstorming session for comprehensive requirement gathering
allowed-tools: Read, Write, Grep, Glob, TodoWrite, Bash(ls:*, echo:*, mkdir:*, date:*)
argument-hint: "<feature-or-bugfix-description>"
category: workflow
---

# 🎯 Interactive Brainstorm Session

**Topic**: $ARGUMENTS

## 🚀 Initialization

```javascript
// Session initialization
const initializeSession = () => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const topic = "$ARGUMENTS"
  const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)
  const sessionPath = `specs/brainstorm-sessions/${timestamp}-${slug}`
  
  return {
    topic: topic,
    timestamp: timestamp,
    slug: slug,
    sessionPath: sessionPath,
    confidence: 0,
    iteration: 1,
    questions: [],
    answers: [],
    understanding: {
      problem: null,
      scope: null,
      technical: null,
      implementation: null
    }
  }
}

const session = initializeSession()
```

Check if specs directory exists: 
!Bash "ls -la specs/ 2>/dev/null || echo 'Creating specs directory...'"

If specs directory doesn't exist, create it: 
!Bash "mkdir -p specs/brainstorm-sessions"

Create session directory: 
!Bash "mkdir -p specs/brainstorm-sessions/${session.timestamp}-${session.slug}"

```
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║         🎯 INTERACTIVE BRAINSTORM SESSION 🎯                 ║
║                                                               ║
║   Comprehensive Requirement Gathering Through Questions       ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝

🚨 INITIALIZATION COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📁 Session: ${session.sessionPath}
🎯 Topic: ${session.topic}
📅 Started: ${session.timestamp}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Let's understand your requirements through detailed questioning.
I will NEVER assume or infer - I will ASK about everything!
```

## 📋 Phase 1: Problem Definition (0% → 20% Confidence)

### 🌱 Understanding the Core Problem

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌱 Problem Definition - Iteration 1
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

┌─────────────────────────────────────────────────────┐
│     🤔 Let's understand the problem...              │
│                                                     │
│     Question 1 of many                             │
└─────────────────────────────────────────────────────┘

❓ **What is the core problem you're trying to solve?**

📋 **Context**: I need to understand the fundamental issue, not the solution
💡 **Why this matters**: The problem definition drives everything else
🎯 **Impact**: This shapes our entire approach

Please describe the problem in detail:

[Confidence: ░░░░░░░░░░ 0%]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**WAIT FOR USER RESPONSE**

After response, continue with:

```
💭 Processing your answer...
⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏

┌─────────────────────────────────────────────────────┐
│     🤔 Let's understand the problem...              │
│                                                     │
│     Question 2 of many                             │
└─────────────────────────────────────────────────────┘

❓ **Who experiences this problem?**

📋 **Context**: Understanding the affected users helps define requirements
💡 **Why this matters**: Different users have different needs
🎯 **Impact**: This will influence our user experience design

Examples: End users, developers, administrators, specific teams

[Confidence: █░░░░░░░░░ 5%]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Continue with problem definition questions:
- What's the current workaround (if any)?
- How frequently does this problem occur?
- What's the impact when this problem happens?
- Is this a new problem or has it existed for a while?
- Are there any deadlines or time constraints?

## 📋 Phase 2: Scope & Requirements (20% → 40% Confidence)

### 🌿 Defining Boundaries

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌿 Scope Definition - Iteration 2
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✨ Key Understanding So Far:
• [Problem summary from Phase 1]
• [User impact summary]
• [Frequency and urgency]

Now let's define what we're building...

┌─────────────────────────────────────────────────────┐
│     🎯 Defining the scope...                       │
│                                                     │
│     Question X of many                             │
└─────────────────────────────────────────────────────┘

❓ **What specific functionality MUST be included?**

📋 **Context**: These are your non-negotiable requirements
💡 **Why this matters**: Defines minimum viable solution
🎯 **Impact**: These become our core features

Please list the must-have features:

[Confidence: ██░░░░░░░░ 20%]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Continue with scope questions:
- What is explicitly OUT of scope?
- Are there nice-to-have features we should note?
- Should this integrate with existing features?
- Are there any constraints we must respect?
- What existing code/systems will this touch?

## 📋 Phase 3: Technical Details (40% → 60% Confidence)

### 🌳 Technical Requirements

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌳 Technical Details - Iteration 3
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✨ Requirements Defined:
• Must-have: [list from Phase 2]
• Out of scope: [list from Phase 2]
• Constraints: [list from Phase 2]

Now for technical specifics...

┌─────────────────────────────────────────────────────┐
│     🔧 Technical requirements...                    │
│                                                     │
│     Question X of many                             │
└─────────────────────────────────────────────────────┘

❓ **What programming language/framework should this use?**

📋 **Context**: Need to match your tech stack
💡 **Why this matters**: Ensures compatibility
🎯 **Impact**: Determines implementation approach

Current tech stack or preferences:

[Confidence: ████░░░░░░ 40%]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Continue with technical questions:
- Any specific libraries or dependencies?
- Performance requirements or constraints?
- Data storage requirements?
- API design preferences (REST, GraphQL, etc.)?
- Security considerations?
- Browser/platform compatibility needs?

## 📋 Phase 4: Implementation Approach (60% → 80% Confidence)

### 🌲 Implementation Strategy

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌲 Implementation Planning - Iteration 4
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✨ Technical Foundation:
• Language/Framework: [from Phase 3]
• Dependencies: [from Phase 3]
• Architecture: [from Phase 3]

Planning the implementation...

┌─────────────────────────────────────────────────────┐
│     📝 Implementation approach...                   │
│                                                     │
│     Question X of many                             │
└─────────────────────────────────────────────────────┘

❓ **Should this be implemented in phases?**

📋 **Context**: Breaking into phases can reduce risk
💡 **Why this matters**: Affects delivery timeline
🎯 **Impact**: Determines our implementation plan

Options:
1. Single phase - implement everything at once
2. Multiple phases - MVP first, then enhancements
3. Feature flags - gradual rollout

Your preference (1/2/3 or explain):

[Confidence: ██████░░░░ 60%]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Continue with implementation questions:
- Testing strategy preferences?
- Documentation requirements?
- Code review process?
- Deployment approach?
- Monitoring and logging needs?

## 📋 Phase 5: Edge Cases & Polish (80% → 100% Confidence)

### 🎄 Final Refinement

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎄 Final Refinement - Iteration 5
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✨ Nearly Complete Understanding:
• Problem: [defined]
• Scope: [defined]
• Technical: [defined]
• Implementation: [planned]

Final details...

┌─────────────────────────────────────────────────────┐
│     🔍 Edge cases and polish...                    │
│                                                     │
│     Question X of many                             │
└─────────────────────────────────────────────────────┘

❓ **What edge cases should we handle?**

📋 **Context**: Thinking about failure scenarios
💡 **Why this matters**: Improves robustness
🎯 **Impact**: Prevents future bugs

Examples: Network failures, invalid input, race conditions

[Confidence: ████████░░ 80%]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Continue with polish questions:
- Error handling preferences?
- User feedback mechanisms?
- Accessibility requirements?
- Internationalization needs?
- Any specific UX preferences?
- Migration path from current state?

## 🔄 Iteration Check

After each phase, present:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Phase Complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Current Confidence: ${confidence}%
${generateProgressBar(confidence)}

✨ What We've Learned:
• [Key insight 1]
• [Key insight 2]
• [Key insight 3]

🤔 Remaining Questions:
• [Uncertainty 1]
• [Uncertainty 2]

┌─────────────────────────────────────────────────────┐
│  ${confidence >= 90 ? '🎯 Ready to generate spec!' : '🔍 More clarification needed'}  │
└─────────────────────────────────────────────────────┘

Continue refining? (yes/no)
Default: ${confidence < 90 ? 'yes ✨' : 'no - generate spec ✅'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## 📝 Output Generation

Once confidence >= 90% or user chooses to finish:

```
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║            🎉 BRAINSTORM SESSION COMPLETE! 🎉                ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝

📊 Session Summary:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📁 Session: ${session.sessionPath}
❓ Questions Asked: ${session.questions.length}
🎯 Final Confidence: ${session.confidence}%
⏱️ Duration: ${calculateDuration()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Generate the brainstorm output file at `${session.sessionPath}/output.md`:

```markdown
# Brainstorm Output: ${session.topic}

Generated: ${session.timestamp}
Confidence: ${session.confidence}%
Questions Asked: ${session.questions.length}

## Problem Statement
${session.understanding.problem}

## Goals
${generateGoalsList()}

## Non-Goals
${generateNonGoalsList()}

## Technical Requirements
${generateTechnicalRequirements()}

## Scope Definition
### In Scope
${generateInScope()}

### Out of Scope
${generateOutOfScope()}

## Implementation Approach
${generateImplementationApproach()}

## Edge Cases & Considerations
${generateEdgeCases()}

## Testing Strategy
${generateTestingStrategy()}

## Open Questions
${generateOpenQuestions()}

## Next Steps
1. Run `/spec:create` using this brainstorm output
2. Review generated specification
3. Begin implementation

---
*Generated through ${session.iterations} iterations of interactive brainstorming*
*Total questions answered: ${session.questions.length}*
```

Save all Q&A history to `${session.sessionPath}/questions-answered.json`

```
✅ Brainstorm output saved to:
   ${session.sessionPath}/output.md

🚀 Next step: Run the following command to create a specification:
   /spec:create ${session.sessionPath}/output.md

The spec:create command will use this brainstorm to generate a 
comprehensive specification document.
```

## 🔑 Key Principles

1. **NEVER ASSUME** - Always ask for clarification
2. **ONE AT A TIME** - Present questions individually with context
3. **VISUAL FEEDBACK** - Progress bars, emojis, animations
4. **ADAPTIVE** - Questions based on previous answers
5. **PERSISTENT** - Save everything for spec:create
6. **NO LIMITS** - Continue until clarity achieved

## Helper Functions

```javascript
const generateProgressBar = (confidence) => {
  const filled = Math.round(confidence / 10)
  const empty = 10 - filled
  return '█'.repeat(filled) + '░'.repeat(empty)
}

const calculateDuration = () => {
  // Calculate time from session start to now
  const start = new Date(session.timestamp)
  const now = new Date()
  const diff = now - start
  const minutes = Math.floor(diff / 60000)
  return `${minutes} minutes`
}
```

Remember: ASK EVERYTHING, ASSUME NOTHING!