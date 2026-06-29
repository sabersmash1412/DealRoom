# DealRoom - Built during 'Sup Hackathon 2026

DealRoom is a governed multi-agent negotiation platform for online marketplaces. Buyer agents and seller agents negotiate on behalf of humans, while a mediator agent validates each step so the final deal is transparent, explainable, and still approved by the user.

The goal is not to build another AI chat interface. DealRoom is a marketplace workflow where AI runs quietly in the background to make buying and selling faster, safer, and less repetitive.

## What It Does

- Lets buyers browse marketplace listings and start structured negotiations.
- Uses buyer and seller agent profiles to define budgets, utility weights, reservation values, strategies, and guardrails.
- Runs autonomous buyer-agent and seller-agent negotiation turns.
- Uses a mediator agent to validate offers before they reach the user interface.
- Grounds negotiations with Exa-powered market context instead of relying only on model guesses.
- Persists listings, sellers, agent profiles, negotiation branches, messages, audit events, and final deals in Postgres through Prisma.
- Streams negotiation state back to the frontend so users can follow the process live.
- Keeps humans in control by requiring final deal approval.

## Why It Matters

Online marketplace negotiations are slow and low-trust. Buyers get ghosted, sellers repeat the same negotiation over and over, and platforms lose transactions when conversations stall.

DealRoom reframes negotiation as governed autonomous commerce:

```text
Buyer Agent -> Negotiation Engine -> Seller Agent -> Mediator Agent -> Verified Deal
```

That governance layer matters because AI-to-AI commerce only works when outcomes are inspectable, policy-aware, and bounded by human approval.

## Tech Stack

- React 19
- TypeScript
- Vite
- Tailwind CSS
- Node.js HTTP server
- Prisma 7
- Postgres / Supabase
- OpenAI Responses API
- Exa Search API

## Architecture

```text
Frontend
  |
  v
DealRoom API
  |
  v
Negotiation Orchestrator
  |
  +--> Buyer Agent
  +--> Seller Agent
  +--> Mediator Agent
  |
  +--> OpenAI reasoning
  +--> Exa market search
  +--> Prisma / Postgres state
  |
  v
Live negotiation timeline + final deal approval
```

## Project Structure

```text
.
├── src/
│   ├── App.tsx                  # Main React experience
│   ├── lib/                     # API client and view models
│   └── shared/                  # Shared negotiation types
├── server/
│   ├── agents/                  # Buyer, seller, and mediator agents
│   ├── domain/                  # Negotiation engine and utility logic
│   ├── repositories/            # Prisma-backed data access
│   ├── routes/                  # API routes
│   └── services/                # OpenAI, Exa, and event bus services
├── prisma/
│   ├── schema.prisma            # Database schema
│   └── migrations/              # Database migrations
├── PRODUCT.md                   # Product direction
├── DESIGN.md                    # Design system notes
└── vercel.json                  # Vercel frontend config
```
