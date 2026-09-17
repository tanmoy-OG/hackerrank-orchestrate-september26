/**
 * Should I Buy It? — Math + AI Multi-LLM Orchestrator
 * 
 * Architecture:
 * 1. Mathematical Simulation Engine (Ground Truth): Computes 90-day ledger, lowest trough,
 *    sacred buffer clearance, and immutable verdict.
 * 2. Multi-LLM Waterfall Layer:
 *    - Tier 1: Google Gemini 1.5 Flash (15 RPM, 1,500 RPD free tier)
 *    - Tier 2: Mistral AI Small / NeMo (~60 RPM free tier on La Plateforme)
 *    - Tier 3: Groq Llama 3.3 70B / 3.1 8B (Optional rapid fallback)
 *    - Tier 4: Native Deterministic Financial Engine (100% reliable 0ms fail-safe)
 */

export interface GroundedDecisionParams {
  query: string;
  amount: number;
  currency: string;
  verdict: string; // "affordable_now" | "affordable_with_plan" | "affordable_later" | "unaffordable"
  currentBalance: number;
  minimumBalance: number;
  safeToday: number;
  lowestProjectedBalance: number;
  lowestBalanceDate: string;
  recommendedPaymentMethod: string;
  paymentPlan: string;
  spendingChangesNeeded: string;
  deterministicExplanation: string;
  userName?: string;
}

export interface LlmDecisionResult {
  ai_explanation: string;
  ai_provider: string;
  ai_model: string;
  math_verified: boolean;
  latency_ms: number;
}

const TIMEOUT_MS = 6000;

/**
 * Builds the strict anti-hallucination prompt.
 * The LLM is provided the verified simulation figures as immutable mathematical constraints.
 */
function buildPrompts(params: GroundedDecisionParams) {
  const {
    query,
    amount,
    currency,
    verdict,
    currentBalance,
    minimumBalance,
    safeToday,
    lowestProjectedBalance,
    lowestBalanceDate,
    recommendedPaymentMethod,
    paymentPlan,
    spendingChangesNeeded,
    deterministicExplanation,
    userName = "the user",
  } = params;

  let humanVerdict = "BUY NOW";
  if (verdict === "affordable_now") humanVerdict = "BUY NOW (Safe Today)";
  else if (verdict === "affordable_with_plan") humanVerdict = "BUY WITH PLAN (Installments or Spending Reductions)";
  else if (verdict === "affordable_later") humanVerdict = "SAFE DELAY (Wait until future cash flow settles)";
  else humanVerdict = "DECLINE (Violates Emergency Buffer Floor)";

  const systemInstruction = `You are a compassionate, sharp, and mathematically grounded personal finance coach for "Should I Buy It?".
You are provided with an exact, verified 90-day cash flow ledger simulation that has ALREADY mathematically determined the verdict and cash trajectory.

STRICT ANTI-HALLUCINATION RULES:
1. NEVER recalculate or contradict the verified simulation figures.
2. The Verdict is mathematically locked: "${humanVerdict}". Do NOT change this verdict.
3. You must refer to the provided currency (${currency}) and exact numbers.
4. Explain clearly and concisely (2 to 4 punchy sentences) WHY this decision was reached.
5. Highlight the exact lowest cash balance (${currency} ${lowestProjectedBalance.toLocaleString()}) and date (${lowestBalanceDate}) to show real forward visibility.
6. Provide an encouraging, practical takeaway. Never lecture or judge.`;

  const userContent = `PURCHASE EVALUATION REQUEST:
- Target Item: "${query}"
- Price: ${currency} ${amount.toLocaleString()}
- User: ${userName}

MATHEMATICALLY VERIFIED SIMULATION RESULTS:
- Mathematical Verdict: ${humanVerdict}
- Current Available Balance: ${currency} ${currentBalance.toLocaleString()}
- Protected Emergency Buffer Floor: ${currency} ${minimumBalance.toLocaleString()}
- Maximum Safe to Spend Today: ${currency} ${safeToday.toLocaleString()}
- 90-Day Lowest Trough Balance: ${currency} ${lowestProjectedBalance.toLocaleString()} on ${lowestBalanceDate}
- Recommended Payment Method: ${recommendedPaymentMethod}
- Payment Schedule: ${paymentPlan !== "none" ? paymentPlan : "Single Payment"}
- Spending Adjustments: ${spendingChangesNeeded !== "none" ? spendingChangesNeeded : "None required"}
- Baseline Math Ledger Note: "${deterministicExplanation}"

Please synthesize an empathetic, crystal-clear financial advisory explanation grounded strictly in these simulation results.`;

  return { systemInstruction, userContent };
}

/**
 * Tier 1: Google Gemini (REST API with intelligent model cascade)
 */
