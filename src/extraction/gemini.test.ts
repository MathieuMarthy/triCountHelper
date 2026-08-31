import { afterEach, describe, expect, it, vi } from 'vitest';

const geminiMocks = vi.hoisted(() => ({
  generateContent: vi.fn(),
  listModels: vi.fn(),
  googleGenAI: vi.fn(),
}));

vi.mock('@google/genai', () => {
  class MockApiError extends Error {
    status: number;

    constructor({ message, status }: { message: string; status: number }) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
    }
  }

  geminiMocks.googleGenAI.mockImplementation(() => ({
    models: {
      generateContent: geminiMocks.generateContent,
      list: geminiMocks.listModels,
    },
  }));

  return {
    ApiError: MockApiError,
    createPartFromBase64: (data: string, mimeType: string) => ({ inlineData: { data, mimeType } }),
    createPartFromText: (text: string) => ({ text }),
    GoogleGenAI: geminiMocks.googleGenAI,
  };
});

import { ApiError, GoogleGenAI } from '@google/genai';
import { ExtractionError, clearModelCapsCache, extractWithGemini, listModels } from './gemini';

function geminiSays(payload: unknown) {
  return { text: JSON.stringify(payload) };
}

function makePager(items: unknown[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const item of items) {
        yield item;
      }
    },
  };
}

const image = new Blob(['photo'], { type: 'image/jpeg' });

afterEach(() => {
  vi.unstubAllGlobals();
  geminiMocks.generateContent.mockReset();
  geminiMocks.listModels.mockReset();
  geminiMocks.googleGenAI.mockClear();
  clearModelCapsCache();
});

describe('extractWithGemini', () => {
  it('transmet la clé au client Gemini et prépare un appel JSON', async () => {
    geminiMocks.generateContent.mockResolvedValue(geminiSays({ lines: [{ label: 'PAIN', total: '1,05' }] }));

    await extractWithGemini(image, { apiKey: 'secret-key', model: 'gemini-test' });

    expect(GoogleGenAI).toHaveBeenCalledWith({ apiKey: 'secret-key' });
    const [params] = geminiMocks.generateContent.mock.calls[0] as [
      {
        model: string;
        contents: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }>;
        config: {
          temperature: number;
          responseMimeType: string;
          responseJsonSchema: { required: string[] };
          thinkingConfig?: { thinkingBudget: number };
        };
      },
    ];
    expect(params.model).toBe('gemini-test');
    expect(params.config.temperature).toBe(0);
    expect(params.config.responseMimeType).toBe('application/json');
    expect(params.config.responseJsonSchema.required).toContain('lines');
    const content = params.contents[0] as unknown as {
      role?: string;
      parts?: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }>;
    };
    expect(content.role).toBe('user');
    expect(content.parts?.[0]?.text).toContain(
      'Tu lis un ticket de caisse canadien photographié',
    );
    expect(content.parts?.[1]?.inlineData?.mimeType).toBe('image/jpeg');
  });

  it('rend une sortie normalisée, en centimes entiers', async () => {
    geminiMocks.generateContent.mockResolvedValue(
      geminiSays({
        merchant: 'IGA',
        subtotal: '4,05',
        total: '4,25',
        taxes: [{ label: 'TPS', rate: '5', amount: '0,20' }],
        lines: [
          { label: 'PAIN', total: '1,05', taxable: false },
          { label: 'LAIT', total: '3,00', quantity: 2, unitPrice: '1,50' },
        ],
      }),
    );

    const result = await extractWithGemini(image, { apiKey: 'k' });
    expect(result.merchant).toBe('IGA');
    expect(result.statedSubtotalCents).toBe(405);
    expect(result.statedTotalCents).toBe(425);
    expect(result.lines.map((line) => line.totalCents)).toEqual([105, 300]);
    expect(result.lines[0]?.taxCodes).toEqual([]);
    expect(result.taxes).toEqual([{ code: 'TPS', label: 'TPS', ratePercent: 5, amountCents: 20 }]);
  });

  it('refuse de partir sans clé, et le dit sans jargon', async () => {
    await expect(extractWithGemini(image, { apiKey: '   ' })).rejects.toThrow(ExtractionError);
    expect(GoogleGenAI).not.toHaveBeenCalled();
    expect(geminiMocks.generateContent).not.toHaveBeenCalled();
  });

  it.each([
    [401, /clé API a été refusée/i, false],
    [404, /modèle est introuvable/i, false],
    [429, /Quota atteint/i, false],
    [503, /momentanément indisponible/i, true],
  ])('traduit le code %i en message utile', async (status, pattern, retryable) => {
    geminiMocks.generateContent.mockRejectedValue(new ApiError({ message: 'boom', status }));

    const error = await extractWithGemini(image, { apiKey: 'k' }).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(ExtractionError);
    expect((error as ExtractionError).message).toMatch(pattern);
    expect((error as ExtractionError).retryable).toBe(retryable);
  });

  it('signale une réponse vide plutôt que de rendre un ticket vide', async () => {
    geminiMocks.generateContent.mockResolvedValue({ text: '' });
    await expect(extractWithGemini(image, { apiKey: 'k' })).rejects.toThrow(/pas pu être lu/i);
  });

  it('signale un JSON invalide', async () => {
    geminiMocks.generateContent.mockResolvedValue({ text: '{ pas du json' });
    await expect(extractWithGemini(image, { apiKey: 'k' })).rejects.toThrow(/inexploitable/i);
  });

  it('ne tente rien hors ligne, et propose d’attendre', async () => {
    vi.stubGlobal('navigator', { ...navigator, onLine: false });

    const error = await extractWithGemini(image, { apiKey: 'k' }).catch((value: unknown) => value);
    expect((error as ExtractionError).message).toMatch(/réseau/i);
    expect((error as ExtractionError).retryable).toBe(true);
    expect(GoogleGenAI).not.toHaveBeenCalled();
  });

  it('rend compte de la progression au fil des étapes', async () => {
    geminiMocks.generateContent.mockResolvedValue(geminiSays({ lines: [] }));
    const phases: string[] = [];

    await extractWithGemini(image, {
      apiKey: 'k',
      onProgress: ({ phase }) => phases.push(phase),
    });

    expect(phases).toEqual(['prepare', 'upload', 'read']);
  });
});

