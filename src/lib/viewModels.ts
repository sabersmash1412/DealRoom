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
  askPrice: number
  liveOffer: number
  priceDelta: number
  delivery: string
  updatedAt: string
  buyerGuardrail: string
  sellerSignal: string
  nextAction: string
  summary: string
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
  }
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
  auditEvents: AuditEvent[],
  currentActor: 'buyer' | 'seller',
  branchStatus: NegotiationBranchView['status'],
): TimelineEvent[] {
  const messageEvents = messages.map((message) => ({
    id: `message-${message.id}`,
    time: '',
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

  const auditTimeline = auditEvents.slice(-2).map((event, index) => ({
    id: `audit-${event.id}`,
    time: event.time,
    title: event.action,
    detail: event.evidence,
    status: index === auditEvents.slice(-2).length - 1 ? 'active' as const : 'done' as const,
    kind: event.lane === 'Approval' ? 'approval' as const : event.lane === 'Verification' ? 'check' as const : 'offer' as const,
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

  return [...messageEvents, ...auditTimeline, nextAction].slice(-8)
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
  const latestMessage = branch.messages.at(-1)
  const currentOffer = branch.finalDeal?.finalPrice ?? branch.state.currentOffer?.price ?? branch.state.snapshot.listing.price
  const audit = branch.auditEvents.map(mapAuditEvent)
  const messages = branch.messages.map(mapMessage)
  const priceDelta = currentOffer - branch.state.snapshot.listing.price
  const timeline = mapTimeline(messages, audit, branch.state.currentActor, branch.status)

  return {
    id: branch.id,
    listingId: branch.listingId,
    stage: titleCase(branch.status),
    status: statusFromBranchStatus(branch.status),
    askPrice: branch.state.snapshot.listing.price,
    liveOffer: currentOffer,
    priceDelta,
    delivery: branch.deliveryDeadline ?? `${branch.state.snapshot.seller.deliveryDays}-day delivery`,
    updatedAt: formatUpdatedAt(latestMessage?.createdAt ?? branch.auditEvents.at(-1)?.createdAt),
    buyerGuardrail: `Buyer cap ${branch.buyerBudget}.`,
    sellerSignal: `Seller floor ${branch.state.snapshot.sellerConfig.reservationValue.minimumAcceptablePrice}.`,
    nextAction:
      branch.status === 'agreement_reached' || branch.status === 'approved'
        ? 'Approve economics and delivery.'
        : branch.status === 'queued'
          ? 'Waiting for backend start.'
          : `Waiting on ${branch.state.currentActor} agent.`,
    summary:
      branch.finalDeal
        ? `Close at ${branch.finalDeal.finalPrice}.`
        : latestMessage?.content ?? 'Negotiation has been created.',
    messages:
      messages.length > 0
        ? messages
        : [
            {
              id: `${branch.id}-system`,
              actor: 'DealRoom',
              side: 'system',
              type: 'status',
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
    askPrice: listing.price,
    liveOffer: listing.price,
    priceDelta: 0,
    delivery: listing.shipping,
    updatedAt: 'Not started',
    buyerGuardrail: 'Save rules, then start a negotiation.',
    sellerSignal: 'No seller strategy loaded yet.',
    nextAction: 'Start a backend negotiation.',
    summary: 'No campaign exists for this listing yet.',
    messages: [
      {
        id: `placeholder-message-${listing.id}`,
        actor: 'DealRoom',
        side: 'system',
        type: 'status',
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