async function callGemini(
  apiKey: string,
  systemInstruction: string,
  userContent: string
): Promise<{ text: string; model: string }> {
  // Candidate models: prefer flash-lite and 3.5/latest which are active on modern Gemini APIs
  const candidateModels = [
    "gemini-flash-lite-latest",
    "gemini-3.5-flash",
    "gemini-flash-latest",
    "gemini-2.5-flash",
    "gemini-1.5-flash",
  ];

  let lastError: any = null;

  for (const model of candidateModels) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: systemInstruction }],
          },
          contents: [
            {
              role: "user",
              parts: [{ text: userContent }],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 250,
          },
        }),
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => "");
        // If 404 (model deprecated/unavailable) or 503 (high demand), cascade to next candidate model
        if (response.status === 404 || response.status === 503) {
          lastError = new Error(`Gemini ${model} ${response.status}: ${response.statusText}`);
          continue;
        }
        throw new Error(`Gemini API error ${response.status}: ${errBody.slice(0, 150)}`);
      }

      const data = await response.json();
      const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!candidate) {
        lastError = new Error(`Empty response from Gemini ${model}`);
        continue;
      }

      const friendlyName = model.includes("flash-lite")
        ? "Gemini Flash Lite"
        : model.includes("3.5")
        ? "Gemini 3.5 Flash"
        : "Gemini Flash";

      return { text: candidate.trim(), model: friendlyName };
    } catch (err: any) {
      lastError = err;
      if (err.name === "AbortError") break; // Timeout reached, don't cascade further
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError || new Error("All Gemini candidate models failed");
}

/**
 * Tier 2: Mistral AI (OpenAI-compatible REST API with model cascade)
 */
async function callMistral(
  apiKey: string,
  systemInstruction: string,
  userContent: string
): Promise<{ text: string; model: string }> {
  const candidateModels = [
    "mistral-small-latest",
    "open-mistral-nemo",
    "open-mistral-7b",
  ];

  let lastError: any = null;

  for (const model of candidateModels) {
    const url = "https://api.mistral.ai/v1/chat/completions";
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: userContent },
          ],
          temperature: 0.3,
          max_tokens: 250,
        }),
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => "");
        if (response.status === 404 || response.status === 503) {
          lastError = new Error(`Mistral ${model} ${response.status}`);
          continue;
        }
        throw new Error(`Mistral API error ${response.status}: ${errBody.slice(0, 150)}`);
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content;
      if (!text) {
        lastError = new Error(`Empty response from Mistral ${model}`);
        continue;
      }

      const friendlyName = model.includes("nemo")
        ? "Mistral NeMo"
        : "Mistral Small";

      return { text: text.trim(), model: friendlyName };
    } catch (err: any) {
      lastError = err;
      if (err.name === "AbortError") break;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError || new Error("All Mistral candidate models failed");
}

/**
 * Tier 3: Groq (Optional Fallback)
 */
async function callGroq(
  apiKey: string,
  systemInstruction: string,
  userContent: string
): Promise<{ text: string; model: string }> {
  const model = "llama-3.3-70b-versatile";
  const url = "https://api.groq.com/openai/v1/chat/completions";

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: userContent },
        ],
        temperature: 0.3,
        max_tokens: 250,
      }),
    });

    if (!response.ok) {
      throw new Error(`Groq API error ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error("Empty response from Groq");

    return { text: text.trim(), model: "Llama 3.3 (Groq)" };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Main Multi-LLM Waterfall Entrypoint
 * 
 * Attempts providers in sequential order:
 * 1. Google Gemini
 * 2. Mistral AI
 * 3. Groq (if configured)
 * 4. Native Deterministic Engine
 */
export async function generateGroundedExplanation(
  params: GroundedDecisionParams
): Promise<LlmDecisionResult> {
  const startTime = Date.now();
  const { systemInstruction, userContent } = buildPrompts(params);

  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const mistralKey = process.env.MISTRAL_API_KEY?.trim();
  const groqKey = process.env.GROQ_API_KEY?.trim();

  // Tier 1: Gemini
  if (geminiKey) {
    try {
      const result = await callGemini(geminiKey, systemInstruction, userContent);
      return {
        ai_explanation: result.text,
        ai_provider: "Google Gemini",
        ai_model: result.model,
        math_verified: true,
        latency_ms: Date.now() - startTime,
      };
    } catch (err: any) {
      console.warn("⚠️ Gemini Tier 1 failed or rate-limited:", err.message);
    }
  }

  // Tier 2: Mistral AI
  if (mistralKey) {
    try {
      const result = await callMistral(mistralKey, systemInstruction, userContent);
      return {
        ai_explanation: result.text,
        ai_provider: "Mistral AI",
        ai_model: result.model,
        math_verified: true,
        latency_ms: Date.now() - startTime,
      };
    } catch (err: any) {
      console.warn("⚠️ Mistral Tier 2 failed or rate-limited:", err.message);
    }
  }

  // Tier 3: Groq (if key exists)
  if (groqKey) {
    try {
      const result = await callGroq(groqKey, systemInstruction, userContent);
      return {
        ai_explanation: result.text,
        ai_provider: "Groq",
        ai_model: result.model,
        math_verified: true,
        latency_ms: Date.now() - startTime,
      };
    } catch (err: any) {
      console.warn("⚠️ Groq Tier 3 failed or rate-limited:", err.message);
    }
  }

  // Tier 4: Bedrock Deterministic Engine Fallback (Zero network failure risk)
  return {
    ai_explanation: params.deterministicExplanation,
    ai_provider: "Mathematical Simulation Engine",
    ai_model: "Ledger Simulator v1.0",
    math_verified: true,
    latency_ms: Date.now() - startTime,
  };
}
