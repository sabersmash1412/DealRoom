import { startTransition, useDeferredValue, useState } from 'react'

type Screen =
  | 'home'
  | 'agents'
  | 'negotiations'
  | 'timeline'
  | 'final'
  | 'audit'

type Listing = {
  id: string
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

type Message = {
  id: string
  actor: string
  side: 'buyer' | 'seller' | 'system' | 'verification'
  type: 'offer' | 'counter' | 'status' | 'approval'
  title: string
  body: string
  amount?: number
  meta?: string[]
}

type TimelineEvent = {
  id: string
  time: string
  title: string
  detail: string
  status: 'done' | 'active' | 'up-next'
  kind: 'offer' | 'check' | 'approval' | 'delivery'
}

type AuditEvent = {
  id: string
  time: string
  actor: string
  action: string
  evidence: string
  result: 'Recorded' | 'Verified' | 'Needs review'
  lane: 'Offers' | 'Verification' | 'Policy' | 'Approval'
}

type Negotiation = {
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

const screenMeta: Array<{ id: Screen; label: string; badge?: string }> = [
  { id: 'home', label: 'Marketplace' },
  { id: 'agents', label: 'Agents' },
  { id: 'negotiations', label: 'Negotiations', badge: '3' },
  { id: 'timeline', label: 'Workspace', badge: 'Live' },
  { id: 'final', label: 'Final deal' },
  { id: 'audit', label: 'Audit' },
]

const listings: Listing[] = [
  {
    id: 'aeron',
    title: 'Secretlab TITAN Evo 2022, SoftWeave charcoal',
    category: 'Office',
    price: 640,
    seller: 'CityHall Studio',
    condition: 'Very good',
    location: 'Tanjong Pagar',
    shipping: 'Self-collect or Lalamove',
    trust: 'Receipt + seller ID verified',
    inventory: '8 photos',
    note: 'Includes magnetic head pillow and original receipt.',
    accent: 'indigo',
  },
  {
    id: 'leica',
    title: 'Fujifilm X100VI, local set with receipt',
    category: 'Cameras',
    price: 2550,
    seller: 'Bishan Camera Club',
    condition: 'Like new',
    location: 'Bishan',
    shipping: 'Meetup or insured courier',
    trust: 'Warranty + shutter count checked',
    inventory: '11 photos',
    note: 'Low shutter count, local warranty registered, spare battery included.',
    accent: 'teal',
  },
  {
    id: 'linea',
    title: 'JURA E8 coffee machine, piano black',
    category: 'Home appliances',
    price: 1380,
    seller: 'Holland Village Home',
    condition: 'Great',
    location: 'Queenstown',
    shipping: 'Courier or self-collect',
    trust: 'Service log included',
    inventory: '6 photos',
    note: 'Recently descaled, milk frother and water filter included.',
    accent: 'amber',
  },
  {
    id: 'vitra',
    title: 'PRISM+ X340 Pro ultrawide monitor, 34-inch',
    category: 'Electronics',
    price: 420,
    seller: 'Bedok Tech Loft',
    condition: 'Excellent',
    location: 'Bedok',
    shipping: 'Same-day courier',
    trust: 'Dead pixel check passed',
    inventory: '9 photos',
    note: 'Stand, original box, and VESA mount kit included.',
    accent: 'indigo',
  },
  {
    id: 'pinarello',
    title: 'Brompton C Line Explore, racing green',
    category: 'Cycling',
    price: 2450,
    seller: 'East Coast Riders',
    condition: 'Excellent',
    location: 'Marine Parade',
    shipping: 'MRT meetup or courier',
    trust: 'Frame number validated',
    inventory: '13 photos',
    note: 'Brooks saddle, front carrier block, recently serviced.',
    accent: 'teal',
  },
  {
    id: 'modular',
    title: 'MUJI oak dining table with 4 chairs',
    category: 'Home',
    price: 980,
    seller: 'Serangoon North Home',
    condition: 'Very good',
    location: 'Serangoon',
    shipping: 'Van delivery available',
    trust: 'Seller + item photos checked',
    inventory: '7 photos',
    note: 'Solid oak top, light wear, chairs reupholstered last year.',
    accent: 'amber',
  },
]

const negotiations: Negotiation[] = [
  {
    id: 'aeron',
    listingId: 'aeron',
    stage: 'Final seller response',
    status: 'Ready',
    askPrice: 640,
    liveOffer: 560,
    priceDelta: -80,
    delivery: 'Lalamove delivery $25',
    updatedAt: '2 min ago',
    buyerGuardrail: 'Cap total at S$585.',
    sellerSignal: 'Seller prefers Lalamove over self-collect.',
    nextAction: 'Approve economics or reopen delivery.',
    summary: 'Converged at S$560 + S$25 delivery.',
    messages: [
      {
        id: 'm1',
        actor: 'DealRoom',
        side: 'system',
        type: 'status',
        title: 'Mandate loaded',
        body: 'Budget, receipt verification, and delivery timing were imported from the listing flow.',
        meta: ['Ask S$640', 'Target S$520–S$585'],
      },
      {
        id: 'm2',
        actor: 'Buyer agent',
        side: 'buyer',
        type: 'offer',
        title: 'Opening offer',
        body: 'Opened at S$520 with same-day PayNow and receipt verification.',
        amount: 520,
        meta: ['Self-collect preferred'],
      },
      {
        id: 'm3',
        actor: 'Seller agent',
        side: 'seller',
        type: 'counter',
        title: 'Seller counter',
        body: 'Seller replied at S$590 with delivery included.',
        amount: 590,
        meta: ['Weekend delivery possible'],
      },
      {
        id: 'm4',
        actor: 'Verification',
        side: 'verification',
        type: 'status',
        title: 'Evidence passed',
        body: 'Receipt, seller identity, and comparable listings all matched.',
        meta: ['3 Carousell comps checked'],
      },
      {
        id: 'm5',
        actor: 'Buyer agent',
        side: 'buyer',
        type: 'offer',
        title: 'Buyer revised',
        body: 'Moved to S$550 with weekend delivery timing protection.',
        amount: 550,
        meta: ['Inspection retained'],
      },
      {
        id: 'm6',
        actor: 'Seller agent',
        side: 'seller',
        type: 'counter',
        title: 'Seller midpoint',
        body: 'Seller moved to S$570 and split delivery into its own line item.',
        amount: 570,
        meta: ['Head pillow kept'],
      },
      {
        id: 'm7',
        actor: 'DealRoom',
        side: 'system',
        type: 'approval',
        title: 'Approval package',
        body: 'Current close is S$560 + S$25 delivery. Guardrails still hold.',
        meta: ['Total S$585', 'Hold expires in 4h'],
      },
    ],
    timeline: [
      {
        id: 't1',
        time: '09:14',
        title: 'Imported',
        detail: 'Started from listing.',
        status: 'done',
        kind: 'offer',
      },
      {
        id: 't2',
        time: '09:18',
        title: 'Buyer opened',
        detail: 'S$520 anchor sent.',
        status: 'done',
        kind: 'offer',
      },
      {
        id: 't3',
        time: '09:26',
        title: 'Seller countered',
        detail: 'S$590 with delivery.',
        status: 'done',
        kind: 'offer',
      },
      {
        id: 't4',
        time: '09:31',
        title: 'Verification cleared',
        detail: 'Receipt and comps matched.',
        status: 'done',
        kind: 'check',
      },
      {
        id: 't5',
        time: '09:37',
        title: 'Buyer revised',
        detail: 'S$550 with timing protection.',
        status: 'done',
        kind: 'offer',
      },
      {
        id: 't6',
        time: '09:43',
        title: 'Seller midpoint',
        detail: 'S$570 plus separate delivery.',
        status: 'done',
        kind: 'offer',
      },
      {
        id: 't7',
        time: '09:49',
        title: 'Approval ready',
        detail: 'S$560 + S$25 delivery.',
        status: 'active',
        kind: 'approval',
      },
      {
        id: 't8',
        time: '10:10',
        title: 'Buyer deadline',
        detail: 'Seller hold expires.',
        status: 'up-next',
        kind: 'delivery',
      },
    ],
    audit: [
      {
        id: 'a1',
        time: '09:14:03',
        actor: 'Buyer agent',
        action: 'Loaded mandate',
        evidence: 'Listing card and saved price rules.',
        result: 'Recorded',
        lane: 'Policy',
      },
      {
        id: 'a2',
        time: '09:18:11',
        actor: 'Buyer agent',
        action: 'Submitted opening offer',
        evidence: 'S$520 payload.',
        result: 'Recorded',
        lane: 'Offers',
      },
      {
        id: 'a3',
        time: '09:25:48',
        actor: 'Seller agent',
        action: 'Posted counteroffer',
        evidence: 'S$590 with delivery.',
        result: 'Recorded',
        lane: 'Offers',
      },
      {
        id: 'a4',
        time: '09:31:20',
        actor: 'Verification worker',
        action: 'Checked evidence',
        evidence: 'Receipt image, comps, seller ID hash.',
        result: 'Verified',
        lane: 'Verification',
      },
      {
        id: 'a5',
        time: '09:37:02',
        actor: 'Buyer agent',
        action: 'Updated offer',
        evidence: 'S$550 plus delivery rule.',
        result: 'Recorded',
        lane: 'Offers',
      },
      {
        id: 'a6',
        time: '09:48:36',
        actor: 'Policy engine',
        action: 'Scored final terms',
        evidence: 'Budget, delivery, inspection checks.',
        result: 'Verified',
        lane: 'Policy',
      },
      {
        id: 'a7',
        time: '09:49:15',
        actor: 'DealRoom',
        action: 'Prepared approval package',
        evidence: 'Final item and delivery values.',
        result: 'Recorded',
        lane: 'Approval',
      },
      {
        id: 'a8',
        time: '09:49:22',
        actor: 'DealRoom',
        action: 'Requested human confirmation',
        evidence: 'Approval timer and summary.',
        result: 'Needs review',
        lane: 'Approval',
      },
    ],
    finalDeal: {
      itemPrice: 560,
      deliveryFee: 25,
      protection: 'Buyer protection through confirmed delivery',
      pickupWindow: 'Lalamove delivery by Saturday or self-collect fallback',
      inspection: '24-hour inspection window',
      seller: 'CityHall Studio / Tanjong Pagar',
    },
  },
  {
    id: 'leica',
    listingId: 'leica',
    stage: 'Seller evaluating revised bundle',
    status: 'Waiting',
    askPrice: 2550,
    liveOffer: 2360,
    priceDelta: -190,
    delivery: 'Insured courier S$18',
    updatedAt: '18 min ago',
    buyerGuardrail: 'Do not exceed S$2,420.',
    sellerSignal: 'Seller is trading around accessories.',
    nextAction: 'Wait for seller response.',
    summary: 'Inside range, still accessory-led.',
    messages: [],
    timeline: [],
    audit: [],
    finalDeal: {
      itemPrice: 2360,
      deliveryFee: 18,
      protection: 'Function check before release',
      pickupWindow: 'Courier with signature or Bishan meetup',
      inspection: '48-hour shutter and sensor verification',
      seller: 'Bishan Camera Club / Bishan',
    },
  },
  {
    id: 'linea',
    listingId: 'linea',
    stage: 'Service records under review',
    status: 'Hold',
    askPrice: 1380,
    liveOffer: 1240,
    priceDelta: -140,
    delivery: 'Courier quoted separately',
    updatedAt: '44 min ago',
    buyerGuardrail: 'Require signed service history.',
    sellerSignal: 'Paperwork is incomplete.',
    nextAction: 'Hold until maintenance evidence is complete.',
    summary: 'Good economics, incomplete evidence.',
    messages: [],
    timeline: [],
    audit: [],
    finalDeal: {
      itemPrice: 1240,
      deliveryFee: 0,
      protection: 'Funds held until service records are complete',
      pickupWindow: 'Courier scheduling deferred',
      inspection: 'Bench test required on arrival',
      seller: 'Holland Village Home / Queenstown',
    },
  },
]

const negotiationViewIds = new Set(['aeron', 'leica', 'linea'])

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'SGD',
  maximumFractionDigits: 0,
})

