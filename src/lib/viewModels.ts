import type {
  AuditEventView,
  MarketplaceListingView,
  NegotiationBranchStatus,
  NegotiationBranchView,
  NegotiationMessageView,
} from '../shared/negotiation'

export type Listing = {
  id: string
  sellerId: string
  title: string
  category: string
  price: number
  seller: string
  condition: string
  location: string
  shipping: string
  trust: string
  inventory: string
  note: string
  accent: 'indigo' | 'teal' | 'amber'
}

export type Message = {
  id: string
  actor: string
  side: 'buyer' | 'seller' | 'system' | 'verification'
  type: 'offer' | 'counter' | 'status' | 'approval'
  title: string
  body: string
  amount?: number
  meta?: string[]
  tone?: 'neutral' | 'verification' | 'warning' | 'success'
  createdAt?: string
}

export type TimelineEvent = {
  id: string
  time: string
  title: string
  detail: string
  status: 'done' | 'active' | 'up-next'
  kind: 'offer' | 'check' | 'approval' | 'delivery'
}

export type AuditEvent = {
  id: string
  time: string
  actor: string
  action: string
  evidence: string
  result: 'Recorded' | 'Verified' | 'Needs review'
  lane: 'Offers' | 'Verification' | 'Policy' | 'Approval'
}

export type Negotiation = {
  id: string
  listingId: string
  stage: string
  status: 'Ready' | 'Waiting' | 'Hold'
  round: number
  turnCount: number
  askPrice: number
  liveOffer: number
  priceDelta: number
  delivery: string
  updatedAt: string
  buyerGuardrail: string
  sellerSignal: string
  nextAction: string
  summary: string
  marketSummary: {
    label: string
    detail: string
  }
  mediatorSummary: {
    label: string
    detail: string
  }
  messages: Message[]
  timeline: TimelineEvent[]
  audit: AuditEvent[]
  finalDeal: {
    itemPrice: number
    deliveryFee: number
    protection: string
    pickupWindow: string
    inspection: string
    seller: string
  }
}

function accentFromId(id: string): Listing['accent'] {
  const accents: Listing['accent'][] = ['indigo', 'teal', 'amber']
  const value = id.split('').reduce((sum, character) => sum + character.charCodeAt(0), 0)
  return accents[value % accents.length]
}

