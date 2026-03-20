import type { AccountRecord, SnapshotIndexCache, SnapshotRecord } from "../types";

export type SnapshotBucketEntry = {
  key: string;
  dateMs: number;
  tokens: number;
};

export type SnapshotIndex = {
  cleanSnapshots: SnapshotRecord[];
  byAccountId: Map<string, SnapshotRecord[]>;
  tokenTotalsByAccount: Map<
    string,
    {
      tokens: number;
      lastTokens: number;
    }
  >;
  minuteBuckets: Map<string, SnapshotBucketEntry>;
  hourBuckets: Map<string, SnapshotBucketEntry>;
  dayBuckets: Map<string, SnapshotBucketEntry>;
};

type BuildSnapshotIndexOptions = {
  enabled: boolean;
  snapshots: SnapshotRecord[];
  accounts: AccountRecord[];
  normalizeRecord: (record: SnapshotRecord) => SnapshotRecord;
  matchesAccount: (account: AccountRecord | undefined, snapshot: SnapshotRecord) => boolean;
  recordTime: (record: SnapshotRecord) => number | undefined;
};

const EMPTY_INDEX: SnapshotIndex = {
  cleanSnapshots: [],
  byAccountId: new Map<string, SnapshotRecord[]>(),
  tokenTotalsByAccount: new Map<string, { tokens: number; lastTokens: number }>(),
  minuteBuckets: new Map<string, SnapshotBucketEntry>(),
  hourBuckets: new Map<string, SnapshotBucketEntry>(),
  dayBuckets: new Map<string, SnapshotBucketEntry>(),
};

function makeDayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function makeHourKey(date: Date) {
  return `${makeDayKey(date)}-${String(date.getHours()).padStart(2, "0")}`;
}

function makeMinuteKey(date: Date) {
  return `${makeHourKey(date)}-${String(date.getMinutes()).padStart(2, "0")}`;
}

function pushBucket(map: Map<string, SnapshotBucketEntry>, key: string, dateMs: number, tokens: number) {
  const current = map.get(key);
  if (current) {
    current.tokens += tokens;
    return;
  }

  map.set(key, {
    key,
    dateMs,
    tokens,
  });
}

export function emptySnapshotIndex() {
  return EMPTY_INDEX;
}

export function buildSnapshotIndex({
  enabled,
  snapshots,
  accounts,
  normalizeRecord,
  matchesAccount,
  recordTime,
}: BuildSnapshotIndexOptions): SnapshotIndex {
  if (!enabled) {
    return EMPTY_INDEX;
  }

  const cleanSnapshots: SnapshotRecord[] = [];
  const byAccountId = new Map<string, SnapshotRecord[]>();
  const tokenTotalsByAccount = new Map<string, { tokens: number; lastTokens: number }>();
  const minuteBuckets = new Map<string, SnapshotBucketEntry>();
  const hourBuckets = new Map<string, SnapshotBucketEntry>();
  const dayBuckets = new Map<string, SnapshotBucketEntry>();
  const accountMap = new Map(accounts.map((account) => [account.id, account]));

  for (const rawRecord of snapshots) {
    const normalizedRecord = normalizeRecord(rawRecord);
    const directAccount = accountMap.get(normalizedRecord.accountId);
    const matchedAccount =
      (directAccount && matchesAccount(directAccount, normalizedRecord) ? directAccount : undefined) ??
      accounts.find((account) => matchesAccount(account, normalizedRecord));

    if (!matchedAccount) {
      continue;
    }

    const cleanRecord: SnapshotRecord = {
      ...normalizedRecord,
      accountId: matchedAccount.id,
      accountLabel: matchedAccount.accountLabel,
      workspace: matchedAccount.workspace,
      email: matchedAccount.email,
    };

    cleanSnapshots.push(cleanRecord);

    const groupedSnapshots = byAccountId.get(matchedAccount.id) ?? [];
    groupedSnapshots.push(cleanRecord);
    byAccountId.set(matchedAccount.id, groupedSnapshots);

    const rankingTokens = cleanRecord.lastTokens ?? 0;
    const rankingBucket = tokenTotalsByAccount.get(matchedAccount.id) ?? { tokens: 0, lastTokens: 0 };
    rankingBucket.tokens += rankingTokens;
    rankingBucket.lastTokens = cleanRecord.lastTokens ?? rankingBucket.lastTokens;
    tokenTotalsByAccount.set(matchedAccount.id, rankingBucket);

    const timestamp = recordTime(cleanRecord);
    if (typeof timestamp !== "number" || Number.isNaN(timestamp)) {
      continue;
    }

    const date = new Date(timestamp);
    pushBucket(minuteBuckets, makeMinuteKey(date), timestamp, rankingTokens);
    pushBucket(hourBuckets, makeHourKey(date), timestamp, rankingTokens);
    pushBucket(dayBuckets, makeDayKey(date), timestamp, rankingTokens);
  }

  cleanSnapshots.sort((left, right) => (recordTime(right) ?? 0) - (recordTime(left) ?? 0));
  for (const groupedSnapshots of byAccountId.values()) {
    groupedSnapshots.sort((left, right) => (recordTime(right) ?? 0) - (recordTime(left) ?? 0));
  }

  return {
    cleanSnapshots,
    byAccountId,
    tokenTotalsByAccount,
    minuteBuckets,
    hourBuckets,
    dayBuckets,
  };
}

function simpleHash(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function buildSnapshotIndexSignature(
  snapshots: SnapshotRecord[],
  normalizeRecord: (record: SnapshotRecord) => SnapshotRecord,
  recordTime: (record: SnapshotRecord) => number | undefined,
) {
  const source = snapshots
    .map((raw) => {
      const record = normalizeRecord(raw);
      return [
        record.accountId,
        record.email,
        record.subscriptionActiveUntilMs ?? record.subscriptionActiveUntil ?? "",
        recordTime(record) ?? "",
        record.lastTokens ?? "",
      ].join("|");
    })
    .join("\n");
  return `${snapshots.length}-${simpleHash(source)}`;
}

export function serializeSnapshotIndex(signature: string, index: SnapshotIndex): SnapshotIndexCache {
  return {
    signature,
    generatedAtMs: Date.now(),
    generatedAt: new Date().toISOString(),
    cleanSnapshots: index.cleanSnapshots,
    tokenTotalsByAccount: Object.fromEntries(index.tokenTotalsByAccount),
    minuteBuckets: [...index.minuteBuckets.values()],
    hourBuckets: [...index.hourBuckets.values()],
    dayBuckets: [...index.dayBuckets.values()],
  };
}

export function hydrateSnapshotIndex(cache?: SnapshotIndexCache | null): SnapshotIndex {
  if (!cache) {
    return EMPTY_INDEX;
  }

  const cleanSnapshots = cache.cleanSnapshots ?? [];
  const byAccountId = new Map<string, SnapshotRecord[]>();
  cleanSnapshots.forEach((record) => {
    const bucket = byAccountId.get(record.accountId) ?? [];
    bucket.push(record);
    byAccountId.set(record.accountId, bucket);
  });

  return {
    cleanSnapshots,
    byAccountId,
    tokenTotalsByAccount: new Map(Object.entries(cache.tokenTotalsByAccount ?? {})),
    minuteBuckets: new Map((cache.minuteBuckets ?? []).map((entry) => [entry.key, entry])),
    hourBuckets: new Map((cache.hourBuckets ?? []).map((entry) => [entry.key, entry])),
    dayBuckets: new Map((cache.dayBuckets ?? []).map((entry) => [entry.key, entry])),
  };
}
