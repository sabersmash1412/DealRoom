import type {
  BuyerAgentProfile,
  CampaignView,
  CreateListingRequest,
  MarketplaceListingView,
  NegotiationBranchView,
  SellerAgentConfig,
} from '../shared/negotiation'

function normalizeApiBaseUrl(value: string | undefined): string {
  const fallback = 'http://127.0.0.1:8787'
  const rawValue = value?.trim() || fallback
  const absoluteUrl = /^https?:\/\//i.test(rawValue) ? rawValue : `https://${rawValue}`

  return absoluteUrl.replace(/\/+$/, '')
}

const API_BASE_URL = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL as string | undefined)

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  if (!response.ok) {
    const body = (await response.text()) || response.statusText
    throw new Error(`${response.status} ${body}`)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export function getApiBaseUrl() {
  return API_BASE_URL
}

export function fetchListings() {
  return request<MarketplaceListingView[]>('/api/listings')
}

export function createListing(payload: CreateListingRequest) {
  return request<MarketplaceListingView>('/api/listings', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function fetchNegotiations() {
  return request<NegotiationBranchView[]>('/api/negotiations')
}

export async function fetchBuyerProfile(userId: string) {
  try {
    return await request<BuyerAgentProfile>(`/api/agent-profiles/buyer?userId=${encodeURIComponent(userId)}`)
  } catch (error) {
    if (error instanceof Error && error.message.includes('404')) {
      return null
    }
    throw error
  }
}

export function saveBuyerProfile(profile: BuyerAgentProfile) {
  return request<BuyerAgentProfile>('/api/agent-profiles/buyer', {
    method: 'PUT',
    body: JSON.stringify(profile),
  })
}

export function fetchSellerConfig(sellerId: string) {
  return request<SellerAgentConfig>(`/api/sellers/${sellerId}/agent-config`)
}

export function saveSellerConfig(sellerId: string, config: SellerAgentConfig) {
  return request<SellerAgentConfig>(`/api/sellers/${sellerId}/agent-config`, {
    method: 'PUT',
    body: JSON.stringify({ config }),
  })
}

export function createNegotiationCampaign(payload: {
  buyerUserId: string
  buyerProfile: BuyerAgentProfile
  priority: string
  autoApprove: boolean
  targets: Array<{
    listingId: string
    sellerId: string
    deliveryDeadline?: string | null
    preferredVariant?: string | null
  }>
}) {
  return request<CampaignView>('/api/negotiations', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function fetchNegotiationBranch(negotiationId: string) {
  return request<NegotiationBranchView>(`/api/negotiations/${negotiationId}`)
}

export function approveNegotiation(negotiationId: string) {
  return request<NegotiationBranchView>(`/api/negotiations/${negotiationId}/actions/approve`, {
    method: 'POST',
  })
}
