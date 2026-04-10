const PER_USER_LIMIT = 10;
const GLOBAL_LIMIT = 100;

const userCounts = new Map<string, { count: number; resetAt: number }>();
let globalCount = 0;
let globalResetAt = getNextReset();

function getNextReset(): number {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCHours(24, 0, 0, 0);
  return tomorrow.getTime();
}

function maybeReset() {
  if (Date.now() >= globalResetAt) {
    globalCount = 0;
    globalResetAt = getNextReset();
    userCounts.clear();
  }
}

export function checkMessageRateLimit(userId: string): {
  allowed: boolean;
  reason?: string;
} {
  maybeReset();

  if (globalCount >= GLOBAL_LIMIT) {
    return {
      allowed: false,
      reason: `Daily message limit reached. Try again tomorrow.`,
    };
  }

  const entry = userCounts.get(userId);
  const userCount = entry?.count ?? 0;

  if (userCount >= PER_USER_LIMIT) {
    return {
      allowed: false,
      reason: `You've sent ${PER_USER_LIMIT} messages today. Try again tomorrow.`,
    };
  }

  userCounts.set(userId, {
    count: userCount + 1,
    resetAt: globalResetAt,
  });
  globalCount++;

  return { allowed: true };
}
