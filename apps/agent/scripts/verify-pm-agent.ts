/**
 * PM Agent live verification.
 * Calls Claude to generate a draft spec and finalizes it.
 *
 * Run:
 *   ANTHROPIC_API_KEY=xxx npx tsx scripts/verify-pm-agent.ts
 */

import { PMAgent } from '../src/agents/pm-agent.js'
import type { ProgressEvent } from '../src/agents/types.js'

const TEST_INPUT = '我需要一个报销申请系统'

function emit(event: ProgressEvent) {
  switch (event.type) {
    case 'agent_start':
      console.log(`\n[${event.agent}] ${event.message}`)
      break
    case 'agent_thinking':
      console.log(`  → ${event.content}`)
      break
    case 'agent_done':
      console.log(`  ✓ ${event.summary}`)
      break
    case 'agent_error':
      console.error(`  ✗ ${event.error}`)
      break
  }
}

async function main() {
  console.log('═══════════════════════════════════════')
  console.log('  Forge — PM Agent Verification')
  console.log('═══════════════════════════════════════')
  console.log(`\nInput: "${TEST_INPUT}"\n`)

  const agent = new PMAgent()

  // Phase 1: generate draft
  console.log('[1/2] Generating draft spec...')
  const draft = await agent.draft(TEST_INPUT, emit)

  console.log('\n── Draft Spec ──────────────────────────')
  console.log(`Title:          ${draft.title}`)
  console.log(`Domain:         ${draft.business_domain}`)
  console.log(`Description:    ${draft.description}`)
  console.log(`Features:       ${draft.features.length} total`)

  const byConfidence = {
    high:   draft.features.filter(f => f.confidence === 'high').length,
    medium: draft.features.filter(f => f.confidence === 'medium').length,
    low:    draft.features.filter(f => f.confidence === 'low').length,
  }
  console.log(`  high:   ${byConfidence.high} (auto-selected)`)
  console.log(`  medium: ${byConfidence.medium} (auto-selected)`)
  console.log(`  low:    ${byConfidence.low} (deselected by default)`)

  console.log('\nFeature list:')
  for (const f of draft.features) {
    const mark = f.selected ? '☑' : '☐'
    console.log(`  ${mark} [${f.confidence.padEnd(6)}] ${f.name}`)
    for (const c of f.acceptance_criteria.slice(0, 2)) {
      console.log(`       • ${c}`)
    }
  }

  if (draft.constraints.auth)        console.log('\n  Constraint: auth required')
  if (draft.constraints.file_upload) console.log('  Constraint: file upload required')
  if (draft.constraints.email)       console.log('  Constraint: email required')

  if (draft.clarifying_questions.length > 0) {
    console.log('\nClarifying questions:')
    draft.clarifying_questions.forEach(q => console.log(`  ? ${q}`))
  }

  // Phase 2: finalize (simulate user keeping all selected features)
  console.log('\n[2/2] Finalizing spec (simulating user confirm)...')
  const spec = agent.finalize(draft)

  console.log(`\n── Final spec.json ─────────────────────`)
  console.log(`ID:       ${spec.id}`)
  console.log(`Features: ${spec.features.length} (selected by user)`)
  console.log(JSON.stringify(spec, null, 2).split('\n').slice(0, 30).join('\n'))
  if (JSON.stringify(spec, null, 2).split('\n').length > 30) {
    console.log('  ... (truncated)')
  }

  console.log('\n═══════════════════════════════════════')
  console.log('  ✓ PM Agent verification passed')
  console.log('═══════════════════════════════════════\n')
}

main().catch(err => {
  console.error('\n[FATAL]', err)
  process.exit(1)
})
