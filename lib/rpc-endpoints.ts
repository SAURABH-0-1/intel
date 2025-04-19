import { Connection } from '@solana/web3.js';

// Endpoint configuration with priorities and rate limit info
type RpcEndpointConfig = {
  url: string;
  priority: number;
  weight: number;
  rateLimitPerMin?: number;
  failCount: number;
  lastUsed: number;
  lastFailed: number;
  responseTime: number; // average response time in ms
};

// Use a variety of endpoints to prevent rate limiting
const endpoints: RpcEndpointConfig[] = [
  // Use your provided Helius endpoint as primary
  {
    url: process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://mainnet.helius-rpc.com/?api-key=bc153566-8ac2-4019-9c90-e0ef5b840c07",
    priority: 1,
    weight: 10,
    failCount: 0,
    lastUsed: 0,
    lastFailed: 0,
    responseTime: 500
  },
  // Public endpoints as backups (with lower weights)
  {
    url: "https://api.mainnet-beta.solana.com",
    priority: 2,
    weight: 3,
    rateLimitPerMin: 100,
    failCount: 0,
    lastUsed: 0,
    lastFailed: 0,
    responseTime: 800
  },
  {
    url: "https://rpc.ankr.com/solana", 
    priority: 3,
    weight: 2,
    rateLimitPerMin: 300,
    failCount: 0,
    lastUsed: 0,
    lastFailed: 0,
    responseTime: 700
  },
  {
    url: "https://solana-api.projectserum.com",
    priority: 4,
    weight: 1,
    rateLimitPerMin: 200,
    failCount: 0,
    lastUsed: 0,
    lastFailed: 0,
    responseTime: 1000
  },
  // GenesysGo public endpoint
  {
    url: "https://ssc-dao.genesysgo.net",
    priority: 5,
    weight: 1,
    failCount: 0,
    lastUsed: 0,
    lastFailed: 0,
    responseTime: 900
  }
];

// Get the best endpoint based on weights, priorities, and recent failures
export function getBestEndpoint(): string {
  const now = Date.now();
  const RATE_LIMIT_WINDOW = 60000; // 1 minute in ms
  const FAILURE_PENALTY_TIME = 30000; // 30 seconds penalty after failure
  
  // Sort endpoints by a score calculated from multiple factors
  const sortedEndpoints = [...endpoints].sort((a, b) => {
    // Heavily penalize endpoints that have failed recently
    const aFailPenalty = now - a.lastFailed < FAILURE_PENALTY_TIME ? 100 : 0;
    const bFailPenalty = now - b.lastFailed < FAILURE_PENALTY_TIME ? 100 : 0;
    
    // Calculate rate limit penalties
    const aRatePenalty = a.rateLimitPerMin && (now - a.lastUsed) < (RATE_LIMIT_WINDOW / a.rateLimitPerMin) ? 50 : 0;
    const bRatePenalty = b.rateLimitPerMin && (now - b.lastUsed) < (RATE_LIMIT_WINDOW / b.rateLimitPerMin) ? 50 : 0;
    
    // Calculate base score (lower is better)
    const aScore = a.priority - a.weight + (a.failCount * 2) + aFailPenalty + aRatePenalty;
    const bScore = b.priority - b.weight + (b.failCount * 2) + bFailPenalty + bRatePenalty;
    
    return aScore - bScore;
  });

  // Get the best endpoint and mark it as used
  const bestEndpoint = sortedEndpoints[0];
  bestEndpoint.lastUsed = now;
  
  return bestEndpoint.url;
}

// Update endpoint statistics after use
export function updateEndpointStats(url: string, success: boolean, responseTime?: number): void {
  const endpoint = endpoints.find(e => e.url === url);
  if (!endpoint) return;
  
  const now = Date.now();
  
  if (success) {
    // Successful request - reset fail count and update response time
    endpoint.failCount = Math.max(0, endpoint.failCount - 1); // Gradually decrease fail count
    
    if (responseTime) {
      // Update average response time (weighted moving average)
      endpoint.responseTime = endpoint.responseTime * 0.7 + responseTime * 0.3;
    }
  } else {
    // Failed request
    endpoint.failCount++;
    endpoint.lastFailed = now;
  }
}

// Create a connection with the best RPC endpoint
export function createOptimalConnection(): Connection {
  const endpoint = getBestEndpoint();
  
  return new Connection(endpoint, {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 60000,
    disableRetryOnRateLimit: false
  });
}