function titleCase(value: string) {
  return value
    .replace(/_/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(' ')
}

function categoryFromTitle(title: string) {
  const normalized = title.toLowerCase()
  if (normalized.includes('chair') || normalized.includes('table')) return 'Furniture'
  if (normalized.includes('camera')) return 'Cameras'
  if (normalized.includes('coffee')) return 'Appliances'
  if (normalized.includes('monitor')) return 'Electronics'
  if (normalized.includes('bike') || normalized.includes('brompton')) return 'Cycling'
  return 'Marketplace'
}

function formatUpdatedAt(input: string | undefined) {
  if (!input) {
    return 'Just now'
  }

  const diff = Date.now() - new Date(input).getTime()
  const minutes = Math.max(1, Math.round(diff / 60000))
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  const days = Math.round(hours / 24)
  return `${days} d ago`
}

const currency = new Intl.NumberFormat('en-SG', {
  style: 'currency',
  currency: 'SGD',
  maximumFractionDigits: 0,
})

function money(value: number) {
  return currency.format(value)
}

function formatClockTime(input: string | undefined) {
  if (!input) {
    return ''
  }

  return new Date(input).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusFromBranchStatus(status: NegotiationBranchStatus): Negotiation['status'] {
  if (status === 'queued') return 'Waiting'
  if (status === 'blocked' || status === 'walked_away' || status === 'reservation_blocked' || status === 'max_rounds_reached') {
    return 'Hold'
  }
  return 'Ready'
}

function mapMessage(message: NegotiationMessageView): Message {
  const actor = message.actor.toLowerCase()
  const side =
    actor.includes('buyer')
      ? 'buyer'
      : actor.includes('seller')
        ? 'seller'
        : actor.includes('mediat') || message.type === 'approval'
          ? 'verification'
          : 'system'
  const type =
    message.type === 'offer'
      ? 'offer'
      : message.type === 'counter'
        ? 'counter'
        : message.type === 'accept'
          ? 'approval'
          : 'status'
  const metadata = message.metadata ?? {}
  const reasoning = Array.isArray(metadata.reasoning)
    ? metadata.reasoning.filter((entry): entry is string => typeof entry === 'string')
    : []
  const marketReferences = Array.isArray(metadata.marketReferences)
    ? metadata.marketReferences
        .map((entry) => {
          if (entry && typeof entry === 'object' && 'sourceLabel' in entry && typeof entry.sourceLabel === 'string') {
            return entry.sourceLabel
          }
          return null
        })
        .filter((entry): entry is string => Boolean(entry))
    : []

  return {
    id: message.id,
    actor: titleCase(message.actor),
    side,
    type,
    title: titleCase(message.type),
    body: message.content,
    amount: message.offerPrice ?? undefined,
    meta: [...reasoning, ...marketReferences].slice(0, 2),
    createdAt: message.createdAt,
  }
}

function extractViolations(metadata: Record<string, unknown>) {
  return Array.isArray(metadata.violations)
    ? metadata.violations.filter((entry): entry is string => typeof entry === 'string')
    : []
}

function mapAuditEventToMessage(
  event: AuditEventView,
  branch: NegotiationBranchView,
): Message | null {
  const metadata = event.metadata ?? {}
  const violations = extractViolations(metadata)
  const explanation =
    typeof metadata.explanation === 'string' ? metadata.explanation : null

  if (event.eventType === 'campaign_created') {
    return {
      id: `system-${event.id}`,
      actor: 'DealRoom',
      side: 'system',
      type: 'status',
      tone: 'neutral',
      title: 'Negotiation branch created',
      body: branch.marketContext
        ? 'DealRoom created the branch and attached market evidence before opening the first round.'
        : 'DealRoom created the branch and queued market-context loading before the first round.',
      meta: ['Backend queued'],
      createdAt: event.createdAt,
    }
  }

  if (event.eventType === 'turn_approved') {
    return {
      id: `mediator-${event.id}`,
      actor: 'Mediator Agent',
      side: 'system',
      type: 'approval',
      tone: 'success',
      title: 'Turn approved',
      body:
        explanation ??
        'The mediator approved the latest turn after checking transparency, truthfulness, and guardrails.',
      meta: violations.length > 0 ? violations.slice(0, 2) : ['Checks passed'],
      createdAt: event.createdAt,
    }
  }

  if (event.eventType === 'turn_rejected') {
    const forActor =
      typeof metadata.forActor === 'string' ? titleCase(metadata.forActor) : 'Agent'
    const attempt =
      typeof metadata.attempt === 'number' ? `Attempt ${metadata.attempt + 1}` : null

    return {
      id: `mediator-${event.id}`,
      actor: 'Mediator Agent',
      side: 'system',
      type: 'status',
      tone: 'warning',
      title: `${forActor} turn rejected`,
      body: violations.length > 0
        ? `The mediator rejected this ${forActor.toLowerCase()} turn and requested regeneration. ${violations[0]}`
        : `The mediator rejected this ${forActor.toLowerCase()} turn and requested a regenerated response.`,
      meta: [attempt, `${violations.length || 1} issue${violations.length === 1 ? '' : 's'}`]
        .filter((entry): entry is string => Boolean(entry)),
      createdAt: event.createdAt,
    }
  }

  if (event.eventType === 'turn_regeneration_exhausted') {
    return {
      id: `mediator-${event.id}`,
      actor: 'Mediator Agent',
      side: 'system',
      type: 'status',
      tone: 'warning',
      title: 'Negotiation blocked',
      body: 'The mediator exhausted regeneration attempts and halted this branch before another offer could be sent.',
      meta: ['Branch blocked'],
      createdAt: event.createdAt,
    }
  }

  if (event.eventType === 'max_rounds_reached') {
    return {
      id: `system-${event.id}`,
      actor: 'DealRoom',
      side: 'system',
      type: 'status',
      tone: 'warning',
      title: 'Maximum rounds reached',
      body: 'The branch hit its round limit before a valid agreement could be approved.',
      meta: ['Round cap reached'],
      createdAt: event.createdAt,
    }
  }

  if (event.eventType === 'final_deal_approved') {
    return {
      id: `system-${event.id}`,
      actor: 'DealRoom',
      side: 'system',
      type: 'approval',
      tone: 'success',
      title: 'Final deal approved',
      body: 'The approved negotiation outcome has been committed as the final backend deal.',
      meta: ['Saved to backend'],
      createdAt: event.createdAt,
    }
  }

  return null
}

function marketContextMessage(branch: NegotiationBranchView): Message | null {
  const marketContext = branch.marketContext
  if (!marketContext) {
    return null
  }

  const comparableTitles = marketContext.comparableListings
    .slice(0, 2)
    .map((entry) => entry.title)
    .filter(Boolean)

  return {
    id: `market-context-${branch.id}`,
    actor: marketContext.source === 'exa' ? 'Exa Service' : 'Market Fallback',
    side: 'system',
    type: 'status',
    tone: marketContext.source === 'exa' ? 'verification' : 'warning',
    title:
      marketContext.source === 'exa'
        ? 'Market evidence loaded'
        : 'Fallback market range loaded',
    body:
      marketContext.source === 'exa'
        ? `Exa queried "${marketContext.query}" and returned ${marketContext.comparableListings.length} comparable listings. Average ${money(marketContext.averagePrice)}, with a range from ${money(marketContext.lowestListing)} to ${money(marketContext.highestListing)}.${comparableTitles.length > 0 ? ` Sample matches: ${comparableTitles.join(', ')}.` : ''}`
        : `Exa market data was unavailable, so DealRoom generated a fallback market range from the listing price. Average ${money(marketContext.averagePrice)}, with a range from ${money(marketContext.lowestListing)} to ${money(marketContext.highestListing)}.`,
    meta: [
      marketContext.source === 'exa' ? 'Source: Exa' : 'Source: fallback',
      `Avg ${money(marketContext.averagePrice)}`,
      `${marketContext.comparableListings.length} comps`,
    ],
    createdAt: marketContext.generatedAt,
  }
}

function buildConversation(branch: NegotiationBranchView): Message[] {
  const entries = [
    marketContextMessage(branch),
    ...branch.messages.map(mapMessage),
    ...branch.auditEvents.map((event) => mapAuditEventToMessage(event, branch)),
  ]
    .filter((entry): entry is Message => Boolean(entry))
    .map((entry) => ({
      entry,
      timestamp: entry.createdAt ? new Date(entry.createdAt).getTime() : 0,
      order:
        entry.actor === 'Exa Service' || entry.actor === 'Market Fallback'
          ? 5
          : entry.actor === 'DealRoom'
            ? 10
            : entry.side === 'buyer' || entry.side === 'seller'
              ? 20
              : entry.type === 'approval'
                ? 30
                : 25,
    }))

  entries.sort((left, right) => {
    if (left.timestamp !== right.timestamp) {
      return left.timestamp - right.timestamp
    }

    return left.order - right.order
  })

  return entries.map(({ entry }) => entry)
}

function laneFromAudit(eventType: string): AuditEvent['lane'] {
  if (eventType.includes('approved') || eventType.includes('approval')) return 'Approval'
  if (eventType.includes('reject') || eventType.includes('market') || eventType.includes('evidence')) return 'Verification'
  if (eventType.includes('policy') || eventType.includes('max_rounds')) return 'Policy'
  return 'Offers'
}

function resultFromAudit(eventType: string): AuditEvent['result'] {
  if (eventType.includes('reject') || eventType.includes('blocked')) return 'Needs review'
  if (eventType.includes('approved') || eventType.includes('final') || eventType.includes('market')) return 'Verified'
  return 'Recorded'
}

function mapAuditEvent(event: AuditEventView): AuditEvent {
  const metadata = event.metadata ?? {}
  const violations = Array.isArray(metadata.violations)
    ? metadata.violations.filter((entry): entry is string => typeof entry === 'string')
    : []

  return {
    id: event.id,
    time: new Date(event.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    actor: titleCase(event.actor),
    action: titleCase(event.eventType),
    evidence:
      violations[0] ??
      (typeof metadata.explanation === 'string'
        ? metadata.explanation
        : 'Persisted by the backend negotiation engine.'),
    result: resultFromAudit(event.eventType),
    lane: laneFromAudit(event.eventType),
  }
}

function mapTimeline(
  messages: Message[],
  currentActor: 'buyer' | 'seller',
  branchStatus: NegotiationBranchView['status'],
): TimelineEvent[] {
  const messageEvents = messages.map((message) => ({
    id: `message-${message.id}`,
    time: formatClockTime(message.createdAt),
    title: message.title,
    detail: message.body,
    status: 'done' as const,
    kind:
      message.type === 'offer'
        ? ('offer' as const)
        : message.type === 'counter'
          ? ('offer' as const)
          : message.type === 'approval'
            ? ('approval' as const)
            : ('check' as const),
  }))

  const nextAction: TimelineEvent = {
    id: 'up-next',
    time: '',
    title: branchStatus === 'agreement_reached' || branchStatus === 'approved' ? 'Await approval' : `${titleCase(currentActor)} turn`,
    detail:
      branchStatus === 'agreement_reached' || branchStatus === 'approved'
        ? 'Final terms are ready for approval.'
        : `Backend is waiting for the ${currentActor} agent to act.`,
    status: branchStatus === 'agreement_reached' || branchStatus === 'approved' ? 'active' : 'up-next',
    kind: branchStatus === 'agreement_reached' || branchStatus === 'approved' ? 'approval' : 'offer',
  }

  return [...messageEvents, nextAction].slice(-8)
}

function nextActionFromBranch(branch: NegotiationBranchView): string {
  if (branch.status === 'agreement_reached' || branch.status === 'approved') {
    return 'Approve economics and delivery.'
  }

  if (branch.status === 'queued') {
    return branch.marketContext
      ? `Waiting on ${branch.state.currentActor} agent.`
      : 'Loading Exa market context before the first turn.'
  }

  if (branch.status === 'blocked') {
    return 'Mediator halted the branch after repeated validation failures.'
  }

  if (branch.status === 'walked_away') {
    return 'The negotiation ended without agreement.'
  }

  if (branch.status === 'max_rounds_reached') {
    return 'Review the branch because the round limit was reached.'
  }

  if (branch.state.lastMediatorDecision?.needsRegeneration) {
    return 'Mediator requested a regenerated turn.'
  }

  return `Waiting on ${branch.state.currentActor} agent.`
}

function marketSummaryFromBranch(branch: NegotiationBranchView) {
  if (!branch.marketContext) {
    return {
      label: 'Waiting for market context',
      detail: 'DealRoom has created the branch and is waiting to load Exa market evidence before the first offer.',
    }
  }

  return {
    label:
      branch.marketContext.source === 'exa'
        ? `Exa avg ${money(branch.marketContext.averagePrice)}`
        : `Fallback avg ${money(branch.marketContext.averagePrice)}`,
    detail: `${branch.marketContext.query} · ${branch.marketContext.comparableListings.length} comps · Range ${money(branch.marketContext.lowestListing)}-${money(branch.marketContext.highestListing)}`,
  }
}

function mediatorSummaryFromBranch(branch: NegotiationBranchView) {
  if (branch.status === 'blocked') {
    return {
      label: 'Mediator blocked branch',
      detail: 'Repeated validation failures exhausted regeneration attempts.',
    }
  }

  if (branch.state.lastMediatorDecision?.approved) {
    return {
      label: 'Last mediator check approved',
      detail: branch.state.lastMediatorDecision.explanation,
    }
  }

  if (branch.state.lastMediatorDecision?.needsRegeneration) {
    return {
      label: 'Mediator requested regeneration',
      detail:
        branch.state.lastMediatorDecision.violations[0] ??
        branch.state.lastMediatorDecision.explanation,
    }
  }

  return {
    label: 'Mediator waiting for first turn',
    detail: 'Once an agent proposes terms, the mediator validates the turn before it reaches the other side.',
  }
}

export function mapListingViewToCard(listing: MarketplaceListingView): Listing {
  return {
    id: listing.id,
    sellerId: listing.sellerId,
    title: listing.title,
    category: categoryFromTitle(listing.title),
    price: listing.price,
    seller: listing.sellerName,
    condition: listing.condition,
    location: `${listing.sellerRating.toFixed(1)} seller rating`,
    shipping: `${listing.deliveryDays}-day delivery`,
    trust: listing.returnPolicy ? `Returns: ${listing.returnPolicy}` : `Seller rating ${listing.sellerRating.toFixed(1)}`,
    inventory: `${listing.sellerInventory} in stock`,
    note: listing.description ?? 'Negotiation-ready listing imported from the backend.',
    accent: accentFromId(listing.id),
  }
}

export function mapBranchToNegotiation(branch: NegotiationBranchView): Negotiation {
  const messages = buildConversation(branch)
  const latestMessage = messages.at(-1)
  const currentOffer = branch.finalDeal?.finalPrice ?? branch.state.currentOffer?.price ?? branch.state.snapshot.listing.price
  const audit = branch.auditEvents.map(mapAuditEvent)
  const priceDelta = currentOffer - branch.state.snapshot.listing.price
  const timeline = mapTimeline(messages, branch.state.currentActor, branch.status)

  return {
    id: branch.id,
    listingId: branch.listingId,
    stage: titleCase(branch.status),
    status: statusFromBranchStatus(branch.status),
    round: branch.state.round,
    turnCount: branch.state.turnCount,
    askPrice: branch.state.snapshot.listing.price,
    liveOffer: currentOffer,
    priceDelta,
    delivery: branch.deliveryDeadline ?? `${branch.state.snapshot.seller.deliveryDays}-day delivery`,
    updatedAt: formatUpdatedAt(latestMessage?.createdAt ?? branch.auditEvents.at(-1)?.createdAt),
    buyerGuardrail: `Buyer cap ${branch.buyerBudget}.`,
    sellerSignal: `Seller floor ${branch.state.snapshot.sellerConfig.reservationValue.minimumAcceptablePrice}.`,
    nextAction: nextActionFromBranch(branch),
    summary:
      branch.finalDeal
        ? `Close at ${branch.finalDeal.finalPrice}.`
        : latestMessage?.body ?? 'Negotiation has been created.',
    marketSummary: marketSummaryFromBranch(branch),
    mediatorSummary: mediatorSummaryFromBranch(branch),
    messages:
      messages.length > 0
        ? messages
        : [
            {
              id: `${branch.id}-system`,
              actor: 'DealRoom',
              side: 'system',
              type: 'status',
              tone: 'neutral',
              title: 'Negotiation created',
              body: 'The backend orchestration engine is preparing the first round.',
            },
          ],
    timeline,
    audit,
    finalDeal: {
      itemPrice: branch.finalDeal?.finalPrice ?? currentOffer,
      deliveryFee: 0,
      protection: branch.finalDeal?.verified
        ? 'Mediator checks and reservation validation passed.'
        : 'Pending final backend approval.',
      pickupWindow: branch.deliveryDeadline ?? `${branch.state.snapshot.seller.deliveryDays}-day delivery target`,
      inspection: branch.state.snapshot.buyerProfile.guardrails[0] ?? 'Keep within buyer reservation rules.',
      seller: branch.state.snapshot.seller.name,
    },
  }
}

export function createPlaceholderNegotiation(listing: Listing): Negotiation {
  return {
    id: `placeholder-${listing.id}`,
    listingId: listing.id,
    stage: 'No active negotiation',
    status: 'Waiting',
    round: 0,
    turnCount: 0,
    askPrice: listing.price,
    liveOffer: listing.price,
    priceDelta: 0,
    delivery: listing.shipping,
    updatedAt: 'Not started',
    buyerGuardrail: 'Save rules, then start a negotiation.',
    sellerSignal: 'No seller strategy loaded yet.',
    nextAction: 'Start a backend negotiation.',
    summary: 'No campaign exists for this listing yet.',
    marketSummary: {
      label: 'No market context yet',
      detail: 'Starting a branch triggers Exa market discovery before the first offer.',
    },
    mediatorSummary: {
      label: 'Mediator idle',
      detail: 'Mediator decisions will appear here once the first offer is generated.',
    },
    messages: [
      {
        id: `placeholder-message-${listing.id}`,
        actor: 'DealRoom',
        side: 'system',
        type: 'status',
        tone: 'neutral',
        title: 'Awaiting launch',
        body: 'Use Start from the marketplace to create the negotiation branch.',
      },
    ],
    timeline: [
      {
        id: `placeholder-timeline-${listing.id}`,
        time: '',
        title: 'Awaiting launch',
        detail: 'No backend branch has been created yet.',
        status: 'up-next',
        kind: 'offer',
      },
    ],
    audit: [],
    finalDeal: {
      itemPrice: listing.price,
      deliveryFee: 0,
      protection: 'No final deal yet.',
      pickupWindow: listing.shipping,
      inspection: 'No inspection policy loaded.',
      seller: listing.seller,
    },
  }
}
