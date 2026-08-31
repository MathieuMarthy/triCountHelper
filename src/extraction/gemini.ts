import { ApiError, GoogleGenAI, createPartFromBase64, createPartFromText } from '@google/genai';
import { downscaleForUpload } from '../capture/image';
import { normalizeExtraction } from './normalize';
import { DEFAULT_GEMINI_MODEL } from './model';
import type { ExtractionResult } from './types';

export { DEFAULT_GEMINI_MODEL };

export type ExtractionPhase = 'prepare' | 'upload' | 'read';

export type ExtractionProgress = { phase: ExtractionPhase; label: string };

export class ExtractionError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'ExtractionError';
  }
}

const PROMPT = `Tu lis un ticket de caisse canadien photographié. Rends son contenu en JSON.

━━ EXHAUSTIVITÉ — priorité absolue ━━
Parcours le ticket du haut vers le bas sans sauter une seule ligne d'article.
- Une entrée dans "lines" par ligne d'article, dans l'ordre exact.
- "label" : libellé exact tel qu'imprimé sur le ticket (abréviations comprises).
- "description" : explication claire et intelligible du produit en français (ex. décoder "CR GCE VAN" en "Crème glacée vanille", "PQ CHARMIN 12" en "Papier hygiénique Charmin 12 rouleaux", "POM MCINT SAC" en "Sac de pommes McIntosh", "CSHG CANETTE" en "Consigne de canette"). Si le nom est déjà clair, reformule-le simplement de manière concise sans inventer d'informations.
- Si une ligne est floue ou partiellement illisible, donne ta meilleure lecture et mets "uncertain": true. Ne supprime jamais une ligne sous prétexte d'illisibilité.
- Avant de répondre, vérifie que la somme de tous tes "total" correspond au sous-total imprimé. S'il y a un écart, cherche les lignes manquantes.

━━ MONTANTS ━━
- Rendus exactement comme imprimés, en chaîne : "12,90" ou "12.90" selon le ticket, sans symbole de devise.
- Les prix des articles sont lus tels qu'imprimés — ils intègrent déjà tout rabais éventuel.
- "total" = total de la ligne, quantité comprise. "unitPrice" = prix à l'unité. "quantity" = 1 si non précisé.

━━ LIGNES À EXCLURE DE "lines" ━━
Ne mets PAS dans "lines" : rabais/remises, consignes, SOUS-TOTAL, TOTAL, TPS/GST, TVQ/QST, TVH/HST, TVP/PST, comptant, débit, crédit, INTERAC, monnaie rendue, MERCI, nombre d'articles, points de fidélité, économies totales, solde carte, numéro de transaction.

━━ TAXABLE — règles canadiennes ━━
Au Canada (Québec, Ontario, etc.), les épiceries de base sont EXONÉRÉES de TPS et de TVQ/TVP :
  • Exonérés (taxable: false) : légumes, fruits, viandes, poissons, produits laitiers (lait, fromage, yogourt nature), pain, céréales, œufs, jus de fruits pur.
  • Taxables (taxable: true) : boissons alcoolisées (bière, vin, spiritueux), bonbons, chips/croustilles, boissons sucrées/énergisantes, articles non alimentaires, repas préparés/prêts-à-manger chauds.
  • Ambigus : si un marqueur (T, *, F, P, A ou autre code) est imprimé en fin de ligne → taxable: true. Sans marqueur et sans doute → suis les règles ci-dessus. Si vraiment incertain, omets le champ.

━━ AUTRES CHAMPS ━━
- "taxes" : chaque ligne de taxe du pied de ticket — "label" tel qu'imprimé, "rate" si présent (ex. "5"), "amount".
- "subtotal" : sous-total avant taxes imprimé sur le ticket.
- "total" (racine) : total à payer.
- "purchaseDate" : format AAAA-MM-JJ, vide si absente.`

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    merchant: { type: 'STRING' },
    purchaseDate: { type: 'STRING' },
    subtotal: { type: 'STRING' },
    total: { type: 'STRING' },
    taxes: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          label: { type: 'STRING' },
          rate: { type: 'STRING' },
          amount: { type: 'STRING' },
        },
        required: ['label', 'amount'],
      },
    },
    lines: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          label: { type: 'STRING' },
          description: { type: 'STRING' },
          quantity: { type: 'NUMBER' },
          unitPrice: { type: 'STRING' },
          total: { type: 'STRING' },
          taxable: { type: 'BOOLEAN' },
          uncertain: { type: 'BOOLEAN' },
        },
        required: ['label', 'total'],
      },
    },
  },
  required: ['lines'],
};

