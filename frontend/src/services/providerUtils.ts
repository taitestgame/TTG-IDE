import { MultiAIConfig, AIProviderConfig } from '../types';

/**
 * Xác định tên nhà cung cấp (Provider Name) cho một Model
 */
export const getProviderNameForModel = (
  m: MultiAIConfig,
  providers: AIProviderConfig[] = []
): string => {
  if (m.providerName) return m.providerName;
  if (m.providerId) {
    const found = providers.find((p) => p.id === m.providerId);
    if (found) return found.name;
  }
  if (m.baseUrl) {
    const cleanUrl = m.baseUrl.replace(/\/+$/, '');
    const foundByUrl = providers.find(
      (p) => p.baseUrl && p.baseUrl.replace(/\/+$/, '') === cleanUrl
    );
    if (foundByUrl) return foundByUrl.name;

    if (cleanUrl.includes('5050')) return 'OpenCode Free Bridge (:5050)';
    if (cleanUrl.includes('k17ai')) return 'K17 AI (k17ai.vn)';
    if (cleanUrl.includes('openrouter')) return 'OpenRouter';
    if (cleanUrl.includes('anthropic')) return 'Anthropic Claude';
    if (cleanUrl.includes('openai')) return 'OpenAI';
    if (cleanUrl.includes('deepseek')) return 'DeepSeek';
    if (cleanUrl.includes('groq')) return 'Groq Cloud';
    if (cleanUrl.includes('11434')) return 'Ollama Local';
    return cleanUrl;
  }
  return 'Mô hình khác';
};
