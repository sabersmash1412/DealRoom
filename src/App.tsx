import { startTransition, useDeferredValue, useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
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
    communicationStyle: 'Calm, evidence-led, and concise.',
    personaBrief: 'A disciplined buyer who protects budget, values delivery certainty, and prefers polite but firm negotiation.',
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
  communicationStyle: 'Professional, margin-aware, and direct.',
  personaBrief: 'A pragmatic seller who protects floor price, preserves trust, and avoids unnecessary concessions.',
}

const strategyOptions: Array<BuyerAgentProfile['strategy']> = ['aggressive', 'balanced', 'time-sensitive']
const inventoryPressureOptions: NonNullable<SellerAgentConfig['inventoryPressure']>[] = ['low', 'medium', 'high']
const satisfactionOptions: NonNullable<SellerAgentConfig['customerSatisfactionTarget']>[] = ['low', 'medium', 'high']
const WEIGHT_STEP = 0.05
const TOTAL_WEIGHT_UNITS = Math.round(1 / WEIGHT_STEP)

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

function normalizeBuyerProfile(profile: BuyerAgentProfile): BuyerAgentProfile {
  return {
    ...profile,
    userId: profile.userId || BUYER_USER_ID,
    utilityWeights: normalizeWeightRecord({
      price: profile.utilityWeights.price,
      delivery: profile.utilityWeights.delivery,
      reputation: profile.utilityWeights.reputation,
      returns: profile.utilityWeights.returns,
    }),
    reservationValue: {
      maximumBudget: profile.reservationValue.maximumBudget,
    },
    guardrails: profile.guardrails.filter((entry) => entry.trim().length > 0),
    preferences: {
      targetPrice: profile.preferences?.targetPrice,
      maxDeliveryDays: profile.preferences?.maxDeliveryDays,
      minimumSellerRating: profile.preferences?.minimumSellerRating,
      preferredReturnPolicy: profile.preferences?.preferredReturnPolicy?.trim() || '',
      communicationStyle: profile.preferences?.communicationStyle?.trim() || '',
      personaBrief: profile.preferences?.personaBrief?.trim() || '',
    },
  }
}

function normalizeSellerConfig(config: SellerAgentConfig): SellerAgentConfig {
  return {
    ...config,
    utilityWeights: normalizeWeightRecord({
      profitMargin: config.utilityWeights.profitMargin,
      inventoryClearance: config.utilityWeights.inventoryClearance,
      customerSatisfaction: config.utilityWeights.customerSatisfaction,
    }),
    reservationValue: {
      minimumAcceptablePrice: config.reservationValue.minimumAcceptablePrice,
    },
    guardrails: config.guardrails.filter((entry) => entry.trim().length > 0),
    inventoryPressure: config.inventoryPressure ?? 'medium',
    customerSatisfactionTarget: config.customerSatisfactionTarget ?? 'medium',
    communicationStyle: config.communicationStyle?.trim() || '',
    personaBrief: config.personaBrief?.trim() || '',
  }
}