function toJsonSchema(schema: unknown): unknown {
  if (Array.isArray(schema) || schema === null || typeof schema !== 'object') return schema;

  const input = schema as Record<string, unknown>;
  const output: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (key === 'type' && typeof value === 'string') {
      output.type = value.toLowerCase();
      continue;
    }
    if (key === 'properties' && value && typeof value === 'object' && !Array.isArray(value)) {
      const properties: Record<string, unknown> = {};
      for (const [propertyName, propertySchema] of Object.entries(value as Record<string, unknown>)) {
        properties[propertyName] = toJsonSchema(propertySchema);
      }
      output.properties = properties;
      continue;
    }
    if (key === 'items') {
      output.items = toJsonSchema(value);
      continue;
    }
    output[key] = toJsonSchema(value);
  }

  return output;
}

const JSON_SCHEMA = toJsonSchema(SCHEMA);

async function toBase64(blob: Blob): Promise<string> {
  const buffer = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < buffer.length; i += CHUNK) {
    binary += String.fromCharCode(...buffer.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

type ModelLike = {
  name?: string;
  displayName?: string;
  supportedActions?: string[];
  supportedGenerationMethods?: string[];
};

const MULTIMODAL_MODEL_PATTERN = /^(gemini-(?:1\.5|2(?:\.0|\.5)?|3(?:\.[0-9]+)?)|gemini-(?:flash|pro|flash-lite)-latest|gemini-3(?:\.[0-9]+)?-(?:flash|pro|flash-lite)|gemini-3(?:\.[0-9]+)?-(?:flash|pro|flash-lite)-preview|gemini-2\.5-flash-image|gemini-3\.1-flash-image|gemini-3-pro-image|nano-banana-pro-preview)/i;

function createClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey: apiKey.trim() });
}

function logGemini(event: string, details: Record<string, unknown>): void {
  console.log('[gemini]', event, details);
}

function buildContents(data: string, mimeType: string) {
  return [
    {
      role: 'user' as const,
      parts: [createPartFromText(PROMPT), createPartFromBase64(data, mimeType)],
    },
  ];
}

function supportsGenerateContent(model: ModelLike): boolean {
  const methods = model.supportedActions ?? model.supportedGenerationMethods;
  return methods === undefined || methods.includes('generateContent');
}

