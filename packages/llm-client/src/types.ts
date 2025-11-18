import { LoggableMetadata } from "@glass-frontier/utils";

export type PromptInput = {
  role: 'user' | 'developer'
  content: {
    type: 'text',
    text: string
  }
}
export type Prompt = {
  instructions: string,
  input: PromptInput[]
}


export type LLMRequest = {
  max_tokens: number,
  model: string,
  instructions: string,
  input: PromptInput[]
  metadata: LoggableMetadata,
  reasoning: {
    effort: 'minimal' | 'high'
  }
  text: {
    format: any,
    verbosity: 'low' | 'high'
  }
}

export type LLMResponse = {
  attempts: number,
  message: string,
  record: Record<string, any>,
  requestId: string,
  usage: Record<string, any>,
}