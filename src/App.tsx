import { startTransition, useDeferredValue, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  approveNegotiation,
  createListing,
  createNegotiationCampaign,
  fetchBuyerProfile,
  fetchListings,
  fetchNegotiationBranch,
  fetchNegotiations,
  fetchSellerConfig,
  getApiBaseUrl,
  saveBuyerProfile,
  saveSellerConfig,
} from './lib/dealroomApi'
import {
  createPlaceholderNegotiation,
  mapBranchToNegotiation,
  mapListingViewToCard,
  type AuditEvent,
  type Listing,
  type Negotiation,
} from './lib/viewModels'
import type {
  BuyerAgentProfile,
  CreateListingRequest,
  NegotiationBranchView,
  SellerAgentConfig,
} from './shared/negotiation'

type Screen =
  | 'home'
  | 'agents'
  | 'negotiations'
  | 'timeline'
  | 'final'
  | 'audit'

const BUYER_USER_ID = 'demo-buyer'

const screenMeta: Array<{ id: Screen; label: string; badge?: string }> = [
  { id: 'home', label: 'Marketplace' },
  { id: 'agents', label: 'Agents' },
  { id: 'negotiations', label: 'Negotiations' },
  { id: 'timeline', label: 'Workspace', badge: 'Live' },
  { id: 'final', label: 'Final deal' },
  { id: 'audit', label: 'Audit' },
]

const defaultBuyerProfile: BuyerAgentProfile = {
  userId: BUYER_USER_ID,
  displayName: 'Demo Buyer',
  utilityWeights: {
    price: 0.55,
    delivery: 0.25,
    reputation: 0.1,
    returns: 0.1,
  },
  reservationValue: {
    maximumBudget: 1960,
  },
  strategy: 'balanced',
  guardrails: [
    'Keep a 24-hour inspection window.',
    'Do not trade verified accessories.',
    'Escalate if delivery slips past Wednesday.',
  ],
  preferences: {
    targetPrice: 1825,
    maxDeliveryDays: 3,
    minimumSellerRating: 4,
    preferredReturnPolicy: '14-day return policy',
  },
}

const defaultSellerConfig: SellerAgentConfig = {
  utilityWeights: {
    profitMargin: 0.6,
    inventoryClearance: 0.25,
    customerSatisfaction: 0.15,
  },
  reservationValue: {
    minimumAcceptablePrice: 1915,
  },
  strategy: 'balanced',
  guardrails: [
    'Keep included accessories in the quoted total.',
    'Split delivery into a separate line item if needed.',
    'Prefer pickup before further discounting.',
  ],
  inventoryPressure: 'medium',
  customerSatisfactionTarget: 'medium',
}

const defaultListingForm = {
  title: '',
  description: '',
  price: 0,
  condition: 'Very good',
  returnPolicy: '14-day return policy',
  sellerName: '',
  sellerRating: 4.8,
  sellerMinPrice: 0,
  sellerInventory: 1,
  deliveryDays: 3,
}

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'SGD',
  maximumFractionDigits: 0,
})

function mergeBranches(
  current: NegotiationBranchView[],
  incoming: NegotiationBranchView[],
) {
  const byId = new Map(current.map((entry) => [entry.id, entry]))
  for (const branch of incoming) {
    byId.set(branch.id, branch)
  }
  return Array.from(byId.values()).sort((left, right) => {
    const leftTime = new Date(
      left.messages.at(-1)?.createdAt ?? left.auditEvents.at(-1)?.createdAt ?? 0,
    ).getTime()
    const rightTime = new Date(
      right.messages.at(-1)?.createdAt ?? right.auditEvents.at(-1)?.createdAt ?? 0,
    ).getTime()
    return rightTime - leftTime
  })
}

function listingIdForBranch(branches: NegotiationBranchView[], listingId: string) {
  return branches.find((branch) => branch.listingId === listingId)
}