function supportsReceiptImages(model: ModelLike): boolean {
  const name = (model.name ?? '').replace(/^models\//, '');
  return MULTIMODAL_MODEL_PATTERN.test(name);
}

function isApiError(error: unknown): error is ApiError {
  return (
    error instanceof ApiError ||
    (typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      typeof (error as { status: unknown }).status === 'number')
  );
}

class ExtractionTimeoutError extends Error {
  constructor() {
    super('timeout');
    this.name = 'ExtractionTimeoutError';
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ExtractionTimeoutError()), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function wrapExtractionError(error: unknown, startedAt: number): ExtractionError {
  const seconds = Math.round((Date.now() - startedAt) / 1000);
  if (error instanceof ExtractionTimeoutError) {
    return new ExtractionError(
      `La lecture a dépassé ${seconds} s. Recadrez au plus près, ou essayez un modèle plus rapide dans les réglages.`,
      true,
    );
  }
  if (isApiError(error)) {
    const detail = error.message.trim();
    const message = detail === '' ? messageForStatus(error.status) : `${messageForStatus(error.status)} ${detail}`;
    return new ExtractionError(message, error.status >= 500);
  }
  return new ExtractionError("Le service n'a pas pu être joint. Vérifiez la connexion.", true);
}

export type ExtractOptions = {
  apiKey: string;
  model?: string;
  onProgress?: (progress: ExtractionProgress) => void;
  timeoutMs?: number;
};

type ModelCaps = { useThinkingConfig: boolean; structured: boolean };
const modelCapsCache = new Map<string, ModelCaps>();

export function clearModelCapsCache(): void {
  modelCapsCache.clear();
}

const CAPS_PROBE_ORDER: ModelCaps[] = [
  { useThinkingConfig: false, structured: true },
  { useThinkingConfig: false, structured: false },
  { useThinkingConfig: true, structured: true },
  { useThinkingConfig: true, structured: false },
];

export async function extractWithGemini(
  image: Blob,
  { apiKey, model = DEFAULT_GEMINI_MODEL, onProgress, timeoutMs = 60000 }: ExtractOptions,
): Promise<ExtractionResult> {
  if (apiKey.trim() === '') {
    throw new ExtractionError(
      "Aucune clé API n'est renseignée. Ajoutez-la dans les réglages, ou saisissez le ticket à la main.",
      false,
    );
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new ExtractionError(
      'La lecture automatique a besoin du réseau. Saisissez le ticket à la main en attendant.',
      true,
    );
  }

  onProgress?.({ phase: 'prepare', label: 'Préparation de l\u2019image' });
  const reduced = await downscaleForUpload(image);
  const mimeType = reduced.type || 'image/jpeg';
  const data = await toBase64(reduced);

  onProgress?.({ phase: 'upload', label: 'Envoi de la photo' });
  const startedAt = Date.now();
  const client = createClient(apiKey);

  async function attempt(caps: ModelCaps): Promise<string> {
    logGemini('request:attempt', {
      model,
      structured: caps.structured,
      useThinkingConfig: caps.useThinkingConfig,
    });
    let response;
    try {
      response = await withTimeout(
        client.models.generateContent({
          model,
          contents: buildContents(data, mimeType),
          config: {
            temperature: 0,
            maxOutputTokens: 4096,
            ...(caps.structured
              ? {
                  responseMimeType: 'application/json',
                  responseJsonSchema: JSON_SCHEMA,
                }
              : {}),
            ...(caps.useThinkingConfig ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
          },
        }),
        timeoutMs,
      );
    } catch (err) {
      logGemini('request:attempt:fail', {
        model,
        structured: caps.structured,
        useThinkingConfig: caps.useThinkingConfig,
        status: isApiError(err) ? err.status : undefined,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
    logGemini('request:success', {
      model,
      structured: caps.structured,
      useThinkingConfig: caps.useThinkingConfig,
      responseLength: response.text?.length ?? 0,
      candidateCount: response.candidates?.length ?? 0,
    });
    return response.text ?? '';
  }

  function isRetryable400(error: unknown): boolean {
    if (!isApiError(error) || error.status !== 400) return false;
    const msg = (error.message || '').toLowerCase();
    if (msg.includes('api key') || msg.includes('api_key') || msg.includes('apikey')) {
      return false;
    }
    return true;
  }

  let text: string | undefined;
  try {
    const cached = modelCapsCache.get(model);
    if (cached) {
      logGemini('request:start', { model, caps: cached, source: 'cache' });
      try {
        text = await attempt(cached);
      } catch (err) {
        if (isRetryable400(err)) {
          logGemini('request:cache:invalidated', { model, failedCaps: cached });
          modelCapsCache.delete(model);
        } else {
          throw err;
        }
      }
    }
    if (text === undefined) {
      logGemini('request:start', { model, source: 'probe' });
      let lastError: unknown;
      let succeeded = false;
      for (const caps of CAPS_PROBE_ORDER) {
        try {
          text = await attempt(caps);
          modelCapsCache.set(model, caps);
          logGemini('request:caps:saved', { model, caps });
          succeeded = true;
          break;
        } catch (err) {
          lastError = err;
          if (!isRetryable400(err)) {
            break;
          }
          logGemini('request:probe:next', { model, failedCaps: caps });
        }
      }
      if (!succeeded) {
        throw lastError;
      }
    }
  } catch (error) {
    logGemini('request:error', {
      model,
      status: isApiError(error) ? error.status : undefined,
      code: isApiError(error) ? (error as { code?: unknown }).code : undefined,
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw wrapExtractionError(error, startedAt);
  }

  onProgress?.({ phase: 'read', label: 'Lecture du ticket' });
  if (text!.trim() === '') {
    throw new ExtractionError("Le ticket n'a pas pu être lu sur cette photo.", true);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text!);
  } catch {
    throw new ExtractionError('La réponse du service était inexploitable.', true);
  }

  return normalizeExtraction(parsed);
}

function messageForStatus(status: number): string {
  if (status === 400) return 'Requête refusée. Vérifiez la clé API et le nom du modèle dans les réglages.';
  if (status === 401 || status === 403) return 'La clé API a été refusée. Vérifiez-la dans les réglages.';
  if (status === 404) return 'Ce modèle est introuvable. Vérifiez son nom dans les réglages.';
  if (status === 429) return 'Quota atteint. Réessayez dans un moment.';
  if (status >= 500) return 'Le service est momentanément indisponible.';
  return "La lecture n'a pas abouti.";
}

export type AvailableModel = { name: string; displayName: string };

export async function listModels(apiKey: string): Promise<AvailableModel[]> {
  if (apiKey.trim() === '') {
    throw new ExtractionError("Aucune clé API n'est renseignée.", false);
  }

  try {
    const client = createClient(apiKey);
    const pager = await client.models.list({});
    const models: AvailableModel[] = [];
    for await (const entry of pager) {
      if (!supportsGenerateContent(entry as ModelLike) || !supportsReceiptImages(entry as ModelLike)) continue;
      models.push({
        name: (entry.name ?? '').replace(/^models\//, ''),
        displayName: entry.displayName ?? entry.name ?? '',
      });
    }
    logGemini('models:list', { count: models.length });
    return models.filter((entry) => entry.name !== '').sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    logGemini('models:error', {
      status: isApiError(error) ? error.status : undefined,
      code: isApiError(error) ? (error as { code?: unknown }).code : undefined,
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw new ExtractionError(
      isApiError(error) ? messageForStatus(error.status) : "Le service n'a pas pu être joint. Vérifiez la connexion.",
      isApiError(error) ? error.status >= 500 : true,
    );
  }
}