function splitLines(value: string) {
  return value
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function distributeUnits(keys: string[], totalUnits: number) {
  if (keys.length === 0) {
    return new Map<string, number>()
  }

  const baseUnits = Math.floor(totalUnits / keys.length)
  let remainder = totalUnits - baseUnits * keys.length
  const allocation = new Map<string, number>()

  for (const key of keys) {
    allocation.set(key, baseUnits + (remainder > 0 ? 1 : 0))
    remainder = Math.max(0, remainder - 1)
  }

  return allocation
}

function allocateProportionalUnits(entries: Array<[string, number]>, totalUnits: number) {
  const allocation = new Map<string, number>()
  if (entries.length === 0) {
    return allocation
  }

  const positiveTotal = entries.reduce((sum, [, value]) => sum + Math.max(0, value), 0)
  if (positiveTotal <= 0) {
    return distributeUnits(
      entries.map(([key]) => key),
      totalUnits,
    )
  }

  const scaled = entries.map(([key, value]) => {
    const normalized = (Math.max(0, value) / positiveTotal) * totalUnits
    const units = Math.floor(normalized)
    return {
      key,
      units,
      remainder: normalized - units,
    }
  })

  let remainingUnits = totalUnits - scaled.reduce((sum, entry) => sum + entry.units, 0)
  scaled
    .sort((left, right) => right.remainder - left.remainder)
    .forEach((entry) => {
      if (remainingUnits <= 0) {
        return
      }
      entry.units += 1
      remainingUnits -= 1
    })

  for (const entry of scaled) {
    allocation.set(entry.key, entry.units)
  }

  return allocation
}

function normalizeWeightRecord<T extends { [K in keyof T]: number }>(weights: T): T {
  const keys = Object.keys(weights) as Array<keyof T>
  const allocation = allocateProportionalUnits(
    keys.map((key) => [String(key), Number.isFinite(weights[key]) ? weights[key] : 0]),
    TOTAL_WEIGHT_UNITS,
  )

  const normalized = {} as T
  for (const key of keys) {
    normalized[key] = (allocation.get(String(key)) ?? 0) * WEIGHT_STEP as T[keyof T]
  }

  return normalized
}

function rebalanceWeightRecord<T extends { [K in keyof T]: number }, K extends keyof T>(
  current: T,
  changedKey: K,
  nextValue: number,
): T {
  const normalizedCurrent = normalizeWeightRecord(current)
  const keys = Object.keys(normalizedCurrent) as Array<keyof T>
  const nextUnits = Math.round(clamp(nextValue, 0, 1) / WEIGHT_STEP)
  const clampedUnits = clamp(nextUnits, 0, TOTAL_WEIGHT_UNITS)
  const otherKeys = keys.filter((key) => key !== changedKey)
  const remainingUnits = TOTAL_WEIGHT_UNITS - clampedUnits
  const otherAllocation = allocateProportionalUnits(
    otherKeys.map((key) => [String(key), normalizedCurrent[key] / WEIGHT_STEP]),
    remainingUnits,
  )

  const nextWeights = {} as T
  for (const key of keys) {
    if (key === changedKey) {
      nextWeights[key] = clampedUnits * WEIGHT_STEP as T[keyof T]
      continue
    }

    nextWeights[key] = (otherAllocation.get(String(key)) ?? 0) * WEIGHT_STEP as T[keyof T]
  }

  return nextWeights
}

function titleCase(value: string) {
  return value
    .replace(/_/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(' ')
}

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

function getSliderBounds(anchor: number, minOffset: number, maxOffset: number) {
  return {
    min: Math.max(100, anchor - minOffset),
    max: anchor + maxOffset,
  }
}

function getRangeStyle(value: number, min: number, max: number): CSSProperties {
  const safeMax = max > min ? max : min + 1
  const safeValue = clamp(value, min, safeMax)
  const progress = ((safeValue - min) / (safeMax - min)) * 100

  return {
    ['--range-progress' as string]: `${progress}%`,
  } as CSSProperties
}

type ProductVisualKind = 'furniture' | 'camera' | 'appliance' | 'electronics' | 'cycling' | 'default'

function productVisualKind(listing: Listing): ProductVisualKind {
  const category = listing.category.toLowerCase()
  const title = listing.title.toLowerCase()

  if (category.includes('furniture') || title.includes('chair') || title.includes('table')) {
    return 'furniture'
  }
  if (category.includes('camera') || title.includes('camera')) {
    return 'camera'
  }
  if (category.includes('appliance') || title.includes('coffee')) {
    return 'appliance'
  }
  if (category.includes('electronics') || title.includes('monitor') || title.includes('display')) {
    return 'electronics'
  }
  if (category.includes('cycling') || title.includes('bike') || title.includes('brompton')) {
    return 'cycling'
  }

  return 'default'
}

function productVisualPalette(accent: Listing['accent']) {
  if (accent === 'teal') {
    return {
      toneClass: 'product-scene-teal',
      badgeClass: 'product-chip-teal',
    }
  }

  if (accent === 'amber') {
    return {
      toneClass: 'product-scene-amber',
      badgeClass: 'product-chip-amber',
    }
  }

  return {
    toneClass: 'product-scene-indigo',
    badgeClass: 'product-chip-indigo',
  }
}

function App() {
  const [activeScreen, setActiveScreen] = useState<Screen>('home')
  const [activeNegotiationId, setActiveNegotiationId] = useState<string | null>(null)
  const [activeListingId, setActiveListingId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [autoApprove, setAutoApprove] = useState(false)
  const [draftInstruction, setDraftInstruction] = useState(
    'Backend uses saved buyer and seller configuration only. Refresh the branch after saving rule changes.',
  )
  const [listings, setListings] = useState<Listing[]>([])
  const [branches, setBranches] = useState<NegotiationBranchView[]>([])
  const [buyerProfile, setBuyerProfile] = useState<BuyerAgentProfile>(defaultBuyerProfile)
  const [sellerConfig, setSellerConfig] = useState<SellerAgentConfig>(defaultSellerConfig)
  const [sliderAnchors, setSliderAnchors] = useState({
    buyerTarget: defaultBuyerProfile.preferences?.targetPrice ?? 1825,
    buyerCap: defaultBuyerProfile.reservationValue.maximumBudget,
    sellerFloor: defaultSellerConfig.reservationValue.minimumAcceptablePrice,
  })
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

      const profile = normalizeBuyerProfile(savedBuyerProfile ?? defaultBuyerProfile)
      setBuyerProfile(profile)
      setSliderAnchors((current) => ({
        ...current,
        buyerTarget: profile.preferences?.targetPrice ?? defaultBuyerProfile.preferences?.targetPrice ?? 1825,
        buyerCap: profile.reservationValue.maximumBudget,
      }))

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
      const normalizedConfig = normalizeSellerConfig(config)
      setSellerConfig(normalizedConfig)
      setSliderAnchors((current) => ({
        ...current,
        sellerFloor: normalizedConfig.reservationValue.minimumAcceptablePrice,
      }))
    } catch (error) {
      const fallbackConfig = normalizeSellerConfig(defaultSellerConfig)
      setSellerConfig(fallbackConfig)
      setSliderAnchors((current) => ({
        ...current,
        sellerFloor: fallbackConfig.reservationValue.minimumAcceptablePrice,
      }))
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

    const nextBuyerProfile = normalizeBuyerProfile({
      ...buyerProfile,
      userId: BUYER_USER_ID,
    })

    const nextSellerConfig = normalizeSellerConfig(sellerConfig)

    try {
      const [savedBuyer, savedSeller] = await Promise.all([
        saveBuyerProfile(nextBuyerProfile),
        saveSellerConfig(activeListing.sellerId, nextSellerConfig),
      ])

      const normalizedBuyer = normalizeBuyerProfile(savedBuyer)
      const normalizedSeller = normalizeSellerConfig(savedSeller)

      setBuyerProfile(normalizedBuyer)
      setSellerConfig(normalizedSeller)
      setSliderAnchors({
        buyerTarget: normalizedBuyer.preferences?.targetPrice ?? defaultBuyerProfile.preferences?.targetPrice ?? 1825,
        buyerCap: normalizedBuyer.reservationValue.maximumBudget,
        sellerFloor: normalizedSeller.reservationValue.minimumAcceptablePrice,
      })
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

    const currentBuyerProfile = normalizeBuyerProfile({
      ...buyerProfile,
      userId: BUYER_USER_ID,
    })

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
                buyerProfile={buyerProfile}
                sellerConfig={sellerConfig}
                sliderAnchors={sliderAnchors}
                autoApprove={autoApprove}
                sellerName={activeListing.seller}
                isSaving={isSavingRules}
                onBuyerProfileChange={setBuyerProfile}
                onSellerConfigChange={setSellerConfig}
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
              <ProductArtwork listing={featuredListing} variant="hero" />
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
              <ProductArtwork listing={listing} variant="card" />
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

function ProductArtwork({
  listing,
  variant,
}: {
  listing: Listing
  variant: 'card' | 'hero'
}) {
  const kind = productVisualKind(listing)
  const palette = productVisualPalette(listing.accent)
  const isHero = variant === 'hero'

  return (
    <div className={`product-scene ${palette.toneClass} ${isHero ? 'product-scene-hero' : 'product-scene-card'}`} aria-hidden="true">
      <div className="product-glow product-glow-left" />
      <div className="product-glow product-glow-right" />
      <div className="product-grid" />

      <div className={`product-object-shell product-object-shell-${variant}`}>
        {kind === 'furniture' ? <FurnitureMockup /> : null}
        {kind === 'camera' ? <CameraMockup /> : null}
        {kind === 'appliance' ? <ApplianceMockup /> : null}
        {kind === 'electronics' ? <ElectronicsMockup /> : null}
        {kind === 'cycling' ? <CyclingMockup /> : null}
        {kind === 'default' ? <DefaultMockup /> : null}
      </div>

      <div className={`product-chip ${palette.badgeClass} product-chip-top`}>
        <span className="product-chip-label">{listing.category}</span>
      </div>
    </div>
  )
}

function FurnitureMockup() {
  return (
    <div className="product-object product-object-furniture">
      <div className="furniture-back" />
      <div className="furniture-seat" />
      <div className="furniture-leg furniture-leg-left" />
      <div className="furniture-leg furniture-leg-right" />
      <div className="furniture-shadow" />
    </div>
  )
}

function CameraMockup() {
  return (
    <div className="product-object product-object-camera">
      <div className="camera-body" />
      <div className="camera-top" />
      <div className="camera-lens-ring" />
      <div className="camera-lens-core" />
      <div className="camera-viewfinder" />
      <div className="camera-flash" />
    </div>
  )
}

function ApplianceMockup() {
  return (
    <div className="product-object product-object-appliance">
      <div className="appliance-frame" />
      <div className="appliance-panel" />
      <div className="appliance-spout" />
      <div className="appliance-cup" />
      <div className="appliance-base" />
    </div>
  )
}

function ElectronicsMockup() {
  return (
    <div className="product-object product-object-electronics">
      <div className="electronics-screen" />
      <div className="electronics-glow" />
      <div className="electronics-stand" />
      <div className="electronics-base" />
    </div>
  )
}

function CyclingMockup() {
  return (
    <div className="product-object product-object-cycling">
      <div className="cycling-wheel cycling-wheel-left" />
      <div className="cycling-wheel cycling-wheel-right" />
      <div className="cycling-frame cycling-frame-top" />
      <div className="cycling-frame cycling-frame-diagonal" />
      <div className="cycling-frame cycling-frame-seat" />
      <div className="cycling-bar" />
      <div className="cycling-seat" />
    </div>
  )
}

function DefaultMockup() {
  return (
    <div className="product-object product-object-default">
      <div className="default-box default-box-back" />
      <div className="default-box default-box-front" />
      <div className="default-tag" />
    </div>
  )
}

function AgentConfiguration({
  buyerProfile,
  sellerConfig,
  sliderAnchors,
  autoApprove,
  sellerName,
  isSaving,
  onBuyerProfileChange,
  onSellerConfigChange,
  onAutoApproveChange,
  onSave,
}: {
  buyerProfile: BuyerAgentProfile
  sellerConfig: SellerAgentConfig
  sliderAnchors: {
    buyerTarget: number
    buyerCap: number
    sellerFloor: number
  }
  autoApprove: boolean
  sellerName: string
  isSaving: boolean
  onBuyerProfileChange: (value: BuyerAgentProfile) => void
  onSellerConfigChange: (value: SellerAgentConfig) => void
  onAutoApproveChange: (value: boolean) => void
  onSave: () => void
}) {
  const buyerPreferences = buyerProfile.preferences ?? {}
  const openingTargetBounds = getSliderBounds(sliderAnchors.buyerTarget, 400, 200)
  const hardCapBounds = getSliderBounds(sliderAnchors.buyerCap, 400, 200)
  const sellerFloorBounds = getSliderBounds(sliderAnchors.sellerFloor, 400, 200)
  const buyerWeightTotal = Object.values(buyerProfile.utilityWeights).reduce((sum, value) => sum + value, 0)
  const sellerWeightTotal = Object.values(sellerConfig.utilityWeights).reduce((sum, value) => sum + value, 0)

  function updateBuyerWeights(
    key: keyof BuyerAgentProfile['utilityWeights'],
    value: number,
  ) {
    onBuyerProfileChange({
      ...buyerProfile,
      utilityWeights: rebalanceWeightRecord(buyerProfile.utilityWeights, key, value),
    })
  }

  function updateSellerWeights(
    key: keyof SellerAgentConfig['utilityWeights'],
    value: number,
  ) {
    onSellerConfigChange({
      ...sellerConfig,
      utilityWeights: rebalanceWeightRecord(sellerConfig.utilityWeights, key, value),
    })
  }

  return (
    <>
      <SectionHeader
        title="Agents"
        description="Configure the actual buyer and seller profiles that the backend injects into every negotiation turn."
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
            <TextField
              label="Buyer display name"
              value={buyerProfile.displayName ?? ''}
              onChange={(value) =>
                onBuyerProfileChange({
                  ...buyerProfile,
                  displayName: value,
                })
              }
            />
            <SelectField
              label="Negotiation strategy"
              value={buyerProfile.strategy}
              options={strategyOptions.map((option) => ({
                value: option,
                label: titleCase(option),
              }))}
              onChange={(value) =>
                onBuyerProfileChange({
                  ...buyerProfile,
                  strategy: value as BuyerAgentProfile['strategy'],
                })
              }
            />
            <div className="grid gap-4 md:grid-cols-2">
              <SliderField
                label="Opening target"
                value={buyerPreferences.targetPrice ?? defaultBuyerProfile.preferences?.targetPrice ?? 1825}
                min={openingTargetBounds.min}
                max={openingTargetBounds.max}
                step={25}
                onChange={(value) =>
                  onBuyerProfileChange({
                    ...buyerProfile,
                    preferences: {
                      ...buyerPreferences,
                      targetPrice: value,
                    },
                  })
                }
              />
              <SliderField
                label="Hard cap"
                value={buyerProfile.reservationValue.maximumBudget}
                min={hardCapBounds.min}
                max={hardCapBounds.max}
                step={5}
                onChange={(value) =>
                  onBuyerProfileChange({
                    ...buyerProfile,
                    reservationValue: {
                      maximumBudget: value,
                    },
                  })
                }
              />
              <NumberField
                label="Max delivery days"
                value={buyerPreferences.maxDeliveryDays ?? defaultBuyerProfile.preferences?.maxDeliveryDays ?? 3}
                onChange={(value) =>
                  onBuyerProfileChange({
                    ...buyerProfile,
                    preferences: {
                      ...buyerPreferences,
                      maxDeliveryDays: value,
                    },
                  })
                }
              />
              <NumberField
                label="Minimum seller rating"
                value={buyerPreferences.minimumSellerRating ?? defaultBuyerProfile.preferences?.minimumSellerRating ?? 4}
                step={0.1}
                onChange={(value) =>
                  onBuyerProfileChange({
                    ...buyerProfile,
                    preferences: {
                      ...buyerPreferences,
                      minimumSellerRating: value,
                    },
                  })
                }
              />
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-[0.82rem] font-medium text-[color:var(--ink)]">Utility allocation</p>
                <span className="meta-pill">{Math.round(buyerWeightTotal * 100)}% total</span>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
              <WeightSliderField
                label="Price priority"
                value={buyerProfile.utilityWeights.price}
                onChange={(value) => updateBuyerWeights('price', value)}
              />
              <WeightSliderField
                label="Delivery priority"
                value={buyerProfile.utilityWeights.delivery}
                onChange={(value) => updateBuyerWeights('delivery', value)}
              />
              <WeightSliderField
                label="Reputation priority"
                value={buyerProfile.utilityWeights.reputation}
                onChange={(value) => updateBuyerWeights('reputation', value)}
              />
              <WeightSliderField
                label="Returns priority"
                value={buyerProfile.utilityWeights.returns}
                onChange={(value) => updateBuyerWeights('returns', value)}
              />
              </div>
            </div>

            <TextField
              label="Preferred return policy"
              value={buyerPreferences.preferredReturnPolicy ?? ''}
              onChange={(value) =>
                onBuyerProfileChange({
                  ...buyerProfile,
                  preferences: {
                    ...buyerPreferences,
                    preferredReturnPolicy: value,
                  },
                })
              }
            />
            <TextField
              label="Communication style"
              value={buyerPreferences.communicationStyle ?? ''}
              onChange={(value) =>
                onBuyerProfileChange({
                  ...buyerProfile,
                  preferences: {
                    ...buyerPreferences,
                    communicationStyle: value,
                  },
                })
              }
            />
            <TextAreaField
              label="Persona brief"
              value={buyerPreferences.personaBrief ?? ''}
              rows={3}
              onChange={(value) =>
                onBuyerProfileChange({
                  ...buyerProfile,
                  preferences: {
                    ...buyerPreferences,
                    personaBrief: value,
                  },
                })
              }
            />
            <TextAreaField
              label="Guardrails"
              value={buyerProfile.guardrails.join('\n')}
              hint="One rule per line. These are injected into the buyer agent profile."
              rows={4}
              onChange={(value) =>
                onBuyerProfileChange({
                  ...buyerProfile,
                  guardrails: splitLines(value),
                })
              }
            />
          </div>
        </article>

        <article className="shell-panel px-4 py-4">
          <PanelTitle title="Seller" badge={sellerName} />
          <div className="mt-4 space-y-5">
            <SelectField
              label="Negotiation strategy"
              value={sellerConfig.strategy}
              options={strategyOptions.map((option) => ({
                value: option,
                label: titleCase(option),
              }))}
              onChange={(value) =>
                onSellerConfigChange({
                  ...sellerConfig,
                  strategy: value as SellerAgentConfig['strategy'],
                })
              }
            />

            <div className="grid gap-4 md:grid-cols-2">
              <SliderField
                label="Minimum item price"
                value={sellerConfig.reservationValue.minimumAcceptablePrice}
                min={sellerFloorBounds.min}
                max={sellerFloorBounds.max}
                step={5}
                onChange={(value) =>
                  onSellerConfigChange({
                    ...sellerConfig,
                    reservationValue: {
                      minimumAcceptablePrice: value,
                    },
                  })
                }
              />
              <SelectField
                label="Inventory pressure"
                value={sellerConfig.inventoryPressure ?? 'medium'}
                options={inventoryPressureOptions.map((option) => ({
                  value: option,
                  label: titleCase(option),
                }))}
                onChange={(value) =>
                  onSellerConfigChange({
                    ...sellerConfig,
                    inventoryPressure: value as NonNullable<SellerAgentConfig['inventoryPressure']>,
                  })
                }
              />
              <SelectField
                label="Customer satisfaction target"
                value={sellerConfig.customerSatisfactionTarget ?? 'medium'}
                options={satisfactionOptions.map((option) => ({
                  value: option,
                  label: titleCase(option),
                }))}
                onChange={(value) =>
                  onSellerConfigChange({
                    ...sellerConfig,
                    customerSatisfactionTarget: value as NonNullable<SellerAgentConfig['customerSatisfactionTarget']>,
                  })
                }
              />
              <TextField
                label="Communication style"
                value={sellerConfig.communicationStyle ?? ''}
                onChange={(value) =>
                  onSellerConfigChange({
                    ...sellerConfig,
                    communicationStyle: value,
                  })
                }
              />
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-[0.82rem] font-medium text-[color:var(--ink)]">Utility allocation</p>
                <span className="meta-pill">{Math.round(sellerWeightTotal * 100)}% total</span>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
              <WeightSliderField
                label="Margin priority"
                value={sellerConfig.utilityWeights.profitMargin}
                onChange={(value) => updateSellerWeights('profitMargin', value)}
              />
              <WeightSliderField
                label="Inventory clearance"
                value={sellerConfig.utilityWeights.inventoryClearance}
                onChange={(value) => updateSellerWeights('inventoryClearance', value)}
              />
              <WeightSliderField
                label="Customer satisfaction"
                value={sellerConfig.utilityWeights.customerSatisfaction}
                onChange={(value) => updateSellerWeights('customerSatisfaction', value)}
              />
              </div>
            </div>

            <TextAreaField
              label="Persona brief"
              value={sellerConfig.personaBrief ?? ''}
              rows={3}
              onChange={(value) =>
                onSellerConfigChange({
                  ...sellerConfig,
                  personaBrief: value,
                })
              }
            />
            <TextAreaField
              label="Guardrails"
              value={sellerConfig.guardrails.join('\n')}
              hint="One rule per line. These are injected into the seller config."
              rows={4}
              onChange={(value) =>
                onSellerConfigChange({
                  ...sellerConfig,
                  guardrails: splitLines(value),
                })
              }
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
                'Every saved field is injected into the next negotiation prompt.',
                'Utility weights shape how each side optimizes a deal.',
                'Guardrails and persona fields affect tone but do not override hard constraints.',
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
  const visibleTimeline = negotiation.timeline.slice(-4)
  const hasAgreement =
    negotiation.stage === 'Agreement Reached' || negotiation.stage === 'Approved'

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

              <div className="mt-4 max-h-[42rem] space-y-3 overflow-y-auto pr-1">
                {negotiation.messages.map((message) => (
                  <MessageRow key={message.id} message={message} />
                ))}
              </div>
            </div>

            {hasAgreement ? (
              <div className="mt-4 rounded-[1rem] border border-[color:var(--line)] bg-[color:var(--surface)] px-4 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-[0.72rem] uppercase tracking-[0.08em] text-[color:var(--muted)]">
                      Final agreement reached
                    </p>
                    <h3 className="mt-1 text-[1rem] font-semibold tracking-[-0.02em] text-[color:var(--ink)]">
                      Contract ready for review
                    </h3>
                    <p className="mt-1 text-[0.8rem] text-[color:var(--muted)]">
                      The buyer and seller have matching terms. Review the contract below, then open Final deal to approve it.
                    </p>
                  </div>
                  <button type="button" className="button-primary" onClick={onViewFinalDeal}>
                    Go to final deal
                  </button>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <ContractPoint label="Final price" value={money(negotiation.finalDeal.itemPrice)} />
                  <ContractPoint label="Original ask" value={money(negotiation.finalDeal.originalAsk)} />
                  <ContractPoint label="Savings" value={money(negotiation.finalDeal.originalAsk - negotiation.finalDeal.itemPrice)} />
                  <ContractPoint label="Delivery" value={negotiation.finalDeal.pickupWindow} />
                  <ContractPoint label="Return policy" value={negotiation.finalDeal.returnPolicy} />
                  <ContractPoint label="Inspection" value={negotiation.finalDeal.inspection} />
                </div>
              </div>
            ) : null}

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
            <InlineStat label="Savings" value={money(negotiation.finalDeal.originalAsk - negotiation.finalDeal.itemPrice)} />
          </div>

          <div className="mt-5 rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface-subtle)] px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[0.72rem] uppercase tracking-[0.08em] text-[color:var(--muted)]">
                  Final contract
                </p>
                <p className="mt-1 text-[0.8rem] text-[color:var(--muted)]">
                  Review the agreed commercial terms before approving.
                </p>
              </div>
              <span className="meta-pill">Bullet summary</span>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <ContractPoint label="Final item price" value={money(negotiation.finalDeal.itemPrice)} />
              <ContractPoint label="Original ask price" value={money(negotiation.finalDeal.originalAsk)} />
              <ContractPoint label="Savings secured" value={money(negotiation.finalDeal.originalAsk - negotiation.finalDeal.itemPrice)} />
              <ContractPoint label="Delivery window" value={negotiation.finalDeal.pickupWindow} />
              <ContractPoint label="Return policy" value={negotiation.finalDeal.returnPolicy} />
              <ContractPoint label="Inspection rule" value={negotiation.finalDeal.inspection} />
              <ContractPoint label="Seller" value={negotiation.finalDeal.seller} />
              <ContractPoint label="Verification" value={negotiation.finalDeal.protection} />
            </div>
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
  const safeValue = clamp(value, min, max)

  return (
    <label className="block">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[0.82rem] font-medium text-[color:var(--ink)]">{label}</p>
        <span className="text-[0.8rem] font-medium text-[color:var(--muted)]">
          {money(safeValue)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={safeValue}
        onChange={(event) => onChange(clamp(Number(event.target.value), min, max))}
        style={getRangeStyle(safeValue, min, max)}
        className="range-field mt-3"
      />
      <div className="mt-2 flex justify-between text-[0.72rem] text-[color:var(--muted)]">
        <span>{money(min)}</span>
        <span>{money(max)}</span>
      </div>
    </label>
  )
}

function WeightSliderField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  const min = 0
  const max = 1
  const safeValue = clamp(value, min, max)

  return (
    <label className="block">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[0.82rem] font-medium text-[color:var(--ink)]">{label}</p>
        <span className="text-[0.8rem] font-medium text-[color:var(--muted)]">
          {Math.round(safeValue * 100)}%
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={0.05}
        value={safeValue}
        onChange={(event) => onChange(clamp(Number(event.target.value), min, max))}
        style={getRangeStyle(safeValue, min, max)}
        className="range-field mt-3"
      />
      <div className="mt-2 flex justify-between text-[0.72rem] text-[color:var(--muted)]">
        <span>Low</span>
        <span>High</span>
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

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}) {
  return (
    <label className="block">
      <p className="text-[0.82rem] font-medium text-[color:var(--ink)]">{label}</p>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-3 h-11 w-full rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-subtle)] px-3 text-[0.82rem] text-[color:var(--ink)] outline-none transition-shadow focus-visible:ring-4 focus-visible:ring-[color:var(--ring)]"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
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

function TextAreaField({
  label,
  value,
  onChange,
  rows = 4,
  hint,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  rows?: number
  hint?: string
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[0.82rem] font-medium text-[color:var(--ink)]">{label}</p>
        {hint ? <span className="text-[0.72rem] text-[color:var(--muted)]">{hint}</span> : null}
      </div>
      <textarea
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-3 w-full rounded-xl bg-[color:var(--surface-subtle)] px-3 py-3 text-[0.82rem] leading-5 text-[color:var(--ink)] outline-none transition-shadow focus-visible:ring-4 focus-visible:ring-[color:var(--ring)]"
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
    message.side === 'buyer'
      ? 'message-row-buyer'
      : message.side === 'seller'
        ? 'message-row-seller'
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

  return (
    <article className={`flex ${wrapperClass}`}>
      <div className={`message-row ${cardClass} ${bubbleWidth}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="message-row-meta flex flex-wrap items-center gap-2">
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

function ContractPoint({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)] px-3 py-3">
      <p className="text-[0.7rem] uppercase tracking-[0.08em] text-[color:var(--muted)]">
        {label}
      </p>
      <p className="mt-1 text-[0.82rem] font-medium leading-5 text-[color:var(--ink)]">
        {value}
      </p>
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
