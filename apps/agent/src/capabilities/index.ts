import { BrowserCapability }  from './browser-capability.js'
import { HTTPCapability }     from './http-capability.js'
import { LLMCapability }      from './llm-capability.js'
import { NotifyCapability }   from './notify-capability.js'
import { CodeCapability }     from './code-capability.js'
import type { Capability }    from './types.js'

export type { Capability, RunContext, CapabilityResult } from './types.js'
export { BrowserCapability, HTTPCapability, LLMCapability, NotifyCapability, CodeCapability }

const REGISTRY: Record<string, Capability> = {
  browser: new BrowserCapability(),
  http:    new HTTPCapability(),
  llm:     new LLMCapability(),
  notify:  new NotifyCapability(),
  code:    new CodeCapability(),
}

export function getCapability(type: string): Capability | null {
  return REGISTRY[type] ?? null
}