describe('extractWithGemini — robustesse de l’appel', () => {
  it('réessaie sans schéma structuré quand le modèle rejette ce mode', async () => {
    geminiMocks.generateContent
      .mockRejectedValueOnce(new ApiError({ message: 'Request contains an invalid argument.', status: 400 }))
      .mockResolvedValueOnce(geminiSays({ lines: [{ label: 'A', total: '1,00' }] }));

    const result = await extractWithGemini(image, { apiKey: 'k' });
    expect(result.lines).toHaveLength(1);
    expect(geminiMocks.generateContent).toHaveBeenCalledTimes(2);

    const first = geminiMocks.generateContent.mock.calls[0]?.[0] as {
      config: { responseJsonSchema?: unknown };
    };
    const second = geminiMocks.generateContent.mock.calls[1]?.[0] as {
      config: { responseJsonSchema?: unknown };
    };
    expect(first.config.responseJsonSchema).toBeDefined();
    expect(second.config.responseJsonSchema).toBeUndefined();
  });

  it('ne réessaie pas sur un 400 qui parle d’autre chose', async () => {
    geminiMocks.generateContent.mockRejectedValue(new ApiError({ message: 'API key not valid', status: 400 }));

    await expect(extractWithGemini(image, { apiKey: 'k' })).rejects.toThrow(ExtractionError);
    expect(geminiMocks.generateContent).toHaveBeenCalledTimes(1);
  });

  it('dit combien de temps l’appel a duré avant d’abandonner', async () => {
    geminiMocks.generateContent.mockReturnValue(new Promise(() => undefined));

    const error = await extractWithGemini(image, { apiKey: 'k', timeoutMs: 20 }).catch(
      (value: unknown) => value,
    );
    expect((error as ExtractionError).message).toMatch(/a dépassé \d+ s/);
    expect((error as ExtractionError).message).toMatch(/modèle plus rapide/);
    expect((error as ExtractionError).retryable).toBe(true);
  });
});

describe('listModels', () => {
  it('ne garde que les modèles capables de generateContent, sans le préfixe', async () => {
    geminiMocks.listModels.mockResolvedValue(
      makePager([
        {
          name: 'models/gemini-2.5-flash',
          displayName: 'Gemini 2.5 Flash',
          supportedActions: ['generateContent'],
        },
        {
          name: 'models/text-embedding-004',
          displayName: 'Embedding',
          supportedActions: ['embedContent'],
        },
      ]),
    );

    const models = await listModels('k');
    expect(models).toEqual([{ name: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' }]);
  });

  it('traduit une clé refusée en message utile', async () => {
    geminiMocks.listModels.mockRejectedValue(new ApiError({ message: 'denied', status: 403 }));
    await expect(listModels('mauvaise')).rejects.toThrow(/clé API a été refusée/i);
  });

  it('refuse de partir sans clé', async () => {
    await expect(listModels('  ')).rejects.toThrow(ExtractionError);
    expect(GoogleGenAI).not.toHaveBeenCalled();
    expect(geminiMocks.listModels).not.toHaveBeenCalled();
  });
});
