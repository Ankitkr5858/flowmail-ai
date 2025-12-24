import { invokeEdgeFunction } from './edgeFunctions';

export const generateEmailContent = async (
  topic: string,
  tone: string,
  audienceType?: string,
): Promise<{ subject: string; body: string; previewText?: string; subjectOptions?: string[]; previewOptions?: string[] }> => {
  try {
    const data = await invokeEdgeFunction<any>('generate-email', { topic, tone, audienceType, wantVariants: true });

    return {
      subject: String((data as any)?.subject ?? '').trim(),
      body: String((data as any)?.body ?? '').trim(),
      previewText: String((data as any)?.previewText ?? '').trim() || undefined,
      subjectOptions: Array.isArray((data as any)?.subjectOptions) ? (data as any).subjectOptions : undefined,
      previewOptions: Array.isArray((data as any)?.previewOptions) ? (data as any).previewOptions : undefined,
    };
  } catch (error) {
    console.error("Error generating email content:", error);
    return {
      subject: "Error generating content",
      body: "Please try again later or check your Supabase Edge Function + GEMINI_API_KEY secret."
    };
  }
};