function App() {
  const [activeScreen, setActiveScreen] = useState<Screen>('home')
  const [activeNegotiationId, setActiveNegotiationId] = useState<string | null>(null)
  const [activeListingId, setActiveListingId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [buyerTarget, setBuyerTarget] = useState(defaultBuyerProfile.preferences?.targetPrice ?? 1825)
  const [buyerCap, setBuyerCap] = useState(defaultBuyerProfile.reservationValue.maximumBudget)
  const [sellerFloor, setSellerFloor] = useState(defaultSellerConfig.reservationValue.minimumAcceptablePrice)
  const [autoApprove, setAutoApprove] = useState(false)
  const [draftInstruction, setDraftInstruction] = useState(
    'Backend uses saved buyer and seller configuration only. Refresh the branch after saving rule changes.',
  )
  const [listings, setListings] = useState<Listing[]>([])
  const [branches, setBranches] = useState<NegotiationBranchView[]>([])
  const [buyerProfile, setBuyerProfile] = useState<BuyerAgentProfile>(defaultBuyerProfile)
  const [sellerConfig, setSellerConfig] = useState<SellerAgentConfig>(defaultSellerConfig)
  const [isLoading, setIsLoading] = useState(true)
  const [isSavingRules, setIsSavingRules] = useState(false)
  const [isStartingNegotiation, setIsStartingNegotiation] = useState(false)
  const [isApproving, setIsApproving] = useState(false)
  const [isCreatingListing, setIsCreatingListing] = useState(false)
  const [showListingForm, setShowListingForm] = useState(false)
  const [listingForm, setListingForm] = useState(defaultListingForm)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const deferredSearch = useDeferredValue(searchQuery)

  useEffect(() => {
    void loadInitialData()
  }, [])

  useEffect(() => {
    if (!activeListingId && listings.length > 0) {
      setActiveListingId(listings[0].id)
    }
  }, [activeListingId, listings])

  useEffect(() => {
    if (!activeNegotiationId && branches.length > 0) {
      setActiveNegotiationId(branches[0].id)
    }
  }, [activeNegotiationId, branches])

  useEffect(() => {
    const listing = listings.find((entry) => entry.id === activeListingId)
    if (!listing) {
      return
    }

    void loadSellerConfig(listing.sellerId)
  }, [activeListingId, listings])

  useEffect(() => {
    if (!activeNegotiationId) {
      return
    }

    const eventSource = new EventSource(
      `${getApiBaseUrl()}/api/negotiations/${activeNegotiationId}/stream`,
    )

    const refresh = () => {
      void refreshNegotiation(activeNegotiationId)
    }

    eventSource.addEventListener('state', refresh)
    eventSource.addEventListener('message', refresh)
    eventSource.addEventListener('audit', refresh)
    eventSource.addEventListener('completed', refresh)
    eventSource.onerror = () => {
      eventSource.close()
    }

    return () => {
      eventSource.close()
    }
  }, [activeNegotiationId])

  async function loadInitialData() {
    setIsLoading(true)
    setErrorMessage(null)

    try {
      const [listingViews, negotiationViews, savedBuyerProfile] = await Promise.all([
        fetchListings(),
        fetchNegotiations(),
        fetchBuyerProfile(BUYER_USER_ID),
      ])

      const mappedListings = listingViews.map(mapListingViewToCard)
      setListings(mappedListings)
      setBranches(negotiationViews)

      const profile = savedBuyerProfile ?? defaultBuyerProfile
      setBuyerProfile(profile)
      setBuyerTarget(profile.preferences?.targetPrice ?? defaultBuyerProfile.preferences?.targetPrice ?? 1825)
      setBuyerCap(profile.reservationValue.maximumBudget)

      if (mappedListings.length > 0) {
        setActiveListingId(mappedListings[0].id)
      }

      if (negotiationViews.length > 0) {
        setActiveNegotiationId(negotiationViews[0].id)
        setActiveScreen('timeline')
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load DealRoom data.')
    } finally {
      setIsLoading(false)
    }
  }

  async function loadSellerConfig(sellerId: string) {
    try {
      const config = await fetchSellerConfig(sellerId)
      setSellerConfig(config)
      setSellerFloor(config.reservationValue.minimumAcceptablePrice)
    } catch (error) {
      setSellerConfig(defaultSellerConfig)
      setSellerFloor(defaultSellerConfig.reservationValue.minimumAcceptablePrice)
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load seller configuration.')
    }
  }

  async function refreshNegotiation(negotiationId: string) {
    try {
      const branch = await fetchNegotiationBranch(negotiationId)
      setBranches((current) => mergeBranches(current, [branch]))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to refresh negotiation branch.')
    }
  }

  async function handleSaveRules() {
    const activeListing = listings.find((entry) => entry.id === activeListingId)
    if (!activeListing) {
      setErrorMessage('Choose a listing before saving rules.')
      return
    }

    setIsSavingRules(true)
    setErrorMessage(null)
    setNotice(null)

    const nextBuyerProfile: BuyerAgentProfile = {
      ...buyerProfile,
      userId: BUYER_USER_ID,
      reservationValue: {
        maximumBudget: buyerCap,
      },
      preferences: {
        ...buyerProfile.preferences,
        targetPrice: buyerTarget,
      },
    }

    const nextSellerConfig: SellerAgentConfig = {
      ...sellerConfig,
      reservationValue: {
        minimumAcceptablePrice: sellerFloor,
      },
    }

    try {
      const [savedBuyer, savedSeller] = await Promise.all([
        saveBuyerProfile(nextBuyerProfile),
        saveSellerConfig(activeListing.sellerId, nextSellerConfig),
      ])

      setBuyerProfile(savedBuyer)
      setSellerConfig(savedSeller)
      setNotice('Buyer and seller agent rules are saved to the backend.')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save backend rules.')
    } finally {
      setIsSavingRules(false)
    }
  }

  async function handleStartNegotiation(listing: Listing) {
    setIsStartingNegotiation(true)
    setErrorMessage(null)
    setNotice(null)

    const currentBuyerProfile: BuyerAgentProfile = {
      ...buyerProfile,
      userId: BUYER_USER_ID,
      reservationValue: {
        maximumBudget: buyerCap,
      },
      preferences: {
        ...buyerProfile.preferences,
        targetPrice: buyerTarget,
      },
    }

    try {
      const campaign = await createNegotiationCampaign({
        buyerUserId: BUYER_USER_ID,
        buyerProfile: currentBuyerProfile,
        priority: 'high',
        autoApprove,
        targets: [
          {
            listingId: listing.id,
            sellerId: listing.sellerId,
          },
        ],
      })

      setBranches((current) => mergeBranches(current, campaign.negotiations))
      const branch = campaign.negotiations[0]
      if (branch) {
        setActiveNegotiationId(branch.id)
        setActiveListingId(branch.listingId)
        setActiveScreen('timeline')
        setNotice(`Negotiation campaign ${campaign.campaignId} started.`)
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to start negotiation.')
    } finally {
      setIsStartingNegotiation(false)
    }
  }

  async function handleApproveNegotiation() {
    if (!activeNegotiationId) {
      return
    }

    setIsApproving(true)
    setErrorMessage(null)
    setNotice(null)

    try {
      const approvedBranch = await approveNegotiation(activeNegotiationId)
      setBranches((current) => mergeBranches(current, [approvedBranch]))
      setNotice('Final deal approved and saved in the backend.')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to approve the final deal.')
    } finally {
      setIsApproving(false)
    }
  }

  async function handleCreateListing() {
    setIsCreatingListing(true)
    setErrorMessage(null)
    setNotice(null)

    try {
      const payload: CreateListingRequest = {
        title: listingForm.title,
        description: listingForm.description || null,
        price: listingForm.price,
        condition: listingForm.condition,
        returnPolicy: listingForm.returnPolicy || null,
        seller: {
          name: listingForm.sellerName,
          rating: listingForm.sellerRating,
          minPrice: listingForm.sellerMinPrice || listingForm.price,
          inventory: listingForm.sellerInventory,
          deliveryDays: listingForm.deliveryDays,
        },
      }

      const created = await createListing(payload)
      const mapped = mapListingViewToCard(created)
      setListings((current) => [mapped, ...current])
      setActiveListingId(mapped.id)
      setShowListingForm(false)
      setListingForm(defaultListingForm)
      setNotice(`Added ${created.title} from seller ${created.sellerName}.`)
      goTo('home')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create listing.')
    } finally {
      setIsCreatingListing(false)
    }
  }

  function goTo(screen: Screen) {
    startTransition(() => {
      setActiveScreen(screen)
    })
  }

  function openNegotiation(negotiationId: string, screen: Screen = 'timeline') {
    const branch = branches.find((entry) => entry.id === negotiationId)
    startTransition(() => {
      setActiveNegotiationId(negotiationId)
      if (branch) {
        setActiveListingId(branch.listingId)
      }
      setActiveScreen(screen)
    })
  }

  const allNegotiations = branches.map(mapBranchToNegotiation)
  const activeBranch = activeNegotiationId
    ? branches.find((entry) => entry.id === activeNegotiationId) ?? null
    : null

  const activeNegotiation = activeBranch
    ? mapBranchToNegotiation(activeBranch)
    : activeListingId
      ? createPlaceholderNegotiation(
          listings.find((entry) => entry.id === activeListingId) ?? listings[0],
        )
      : listings[0]
        ? createPlaceholderNegotiation(listings[0])
        : null

  const activeListing = activeNegotiation
    ? listings.find((entry) => entry.id === activeNegotiation.listingId) ??
      listings.find((entry) => entry.id === activeListingId) ??
      listings[0] ??
      null
    : listings.find((entry) => entry.id === activeListingId) ?? listings[0] ?? null

  const featuredListing = activeListing ?? listings[0] ?? null
  const featuredBranch = featuredListing
    ? listingIdForBranch(branches, featuredListing.id)
    : undefined

  const filteredListings = listings.filter((listing) => {
    const haystack =
      `${listing.title} ${listing.category} ${listing.seller} ${listing.location}`.toLowerCase()
    return haystack.includes(deferredSearch.toLowerCase())
  })

  const filteredNegotiations = allNegotiations.filter((entry) => {
    const listing = listings.find((candidate) => candidate.id === entry.listingId)
    const haystack =
      `${listing?.title ?? ''} ${entry.status} ${entry.stage}`.toLowerCase()
    return haystack.includes(deferredSearch.toLowerCase())
  })

  const onlineSellerCount = new Set(listings.map((listing) => listing.sellerId)).size
  const negotiationListingIds = new Set(branches.map((branch) => branch.listingId))
  const negotiationIdByListingId = new Map(
    branches.map((branch) => [branch.listingId, branch.id]),
  )

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
              {onlineSellerCount} sellers online
            </span>
          </div>
        </header>

        {errorMessage ? (
          <div className="mt-4 rounded-2xl border border-[color:var(--line)] bg-[color:var(--amber-soft)] px-4 py-3 text-[0.82rem] text-[color:var(--ink)]">
            {errorMessage}
          </div>
        ) : null}

        {notice ? (
          <div className="mt-4 rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface)] px-4 py-3 text-[0.82rem] text-[color:var(--ink)]">
            {notice}
          </div>
        ) : null}

        <div className="mt-5 grid gap-5 xl:grid-cols-[216px_minmax(0,1fr)]">
          <aside className="space-y-4 xl:sticky xl:top-5 xl:self-start">
            <nav className="shell-panel p-2">
              <ul className="space-y-1">
                {screenMeta.map((item) => {
                  const active = activeScreen === item.id
                  const badge =
                    item.id === 'negotiations'
                      ? String(allNegotiations.length)
                      : item.badge
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={`nav-item ${active ? 'nav-item-active' : ''}`}
                        onClick={() => goTo(item.id)}
                      >
                        <span>{item.label}</span>
                        {badge ? <span className="nav-badge">{badge}</span> : null}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </nav>

            {activeListing && activeNegotiation ? (
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
                  onClick={() => activeBranch ? openNegotiation(activeBranch.id, 'timeline') : handleStartNegotiation(activeListing)}
                >
                  {activeBranch ? 'Open workspace' : 'Start negotiation'}
                </button>
              </section>
            ) : null}
          </aside>

          <main className="space-y-4">
            {isLoading ? (
              <section className="shell-panel px-4 py-8 text-[0.9rem] text-[color:var(--muted)]">
                Loading marketplace and negotiation data from the backend.
              </section>
            ) : null}

            {!isLoading && activeScreen === 'home' ? (
              <MarketplaceHome
                listings={filteredListings}
                featuredListing={featuredListing}
                featuredNegotiationId={featuredBranch?.id ?? null}
                activeNegotiation={activeNegotiation}
                negotiationListingIds={negotiationListingIds}
                negotiationIdByListingId={negotiationIdByListingId}
                isStartingNegotiation={isStartingNegotiation}
                isCreatingListing={isCreatingListing}
                listingForm={listingForm}
                showListingForm={showListingForm}
                onOpenNegotiation={openNegotiation}
                onStartNegotiation={handleStartNegotiation}
                onCreateListing={handleCreateListing}
                onListingFormChange={setListingForm}
                onToggleListingForm={() => setShowListingForm((current) => !current)}
              />
            ) : null}

            {!isLoading && activeScreen === 'agents' && activeListing ? (
              <AgentConfiguration
                buyerTarget={buyerTarget}
                buyerCap={buyerCap}
                sellerFloor={sellerFloor}
                autoApprove={autoApprove}
                sellerName={activeListing.seller}
                isSaving={isSavingRules}
                onBuyerTargetChange={setBuyerTarget}
                onBuyerCapChange={setBuyerCap}
                onSellerFloorChange={setSellerFloor}
                onAutoApproveChange={setAutoApprove}
                onSave={handleSaveRules}
              />
            ) : null}

            {!isLoading && activeScreen === 'negotiations' ? (
              <MyNegotiations
                negotiations={filteredNegotiations}
                listings={listings}
                onOpen={(negotiationId, screen) => openNegotiation(negotiationId, screen)}
              />
            ) : null}

            {!isLoading && activeScreen === 'timeline' && activeListing && activeNegotiation ? (
              <NegotiationWorkspace
                listing={activeListing}
                negotiation={activeNegotiation}
                draftInstruction={draftInstruction}
                onDraftInstructionChange={setDraftInstruction}
                onRefresh={() => activeBranch ? refreshNegotiation(activeBranch.id) : undefined}
                onViewFinalDeal={() => goTo('final')}
              />
            ) : null}

            {!isLoading && activeScreen === 'final' && activeListing && activeNegotiation ? (
              <FinalDealScreen
                listing={activeListing}
                negotiation={activeNegotiation}
                isApproving={isApproving}
                onApprove={handleApproveNegotiation}
                onViewAudit={() => goTo('audit')}
              />
            ) : null}

            {!isLoading && activeScreen === 'audit' && activeListing && activeNegotiation ? (
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
  featuredListing,
  featuredNegotiationId,
  activeNegotiation,
  negotiationListingIds,
  negotiationIdByListingId,
  isStartingNegotiation,
  isCreatingListing,
  listingForm,
  showListingForm,
  onOpenNegotiation,
  onStartNegotiation,
  onCreateListing,
  onListingFormChange,
  onToggleListingForm,
}: {
  listings: Listing[]
  featuredListing: Listing | null
  featuredNegotiationId: string | null
  activeNegotiation: Negotiation | null
  negotiationListingIds: Set<string>
  negotiationIdByListingId: Map<string, string>
  isStartingNegotiation: boolean
  isCreatingListing: boolean
  listingForm: {
    title: string
    description: string
    price: number
    condition: string
    returnPolicy: string
    sellerName: string
    sellerRating: number
    sellerMinPrice: number
    sellerInventory: number
    deliveryDays: number
  }
  showListingForm: boolean
  onOpenNegotiation: (negotiationId: string, screen?: Screen) => void
  onStartNegotiation: (listing: Listing) => void
  onCreateListing: () => void
  onListingFormChange: (
    value: {
      title: string
      description: string
      price: number
      condition: string
      returnPolicy: string
      sellerName: string
      sellerRating: number
      sellerMinPrice: number
      sellerInventory: number
      deliveryDays: number
    },
  ) => void
  onToggleListingForm: () => void
}) {
  return (
    <>
      <SectionHeader
        title="Marketplace"
        description="Live inventory from the backend with negotiation-ready pricing and seller signals."
        actions={
          <>
            <button type="button" className="button-secondary" onClick={onToggleListingForm}>
              {showListingForm ? 'Close form' : 'Add product'}
            </button>
            {featuredListing ? (
              featuredNegotiationId ? (
                <button
                  type="button"
                  className="button-primary"
                  onClick={() => onOpenNegotiation(featuredNegotiationId, 'timeline')}
                >
                  Resume live deal
                </button>
              ) : (
                <button
                  type="button"
                  className="button-primary"
                  onClick={() => onStartNegotiation(featuredListing)}
                  disabled={isStartingNegotiation}
                >
                  {isStartingNegotiation ? 'Starting…' : 'Start negotiation'}
                </button>
              )
            ) : undefined}
          </>
        }
      />

      {showListingForm ? (
        <section className="shell-panel px-4 py-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <TextField
              label="Product title"
              value={listingForm.title}
              onChange={(value) => onListingFormChange({ ...listingForm, title: value })}
            />
            <NumberField
              label="Ask price"
              value={listingForm.price}
              onChange={(value) => onListingFormChange({
                ...listingForm,
                price: value,
                sellerMinPrice: listingForm.sellerMinPrice || value,
              })}
            />
            <TextField
              label="Condition"
              value={listingForm.condition}
              onChange={(value) => onListingFormChange({ ...listingForm, condition: value })}
            />
            <TextField
              label="Seller name"
              value={listingForm.sellerName}
              onChange={(value) => onListingFormChange({ ...listingForm, sellerName: value })}
            />
            <NumberField
              label="Seller rating"
              value={listingForm.sellerRating}
              step={0.1}
              onChange={(value) => onListingFormChange({ ...listingForm, sellerRating: value })}
            />
            <NumberField
              label="Seller floor"
              value={listingForm.sellerMinPrice}
              onChange={(value) => onListingFormChange({ ...listingForm, sellerMinPrice: value })}
            />
            <NumberField
              label="Inventory"
              value={listingForm.sellerInventory}
              onChange={(value) => onListingFormChange({ ...listingForm, sellerInventory: value })}
            />
            <NumberField
              label="Delivery days"
              value={listingForm.deliveryDays}
              onChange={(value) => onListingFormChange({ ...listingForm, deliveryDays: value })}
            />
            <TextField
              label="Return policy"
              value={listingForm.returnPolicy}
              onChange={(value) => onListingFormChange({ ...listingForm, returnPolicy: value })}
            />
          </div>
          <div className="mt-4">
            <label className="block">
              <p className="text-[0.82rem] font-medium text-[color:var(--ink)]">Description</p>
              <textarea
                className="mt-3 min-h-24 w-full rounded-xl bg-[color:var(--surface-subtle)] px-3 py-3 text-[0.82rem] leading-5 text-[color:var(--ink)] outline-none transition-shadow focus-visible:ring-4 focus-visible:ring-[color:var(--ring)]"
                value={listingForm.description}
                onChange={(event) => onListingFormChange({ ...listingForm, description: event.target.value })}
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="button-primary"
              onClick={onCreateListing}
              disabled={isCreatingListing}
            >
              {isCreatingListing ? 'Adding…' : 'Add product'}
            </button>
            <button type="button" className="button-secondary" onClick={onToggleListingForm}>
              Cancel
            </button>
          </div>
        </section>
      ) : null}

      {featuredListing ? (
        <section className="shell-panel overflow-hidden">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1.1fr)_320px]">
            <div className={`listing-hero listing-hero-${featuredListing.accent}`}>
              <div className="flex h-full flex-col justify-end gap-3">
                <span className="meta-pill">Featured listing</span>
                <div>
                  <p className="text-[0.76rem] font-medium uppercase tracking-[0.08em] text-[color:var(--muted)]">
                    {featuredListing.category}
                  </p>
                  <h2 className="mt-1 text-[1.45rem] font-semibold tracking-[-0.03em]">
                    {featuredListing.title}
                  </h2>
                </div>
              </div>
            </div>

            <div className="border-t border-[color:var(--line)] px-4 py-4 lg:border-l lg:border-t-0">
              <div className="grid gap-2 text-[0.82rem]">
                <MetricLine label="Ask" value={money(featuredListing.price)} />
                <MetricLine label="Seller" value={featuredListing.seller} />
                <MetricLine label="Signal" value={featuredListing.location} />
                <MetricLine label="Trust" value={featuredListing.trust} />
              </div>
              <p className="mt-4 text-[0.82rem] leading-5 text-[color:var(--muted)]">
                {activeNegotiation?.listingId === featuredListing.id
                  ? activeNegotiation.summary
                  : featuredListing.note}
              </p>
              <div className="mt-4 flex gap-2">
                {featuredNegotiationId ? (
                  <button
                    type="button"
                    className="button-primary"
                    onClick={() => onOpenNegotiation(featuredNegotiationId, 'timeline')}
                  >
                    Open negotiation
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button-primary"
                    onClick={() => onStartNegotiation(featuredListing)}
                    disabled={isStartingNegotiation}
                  >
                    {isStartingNegotiation ? 'Starting…' : 'Start negotiation'}
                  </button>
                )}
                <button type="button" className="button-secondary">
                  Save
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : null}

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
                {negotiationListingIds.has(listing.id) ? (
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => {
                      const negotiationId = negotiationIdByListingId.get(listing.id) ?? null
                      if (negotiationId) {
                        onOpenNegotiation(negotiationId, 'timeline')
                      }
                    }}
                  >
                    Open
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => onStartNegotiation(listing)}
                    disabled={isStartingNegotiation}
                  >
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
  sellerName,
  isSaving,
  onBuyerTargetChange,
  onBuyerCapChange,
  onSellerFloorChange,
  onAutoApproveChange,
  onSave,
}: {
  buyerTarget: number
  buyerCap: number
  sellerFloor: number
  autoApprove: boolean
  sellerName: string
  isSaving: boolean
  onBuyerTargetChange: (value: number) => void
  onBuyerCapChange: (value: number) => void
  onSellerFloorChange: (value: number) => void
  onAutoApproveChange: (value: boolean) => void
  onSave: () => void
}) {
  return (
    <>
      <SectionHeader
        title="Agents"
        description="Buyer and seller rules are saved into the backend agent configuration."
        actions={
          <button type="button" className="button-primary" onClick={onSave} disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save rules'}
          </button>
        }
      />

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="shell-panel px-4 py-4">
          <PanelTitle title="Buyer" badge="Buyer side" />
          <div className="mt-4 space-y-5">
            <SliderField
              label="Opening target"
              value={buyerTarget}
              min={Math.max(100, buyerTarget - 400)}
              max={buyerTarget + 200}
              step={25}
              onChange={onBuyerTargetChange}
            />
            <SliderField
              label="Hard cap"
              value={buyerCap}
              min={Math.max(100, buyerCap - 400)}
              max={buyerCap + 200}
              step={5}
              onChange={onBuyerCapChange}
            />
            <MiniList
              title="Guardrails"
              items={[
                'Keep a 24-hour inspection window.',
                'Do not trade verified accessories.',
                'Rebuild the buyer agent from saved config every round.',
              ]}
            />
          </div>
        </article>

        <article className="shell-panel px-4 py-4">
          <PanelTitle title="Seller" badge={sellerName} />
          <div className="mt-4 space-y-5">
            <SliderField
              label="Minimum item price"
              value={sellerFloor}
              min={Math.max(100, sellerFloor - 400)}
              max={sellerFloor + 200}
              step={5}
              onChange={onSellerFloorChange}
            />

            <div className="flex items-center justify-between gap-4 border-t border-[color:var(--line)] pt-4">
              <div>
                <p className="text-[0.82rem] font-medium text-[color:var(--ink)]">
                  Auto-approve matching terms
                </p>
                <p className="mt-1 text-[0.76rem] text-[color:var(--muted)]">
                  New campaigns finalize automatically when backend agreement is reached.
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
              title="Backend notes"
              items={[
                'Seller defaults are saved against the active seller.',
                'Reservation values are enforced server-side on every turn.',
                'Mediator validation runs before any turn reaches the UI.',
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
        description="Backend-managed branches across all active campaigns."
        actions={<button type="button" className="button-secondary">Live branches</button>}
      />

      <section className="shell-panel overflow-hidden">
        <div className="divide-y divide-[color:var(--line)]">
          {negotiations.length === 0 ? (
            <div className="px-4 py-6 text-[0.82rem] text-[color:var(--muted)]">
              No negotiations exist yet. Start one from the marketplace.
            </div>
          ) : null}

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
                    {listing?.title ?? 'Unknown listing'}
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
  onRefresh,
  onViewFinalDeal,
}: {
  listing: Listing
  negotiation: Negotiation
  draftInstruction: string
  onDraftInstructionChange: (value: string) => void
  onRefresh: () => void
  onViewFinalDeal: () => void
}) {
  const visibleMessages = negotiation.messages.slice(-8)
  const hiddenMessageCount = negotiation.messages.length - visibleMessages.length
  const visibleTimeline = negotiation.timeline.slice(-4)

  return (
    <>
      <SectionHeader
        title="Workspace"
        description={`${listing.title} · ${money(negotiation.finalDeal.itemPrice + negotiation.finalDeal.deliveryFee)}`}
        actions={
          <>
            <button type="button" className="button-secondary" onClick={onRefresh}>
              Refresh
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

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <AutomationCard
                label="Exa market context"
                title={negotiation.marketSummary.label}
                detail={negotiation.marketSummary.detail}
              />
              <AutomationCard
                label="Mediator review"
                title={negotiation.mediatorSummary.label}
                detail={negotiation.mediatorSummary.detail}
              />
            </div>

            <div className="mt-5 rounded-[1rem] bg-[color:var(--surface-subtle)] px-3 py-3 sm:px-4">
              <div className="flex items-center justify-between gap-3 border-b border-[color:var(--line)] pb-3">
                <div>
                  <p className="text-[0.72rem] uppercase tracking-[0.08em] text-[color:var(--muted)]">
                    Live chat
                  </p>
                  <p className="mt-1 text-[0.8rem] text-[color:var(--muted)]">
                    Buyer on the right. Seller on the left. Exa and mediator system events are centered.
                  </p>
                </div>
                <span className="meta-pill">
                  Round {Math.max(negotiation.round, 1)} · {negotiation.turnCount} turns
                </span>
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
                <span className="text-[0.72rem] text-[color:var(--muted)]">Saved config only</span>
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
                <button type="button" className="button-primary" onClick={onRefresh}>
                  Sync backend
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
  isApproving,
  onApprove,
  onViewAudit,
}: {
  listing: Listing
  negotiation: Negotiation
  isApproving: boolean
  onApprove: () => void
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
            <button type="button" className="button-primary" onClick={onApprove} disabled={isApproving}>
              {isApproving ? 'Approving…' : 'Approve'}
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
                'Budget guardrails are enforced by the backend.',
                'Mediator validation passed before the offer reached the UI.',
                'The final branch state is persisted in Supabase.',
                'Approval writes the final deal back to the backend.',
              ]}
            />
          </div>
        </article>

        <aside className="shell-panel px-4 py-4">
          <MiniList
            title="Approval checklist"
            items={[
              'Budget guardrail still holds.',
              'Market evidence remains cached on the negotiation branch.',
              'Delivery window is acceptable.',
              'Inspection path is documented.',
            ]}
          />
          <div className="mt-4 border-t border-[color:var(--line)] pt-4">
            <p className="text-[0.82rem] font-medium text-[color:var(--ink)]">
              Approval boundary
            </p>
            <p className="mt-2 text-[0.78rem] leading-5 text-[color:var(--muted)]">
              Approving here calls the backend final-deal approval endpoint for the active negotiation branch.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button type="button" className="button-primary" onClick={onApprove} disabled={isApproving}>
                {isApproving ? 'Approving…' : 'Approve and schedule'}
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
  actions?: ReactNode
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

function TextField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block">
      <p className="text-[0.82rem] font-medium text-[color:var(--ink)]">{label}</p>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-3 h-11 w-full rounded-xl bg-[color:var(--surface-subtle)] px-3 text-[0.82rem] text-[color:var(--ink)] outline-none transition-shadow focus-visible:ring-4 focus-visible:ring-[color:var(--ring)]"
      />
    </label>
  )
}

function NumberField({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  step?: number
}) {
  return (
    <label className="block">
      <p className="text-[0.82rem] font-medium text-[color:var(--ink)]">{label}</p>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-3 h-11 w-full rounded-xl bg-[color:var(--surface-subtle)] px-3 text-[0.82rem] text-[color:var(--ink)] outline-none transition-shadow focus-visible:ring-4 focus-visible:ring-[color:var(--ring)]"
      />
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

function MessageRow({ message }: { message: Negotiation['messages'][number] }) {
  const cardClass =
    message.type === 'offer'
      ? 'message-row-offer'
      : message.type === 'counter'
        ? 'message-row-counter'
        : message.type === 'approval'
          ? 'message-row-approval'
          : message.tone === 'warning'
            ? 'message-row-warning'
            : message.tone === 'verification' || message.side === 'verification'
            ? 'message-row-verification'
            : 'message-row-system'

  const wrapperClass =
    message.side === 'buyer'
      ? 'justify-end'
      : message.side === 'seller'
        ? 'justify-start'
        : 'justify-center'

  const bubbleWidth =
    message.side === 'system' || message.side === 'verification'
      ? 'max-w-[32rem]'
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
              {message.createdAt ? (
                <span className="text-[0.7rem]">{formatMessageTime(message.createdAt)}</span>
              ) : null}
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
            {message.meta.slice(0, 3).map((entry) => (
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

function AutomationCard({
  label,
  title,
  detail,
}: {
  label: string
  title: string
  detail: string
}) {
  return (
    <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)] px-3 py-3">
      <p className="text-[0.7rem] uppercase tracking-[0.08em] text-[color:var(--muted)]">
        {label}
      </p>
      <p className="mt-1 text-[0.82rem] font-medium text-[color:var(--ink)]">{title}</p>
      <p className="mt-2 text-[0.76rem] leading-5 text-[color:var(--muted)]">{detail}</p>
    </div>
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

function labelForType(type: Negotiation['messages'][number]['type']) {
  if (type === 'offer') return 'Buyer'
  if (type === 'counter') return 'Seller'
  if (type === 'approval') return 'Approval'
  return 'System'
}

function formatMessageTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function money(value: number) {
  return currency.format(value)
}

export default App