function App() {
  const [activeScreen, setActiveScreen] = useState<Screen>('timeline')
  const [activeNegotiationId, setActiveNegotiationId] = useState('aeron')
  const [searchQuery, setSearchQuery] = useState('')
  const [buyerTarget, setBuyerTarget] = useState(1825)
  const [buyerCap, setBuyerCap] = useState(1960)
  const [sellerFloor, setSellerFloor] = useState(1915)
  const [autoApprove, setAutoApprove] = useState(true)
  const [draftInstruction, setDraftInstruction] = useState(
    'Keep the current inspection window. Reopen only if delivery slips.',
  )
  const deferredSearch = useDeferredValue(searchQuery)

  const activeNegotiation =
    negotiations.find((entry) => entry.id === activeNegotiationId) ?? negotiations[0]
  const activeListing =
    listings.find((entry) => entry.id === activeNegotiation.listingId) ?? listings[0]

  const filteredListings = listings.filter((listing) => {
    const haystack =
      `${listing.title} ${listing.category} ${listing.seller} ${listing.location}`.toLowerCase()
    return haystack.includes(deferredSearch.toLowerCase())
  })

  const filteredNegotiations = negotiations.filter((entry) => {
    const listing = listings.find((candidate) => candidate.id === entry.listingId)
    const haystack =
      `${listing?.title ?? ''} ${entry.status} ${entry.stage}`.toLowerCase()
    return haystack.includes(deferredSearch.toLowerCase())
  })

  function goTo(screen: Screen) {
    startTransition(() => {
      setActiveScreen(screen)
    })
  }

  function openNegotiation(negotiationId: string, screen: Screen = 'timeline') {
    startTransition(() => {
      setActiveNegotiationId(negotiationId)
      setActiveScreen(screen)
    })
  }

  return (
    <div className="min-h-screen bg-[color:var(--canvas)] text-[color:var(--ink)]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col px-4 py-4 sm:px-5 sm:py-5">
        <header className="shell-panel flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[color:var(--primary)] text-[0.78rem] font-semibold text-white">
              DR
            </div>
            <div>
              <p className="text-[0.72rem] font-medium uppercase tracking-[0.08em] text-[color:var(--muted)]">
                DealRoom
              </p>
              <h1 className="text-[1.18rem] font-semibold tracking-[-0.03em]">
                Marketplace negotiation
              </h1>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="field-shell min-w-[16rem]">
              <Icon className="h-3.5 w-3.5 text-[color:var(--muted)]" />
              <input
                aria-label="Search listings or negotiations"
                className="w-full bg-transparent text-[0.82rem] text-[color:var(--ink)] outline-none placeholder:text-[color:var(--muted)]"
                placeholder="Search listings or sellers"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </label>
            <span className="status-chip">
              <span className="status-dot bg-[color:var(--verification)]" />
              14 sellers online
            </span>
          </div>
        </header>

        <div className="mt-5 grid gap-5 xl:grid-cols-[216px_minmax(0,1fr)]">
          <aside className="space-y-4 xl:sticky xl:top-5 xl:self-start">
            <nav className="shell-panel p-2">
              <ul className="space-y-1">
                {screenMeta.map((item) => {
                  const active = activeScreen === item.id
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={`nav-item ${active ? 'nav-item-active' : ''}`}
                        onClick={() => goTo(item.id)}
                      >
                        <span>{item.label}</span>
                        {item.badge ? <span className="nav-badge">{item.badge}</span> : null}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </nav>

            <section className="shell-panel px-4 py-4">
              <p className="text-[0.72rem] uppercase tracking-[0.08em] text-[color:var(--muted)]">
                Focus
              </p>
              <h2 className="mt-2 text-[0.98rem] font-semibold tracking-[-0.02em]">
                {activeListing.title}
              </h2>
              <div className="mt-3 grid gap-2 text-[0.8rem]">
                <MetricLine label="Total" value={money(activeNegotiation.finalDeal.itemPrice + activeNegotiation.finalDeal.deliveryFee)} />
                <MetricLine label="State" value={activeNegotiation.status} />
                <MetricLine label="Updated" value={activeNegotiation.updatedAt} />
              </div>
              <button
                type="button"
                className="button-primary mt-4 w-full"
                onClick={() => openNegotiation(activeNegotiation.id, 'timeline')}
              >
                Open workspace
              </button>
            </section>
          </aside>

          <main className="space-y-4">
            {activeScreen === 'home' ? (
              <MarketplaceHome
                listings={filteredListings}
                activeNegotiation={activeNegotiation}
                onLaunchNegotiation={openNegotiation}
              />
            ) : null}

            {activeScreen === 'agents' ? (
              <AgentConfiguration
                buyerTarget={buyerTarget}
                buyerCap={buyerCap}
                sellerFloor={sellerFloor}
                autoApprove={autoApprove}
                onBuyerTargetChange={setBuyerTarget}
                onBuyerCapChange={setBuyerCap}
                onSellerFloorChange={setSellerFloor}
                onAutoApproveChange={setAutoApprove}
              />
            ) : null}

            {activeScreen === 'negotiations' ? (
              <MyNegotiations
                negotiations={filteredNegotiations}
                listings={listings}
                onOpen={(negotiationId, screen) => openNegotiation(negotiationId, screen)}
              />
            ) : null}

            {activeScreen === 'timeline' ? (
              <NegotiationWorkspace
                listing={activeListing}
                negotiation={activeNegotiation}
                draftInstruction={draftInstruction}
                onDraftInstructionChange={setDraftInstruction}
                onViewFinalDeal={() => goTo('final')}
              />
            ) : null}

            {activeScreen === 'final' ? (
              <FinalDealScreen
                listing={activeListing}
                negotiation={activeNegotiation}
                onViewAudit={() => goTo('audit')}
              />
            ) : null}

            {activeScreen === 'audit' ? (
              <AuditTrailScreen listing={activeListing} negotiation={activeNegotiation} />
            ) : null}
          </main>
        </div>
      </div>
    </div>
  )
}

function MarketplaceHome({
  listings,
  activeNegotiation,
  onLaunchNegotiation,
}: {
  listings: Listing[]
  activeNegotiation: Negotiation
  onLaunchNegotiation: (negotiationId: string, screen?: Screen) => void
}) {
  return (
    <>
      <SectionHeader
        title="Marketplace"
        description="Live inventory with negotiation-ready pricing and seller signals."
        actions={
          <button
            type="button"
            className="button-primary"
            onClick={() => onLaunchNegotiation(activeNegotiation.id, 'timeline')}
          >
            Resume live deal
          </button>
        }
      />

      <section className="shell-panel overflow-hidden">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1.1fr)_320px]">
          <div className="listing-hero listing-hero-indigo">
            <div className="flex h-full flex-col justify-end gap-3">
              <span className="meta-pill">Featured listing</span>
              <div>
                <p className="text-[0.76rem] font-medium uppercase tracking-[0.08em] text-[color:var(--muted)]">
                  Office furniture
                </p>
                <h2 className="mt-1 text-[1.45rem] font-semibold tracking-[-0.03em]">
                  Secretlab TITAN Evo 2022, SoftWeave charcoal
                </h2>
              </div>
            </div>
          </div>

          <div className="border-t border-[color:var(--line)] px-4 py-4 lg:border-l lg:border-t-0">
            <div className="grid gap-2 text-[0.82rem]">
              <MetricLine label="Ask" value={money(640)} />
              <MetricLine label="Seller" value="CityHall Studio" />
              <MetricLine label="Location" value="Tanjong Pagar" />
              <MetricLine label="Trust" value="Receipt + seller ID verified" />
            </div>
            <p className="mt-4 text-[0.82rem] leading-5 text-[color:var(--muted)]">
              Includes magnetic head pillow and original receipt.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="button-primary"
                onClick={() => onLaunchNegotiation(activeNegotiation.id, 'timeline')}
              >
                Open negotiation
              </button>
              <button type="button" className="button-secondary">
                Save
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {listings.map((listing) => (
          <article key={listing.id} className="listing-card">
            <div className={`listing-thumb listing-thumb-${listing.accent}`}>
              <span className="meta-pill">{listing.inventory}</span>
            </div>
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[1rem] font-semibold tracking-[-0.02em]">
                    {money(listing.price)}
                  </p>
                  <h3 className="mt-1 text-[0.92rem] font-medium text-[color:var(--ink)]">
                    {listing.title}
                  </h3>
                </div>
                <span className="tone-pill tone-pill-verification">{listing.condition}</span>
              </div>
              <p className="text-[0.78rem] text-[color:var(--muted)]">
                {listing.seller} · {listing.location}
              </p>
              <div className="flex items-center justify-between gap-3 pt-1">
                <span className="text-[0.78rem] text-[color:var(--muted)]">
                  {listing.shipping}
                </span>
                {negotiationViewIds.has(listing.id) ? (
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => onLaunchNegotiation(listing.id, 'timeline')}
                  >
                    Open
                  </button>
                ) : (
                  <button type="button" className="button-secondary">
                    Start
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </section>
    </>
  )
}

function AgentConfiguration({
  buyerTarget,
  buyerCap,
  sellerFloor,
  autoApprove,
  onBuyerTargetChange,
  onBuyerCapChange,
  onSellerFloorChange,
  onAutoApproveChange,
}: {
  buyerTarget: number
  buyerCap: number
  sellerFloor: number
  autoApprove: boolean
  onBuyerTargetChange: (value: number) => void
  onBuyerCapChange: (value: number) => void
  onSellerFloorChange: (value: number) => void
  onAutoApproveChange: (value: boolean) => void
}) {
  return (
    <>
      <SectionHeader
        title="Agents"
        description="Compact buyer and seller rules."
        actions={<button type="button" className="button-primary">Save rules</button>}
      />

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="shell-panel px-4 py-4">
          <PanelTitle title="Buyer" badge="Buyer side" />
          <div className="mt-4 space-y-5">
            <SliderField
              label="Opening target"
              value={buyerTarget}
              min={1750}
              max={1950}
              step={25}
              onChange={onBuyerTargetChange}
            />
            <SliderField
              label="Hard cap"
              value={buyerCap}
              min={1880}
              max={2050}
              step={5}
              onChange={onBuyerCapChange}
            />
            <MiniList
              title="Guardrails"
              items={[
                'Keep a 24-hour inspection window.',
                'Do not trade verified accessories.',
                'Escalate if delivery slips past Wednesday.',
              ]}
            />
          </div>
        </article>

        <article className="shell-panel px-4 py-4">
          <PanelTitle title="Seller" badge="Seller side" />
          <div className="mt-4 space-y-5">
            <SliderField
              label="Minimum item price"
              value={sellerFloor}
              min={1880}
              max={1985}
              step={5}
              onChange={onSellerFloorChange}
            />

            <div className="flex items-center justify-between gap-4 border-t border-[color:var(--line)] pt-4">
              <div>
                <p className="text-[0.82rem] font-medium text-[color:var(--ink)]">
                  Auto-approve matching terms
                </p>
                <p className="mt-1 text-[0.76rem] text-[color:var(--muted)]">
                  Finalize if price and delivery stay unchanged.
                </p>
              </div>
              <button
                type="button"
                className={`toggle-shell ${autoApprove ? 'toggle-shell-active' : ''}`}
                aria-pressed={autoApprove}
                onClick={() => onAutoApproveChange(!autoApprove)}
              >
                <span className={`toggle-thumb ${autoApprove ? 'translate-x-4' : ''}`} />
              </button>
            </div>

            <MiniList
              title="Allowed concessions"
              items={[
                'Keep the magnetic head pillow included above the floor.',
                'Split delivery into a separate line item.',
                'Prioritize pickup before cutting price further.',
              ]}
            />
          </div>
        </article>
      </section>
    </>
  )
}

function MyNegotiations({
  negotiations,
  listings,
  onOpen,
}: {
  negotiations: Negotiation[]
  listings: Listing[]
  onOpen: (negotiationId: string, screen: Screen) => void
}) {
  return (
    <>
      <SectionHeader
        title="Negotiations"
        description="Active threads only."
        actions={<button type="button" className="button-secondary">Filter</button>}
      />

      <section className="shell-panel overflow-hidden">
        <div className="divide-y divide-[color:var(--line)]">
          {negotiations.map((entry) => {
            const listing = listings.find((candidate) => candidate.id === entry.listingId)
            return (
              <article
                key={entry.id}
                className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(0,1.3fr)_120px_190px_auto] lg:items-center"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={statusClass(entry.status)}>{entry.status}</span>
                    <span className="text-[0.74rem] text-[color:var(--muted)]">{entry.stage}</span>
                  </div>
                  <h2 className="mt-2 truncate text-[0.98rem] font-semibold tracking-[-0.02em]">
                    {listing?.title}
                  </h2>
                  <p className="mt-1 text-[0.78rem] text-[color:var(--muted)]">{entry.nextAction}</p>
                </div>
                <div className="text-[0.8rem]">
                  <p className="text-[color:var(--muted)]">Offer</p>
                  <p className="mt-1 font-semibold text-[color:var(--ink)]">{money(entry.liveOffer)}</p>
                </div>
                <div className="text-[0.8rem]">
                  <p className="text-[color:var(--muted)]">Guardrail</p>
                  <p className="mt-1 line-clamp-2 text-[color:var(--ink)]">{entry.buyerGuardrail}</p>
                </div>
                <div className="flex gap-2 lg:justify-end">
                  <button
                    type="button"
                    className="button-primary"
                    onClick={() => onOpen(entry.id, 'timeline')}
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    className="button-ghost"
                    onClick={() => onOpen(entry.id, 'final')}
                  >
                    Terms
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      </section>
    </>
  )
}

function NegotiationWorkspace({
  listing,
  negotiation,
  draftInstruction,
  onDraftInstructionChange,
  onViewFinalDeal,
}: {
  listing: Listing
  negotiation: Negotiation
  draftInstruction: string
  onDraftInstructionChange: (value: string) => void
  onViewFinalDeal: () => void
}) {
  const visibleMessages = negotiation.messages.slice(-5)
  const hiddenMessageCount = negotiation.messages.length - visibleMessages.length
  const visibleTimeline = negotiation.timeline.slice(-4)

  return (
    <>
      <SectionHeader
        title="Workspace"
        description={`${listing.title} · ${money(negotiation.finalDeal.itemPrice + negotiation.finalDeal.deliveryFee)}`}
        actions={
          <>
            <button type="button" className="button-secondary">
              Pause
            </button>
            <button type="button" className="button-primary" onClick={onViewFinalDeal}>
              Final deal
            </button>
          </>
        }
      />

      <section className="shell-panel overflow-hidden">
        <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_292px]">
          <div className="px-4 py-4">
            <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--line)] pb-3">
              <span className="tone-pill tone-pill-primary">Live</span>
              <span className="tone-pill tone-pill-verification">{listing.trust}</span>
              <span className="text-[0.76rem] text-[color:var(--muted)]">{negotiation.updatedAt}</span>
            </div>

            <div className="mt-4 grid gap-2 text-[0.82rem] md:grid-cols-3">
              <InlineStat label="Ask" value={money(negotiation.askPrice)} />
              <InlineStat label="Current total" value={money(negotiation.finalDeal.itemPrice + negotiation.finalDeal.deliveryFee)} />
              <InlineStat label="Next" value={negotiation.nextAction} />
            </div>

            <div className="mt-5 rounded-[1rem] bg-[color:var(--surface-subtle)] px-3 py-3 sm:px-4">
              <div className="flex items-center justify-between gap-3 border-b border-[color:var(--line)] pb-3">
                <div>
                  <p className="text-[0.72rem] uppercase tracking-[0.08em] text-[color:var(--muted)]">
                    Live chat
                  </p>
                  <p className="mt-1 text-[0.8rem] text-[color:var(--muted)]">
                    Buyer on the right. Seller on the left.
                  </p>
                </div>
                <span className="meta-pill">Round {negotiation.messages.length}</span>
              </div>

              <div className="mt-4 space-y-3">
              {hiddenMessageCount > 0 ? (
                <div className="rounded-xl bg-[color:var(--surface-muted)] px-3 py-2 text-[0.76rem] text-[color:var(--muted)]">
                  Earlier rounds · {hiddenMessageCount} hidden
                </div>
              ) : null}

              {visibleMessages.map((message) => (
                <MessageRow key={message.id} message={message} />
              ))}
              </div>
            </div>

            <div className="mt-4 border-t border-[color:var(--line)] pt-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[0.82rem] font-medium text-[color:var(--ink)]">
                  Next buyer instruction
                </p>
                <span className="text-[0.72rem] text-[color:var(--muted)]">Structured note</span>
              </div>
              <textarea
                className="mt-3 min-h-20 w-full rounded-xl bg-[color:var(--surface-muted)] px-3 py-3 text-[0.82rem] leading-5 text-[color:var(--ink)] outline-none transition-shadow focus-visible:ring-4 focus-visible:ring-[color:var(--ring)]"
                value={draftInstruction}
                onChange={(event) => onDraftInstructionChange(event.target.value)}
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-[0.76rem] text-[color:var(--muted)]">
                  {negotiation.buyerGuardrail}
                </span>
                <button type="button" className="button-primary">
                  Queue
                </button>
              </div>
            </div>
          </div>

          <aside className="border-t border-[color:var(--line)] bg-[color:var(--surface-subtle)] px-4 py-4 xl:border-l xl:border-t-0">
            <div className="space-y-4">
              <div>
                <p className="text-[0.76rem] uppercase tracking-[0.08em] text-[color:var(--muted)]">
                  Deal
                </p>
                <div className="mt-3 grid gap-2">
                  <RailMetric label="Item" value={money(negotiation.finalDeal.itemPrice)} />
                  <RailMetric
                    label="Delivery"
                    value={money(negotiation.finalDeal.deliveryFee)}
                  />
                  <RailMetric label="State" value={negotiation.status} />
                </div>
              </div>

              <div className="border-t border-[color:var(--line)] pt-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[0.76rem] uppercase tracking-[0.08em] text-[color:var(--muted)]">
                    Timeline
                  </p>
                  <span className="text-[0.72rem] text-[color:var(--muted)]">
                    {negotiation.timeline.length} events
                  </span>
                </div>
                <ol className="mt-3 space-y-3">
                  {visibleTimeline.map((event) => (
                    <li key={event.id} className="flex items-start gap-3">
                      <span className={`timeline-dot timeline-dot-${event.kind} timeline-dot-${event.status}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[0.82rem] font-medium text-[color:var(--ink)]">
                            {event.title}
                          </p>
                          <span className="text-[0.72rem] text-[color:var(--muted)]">
                            {event.time}
                          </span>
                        </div>
                        <p className="mt-1 text-[0.76rem] text-[color:var(--muted)]">
                          {event.detail}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </>
  )
}

function FinalDealScreen({
  listing,
  negotiation,
  onViewAudit,
}: {
  listing: Listing
  negotiation: Negotiation
  onViewAudit: () => void
}) {
  const total = negotiation.finalDeal.itemPrice + negotiation.finalDeal.deliveryFee

  return (
    <>
      <SectionHeader
        title="Final deal"
        description={`${listing.title} · ${money(total)}`}
        actions={
          <>
            <button type="button" className="button-secondary" onClick={onViewAudit}>
              Audit
            </button>
            <button type="button" className="button-primary">
              Approve
            </button>
          </>
        }
      />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <article className="shell-panel px-4 py-4">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[color:var(--line)] pb-4">
            <div>
              <p className="text-[0.76rem] uppercase tracking-[0.08em] text-[color:var(--muted)]">
                Ready for approval
              </p>
              <h2 className="mt-2 text-[1.65rem] font-semibold tracking-[-0.03em]">
                {money(total)}
              </h2>
            </div>
            <span className="tone-pill tone-pill-verification">Checks passed</span>
          </div>

          <div className="mt-4 grid gap-2 md:grid-cols-3">
            <InlineStat label="Item" value={money(negotiation.finalDeal.itemPrice)} />
            <InlineStat label="Delivery" value={money(negotiation.finalDeal.deliveryFee)} />
            <InlineStat label="Delta" value={money(negotiation.priceDelta)} />
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <MiniList
              title="Terms"
              items={[
                negotiation.finalDeal.pickupWindow,
                negotiation.finalDeal.inspection,
                negotiation.finalDeal.protection,
                negotiation.finalDeal.seller,
              ]}
            />
            <MiniList
              title="Why it clears"
              items={[
                'Budget still holds.',
                'Verified accessory set is intact.',
                'Delivery split does not weaken inspection rights.',
                'Comps still support the price.',
              ]}
            />
          </div>
        </article>

        <aside className="shell-panel px-4 py-4">
          <MiniList
            title="Approval checklist"
            items={[
              'Budget guardrail still holds.',
              'Listing evidence remains valid.',
              'Delivery window is acceptable.',
              'Inspection path is documented.',
            ]}
          />
          <div className="mt-4 border-t border-[color:var(--line)] pt-4">
            <p className="text-[0.82rem] font-medium text-[color:var(--ink)]">
              Approval boundary
            </p>
            <p className="mt-2 text-[0.78rem] leading-5 text-[color:var(--muted)]">
              Payment only authorizes after delivery scheduling is confirmed.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button type="button" className="button-primary">
                Approve and schedule
              </button>
              <button type="button" className="button-ghost">
                Reopen shipping
              </button>
            </div>
          </div>
        </aside>
      </section>
    </>
  )
}

function AuditTrailScreen({
  listing,
  negotiation,
}: {
  listing: Listing
  negotiation: Negotiation
}) {
  return (
    <>
      <SectionHeader
        title="Audit"
        description={`${listing.title} · ${negotiation.audit.length} events`}
        actions={<button type="button" className="button-secondary">Export CSV</button>}
      />

      <section className="shell-panel overflow-hidden">
        <div className="px-4 py-4">
          <table className="min-w-full border-separate border-spacing-0 text-left">
            <thead>
              <tr className="text-[0.7rem] uppercase tracking-[0.08em] text-[color:var(--muted)]">
                <th className="pb-3 pr-4">Time</th>
                <th className="pb-3 pr-4">Actor</th>
                <th className="pb-3 pr-4">Action</th>
                <th className="pb-3 pr-4">Evidence</th>
                <th className="pb-3">Result</th>
              </tr>
            </thead>
            <tbody>
              {negotiation.audit.map((entry) => (
                <tr key={entry.id} className="align-top text-[0.8rem]">
                  <td className="border-t border-[color:var(--line)] py-3 pr-4 text-[color:var(--muted)]">
                    {entry.time}
                  </td>
                  <td className="border-t border-[color:var(--line)] py-3 pr-4">
                    <div>
                      <p className="font-medium text-[color:var(--ink)]">{entry.actor}</p>
                      <p className="mt-1 text-[0.72rem] text-[color:var(--muted)]">{entry.lane}</p>
                    </div>
                  </td>
                  <td className="border-t border-[color:var(--line)] py-3 pr-4 text-[color:var(--ink)]">
                    {entry.action}
                  </td>
                  <td className="border-t border-[color:var(--line)] py-3 pr-4 text-[color:var(--muted)]">
                    {entry.evidence}
                  </td>
                  <td className="border-t border-[color:var(--line)] py-3">
                    <span className={resultClass(entry.result)}>{entry.result}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

function SectionHeader({
  title,
  description,
  actions,
}: {
  title: string
  description: string
  actions?: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="text-[1.25rem] font-semibold tracking-[-0.03em] text-[color:var(--ink)]">
          {title}
        </h2>
        <p className="mt-1 text-[0.8rem] text-[color:var(--muted)]">{description}</p>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </section>
  )
}

function PanelTitle({ title, badge }: { title: string; badge: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[color:var(--line)] pb-3">
      <h3 className="text-[0.95rem] font-semibold tracking-[-0.02em] text-[color:var(--ink)]">
        {title}
      </h3>
      <span className="tone-pill tone-pill-primary">{badge}</span>
    </div>
  )
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[0.82rem] font-medium text-[color:var(--ink)]">{label}</p>
        <span className="text-[0.8rem] font-medium text-[color:var(--muted)]">
          {money(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-3 h-1.5 w-full cursor-pointer accent-[color:var(--primary)]"
      />
      <div className="mt-2 flex justify-between text-[0.72rem] text-[color:var(--muted)]">
        <span>{money(min)}</span>
        <span>{money(max)}</span>
      </div>
    </label>
  )
}

function MiniList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-[0.82rem] font-medium text-[color:var(--ink)]">{title}</p>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2 text-[0.78rem] text-[color:var(--muted)]">
            <span className="mt-[0.38rem] h-1.5 w-1.5 rounded-full bg-[color:var(--verification)]" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function MessageRow({ message }: { message: Message }) {
  const cardClass =
    message.type === 'offer'
      ? 'message-row-offer'
      : message.type === 'counter'
        ? 'message-row-counter'
        : message.type === 'approval'
          ? 'message-row-approval'
          : message.side === 'verification'
            ? 'message-row-verification'
            : 'message-row-status'

  const wrapperClass =
    message.side === 'buyer'
      ? 'justify-end'
      : message.side === 'seller'
        ? 'justify-start'
        : 'justify-center'

  const bubbleWidth =
    message.side === 'system' || message.side === 'verification'
      ? 'max-w-[20rem]'
      : 'max-w-[30rem]'

  const metaTone =
    message.side === 'buyer'
      ? 'text-white/80'
      : message.side === 'seller'
        ? 'text-[color:var(--muted)]'
        : 'text-[color:var(--muted)]'

  return (
    <article className={`flex ${wrapperClass}`}>
      <div className={`message-row ${cardClass} ${bubbleWidth}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className={`flex flex-wrap items-center gap-2 ${metaTone}`}>
              <span className="text-[0.74rem] font-medium">{message.actor}</span>
              <span className="text-[0.7rem]">{labelForType(message.type)}</span>
            </div>
            <h3 className="mt-1 text-[0.92rem] font-semibold tracking-[-0.02em] text-inherit">
              {message.title}
            </h3>
          </div>
          {typeof message.amount === 'number' ? (
            <span className="text-[0.84rem] font-semibold text-inherit">
              {money(message.amount)}
            </span>
          ) : null}
        </div>
        <p className="mt-2 text-[0.8rem] leading-5 text-inherit">{message.body}</p>
        {message.meta?.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {message.meta.slice(0, 2).map((entry) => (
              <span
                key={entry}
                className={`meta-pill ${message.side === 'buyer' ? 'meta-pill-inverse' : ''}`}
              >
                {entry}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  )
}

function MetricLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-[0.76rem] text-[color:var(--muted)]">{label}</span>
      <span className="max-w-[12rem] text-right text-[0.82rem] font-medium text-[color:var(--ink)]">
        {value}
      </span>
    </div>
  )
}

function InlineStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[color:var(--surface-subtle)] px-3 py-3">
      <p className="text-[0.7rem] uppercase tracking-[0.08em] text-[color:var(--muted)]">
        {label}
      </p>
      <p className="mt-1 text-[0.82rem] font-medium text-[color:var(--ink)]">{value}</p>
    </div>
  )
}

function RailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[color:var(--surface)] px-3 py-3">
      <p className="text-[0.7rem] uppercase tracking-[0.08em] text-[color:var(--muted)]">
        {label}
      </p>
      <p className="mt-1 text-[0.82rem] font-medium text-[color:var(--ink)]">{value}</p>
    </div>
  )
}

function Icon({
  className = '',
}: {
  className?: string
}) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={className}>
      <path
        d="M15.5 15.5 12 12m1-4.5A5.5 5.5 0 1 1 2 7.5a5.5 5.5 0 0 1 11 0Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  )
}

function statusClass(status: Negotiation['status']) {
  if (status === 'Ready') return 'tone-pill tone-pill-primary'
  if (status === 'Waiting') return 'tone-pill tone-pill-amber'
  return 'tone-pill tone-pill-verification'
}

function resultClass(result: AuditEvent['result']) {
  if (result === 'Verified') return 'tone-pill tone-pill-verification'
  if (result === 'Needs review') return 'tone-pill tone-pill-amber'
  return 'tone-pill tone-pill-primary'
}

function labelForType(type: Message['type']) {
  if (type === 'offer') return 'Buyer'
  if (type === 'counter') return 'Seller'
  if (type === 'approval') return 'Approval'
  return 'System'
}

function money(value: number) {
  return currency.format(value)
}

export default App
