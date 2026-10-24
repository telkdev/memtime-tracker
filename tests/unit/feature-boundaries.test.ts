// @vitest-environment node
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

// The feature boundaries are lint rules (eslint.config.mjs). This proves they fire, so a config
// change that silently turns them off fails CI instead of letting deep imports creep back in.
const eslint = new ESLint()

async function ruleErrors(filePath: string, code: string) {
  const [result] = await eslint.lintText(code, { filePath })
  return result!.messages.filter(m => m.ruleId === 'no-restricted-imports' || m.ruleId === 'no-restricted-syntax').map(m => m.message)
}

describe('feature boundaries', () => {
  it('blocks a deep import into another feature', async () => {
    const errors = await ruleErrors('app/features/entry-form/ui/Probe.ts',
      'import { useCatalog } from \'~/features/catalog/composables/useCatalog\'\nexport const x = useCatalog\n')
    expect(errors).toEqual([expect.stringContaining('through its index')])
  })

  it('blocks climbing out of a feature with ../../', async () => {
    const errors = await ruleErrors('app/features/entry-form/ui/Probe.ts',
      'import { useCatalog } from \'../../catalog/composables/useCatalog\'\nexport const x = useCatalog\n')
    expect(errors).toEqual([expect.stringContaining('../../')])
  })

  it('blocks common/ from importing any feature', async () => {
    const errors = await ruleErrors('app/common/lib/probe.ts',
      'import { useCatalog } from \'~/features/catalog\'\nexport const x = useCatalog\n')
    expect(errors).toEqual([expect.stringContaining('common/ never imports a feature')])
  })

  it('blocks $fetch outside an api/ folder', async () => {
    const errors = await ruleErrors('app/features/catalog/composables/probe.ts', 'export const x = () => $fetch(\'/api/clients\')\n')
    expect(errors).toEqual([expect.stringContaining('api/ folder')])
  })

  it('allows the public index and imports inside the same feature', async () => {
    expect(await ruleErrors('app/features/entry-form/ui/Probe.ts',
      'import { useCatalog } from \'~/features/catalog\'\nimport { mergeFieldErrors } from \'../model/rules\'\nexport const x = [useCatalog, mergeFieldErrors]\n')).toEqual([])
    expect(await ruleErrors('app/features/catalog/api/probe.ts', 'export const x = () => $fetch(\'/api/clients\')\n')).toEqual([])
  })
})
