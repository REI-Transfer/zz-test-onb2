/**
 * lib/acquisition/vision.ts — Photo-based condition read.
 *
 * Listing remarks are marketing copy; photos are the only unmediated evidence in the
 * feed. This pass scores how dated the interior/exterior presents, independent of what
 * the remarks claim. Its verdict is blended 50/50 with the text score in condition.ts.
 *
 * Failure is non-fatal by design: the pipeline degrades to text-only scoring (with a
 * confidence penalty applied by the caller) rather than dropping the listing. A vendor
 * outage must not silently empty the deal queue.
 */

import Anthropic from "@anthropic-ai/sdk"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
// zodOutputFormat requires the Zod v4 API. This project pins zod 3.25.x, which ships
// the v4 implementation on the "zod/v4" subpath — so we get v4 here without forcing a
// major bump on the survey forms, which still use the v3 surface.
import { z } from "zod/v4"
import acquisitionConfig from "./config"
import type { VisionVerdict } from "./condition"
import type { Listing } from "./types"

const VisionSchema = z.object({
  datedScore: z
    .number()
    .min(0)
    .max(100)
    .describe("0 = fully renovated to current standards. 100 = wholly original/derelict."),
  tier: z
    .enum(["COSMETIC", "MODERATE", "HEAVY", "SEVERE"])
    .describe("Scope of work implied by what is visible."),
  roofEndOfLife: z
    .boolean()
    .describe("True only if an exterior photo shows clear roof failure: curling, missing or patched shingles, staining, sag."),
  observations: z
    .array(z.string())
    .max(10)
    .describe("Short concrete phrases naming what was actually visible, e.g. 'original oak cabinets', 'popcorn ceiling'."),
})

const SYSTEM_PROMPT = `You assess residential property condition from MLS listing photos for a real estate acquisitions pipeline.

Score how DATED and UNRENOVATED the property is. You are not assessing whether it is attractive, well-staged, or well-photographed — only how far it sits from current-standard finishes and functional systems.

Signals of a DATED property (raise the score):
- Original or heavily worn kitchens: laminate counters, oak/maple raised-panel cabinets, bisque or almond appliances, fluorescent box lighting
- Original baths: coloured tile, built-in soap dishes, single-pane shower doors, wall-hung sinks
- Popcorn or textured ceilings, wall panelling, wallpaper borders
- Worn carpet over the main living area, cracked or peeling vinyl, exposed subfloor
- Visible damage: water staining, sagging ceilings, cracked walls, exposed wiring, missing fixtures
- Exterior: failing roof, rotted fascia, cracked driveway, overgrown lot, boarded openings

Signals of a RENOVATED property (lower the score):
- Shaker cabinets, quartz or granite counters, stainless appliances, recessed LED lighting
- Luxury vinyl plank or new tile continuing through main areas
- Updated baths with frameless glass and current tile formats
- Clean roof lines, new soffit, fresh exterior paint

Judge only what is actually visible. Empty rooms are not evidence of condition either way. If photos are too few, too dark, or exclusively exterior, say so in observations and score conservatively toward the middle rather than guessing high.`

let client: Anthropic | null = null
const getClient = (): Anthropic => (client ??= new Anthropic())

/**
 * Run the photo pass. Returns null when vision is disabled, no photos exist, or the
 * call fails — all of which the caller treats as "text-only scoring".
 */
export async function assessPhotos(listing: Listing): Promise<VisionVerdict | null> {
  if (!acquisitionConfig.visionEnabled) return null

  const photos = listing.photos.slice(0, acquisitionConfig.visionMaxPhotos)
  if (photos.length === 0) return null

  try {
    const response = await getClient().messages.parse({
      model: acquisitionConfig.visionModel,
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "medium",
        format: zodOutputFormat(VisionSchema),
      },
      messages: [
        {
          role: "user",
          content: [
            ...photos.map((url) => ({
              type: "image" as const,
              source: { type: "url" as const, url },
            })),
            {
              type: "text" as const,
              text: [
                `Assess this property from the ${photos.length} listing photo(s) above.`,
                listing.yearBuilt ? `Year built: ${listing.yearBuilt}.` : "",
                listing.livingArea ? `Living area: ${listing.livingArea} sqft.` : "",
                "Ignore any condition claims you may infer from the listing text; score the photos alone.",
              ]
                .filter(Boolean)
                .join(" "),
            },
          ],
        },
      ],
    })

    // parsed_output is null when the model could not satisfy the schema.
    const parsed = response.parsed_output
    if (!parsed) return null

    return {
      datedScore: parsed.datedScore,
      tier: parsed.tier,
      roofEndOfLife: parsed.roofEndOfLife,
      observations: parsed.observations,
    }
  } catch (error) {
    // Most specific first. Every branch degrades to text-only rather than throwing —
    // see the module header for why this is deliberate.
    if (error instanceof Anthropic.RateLimitError) {
      console.warn(`[vision] rate limited on ${listing.listingId}; falling back to text-only`)
    } else if (error instanceof Anthropic.AuthenticationError) {
      console.error("[vision] ANTHROPIC_API_KEY missing or invalid; vision pass disabled for this run")
    } else if (error instanceof Anthropic.APIError) {
      console.warn(`[vision] API error ${error.status} on ${listing.listingId}: ${error.message}`)
    } else {
      console.warn(`[vision] unexpected failure on ${listing.listingId}:`, error)
    }
    return null
  }
}
