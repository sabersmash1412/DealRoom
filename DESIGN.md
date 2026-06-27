---
name: DealRoom
description: A premium marketplace UI where AI negotiates quietly in the background and users stay in control.
---

<!-- SEED: re-run $impeccable document once there's code to capture the actual tokens and components. -->

# Design System: DealRoom

## Overview

**Creative North Star: "The Quiet Deal Desk"**

DealRoom should feel like the next evolution of a trusted consumer marketplace: calm, precise, and commercially fluent. The interface must immediately read as product discovery, negotiation, and deal review, not as an AI demo. Buyers should feel like they are using a serious purchasing tool with clear governance, visible terms, and restrained polish.

This system borrows the confidence and spatial discipline of Stripe Dashboard, the product clarity of Linear, the restraint of Apple, and the familiarity of marketplace products such as Carousell and Airbnb without imitating any of them directly. The result should be dense enough for real buying decisions, but never cramped; premium, but never ornamental; modern, but never startup-performative.

The visual personality is defined by neutral architecture, strong hierarchy, crisp borders, and quiet accents. AI is present as a capability inside the workflow, not as the surface identity. Motion exists only to confirm state changes, preserve flow, and make negotiation feel responsive rather than theatrical.

**Key Characteristics:**
- Marketplace-first layouts with recognizable commerce affordances
- Dual-theme parity: light and dark mode must feel equally intentional
- Restrained accent usage with premium neutral surfaces
- Strong information hierarchy for listings, offers, and audit events
- Transparent, structured negotiation views instead of chatbot framing

## Colors

The palette must be restrained, neutral, and product-grade. Color carries trust and clarity, not spectacle.

### Primary
- **Slate Indigo** ([to be resolved during implementation]): The primary accent should live in the indigo-to-slate-blue family, deliberately cooler and grayer than "AI purple." Use it for primary actions, selected states, key links, and trusted verification moments. It must feel credible and composed rather than expressive for its own sake.

### Secondary
- **Verification Teal** ([to be resolved during implementation]): A secondary accent should sit in a muted teal or blue-green lane, distinct from the primary in both hue and lightness. Use it for verification signals, validated states, and secondary trust markers. It is not a decorative brand wash.

### Neutral
- **Light Canvas** ([to be resolved during implementation]): The default light surface should be near-white and neutral, not cream, parchment, or warm beige.
- **Panel Gray** ([to be resolved during implementation]): Secondary surfaces should separate listings, filters, side panels, and cards with subtle tone changes rather than shadow-heavy treatment.
- **Graphite Ink** ([to be resolved during implementation]): Light-theme text should be dark, high-contrast, and slightly cool rather than pure black.
- **Dark Canvas** ([to be resolved during implementation]): Dark mode should be truly deliberate, with deep neutral surfaces rather than tinted purple-black.
- **Steel Border** ([to be resolved during implementation]): Borders and dividers should be crisp and quiet, doing structural work without drawing attention.
- **Muted Copy** ([to be resolved during implementation]): Secondary text must remain readable and should never collapse into low-contrast gray.

**The Equal-Intent Rule.** Light mode and dark mode are peers. Dark mode is not an afterthought, and light mode is not the default "real" brand. Both must preserve the same hierarchy, restraint, and trust signals.

**The One-Accent Rule.** The primary accent stays rare. If a screen feels colorful, the system is already off course.

## Typography

**Display Font:** Single sans direction in the Apple/system interface lane ([final stack to be chosen during implementation])
**Body Font:** Single sans direction in the Apple/system interface lane ([final stack to be chosen during implementation])
**Label/Mono Font:** System mono only when genuinely needed for timestamps, IDs, or audit references ([final stack to be chosen during implementation])

**Character:** Typography should feel product-native, not editorial and not technical for its own sake. The system should rely on disciplined weight, spacing, and rhythm rather than font novelty.

### Hierarchy
- **Display** ([to be resolved during implementation]): Reserved for sparse moments such as major page headers or final deal outcomes. Product UI is not a landing page and should not overuse display scale.
- **Headline** ([to be resolved during implementation]): Used for listing titles, negotiation headers, section titles, and major summaries. Strong but controlled.
- **Title** ([to be resolved during implementation]): Used for cards, filter groups, detail sections, and timeline blocks.
- **Body** ([to be resolved during implementation]): Used for descriptions, negotiation context, seller details, and helper copy. Body text must stay readable at marketplace density.
- **Label** ([to be resolved during implementation]): Used for buttons, filters, metadata, pills, and form labels. Labels should feel precise and quiet, never shouty.

**The No-Performance-Type Rule.** Product confidence comes from hierarchy, not flamboyance. No decorative display moments, no startup-brand gimmick fonts, and no oversized marketing typography inside task flows.

## Elevation

Elevation should be structural and restrained. Default surfaces should read primarily through tone and border definition, with minimal shadows used only where hierarchy or interactivity genuinely requires separation. In both light and dark themes, depth should feel engineered, not atmospheric.

**The Border-First Rule.** Use crisp borders and surface changes before reaching for shadows. If a card feels like it is floating, it is already too decorative for this product.

**The State-Only Motion Rule.** Motion is responsive, not choreographed. Use it for hover, focus, loading, expansion, and state confirmation only. Never for theatrical reveals or AI-style spectacle.

## Do's and Don'ts

### Do:
- **Do** make the interface read as a marketplace before it reads as an AI product.
- **Do** use dense but breathable listing layouts with clear pricing, seller, variant, and delivery information.
- **Do** keep both light and dark themes equally polished and equally usable.
- **Do** use strong text contrast, visible focus states, full keyboard navigation, and reduced-motion support as baseline product behavior.
- **Do** use crisp borders, disciplined spacing, and restrained surfaces to create hierarchy instead of decorative shadow stacks.
- **Do** structure negotiation review as a timeline, ledger, or decision flow rather than a generic freeform conversation transcript.
- **Do** make final deal review feel formal and trustworthy, with obvious approval boundaries and visible verification states.

### Don't:
- **Don't** use ChatGPT-style conversation interfaces.
- **Don't** use Claude-style chat layouts.
- **Don't** use generic AI SaaS dashboards.
- **Don't** use Vercel AI demo aesthetics.
- **Don't** use glassmorphism.
- **Don't** use purple or pink gradient-heavy design systems.
- **Don't** use neon or cyberpunk visual styling.
- **Don't** use floating glowing cards.
- **Don't** use overly animated interfaces.
- **Don't** ship anything that immediately signals "AI startup."
- **Don't** rely on warm beige, cream, or parchment surfaces to create "premium" mood; this product earns premium through structure and polish, not faux-editorial tinting.
- **Don't** turn the main product into a multi-chat control room. One negotiation at a time is the rule for the real user experience.
